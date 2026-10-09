/* =====================================================================
 * bimrender.js — RENDER FÍSICO a partir do modelo: a tela e a extração
 * (09/10/2026; prévia `?previa=modelador`)
 *
 * Vista › Apresentação › Render. O painel tem o estilo (dia, entardecer,
 * noite), a data e a hora da obra, as nuvens, a câmera (exposição, balanço
 * de branco, curva de tom, profundidade de campo), a qualidade, a lista de
 * conferência "material do modelo → material de render" (que a pessoa
 * troca) e as luminárias (liga/desliga por luminária e por circuito).
 * "Renderizar" abre o resultado numa ABA ao lado do {3D}; de lá ele é
 * baixado em PNG ou vai para uma prancha.
 *
 * O QUE O RENDER RECONHECE SOZINHO, lendo o modelo (js/rendermat.js decide):
 *   · o material de cada peça — o nome do material do IFC, o material dos
 *     sólidos da família, a camada externa do TIPO de parede (por face), o
 *     acabamento do AMBIENTE (piso, parede por face, teto) e a pintura de
 *     face (P4); sem nome, a classe IFC (janela transparente = vidro…);
 *   · as luminárias (família RA "Luminária de teto" e IfcLightFixture) com
 *     fluxo e temperatura de cor;
 *   · o sol e o céu pelo local, pelo norte da implantação, pela data e hora.
 *
 * ⚠ A CENA SAI COMO DADOS. O motor (js/bimrendermotor.js) tem outro three
 *   (r186, ver o cabeçalho dele): daqui saem só números — posições no
 *   mundo JÁ MENOS a origem, em double, antes de virar float32 (a lição da
 *   agregação: obra georreferenciada em 7 milhões de metros "nadaria").
 * ⚠ O motor só é importado quando a pessoa clica em Renderizar: quem nunca
 *   usa o render não baixa 2,6 MB de three e path tracer.
 * Ganchos para a outra frente (passe de IA e preço):
 *   BimRender.imagemAtual() → { dataUrl, largura, altura, amostras, descritivo }
 *   BimRender.descritivo()  → { dados, texto } (materiais, luzes, hora, câmera)
 * ES5 (o motor é carregado com import() dinâmico).
 * ===================================================================== */
(function (global) {
  "use strict";

  function RM() { return global.RenderMat; }
  function B() { return global.BIM; }
  function BT() { return global.BimTextura; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return txt(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(n, t) { try { return global.Icones && global.Icones.get ? global.Icones.get(n, t || 15) : ""; } catch (e) { return ""; } }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function fmt(n, c) { return (Math.round(num(n, 0) * Math.pow(10, c || 0)) / Math.pow(10, c || 0)).toLocaleString("pt-BR"); }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  var PREF_CFG = "orcapro:bim:render-cfg:", PREF_TROCAS = "orcapro:bim:render-materiais:";
  var IGNORAR_IFC = { IFCSPACE: 1, IFCOPENINGELEMENT: 1, IFCANNOTATION: 1, IFCGRID: 1, IFCVIRTUALELEMENT: 1, IFCZONE: 1 };
  var BRASILIA = { lat: -15.7939, lon: -47.8828 };

  /* ===================================================================
   * EXTRAÇÃO: as peças do modelo → grupos por material (dados puros)
   * =================================================================== */
  /* buffer que cresce (o modelo pode ter milhões de vértices) */
  function Buf(T, n) { this.T = T; this.a = new T(Math.max(n || 0, 4096)); this.n = 0; }
  Buf.prototype.reservar = function (k) { if (this.n + k <= this.a.length) return; var b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; };
  Buf.prototype.final = function () { return this.a.slice(0, this.n); };

  /* matriz normal (inversa transposta do 3×3) de uma matriz 4×4 coluna-maior */
  function matNormal(e) {
    var a = e[0], b = e[4], c = e[8], d = e[1], f = e[5], g = e[9], h = e[2], i = e[6], j = e[10];
    var A = f * j - g * i, Bb = -(d * j - g * h), C = d * i - f * h, det = a * A + b * Bb + c * C;
    if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var k = 1 / det;
    /* inversa transposta = cofatores / det, já na ordem linha-maior para multiplicar n */
    return [A * k, Bb * k, C * k, -(b * j - c * i) * k, (a * j - c * h) * k, -(a * i - b * h) * k, (b * g - c * f) * k, -(a * g - c * d) * k, (a * f - b * d) * k];
  }

  function Extrator(origem) {
    this.o = origem; this.grupos = {}; this.ordem = []; this.materiais = []; this.pecas = []; this.luzesIfc = {}; this.tri = 0; this.semUv = 0;
    /* a caixa do que entrou e a base das paredes (onde o chão automático assenta) */
    this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity]; this.yParede = Infinity; this.terreno = false;
  }
  Extrator.prototype.grupo = function (chave, params) {
    var g = this.grupos[chave];
    if (!g) { g = this.grupos[chave] = { mat: this.materiais.length, pos: new Buf(Float32Array), nor: new Buf(Float32Array), uv: new Buf(Float32Array), idx: new Buf(Uint32Array), nv: 0 }; this.materiais.push(params); this.ordem.push(chave); }
    return g;
  };
  /* uma malha (r150) → triângulos no grupo; `rota(n)` escolhe o grupo por triângulo (parede por face) */
  Extrator.prototype.malha = function (m, rota, uvProprio) {
    var geo = m.geometry, pa = geo && geo.attributes && geo.attributes.position; if (!pa) return 0;
    var na = geo.attributes.normal, ia = geo.index, uva = uvProprio ? geo.attributes.uv : null;
    var E = m.matrixWorld.elements, N = matNormal(E), o = this.o, nv = pa.count;
    var P = new Float64Array(nv * 3), Nn = new Float32Array(nv * 3), U = new Float32Array(nv * 2), T = BT(), tmp = [0, 0];
    for (var v = 0; v < nv; v++) {
      var x = pa.getX(v), y = pa.getY(v), z = pa.getZ(v);
      var px = E[0] * x + E[4] * y + E[8] * z + E[12] - o[0], py = E[1] * x + E[5] * y + E[9] * z + E[13] - o[1], pz = E[2] * x + E[6] * y + E[10] * z + E[14] - o[2];
      P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
      var nx = na ? na.getX(v) : 0, ny = na ? na.getY(v) : 1, nz = na ? na.getZ(v) : 0;
      var wx = N[0] * nx + N[1] * ny + N[2] * nz, wy = N[3] * nx + N[4] * ny + N[5] * nz, wz = N[6] * nx + N[7] * ny + N[8] * nz, l = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
      Nn[v * 3] = wx / l; Nn[v * 3 + 1] = wy / l; Nn[v * 3 + 2] = wz / l;
      if (uva) { U[v * 2] = uva.getX(v); U[v * 2 + 1] = uva.getY(v); }
      else if (T && T.uvPlanar) { T.uvPlanar(px, py, pz, wx / l, wy / l, wz / l, 1, 1, tmp, 0); U[v * 2] = tmp[0]; U[v * 2 + 1] = tmp[1]; }
      else { U[v * 2] = px; U[v * 2 + 1] = pz; this.semUv++; }
    }
    var nt = ia ? ia.count / 3 : nv / 3, nTri = 0;
    function idx(k) { return ia ? ia.getX(k) : k; }
    for (var t = 0; t < nt; t++) {
      var a = idx(t * 3), b = idx(t * 3 + 1), c = idx(t * 3 + 2);
      var g = rota(Nn, a, b, c); if (!g) continue;
      /* o vértice da malha vira UM vértice no grupo (o mapa vale enquanto a malha for a mesma) */
      if (!g.__m || g.__m !== m.uuid) { g.__m = m.uuid; g.__mapa = {}; }
      var mp = g.__mapa, vs = [a, b, c];
      for (var q = 0; q < 3; q++) {
        var vi = vs[q], ni = mp[vi];
        if (ni == null) {
          ni = mp[vi] = g.nv++;
          g.pos.reservar(3); g.nor.reservar(3); g.uv.reservar(2);
          g.pos.a[g.pos.n++] = P[vi * 3]; g.pos.a[g.pos.n++] = P[vi * 3 + 1]; g.pos.a[g.pos.n++] = P[vi * 3 + 2];
          g.nor.a[g.nor.n++] = Nn[vi * 3]; g.nor.a[g.nor.n++] = Nn[vi * 3 + 1]; g.nor.a[g.nor.n++] = Nn[vi * 3 + 2];
          g.uv.a[g.uv.n++] = U[vi * 2]; g.uv.a[g.uv.n++] = U[vi * 2 + 1];
        }
        g.idx.reservar(1); g.idx.a[g.idx.n++] = ni;
      }
      nTri++;
    }
    this.tri += nTri;
    if (nTri) for (var w = 0; w < nv; w++) for (var e3 = 0; e3 < 3; e3++) { var vv = P[w * 3 + e3]; if (vv < this.min[e3]) this.min[e3] = vv; if (vv > this.max[e3]) this.max[e3] = vv; if (e3 === 1 && this._parede && vv < this.yParede) this.yParede = vv; }
    return nTri;
  };
  Extrator.prototype.caixa = function (m) {
    var geo = m.geometry, pa = geo && geo.attributes && geo.attributes.position, E = m.matrixWorld.elements, o = this.o;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var v = 0; pa && v < pa.count; v++) {
      var x = pa.getX(v), y = pa.getY(v), z = pa.getZ(v), p = [E[0] * x + E[4] * y + E[8] * z + E[12] - o[0], E[1] * x + E[5] * y + E[9] * z + E[13] - o[1], E[2] * x + E[6] * y + E[10] * z + E[14] - o[2]];
      for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    }
    return { min: mn, max: mx };
  };
  Extrator.prototype.final = function () {
    var self = this;
    return this.ordem.map(function (k) { var g = self.grupos[k]; return { mat: g.mat, pos: g.pos.final(), nor: g.nor.final(), uv: g.uv.final(), idx: g.idx.final() }; })
      .filter(function (g) { return g.idx.length >= 3; });
  };

  var BimRender = {
    _G: null, _cfg: null, _motor: null, _modMotor: null, _ultima: null, _n: 0, _ext: null, _cena: null, _abaId: null, _prog: null,

    ativo: function () { try { return !!(global.BimPrevia && global.BimPrevia.modelador() && RM()); } catch (e) { return false; } },

    /* ---------------------------------------------------- a fita */
    registrar: function (reg, G) {
      this._G = G || this._G;
      var R = global.BimRibbon, self = this;
      if (!this.ativo() || !R || !reg) return false;
      R.acrescentar("vista", "Vista", "Apresentação", [
        { id: "render-fisico", rotulo: "Render", icone: "camera", grande: true, dica: "Render fotorrealista calculado a partir do modelo (simulação da luz): reconhece os materiais (vidro, porcelanato, madeira, pintura…), as luminárias e o sol pela data, hora e local da obra. Confira os materiais, escolha a qualidade e renderize; o resultado abre numa aba, sai em PNG e vai para a prancha." }
      ]);
      reg["render-fisico"] = function () { self.abrir(); return true; };
      return true;
    },

    /* ---------------------------------------------------- configuração por obra */
    obraKey: function () { try { return String((global.Gestao && global.Gestao._bimSel) || (B() && B().obraAtual && B().obraAtual()) || "geral"); } catch (e) { return "geral"; } },
    _ler: function (k, pad) { try { var v = JSON.parse(global.localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : pad; } catch (e) { return pad; } },
    _gravar: function (k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    cfg: function () {
      var k = PREF_CFG + this.obraKey();
      if (!this._cfg || this._cfg._k !== k) {
        var c = this._ler(k, {});
        this._cfg = {
          _k: k, estilo: RM().ESTILOS[c.estilo] ? c.estilo : "dia", data: /^\d{4}-\d{2}-\d{2}$/.test(c.data || "") ? c.data : hoje(), hora: c.hora || "",
          nuvens: num(c.nuvens, 0.15), expAuto: c.expAuto !== false, ev: num(c.ev, 12), comp: num(c.comp, 0), balanco: c.balanco == null ? "auto" : c.balanco,
          tom: c.tom === "aces" || c.tom === "neutro" ? c.tom : "agx", qualidade: RM().QUALIDADES[c.qualidade] ? c.qualidade : "padrao", resolucao: RM().RESOLUCOES[c.resolucao] ? c.resolucao : "tela",
          denoise: c.denoise !== false, chao: c.chao || "grama", vista: c.vista || "", dof: !!c.dof, fStop: num(c.fStop, 5.6), fuso: c.fuso == null ? null : num(c.fuso, -3), luzes: c.luzes && typeof c.luzes === "object" ? c.luzes : {}
        };
      }
      return this._cfg;
    },
    salvarCfg: function () { var c = this.cfg(), o = {}; Object.keys(c).forEach(function (k) { if (k !== "_k") o[k] = c[k]; }); this._gravar(c._k, o); },
    trocas: function () { return this._ler(PREF_TROCAS + this.obraKey(), {}); },
    trocar: function (chave, id) {
      var t = this.trocas();
      if (id) t[chave] = id; else delete t[chave];
      this._gravar(PREF_TROCAS + this.obraKey(), t);
      this._ext = null;   /* a cena muda: refaz na próxima vez */
    },

    /* ---------------------------------------------------- o local, o sol e o céu */
    local: function () {
      var b = B(), st = null, imp = null;
      try { st = b && b.editarEstado ? b.editarEstado() : null; imp = st && st.estado && st.estado.terreno && st.estado.terreno.implantacao; } catch (e) {}
      if (imp && isFinite(+imp.lat) && isFinite(+imp.lon) && imp.lat !== "" && imp.lon !== "" && imp.lat != null) return { lat: +imp.lat, lon: +imp.lon, norte: num(imp.anguloNorte, 0), fonte: "implantação do projeto" };
      try { var L = global.BimTerrenoUI && global.BimTerrenoUI.localObra ? global.BimTerrenoUI.localObra() : null; if (L) return { lat: +L.lat, lon: +L.lon, norte: num(L.anguloNorte, 0), fonte: "local da obra (Içamento)" }; } catch (e2) {}
      return { lat: BRASILIA.lat, lon: BRASILIA.lon, norte: 0, fonte: "PRESUMIDO (Brasília): a obra não tem local marcado", presumido: true };
    },
    fuso: function (L) { var c = this.cfg(); if (c.fuso != null) return c.fuso; return Math.max(-5, Math.min(-2, Math.round(L.lon / 15))); },
    horaEfetiva: function (L) { var c = this.cfg(); return c.hora || RM().horaDoEstilo(c.estilo, { lat: L.lat, lon: L.lon, data: c.data, fuso: this.fuso(L) }); },
    ambiente: function () {
      var c = this.cfg(), L = this.local(), R = RM(), hora = this.horaEfetiva(L), fz = this.fuso(L);
      var s = R.sol({ lat: L.lat, lon: L.lon, data: c.data, hora: hora, fuso: fz, norte: L.norte }) || { elevacao: 45, azimute: 0, direcao: [0, 0.7071, -0.7071] };
      var lux = R.iluminanciaSolar(s.elevacao, c.nuvens), cs = R.corSolar(s.elevacao);
      var ceu = R.ceu({ largura: 256, altura: 128, elevacao: s.elevacao, solDir: s.direcao, nuvens: c.nuvens });
      return { local: L, hora: hora, fuso: fz, sol: { elevacao: s.elevacao, azimute: s.azimute, direcao: s.direcao, lux: lux, cor: cs.cor, K: cs.K }, ceu: ceu };
    },

    /* ---------------------------------------------------- as peças, os materiais e as luzes do modelo */
    _estadoEditor: function () { try { var e = B().editarEstado(); return e ? e.estado : null; } catch (x) { return null; } },
    /* paredes do editor: o material de cada FACE (ambiente > camada externa do tipo > nome da malha) */
    _facesParede: function (st) {
      var o = {}, mp = this._nomesProjeto(st);
      arr(st && st.caixas).forEach(function (c) {
        if (!c || c.tipo !== "parede") return;
        var f = { fora: "", dentro: "" }, cam = c.tipoParede && arr(c.tipoParede.camadas);
        if (cam && cam.length) {
          var fo = cam.filter(function (k) { return k.face === "fora"; }), de = cam.filter(function (k) { return k.face === "dentro"; });
          if (fo.length) f.fora = txt(fo[0].material || fo[0].rotulo || fo[0].servico);
          if (de.length) f.dentro = txt(de[de.length - 1].material || de[de.length - 1].rotulo || de[de.length - 1].servico);
        }
        if (mp[c.id]) { f.fora = mp[c.id]; f.dentro = mp[c.id]; }   /* MATERIAIS: o material do projeto da parede vale nas duas faces (o acabamento do ambiente, abaixo, vai por cima) */
        o[c.id] = { fora: f.fora, dentro: f.dentro, rotY: num(c.rotY, 0), inv: !!c.inverterFaces };
      });
      arr(st && st.ambientes).forEach(function (a) {
        var ac = txt(a && a.acabParede).trim(); if (!ac || !a.calc) return;
        arr(a.calc.lados).forEach(function (l) { var fo = l && l.fonte; if (fo && fo.tipo === "parede" && o[fo.id] && (fo.face === "fora" || fo.face === "dentro")) o[fo.id][fo.face] = ac; });
      });
      return o;
    },
    /* o parâmetro Material das peças criadas aqui (forro, telhado, topossólido, sub-região… — js/bimparam.js grava `material` na peça) */
    _materiaisEditor: function (st) {
      var o = {}, mp = this._nomesProjeto(st);
      Object.keys(st || {}).forEach(function (k) { var l = st[k]; if (!arr(l).length) return; l.forEach(function (x) { if (x && x.id != null && typeof x.material === "string" && x.material.trim()) o[x.id] = x.material.trim(); }); });
      Object.keys(mp).forEach(function (id) { o[id] = mp[id]; });   /* MATERIAIS: o material do projeto da peça ganha do parâmetro Material antigo */
      return o;
    },
    /* MATERIAIS (js/bimmateriaisui.js): id da peça do editor → nome do material do projeto */
    _nomesProjeto: function (st) { try { var U = global.BimMateriaisUI; return U && U.ativo() && U.nomesDasPecas ? U.nomesDasPecas(st) : {}; } catch (e) { return {}; } },
    /* MATERIAIS: a Aparência do material do projeto com esse nome (null = segue a casagem automática) */
    _projeto: function (nome) { try { var U = global.BimMateriaisUI; return nome && U && U.ativo() && U.renderDe ? U.renderDe(nome) : null; } catch (e) { return null; } },
    /* a peça como o RenderMat a vê: nomes, classe, alfa, cor */
    _peca: function (m, mo, porId, matEd) {
      var mt = m.userData.matOrig || m.material, nomes = [], el = porId[m.userData.expressID];
      if (mo.mid === "edit" && matEd && matEd[m.userData.expressID]) nomes.push(matEd[m.userData.expressID]);
      arr(el && el.materiais).forEach(function (x) { var n = txt(x && x.n).trim(); if (n && nomes.indexOf(n) < 0) nomes.push(n); });
      var nm = mt && mt.userData && mt.userData.nomeMaterial; if (nm && nomes.indexOf(nm) < 0) nomes.push(nm);
      var rgba = mt && mt.userData && mt.userData.rgba;
      return { materiais: nomes, ifc: txt(m.userData.tipo).toUpperCase(), alfa: mt && mt.transparent ? num(mt.opacity, 1) : (rgba ? num(rgba[3], 1) : 1), cor: rgba && mo.mid !== "edit" ? [rgba[0], rgba[1], rgba[2]] : null };
    },
    /* os parâmetros do motor para (material de render, peça): textura pronta (CC0 = arquivos; rejunte = mapas) */
    _params: function (id, peca, nome) {
      /* MATERIAIS: o material DO PROJETO com este nome manda (ganha da casagem automática por nome) */
      var R = RM(), p = this._projeto(nome) || R.parametros(id, { cor: peca && peca.cor, nome: nome });
      if (!p) return null;
      p.espessuraVolume = p.id === "agua" ? p.espessura : 0;   /* vidro: lâmina fina (as duas faces já estão na geometria); água: volume */
      var tx = p.textura, T = BT();
      if (tx && tx.tipo === "cc0") {
        var b = T && T.BIB && T.BIB[tx.slug];
        if (b) { tx.arquivos = T.arquivos(tx.slug, false); tx.escala = b.m * (tx.escalaProjeto > 0 ? tx.escalaProjeto : 1); tx.asp = b.asp || 1; var mat = R.material(id); tx.tinta = p.projeto || (mat && mat.corDoModelo !== "nunca") ? T.tinta(p.corSrgb, tx.slug) : [1, 1, 1]; }   /* MATERIAIS: escala e cor do projeto */
        else p.textura = null;
      } else if (tx && tx.tipo === "rejunte") {
        var k = [tx.peca[0], tx.peca[1], tx.junta, p.corSrgb.map(function (v) { return v.toFixed(2); }).join(","), p.rugosidade].join("|");
        this._rej = this._rej || {};
        if (!this._rej[k]) this._rej[k] = R.rejunte({ peca: tx.peca, junta: tx.junta, corJunta: tx.corJunta, corPeca: p.corSrgb, rugosidade: p.rugosidade, rugJunta: tx.rugJunta, variacao: tx.variacao, tamanho: 1024 });
        tx.mapas = this._rej[k];
      }
      return p;
    },
    /* EXTRAI A CENA: grupos de geometria por material, a lista de conferência e as luzes */
    extrair: function () {
      var b = B(), F = b && b.renderFonte ? b.renderFonte() : null, R = RM(), self = this;
      if (!F || !R || !R.biblioteca()) return null;
      try { if (F.modelRoot) F.modelRoot.updateMatrixWorld(true); } catch (e) {}
      /* a origem: a da agregação (a mesma de todos os modelos da obra) ou o centro arredondado ao metro */
      var orig = F.origem ? [F.origem[0], F.origem[1], F.origem[2]] : null;
      if (!orig) { var s = [0, 0, 0], n = 0; F.modelos.forEach(function (mo) { mo.grupo.children.forEach(function (m) { if (m.isMesh) { var e = m.matrixWorld.elements; s[0] += e[12]; s[1] += e[13]; s[2] += e[14]; n++; } }); }); orig = n ? s.map(function (v) { return Math.round(v / n); }) : [0, 0, 0]; }
      var X = new Extrator(orig), tr = this.trocas(), st = this._estadoEditor(), faces = this._facesParede(st), matEd = this._materiaisEditor(st), pecasConf = [], luzes = [], luzIfc = {};
      var chaveParams = {};
      function grupoPara(id, peca, nome, extra) {
        var p = self._params(id, peca, nome); if (!p) return null;
        var k = id + "|" + R.srgbParaHex(p.corSrgb) + "|" + (p.textura && p.textura.tipo === "rejunte" ? p.textura.peca.join("x") : "") + (p.projeto ? "|proj:" + p.projeto : "") + (extra || "");   /* MATERIAIS: o do projeto é grupo próprio */
        chaveParams[k] = 1;
        return X.grupo(k, p);
      }
      function material(peca, nome) {
        var pc = { materiais: nome ? [nome] : peca.materiais, ifc: peca.ifc, alfa: peca.alfa, cor: peca.cor, n: 1 };
        var r = R.mapear(pc, tr); pecasConf.push(pc);
        return { id: r.id, nome: nome || (pc.materiais[0] || "") };
      }
      F.modelos.forEach(function (mo) {
        if (mo.visivel === false || !mo.grupo || mo.grupo.visible === false) return;
        var porId = {}; arr(mo.elementos).forEach(function (e) { porId[e.id] = e; });
        mo.grupo.children.forEach(function (m) {
          if (!m.isMesh || m.userData.expressID == null || m.visible === false || m.userData._solta || m.userData.marcador || m.userData.desconexao) return;
          var tipo = txt(m.userData.tipo).toUpperCase(); if (IGNORAR_IFC[tipo]) return;
          var mt = m.userData.matOrig || m.material;
          if (!mt || !(mt.isMeshStandardMaterial || mt.isMeshPhysicalMaterial || mt.isMeshLambertMaterial || mt.isMeshPhongMaterial)) return;
          var peca = self._peca(m, mo, porId, matEd);
          /* luminária de IFC (de outro programa): vira luz pela caixa da peça */
          if (tipo === "IFCLIGHTFIXTURE" && mo.mid !== "edit") {
            var uid = mo.mid + ":" + m.userData.expressID, cx = X.caixa(m), L0 = luzIfc[uid];
            if (!L0) luzIfc[uid] = { min: cx.min, max: cx.max, nome: (porId[m.userData.expressID] || {}).nome || "Luminária (IFC)", uid: uid };
            else for (var k = 0; k < 3; k++) { L0.min[k] = Math.min(L0.min[k], cx.min[k]); L0.max[k] = Math.max(L0.max[k], cx.max[k]); }
          }
          /* objeto importado com textura própria (glTF da Poly Haven…): fica com a aparência dele */
          if (mt.map && mt.map.image && m.geometry.attributes.uv && !(mt.userData && mt.userData.tex)) {
            var kp = "proprio:" + mt.uuid;
            if (!X.grupos[kp]) X.grupo(kp, { id: "proprio", nome: "Material do objeto importado", cor: [mt.color.r, mt.color.g, mt.color.b], corSrgb: [1, 1, 1], rugosidade: num(mt.roughness, 0.6), metalicidade: num(mt.metalness, 0), ior: 1.5, transmissao: 0, espessura: 0, clearcoat: 0, clearcoatRugosidade: 0, sheen: 0, sheenRugosidade: 0.5, relevo: 0, textura: { tipo: "imagem", imagem: mt.map.image, repeat: [mt.map.repeat.x, mt.map.repeat.y], offset: [mt.map.offset.x, mt.map.offset.y] } });
            pecasConf.push({ materiais: ["Material do objeto importado"], ifc: tipo, alfa: 1, n: 1, proprio: true });
            X.malha(m, function () { return X.grupos[kp]; }, true);
            return;
          }
          X._parede = tipo === "IFCWALL" || tipo === "IFCWALLSTANDARDCASE";
          if (tipo === "IFCGEOGRAPHICELEMENT" || tipo === "IFCSITE") X.terreno = true;
          var fp = mo.mid === "edit" ? faces[m.userData.expressID] : null;
          if (fp && (fp.fora || fp.dentro)) {
            /* parede do editor: a face de DENTRO é +z local (−z se as faces estão invertidas); topo e pontas ficam com a de fora */
            var zx = Math.sin(fp.rotY), zz = Math.cos(fp.rotY), sgn = fp.inv ? -1 : 1;
            var mf = material(peca, fp.fora || peca.materiais[0]), md = material(peca, fp.dentro || peca.materiais[0]);
            var gf = grupoPara(mf.id, peca, mf.nome), gd = grupoPara(md.id, peca, md.nome);
            X.malha(m, function (Nn, a) { var d = (Nn[a * 3] * zx + Nn[a * 3 + 2] * zz) * sgn; return d > 0.5 ? gd : gf; });
            return;
          }
          var mm = material(peca, null), g = grupoPara(mm.id, peca, mm.nome);
          if (g) X.malha(m, function () { return g; });
        });
      });
      /* pintura de face (P4): a película 3 mm fora da face, com o material pintado */
      try {
        F.scene.traverse(function (o) {
          if (!o.isMesh || !o.userData || o.userData.p4Pintura == null || o.visible === false) return;
          var c = arr(st && st.caixas).filter(function (x) { return x.id === o.userData.p4Pintura; })[0], pt = c && c.pinturas && c.pinturas[o.userData.face + "|" + o.userData.regiao];
          var nome = txt(pt && pt.material) || "Pintura acrílica", peca = { materiais: [nome], ifc: "IFCCOVERING", alfa: 1, cor: null };
          var mp = material(peca, nome), gp = grupoPara(mp.id, peca, nome);
          if (gp) X.malha(o, function () { return gp; });
        });
      } catch (eP) {}
      /* acabamento do ambiente: piso e teto como uma película no contorno (a parede vai por face, acima) */
      arr(st && st.ambientes).forEach(function (a) {
        var c = a && a.calc; if (!c || !arr(c.contorno).length) return;
        [["acabPiso", c.base + 0.003, 1], ["acabForro", c.topo - 0.003, -1]].forEach(function (f) {
          var nome = txt(a[f[0]]).trim(); if (!nome) return;
          var peca = { materiais: [nome], ifc: "IFCCOVERING", alfa: 1, cor: null }, ma = material(peca, nome), ga = grupoPara(ma.id, peca, nome);
          if (ga) self._pelicula(X, ga, c.contorno, c.furos, f[1], f[2]);
        });
      });
      /* as luminárias das famílias RA (com fluxo e temperatura de cor) */
      arr(st && st.familias).forEach(function (fi) {
        var cat = b.familiaCategoria ? b.familiaCategoria(fi.famId) : null; if (cat !== "luminaria") return;
        var av = b.familiaAvaliar ? b.familiaAvaliar(fi.famId, fi.tipoId, fi.inst) : null; if (!av || !av.valores) return;
        var fam = global.FamiliasRA && global.FamiliasRA.obter ? global.FamiliasRA.obter(fi.famId, true) : null;
        var l = R.luzDaLuminaria(av.valores, { x: fi.x - orig[0], y: fi.y - orig[1], z: fi.z - orig[2], rotY: fi.rotY }, { id: "edit:" + fi.id, nome: (fam ? fam.nome : "Luminária") + (av.tipo ? " — " + av.tipo.nome : "") + " (" + fi.id + ")" });
        luzes.push(l);
      });
      /* o CHÃO AO REDOR (automático): sem terreno modelado, o prédio ficava solto no horizonte do céu, sem sombra no chão */
      var cfgC = this.cfg();
      X._parede = false;
      if (cfgC.chao !== "nenhum" && !X.terreno && isFinite(X.min[0])) {
        var idC = R.material(cfgC.chao) ? cfgC.chao : "grama", yC = (isFinite(X.yParede) ? X.yParede : X.min[1]) - 0.004;
        var meio = [(X.min[0] + X.max[0]) / 2, (X.min[2] + X.max[2]) / 2], raio = Math.max(40, 5 * Math.max(X.max[0] - X.min[0], X.max[2] - X.min[2]));
        var pc = { materiais: [], ifc: "", alfa: 1, cor: null }, gC = grupoPara(idC, pc, "", "|chao");
        if (gC) self._pelicula(X, gC, [{ x: meio[0] - raio + orig[0], z: meio[1] - raio + orig[2] }, { x: meio[0] + raio + orig[0], z: meio[1] - raio + orig[2] }, { x: meio[0] + raio + orig[0], z: meio[1] + raio + orig[2] }, { x: meio[0] - raio + orig[0], z: meio[1] + raio + orig[2] }], [], yC + orig[1], 1);
        X.chao = { id: idC, y: yC + orig[1], raio: raio };
      }
      Object.keys(luzIfc).forEach(function (u) {
        var L0 = luzIfc[u], props = [];
        try { arr(b.propriedades(u)).forEach(function (g) { arr(g && g.props).forEach(function (p) { props.push(p); }); }); } catch (eQ) {}
        luzes.push(R.luzDeCaixa(L0, props, { id: u, nome: L0.nome }));
      });
      var conf = R.conferencia(pecasConf.filter(function (p) { return !p.proprio; }), tr);
      var nProprio = pecasConf.filter(function (p) { return p.proprio; }).length;
      if (nProprio) conf.push({ chave: "proprio", modelo: "Objetos importados com textura própria", id: "proprio", nome: "A aparência do próprio objeto", fonte: "proprio", termo: "", casou: true, pecas: nProprio, fixo: true });
      /* MATERIAIS: a linha cujo material é DO PROJETO diz isso (a Aparência dele é a que vale; a troca da conferência não se aplica) */
      conf.forEach(function (l) { var pj = l.chave && l.chave.indexOf("m:") === 0 ? self._projeto(l.modelo) : null; if (pj) { l.fonte = "projeto"; l.casou = true; l.nome = "Material do projeto: " + pj.nome; l.projeto = pj.projeto; l.fixo = true; } });
      var cam = F.camera, alvo = F.alvo;
      var camera = { tipo: "perspectiva", pos: [cam.position.x - orig[0], cam.position.y - orig[1], cam.position.z - orig[2]], quat: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
                     fov: cam.fov || 50, near: cam.near, far: cam.far, aspecto: cam.aspect, alvo: alvo ? [alvo.x - orig[0], alvo.y - orig[1], alvo.z - orig[2]] : null };
      this._ext = { origem: orig, grupos: X.final(), materiais: X.materiais, luzes: luzes, conferencia: conf, camera: camera, triangulos: X.tri, chao: X.chao || null };
      return this._ext;
    },
    /* polígono (contorno do ambiente, com furos) numa altura, virado para cima (1) ou para baixo (−1) */
    _pelicula: function (X, g, contorno, furos, y, lado) {
      var C = arr(contorno).map(function (p) { return [num(p.x, 0), num(p.z, 0)]; });
      if (C.length < 3) return;
      var tri = this._triangular(C, arr(furos).map(function (F) { return arr(F).map(function (p) { return [num(p.x, 0), num(p.z, 0)]; }); }));
      if (!tri) return;
      var o = X.o, T = BT(), tmp = [0, 0], base = g.nv, pts = tri.pts;
      pts.forEach(function (p) {
        var px = p[0] - o[0], py = y - o[1], pz = p[1] - o[2];
        g.pos.reservar(3); g.nor.reservar(3); g.uv.reservar(2);
        g.pos.a[g.pos.n++] = px; g.pos.a[g.pos.n++] = py; g.pos.a[g.pos.n++] = pz;
        g.nor.a[g.nor.n++] = 0; g.nor.a[g.nor.n++] = lado; g.nor.a[g.nor.n++] = 0;
        if (T && T.uvPlanar) { T.uvPlanar(px, py, pz, 0, lado, 0, 1, 1, tmp, 0); g.uv.a[g.uv.n++] = tmp[0]; g.uv.a[g.uv.n++] = tmp[1]; } else { g.uv.a[g.uv.n++] = px; g.uv.a[g.uv.n++] = pz; }
        g.nv++;
      });
      tri.idx.forEach(function (i) { g.idx.reservar(1); g.idx.a[g.idx.n++] = base + i; });
      X.tri += tri.idx.length / 3;
    },
    /* triangulação por orelhas (contorno + furos ligados por ponte) — basta para o contorno de um cômodo */
    _triangular: function (C, furos) {
      function area(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
      var P = C.slice(); if (area(P) < 0) P.reverse();
      arr(furos).forEach(function (F) {
        if (F.length < 3) return; var H = F.slice(); if (area(H) > 0) H.reverse();
        /* ponte: o vértice do furo mais à direita ao vértice do contorno mais próximo */
        var hi = 0; H.forEach(function (p, i) { if (p[0] > H[hi][0]) hi = i; });
        var hp = H[hi], ci = 0, dm = Infinity; P.forEach(function (p, i) { var d = (p[0] - hp[0]) * (p[0] - hp[0]) + (p[1] - hp[1]) * (p[1] - hp[1]); if (d < dm) { dm = d; ci = i; } });
        var anel = H.slice(hi).concat(H.slice(0, hi + 1));
        P = P.slice(0, ci + 1).concat(anel, [P[ci]], P.slice(ci + 1));
      });
      var n = P.length, idx = [], V = []; for (var i = 0; i < n; i++) V.push(i);
      function cruz(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
      function dentro(p, a, b, c) { return cruz(a, b, p) >= -1e-12 && cruz(b, c, p) >= -1e-12 && cruz(c, a, p) >= -1e-12; }
      var guarda = 0;
      while (V.length > 3 && guarda++ < 20000) {
        var achou = false;
        for (var k = 0; k < V.length; k++) {
          var ia = V[(k + V.length - 1) % V.length], ib = V[k], ic2 = V[(k + 1) % V.length], a = P[ia], bb = P[ib], c = P[ic2];
          if (cruz(a, bb, c) <= 1e-12) continue;
          var ok = true;
          for (var q = 0; q < V.length && ok; q++) { var iq = V[q]; if (iq === ia || iq === ib || iq === ic2) continue; var pq = P[iq]; if ((pq[0] === a[0] && pq[1] === a[1]) || (pq[0] === bb[0] && pq[1] === bb[1]) || (pq[0] === c[0] && pq[1] === c[1])) continue; if (dentro(pq, a, bb, c)) ok = false; }
          if (!ok) continue;
          idx.push(ia, ib, ic2); V.splice(k, 1); achou = true; break;
        }
        if (!achou) break;
      }
      if (V.length === 3) idx.push(V[0], V[1], V[2]);
      /* a normal para cima é anti-horária vista de cima em (x, z) com y para cima: (x, z) anti-horário = horário em (x, −z) — inverte */
      for (var t = 0; t < idx.length; t += 3) { var s2 = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s2; }
      return idx.length ? { pts: P, idx: idx } : null;
    },

    /* ---------------------------------------------------- o painel */
    abrir: function () {
      var self = this, G = this._G || global.Gestao;
      if (G && G._bimAbrirPainel) G._bimAbrirPainel("render");
      var corpo = document.getElementById("bim-render-corpo");
      if (corpo) corpo.innerHTML = '<p class="muted" style="font-size:12.5px">Lendo os materiais e as luzes do modelo…</p>';
      return RM().carregar().then(function () {
        var e = self.extrair();
        if (!e || !e.grupos.length) { if (corpo) corpo.innerHTML = '<p class="muted" style="font-size:12.5px">Não há o que renderizar: abra ou modele algo primeiro.</p>'; return false; }
        self.renderPainel(); self.aquecer(); return true;
      }, function (err) {
        if (corpo) corpo.innerHTML = '<p style="color:#b91c1c;font-size:12.5px">' + ic("alerta") + " A biblioteca de materiais do render não carregou: " + esc(err && err.message || err) + "</p>";
        return false;
      });
    },
    renderPainel: function () {
      var corpo = document.getElementById("bim-render-corpo"); if (!corpo) return;
      var self = this, c = this.cfg(), R = RM(), e = this._ext || this.extrair(), am = this.ambiente(), L = am.local;
      var ap = this._aparelho(), plano = R.planoQualidade(c.qualidade, c.resolucao, ap);
      var h = '<div data-render="painel" style="font-size:12.5px;display:flex;flex-direction:column;gap:10px">';
      h += '<p class="muted" style="margin:0;font-size:11.5px">Render calculado pela simulação da luz (path tracing) a partir do modelo: os materiais, as luminárias e o sol da data e hora da obra. Quanto mais amostras, menos granulado.</p>';
      /* estilo */
      h += '<fieldset style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:0"><legend><b>' + ic("sol") + ' Luz do dia</b></legend><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">';
      Object.keys(R.ESTILOS).forEach(function (k) { h += '<button type="button" class="btn sm' + (c.estilo === k ? " primary" : "") + '" data-rd-estilo="' + k + '">' + esc(R.ESTILOS[k].nome) + "</button>"; });
      h += '</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label>Data<br><input type="date" data-rd="data" value="' + esc(c.data) + '"></label><label>Hora<br><input type="time" data-rd="hora" value="' + esc(am.hora) + '" style="width:92px"></label>' +
        '<label>Fuso (UTC)<br><input type="number" data-rd="fuso" value="' + am.fuso + '" min="-5" max="-2" step="1" style="width:56px"></label>' +
        '<label style="flex:1;min-width:140px">Nuvens: <span data-rd-txt="nuvens">' + Math.round(c.nuvens * 100) + '%</span><br><input type="range" data-rd="nuvens" min="0" max="100" value="' + Math.round(c.nuvens * 100) + '" style="width:100%"></label></div>';
      h += '<div data-rd="sol" style="margin-top:4px;font-size:11.5px">Sol a <b>' + fmt(am.sol.elevacao, 1) + "°</b> de elevação, azimute " + fmt(am.sol.azimute, 0) + "° (" + (am.sol.lux > 0 ? fmt(am.sol.lux / 1000, 0) + " mil lux direto" : "abaixo do horizonte") + ") · " +
        (L.presumido ? '<span style="color:#b45309">' + ic("alerta", 13) + " " + esc(L.fonte) + " — marque o local em Massa e terreno › Implantação</span>" : esc(L.fonte) + " (" + fmt(L.lat, 4) + ", " + fmt(L.lon, 4) + "; norte " + fmt(L.norte, 1) + "°)") + "</div>" +
        '<div style="margin-top:4px"><label>Chão ao redor <select data-rd="chao">' + [["grama", "Grama"], ["terra", "Terra"], ["piso_intertravado", "Piso intertravado"], ["asfalto", "Asfalto"], ["concreto_estrutural", "Concreto"], ["nenhum", "Nenhum (o modelo já tem terreno)"]].map(function (o) { return '<option value="' + o[0] + '"' + (c.chao === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '</select></label>' + (e.chao ? ' <span class="muted" style="font-size:11px">na base das paredes, ' + Math.round(e.chao.raio) + " m em volta</span>" : "") + "</div>" + "</fieldset>";
      /* câmera */
      h += '<fieldset style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:0"><legend><b>' + ic("camera") + ' Câmera</b></legend><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">' +
        '<label><input type="checkbox" data-rd="expAuto"' + (c.expAuto ? " checked" : "") + "> Exposição automática</label>" +
        '<label>' + (c.expAuto ? "Compensação (EV)" : "EV100") + '<br><input type="number" step="0.5" data-rd="' + (c.expAuto ? "comp" : "ev") + '" value="' + (c.expAuto ? c.comp : c.ev) + '" style="width:64px"></label>' +
        '<label>Balanço de branco<br><select data-rd="balanco">' + [["auto", "Automático (pelo estilo)"], ["6500", "6500 K (luz do dia)"], ["5000", "5000 K"], ["4000", "4000 K"], ["3000", "3000 K (luz quente)"]].map(function (o) { return '<option value="' + o[0] + '"' + (String(c.balanco) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
        '<label>Curva de tom<br><select data-rd="tom">' + [["agx", "AgX (natural)"], ["aces", "ACES (contraste)"], ["neutro", "Neutra (cor fiel)"]].map(function (o) { return '<option value="' + o[0] + '"' + (c.tom === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
        '<label><input type="checkbox" data-rd="dof"' + (c.dof ? " checked" : "") + '> Profundidade de campo (f/<input type="number" data-rd="fStop" value="' + c.fStop + '" step="0.1" min="1" max="22" style="width:46px">, foco no centro da órbita)</label></div>' +
        '<div style="margin-top:4px"><label>Câmera <select data-rd="vista"><option value="">a vista 3D atual</option>' + this._vistas().map(function (v) { return '<option value="' + esc(v.id) + '"' + (c.vista === v.id ? " selected" : "") + ">Ponto de vista: " + esc(v.nome || v.id) + "</option>"; }).join("") + "</select></label></div></fieldset>";
      /* qualidade */
      h += '<fieldset style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:0"><legend><b>' + ic("estrela") + ' Qualidade</b></legend><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">' +
        '<label>Qualidade<br><select data-rd="qualidade">' + Object.keys(R.QUALIDADES).map(function (k) { var q = R.QUALIDADES[k]; return '<option value="' + k + '"' + (c.qualidade === k ? " selected" : "") + ">" + esc(q.nome) + " — " + q.amostras + " amostras</option>"; }).join("") + "</select></label>" +
        '<label>Resolução<br><select data-rd="resolucao">' + Object.keys(R.RESOLUCOES).map(function (k) { return '<option value="' + k + '"' + (c.resolucao === k ? " selected" : "") + ">" + esc(R.RESOLUCOES[k].nome) + "</option>"; }).join("") + "</select></label>" +
        '<label><input type="checkbox" data-rd="denoise"' + (c.denoise ? " checked" : "") + "> Reduzir ruído</label></div>" +
        '<div style="font-size:11.5px;margin-top:4px">' + plano.w + " × " + plano.h + " px, " + plano.amostras + " amostras, " + plano.quiques + " quiques de luz." + (plano.aviso ? ' <span style="color:#b45309">' + esc(plano.aviso) + "</span>" : "") + "</div></fieldset>";
      /* materiais */
      var lista = R.lista(), naoCasou = e.conferencia.filter(function (l) { return !l.casou; }).length;
      h += '<fieldset style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:0"><legend><b>' + ic("paleta") + " Materiais (" + e.conferencia.length + ")</b></legend>" +
        (naoCasou ? '<div style="color:#b45309;margin-bottom:4px">' + ic("alerta", 13) + " " + naoCasou + " material(is) do modelo não casaram com a biblioteca: ficam como pintura fosca na cor do modelo. Escolha o material certo.</div>" : '<div class="muted" style="margin-bottom:4px;font-size:11.5px">Todos os materiais do modelo casaram. Troque o que não estiver certo — a troca fica gravada nesta obra.</div>') +
        '<table class="tbl" data-render="materiais" style="font-size:12px;width:100%"><thead><tr><th>No modelo</th><th>No render</th><th>Peças</th></tr></thead><tbody>';
      e.conferencia.forEach(function (l) {
        var como = l.fonte === "troca" ? "trocado por você" : (l.fonte === "nome" ? "pelo nome (“" + l.termo + "”)" : (l.fonte === "classe" ? "pela classe " + l.termo : (l.fonte === "transparencia" ? "peça transparente" : (l.fonte === "proprio" ? "textura do objeto" : (l.fonte === "projeto" ? "Materiais do projeto (Gerenciar)" : "não casou")))));
        h += '<tr data-rd-linha="' + esc(l.chave) + '"' + (l.casou ? "" : ' data-rd-naocasou="1" style="background:rgba(245,158,11,.12)"') + "><td>" + esc(l.modelo) + '<div class="muted" style="font-size:10.5px">' + esc(como) + "</div></td><td>" +
          (l.fixo ? esc(l.nome) : '<select data-rd-troca="' + esc(l.chave) + '" style="max-width:190px">' + lista.map(function (m) { return '<option value="' + m.id + '"' + (m.id === l.id ? " selected" : "") + ">" + esc(m.nome) + "</option>"; }).join("") + '<option value="">— automático —</option></select>') +
          "</td><td>" + l.pecas + "</td></tr>";
      });
      h += "</tbody></table></fieldset>";
      /* luzes */
      h += '<fieldset style="border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:6px 8px;margin:0"><legend><b>' + ic("lampada") + " Luminárias (" + e.luzes.length + ")</b></legend>";
      if (!e.luzes.length) h += '<div class="muted" style="font-size:11.5px">Nenhuma luminária no modelo. Coloque em Instalações › Luminária (o fluxo e a temperatura de cor ficam nos parâmetros do tipo).</div>';
      else {
        var circ = {}; e.luzes.forEach(function (l) { if (l.circuito) circ[l.circuito] = 1; });
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px"><button type="button" class="btn sm" data-rd-luzes="1">Ligar todas</button><button type="button" class="btn sm" data-rd-luzes="0">Desligar todas</button>' +
          Object.keys(circ).map(function (k) { return '<button type="button" class="btn sm" data-rd-circ="' + esc(k) + '">Circuito ' + esc(k) + "</button>"; }).join("") + "</div>";
        h += '<table class="tbl" data-render="luzes" style="font-size:12px;width:100%"><tbody>';
        e.luzes.forEach(function (l) {
          var lig = self.luzLigada(l.id);
          h += '<tr><td><label><input type="checkbox" data-rd-luz="' + esc(l.id) + '"' + (lig ? " checked" : "") + "> " + esc(l.nome) + "</label></td><td>" + fmt(l.fluxo, 0) + " lm" + (l.origemFluxo !== "família" ? '<span class="muted" title="' + esc(l.origemFluxo) + '">*</span>' : "") + "</td><td>" + l.K + " K</td><td>" + esc(l.tipo) + "</td></tr>";
        });
        h += "</tbody></table>";
      }
      h += "</fieldset>";
      /* ação */
      h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn primary" data-rd-acao="renderizar">' + ic("camera") + " Renderizar</button>" +
        '<button type="button" class="btn" data-rd-acao="parar">' + ic("fechar") + " Parar</button></div>" +
        '<div data-render="progresso" style="font-size:12px"></div></div>';
      corpo.innerHTML = h;
      this._ligarPainel(corpo);
      this._pintarProgresso();
    },
    _vistas: function () { try { var G = this._G || global.Gestao; return G && G._bimVistaDaObra ? G._bimVistaDaObra().filter(function (v) { return v && v.id && v.camera; }) : []; } catch (e) { return []; } },
    /* o ponto de vista escolhido vai para a câmera do 3D antes de ler a cena (a câmera voa: espera ela parar) */
    _aplicarVista: function () {
      var c = this.cfg(), b = B(); if (!c.vista || !b || !b.aplicarVista) return Promise.resolve(false);
      var v = this._vistas().filter(function (x) { return x.id === c.vista; })[0]; if (!v) return Promise.resolve(false);
      try { b.aplicarVista(v); } catch (e) { return Promise.resolve(false); }
      return new Promise(function (ok) { setTimeout(function () { ok(true); }, 600); });
    },
    luzLigada: function (id) { var m = this.cfg().luzes; return !Object.prototype.hasOwnProperty.call(m, id) || !!m[id]; },
    _aparelho: function () {
      var a = { memoria: 0, toque: false, telaMax: 0, telaW: 1280, telaH: 720 };
      try { a.memoria = +navigator.deviceMemory || 0; } catch (e) {}
      try { a.toque = !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches); } catch (e) {}
      try { a.telaMax = Math.max(screen.width || 0, screen.height || 0); } catch (e) {}
      var r = B() && B().canvasRect ? B().canvasRect() : null;
      if (r && r.width > 10) { a.telaW = Math.round(r.width); a.telaH = Math.round(r.height); }
      a.fraco = BT() && BT().aparelhoFraco ? BT().aparelhoFraco(a) : false;
      return a;
    },
    _ligarPainel: function (corpo) {
      var self = this, c = this.cfg();
      function mudou(k, v, refazer) { c[k] = v; self.salvarCfg(); if (refazer) self.renderPainel(); }
      [].forEach.call(corpo.querySelectorAll("[data-rd-estilo]"), function (b) { b.onclick = function () { c.estilo = b.getAttribute("data-rd-estilo"); c.hora = ""; mudou("estilo", c.estilo, true); }; });
      [].forEach.call(corpo.querySelectorAll("[data-rd]"), function (inp) {
        var k = inp.getAttribute("data-rd"); if (k === "sol") return;
        inp.onchange = function () {
          var v = inp.type === "checkbox" ? inp.checked : inp.value;
          if (k === "nuvens") v = num(v, 15) / 100;
          if (k === "ev" || k === "comp" || k === "fStop") v = num(v, 0);
          if (k === "fuso") v = Math.max(-5, Math.min(-2, Math.round(num(v, -3))));
          if (k === "chao") { c.chao = v; self.salvarCfg(); self.extrair(); }
          mudou(k, v, k !== "comp" && k !== "ev" && k !== "tom" && k !== "denoise");
          var mo = self._motor;
          if (mo && (k === "comp" || k === "ev")) mo.definirExposicao(c.expAuto ? null : c.ev, c.expAuto ? c.comp : 0);
          if (mo && k === "tom") mo.definirTom(c.tom);
          if (mo && k === "denoise") mo.definirDenoise(c.denoise);
        };
        if (k === "nuvens") inp.oninput = function () { var s = corpo.querySelector('[data-rd-txt="nuvens"]'); if (s) s.textContent = inp.value + "%"; };
      });
      [].forEach.call(corpo.querySelectorAll("[data-rd-troca]"), function (s) { s.onchange = function () { self.trocar(s.getAttribute("data-rd-troca"), s.value); self.extrair(); self.renderPainel(); }; });
      [].forEach.call(corpo.querySelectorAll("[data-rd-luz]"), function (cb) { cb.onchange = function () { var m = {}; m[cb.getAttribute("data-rd-luz")] = cb.checked; self.luzes(m); }; });
      [].forEach.call(corpo.querySelectorAll("[data-rd-luzes]"), function (b) { b.onclick = function () { var on = b.getAttribute("data-rd-luzes") === "1", m = {}; (self._ext ? self._ext.luzes : []).forEach(function (l) { m[l.id] = on; }); self.luzes(m); self.renderPainel(); }; });
      [].forEach.call(corpo.querySelectorAll("[data-rd-circ]"), function (b) { b.onclick = function () { var k = b.getAttribute("data-rd-circ"), ls = (self._ext ? self._ext.luzes : []).filter(function (l) { return l.circuito === k; }), on = !ls.every(function (l) { return self.luzLigada(l.id); }), m = {}; ls.forEach(function (l) { m[l.id] = on; }); self.luzes(m); self.renderPainel(); }; });
      var br = corpo.querySelector('[data-rd-acao="renderizar"]'); if (br) br.onclick = function () { self.renderizar(); };
      var bp = corpo.querySelector('[data-rd-acao="parar"]'); if (bp) bp.onclick = function () { self.parar(); };
    },
    /* liga/desliga luminárias: grava na obra e, com um render na tela, recomeça só o acúmulo */
    luzes: function (mapa) {
      var c = this.cfg(); Object.keys(mapa || {}).forEach(function (k) { c.luzes[k] = !!mapa[k]; }); this.salvarCfg();
      if (this._motor && this._motor.luzesLigadas) { this._motor.luzesLigadas(mapa); this._motor.continuar(0); }
      return true;
    },

    /* ---------------------------------------------------- RENDERIZAR */
    _carregarMotor: function () {
      if (this._modMotor) return Promise.resolve(this._modMotor);
      var self = this, url;
      try { url = new URL("js/bimrendermotor.js", document.baseURI).href; } catch (e) { url = "js/bimrendermotor.js"; }
      return import(url).then(function (m) { self._modMotor = m; return m; });
    },
    /* a aba do resultado (ao lado do {3D}); sem a casca das vistas, um quadro por cima */
    _aba: function () {
      var G = this._G || global.Gestao, id = "render-" + (++this._n), nome = "Render " + this._n, tela = null;
      if (G && G._bimVxCriarTela && G._bimVxEst && G._bimVxAtivar) {
        tela = G._bimVxCriarTela(id, nome);
        if (tela) { tela.classList.add("bim-tela-render"); G._bimVxEst().lista.push({ id: id, nome: nome, janela: null, tipo: "render" }); G._bimVxAtivar(id); }
      }
      if (!tela) {
        tela = document.createElement("div");
        tela.style.cssText = "position:fixed;inset:6vh 6vw;z-index:9000;background:#111;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.5)";
        document.body.appendChild(tela);
      }
      tela.style.position = tela.style.position || "relative";
      tela.innerHTML = '<div data-render="barra" style="position:absolute;left:8px;top:8px;right:8px;z-index:3;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px">' +
        '<button type="button" class="btn sm" data-rda="png">' + ic("baixar") + ' PNG</button><button type="button" class="btn sm" data-rda="prancha">' + ic("prancha") + ' Para a prancha</button>' +
        '<button type="button" class="btn sm" data-rda="parar">' + ic("fechar") + ' Parar</button><button type="button" class="btn sm" data-rda="mais">+ amostras</button>' +
        '<span data-render="estado" style="background:rgba(0,0,0,.6);color:#fff;border-radius:6px;padding:3px 8px"></span></div>' +
        '<div data-render="palco" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1b1d20;overflow:hidden"><canvas data-render="canvas" style="max-width:100%;max-height:100%;object-fit:contain"></canvas></div>';
      var self = this;
      tela.querySelector('[data-rda="png"]').onclick = function () { self.baixarPNG(); };
      tela.querySelector('[data-rda="prancha"]').onclick = function () { self.paraPrancha(); };
      tela.querySelector('[data-rda="parar"]').onclick = function () { self.parar(); };
      tela.querySelector('[data-rda="mais"]').onclick = function () { if (self._motor) self._motor.continuar(Math.max(64, Math.round(self._motor.alvo / 2))); };
      this._abaId = id; this._tela = tela;
      return tela;
    },
    /* o render anterior fica na aba dele como IMAGEM (o motor é um só: o canvas vai para a aba nova) */
    _congelarAnterior: function () {
      var t = this._tela, m = this._motor; if (!t || !m || !t.isConnected) return;
      try {
        var img = document.createElement("img"); img.src = m.imagem(); img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain";
        var cv = t.querySelector('[data-render="canvas"]'); if (cv && cv.parentNode) cv.parentNode.replaceChild(img, cv);
        var est = t.querySelector('[data-render="estado"]'); if (est) est.textContent = "Concluído — " + Math.floor(m.pt.samples) + " amostras";
        ["parar", "mais"].forEach(function (k) { var b = t.querySelector('[data-rda="' + k + '"]'); if (b) b.style.display = "none"; });
      } catch (e) {}
    },
    plano: function () {
      var c = this.cfg(), R = RM(), e = this._ext, ap = this._aparelho(), p = R.planoQualidade(c.qualidade, c.resolucao, ap);
      var am = this._amb || this.ambiente(), K = c.balanco === "auto" ? R.ESTILOS[c.estilo].balanco : num(c.balanco, 6500), M = R.balancoBranco(K);
      var cam = JSON.parse(JSON.stringify(e.camera));
      if (c.dof && cam.alvo) { var d = Math.sqrt(Math.pow(cam.alvo[0] - cam.pos[0], 2) + Math.pow(cam.alvo[1] - cam.pos[1], 2) + Math.pow(cam.alvo[2] - cam.pos[2], 2)); cam.dof = { ligado: true, distancia: d, fStop: c.fStop }; }
      return { amostras: p.amostras, quiques: p.quiques, w: p.w, h: p.h, tom: c.tom, ev: c.expAuto ? null : c.ev, comp: c.expAuto ? c.comp : 0, wb: [M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2], M[2][0], M[2][1], M[2][2]],
               denoise: c.denoise, camera: cam, qualidade: p.qualidade, aviso: p.aviso, balancoK: K, reduzido: !!p.reduzido, resolucao: p.resolucao };
    },
    /* a cena do motor a partir da extração e do céu/sol do momento */
    _cenaDe: function (e, am) {
      var self = this;
      return { grupos: e.grupos, materiais: e.materiais, luzes: e.luzes.map(function (l) { var x = JSON.parse(JSON.stringify(l)); x.ligada = self.luzLigada(l.id); return x; }),
               sol: am.sol.lux > 0 ? { direcao: am.sol.direcao, lux: am.sol.lux, cor: am.sol.cor } : null, ceu: { largura: am.ceu.largura, altura: am.ceu.altura, dados: am.ceu.dados } };
    },
    /* começa a compilar o motor ao abrir o painel (só no computador: no celular não gasta bateria à toa) */
    aquecer: function () {
      var self = this;
      if (this._aquecendo || this._motor || !this._ext || this._aparelho().fraco) return Promise.resolve(false);
      this._aquecendo = true;
      return this._carregarMotor().then(function (Mod) {
        if (!Mod.suportado().ok || self._motor) return false;
        var cv = document.createElement("canvas"); cv.setAttribute("data-render", "canvas"); cv.style.cssText = "max-width:100%;max-height:100%;object-fit:contain";
        self._motor = new Mod.MotorRender(cv);
        self._amb = self.ambiente();
        return self._motor.preparar(self._cenaDe(self._ext, self._amb)).then(function () { if (!self._motor.ativo && !self._renderPedido) self._motor.aquecer(self.plano()); return true; });
      })["catch"](function () { return false; }).then(function (r) { self._aquecendo = false; return r; });
    },
    /* opcoes (testes e a outra frente): { amostras, w, h, ev, luzes:{id:bool}, semAba } */
    renderizar: function (opcoes) {
      var self = this, o = opcoes || {};
      this._renderPedido = true;
      return RM().carregar().then(function () { return self._aplicarVista(); }).then(function () {
        var e = self.extrair();
        if (!e || !e.grupos.length) { toast("Não há o que renderizar: abra ou modele algo primeiro.", "aviso"); return null; }
        self._amb = self.ambiente();
        return self._carregarMotor().then(function (Mod) {
          var sup = Mod.suportado();
          if (!sup.ok) { toast("O render físico não roda neste aparelho: " + sup.motivo + " Abra a obra no computador.", "erro", 8000); return null; }
          var plano = self.plano();
          if (o.amostras) plano.amostras = o.amostras;
          if (o.w && o.h) { plano.w = o.w; plano.h = o.h; }
          if (o.ev != null) { plano.ev = o.ev; plano.comp = 0; }
          if (o.denoise != null) plano.denoise = !!o.denoise;
          if (o.luzes) { var cc = self.cfg(); Object.keys(o.luzes).forEach(function (k) { cc.luzes[k] = !!o.luzes[k]; }); }
          self._congelarAnterior();
          var tela = self._aba(), cv = tela.querySelector('[data-render="canvas"]');
          if (!self._motor) self._motor = new Mod.MotorRender(cv);
          else { var velho = self._motor.canvas; cv.parentNode.replaceChild(velho, cv); }
          var cena = self._cenaDe(e, self._amb);
          var t0 = performance.now();
          self._prog = { amostras: 0, alvo: plano.amostras, ativo: true, pronto: false, compilando: true, ev: plano.ev == null ? 12 : plano.ev, evAuto: plano.ev == null };
          self._plano = plano; self._pintarProgresso();
          return self._motor.preparar(cena).then(function (info) {
            self._cena = { info: info, ms: Math.round(performance.now() - t0), plano: plano };
            self._motor.iniciar(plano, function (p) { self._prog = p; self._pintarProgresso(); });
            status("Render: " + info.triangulos.toLocaleString("pt-BR") + " triângulos, " + e.materiais.length + " materiais, " + e.luzes.length + " luminária(s)." + (info.texturasFalharam ? " " + info.texturasFalharam + " textura(s) não carregaram: ficou a cor do material." : "") + " " + (plano.aviso || ""));
            return self._cena;
          });
        });
      })["catch"](function (err) { toast("O render falhou: " + (err && err.message || err), "erro", 8000); try { console.error(err); } catch (e2) {} return null; });
    },
    parar: function () { if (this._motor) this._motor.parar(); this._pintarProgresso(); },
    estado: function () { var p = this._prog; return p ? { amostras: p.amostras, alvo: p.alvo, pronto: !!p.pronto, ativo: !!p.ativo, compilando: !!p.compilando, msPorAmostra: p.msPorAmostra, ev: p.ev } : { amostras: 0, alvo: 0, pronto: false, ativo: false }; },
    _pintarProgresso: function () {
      var p = this._prog, R = RM(), txt2;
      if (!p) txt2 = "";
      else if (p.amostras < 1) txt2 = "Preparando o motor de render nesta placa de vídeo… (na primeira vez em cada sessão pode levar de 1 a 2 minutos; depois as amostras vêm rápido)";
      else { var est = R.estimativa(p.msPorAmostra, p.amostras, p.alvo); txt2 = (p.pronto ? "Pronto: " : (p.ativo ? "" : "Parado: ")) + p.amostras + " de " + p.alvo + " amostras" + (p.pronto ? "" : " · " + est.texto) + " · EV100 " + (Math.round(p.ev * 10) / 10).toLocaleString("pt-BR") + (p.evAuto ? " (automática)" : ""); }
      var el = document.querySelector('#bim-render-corpo [data-render="progresso"]');
      if (el) el.innerHTML = p ? '<div style="height:6px;background:rgba(127,127,127,.25);border-radius:3px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:' + Math.round(100 * Math.min(1, p.amostras / Math.max(1, p.alvo))) + '%;background:#2FBF71"></div></div>' + esc(txt2) : "";
      var e2 = this._tela && this._tela.querySelector('[data-render="estado"]'); if (e2) e2.textContent = txt2;
    },

    /* ---------------------------------------------------- saída */
    imagemAtual: function () {
      var m = this._motor; if (!m || !m.pt || !m.pt.samples) return null;
      return { dataUrl: m.imagem("image/png"), largura: m.canvas.width, altura: m.canvas.height, amostras: Math.floor(m.pt.samples), pronto: m.pt.samples >= m.alvo, descritivo: this.descritivo() };
    },
    descritivo: function () {
      var e = this._ext || this.extrair(), am = this._amb || this.ambiente(), c = this.cfg(), p = this._plano || this.plano(), m = this._motor, self = this;
      var obra = ""; try { var o = global.Store && global.Auth ? global.Store.obter(global.Auth.empresaId(), "obras", this.obraKey()) : null; obra = (o && o.nome) || ""; } catch (x) {}
      return RM().descritivo({
        obra: obra, estilo: c.estilo, data: c.data, hora: am.hora, fuso: am.fuso, local: { lat: am.local.lat, lon: am.local.lon, fonte: am.local.fonte, norte: am.local.norte },
        sol: { elevacao: am.sol.elevacao, azimute: am.sol.azimute, lux: am.sol.lux }, nuvens: c.nuvens, ev: m ? m.evEfetivo() : (c.expAuto ? null : c.ev), balanco: p.balancoK, tom: c.tom,
        camera: { tipo: p.camera.tipo, fov: p.camera.fov, posicao: p.camera.pos.map(function (v, i) { return Math.round((v + e.origem[i]) * 1000) / 1000; }), alvo: p.camera.alvo ? p.camera.alvo.map(function (v, i) { return Math.round((v + e.origem[i]) * 1000) / 1000; }) : null, dof: !!(p.camera.dof && p.camera.dof.ligado) },
        plano: p, amostras: m ? Math.floor(m.pt.samples) : 0, materiais: e.conferencia,
        luzes: e.luzes.map(function (l) { return { id: l.id, nome: l.nome, tipo: l.tipo, fluxo: l.fluxo, K: l.K, circuito: l.circuito, ligada: self.luzLigada(l.id) }; })
      });
    },
    _nomeArquivo: function () { var d = new Date(); return "render-" + this.obraKey().replace(/[^a-z0-9_-]+/gi, "") + "-" + d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + "-" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ".png"; },
    baixarPNG: function () {
      var im = this.imagemAtual(); if (!im) { toast("Ainda não há render para salvar.", "aviso"); return false; }
      var a = document.createElement("a"); a.href = im.dataUrl; a.download = this._nomeArquivo(); document.body.appendChild(a); a.click(); setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
      return true;
    },
    /* a imagem vai para o IndexedDB do aparelho (nunca base64 no Store) e entra numa prancha "Renders" da obra (uma folha por render) */
    paraPrancha: function () {
      var im = this.imagemAtual(), P = global.Prancha, self = this;
      if (!im) { toast("Ainda não há render para levar à prancha.", "aviso"); return Promise.resolve(false); }
      if (!P || !global.Idb || !global.Store || !global.Auth) { toast("O módulo de pranchas não carregou nesta tela.", "erro"); return Promise.resolve(false); }
      var chave = "render:" + this.obraKey() + ":" + Date.now();
      return global.Idb.set(chave, im.dataUrl).then(function () {
        var eidv = global.Auth.empresaId(), regs = (global.Store.listar(eidv, "bim_pranchas") || []).filter(function (r) { return r && String(r.obraId || "") === self.obraKey() && r.origem === "render"; });
        var pr = regs[0] || { nome: "Renders", formato: "A3", orientacao: "paisagem", origem: "render", obraId: self.obraKey(), criadoEm: new Date().toISOString(), folhas: [], carimbo: {} };
        var geo = P.geometria(pr.formato || "A3", pr.orientacao || "paisagem"), A = geo.area, asp = im.largura / im.altura, w = A.w, h = w / asp;
        if (h > A.h - 12) { h = A.h - 12; w = h * asp; }
        var bloco = { tipo: "imagem", chave: chave, x: Math.round(A.x + (A.w - w) / 2), y: Math.round(A.y + 4), w: Math.round(w), h: Math.round(h), titulo: "Render — " + new Date().toLocaleDateString("pt-BR"), subtitulo: im.amostras + " amostras" };
        pr.folhas = (pr.folhas || []).concat([{ id: "f" + ((pr.folhas || []).length + 1), conteudo: "Render", blocos: [bloco] }]);
        if (!pr.id) delete pr.id;
        var ok = global.Store.salvar(eidv, "bim_pranchas", pr);
        toast(ok ? "Render na prancha “Renders” (folha " + pr.folhas.length + "). Abra em Anotar › Pranchas." : "Não consegui salvar a prancha.", ok ? "ok" : "erro");
        return !!ok;
      });
    },
    /* testes e conferência: pixel final (sRGB) e radiância linear num ponto do render */
    pixel: function (fx, fy) { return this._motor ? this._motor.pixel(fx, fy) : null; },
    radiancia: function (fx, fy, r) { return this._motor ? this._motor.radiancia(fx, fy, r) : null; },
    /* onde um ponto do MUNDO (coordenadas do BIM) cai na imagem do render (0..1, origem em cima à esquerda) */
    projetar: function (x, y, z) {
      var e = this._ext, p = this._plano; if (!e || !p) return null;
      var c = p.camera, o = e.origem, v = [x - o[0] - c.pos[0], y - o[1] - c.pos[1], z - o[2] - c.pos[2]];
      var q = c.quat, ix = -q[0], iy = -q[1], iz = -q[2], iw = q[3];
      /* gira v pelo inverso do quatérnio da câmera */
      var tx = 2 * (iy * v[2] - iz * v[1]), ty = 2 * (iz * v[0] - ix * v[2]), tz = 2 * (ix * v[1] - iy * v[0]);
      var cx = v[0] + iw * tx + (iy * tz - iz * ty), cy = v[1] + iw * ty + (iz * tx - ix * tz), cz = v[2] + iw * tz + (ix * ty - iy * tx);
      if (cz >= 0) return null;
      var f = 1 / Math.tan(c.fov * Math.PI / 360), asp = p.w / p.h;
      return { x: 0.5 + 0.5 * (cx * f / asp) / -cz, y: 0.5 - 0.5 * (cy * f) / -cz };
    }
  };

  global.BimRender = BimRender;
  if (typeof module !== "undefined" && module.exports) module.exports = BimRender;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
