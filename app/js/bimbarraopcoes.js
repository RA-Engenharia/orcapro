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
 *     formas do js/bimdesenho.js). Propriedades continuam no painel
 *     lateral (o tipo e os parâmetros da peça); a barra é do COMANDO em curso.
 *   · DESDE 14/10/2026 a PRECISÃO (Ortogonal, Incrementos, Snaps e Grade) é
 *     UM estado só (`precisao()`, `precisaoMudar()`, `assinar()`), gravado por
 *     usuário, mostrado e mudado na barra de BAIXO do BIM (js/bimbarrasnaps.js)
 *     e lido por toda ferramenta de criar — `cfg(sub)` devolve os mesmos campos
 *     de antes, vindos dele.
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
  /* os tipos de snap (14/10/2026: os snaps completos — a mesma lista do js/bimprecisao.js TIPOS; este
     arquivo não depende dele para o teste em Node). A FACE nasce desligada: o ponto na face do modelo
     importado tira o clique do plano de trabalho — quem quer liga no menu. */
  var TIPOS_SNAP = ["fim", "intersecao", "meio", "centro", "centroide", "quadrante", "insercao", "no",
                    "perpendicular", "tangente", "aparente", "extensao", "paralelo", "rastreamento", "proximo", "grade",
                    "eixos", "vertice", "aresta", "face"];
  var TIPO_PADRAO = {}; TIPOS_SNAP.forEach(function (t) { TIPO_PADRAO[t] = t !== "face"; });
  function tipoDe(T, t) { return T && typeof T[t] === "boolean" ? T[t] : TIPO_PADRAO[t]; }
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
    if (c.tipos && typeof c.tipos === "object") { o.tipos = {}; TIPOS_SNAP.forEach(function (t) { o.tipos[t] = tipoDe(c.tipos, t); }); } else o.tipos = null;
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

  /* ------------------------------------------------- A PRECISÃO É UMA SÓ (14/10/2026)
   * Pedido do Rogério: "os botões de snap ficam lá embaixo, na barra de baixo, e o que
   * deixa a linha na horizontal/vertical também — para qualquer coisa que for criar".
   * Ortogonal, incrementos de ângulo, snaps (geral e por tipo), grade e passo deixaram de
   * ser memória POR FERRAMENTA: viraram UM estado, gravado por usuário, que a barra de
   * baixo (js/bimbarrasnaps.js) mostra e muda e que TODA ferramenta de criar lê. Quem
   * pergunta `cfg(sub)` continua recebendo os mesmos campos (a API não mudou) — eles só
   * vêm deste estado, e não mais da ferramenta. ⚠ Antes, ligar o ortogonal na parede e
   * armar a viga trazia o ortogonal desligado de novo: a pessoa não sabia em que estado
   * estava. Um estado só, sempre à vista embaixo, é o que acaba com isso. */
  var CAMPOS_PREC = ["orto", "inc", "snap", "tipos", "grade", "passo"];
  var FORTE = { fim: 1, intersecao: 1, meio: 1, centro: 1, perpendicular: 1,
                centroide: 1, quadrante: 1, insercao: 1, no: 1, tangente: 1, aparente: 1, paralelo: 1, rastreamento: 1 };   /* snaps completos: o paralelo e a guia do rastreamento também mandam na direção */
  function sanearPrec(c) {
    var p = padrao(), o = {};
    c = c && typeof c === "object" ? c : {};
    o.orto = typeof c.orto === "boolean" ? c.orto : p.orto;
    var inc = Array.isArray(c.inc) ? c.inc.map(Number).filter(function (g) { return INCREMENTOS.indexOf(g) >= 0; }) : null;
    o.inc = inc ? INCREMENTOS.filter(function (g) { return inc.indexOf(g) >= 0; }) : p.inc;
    o.snap = typeof c.snap === "boolean" ? c.snap : p.snap;
    var T = c.tipos && typeof c.tipos === "object" ? c.tipos : {};
    o.tipos = {}; TIPOS_SNAP.forEach(function (t) { o.tipos[t] = tipoDe(T, t); });
    o.grade = typeof c.grade === "boolean" ? c.grade : p.grade;
    o.tipos.grade = o.grade;   /* "Grade" é um só: o botão e o tipo de snap andam juntos */
    var ps = num(c.passo, p.passo); o.passo = ps > 0 && ps <= 10 ? ps : p.passo;
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
    CHAVE: CHAVE, INCREMENTOS: INCREMENTOS, PADRAO_INC: PADRAO_INC, JANELA: JANELA, TRACO: TRACO, TIPOS_SNAP: TIPOS_SNAP, TIPO_PADRAO: TIPO_PADRAO, CAMPOS_PREC: CAMPOS_PREC,
    padrao: padrao, sanear: sanear, sanearPrec: sanearPrec, ajustarAngulo: ajustarAngulo, ajustarPontoCom: ajustarPonto, arredondar: arredondar, grausDe: grausDe, maisPerto: maisPerto,
    _armaz: null,      /* teste: troca o localStorage */
    _cache: null,
    _ouvintes: [],
    _chave: function () { return CHAVE + ":" + usuario(); },
    _ler: function () {
      if (this._cache && this._cache.k === this._chave()) return this._cache.v;
      var a = this._armaz || armazenamento(), v = null;
      try { v = a ? JSON.parse(a.getItem(this._chave()) || "null") : null; } catch (e) { v = null; }
      if (!v || typeof v !== "object" || typeof v.ferr !== "object" || !v.ferr) v = { v: 1, ferr: {} };
      /* MIGRAÇÃO (14/10/2026): quem já usava a barra antiga tinha a precisão gravada POR
         ferramenta. O estado único nasce da PAREDE (a ferramenta mais usada), senão da primeira
         gravada, senão do padrão. A memória antiga das ferramentas fica onde está (nada apagado). */
      if (!v.prec || typeof v.prec !== "object") {
        var fonte = v.ferr.parede || v.ferr[Object.keys(v.ferr)[0]] || null;
        v.prec = sanearPrec(fonte);
      } else v.prec = sanearPrec(v.prec);
      this._cache = { k: this._chave(), v: v };
      return v;
    },
    _salvar: function (v) {
      var a = this._armaz || armazenamento();
      try { if (a) a.setItem(this._chave(), JSON.stringify(v)); } catch (e) { /* armazenamento cheio: fica na memória até fechar */ }
    },
    /* ---------------------------------------- o ESTADO ÚNICO da precisão */
    precisao: function () { return clone(this._ler().prec); },
    /* muda um ou mais campos ({ orto, inc, snap, tipos, grade, passo }); devolve o estado novo.
       Só avisa quem escuta quando algo mudou de verdade (idempotente). */
    precisaoMudar: function (patch) {
      var v = this._ler(), atual = v.prec, novo = clone(atual);
      patch = patch && typeof patch === "object" ? patch : {};
      CAMPOS_PREC.forEach(function (f) {
        if (!(f in patch)) return;
        if (f === "tipos") { var T = patch.tipos || {}; Object.keys(T).forEach(function (t) { if (TIPOS_SNAP.indexOf(t) >= 0) novo.tipos[t] = T[t] !== false; }); if ("grade" in T && !("grade" in patch)) novo.grade = T.grade !== false; }
        else novo[f] = patch[f];
      });
      novo = sanearPrec(novo);
      if (JSON.stringify(novo) === JSON.stringify(atual)) return clone(atual);
      v.prec = novo; this._salvar(v);
      var copia = clone(novo);
      this._ouvintes.slice().forEach(function (fn) { try { fn(clone(copia)); } catch (e) {} });
      return copia;
    },
    /* liga/desliga orto, snap ou grade; um TIPO de snap com `tipo:<nome>` */
    alternar: function (campo) {
      var p = this.precisao(), o = {};
      if (/^tipo:/.test(campo)) { var t = campo.slice(5); if (TIPOS_SNAP.indexOf(t) < 0) return null; o.tipos = {}; o.tipos[t] = !p.tipos[t]; if (t === "grade") o.grade = !p.tipos[t]; return this.precisaoMudar(o).tipos[t]; }
      if (campo !== "orto" && campo !== "snap" && campo !== "grade") return null;
      o[campo] = !p[campo];
      return this.precisaoMudar(o)[campo];
    },
    /* "Marcar todos" / "Nenhum" do menu da barra de baixo: todos os tipos de uma vez (o Snap geral fica como está) */
    tiposTodos: function (on) { var T = {}; TIPOS_SNAP.forEach(function (t) { T[t] = !!on; }); return this.precisaoMudar({ tipos: T, grade: !!on }); },
    /* o snap geral está ligado E este tipo também? (sem tipo: só o geral) */
    snapLigado: function (t) { var p = this._ler().prec; return !!p.snap && (t == null || p.tipos[t] !== false); },
    /* quem precisa repintar quando a precisão muda (as barras, o desenho de precisão) */
    assinar: function (fn) {
      if (typeof fn !== "function") return function () {};
      var L = this._ouvintes; L.push(fn);
      return function () { var i = L.indexOf(fn); if (i >= 0) L.splice(i, 1); };
    },
    /* a configuração da ferramenta: a última usada (ou o padrão da primeira vez) nos campos
       DA ferramenta, e a precisão do estado único (os mesmos campos de sempre) */
    cfg: function (sub) {
      var k = String(sub || "geral"), v = this._ler(), o = sanear(v.ferr[k], k), p = v.prec;
      CAMPOS_PREC.forEach(function (f) { o[f] = clone(p[f]); });
      return o;
    },
    /* grava a ferramenta (só ela: as outras ficam como estão); a precisão que vier junto vai
       para o estado único (quem gravava a cfg inteira continua funcionando) */
    gravar: function (sub, c) {
      var k = String(sub || "geral"), v = this._ler(), s = sanear(c, k), pat = {};
      CAMPOS_PREC.forEach(function (f) { if (c && typeof c === "object" && f in c && c[f] != null) pat[f] = s[f]; delete s[f]; });
      if (pat.tipos === null) delete pat.tipos;
      v.ferr[k] = s;
      this._salvar(v);
      if (Object.keys(pat).length) this.precisaoMudar(pat);
      return this.cfg(k);
    },
    mudar: function (sub, campo, valor) {
      if (CAMPOS_PREC.indexOf(campo) >= 0) { var o = {}; o[campo] = valor; this.precisaoMudar(o); return this.cfg(sub); }
      var c = this.cfg(sub); c[campo] = valor; return this.gravar(sub, c);
    },
    /* o ponto ajustado pela configuração DA ferramenta (o gancho do js/bim.js e a planta usam);
       `o.grade`: o ponto veio da grade (ou de lugar nenhum) — aí o comprimento anda no passo dela */
    ajustarPonto: function (sub, base, p, shift, o) {
      var c = this.cfg(sub), aj = this.ajustarPontoCom(base, p, c, shift);
      return (o && o.grade && c.snap && c.grade) ? this.arredondar(base, aj, c.passo) : aj;
    },
    /* O PONTO DE QUALQUER FERRAMENTA DE CRIAR com a precisão única (14/10/2026): telhado e radier
       por contorno, baldrame, linha e região 2D, peça pronta em linha, cota com ponto livre…
       `o.tipoSnap`: o tipo do snap que deu o ponto — ponto NOTÁVEL (fim, interseção, meio, centro,
       perpendicular) ganha da trava, senão fechar o contorno no 1º canto puxaria a ponta para longe
       dele (a mesma regra da parede, js/bim.js editAjustarPonto); `o.shift`: inverte a trava.
       Devolve o mesmo { p, graus, dist, travado } do ajustarPontoCom. */
    travar: function (base, p, o) {
      o = o || {};
      if (!base || !p || !fin(base.x) || !fin(base.z) || !fin(p.x) || !fin(p.z)) return { p: p, graus: null, dist: 0, travado: false };
      if (o.tipoSnap && FORTE[o.tipoSnap]) return { p: { x: p.x, z: p.z }, graus: grausDe(base, p), dist: Math.sqrt(Math.pow(p.x - base.x, 2) + Math.pow(p.z - base.z, 2)), travado: false, forte: true };
      var c = this.precisao(), aj = ajustarPonto(base, p, c, !!o.shift);
      if (aj.travado && (!o.tipoSnap || o.tipoSnap === "grade") && c.snap && c.grade) aj = arredondar(base, aj, c.passo);
      return aj;
    },
    /* a ferramenta armada ENCAIXA nos EIXOS da grade (cruzamento, ponta, meio)? As da metálica e as
       peças prontas já pediam (js/metalcriarui.js, js/metalprontasui.js); a FUNDAÇÃO (sapata, bloco,
       estaca, baldrame, radier) e o PILAR de concreto também — a simulação do pórtico (14/10/2026)
       teve de "mover" a sapata para o cruzamento 1×A porque o clique não pegava o eixo. */
    EIXOS_CRIAR: { fundacao: 1, pilar: 1 },
    querEixos: function (sub) {
      if (!sub) return false;
      /* SNAPS COMPLETOS (14/10/2026): "Eixos da grade" é um tipo do menu do Snap — marcado, TODA ferramenta
         de criar encaixa nos eixos (linhas e cruzamentos); desmarcado, nenhuma */
      if (TIPOS_SNAP.indexOf("eixos") >= 0) return this.snapLigado("eixos");
      if (this.EIXOS_CRIAR[sub]) return true;
      try {
        if (global.MetalCriarUI && global.MetalCriarUI.querEixos && global.MetalCriarUI.querEixos(sub)) return true;
        if (global.MetalProntasUI && global.MetalProntasUI.querEixos && global.MetalProntasUI.querEixos(sub)) return true;
      } catch (e) {}
      return false;
    },
    ehTraco: function (sub) { return !!TRACO[sub]; },
    /* uma ferramenta de OUTRO módulo (as da metálica, js/metalcriarui.js) diz o nome que a barra
       mostra e se é de TRAÇO (tem ponto base: ortogonal, incrementos e o comprimento digitado na planta) */
    declarar: function (sub, o) {
      if (!sub || !o || typeof sub !== "string") return false;
      if (o.rotulo) ROTULOS[sub] = String(o.rotulo).slice(0, 40);
      if (o.traco) TRACO[sub] = 1; else delete TRACO[sub];
      return true;
    },
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
    /* a PRECISÃO na barra de baixo (js/bimbarrasnaps.js) nasce junto com a casca */
    try { if (global.BimBarraSnaps && global.BimBarraSnaps.garantir) global.BimBarraSnaps.garantir(); } catch (eS) {}
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
    /* PRECISÃO (14/10/2026): Ortogonal, incrementos, Snaps (e quais), Grade e passo SAÍRAM daqui —
       moram na barra de baixo (js/bimbarrasnaps.js), uma vez só, valendo para toda ferramenta de
       criar. Aqui ficam só os campos DO comando (tipo, nível, encadear, deslocamento, formas…). */
    void c;
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
  /* os menus de incrementos e de snaps desta barra saíram com a precisão (14/10/2026): eles moram
     na barra de baixo (js/bimbarrasnaps.js). Fica o nome, para quem ainda chamar não estourar. */
  BimBarraOpcoes._abrirMenu = function () { UIst.menu = null; };

  /* ------------------------------------------------------------ eventos */
  BimBarraOpcoes._ligar = function (el) {
    var self = this;
    el.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-bbo]") : null; if (!b || !el.contains(b)) return;
      var k = b.getAttribute("data-bbo"), sub = UIst.sub; if (!sub) return;
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
    /* F3/F8 e os botões da barra de baixo mudam o estado ÚNICO (js/bimbarrasnaps.js): esta barra
       não mostra mais a precisão, então não há o que repintar aqui */
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
      /* snaps, grade e passo: o desenho de precisão (js/bimprecisaoui.js) lê o estado único direto —
         não há mais o que empurrar para ele aqui */
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
    try { if (global.BimBarraSnaps && global.BimBarraSnaps.garantir && !global.BimBarraSnaps.elemento()) global.BimBarraSnaps.garantir(); } catch (eS) {}
    this.pintar();
  };

  global.BimBarraOpcoes = BimBarraOpcoes;
  if (typeof module !== "undefined" && module.exports) module.exports = BimBarraOpcoes;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
