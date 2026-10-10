/* =====================================================================
 * bimbarraopcoes.js — a BARRA DE OPÇÕES da ferramenta, fina, sob a fita do
 * BIM (prévia do modelador, 09/10/2026).
 *
 * Pedido do Rogério: "quando você clica na parede, mostra um painel nosso de
 * edição, feio pra caramba — aquele painel não tem que mostrar. Antes de
 * começar a modelagem, cliquei na parede (a ferramenta), já posso configurar o
 * que eu quero: o ortogonal, tudo que precisa. E já vem pré-definido:
 * ortogonal configurado, snap configurado, o padrão é o que estava anterior;
 * a maioria das vezes a gente usa 45°, 90°, 180°."
 *
 * O QUE MORA AQUI
 *   · MOTOR PURO (Node-testável, tools/test-bimbarraopcoes.js): a
 *     configuração de cada ferramenta (padrão da primeira vez e a última
 *     usada, lembrada POR FERRAMENTA e POR USUÁRIO), e a conta do ângulo:
 *     ortogonal e incrementos.
 *   · A TELA: a barra contextual (Parede: tipo, nível, altura, linha de
 *     localização, encadear, deslocamento, raio; o grupo Desenhar com as
 *     formas do js/bimdesenho.js; e os controles de precisão: Ortogonal,
 *     Incrementos de ângulo, Snaps e Grade). Propriedades continuam no painel
 *     lateral (o tipo e os parâmetros da peça); a barra é do COMANDO em curso.
 *
 * A REGRA DO ÂNGULO (a mesma na planta e no 3D)
 *   Os incrementos (15°, 30°, 45°, 90°, 180°; padrão 45°, 90° e 180°) dizem
 *   em que ângulos o traço anda: os múltiplos de cada um que está marcado.
 *   · Ortogonal LIGADO: o traço só anda nesses ângulos (trava dura) — o
 *     cursor é projetado na direção permitida mais perto.
 *   · Ortogonal DESLIGADO: o ângulo é livre, mas a ±5° de um ângulo
 *     permitido o traço é atraído para ele.
 *   · Shift inverte a trava enquanto está apertado.
 *   Convenção do ângulo = a do js/bimprecisao.js (atan2(−dz, dx), a do rotY
 *   das caixas): o "45°" da barra é o 45° que a parede recebe.
 *
 * ⚠ Lembrar a configuração é PREFERÊNCIA do aparelho (localStorage, com
 *   try/catch): navegador sem armazenamento usa o padrão e segue — nunca
 *   trava a ferramenta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE = "orcapro:bim:barra-opcoes:v1";
  var INCREMENTOS = [15, 30, 45, 90, 180];
  var PADRAO_INC = [45, 90, 180];
  var JANELA = 5;   /* graus de atração com o ortogonal desligado */
  var TIPOS_SNAP = ["fim", "intersecao", "meio", "centro", "perpendicular", "extensao", "proximo", "grade"];
  /* ferramentas de TRAÇO: têm ponto base, então o ortogonal e os incrementos valem (a cobertura não:
     o 2º clique dela é o canto OPOSTO, uma diagonal — travar faria todo telhado quadrado) */
  var TRACO = { parede: 1, viga: 1, eixo: 1, laje: 1, furo: 1, forro: 1, guarda: 1, escada: 1, rampa: 1, trelica: 1, inst: 1,
                extrusao: 1, varredura: 1, mover: 1, copiar: 1, espelhar: 1, girar: 1, matriz: 1, cota: 1, separador: 1 };
  var ROTULOS = { parede: "Parede", laje: "Laje", furo: "Furo na laje", forro: "Forro", pilar: "Pilar", viga: "Viga", eixo: "Eixo", escada: "Escada",
                  rampa: "Rampa", trelica: "Treliça", guarda: "Guarda-corpo", familia: "Componente", inst: "Instalações", cobertura: "Cobertura",
                  mover: "Mover", copiar: "Copiar", espelhar: "Espelhar", girar: "Girar", matriz: "Matriz", cota: "Cota", apagar: "Apagar",
                  anotar: "Anotar", ambiente: "Ambiente", separador: "Separador de ambiente", extrusao: "Extrusão", revolucao: "Revolução",
                  varredura: "Varredura", unir: "Unir", subtrair: "Subtrair", empurrar: "Empurrar/puxar", volprops: "Propriedades do volume",
                  telhado: "Telhado", fundacao: "Fundação" };
  var VOL = { extrusao: 1, revolucao: 1, varredura: 1, unir: 1, subtrair: 1, empurrar: 1, volprops: 1 };

  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function fmtAng(g) { var r = Math.round(g * 10) / 10; return String(r).replace(".", ",") + "°"; }

  /* ------------------------------------------------------------ CONFIGURAÇÃO */
  /* o padrão da PRIMEIRA vez (o pedido: ortogonal e snaps ligados, 45°, 90° e 180°) */
  function padrao(sub) {
    return { orto: true, inc: PADRAO_INC.slice(), snap: true, tipos: null, grade: true, passo: 0.10,
             forma: "linha", encadear: true, desloc: 0, raio: 0, linhaLoc: "eixo", lados: 6, virar: false,
             unir: true };   /* UNIÃO (js/bimuniao.js): a parede nova une com as que encontra — ligado por padrão */
  }
  /* o que vem do armazenamento passa pela mesma peneira: lixo vira o padrão daquele campo */
  function sanear(c, sub) {
    var p = padrao(sub), o = {};
    c = c && typeof c === "object" ? c : {};
    o.orto = typeof c.orto === "boolean" ? c.orto : p.orto;
    var inc = Array.isArray(c.inc) ? c.inc.map(Number).filter(function (g) { return INCREMENTOS.indexOf(g) >= 0; }) : null;
    o.inc = inc ? INCREMENTOS.filter(function (g) { return inc.indexOf(g) >= 0; }) : p.inc;   /* em ordem, sem repetir */
    o.snap = typeof c.snap === "boolean" ? c.snap : p.snap;
    if (c.tipos && typeof c.tipos === "object") { o.tipos = {}; TIPOS_SNAP.forEach(function (t) { o.tipos[t] = c.tipos[t] !== false; }); } else o.tipos = null;
    o.grade = typeof c.grade === "boolean" ? c.grade : p.grade;
    var ps = num(c.passo, p.passo); o.passo = ps > 0 && ps <= 10 ? ps : p.passo;
    o.forma = typeof c.forma === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(c.forma) ? c.forma : p.forma;
    o.encadear = typeof c.encadear === "boolean" ? c.encadear : p.encadear;
    var dl = num(c.desloc, 0); o.desloc = Math.abs(dl) <= 50 ? dl : 0;
    var ra = num(c.raio, 0); o.raio = ra >= 0 && ra <= 100 ? ra : 0;
    o.linhaLoc = typeof c.linhaLoc === "string" && /^[a-zA-Z]{1,20}$/.test(c.linhaLoc) ? c.linhaLoc : p.linhaLoc;
    var la = Math.round(num(c.lados, p.lados)); o.lados = la >= 3 && la <= 64 ? la : p.lados;
    o.virar = !!c.virar;
    o.unir = typeof c.unir === "boolean" ? c.unir : p.unir;
    return o;
  }

  /* ------------------------------------------------------------ O ÂNGULO */
  function norm360(g) { var t = g % 360; if (t < 0) t += 360; return Math.abs(t - 360) < 1e-9 ? 0 : t; }
  function difAng(a, b) { var d = Math.abs(norm360(a) - norm360(b)); return d > 180 ? 360 - d : d; }
  /* o ângulo permitido mais perto de `g` (múltiplos de cada incremento marcado; sem nenhum, 90°) */
  function maisPerto(g, inc) {
    var L = inc && inc.length ? inc : [90], melhor = null, dm = Infinity;
    L.forEach(function (passo) {
      var a = norm360(Math.round(g / passo) * passo), d = difAng(g, a);
      if (d < dm - 1e-9) { dm = d; melhor = a; }
    });
    return { graus: melhor, dif: dm };
  }
  /* graus (0..360) → { graus, travado }: a regra do cabeçalho */
  function ajustarAngulo(g, cfg, shift) {
    cfg = cfg || padrao();
    var travar = !!cfg.orto !== !!shift, m = maisPerto(norm360(g), cfg.inc);
    if (travar) return { graus: m.graus, travado: true };
    if (cfg.inc && cfg.inc.length && m.dif <= JANELA) return { graus: m.graus, travado: true };
    return { graus: norm360(g), travado: false };
  }
  function grausDe(base, p) { var g = Math.atan2(-(p.z - base.z), p.x - base.x) * 180 / Math.PI; return norm360(g); }
  /* o ponto do cursor ajustado: na direção permitida, PROJETADO nela (o cursor
     fica em cima da linha) — o comprimento é o da projeção */
  function ajustarPonto(base, p, cfg, shift) {
    if (!base || !p || !fin(base.x) || !fin(base.z) || !fin(p.x) || !fin(p.z)) return { p: p, graus: null, dist: 0, travado: false };
    var dx = p.x - base.x, dz = p.z - base.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-9) return { p: { x: p.x, z: p.z }, graus: null, dist: 0, travado: false };
    var g = grausDe(base, p), a = ajustarAngulo(g, cfg, shift);
    if (!a.travado) return { p: { x: p.x, z: p.z }, graus: g, dist: d, travado: false };
    var r = a.graus * Math.PI / 180, ux = Math.cos(r), uz = -Math.sin(r), L = dx * ux + dz * uz;
    if (L < 0) L = 0;
    return { p: { x: base.x + ux * L, z: base.z + uz * L }, graus: a.graus, dist: L, travado: true };
  }
  /* com o ângulo travado e a GRADE ligada, o COMPRIMENTO anda no passo da grade (3,00 m e não
     2,97 m): projetar o ponto da grade na direção travada dava um comprimento quebrado, e a
     parede a 45° saía com 2,97 m — o número que ninguém desenha de propósito */
  function arredondar(base, aj, passo) {
    if (!aj || !aj.travado || !(passo > 0) || aj.graus == null) return aj;
    var L = Math.round(aj.dist / passo) * passo, r = aj.graus * Math.PI / 180;
    L = Math.round(L * 1e6) / 1e6;
    return { p: { x: base.x + Math.cos(r) * L, z: base.z - Math.sin(r) * L }, graus: aj.graus, dist: L, travado: true };
  }

  /* ------------------------------------------------------------ ARMAZENAMENTO */
  function armazenamento() { try { return global.localStorage || null; } catch (e) { return null; } }
  function usuario() {
    try { var u = global.Auth && global.Auth._usuario; return u ? String(u.uid || u.email || "local").slice(0, 80) : "local"; } catch (e) { return "local"; }
  }

  var BimBarraOpcoes = {
    CHAVE: CHAVE, INCREMENTOS: INCREMENTOS, PADRAO_INC: PADRAO_INC, JANELA: JANELA, TRACO: TRACO, TIPOS_SNAP: TIPOS_SNAP,
    padrao: padrao, sanear: sanear, ajustarAngulo: ajustarAngulo, ajustarPontoCom: ajustarPonto, arredondar: arredondar, grausDe: grausDe, maisPerto: maisPerto,
    _armaz: null,      /* teste: troca o localStorage */
    _cache: null,
    _chave: function () { return CHAVE + ":" + usuario(); },
    _ler: function () {
      if (this._cache && this._cache.k === this._chave()) return this._cache.v;
      var a = this._armaz || armazenamento(), v = null;
      try { v = a ? JSON.parse(a.getItem(this._chave()) || "null") : null; } catch (e) { v = null; }
      if (!v || typeof v !== "object" || typeof v.ferr !== "object" || !v.ferr) v = { v: 1, ferr: {} };
      this._cache = { k: this._chave(), v: v };
      return v;
    },
    /* a configuração da ferramenta: a última usada, ou o padrão da primeira vez */
    cfg: function (sub) {
      var k = String(sub || "geral");
      return sanear(this._ler().ferr[k], k);
    },
    /* grava a ferramenta (só ela: as outras ficam como estão) */
    gravar: function (sub, c) {
      var k = String(sub || "geral"), v = this._ler();
      v.ferr[k] = sanear(c, k);
      var a = this._armaz || armazenamento();
      try { if (a) a.setItem(this._chave(), JSON.stringify(v)); } catch (e) { /* armazenamento cheio: fica na memória até fechar */ }
      return clone(v.ferr[k]);
    },
    mudar: function (sub, campo, valor) { var c = this.cfg(sub); c[campo] = valor; return this.gravar(sub, c); },
    /* o ponto ajustado pela configuração DA ferramenta (o gancho do js/bim.js e a planta usam);
       `o.grade`: o ponto veio da grade (ou de lugar nenhum) — aí o comprimento anda no passo dela */
    ajustarPonto: function (sub, base, p, shift, o) {
      var c = this.cfg(sub), aj = this.ajustarPontoCom(base, p, c, shift);
      return (o && o.grade && c.snap && c.grade) ? this.arredondar(base, aj, c.passo) : aj;
    },
    ehTraco: function (sub) { return !!TRACO[sub]; },
    rotulo: function (sub) { return ROTULOS[sub] || (sub ? String(sub) : ""); },
    textoInc: function (inc) { return inc && inc.length ? inc.map(function (g) { return g + "°"; }).join(" ") : "livre"; },
    fmtAng: fmtAng
  };

  /* =====================================================================
   * A TELA — só no navegador e só com a prévia do modelador
   * ===================================================================== */
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function B() { return global.BIM || null; }
  function AU() { return global.BimArqUI || null; }
  function A() { return global.BimArq || null; }
  function PM() { return global.BimPlantaModelar || null; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function ico(nome, tam) { try { return global.Icones && global.Icones.get ? (global.Icones.get(nome, tam || 16) || "") : ""; } catch (e) { return ""; } }
  /* o desenho das formas, para quando o js/bimdesenho.js não manda ícone próprio */
  var GLIFO_FORMA = {
    linha: '<path d="M4 18 L20 6"/>',
    retangulo: '<rect x="4" y="6" width="16" height="12"/>',
    poligonoInscrito: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/><path d="M12 4 L19 8 L19 16 L12 20 L5 16 L5 8 Z"/>',
    poligonoCircunscrito: '<circle cx="12" cy="12" r="6.5" stroke-dasharray="2 2"/><path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z"/>',
    circulo: '<circle cx="12" cy="12" r="8"/>',
    arco3p: '<path d="M4 17 Q12 3 20 17"/><circle cx="4" cy="17" r="1.3"/><circle cx="12" cy="10" r="1.3"/><circle cx="20" cy="17" r="1.3"/>',
    arcoCentro: '<path d="M5 15 A8 8 0 0 1 19 15"/><circle cx="12" cy="15" r="1.3"/>',
    arcoTangente: '<path d="M3 18 L10 18 A7 7 0 0 0 17 11"/>',
    arcoConcordancia: '<path d="M5 20 L5 11 A6 6 0 0 1 11 5 L20 5"/>',
    selecionarLinhas: '<path d="M4 18 L20 6" stroke-dasharray="3 2"/><path d="M14 14 L19 19"/>'
  };
  function glifo(f) {
    if (f && typeof f.icone === "string" && /^<svg/i.test(f.icone)) return f.icone;
    var g = f && GLIFO_FORMA[f.id];
    if (g) return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' + g + "</svg>";
    return ico(f && f.icone, 16) || esc((f && f.rotulo || "?").slice(0, 3));
  }

  var UIst = { el: null, sub: null, menu: null, tProps: 0 };

  BimBarraOpcoes.ativa = function () { return previa() && typeof document !== "undefined"; };
  /* a barra substitui o painel antigo do editor? (gancho do js/bim.js): só com a
     prévia E com a casca montada — sem a fita não há onde a barra morar, e aí o
     painel de sempre continua sendo o único lugar das opções */
  BimBarraOpcoes.substituiPainel = function () {
    if (!this.ativa()) return false;
    try { return !!(global.BimShell && global.BimShell.raiz && global.BimShell.raiz() && global.BimShell.raiz().querySelector(".rv-fita")); } catch (e) { return false; }
  };
  /* onde a barra das ferramentas de transformar (js/bimprecisaoui.js) entra */
  BimBarraOpcoes.slot = function () { var e = this._garantir(); return e ? e.querySelector('[data-bbo="slot"]') : null; };
  BimBarraOpcoes.elemento = function () { return UIst.el; };
  BimBarraOpcoes.ferramenta = function () { return UIst.sub; };

  BimBarraOpcoes._garantir = function () {
    if (!this.ativa()) return null;
    var raiz = null; try { raiz = global.BimShell && global.BimShell.raiz ? global.BimShell.raiz() : null; } catch (e) { raiz = null; }
    if (!raiz) return null;
    var fita = raiz.querySelector(".rv-fita"); if (!fita) return null;
    var el = UIst.el;
    if (!el || !raiz.contains(el)) {
      el = document.createElement("div");
      el.className = "bbo"; el.setAttribute("data-bbo", "barra"); el.setAttribute("role", "toolbar"); el.setAttribute("aria-label", "Opções da ferramenta");
      el.innerHTML = '<div class="bbo-corpo" data-bbo="corpo"></div><span class="bbo-slot" data-bbo="slot"></span>';
      UIst.el = el; this._ligar(el);
    }
    if (el.previousElementSibling !== fita) {
      fita.parentNode.insertBefore(el, fita.nextSibling);
      /* o palco perdeu a altura da barra: o canvas do 3D se mede de novo (senão o clique cai fora) */
      try { requestAnimationFrame(function () { try { var b = B(); if (b && b.redimensionar) b.redimensionar(); if (b && b.vistasRedimensionar) b.vistasRedimensionar(); } catch (e2) {} }); } catch (e3) {}
    }
    return el;
  };
  /* a casca acabou de montar (gancho no js/gestao.js): a barra nasce já, com a ferramenta que estiver armada */
  BimBarraOpcoes.montar = function () {
    if (!this.ativa()) return false;
    try { var b = B(), a = b && b.planta2d ? b.planta2d() : null, t = a ? a.traco() : null; UIst.sub = t && t.on ? t.sub : null; } catch (e) { UIst.sub = null; }
    return this.pintar();
  };

  /* --------------------------------------------- campos de cada ferramenta */
  function opcoes(lista, valor) {
    return lista.map(function (o) { return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(valor) ? " selected" : "") + ">" + esc(o.rotulo) + "</option>"; }).join("");
  }
  function grupo(rot, html, cls) { return '<span class="bbo-grupo' + (cls ? " " + cls : "") + '"' + (rot ? ' data-bbo-grupo="' + esc(rot) + '"' : "") + ">" + (rot ? '<span class="bbo-rot">' + esc(rot) + "</span>" : "") + html + "</span>"; }
  function liga(id, rot, on, dica, icone) {
    return '<button type="button" class="bbo-liga" data-bbo="' + id + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(dica) + '">' + (icone ? ico(icone, 15) : "") + "<span>" + esc(rot) + "</span></button>";
  }
  function campoNum(id, rot, valor, un, dica, larg) {
    return '<label class="bbo-campo" title="' + esc(dica || "") + '">' + esc(rot) + ' <input data-bbo="' + id + '" inputmode="decimal" autocomplete="off" value="' + esc(valor) + '"' + (larg ? ' style="width:' + larg + '"' : "") + ">" + (un ? " " + esc(un) : "") + "</label>";
  }
  function campoSel(id, rot, lista, valor, dica) {
    return '<label class="bbo-campo" title="' + esc(dica || "") + '">' + esc(rot) + ' <select data-bbo="' + id + '">' + opcoes(lista, valor) + "</select></label>";
  }

  BimBarraOpcoes._formas = function (sub) {
    var P = PM(), D = P && P.desenho ? P.desenho() : null, L = [];
    if (!P || !P.aceitaForma || !P.aceitaForma(sub)) return L;   /* pilar, porta, escada…: um clique, sem forma */
    try { L = D && D.ferramentas ? (D.ferramentas(P.alvoForma ? P.alvoForma(sub) : sub) || []) : []; } catch (e) { L = []; }
    return L.filter(function (f) { return f && f.id; });
  };
  BimBarraOpcoes.formaAtual = function (sub) {
    var L = this._formas(sub), c = this.cfg(sub);
    if (!L.length) return null;
    var f = L.filter(function (x) { return x.id === c.forma; })[0];
    return f || L[0];
  };

  BimBarraOpcoes._camposB2 = function (sub, c) {
    var U = AU(), Ar = A(), h = "";
    if (!U || !Ar || !U.ativo || !U.ativo()) return h;
    var L = [], at = null;
    try { L = U.niveis() || []; at = U.nivelAtivo(); } catch (e) { L = []; }
    var temNivel = { parede: 1, laje: 1, furo: 1, forro: 1, pilar: 1, viga: 1, escada: 1, rampa: 1, guarda: 1, familia: 1, eixo: 0, trelica: 1 };
    if (sub === "parede") {
      var tipos = global.AlvTipos ? global.AlvTipos.listar().map(function (t) { return { id: t.id, rotulo: t.rotulo }; }) : [];
      var G = global.Gestao, tid = G && G._alvTipoId ? G._alvTipoId : "";
      if (tipos.length) h += campoSel("tipoParede", "Tipo", tipos, tid, "Tipo de parede: espessura e camadas (o mesmo de Propriedades)");
    }
    if (sub === "laje" && Ar.TIPOS_LAJE) h += campoSel("tipoLaje", "Tipo", Ar.TIPOS_LAJE.map(function (t) { return { id: t.id, rotulo: t.rotulo }; }), (U.cfg() || {}).tipoLajeId, "Tipo de laje");
    if (temNivel[sub] && L.length && at) h += campoSel("nivel", "Nível", L.map(function (n) { return { id: String(n.id), rotulo: n.nome }; }), String(at.id), "Nível em que a peça nasce (a planta aberta passa a ser o nível)");
    if ((sub === "parede" || sub === "pilar") && Ar.nivelAcima) {
      var r = ((U.cfg() || {}).rs || {})[sub] || {}, acima = L.length && at ? Ar.nivelAcima(L, at.id) : null;
      var opS = [{ id: "", rotulo: "Não conectada" }].concat(acima ? [{ id: "acima", rotulo: "Até " + acima.nome + " (acima)" }] : [])
        .concat(L.filter(function (n) { return at && n.elevacao > at.elevacao && (!acima || String(n.id) !== String(acima.id)); }).map(function (n) { return { id: String(n.id), rotulo: "Até " + n.nome }; }));
      if (L.length && at) {
        var sup = r.sup === "acima" && !acima ? "" : (r.sup || "");
        h += campoSel("sup", "Altura", opS, sup, "Topo: preso a um nível (acompanha quando o nível muda) ou altura não conectada");
        if (!sup) {
          var hnc = r.alturaNaoConectada > 0 ? r.alturaNaoConectada : (at.peDireito > 0 ? at.peDireito : 2.8);
          h += campoNum("alturaNC", "", fmt(hnc), "m", "Altura não conectada", "3.4em");
        }
      }
    }
    return h;
  };

  BimBarraOpcoes.pintar = function () {
    var el = this._garantir(); if (!el) return false;
    var sub = UIst.sub, corpo = el.querySelector('[data-bbo="corpo"]'), slot = el.querySelector('[data-bbo="slot"]');
    el.setAttribute("data-bbo-sub", sub || "");
    if (!sub) { corpo.innerHTML = '<span class="bbo-nome bbo-vazio">Modificar</span>'; this._fecharMenu(); return true; }
    var c = this.cfg(sub), h = '<span class="bbo-nome">' + esc(this.rotulo(sub)) + "</span>";
    var b2 = this._camposB2(sub, c);
    var esp = "";
    if (sub === "parede") {
      var LL = (A() && A().LINHAS_LOC) ? A().LINHAS_LOC.map(function (x) { return { id: x.id, rotulo: x.nome }; }) : [];
      if (LL.length) esp += campoSel("linhaLoc", "Localização", LL, c.linhaLoc, "Linha de localização: qual linha da parede é a linha que você desenha");
      esp += liga("encadear", "Encadear", c.encadear, "Cada parede continua do fim da anterior (Esc encerra o traço)");
      /* UNIÃO (js/bimuniao.js): a parede nova une com as que ela encontra — canto, T, X, emenda — e
         a planta sai sem a linha cortando o encontro. Desligado: a junta fica separada (lembrado) */
      esp += liga("unir", "Unir automaticamente", c.unir, "Ligado: a parede nova une com as que encontra (canto em L, T, X, emenda) e a planta sai sem a linha no encontro. Desligado: a junta fica separada. Para mudar depois: Propriedades › Unir nos cantos, ou Modificar › Desunir geometria.", "parede");
      esp += campoNum("desloc", "Desloc.", fmt(c.desloc), "m", "Deslocamento: a parede nasce paralela à linha clicada, a esta distância (positivo: à esquerda de quem desenha)", "3.4em");
      esp += campoNum("raio", "Raio", fmt(c.raio), "m", "Raio de concordância nos cantos do traço (0 = canto vivo)", "3.4em");
    }
    if (sub === "familia") {
      var P = PM(), fl = P && P.familiaVira ? P.familiaVira() : null;
      if (fl) esp += liga("virar", "Abrir para fora", !!fl.valor, "Lado para onde a folha abre (barra de espaço também vira)");
    }
    if (sub === "pilar") {
      var U2 = AU(); if (U2 && U2.ativo && U2.ativo()) esp += campoNum("giroPilar", "Giro", String(+(U2.cfg() || {}).giroPilar || 0).replace(".", ","), "°", "Giro do pilar na planta", "3.4em");
    }
    if (sub === "anotar") esp += '<label class="bbo-campo">Texto <input data-bbo="texto" maxlength="200" style="width:14em" value="' + esc((this._texto || "")) + '"></label>';
    if (VOL[sub]) {
      var vp = null; try { vp = B() && B().volumeParametros ? B().volumeParametros({}) : null; } catch (eV) { vp = null; }
      if (vp) {
        if (sub === "extrusao") esp += campoNum("vol:altura", "Altura", fmt(num(vp.altura, 1)), "m", "", "4.2em");
        if (sub === "revolucao") esp += campoNum("vol:angulo", "Ângulo", String(num(vp.angulo, 360)), "°", "", "3.6em");
        if (sub === "varredura") {
          esp += campoSel("vol:perfil", "Perfil", [{ id: "retangulo", rotulo: "Retângulo" }, { id: "circulo", rotulo: "Círculo" }], vp.perfil, "");
          if (vp.perfil === "circulo") esp += campoNum("vol:diametro", "Ø", fmt(num(vp.diametro, 0.1)), "m", "", "4em");
          else esp += campoNum("vol:largura", "L", fmt(num(vp.largura, 0.2)), "m", "", "4em") + campoNum("vol:alturaPerfil", "A", fmt(num(vp.alturaPerfil, 0.4)), "m", "", "4em");
        }
        if (sub === "extrusao" || sub === "revolucao" || sub === "varredura" || sub === "volprops") esp += '<label class="bbo-campo">Material <input data-bbo="vol:material" maxlength="60" style="width:8em" value="' + esc(vp.material || "") + '"></label>';
      }
    }
    /* a ORDEM (fixa, em uma linha): as formas, a precisão — o que se usa a cada traço — e por
       último os campos da ferramenta, que também estão em Propriedades (tela estreita corta à direita) */
    /* o grupo DESENHAR: as formas que o js/bimdesenho.js oferece para esta ferramenta */
    var L = this._formas(sub);
    if (L.length > 1) {
      var fa = this.formaAtual(sub);
      h += grupo("Desenhar", L.map(function (f) {
        return '<button type="button" class="bbo-forma" data-bbo="forma" data-forma="' + esc(f.id) + '" aria-pressed="' + (fa && fa.id === f.id ? "true" : "false") + '" title="' + esc(f.rotulo + (f.dica ? " — " + f.dica : "")) + '" aria-label="' + esc(f.rotulo) + '">' + glifo(f) + "</button>";
      }).join("") + (fa && /^poligono/.test(fa.id) ? campoNum("lados", "Lados", String(c.lados), "", "Número de lados do polígono", "2.6em") : ""), "bbo-desenhar");
    }
    /* PRECISÃO */
    var pr = "";
    if (TRACO[sub]) {
      pr += liga("orto", "Ortogonal", c.orto, "Ligado: o traço só anda nos ângulos dos incrementos. Desligado: ângulo livre, atraído a ±" + JANELA + "° deles. Shift inverte.", "regua");
      pr += '<button type="button" class="bbo-menu-bt" data-bbo="incMenu" aria-haspopup="true" title="Incrementos de ângulo">' + ico("angulo", 15) + '<span data-bbo="incTexto">' + esc(this.textoInc(c.inc)) + '</span><span class="bbo-seta">▾</span></button>';
    }
    pr += liga("snap", "Snaps", c.snap, "Ponto final, meio, interseção, perpendicular, extensão… (F3 também liga e desliga)", "ima");
    pr += '<button type="button" class="bbo-menu-bt bbo-so-seta" data-bbo="snapMenu" aria-haspopup="true" title="Quais snaps" aria-label="Quais snaps"><span class="bbo-seta">▾</span></button>';
    pr += liga("grade", "Grade", c.grade, "O cursor anda no passo da grade quando não há outro ponto perto", "grade");
    pr += campoNum("passo", "", fmt(c.passo), "m", "Passo da grade", "3.2em");
    h += grupo("", pr, "bbo-precisao");
    if (b2 || esp) h += grupo("", b2 + esp, "bbo-cmd");

    corpo.innerHTML = h;
    void slot;
    if (UIst.menu) this._abrirMenu(UIst.menu, true);
    return true;
  };

  /* ------------------------------------------------------------ menus */
  BimBarraOpcoes._fecharMenu = function () {
    var el = UIst.el, m = el ? el.querySelector(".bbo-pop") : null;
    if (m) m.parentNode.removeChild(m);
    UIst.menu = null;
  };
  BimBarraOpcoes._abrirMenu = function (qual, repintar) {
    var el = UIst.el, sub = UIst.sub; if (!el || !sub) return;
    var bt = el.querySelector('[data-bbo="' + qual + '"]'); if (!bt) return;
    var velho = el.querySelector(".bbo-pop"); if (velho) velho.parentNode.removeChild(velho);
    if (!repintar && UIst.menu === qual) { UIst.menu = null; return; }
    var c = this.cfg(sub), pop = document.createElement("div");
    pop.className = "bbo-pop"; pop.setAttribute("data-bbo-pop", qual); pop.setAttribute("role", "menu");
    if (qual === "incMenu") {
      pop.innerHTML = '<div class="bbo-pop-tit">Incrementos de ângulo</div>' + INCREMENTOS.map(function (g) {
        return '<label class="bbo-pop-item"><input type="checkbox" data-bbo-inc="' + g + '"' + (c.inc.indexOf(g) >= 0 ? " checked" : "") + "> " + g + "°</label>";
      }).join("") + '<div class="bbo-pop-nota">O traço anda nos múltiplos de cada ângulo marcado.</div>';
    } else {
      var T = c.tipos, Pr = global.BimPrecisao;
      pop.innerHTML = '<div class="bbo-pop-tit">Snaps</div>' + TIPOS_SNAP.map(function (t) {
        var rot = Pr && Pr.ROTULO ? Pr.ROTULO[t] : t;
        return '<label class="bbo-pop-item"><input type="checkbox" data-bbo-tipo="' + t + '"' + (!T || T[t] !== false ? " checked" : "") + "> " + esc(rot) + "</label>";
      }).join("");
    }
    var r = bt.getBoundingClientRect(), re = el.getBoundingClientRect();
    pop.style.left = Math.max(0, r.left - re.left) + "px";
    el.appendChild(pop);
    UIst.menu = qual;
  };

  /* ------------------------------------------------------------ eventos */
  BimBarraOpcoes._ligar = function (el) {
    var self = this;
    el.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-bbo]") : null; if (!b || !el.contains(b)) return;
      var k = b.getAttribute("data-bbo"), sub = UIst.sub; if (!sub) return;
      if (k === "incMenu" || k === "snapMenu") { self._abrirMenu(k); return; }
      if (k === "forma") { self.mudar(sub, "forma", b.getAttribute("data-forma")); self._aplicar(sub, "forma"); self.pintar(); return; }
      if (k === "orto" || k === "snap" || k === "grade" || k === "encadear" || k === "virar" || k === "unir") {
        var c = self.cfg(sub), v = !c[k];
        if (k === "virar") { var P = PM(); if (P && P.familiaVirar) P.familiaVirar(v); }
        self.mudar(sub, k, v); self._aplicar(sub, k); self.pintar();
        status(({ orto: v ? "Ortogonal ligado: o traço anda só nos ângulos dos incrementos." : "Ortogonal desligado: ângulo livre (atraído a ±" + JANELA + "° dos incrementos).",
                  snap: v ? "Snaps ligados." : "Snaps desligados: o ponto fica onde o cursor está.", grade: v ? "Grade ligada." : "Grade desligada.",
                  encadear: v ? "Encadear ligado: cada parede continua da anterior." : "Encadear desligado.", virar: v ? "A folha abre para fora." : "A folha abre para dentro.",
                  unir: v ? "Unir automaticamente: a parede nova une com as que encontra (sem linha no encontro)." : "Unir desligado: a parede nova nasce com a junta separada." })[k]);
      }
    });
    el.addEventListener("change", function (e) {
      var t = e.target, sub = UIst.sub; if (!sub || !t) return;
      var inc = t.getAttribute("data-bbo-inc"), tp = t.getAttribute("data-bbo-tipo");
      if (inc) {
        var c = self.cfg(sub), g = +inc, L = c.inc.filter(function (x) { return x !== g; });
        if (t.checked) L.push(g);
        self.mudar(sub, "inc", L);
        var tx = el.querySelector('[data-bbo="incTexto"]'); if (tx) tx.textContent = self.textoInc(self.cfg(sub).inc);
        status("Incrementos de ângulo: " + self.textoInc(self.cfg(sub).inc) + ".");
        return;
      }
      if (tp) {
        var c2 = self.cfg(sub), T = c2.tipos || {}; TIPOS_SNAP.forEach(function (x) { if (T[x] == null) T[x] = true; });
        T[tp] = !!t.checked; self.mudar(sub, "tipos", T); self._aplicar(sub, "snap"); return;
      }
      var k = t.getAttribute("data-bbo"); if (!k) return;
      self._campo(sub, k, t.value, t);
    });
    /* tela estreita: a roda do mouse rola a barra na horizontal (ela tem uma linha só) */
    el.addEventListener("wheel", function (e) {
      var corpo = el.querySelector('[data-bbo="corpo"]'); if (!corpo || corpo.scrollWidth <= corpo.clientWidth + 1 || !e.deltaY) return;
      corpo.scrollLeft += e.deltaY; e.preventDefault();
    }, { passive: false });
    el.addEventListener("keydown", function (e) {
      e.stopPropagation();   /* digitar na barra não aciona atalho do visualizador (G da grade, WASD do voo) */
      if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { self._fecharMenu(); if (e.target && e.target.blur) e.target.blur(); }
    });
    /* ⚠ os ouvintes do documento entram UMA vez: a casca remontada cria outra barra, e cada
       remontagem somaria um par de ouvintes (o menu fecharia N vezes, a barra repintaria N vezes) */
    if (UIst.docLigado) return;
    UIst.docLigado = true;
    document.addEventListener("pointerdown", function (e) { if (UIst.menu && UIst.el && !UIst.el.contains(e.target)) self._fecharMenu(); }, true);
    /* Propriedades mudou o tipo ou o nível: a barra acompanha */
    document.addEventListener("change", function (e) {
      if (!UIst.sub || !e.target || !e.target.closest || !e.target.closest(".rv-props")) return;
      clearTimeout(UIst.tProps); UIst.tProps = setTimeout(function () { self.pintar(); }, 60);
    });
    /* F3 (js/bimprecisaoui.js) liga/desliga os snaps: a barra e a memória da ferramenta acompanham */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "F3" || !UIst.sub) return;
      setTimeout(function () {
        try { var pz = B() && B().precisao ? B().precisao() : null, sn = pz && pz.snaps ? pz.snaps() : null; if (sn && UIst.sub) { var c = self.cfg(UIst.sub); c.snap = !!sn.on; self.gravar(UIst.sub, c); self.pintar(); } } catch (eF) {}
      }, 0);
    }, true);
  };
  BimBarraOpcoes._campo = function (sub, k, valor, alvo) {
    var U = AU();
    function b2(pid, v) { if (!U || !U.mudarFerramenta) return; U.mudarFerramenta(sub, pid, v); try { if (U._sub === sub && U._repintar) U._repintar(); } catch (e) {} }
    if (k === "tipoParede") { b2("b2f:tipoParede", valor); this.pintar(); return; }
    if (k === "tipoLaje") { b2("b2f:tipoLaje", valor); return; }
    if (k === "nivel") { b2("b2f:nivel", valor); status("Nível atual: " + (alvo && alvo.selectedOptions && alvo.selectedOptions[0] ? alvo.selectedOptions[0].textContent : valor) + "."); this.pintar(); return; }
    if (k === "sup") { b2("b2f:rs:sup", valor); this.pintar(); return; }
    if (k === "alturaNC") { var h = num(valor, NaN); if (h >= 0.1 && h <= 30) b2("b2f:rs:alturaNaoConectada", h); this.pintar(); return; }
    if (k === "giroPilar") { b2("b2f:giroPilar", num(valor, 0)); return; }
    if (k === "linhaLoc") { this.mudar(sub, "linhaLoc", valor); this._aplicar(sub, "linhaLoc"); return; }
    if (k === "desloc" || k === "raio" || k === "passo" || k === "lados") {
      var c = this.cfg(sub), v = k === "lados" ? Math.round(num(valor, c.lados)) : num(valor, c[k]);
      if (k === "raio" && v < 0) v = 0;
      c[k] = v; c = this.gravar(sub, c);
      if (alvo) alvo.value = k === "lados" ? String(c.lados) : fmt(c[k]);
      this._aplicar(sub, k); return;
    }
    if (k === "texto") { this._texto = String(valor || ""); var P = PM(); if (P && P.textoAnotar) P.textoAnotar(this._texto); return; }
    if (k.indexOf("vol:") === 0) {
      var par = {}, ck = k.slice(4); par[ck] = (ck === "perfil" || ck === "material") ? valor : num(valor, undefined);
      try { if (B() && B().volumeParametros) B().volumeParametros(par); } catch (e) {}
      if (ck === "perfil") this.pintar();
    }
  };
  /* a configuração vale para o visualizador: snaps e grade no desenho de precisão
     (js/bimprecisaoui.js), encadear e linha de localização no editor */
  BimBarraOpcoes._aplicar = function (sub, campo) {
    var c = this.cfg(sub), b = B();
    if (!b) return;
    try {
      if (!campo || campo === "snap" || campo === "grade" || campo === "passo") {
        var pz = b.precisao ? b.precisao() : null;
        if (pz && pz.snaps) { var T = {}; TIPOS_SNAP.forEach(function (t) { T[t] = !c.tipos || c.tipos[t] !== false; }); T.grade = !!c.grade && T.grade; pz.snaps({ on: c.snap, tipos: T, grade: c.passo }); }
      }
      if ((!campo || campo === "encadear") && sub === "parede" && b.planta2d && b.planta2d()) b.planta2d().encadear(c.encadear);
      /* ⚠ só com o modo B2 JÁ ligado (o BimArqUI mandou a configuração): editarB2 CRIA a configuração
         B2 quando ela não existe, e ligar o modo B2 por um campo da barra muda toda parede nova (ímã de
         12 px nas pontas, laje por contorno) — foi o que a e2e-bim-b3 pegou */
      var pl = b.planta2d ? b.planta2d() : null;
      if ((!campo || campo === "linhaLoc") && sub === "parede" && b.editarB2 && pl && pl.traco().b2) b.editarB2({ linhaLoc: c.linhaLoc === "eixo" ? null : c.linhaLoc });
      /* UNIÃO: "Unir automaticamente" vale para a parede NOVA — a configuração do modelador (js/bimarqui.js)
         acompanha; o visor só recebe se o modo B2 já estiver ligado (a mesma ressalva do editarB2 acima) */
      if ((!campo || campo === "unir") && sub === "parede") {
        var U = AU(), cu = U && U.cfg ? U.cfg() : null;
        if (cu) cu.unir = c.unir !== false;
        if (b.editarB2 && pl && pl.traco().b2) b.editarB2({ unir: c.unir !== false });
      }
    } catch (e) {}
    var P = PM(); if (P && P.aoMudarBarra) P.aoMudarBarra(sub, campo);
  };

  /* a ferramenta armada mudou (gancho no js/bim.js: setEditSub/setEdit) */
  BimBarraOpcoes.armou = function (sub) {
    if (!this.ativa()) return;
    var mudou = sub !== UIst.sub;
    UIst.sub = sub || null;
    if (mudou) this._fecharMenu();
    if (sub) this._aplicar(sub, null);
    var P = PM(); if (P && P.aoSub) P.aoSub(sub || null);
    this.pintar();
  };

  global.BimBarraOpcoes = BimBarraOpcoes;
  if (typeof module !== "undefined" && module.exports) module.exports = BimBarraOpcoes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
