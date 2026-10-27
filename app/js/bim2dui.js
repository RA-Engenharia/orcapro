/* =====================================================================
 * bim2dui.js — as VISTAS 2D do BIM: plantas por nível e cortes A, B, C…
 * (07/10/2026, pedido do Rogério: "planta baixa em linha,
 * com linha fina ou grossa; cortes A, B, C, D na lateral; cota com estilo,
 * com opção de tirar").
 *
 * Quem faz o quê:
 *   BIM.vista2d (js/bim.js) ... extrai o desenho do modelo (corte exato +
 *                               arestas visíveis), em vetor;
 *   Desenho2D (js/desenho2d.js) penas, cotas, marcas e o SVG (motor puro);
 *   este arquivo .............. a TELA: abre a vista numa aba, zoom/arrasto,
 *                               traçar corte com dois cliques na planta, as
 *                               Propriedades da vista e o que fica gravado.
 * O que fica gravado é POR OBRA (ou por modelo, sem obra), na chave
 * `orcapro:bim:desenho2d:<obra>`: os cortes (pontos, lado, profundidade) e o
 * estilo de cada vista. Só parâmetros — o desenho é refeito do modelo.
 * ===================================================================== */
(function (global) {
  "use strict";

  function D2() { return global.Desenho2D; }
  function B() { return global.BIM; }
  function toast(t, tipo) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "info"); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v, pad) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : pad; }

  var Bim2D = {
    _cfg: { obraKey: "geral", niveis: null },
    _cache: {},          /* id → { dados, tela, vb, el } */
    _pick: null,         /* traçando corte: { id (planta), pts:[] } */

    /* ---------------------------------------------------------- estado */
    configurar: function (cfg) {
      cfg = cfg || {};
      var mudou = cfg.obraKey && cfg.obraKey !== this._cfg.obraKey;
      if (cfg.obraKey) this._cfg.obraKey = String(cfg.obraKey);
      if (typeof cfg.niveis === "function") this._cfg.niveis = cfg.niveis;
      if (typeof cfg.abrir === "function") this._cfg.abrir = cfg.abrir;
      if (typeof cfg.aoMudar === "function") this._cfg.aoMudar = cfg.aoMudar;
      if (typeof cfg.fechar === "function") this._cfg.fechar = cfg.fechar;
      if (typeof cfg.vincular === "function") this._cfg.vincular = cfg.vincular;
      if (mudou) { this._cache = {}; this._est = null; this._cadMem = {}; this._pre = {}; this._ger++; if (this._fila) this._fila.limpar(); }   /* FLUIDEZ: o de antemão é da obra que saiu */
    },
    _chave: function () { return "orcapro:bim:desenho2d:" + this._cfg.obraKey; },
    estado: function () {
      if (this._est) return this._est;
      var e = null;
      try { e = JSON.parse(localStorage.getItem(this._chave()) || "null"); } catch (x) { e = null; }
      if (!e || typeof e !== "object") e = {};
      if (!Array.isArray(e.cortes)) e.cortes = [];
      if (!e.estilos || typeof e.estilos !== "object") e.estilos = {};
      if (!e.plantas || typeof e.plantas !== "object") e.plantas = {};
      if (!e.acima || typeof e.acima !== "object" || Array.isArray(e.acima)) e.acima = {};   /* ACIMA DO CORTE: a opção de cada vista (id → {on, modo, altura, rotulo}) */
      this._est = e;
      return e;
    },
    _gravar: function () { try { localStorage.setItem(this._chave(), JSON.stringify(this.estado())); } catch (x) { toast("Não consegui guardar as vistas 2D neste aparelho (armazenamento cheio).", "erro"); } },
    _avisarMudou: function () { try { if (this._cfg.aoMudar) this._cfg.aoMudar(); } catch (e) {} try { this.agendarAntes(); } catch (eA) {} },   /* FLUIDEZ: vista nova (corte, elevação) entra no desenho de antemão */

    /* níveis das plantas: [{ id, nome, y }] (y = cota de MUNDO do piso) */
    niveis: function () {
      var L = [];
      try { if (this._cfg.niveis) L = this._cfg.niveis() || []; } catch (e) { L = []; }
      if (!L.length) {
        var p = B() && B().pavimentos2d ? B().pavimentos2d() : { pav: [] };
        L = (p.pav || []).map(function (x, i) { return { id: "pav" + i, nome: x.nome, y: x.y }; });
        /* sem nível nenhum e sem modelo, a planta do Térreo existe do mesmo jeito (20/10/2026): é nela que a
           primeira parede nasce — antes ela só aparecia depois da 1ª peça. Mesmo id do caso com modelo. */
        /* EDIFICAÇÃO (23/10/2026): sem pavimento declarado (IFC do SketchUp) o piso vem das peças verticais da CASA (cotas) ou do pé
           da casa — não do pé do terreno. O 1º nível mantém o id "modelo" (as folhas já guardadas apontam para d2p-modelo). */
        if (!L.length && p.cotas && p.cotas.length) L = p.cotas.map(function (c, i) { return { id: i ? "cota" + i : "modelo", nome: c.nome, y: c.y }; });
        if (!L.length) { var cxN = p.caixaEdif || p.caixa; L = [{ id: "modelo", nome: "Térreo", y: cxN ? cxN.min[1] : 0 }]; }
      }
      return L;
    },
    cortes: function () { return this.estado().cortes.slice(); },
    /* ACIMA DO CORTE (14/10/2026, js/desenho2d.js Acima): a opção da vista — mostrar as peças acima do
       plano de corte em projeção tracejada, até o nível de cima (padrão) ou até uma altura do piso.
       Gravada POR VISTA; ligada por padrão. Planta de forro não tem (ela já olha para cima). */
    acimaCfg: function (id) { var D = D2(); return D && D.Acima ? D.Acima.cfg(this.estado().acima[id]) : { on: false }; },
    _acimaVale: function (d) { return !!(d && d.tipo === "planta" && d.p6 !== "forro" && d.p6base !== "forro"); },
    /* o topo da faixa acima do corte em cota de MUNDO (null = desligado) */
    acimaTopo: function (d, yCorte) {
      var D = D2(); if (!D || !D.Acima || !this._acimaVale(d)) return null;
      return D.Acima.topo(this.acimaCfg(d.id), d.nivel.y, yCorte, this.niveis());
    },
    idPlanta: function (nivelId) { return "d2p-" + String(nivelId).replace(/[^\w-]/g, "_"); },
    idCorte: function (cid) { return "d2c-" + cid; },
    ehVista2d: function (id) { return /^d2[pcv]-/.test(String(id || "")); },   /* P6: d2v- = vistas novas (js/bimmodelovista.js) */
    /* P6 — GANCHO: as vistas novas (d2v-) e o nome dado pelo usuário (renomear) */
    def: function (id) {
      var M6 = this._p6(), d = this._defBase(id) || (M6 ? this._p6Def(id) : null);
      return d && M6 ? M6.nomear(id, d) : d;
    },
    _defBase: function (id) {
      var self = this;
      if (/^d2p-/.test(id)) {
        var nv = null; this.niveis().forEach(function (n) { if (self.idPlanta(n.id) === id) nv = n; });
        if (!nv) return null;
        var pp = this.estado().plantas[nv.id] || {};
        return { id: id, tipo: "planta", nome: "Planta baixa — " + nv.nome, nivel: nv, altura: num(pp.altura, 1.2), abaixo: num(pp.abaixo, 0.05) };
      }
      if (/^d2c-/.test(id)) {
        var c = null; this.estado().cortes.forEach(function (x) { if (self.idCorte(x.id) === id) c = x; });
        if (!c) return null;
        return { id: id, tipo: "corte", nome: "Corte " + c.letra, corte: c };
      }
      return null;
    },
    estilo: function (id) {
      var e = this.estado().estilos[id];
      if (!e) {
        /* o template (.optpl) traz o estilo padrão de planta e de corte */
        var pd = (this.estado().padrao || {})[/^d2p-/.test(id) ? "planta" : "corte"];
        e = pd ? D2().normEstilo(clone(pd)) : D2().estiloPadrao();
        var c = this._cache[id];
        if (c && c.dados) { var cx = D2().caixa(c.dados); if (cx) e.escala = D2().escalaQueCabe(cx.x1 - cx.x0, cx.y1 - cx.y0); }
        /* PLANTA DE INSTALAÇÕES (paridade, 18/10/2026): a escala que cabe a casa inteira (1:100) deixava o rótulo de 1,8 mm de
           papel ilegível no banheiro. Com instalação no modelo a planta nasce em 1:50, e em 1:25 quando a instalação inteira
           cabe num ambiente pequeno (≤ 4 m) */
        try {
          var ehP8 = !(global.BimInstUI && global.BimInstUI._previaHidro && !global.BimInstUI._previaHidro());   /* P8: a escala da planta de instalações só com a prévia hidro */
          var eI = ehP8 && /^d2p-/.test(id) && B() && B().editarEstado ? B().editarEstado() : null, trI = eI && eI.estado && eI.estado.instalacoes ? eI.estado.instalacoes.trechos : [];
          if (trI && trI.length) {
            var xs = [], zs = []; trI.forEach(function (t) { xs.push(t.p1.x, t.p2.x); zs.push(t.p1.z, t.p2.z); });
            var lI = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, zs) - Math.min.apply(null, zs));
            e.escala = Math.min(e.escala || 50, lI <= 4 ? 25 : 50);
          }
        } catch (eEsc) { /* sem instalação: fica a escala que cabe */ }
        this.estado().estilos[id] = e;
      }
      var en = D2().normEstilo(e), M6 = this._p6();
      var fim = M6 ? M6.sobreporEstilo(id, en) : en;   /* P6: a escala da vista (ou do modelo de vista ligado) */
      /* COTAS AUTOMÁTICAS (27/10/2026): vista com cota do motor novo (arq-*) mostra SÓ ela — as nativas do desenho saem.
         Calculado do estado: o Ctrl+Z do lote devolve as nativas junto. */
      try {
        var eA = B() && B().editarEstado ? B().editarEstado() : null, BCa = global.BimCotas;
        if (eA && eA.estado && BCa && BCa.vistaTemCotasArq && BCa.vistaTemCotasArq(eA.estado, id)) { var cp = {}; Object.keys(fim).forEach(function (k) { cp[k] = fim[k]; }); cp.cotas = false; fim = cp; }
      } catch (eNat) { /* sem o motor: o desenho segue com as cotas nativas */ }
      return fim;
    },

    /* ----------------------------------------------------------- dados */
    /* PROJETO DO ZERO (20/10/2026, pedido do Rogério: "só depois que puxo uma parede é que a planta baixa libera"):
       com o modelo ainda sem peça nenhuma a vista é a FOLHA EM BRANCO da área de trabalho — o SVG existe, os cliques
       das ferramentas caem nele (js/bimplantamodelar.js) e a primeira parede nasce na planta. Antes, a vista dizia
       "Abra um modelo primeiro." e não havia onde clicar. */
    _extrair: function (d) {
      var r = this._extrairModelo(d);
      if (r && !r.ok && r.vazio && d && d.tipo !== "desenho") return this._vazio(d);
      return r;
    },
    /* a área de trabalho da folha vazia: a do template (estado().area, em metro do mundo) ou 12 × 10 m na origem */
    areaVazia: function () {
      var a = this.estado().area;
      return (a && isFinite(a.x0) && isFinite(a.z0) && a.x1 > a.x0 && a.z1 > a.z0) ? a : { x0: 0, z0: 0, x1: 12, z1: 10 };
    },
    _vazio: function (d) {
      var a = this.areaVazia(), ehCorte = d.tipo === "corte" || d.tipo === "elevacao" || !!d.corte;
      var area;
      if (ehCorte) {
        var c = d.corte || d.linha || {}, L = Math.sqrt(Math.pow((c.bx || 0) - (c.ax || 0), 2) + Math.pow((c.bz || 0) - (c.az || 0), 2));
        if (!(L > 0.05)) L = Math.max(a.x1 - a.x0, a.z1 - a.z0);
        area = { x0: 0, y0: -3.5, x1: L, y1: 0.5 };
      } else area = { x0: a.x0, y0: a.z0, x1: a.x1, y1: a.z1 };
      return { ok: true, tipo: ehCorte ? "corte" : "planta", vazio: true, area: area, cortes: [], linhas: [], linhasK: [], p6Estilos: {}, info: { ms: 0, vazio: true } };
    },
    _extrairModelo: function (d) {
      var b = B(); if (!b || !b.vista2d) return { ok: false, erro: "O visualizador 3D ainda não abriu." };
      if (this._p6()) { var r6 = this._p6Extrair(d, b); if (r6) return r6; }   /* P6: V/G, faixa, forro, recorte */
      /* p6Tag: cada contorno/aresta leva o uid da peça — é por ele que o clique na vista SELECIONA (js/bimselecao.js) */
      if (d.tipo === "planta") return b.vista2d({ tipo: "planta", yCorte: d.nivel.y + d.altura, yFundo: d.nivel.y - d.abaixo, p6Tag: true, acimaTopo: this.acimaTopo(d, d.nivel.y + d.altura) });   /* ACIMA DO CORTE */
      var c = d.corte;
      return b.vista2d({ tipo: "corte", ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, inv: !!c.inv, prof: c.prof > 0 ? c.prof : null, p6Tag: true });
    },
    /* o que o desenho leva além do modelo: marcas de corte (planta) e níveis (corte) */
    _anotar: function (d, dados) {
      if (d.tipo === "desenho") return { tipo: "desenho", cortes: dados.cortes || [], linhas: dados.linhas || [], linhasK: dados.linhasK };   /* P6: vista de desenho */
      var out6 = this._anotarBase(d, dados);
      if (this._p6()) this._p6Anotar(d, dados, out6);   /* P6: chave de estilo das arestas e as marcas das vistas novas */
      return out6;
    },
    /* RÓTULOS DAS INSTALAÇÕES SEM SOBREPOSIÇÃO (regra das pranchas da RA): cada "ES Ø100 i=1%" vai para o lugar livre
       ao longo do próprio trecho (js/biminstnivel.js rotular): nunca texto sobre texto, evitando cruzar tubo (peso alto)
       e o resto do desenho (peso baixo). A posição volta no formato do js/desenho2d.js svgInst (translate − 0,6k, rotate). */
    _rotulosInst: function (d, dados, ins, segRot, pecas) {
      var NV = global.BimInstNivel; if (!NV || !NV.rotular || !ins || !ins.textos || !ins.textos.length) return;
      var k = (this.estilo(d.id).escala || 50) / 1000, h = 1.8 * k;
      var obst = [], L = dados.linhas || [], U = dados.linhasUd || [], I = dados.linhasIfc || [];
      for (var i = 0; i < L.length; i++) {
        var ehT = (U[i] && U[i].inst) || /^IFC(PIPE|FLOW|DUCT|CABLE|VALVE)/.test(String(I[i] || ""));
        obst.push({ seg: L[i], peso: ehT ? 10 : 1 });
      }
      /* o tubo, a conexão e a caixa da apresentação de prancha são POLÍGONO (corte de instalação): as bordas deles também
         são tubo para o rótulo (senão o "ES Ø100" caía em cima do tubo cheio) */
      (dados.cortes || []).forEach(function (c) {
        if (!c || !c.pts || !(c.inst || (c.k && String(c.k).indexOf("|inst:") >= 0))) return;
        for (var j = 0; j < c.pts.length; j++) { var a2 = c.pts[j], b2 = c.pts[(j + 1) % c.pts.length]; obst.push({ seg: [a2[0], a2[1], b2[0], b2[1]], peso: 10 }); }
      });
      /* ⚠ RÓTULO SÓ DE TUBO DESENHADO NESTA VISTA (17/10/2026: "AF Ø20", "ES Ø75" órfãos, sem tubo, no rodapé da planta
         recortada no desenho à mão): a camada de rótulos olha o pavimento inteiro; o desenho, só o recorte, a faixa, o
         V/G e a disciplina da vista. Fica o rótulo cujo trecho tem traço no desenho (o uid na linha); sem o uid nas linhas
         (vista sem a P6), vale a região de recorte. */
      var desenhados = null, rec = dados.p6Recorte || null;
      if (U.length) { desenhados = {}; U.forEach(function (u) { if (u && u.u) desenhados[String(u.u)] = 1; }); }
      /* no Médio/Alto o tubo e a caixa são POLÍGONO preenchido (corte de instalação): o uid deles vem dos cortes */
      (dados.cortes || []).forEach(function (c) { if (c && c.u) { if (!desenhados) desenhados = {}; desenhados[String(c.u)] = 1; } });
      var vale = function (sr) {
        if (!sr) return false;
        if (desenhados) return !!desenhados["edit:" + sr.id];
        if (!rec) return true;
        var s = sr.seg, mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
        return mx >= Math.min(rec.x0, rec.x1) && mx <= Math.max(rec.x0, rec.x1) && my >= Math.min(rec.y0, rec.y1) && my <= Math.max(rec.y0, rec.y1);
      };
      var tx = [], resto = ins.textos.filter(function (t) { return t.legenda; });
      ins.textos.forEach(function (t) {
        if (t.legenda) return;
        var sr = segRot[Math.round(t.x * 1000) + "|" + Math.round(t.y * 1000)] || null;
        if (!vale(sr)) return;
        /* trecho cortado pela região de recorte: o rótulo vai para o pedaço que APARECE (senão sai solto fora do desenho) */
        var sg = sr.seg;
        if (rec) {
          var x0 = Math.min(rec.x0, rec.x1), x1 = Math.max(rec.x0, rec.x1), y0 = Math.min(rec.y0, rec.y1), y1 = Math.max(rec.y0, rec.y1);
          var dx = sg[2] - sg[0], dy = sg[3] - sg[1], t0 = 0, t1 = 1, ok = true;
          [[-dx, sg[0] - x0], [dx, x1 - sg[0]], [-dy, sg[1] - y0], [dy, y1 - sg[1]]].forEach(function (q) {
            if (!ok) return; if (Math.abs(q[0]) < 1e-12) { if (q[1] < 0) ok = false; return; }
            var r = q[1] / q[0]; if (q[0] < 0) { if (r > t0) t0 = r; } else if (r < t1) t1 = r;
          });
          if (!ok || t1 - t0 < 1e-6) return;
          sg = [sg[0] + dx * t0, sg[1] + dy * t0, sg[0] + dx * t1, sg[1] + dy * t1];
        }
        tx.push({ t: t.t, x: (sg[0] + sg[2]) / 2, y: (sg[1] + sg[3]) / 2, rot: +t.rot || 0, cor: t.cor, seg: sg, id: sr.id });
      });
      /* CAIXA SIFONADA, RALO, CAIXA DE GORDURA/INSPEÇÃO: o rótulo VERMELHO com a sigla e o tamanho ("CS 150x185x75mm"), como
         na planta de referência do Rogério — só da peça desenhada nesta vista */
      var BIx0 = global.BimInst;
      (pecas || []).forEach(function (pc) {
        var tr = NV.rotuloPeca ? NV.rotuloPeca(pc) : null; if (!tr) return;
        if (desenhados ? !desenhados["edit:" + pc.id] : (rec && !(pc.x >= Math.min(rec.x0, rec.x1) && pc.x <= Math.max(rec.x0, rec.x1) && pc.z >= Math.min(rec.y0, rec.y1) && pc.z <= Math.max(rec.y0, rec.y1)))) return;
        var Pp = (BIx0 && BIx0.PECAS && BIx0.PECAS[pc.peca]) || {}, rP = Pp.forma === "caixa" ? (Pp.w || 0.1) / 2 : (Pp.r || 0.05);
        tx.push({ t: tr, x: pc.x, y: pc.z, rot: 0, cor: "#c00000", seg: [pc.x, pc.z, pc.x, pc.z], raio: rP, id: pc.id, peca: true });   /* o rótulo vai AO LADO da peça (js/biminstnivel.js rotular) */
      });
      /* LIGAÇÃO ELÉTRICA (21/10/2026): o símbolo do interruptor (S, S3w, S4w) e o circuito·comando da luminária — texto LIVRE
         (sem trecho), posto ao lado da peça pelo mesmo arrumador de rótulos */
      ins.textos.forEach(function (t) {
        if (!t.livre) return;
        if (rec && !(t.x >= Math.min(rec.x0, rec.x1) && t.x <= Math.max(rec.x0, rec.x1) && t.y >= Math.min(rec.y0, rec.y1) && t.y <= Math.max(rec.y0, rec.y1))) return;
        tx.push({ t: t.t, x: t.x, y: t.y, rot: 0, cor: t.cor, seg: [t.x, t.y, t.x, t.y], raio: 0.05, id: t.id, peca: true });
      });
      /* AVISO: inclinação ABAIXO DA MÍNIMA (esgoto: 2 % até DN 75, 1 % acima — BimInst.inclinacaoMinima, a mesma regra do
         Verificar sistemas) não se esconde: o rótulo sai na cor de aviso. Mede a inclinação no próprio trecho do modelo
         (|Δy| / comprimento em planta), não no texto — o "i=0,72%" do subcoletor DN 100 é aviso. */
      var BIx = global.BimInst, trs = {};
      try { var eT = B() && B().editarEstado ? B().editarEstado() : null; ((eT && eT.estado && eT.estado.instalacoes && eT.estado.instalacoes.trechos) || []).forEach(function (t) { trs[t.id] = t; }); } catch (eTr) {}
      tx.forEach(function (t) {
        var tr = trs[t.id], abaixo = false;
        if (tr && BIx && BIx.inclinacaoMinima && BIx.SISTEMAS && BIx.SISTEMAS[tr.sistema] && BIx.SISTEMAS[tr.sistema].gravidade) {
          var Lh = Math.sqrt((tr.p2.x - tr.p1.x) * (tr.p2.x - tr.p1.x) + (tr.p2.z - tr.p1.z) * (tr.p2.z - tr.p1.z));
          /* a MESMA regra do aviso do trecho (BimInst.abaixoDaMinima): ≥ no arredondamento do rótulo — o "i=1,0%" nunca sai vermelho */
          if (Lh > 1e-6) { var iT = Math.abs(tr.p2.y - tr.p1.y) / Lh * 100;
            abaixo = BIx.abaixoDaMinima ? BIx.abaixoDaMinima(tr.sistema, tr.dn, iT) : iT < BIx.inclinacaoMinima(tr.sistema, tr.dn) - 1e-6; }
        } else if (/(^|\s)i=0(,0+)?%/.test(t.t)) abaixo = true;
        if (abaixo) { t.cor = "#c00000"; t.aviso = true; }
      });
      var pos = NV.rotular(tx, obst, { h: h, larg: 0.58 });
      /* a LINHA DE CHAMADA do rótulo que foi para longe do que ele marca (traço fino na cor do rótulo) */
      pos.forEach(function (p) { if (p && p.chamada) (ins.linhas = ins.linhas || []).push({ seg: p.chamada, cor: p.cor || "#000000", chamada: true, id: p.id }); });
      ins.textos = pos.filter(Boolean).map(function (p) {
        var a = (+p.rot || 0) * Math.PI / 180, cy = -0.35 * h;   /* o centro do texto no referencial dele (linha de base em 0) */
        return { t: p.t, cor: p.cor, rot: p.rot, x: p.x + Math.sin(a) * cy, y: p.y - Math.cos(a) * cy + 0.6 * k, semLugar: p.semLugar, aviso: !!p.aviso, id: p.id };
      }).concat(resto);
    },
    _anotarBase: function (d, dados) {
      var self = this, out = { tipo: dados.tipo, cortes: dados.cortes, linhas: dados.linhas };
      if (dados.instImagens) { out.instImagens = dados.instImagens; if (dados.instClip) out.instClip = dados.instClip; }   /* PARIDADE: a vista da cena das instalações (Alto) */
      if (dados.portas && dados.portas.length) out.portas = dados.portas;   /* PORTA: folha aberta + arco do giro (js/simboloporta.js) */
      /* ACIMA DO CORTE: a projeção tracejada e o rótulo (o modo do rótulo é da vista) */
      if (d.tipo === "planta" && dados.acima && dados.acima.length && this.acimaCfg(d.id).on) { out.acima = dados.acima; out.acimaRotulo = this.acimaCfg(d.id).rotulo; }
      if (d.tipo === "planta") {
        out.cad = this._cadDesenho(d.nivel.id);
        /* B5: instalações por cima, na cor do sistema (js/biminst.js planta) */
        try {
          var b5 = B(), I5 = global.BimInst;
          if (I5 && b5 && b5.editarEstado) {
            var e5 = b5.editarEstado();
            if (e5 && e5.estado && e5.estado.instalacoes && (e5.estado.instalacoes.trechos.length || e5.estado.instalacoes.pecas.length))
              /* faixa das instalações: até 0,80 m ABAIXO do nível (o esgoto e o pluvial
                 correm sob o piso e são desenhados na planta do pavimento, como no
                 projeto hidrossanitário) e até 3 m acima do corte (forro/laje: tracejado) */
              out.inst = I5.planta(e5.estado, { yFundo: d.nivel.y - Math.max(d.abaixo, 0.8), yCorte: d.nivel.y + d.altura, yTopo: d.nivel.y + d.altura + 3, rede: I5.rede(e5.estado, b5.familiaAvaliar),
                legenda: !!(global.BimInstUI && global.BimInstUI.legendaLigada && global.BimInstUI.legendaLigada()) });   /* P12: legenda de tubulação (ligável) */
            /* NÍVEL DE DETALHE (js/biminstnivel.js): abaixo do Alto o tubo já vem no DESENHO, em linha única na pena e
               cor do sistema, com os símbolos do nível (BIM.vista2d) — o traço grosso e as bolotas de conexão desta
               camada sairiam por cima, em dobro. Ficam os rótulos (DN, i %) e a legenda. No Alto, a camada de sempre. */
            /* 17/10/2026 (pedido do Rogério, "não sei o que são esses pontos"): as BOLINHAS cheias desta camada eram a marca
               de cada conexão deduzida (BimInst.planta, tipo "conexao") e o traço colorido no meio do tubo duplo era o eixo
               desta camada por cima do tubo cortado. Com o nível de detalhe, o desenho da instalação vem do BIM.vista2d em
               TODOS os níveis — aqui ficam só os rótulos (DN, i %), postos sem sobreposição, e a legenda. */
            var nd5 = dados.info && dados.info.nivelInst ? dados.info.nivelInst.usado : null;
            if (out.inst && nd5) {
              var segRot = {};
              (out.inst.linhas || []).forEach(function (l) { if (!l.legenda && l.seg) segRot[Math.round((l.seg[0] + l.seg[2]) * 500) + "|" + Math.round((l.seg[1] + l.seg[3]) * 500)] = { seg: l.seg, id: l.id }; });
              out.inst.linhas = (out.inst.linhas || []).filter(function (l) { return l.legenda; });
              out.inst.simbolos = [];
              try { this._rotulosInst(d, dados, out.inst, segRot, e5.estado.instalacoes.pecas); } catch (eRot) {}
            }
          }
        } catch (eI5) {}
        out.marcas = this.estado().cortes.map(function (c) {
          var dx = c.bx - c.ax, dz = c.bz - c.az, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / L, nz = -dx / L;
          if (c.inv) { nx = -nx; nz = -nz; }
          return { id: c.id, letra: c.letra, a: [c.ax, c.az], b: [c.bx, c.bz], olhar: [nx, nz] };
        });
        /* B3 (prévia do modelador): as COTAS PERMANENTES do editor entram na planta — o plano (x, z)
           do mundo é o (x, y) do desenho. Só leitura: a cota mora nas ops do editor. */
        try {
          var bz = B(), ez = (global.BimPrevia && global.BimPrevia.modelador() && bz && bz.editarEstado) ? bz.editarEstado() : null;
          out.cotasModelo = ((ez && ez.estado && ez.estado.cotas) || []).map(function (c) { return { a: [c.a.x, c.a.z], b: [c.b.x, c.b.z], off: c.off, valor: c.valor }; });
        } catch (eCz) { out.cotasModelo = []; }
        /* METÁLICA (js/metalcriarui.js): as cotas entre os eixos paralelos da grade (6,00 · 6,00 · total) */
        try { if (global.MetalCriarUI && global.MetalCriarUI.cotasEixosPlanta) out.cotasModelo = out.cotasModelo.concat(global.MetalCriarUI.cotasEixosPlanta()); } catch (eCe) {}
        /* P2-D (js/bimambienteui.js, prévia do modelador): os AMBIENTES do nível —
           identificador (nome; número · área), esquema de cores e legenda */
        try {
          var AU = global.BimAmbienteUI;
          if (AU && AU.anotarPlanta) { var am = AU.anotarPlanta(d, this.estilo(d.id), this.niveis()); if (am) out.ambientes = am; }
        } catch (eAm) {}
        /* P5 (js/bimanot.js, prévia do modelador): identificadores (porta P01, parede PA-1…) — texto do registro */
        try { var AN5 = global.BimAnot; if (AN5 && AN5.anotarPlanta) { var an5 = AN5.anotarPlanta(d, this.estilo(d.id)); if (an5) out.anotacao = an5; } } catch (eAn5) {}
        /* P11 (js/bimterrenoui.js): curvas de nível, rótulos, divisa, plataforma e o norte — como vínculo em meio-tom */
        try { if (global.BimTerrenoUI && global.BimTerrenoUI.ativo()) out.cad = (out.cad || []).concat(global.BimTerrenoUI.anotarPlanta(d, this.niveis())); } catch (eT11) {}
      } else {
        out.niveis = this.niveis().map(function (n) { return { nome: n.nome, y: -n.y, cota: n.y }; });
      }
      /* EIXOS da grade (B2, modelador): na planta a linha inteira; no corte, onde
         o eixo cruza a linha do corte vira uma vertical com a bolinha em cima */
      var eixos = [];
      try { var ee = B() && B().editarEstado ? B().editarEstado() : null; eixos = (ee && ee.estado && ee.estado.eixos) || []; } catch (eE) { eixos = []; }
      if (eixos.length) {
        if (d.tipo === "planta") out.eixos = eixos.map(function (x) { return { id: x.id, nome: x.nome, a: [x.x0, x.z0], b: [x.x1, x.z1] }; });
        else {
          var c = d.corte, dx = c.bx - c.ax, dz = c.bz - c.az, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / L, nz = -dx / L;
          if (c.inv) { nx = -nx; nz = -nz; }
          out.eixos = [];
          eixos.forEach(function (x) {
            var ex = x.x1 - x.x0, ez = x.z1 - x.z0, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) return;
            var r = ((x.x0 - c.ax) * dz - (x.z0 - c.az) * dx) / den; if (r < -1e-6 || r > 1 + 1e-6) return;   /* o eixo não cruza o corte */
            var X = x.x0 + r * ex, Z = x.z0 + r * ez;
            out.eixos.push({ id: x.id, nome: x.nome, x: (X - c.ax) * (-nz) + (Z - c.az) * nx });
          });
        }
      }
      /* P7 (js/bimanot2dui.js, prévia do modelador): a anotação DESTA vista */
      try { var A7 = global.BimAnot2DUI; if (A7 && A7.anotarVista) { var a7 = A7.anotarVista(d); if (a7) out.anotP7 = a7; } } catch (eA7) {}
      return out;
    },

    /* ------------------------------------------------------------ tela */
    montar: function (tela, id) {
      if (/^d2t-/.test(String(id))) return !!(global.BimTabelaUI && global.BimTabelaUI.montar(tela, id));   /* P5: a TABELA abre numa aba de vista (js/bimtabelaui.js) */
      var d = this.def(id); if (!tela || !d) return false;
      var c = this._cache[id] || (this._cache[id] = {});
      c.tela = tela;
      var v = tela.querySelector(".d2-vista-tela");
      if (!v) { v = document.createElement("div"); v.className = "d2-vista-tela"; tela.appendChild(v); }
      c.el = v;
      this._ligarInteracao(v, id);
      /* FLUIDEZ: a vista que ficou escondida durante uma mudança do modelo (c.sujo) se refaz ao aparecer */
      var sujo = !!c.sujo; c.sujo = false;
      if (sujo && c.dados) { var vbS = c.vb ? clone(c.vb) : null, okS = this._redesenhar(id, true, true); if (okS && vbS) this._aplicarVb(id, vbS); return okS; }
      /* FLUIDEZ (25/10/2026): a vista que nunca abriu e foi DESENHADA DE ANTEMÃO (segundo plano) — o dado só vale com a
         mesma chave (cena, vista, instalações, geração de mudança); senão extrai agora, como sempre */
      if (!c.dados && !sujo) { var pre = this._usarAntes(id); if (pre) { c.dados = pre; c.info = pre.info; } }
      return this._redesenhar(id, !c.dados, true);
    },
    /* FLUIDEZ: a vista está na tela (a aba dela na frente)? */
    visivel: function (id) { var c = this._cache[id]; if (!c || !c.el) return false; try { return c.el.getClientRects().length > 0; } catch (e) { return true; } },
    desmontar: function (id) { if (/^d2t-/.test(String(id)) && global.BimTabelaUI) global.BimTabelaUI.desmontar(id); /* P5 */ delete this._cache[id]; if (this._pick && this._pick.id === id) this._pick = null; },

    /* =================================================================
     * FLUIDEZ (25/10/2026) — A VISTA 2D FEITA ANTES DE SER PEDIDA
     *
     * ⚠ ROTEIRO (tools/medir-fluidez.js): depois de editar no 3D, voltar para a planta levava 0,4–0,8 s — a planta
     * escondida ficava "suja" e era refeita NA HORA do clique; e a 1ª planta do projeto exemplo, 1,1–1,5 s.
     * Agora, com a pessoa PARADA (js/bimfluidez.js Fila: sem mouse/teclado há 1 s e a câmera parada, uma tarefa por vez):
     *  1. a vista aberta e escondida que ficou suja é refeita em segundo plano — quando a pessoa clica, já está pronta.
     *     A camada de seleção/alças (que mede a escala na TELA) é repintada quando a vista aparece (`camadaPend`).
     *  2. a planta de trabalho, o 1º corte e a 1ª elevação que ainda NÃO abriram têm o dado extraído de antemão
     *     (`_pre`). ⚠ O dado só é usado se a CHAVE for a mesma da hora da extração: a assinatura da cena COM a
     *     visibilidade e os materiais (BIM.assinaturaVista), a definição da vista, o "acima do corte", o estado das
     *     vistas da P6 (V/G, faixa), o nível de detalhe das instalações e a GERAÇÃO de mudança (`_ger`, que sobe a cada
     *     "o modelo mudou" — sujar, atualizar, fase). Qualquer diferença = extrai na hora, como antes.
     * O desenho de antemão é CACHE: some quando a obra muda (configurar) e nunca é gravado.
     * ================================================================= */
    _ger: 0,
    _pre: {},
    _fila: null,
    ANTES_MAX: 3,
    /* o modelo mudou (alguém vai refazer as vistas): o desenho de antemão deixa de valer e a fila é chamada */
    mudou: function () { this._ger++; this._agendarFundo(); },
    /* a vista escondida que precisa ser refeita (js/bimambienteui.js, js/bimp10ui.js) */
    sujar: function (id) { var c = this._cache[id]; if (c) c.sujo = true; this.mudou(); },
    _filaObj: function () {
      if (this._fila) return this._fila;
      var BF = global.BimFluidez; if (!BF || !BF.Fila || typeof setTimeout !== "function") return null;
      var self = this, doc = global.document;
      this._fila = new BF.Fila({
        agora: function () { return Date.now(); },
        agendar: function (fn, ms) { return setTimeout(function () { if (typeof global.requestIdleCallback === "function") global.requestIdleCallback(fn, { timeout: 3000 }); else fn(); }, ms); },
        cancelar: function (h) { clearTimeout(h); },
        /* fora da tela do BIM não adianta (e a pessoa está fazendo outra coisa no app); com a câmera do 3D mexendo (giro,
           voo, passeio — também sem mouse) espera ela parar: o desenho no meio do giro é um tranco */
        ocupado: function () {
          try {
            if (doc && doc.body && !doc.body.classList.contains("bim-app")) return true;
            var b = B(); return !!(b && b.cameraParadaMs && b.cameraParadaMs() < 600);
          } catch (e) { return false; }
        },
        log: function (m, e) { try { if (global.console && console.warn) console.warn("[bim2d] " + m, e && e.message ? e.message : e || ""); } catch (x) {} }
      });
      if (doc && doc.addEventListener) {
        var f = this._fila, ent = function () { f.entrada(); };
        ["pointerdown", "pointermove", "wheel", "keydown"].forEach(function (t) { try { doc.addEventListener(t, ent, { capture: true, passive: true }); } catch (e) {} });
      }
      return this._fila;
    },
    /* as vistas que valem ser feitas de antemão: a planta de trabalho (a do comando "Planta baixa" — o 1º nível que não
       é terreno/fundação, a mesma regra do Gestao._d2PlantaPadrao), o 1º corte e a 1ª elevação */
    _idsAntes: function () {
      var ids = [], L = this.niveis(), nv = L.filter(function (n) { return !/terreno|funda|sondag/i.test(n.nome || ""); })[0] || L[0];
      if (nv) ids.push(this.idPlanta(nv.id));
      var cs = this.estado().cortes; if (cs.length) ids.push(this.idCorte(cs[0].id));
      var M6 = this._p6();
      if (M6) { try { var vs = M6.estado().vistas || {}, el = Object.keys(vs).filter(function (k) { return vs[k] && vs[k].tipo === "elevacao"; })[0]; if (el) ids.push(el); } catch (e) {} }
      return ids.slice(0, this.ANTES_MAX);
    },
    /* a chave do desenho de antemão — null = não dá para garantir (não guarda nem usa) */
    _chaveAntes: function (id) {
      var b = B(), d = this.def(id); if (!b || !b.assinaturaVista || !d) return null;
      var sig = null; try { sig = b.assinaturaVista(); } catch (e) { sig = null; } if (!sig) return null;
      var H = global.BimFluidez && global.BimFluidez.Hash ? new global.BimFluidez.Hash() : null; if (!H) return null;
      try {
        var M6 = this._p6(), U = global.BimInstUI;
        H.txt(JSON.stringify(d)).txt(JSON.stringify(this.acimaCfg(id))).txt(JSON.stringify(this.estado().area || null));
        /* P6: o que a extração lê da vista — a configuração EFETIVA (com o modelo de vista: V/G, faixa, recorte, nível de
           detalhe, estilo visual) e se os estilos RA já carregaram. ⚠ Vista com FILTRO por conjunto depende das seleções
           da obra (BimSet): não é feita de antemão (null). */
        if (M6) {
          var est6 = M6.estado(), vv = est6.vistas[id] || M6.vistaPadrao(/^d2c-/.test(String(id)) ? "corte" : "planta"), ef6 = M6.efetivo(vv, est6);
          if (ef6 && ef6.filtros && Object.keys(ef6.filtros).length) return null;
          H.txt(JSON.stringify(ef6)).txt(JSON.stringify(est6.vistas[id] || null)).num(M6.dados && M6.dados().prontos ? 1 : 0);
        } else H.txt("-");
        H.txt(JSON.stringify([U ? U._nivelFeito || "" : "", U && U._previaHidro ? !!U._previaHidro() : null, global.HidSombra ? global.HidSombra.ligada !== false : null, U ? U.modoCor || "" : ""]));
      } catch (e2) { return null; }
      return this._ger + "|" + sig + "|" + H.valor();
    },
    _usarAntes: function (id) {
      var p = this._pre[id]; if (!p) return null;
      delete this._pre[id];
      var k = this._chaveAntes(id);
      return k && k === p.chave ? p.dados : null;
    },
    /* quantas vistas estão prontas de antemão (o vigia e a e2e leem) */
    antesProntas: function () { var self = this; return Object.keys(this._pre).filter(function (k) { return self._pre[k] && self._pre[k].chave === self._chaveAntes(k); }); },
    soltarAntes: function () { this._pre = {}; },
    /* chama a fila: vista suja escondida (prioridade 2) e desenho de antemão (1) */
    _agendarFundo: function () {
      var f = this._filaObj(); if (!f) return;
      var self = this;
      Object.keys(this._cache).forEach(function (k) {
        var c = self._cache[k]; if (!c || !c.sujo || !c.el || !self.ehVista2d(k)) return;
        f.pedir("refazer:" + k, function () { self._refazerFundo(k); }, 2);
      });
      this.agendarAntes();
    },
    agendarAntes: function () {
      var f = this._filaObj(); if (!f) return;
      var self = this;
      this._idsAntes().forEach(function (k) { if (!self._cache[k]) f.pedir("antes:" + k, function () { self._antesFundo(k); }, 1); });
    },
    _refazerFundo: function (id) {
      var c = this._cache[id]; if (!c || !c.sujo || !c.el || this.visivel(id)) return false;
      c.sujo = false;
      this._fundo = true;
      try { this.atualizar(id); } finally { this._fundo = false; }
      c.camadaPend = true;   /* a seleção e as alças medem a escala na tela: repintam quando a vista aparecer */
      return true;
    },
    _antesFundo: function (id) {
      if (this._cache[id]) return false;   /* abriu enquanto esperava: quem desenha é o montar */
      var d = this.def(id); if (!d) return false;
      var k = this._chaveAntes(id); if (!k) return false;
      if (this._pre[id] && this._pre[id].chave === k) return false;   /* já pronto e valendo */
      var self = this, BMU = global.BimMateriaisUI, r = null;
      var run = function () { return self._extrair(d); };
      r = BMU && BMU.emLote ? BMU.emLote(run) : run();
      if (!r || !r.ok) return false;
      /* a chave de DEPOIS: se a extração mexeu na cena (o nível de detalhe da louça vai ao máximo), vale a de depois */
      var k2 = this._chaveAntes(id); if (!k2) return false;
      this._pre[id] = { chave: k2, dados: r, em: Date.now() };
      var ks = Object.keys(this._pre); if (ks.length > this.ANTES_MAX) { ks.sort(function (a, b) { return self._pre[a].em - self._pre[b].em; }); delete this._pre[ks[0]]; }
      return true;
    },
    /* as camadas por cima do desenho (elástico da ferramenta, seleção e alças, marca de corte) — também depois do
       segundo plano, quando a vista aparece */
    _camadas: function (id) {
      try { if (global.BimPlantaModelar && global.BimPlantaModelar.aposDesenhar) global.BimPlantaModelar.aposDesenhar(id); } catch (ePM) {}   /* PLANTA: o elástico volta por cima do desenho novo */
      try { if (global.BimSelecao && global.BimSelecao.aposDesenhar) global.BimSelecao.aposDesenhar(id); } catch (eSL) {}   /* SELECIONAR: o realce e as alças voltam por cima */
      try { if (global.BimMarcaCorte && global.BimMarcaCorte.aposDesenhar) global.BimMarcaCorte.aposDesenhar(id); } catch (eMC) {}   /* MARCA DE CORTE selecionada: as alças voltam (js/bimmarcacorte.js) */
    },

    /* refaz o SVG (e, com `recalcular`, extrai de novo do modelo) */
    redesenhar: function (id, recalcular) { return this._redesenhar(id, recalcular, false); },
    /* interno = o montar (a vista abrindo ou voltando à grade): não é "o modelo mudou" */
    _redesenhar: function (id, recalcular, interno) {
      /* FLUIDEZ: pedir para extrair de novo de fora = o modelo pode ter mudado → o desenho de antemão não vale mais */
      if (recalcular && !interno && !this._fundo) this._ger++;
      /* FLUIDEZ: o desenho inteiro num lote dos materiais (o mapa peça → material uma vez só) */
      var self = this, BMU = global.BimMateriaisUI;
      if (BMU && typeof BMU.emLote === "function") return BMU.emLote(function () { return self._redesenharCorpo(id, recalcular); });
      return this._redesenharCorpo(id, recalcular);
    },
    _redesenharCorpo: function (id, recalcular) {
      var d = this.def(id), c = this._cache[id]; if (!d || !c || !c.el) return false;
      c.camadaPend = false;
      if (recalcular || !c.dados) {
        var r = this._extrair(d);
        if (!r || !r.ok) { c.el.innerHTML = '<div class="d2-vazio">' + ((r && r.erro) || "Não consegui gerar o desenho.") + "</div>"; c.dados = null; return false; }
        c.dados = r; c.info = r.info;
      }
      var ex = { titulo: d.nome }, M6 = this._p6(); if (M6) M6.extraSvg(id, c.dados, ex);   /* P6: estilos de objeto RA */
      /* CORES POR CATEGORIA (js/bimcorescatui.js): só a TELA recebe as cópias pintadas — c.dados (que a folha e o DXF também leem) fica intacto */
      var dadosTela = c.dados;
      try { if (global.BimCoresCatUI) dadosTela = global.BimCoresCatUI.aplicar2D(id, c.dados, ex) || c.dados; } catch (eCC) { dadosTela = c.dados; }
      var res = D2().svg(this._anotar(d, dadosTela), this.estilo(id), ex);
      var vbAnt = c.vb;
      c.el.innerHTML = res.svg;
      c.svg = c.el.querySelector("svg");
      c.vbTotal = res.vb;
      if (vbAnt && !recalcular) this._aplicarVb(id, vbAnt); else this._aplicarVb(id, res.vb);
      if (this._pick && this._pick.id === id) c.el.setAttribute("data-d2-pick", "1");
      this._camadas(id);
      return true;
    },
    _aplicarVb: function (id, vb) {
      var c = this._cache[id]; if (!c || !c.svg) return;
      c.vb = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
      c.svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    },
    ajustar: function (id) { var c = this._cache[id]; if (c && c.vbTotal) this._aplicarVb(id, c.vbTotal); },
    /* P2-D: o modelo mudou — refaz o desenho do modelo SEM perder o zoom (o
       "Atualizar desenho" volta ao enquadramento; este não) */
    atualizar: function (id) {
      var c = this._cache[id]; if (!c || !c.el) return false;
      var vb = c.vb ? clone(c.vb) : null, ok = this.redesenhar(id, true);
      if (ok && vb) this._aplicarVb(id, vb);
      return ok;
    },
    plantasAbertas: function () { return Object.keys(this._cache).filter(function (k) { return /^d2p-/.test(k); }); },
    _ptSvg: function (id, ev) {
      var c = this._cache[id]; if (!c || !c.svg || !c.svg.getScreenCTM) return null;
      var m = c.svg.getScreenCTM(); if (!m) return null;
      var p = c.svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      var q = p.matrixTransform(m.inverse());
      return [q.x, q.y];
    },
    _ligarInteracao: function (v, id) {
      if (v._d2Ligado) return; v._d2Ligado = true;
      var self = this, arr = null;
      /* FLUIDEZ (17/10/2026): a vista marcada "suja" enquanto escondida (js/bimambienteui.js) se refaz quando aparece */
      /* FLUIDEZ (25/10/2026): refeita em segundo plano (escondida) → ao aparecer, só a camada de seleção/alças (camadaPend) */
      try { if (global.ResizeObserver) new global.ResizeObserver(function () { var c0 = self._cache[id]; if (!c0 || !self.visivel(id)) return; if (c0.sujo) { c0.sujo = false; self._fundo = true; try { self.atualizar(id); } finally { self._fundo = false; } } else if (c0.camadaPend) { c0.camadaPend = false; self._camadas(id); } }).observe(v); } catch (eRO) {}
      v.addEventListener("wheel", function (ev) {
        var c = self._cache[id]; if (!c || !c.vb) return;
        ev.preventDefault();
        var p = self._ptSvg(id, ev); if (!p) return;
        var f = ev.deltaY > 0 ? 1.18 : 1 / 1.18, vb = c.vb;
        self._aplicarVb(id, { x: p[0] - (p[0] - vb.x) * f, y: p[1] - (p[1] - vb.y) * f, w: vb.w * f, h: vb.h * f });
      }, { passive: false });
      v.addEventListener("pointerdown", function (ev) {
        var c = self._cache[id]; if (!c || !c.vb) return;
        if (self._pick && self._pick.id === id && ev.button === 0) { self._clicarPick(id, ev); return; }
        /* P7 (js/bimanot2dui.js): ferramenta de anotação armada, ou clique numa anotação (seleciona) */
        var A7 = global.BimAnot2DUI;
        if (A7 && A7.clique2d && ev.button === 0 && A7.clique2d(id, ev, self._ptSvg(id, ev))) return;
        /* PLANTA (js/bimplantamodelar.js): ferramenta de modelar armada (parede, porta, laje, pilar…) —
           o clique na planta é o ponto dela, com snaps e ortogonal; o botão do meio continua arrastando */
        var PMd = global.BimPlantaModelar;
        if (PMd && PMd.clique2d && ev.button === 0 && PMd.clique2d(id, ev, self._ptSvg(id, ev))) return;
        var M6 = self._p6();   /* P6: ferramentas (recorte, chamada, linha, elevação interior) e as marcas das vistas novas */
        if (M6 && ev.button === 0) {
          if (M6.clique2d(id, ev, self._ptSvg(id, ev))) return;
          var mv = ev.target && ev.target.closest ? ev.target.closest("[data-d2-vista]") : null;
          if (mv) { self.abrir(mv.getAttribute("data-d2-vista")); return; }
        }
        /* P2-D (js/bimambienteui.js): com Ambiente/Separador armado o clique na planta é o
           ponto; sem ferramenta, o clique no identificador seleciona o ambiente */
        var AU = global.BimAmbienteUI;
        if (AU && AU.clique2d && ev.button === 0 && AU.clique2d(id, ev, self._ptSvg(id, ev))) return;
        var AN5 = global.BimAnot;   /* P5: Identificar por categoria (clique na peça) e clique na etiqueta seleciona */
        if (AN5 && AN5.clique2d && ev.button === 0 && AN5.clique2d(id, ev, self._ptSvg(id, ev))) return;
        var marca = ev.target && ev.target.closest ? ev.target.closest("[data-d2-corte]") : null;
        if (marca && ev.button === 0) { self.abrir(self.idCorte(marca.getAttribute("data-d2-corte"))); return; }
        /* SELECIONAR (js/bimselecao.js, 09/10/2026): sem ferramenta, o botão ESQUERDO seleciona (clique),
           faz a janela (arrastar no vazio), move a peça e estica pela alça. Mover a vista é o botão do
           MEIO — o esquerdo só move a vista com a Mão ligada ou com o dedo (o toque fica como era). */
        var SL = global.BimSelecao;
        if (SL && SL.down2d && SL.down2d(id, ev, self._ptSvg(id, ev))) return;
        if (SL ? !SL.panPlanta(ev) : (ev.button !== 0 && ev.button !== 1)) return;
        var m = c.svg.getScreenCTM(); if (!m) return;
        arr = { x: ev.clientX, y: ev.clientY, vb: clone(c.vb), s: 1 / m.a, toque: ev.pointerType === "touch" };
        try { v.setPointerCapture(ev.pointerId); } catch (e) {}
        v.setAttribute("data-d2-arrasta", "1");
      });
      /* o botão do meio não liga a rolagem automática do navegador (ele é o "mover a vista") */
      v.addEventListener("mousedown", function (ev) { if (ev.button === 1) ev.preventDefault(); });
      v.addEventListener("auxclick", function (ev) { if (ev.button === 1) ev.preventDefault(); });
      v.addEventListener("pointermove", function (ev) {
        var SLm = global.BimSelecao;   /* SELECIONAR: a janela, o arrasto da peça/alça e o realce sob o cursor */
        if (!arr && SLm && SLm.move2d && SLm.move2d(id, ev, self._ptSvg(id, ev))) return;
        if (self._pick && self._pick.id === id && self._pick.pts.length === 1) self._mostrarPick(id, ev);
        var AU = global.BimAmbienteUI;   /* P2-D: o realce da região antes do clique */
        if (!arr && AU && AU.mover2d) AU.mover2d(id, ev, self._ptSvg(id, ev));
        if (!arr && global.BimAnot2DUI && global.BimAnot2DUI._f) global.BimAnot2DUI.mover2d(id, ev, self._ptSvg(id, ev));   /* P7: o elástico da anotação */
        if (!arr && global.BimPlantaModelar && global.BimPlantaModelar.mover2d) global.BimPlantaModelar.mover2d(id, ev, self._ptSvg(id, ev));   /* PLANTA: snap, elástico e a forma */
        if (!arr) return;
        var dx = (ev.clientX - arr.x) * arr.s, dy = (ev.clientY - arr.y) * arr.s;
        self._aplicarVb(id, { x: arr.vb.x - dx, y: arr.vb.y - dy, w: arr.vb.w, h: arr.vb.h });
      });
      function solta(ev) {
        var SLu = global.BimSelecao;
        /* SELECIONAR: o toque simples (o dedo não andou) seleciona; o arrasto do esquerdo termina aqui */
        if (arr && arr.toque && ev && ev.type === "pointerup" && SLu && SLu.clique2d && Math.abs(ev.clientX - arr.x) + Math.abs(ev.clientY - arr.y) < 8) SLu.clique2d(id, ev, self._ptSvg(id, ev));
        else if (!arr && SLu && SLu.up2d && ev) SLu.up2d(id, ev, self._ptSvg(id, ev), ev.type === "pointercancel");
        arr = null; v.removeAttribute("data-d2-arrasta");
      }
      v.addEventListener("pointerup", solta); v.addEventListener("pointercancel", solta);
      v.addEventListener("dblclick", function (ev) {
        /* PLANTA: com a ferramenta de modelar armada o duplo clique é ponto, não "enquadrar" */
        if (global.BimPlantaModelar && global.BimPlantaModelar.ocupado && global.BimPlantaModelar.ocupado()) return;
        /* M5 (14/10/2026): duplo clique numa peça de PEÇA PRONTA abre o diálogo dela (js/metalcomponenteui.js) */
        try { var SLd = global.BimSelecao, Cd = global.MetalComponenteUI, ud = SLd && SLd.pecaEm && ev ? SLd.pecaEm(id, self._ptSvg(id, ev)) : null; if (ud && Cd && Cd.duplo && Cd.duplo(ud)) return; } catch (eD) {}
        self.ajustar(id);
      });
    },

    /* --------------------------------------------- traçar corte na planta */
    tracarCorte: function (idPlanta) {
      var c = this._cache[idPlanta]; if (!c || !c.el) return false;
      this._pick = { id: idPlanta, pts: [] };
      c.el.setAttribute("data-d2-pick", "1");
      var letra = D2().proximaLetra(this.estado().cortes.map(function (x) { return x.letra; }));
      status("Corte " + letra + ": clique o 1º ponto na planta (Esc cancela; Shift solta o ângulo).");
      var self = this;
      if (!this._escPick) {
        this._escPick = function (ev) { if (ev.key === "Escape" && self._pick) { self.cancelarTraco(); ev.stopPropagation(); } };
        document.addEventListener("keydown", this._escPick, true);
      }
      return true;
    },
    cancelarTraco: function (calado) {
      if (!this._pick) return;
      var c = this._cache[this._pick.id]; if (c && c.el) { c.el.removeAttribute("data-d2-pick"); var g = c.el.querySelector(".d2-pick"); if (g) g.parentNode.removeChild(g); }
      this._pick = null; if (!calado) status("Corte cancelado.");
    },
    _travar: function (a, p, livre) {
      if (livre) return p;
      var dx = p[0] - a[0], dy = p[1] - a[1];
      return Math.abs(dx) >= Math.abs(dy) ? [p[0], a[1]] : [a[0], p[1]];   /* ortogonal, como a maioria dos cortes */
    },
    _mostrarPick: function (id, ev) {
      var c = this._cache[id], p = this._ptSvg(id, ev); if (!c || !p || !c.svg) return;
      var a = this._pick.pts[0], q = this._travar(a, p, ev.shiftKey);
      var g = c.svg.querySelector(".d2-pick");
      if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "line"); g.setAttribute("class", "d2-pick"); g.setAttribute("vector-effect", "non-scaling-stroke"); c.svg.appendChild(g); }
      g.setAttribute("x1", a[0]); g.setAttribute("y1", a[1]); g.setAttribute("x2", q[0]); g.setAttribute("y2", q[1]);
    },
    _clicarPick: function (id, ev) {
      var p = this._ptSvg(id, ev); if (!p) return;
      var pk = this._pick;
      if (!pk.pts.length) { pk.pts.push(p); status("Agora o 2º ponto (Shift solta o ângulo)."); return; }
      var a = pk.pts[0], b = this._travar(a, p, ev.shiftKey);
      this.cancelarTraco(true);
      if (Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])) < 0.3) { toast("Corte curto demais: clique dois pontos mais afastados.", "aviso"); return; }
      this.criarCorte(a[0], a[1], b[0], b[1]);
    },
    /* cria o corte (pontos em X/Z do mundo) e abre a vista dele */
    criarCorte: function (ax, az, bx, bz, opts) {
      var e = this.estado();
      var letra = D2().proximaLetra(e.cortes.map(function (x) { return x.letra; }));
      var c = { id: "c" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), letra: letra, ax: ax, az: az, bx: bx, bz: bz, inv: !!(opts && opts.inv), prof: 0 };
      if (opts && opts.letra && e.cortes.every(function (x) { return x.letra !== opts.letra; })) c.letra = letra = String(opts.letra);
      if (opts && opts.pvAuto) c.pvAuto = true;   /* posto pelo gerador de pranchas: ele o reposiciona se a caixa da edificação mudar */
      e.cortes.push(c); this._gravar();
      /* as plantas abertas ganham a marca do corte novo */
      var self = this; Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
      this._avisarMudou();
      if (opts && opts.silencioso) return c;   /* o template de início cria os cortes A e B sem abrir aba nem avisar */
      this.abrir(this.idCorte(c.id));
      toast("Corte " + letra + " criado. Ele está em Navegador de projeto › Cortes.", "ok");
      status("Corte " + letra + " criado e aberto. A marca dele está na planta; os parâmetros, em Propriedades.");
      return c;
    },
    /* muda a linha de um corte já criado (o gerador de pranchas põe o corte antigo, feito sobre o terreno, no meio da casa) */
    moverCorte: function (cid, ax, az, bx, bz, marcarAuto) {
      var c = null; this.estado().cortes.forEach(function (x) { if (x.id === cid) c = x; });
      if (!c || ![ax, az, bx, bz].every(function (v) { return isFinite(v); })) return false;
      c.ax = ax; c.az = az; c.bx = bx; c.bz = bz; if (marcarAuto) c.pvAuto = true;
      this._gravar();
      var self = this, idc = this.idCorte(cid);
      Object.keys(this._cache).forEach(function (k) { if (k === idc || /^d2p-/.test(k)) self.redesenhar(k, false); });
      this._avisarMudou();
      return true;
    },
    /* corte pelo meio do modelo: 'longitudinal' (ao longo do lado maior) ou 'transversal' */
    corteRapido: function (modo) {
      var p = B() && B().pavimentos2d ? B().pavimentos2d() : null;
      if (!p || !p.caixa) { toast("Abra um modelo primeiro.", "aviso"); return null; }
      var cxE = p.caixaEdif || p.caixa;   /* EDIFICAÇÃO: o meio da casa, não o do terreno */
      var mn = cxE.min, mx = cxE.max, lx = mx[0] - mn[0], lz = mx[2] - mn[2], cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, m = 1;
      var aoLongoX = (modo === "longitudinal") === (lx >= lz);
      return aoLongoX ? this.criarCorte(mn[0] - m, cz, mx[0] + m, cz) : this.criarCorte(cx, mx[2] + m, cx, mn[2] - m);
    },
    excluirCorte: function (cid) {
      var e = this.estado(), n0 = e.cortes.length, self = this;
      e.cortes = e.cortes.filter(function (x) { return x.id !== cid; });
      if (e.cortes.length === n0) return false;
      delete e.estilos[this.idCorte(cid)];
      try { if (global.BimCoresCatUI) global.BimCoresCatUI.vistaSaiu(this.idCorte(cid)); } catch (eCC) {}   /* CORES POR CATEGORIA: o corte apagado não deixa estado guardado */
      this._gravar();
      Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
      this._avisarMudou();
      return true;
    },
    abrir: function (id) { if (this._cfg.abrir) this._cfg.abrir(id, (this.def(id) || {}).nome || id); },

    /* ------------------------------------------ vínculo CAD (DWG/DXF) na planta
     * Vincular CAD: o desenho fica por baixo da planta, em
     * cinza, com deslocamento e rotação próprios. O que fica gravado:
     *   estado.cad[nivelId] = [{ id, nome, w, h, dx, dy, rot, vis, n, nt, cortado }]
     *   e as LINHAS numa chave separada (orcapro:bim:cad:<obra>:<id>) — um DWG
     *   de prefeitura tem dezenas de milhares de linhas, e misturar com o estado
     *   das vistas faria o estado inteiro falhar ao gravar.
     * Coordenadas: o DXF chega em METROS (js/dxf.js), com Y para cima; a linha
     * vai guardada relativa ao canto do desenho. Na tela (planta: X = x, Y = z):
     *   X = dx + (u·cos − v·sen) · Y = dy − (u·sen + v·cos)  */
    MAX_CAD_SEG: 20000,
    _cadMem: {},
    _cadChave: function (lid) { return "orcapro:bim:cad:" + this._cfg.obraKey + ":" + lid; },
    cadLista: function (nivelId) { var c = this.estado().cad || {}; return (c[nivelId] || []).slice(); },
    _cadDados: function (lid) {
      if (this._cadMem[lid]) return this._cadMem[lid];
      var x = null; try { x = JSON.parse(localStorage.getItem(this._cadChave(lid)) || "null"); } catch (e) { x = null; }
      if (x && Array.isArray(x.s)) this._cadMem[lid] = x;
      return x;
    },
    vincularCad: function (id, nome, dxf) {
      var d = this.def(id); if (!d || d.tipo !== "planta") return { ok: false, erro: "O vínculo CAD vai numa planta baixa: abra uma planta primeiro." };
      var segs = (dxf && dxf.segmentos) || [], ex = dxf && dxf.extents;
      if (!segs.length || !ex) return { ok: false, erro: "O desenho não tem linhas." };
      var cortado = segs.length > this.MAX_CAD_SEG; if (cortado) segs = segs.slice(0, this.MAX_CAD_SEG);
      function r3(v) { return Math.round(v * 1000) / 1000; }
      var s = []; segs.forEach(function (g) { s.push(r3(g.x1 - ex.x0), r3(g.y1 - ex.y0), r3(g.x2 - ex.x0), r3(g.y2 - ex.y0)); });
      var t = (dxf.textos || []).slice(0, 3000).filter(function (x) { return isFinite(x.x) && isFinite(x.y) && x.txt; })
        .map(function (x) { return [r3(x.x - ex.x0), r3(x.y - ex.y0), String(x.txt).slice(0, 120)]; });
      var w = ex.x1 - ex.x0, h = ex.y1 - ex.y0, dx = 0, dy = h;
      /* começa com o centro do desenho no centro do modelo: depois ajusta em Propriedades */
      var p = B() && B().pavimentos2d ? B().pavimentos2d() : null;
      if (p && p.caixa) { dx = (p.caixa.min[0] + p.caixa.max[0]) / 2 - w / 2; dy = (p.caixa.min[2] + p.caixa.max[2]) / 2 + h / 2; }
      var lid = "cad" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      var dados = { s: s, t: t };
      this._cadMem[lid] = dados;
      var gravou = true;
      try { localStorage.setItem(this._cadChave(lid), JSON.stringify(dados)); } catch (e) { gravou = false; }
      var e = this.estado(); if (!e.cad || typeof e.cad !== "object") e.cad = {};
      var L = e.cad[d.nivel.id] || (e.cad[d.nivel.id] = []);
      L.push({ id: lid, nome: String(nome || "Desenho CAD").slice(0, 80), w: r3(w), h: r3(h), dx: r3(dx), dy: r3(dy), rot: 0, vis: true, n: s.length / 4, nt: t.length, cortado: cortado, temp: !gravou });
      this._gravar(); this._avisarMudou();
      if (!gravou) toast("O desenho é grande para guardar neste aparelho: ele fica só até fechar o OrçaPRO.", "aviso");
      return { ok: true, id: lid, segmentos: s.length / 4, textos: t.length, cortado: cortado, gravou: gravou };
    },
    _cadAchar: function (lid) {
      var c = this.estado().cad || {}, r = null;
      Object.keys(c).forEach(function (k) { (c[k] || []).forEach(function (x) { if (x.id === lid) r = x; }); });
      return r;
    },
    excluirCad: function (lid) {
      var c = this.estado().cad || {}, achou = false;
      Object.keys(c).forEach(function (k) { var n0 = (c[k] || []).length; c[k] = (c[k] || []).filter(function (x) { return x.id !== lid; }); if (c[k].length !== n0) achou = true; });
      if (!achou) return false;
      delete this._cadMem[lid];
      try { localStorage.removeItem(this._cadChave(lid)); } catch (e) {}
      this._gravar(); this._avisarMudou();
      return true;
    },
    /* vínculos visíveis do nível → [{ seg:[x1,y1,x2,y2,…], tx:[[X,Y,txt]] }] em coordenadas da planta */
    _cadDesenho: function (nivelId) {
      var self = this, out = [];
      this.cadLista(nivelId).forEach(function (v) {
        if (!v.vis) return;
        var dd = self._cadDados(v.id); if (!dd) return;
        var a = (+v.rot || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), dx = +v.dx || 0, dy = +v.dy || 0;
        var seg = new Array(dd.s.length);
        for (var i = 0; i + 3 < dd.s.length; i += 4) {
          var u1 = dd.s[i], v1 = dd.s[i + 1], u2 = dd.s[i + 2], v2 = dd.s[i + 3];
          seg[i] = dx + u1 * co - v1 * si; seg[i + 1] = dy - (u1 * si + v1 * co);
          seg[i + 2] = dx + u2 * co - v2 * si; seg[i + 3] = dy - (u2 * si + v2 * co);
        }
        out.push({ id: v.id, seg: seg, tx: (dd.t || []).map(function (t) { return [dx + t[0] * co - t[1] * si, dy - (t[0] * si + t[1] * co), t[2]]; }) });
      });
      return out;
    },

    /* -------------------------------------------- Propriedades da vista */
    props: function (id) {
      if (/^d2t-/.test(String(id))) return global.BimTabelaUI ? global.BimTabelaUI.propsVista(id) : null;   /* P5: Propriedades da tabela */
      var self = this, d = this.def(id); if (!d) return null;
      var M6 = this._p6(); if (M6 && d.tipo === "desenho") return M6.propsDesenho(id, d);   /* P6: vista de desenho */
      var e = this.estilo(id), D = D2(), c = this._cache[id] || {};
      function op(obj) { return Object.keys(obj).map(function (k) { return { id: k, rotulo: typeof obj[k] === "string" ? obj[k] : obj[k].rotulo }; }); }
      var secoes = [
        { nome: "Gráficos", params: [
          { id: "escala", rotulo: "Escala", tipo: "lista", valor: String(e.escala), opcoes: D.ESCALAS.map(function (s) { return { id: String(s), rotulo: "1:" + s }; }) },
          { id: "pena", rotulo: "Espessura das linhas", tipo: "lista", valor: e.pena, opcoes: op(D.PENAS) },
          { id: "preenchimento", rotulo: "Preenchimento do corte", tipo: "lista", valor: e.preenchimento, opcoes: op(D.PREENCHIMENTOS) },
          { id: "titulo", rotulo: "Título da vista", tipo: "sim-nao", valor: e.titulo },
          /* CONVENÇÃO DE REFORMA (19/10/2026): a construir em vermelho com hachura, a demolir em amarelo tracejado, existente em preto/cinza, com legenda */
          { id: "convencao", rotulo: "Convenção de reforma", tipo: "lista", valor: e.convencao || "padrao", opcoes: op(D.CONVENCOES) },
          /* padrão de detalhamento da empresa (js/padraodet.js): cota, unidade, texto e escala de uma vez */
          { id: "padraodet", rotulo: "Padrão da empresa", tipo: "botao", rotuloBotao: "Aplicar Padrão de detalhamento", fn: function () { self.aplicarPadraoDet(id); } }
        ].concat(d.tipo === "planta" ? [{ id: "marcasCorte", rotulo: "Marcas de corte", tipo: "sim-nao", valor: e.marcasCorte }]
                                     : [{ id: "niveis", rotulo: "Níveis", tipo: "sim-nao", valor: e.niveis }]) },
        { nome: "Cotas", params: [
          { id: "cotas", rotulo: "Mostrar cotas", tipo: "sim-nao", valor: e.cotas },
          { id: "cotaParcial", rotulo: "Cota em cadeia", tipo: "sim-nao", valor: e.cotaParcial },
          { id: "marcaCota", rotulo: "Marca da cota", tipo: "lista", valor: e.marcaCota, opcoes: op(D.MARCAS_COTA) },
          { id: "textoCota", rotulo: "Altura do texto", unidade: "mm", tipo: "numero", passo: 0.5, valor: e.textoCota },
          { id: "unidade", rotulo: "Unidade", tipo: "lista", valor: e.unidade, opcoes: op(D.UNIDADES) },
          { id: "casas", rotulo: "Casas decimais", tipo: "lista", valor: String(e.casas), opcoes: [{ id: "0", rotulo: "0" }, { id: "1", rotulo: "1" }, { id: "2", rotulo: "2" }, { id: "3", rotulo: "3" }] }
        ] }
      ];
      if (d.tipo === "planta") {
        secoes.push({ nome: "Extensões (faixa de vista)", params: [
          { id: "altura", rotulo: "Altura do corte", unidade: "m", tipo: "numero", passo: 0.05, valor: d.altura },
          { id: "abaixo", rotulo: "Ver abaixo do piso", unidade: "m", tipo: "numero", passo: 0.05, valor: d.abaixo }
        ] });
      } else {
        secoes.push({ nome: "Extensões", params: [
          { id: "prof", rotulo: "Profundidade de vista (0 = tudo)", unidade: "m", tipo: "numero", passo: 0.5, valor: d.corte.prof || 0 },
          { id: "inv", rotulo: "Olhar para o outro lado", tipo: "sim-nao", valor: !!d.corte.inv }
        ] });
      }
      /* ACIMA DO CORTE: a opção da vista (planta baixa, estrutural e o detalhe dela; o forro não) */
      if (this._acimaVale(d)) {
        var ac = this.acimaCfg(id), D3 = D2().Acima, nAc = c.dados && c.dados.acima ? c.dados.acima.length : 0;
        var pa = [
          { id: "acima:on", rotulo: "Mostrar acima do corte", tipo: "sim-nao", valor: ac.on },
          { id: "acima:modo", rotulo: "Faixa acima do corte", tipo: "lista", valor: ac.modo, opcoes: op(D3.MODOS) }
        ];
        if (ac.modo === "altura") pa.push({ id: "acima:altura", rotulo: "Topo da faixa (do piso)", unidade: "m", tipo: "numero", passo: 0.1, valor: ac.altura });
        pa.push({ id: "acima:rotulo", rotulo: "Rótulo das peças acima", tipo: "lista", valor: ac.rotulo, opcoes: op(D3.ROTULOS) });
        if (ac.on) pa.push({ id: "acima:info", rotulo: "Peças acima", leitura: true, valor: nAc + (nAc === 1 ? " peça tracejada" : " peças tracejadas") + (c.dados && c.dados.acimaTopo != null ? " (até " + D2().fmtCota(c.dados.acimaTopo) + ")" : "") });
        secoes.push({ nome: "Acima do plano de corte", params: pa });
      }
      /* CORES POR CATEGORIA: liga/desliga e "imprimir com as cores" desta vista */
      try { var sCC = global.BimCoresCatUI ? global.BimCoresCatUI.secaoVista(id) : null; if (sCC) secoes.push(sCC); } catch (eSCC) {}
      /* P2-D: "Esquema de cores" e identificadores de ambiente da planta (js/bimambienteui.js) */
      if (d.tipo === "planta" && global.BimAmbienteUI && global.BimAmbienteUI.secaoVista) {
        try { var sa = global.BimAmbienteUI.secaoVista(e); if (sa) secoes.push(sa); } catch (eSa) {}
      }
      if (d.tipo === "planta") {
        var vc = [];
        this.cadLista(d.nivel.id).forEach(function (v) {
          var p = "cad-" + v.id + "-";
          vc.push({ id: p + "nome", rotulo: "Desenho", leitura: true, valor: v.nome + " · " + v.n + " linhas" + (v.cortado ? " (limitado)" : "") + (v.temp ? " · não gravado" : "") });
          vc.push({ id: p + "vis", rotulo: "Mostrar", tipo: "sim-nao", valor: !!v.vis });
          vc.push({ id: p + "dx", rotulo: "Deslocamento X", unidade: "m", tipo: "numero", passo: 0.05, valor: v.dx });
          vc.push({ id: p + "dy", rotulo: "Deslocamento Y", unidade: "m", tipo: "numero", passo: 0.05, valor: v.dy });
          vc.push({ id: p + "rot", rotulo: "Rotação", unidade: "°", tipo: "numero", passo: 1, valor: v.rot || 0 });
          vc.push({ id: p + "excluir", rotulo: "Vínculo", tipo: "botao", rotuloBotao: "Remover vínculo", fn: function () { self.excluirCad(v.id); self.redesenhar(id, false); status("Vínculo CAD removido."); } });
        });
        if (this._cfg.vincular) vc.push({ id: "cad-novo", rotulo: "DWG / DXF", tipo: "botao", rotuloBotao: "Vincular desenho CAD…", fn: function () { self._cfg.vincular(id); } });
        if (vc.length) secoes.push({ nome: "Vínculos CAD", params: vc });
      }
      var ident = [
        { id: "nome", rotulo: "Nome da vista", leitura: true, valor: d.nome },
        { id: "ajustar", rotulo: "Enquadrar", tipo: "botao", rotuloBotao: "Ajustar à tela", fn: function () { self.ajustar(id); } },
        { id: "atualizar", rotulo: "Modelo mudou?", tipo: "botao", rotuloBotao: "Atualizar desenho", fn: function () { self.redesenhar(id, true); status("Desenho refeito a partir do modelo."); } }
      ];
      if (d.tipo === "planta") ident.push({ id: "novo-corte", rotulo: "Corte", tipo: "botao", rotuloBotao: "Traçar corte nesta planta", fn: function () { self.tracarCorte(id); } });
      else ident.push({ id: "excluir", rotulo: "Corte", tipo: "botao", rotuloBotao: "Excluir este corte", fn: function () { self._pedirExclusao(d.corte); } });
      if (c.info) ident.push({ id: "info", rotulo: "Desenho", leitura: true, valor: (c.dados ? c.dados.cortes.length : 0) + " contornos · " + (c.dados ? c.dados.linhas.length : 0) + " linhas · " + c.info.ms + " ms" });
      secoes.push({ nome: "Identidade", params: ident });
      var out = {
        daVista: true, semEditarTipo: true, titulo: d.nome, icone: d.tipo === "planta" ? "planta" : "corte", secoes: secoes,
        onMudar: function (pid, valor) { self._mudar(id, pid, valor); return self.props(id); }
      };
      return M6 ? M6.estenderProps(id, d, out) : out;   /* P6: modelo de vista, V/G, faixa, recorte, nome */
    },
    _mudar: function (id, pid, valor) {
      var d = this.def(id); if (!d) return;
      if (/^cc:/.test(String(pid)) && global.BimCoresCatUI && global.BimCoresCatUI.mudarVista(id, pid, valor)) return;   /* CORES POR CATEGORIA */
      var M6 = this._p6(); if (M6 && M6.mudar(id, pid, valor)) return;   /* P6 */
      var e = this.estado();
      var mc = /^cad-(\w+)-(vis|dx|dy|rot)$/.exec(pid);
      if (mc) {
        var v = this._cadAchar(mc[1]); if (!v) return;
        v[mc[2]] = mc[2] === "vis" ? !!valor : num(valor, v[mc[2]] || 0);
        this._gravar(); this.redesenhar(id, false); return;
      }
      var ma = /^acima:(on|modo|altura|rotulo)$/.exec(pid);
      if (ma) {   /* ACIMA DO CORTE: gravado por vista; ligar/desligar e a faixa re-extraem, o rótulo só redesenha */
        var D4 = D2().Acima, cur = D4.cfg(e.acima[id]);
        if (ma[1] === "on") cur.on = !!valor && valor !== "false";
        else if (ma[1] === "modo") cur.modo = D4.MODOS[valor] ? valor : cur.modo;
        else if (ma[1] === "altura") cur.altura = num(valor, cur.altura);
        else cur.rotulo = D4.ROTULOS[valor] ? valor : cur.rotulo;
        e.acima[id] = D4.cfg(cur);
        this._gravar(); if (ma[1] !== "rotulo") this.atualizar(id); else this.redesenhar(id, false);   /* sem perder o zoom */
        status(cur.on ? (ma[1] === "rotulo" ? "Rótulo das peças acima do corte: " + D4.ROTULOS[e.acima[id].rotulo] + "." : "Peças acima do corte em projeção tracejada, " + (e.acima[id].modo === "altura" ? "até " + D2().fmtNum(e.acima[id].altura, 2) + " m do piso." : "até o nível de cima.")) : "Peças acima do corte escondidas nesta vista.");
        return;
      }
      if (pid === "altura" || pid === "abaixo") {
        var pp = e.plantas[d.nivel.id] || (e.plantas[d.nivel.id] = {});
        pp[pid] = Math.max(pid === "altura" ? 0.1 : 0, num(valor, pid === "altura" ? 1.2 : 0.05));
        this._gravar(); this.redesenhar(id, true); return;
      }
      if (pid === "prof" || pid === "inv") {
        d.corte[pid] = pid === "inv" ? !!valor : Math.max(0, num(valor, 0));
        this._gravar(); this.redesenhar(id, true);
        var self = this; Object.keys(this._cache).forEach(function (k) { if (/^d2p-/.test(k)) self.redesenhar(k, false); });
        return;
      }
      var est = e.estilos[id] || (e.estilos[id] = this.estilo(id));
      est[pid] = (pid === "escala" || pid === "casas" || pid === "textoCota") ? num(valor, est[pid]) : valor;
      e.estilos[id] = D2().normEstilo(est);
      this._gravar(); this.redesenhar(id, false);
    },
    /* aplica o padrão de detalhamento da empresa a ESTA vista (o resto do estilo — pena, preenchimento — fica) */
    aplicarPadraoDet: function (id) {
      var P = global.PadraoDet; if (!P || !this.def(id)) return false;
      var empresa = (global.Auth && global.Auth.empresaId) ? global.Auth.empresaId() : null;
      var pd = P.estilo2D(P.ler(empresa)), e = this.estado();
      var est = e.estilos[id] || (e.estilos[id] = this.estilo(id));
      ["escala", "marcaCota", "textoCota", "unidade", "casas"].forEach(function (k) { est[k] = pd[k]; });
      e.estilos[id] = D2().normEstilo(est);
      this._gravar(); this.redesenhar(id, false);
      status("Padrão de detalhamento aplicado: cota em " + pd.unidade + ", texto " + pd.textoCota + " mm, 1:" + pd.escala + ".");
      return true;
    },
    _pedirExclusao: function (c) {
      var self = this;
      if (global.UI && UI.modal) {
        UI.modal("Excluir o Corte " + c.letra + "?", "<p>A vista do corte e a marca dele na planta saem. O modelo não muda.</p>", [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Excluir corte", classe: "danger", onClick: function () { UI.fecharModal(); if (self._cfg.fechar) self._cfg.fechar(self.idCorte(c.id)); self.excluirCorte(c.id); toast("Corte " + c.letra + " excluído.", "ok"); } }
        ]);
      }
    },

    /* =====================================================================
     * P6 — VISTAS NOVAS (Frente C do plano do BIM): elevação
     * (as 4 da construção + interior), planta de forro refletido, planta
     * estrutural, vista de desenho e chamada de detalhe. O OBJETO de cada vista
     * (escala, modelo, V/G, faixa, recorte) mora no js/bimmodelovista.js, com
     * id `d2v-…`; aqui fica o que é do DESENHO: a definição para o BIM.vista2d,
     * as marcas nas vistas-mãe e a criação. Sem a prévia do modelador, `_p6()`
     * é nulo e nada disto roda.
     * ===================================================================== */
    _p6: function () { var M = global.BimModeloVista; return M && M.ativo && M.ativo() ? M : null; },
    _p6Def: function (id, prof) {
      var M = this._p6(); if (!M || !/^d2v-/.test(String(id)) || (prof || 0) > 4) return null;
      var v = M.estado().vistas[id]; if (!v) return null;
      if (v.tipo === "planta" || v.tipo === "forro" || v.tipo === "estrutural") {
        var nv = null; this.niveis().forEach(function (n) { if (String(n.id) === String(v.nivelId)) nv = n; });
        if (!nv) return null;
        var f = M.efetivo(v, M.estado()).faixa || M.FAIXA_PADRAO[v.tipo];
        return { id: id, tipo: "planta", p6: v.tipo, nome: v.nome, nivel: nv, altura: f.corte, abaixo: Math.max(0, -Math.min(f.inf, f.prof)), topo: f.sup };
      }
      if ((v.tipo === "corte" || v.tipo === "elevacao") && v.linha) {
        return { id: id, tipo: "corte", p6: v.tipo, nome: v.nome, corte: { id: id, letra: v.marca || "", ax: v.linha.ax, az: v.linha.az, bx: v.linha.bx, bz: v.linha.bz, inv: !!v.linha.inv, prof: v.linha.prof || 0 } };
      }
      if (v.tipo === "chamada" && v.paiId && v.paiId !== id && v.ret) {
        var pai = /^d2v-/.test(v.paiId) ? this._p6Def(v.paiId, (prof || 0) + 1) : this._defBase(v.paiId);
        if (!pai || pai.tipo === "desenho") return null;
        var o = {}; Object.keys(pai).forEach(function (k) { o[k] = pai[k]; });
        o.id = id; o.p6base = pai.p6 || null; o.p6 = "chamada"; o.nome = v.nome; o.pai = v.paiId; o.ret = v.ret;
        return o;
      }
      if (v.tipo === "desenho") return { id: id, tipo: "desenho", p6: "desenho", nome: v.nome };
      return null;
    },
    /* extrai pelo BIM.vista2d com o V/G, a faixa (4 planos) e o forro refletido da vista */
    _p6Extrair: function (d, b) {
      var M = this._p6(); if (!M) return null;
      if (d.tipo === "desenho") {
        var v = M.estado().vistas[d.id] || {}, L = [], K = [], est = {};
        Object.keys(v.linhas2d || {}).forEach(function (k) {
          var q = v.linhas2d[k], ch = "OST_Lines|p" + q.pena;
          L.push([q.x1, q.y1, q.x2, q.y2]); K.push(ch);
          if (!est[ch]) { est[ch] = M.estiloCategoria("OST_Lines", M.vistaPadrao("desenho"), M.dados().estilos, null); est[ch].proj = q.pena; }
        });
        return { ok: true, tipo: "desenho", cortes: [], linhas: L, linhasK: K, p6Estilos: est, info: { ms: 0 } };
      }
      var def, ext = M.defExtracao(d.id);
      if (d.tipo === "planta") {
        var vv = d.p6 === "chamada" ? null : M.estado().vistas[d.id], ef = vv ? M.efetivo(vv, M.estado()) : null, f = ef && ef.faixa;
        var corte = f ? f.corte : d.altura, fundo = f ? Math.min(f.inf, f.prof) : -d.abaixo, topo = f ? f.sup : (d.topo != null ? d.topo : 2.3);
        def = (d.p6 === "forro" || d.p6base === "forro") ? { tipo: "forro", yCorte: d.nivel.y + corte, yTopo: d.nivel.y + Math.max(topo, corte + 0.1) }
                                                         : { tipo: "planta", yCorte: d.nivel.y + corte, yFundo: d.nivel.y + fundo, acimaTopo: this.acimaTopo(d, d.nivel.y + corte) };   /* ACIMA DO CORTE */
      } else {
        var c = d.corte;
        def = { tipo: "corte", ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, inv: !!c.inv, prof: c.prof > 0 ? c.prof : null };
      }
      Object.keys(ext).forEach(function (k) { def[k] = ext[k]; });
      return M.posExtracao(d.id, b.vista2d(def), d.p6 === "chamada" ? d.ret : null);
    },
    /* o que o desenho leva da P6: a chave de estilo de cada aresta e as marcas */
    _p6Anotar: function (d, dados, out) {
      var M = this._p6(); if (!M) return out;
      out.linhasK = dados.linhasK;
      var mk = this._p6Marcas(d), v = M.estado().vistas[d.id];
      if (v && dados.p6Recorte && M.efetivo(v, M.estado()).recorte.visivel) { var r = dados.p6Recorte; mk.push({ tipo: "recorte", x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }); }
      if (d.p6 === "chamada") {
        out.marcas = []; out.eixos = [];
        var R = d.ret;
        if (out.ambientes && out.ambientes.itens) out.ambientes.itens = out.ambientes.itens.filter(function (it) { return it.x >= R.x0 && it.x <= R.x1 && it.y >= R.y0 && it.y <= R.y1; });
      }
      if (mk.length) out.marcasP6 = mk;
      return out;
    },
    /* as marcas das vistas P6 que aparecem nesta vista */
    _p6Marcas: function (d) {
      var M = this._p6(), out = []; if (!M) return out;
      var est = M.estado();
      function olhar(L) { var dx = L.bx - L.ax, dz = L.bz - L.az, n = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / n, nz = -dx / n; return L.inv ? [-nx, -nz] : [nx, nz]; }
      Object.keys(est.vistas).forEach(function (k) {
        var v = est.vistas[k];
        if (d.tipo === "planta" && d.p6 !== "chamada" && v.linha) {
          if (v.tipo === "elevacao" && (!v.interior || String(v.nivelId) === String(d.nivel && d.nivel.id))) {
            var L = v.linha, cx = v.ponto ? v.ponto.x : (L.ax + L.bx) / 2, cy = v.ponto ? v.ponto.z : (L.az + L.bz) / 2;
            out.push({ tipo: "elevacao", id: k, x: cx, y: cy, dir: olhar(L), rotulo: v.numero || "" });
          }
          if (v.tipo === "corte") out.push({ tipo: "corte", id: k, letra: v.marca || "?", a: [v.linha.ax, v.linha.az], b: [v.linha.bx, v.linha.bz], olhar: olhar(v.linha) });
        }
        if (v.tipo === "chamada" && v.paiId === d.id && v.ret) out.push({ tipo: "chamada", id: k, x0: v.ret.x0, y0: v.ret.y0, x1: v.ret.x1, y1: v.ret.y1, rotulo: v.numero || "" });
      });
      return out;
    },
    _p6Depois: function (v, abrir, msg) {
      var self = this;
      Object.keys(this._cache).forEach(function (k) { var dd = self.def(k); if (dd && dd.tipo !== "desenho") self.redesenhar(k, false); });
      this._avisarMudou();
      if (abrir !== false) this.abrir(v.id);
      if (msg) { toast(msg, "ok"); status(msg); }
      return v;
    },
    /* ELEVAÇÃO da construção: a marca fica FORA do modelo olhando para ele
       (norte = para cima na planta = −z). A linha A→B dá o X da vista; a
       normal (olhar) aponta para o modelo; profundidade = o modelo inteiro. */
    linhaElevacao: function (dir, caixa) {
      var mn = caixa.min, mx = caixa.max, x0 = mn[0], x1 = mx[0], z0 = mn[2], z1 = mx[2], m = 1.0;
      var af = Math.max(2, 0.12 * Math.max(x1 - x0, z1 - z0)), lx = x1 - x0, lz = z1 - z0;
      if (dir === "sul") return { ax: x0 - m, az: z1 + af, bx: x1 + m, bz: z1 + af, inv: false, prof: lz + af + 2 };
      if (dir === "norte") return { ax: x1 + m, az: z0 - af, bx: x0 - m, bz: z0 - af, inv: false, prof: lz + af + 2 };
      if (dir === "leste") return { ax: x1 + af, az: z1 + m, bx: x1 + af, bz: z0 - m, inv: false, prof: lx + af + 2 };
      return { ax: x0 - af, az: z0 - m, bx: x0 - af, bz: z1 + m, inv: false, prof: lx + af + 2 };
    },
    criarElevacao: function (dir, opts) {
      var M = this._p6(); if (!M) return null;
      /* opts.caixa (template de início, 20/10/2026): a elevação de um projeto que ainda não tem peça olha para a
         área de trabalho do template — a marca já fica nas plantas */
      var p = (opts && opts.caixa) ? { caixa: opts.caixa } : (B() && B().pavimentos2d ? B().pavimentos2d() : null);
      if (!p || !p.caixa) { toast("Abra um modelo primeiro: a elevação é desenhada dele.", "aviso"); return null; }
      if (["norte", "sul", "leste", "oeste"].indexOf(dir) < 0) dir = "sul";
      var NOMES = { norte: "Elevação Norte", sul: "Elevação Sul", leste: "Elevação Leste", oeste: "Elevação Oeste" };
      /* EDIFICAÇÃO: as quatro faces da CASA (sem o terreno); pvAuto marca a elevação que o gerador de pranchas pode reposicionar */
      var v = M.criar("elevacao", { nome: NOMES[dir], linha: this.linhaElevacao(dir, p.caixaEdif || p.caixa), numero: { norte: "N", sul: "S", leste: "L", oeste: "O" }[dir], pvDir: dir, pvAuto: !!(opts && opts.pvAuto) });
      return this._p6Depois(v, opts && opts.abrir, (opts && opts.silencioso) ? "" : "“" + v.nome + "” criada: a marca está nas plantas e a vista em Navegador › Elevações.");
    },
    /* ELEVAÇÃO INTERIOR: o clique dentro do cômodo; olha para a parede CORTADA mais
       perto; a região de recorte vai de uma parede lateral à outra e do piso ao teto */
    criarElevacaoInterior: function (idPlanta, pt) {
      var M = this._p6(), d = this.def(idPlanta), c = this._cache[idPlanta];
      if (!M || !d || d.tipo !== "planta" || !c || !c.dados) { toast("A elevação interior é marcada numa planta aberta.", "aviso"); return null; }
      var dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]], melhor = null, dist = Infinity;
      dirs.forEach(function (q) { var t = M.raioAteCorte(c.dados.cortes, pt, q); if (t < dist) { dist = t; melhor = q; } });
      if (!melhor || !isFinite(dist)) { toast("Clique DENTRO de um cômodo fechado por paredes.", "aviso"); return null; }
      var u = [-melhor[1], melhor[0]], sB = M.raioAteCorte(c.dados.cortes, pt, u), sA = M.raioAteCorte(c.dados.cortes, pt, [-u[0], -u[1]]);
      if (!isFinite(sA) || !isFinite(sB)) { toast("Não achei as paredes dos lados: clique dentro de um cômodo fechado.", "aviso"); return null; }
      var A = [pt[0] - u[0] * sA, pt[1] - u[1] * sA], Bp = [pt[0] + u[0] * sB, pt[1] + u[1] * sB], nv = d.nivel;
      var acima = this.niveis().filter(function (n) { return n.y > nv.y + 0.5; }).map(function (n) { return n.y; }).sort(function (a, b) { return a - b; })[0];
      var topo = (acima != null ? acima : nv.y + 3.0) + 0.15;
      var n = Object.keys(M.estado().vistas).filter(function (k) { return M.estado().vistas[k].interior; }).length + 1;
      var v = M.criar("elevacao", { nome: "Elevação interior " + n, interior: true, nivelId: nv.id, ponto: { x: pt[0], z: pt[1] }, numero: String(n),
        linha: { ax: A[0], az: A[1], bx: Bp[0], bz: Bp[1], inv: false, prof: dist + 0.06 },
        recorte: { ativo: true, visivel: false, x0: 0, y0: -topo, x1: sA + sB, y1: -(nv.y - 0.15) } });
      return this._p6Depois(v, true, "“" + v.nome + "” criada, olhando para a parede a " + D2().fmtNum(dist, 2) + " m do clique.");
    },
    /* PLANTA DE FORRO REFLETIDO e PLANTA ESTRUTURAL de um nível (o modelo RA do tipo vem ligado) */
    criarPlantaP6: function (tipo, nivel) {
      var M = this._p6(); if (!M || !nivel) return null;
      var rot = tipo === "forro" ? "Planta de forro — " : tipo === "estrutural" ? "Planta estrutural — " : "Planta baixa — ";
      var v = M.criar(tipo, { nome: rot + nivel.nome, nivelId: nivel.id });
      return this._p6Depois(v, true, "“" + v.nome + "” criada com o modelo de vista RA do tipo.");
    },
    criarDesenhoP6: function () {
      var M = this._p6(); if (!M) return null;
      var v = M.criar("desenho", { nome: "Vista de desenho" });
      this._p6Depois(v, true, "“" + v.nome + "” criada. Em Propriedades: Desenhar linhas.");
      try { M.armarPick(v.id, "linha"); } catch (e) {}
      return v;
    },
    /* CHAMADA DE DETALHE: a região (coordenadas da vista-mãe) vira uma vista em escala maior */
    criarChamada: function (idPai, ret) {
      var M = this._p6(), pai = this.def(idPai); if (!M || !pai || pai.tipo === "desenho") return null;
      var n = Object.keys(M.estado().vistas).filter(function (k) { return M.estado().vistas[k].tipo === "chamada"; }).length + 1;
      var v = M.criar("chamada", { nome: "Detalhe " + n, paiId: idPai, ret: ret, numero: String(n) });
      return this._p6Depois(v, true, "“" + v.nome + "” criada (1:" + v.escala + "): a marca está em " + pai.nome + ".");
    }
  };

  global.Bim2D = Bim2D;
  if (typeof module !== "undefined" && module.exports) module.exports = Bim2D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
