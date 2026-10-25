/* =====================================================================
 * bimrendervivoui.js — a TELA do render ao vivo (protótipo 20/10/2026,
 * prévia `?previa=rendervivo`; o motor é o js/bimrendervivo.js)
 *
 * Vista › Apresentação › Render › "Render ao vivo" abre uma ABA ao lado
 * do {3D} com o modelo vestido de render: andar (W A S D) ou orbitar,
 * mudar a hora do sol, a exposição e a qualidade, salvar a imagem.
 *
 * O REFINO AO PARAR: parada a câmera ~1 s, o path tracer do render físico
 * (js/bimrendermotor.js, WebGL, outro canvas por cima) recomeça NA MESMA
 * VISTA, com o mesmo EV e o mesmo balanço de branco, e aparece aos poucos
 * conforme as amostras somam. Mexeu, ele para e some. A 1ª compilação
 * do path tracer leva ~1 a 1,5 min no Chrome do Windows (medido numa
 * RTX 5060, ver o motor) — começa ao abrir a aba, enquanto a pessoa anda.
 *
 * A cena é a MESMA do render físico (BimRender.extrair + _cenaDe): só o
 * céu é refeito em 1024 × 512 (o fundo aparece na tela; 256 × 128 borrava).
 * ES5; os motores entram por import() só quando a aba abre.
 * ===================================================================== */
(function (global) {
  "use strict";

  function B() { return global.BimRender; }
  function RM() { return global.RenderMat; }
  function ic(n, t) { try { return global.Icones && global.Icones.get ? global.Icones.get(n, t || 15) : ""; } catch (e) { return ""; } }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function url(arq) { try { return new URL("js/" + arq, document.baseURI).href; } catch (e) { return "js/" + arq; } }
  function hm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2); }
  function minutos(s) { var p = String(s || "12:00").split(":"); return (+p[0] || 0) * 60 + (+p[1] || 0); }

  var PREF = "orcapro:bim:render-vivo";
  function prefs() { try { return JSON.parse(global.localStorage.getItem(PREF) || "{}") || {}; } catch (e) { return {}; } }
  function gravarPrefs(o) { try { global.localStorage.setItem(PREF, JSON.stringify(o)); } catch (e) {} }

  var V = {
    ligado: function () { try { return !!(global.BimPrevia && global.BimPrevia.renderVivo && global.BimPrevia.renderVivo()); } catch (e) { return false; } },
    vivo: null, motor: null, _tela: null, _cena: null, _refino: { ativo: false, visivel: false, amostras: 0 },

    /* o céu e o sol de uma hora (a mesma conta do BimRender.ambiente, céu em 1024 × 512) */
    ambiente: function (hora) {
      var b = B(), c = Object.assign({}, b.cfg(), this.sobreAmb || {} /* [Cena] data e nuvens da cena, sem gravar na configuração do render físico */), L = b.local(), R = RM(), h = hora || b.horaEfetiva(L), fz = b.fuso(L);
      var s = R.sol({ lat: L.lat, lon: L.lon, data: c.data, hora: h, fuso: fz, norte: L.norte }) || { elevacao: 45, azimute: 0, direcao: [0, 0.7071, -0.7071] };
      var lux = R.iluminanciaSolar(s.elevacao, c.nuvens), cs = R.corSolar(s.elevacao);
      var ceu = R.ceu({ largura: 1024, altura: 512, elevacao: s.elevacao, solDir: s.direcao, nuvens: c.nuvens });
      return { local: L, hora: h, fuso: fz, sol: { elevacao: s.elevacao, azimute: s.azimute, direcao: s.direcao, lux: lux, cor: cs.cor, K: cs.K }, ceu: ceu };
    },
    /* o CÉU FOTOGRAFADO (js/bimceuhdri.js) no lugar da imagem do céu calculado — mesma luz, cara de foto.
       Preferência "calculado" = o céu matemático de antes. Falhou (sem arquivo, sem rede): segue o calculado. */
    _comCeuFoto: function (am) {
      var p = prefs(), esc = (this.sobreAmb && this.sobreAmb.ceu) || p.ceu || "auto"; if (esc === "calculado") return Promise.resolve(am);   /* [Cena] o céu da cena manda */
      var c = Object.assign({}, B().cfg(), this.sobreAmb || {}), self = this, vivo = this.vivo;
      /* [entrega pesada, 25/10/2026] o .hdr é baixado sob demanda (js/bimpesado.js): enquanto não chega, o céu calculado;
         chegou, refaz o céu na hora atual (a mesma sessão — fechou ou reabriu, ignora) */
      var aoChegar = function () { if (self.vivo && self.vivo === vivo && self._am) self.hora(self._am.hora); };
      return import(url("bimceuhdri.js")).then(function (H) {
        return H.ceuFoto({ id: esc === "auto" ? null : esc, elevacao: am.sol.elevacao, nuvens: c.nuvens || 0, solDir: am.sol.direcao, ref: am.ceu, resolucao: "2k", aoChegar: aoChegar });
      }).then(function (ceu) { if (ceu) { am.ceu = ceu; am.ceuFoto = ceu.foto; } return am; })["catch"](function (err) { try { console.warn("céu fotografado:", err); } catch (x) {} return am; });
    },
    _cenaDe: function (e, am) { var c = B()._cenaDe(e, am); c.sol = am.sol.lux > 0 ? { direcao: am.sol.direcao, lux: am.sol.lux, cor: am.sol.cor } : null; c.origem = e.origem; /* [frente R] os cômodos do BIM vêm em coordenadas do motor */ return c; },
    _wb: function () { var p = B().plano(); return p.wb; },

    /* a aba ao lado do {3D} (a mesma casca das vistas que o render físico usa) */
    _aba: function () {
      var G = global.Gestao, id = "render-vivo", tela = null, nomeAba = this._nomeAba || "Render ao vivo";   /* [Cena] "OrçaPRO Cena" */
      if (G && G._bimVxCriarTela && G._bimVxEst && G._bimVxAtivar) {
        var est = G._bimVxEst(), ja = est.lista.filter(function (x) { return x.id === id; })[0];
        tela = ja ? document.querySelector('.bim-tela[data-vista="' + id + '"]') || null : null;
        if (!tela) { tela = G._bimVxCriarTela(id, nomeAba); if (tela && !ja) est.lista.push({ id: id, nome: nomeAba, janela: null, tipo: "render" }); }
        else if (ja) ja.nome = nomeAba;
        if (tela) { tela.classList.add("bim-tela-render"); G._bimVxAtivar(id); }
      }
      if (!tela) {
        tela = document.createElement("div");
        tela.style.cssText = "position:fixed;inset:0;z-index:9000;background:#0d0f13";
        document.body.appendChild(tela);
      }
      if (!tela.style.position) tela.style.position = "relative";
      var p = prefs();
      tela.innerHTML =
        '<div data-rv="palco" style="position:absolute;inset:0;background:#0d0f13;overflow:hidden"></div>' +
        '<canvas data-rv="foto" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;transition:opacity .25s"></canvas>' +
        '<div data-rv="barra" style="position:absolute;left:10px;top:10px;right:10px;z-index:4;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:#eef0f4">' +
          '<div style="display:flex;gap:2px;background:rgba(10,12,16,.72);border-radius:8px;padding:3px">' +
            '<button type="button" class="btn sm" data-rva="orbita" title="Arrastar: girar · botão direito ou Shift: mover · roda: aproximar">' + ic("orbita") + ' Órbita</button>' +
            '<button type="button" class="btn sm" data-rva="caminhar" title="W A S D: andar · arrastar: olhar · Q/E: descer/subir · Shift: correr">' + ic("caminhar") + ' Caminhar</button></div>' +
          '<label style="display:flex;gap:6px;align-items:center;background:rgba(10,12,16,.72);border-radius:8px;padding:4px 10px">' + ic("sol") + ' <span data-rv="hora-txt">--:--</span>' +
            '<input type="range" data-rv="hora" min="330" max="1170" step="5" style="width:150px"></label>' +
          '<label style="display:flex;gap:6px;align-items:center;background:rgba(10,12,16,.72);border-radius:8px;padding:4px 10px">Exposição <input type="range" data-rv="comp" min="-2" max="2" step="0.1" value="' + (p.comp || 0) + '" style="width:90px"></label>' +
          '<select data-rv="ceu" title="Céu (foto de céu real, calibrada na luz da obra)" style="background:rgba(10,12,16,.85);color:#eef0f4;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:4px 6px"><option value="auto">Céu: automático</option><option value="calculado">Céu: calculado</option></select>' +
          '<select data-rv="qual" title="Qualidade" style="background:rgba(10,12,16,.85);color:#eef0f4;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:4px 6px">' +
            ["leve", "alta", "ultra"].map(function (k) { return '<option value="' + k + '"' + ((p.qual || "ultra") === k ? " selected" : "") + ">" + { leve: "Leve", alta: "Alta", ultra: "Ultra (placa dedicada)" }[k] + "</option>"; }).join("") + "</select>" +
          '<label style="display:flex;gap:6px;align-items:center;background:rgba(10,12,16,.72);border-radius:8px;padding:4px 10px" title="Parou a câmera, a foto física (path tracing) assume a mesma vista"><input type="checkbox" data-rv="refino"' + (p.refino === false ? "" : " checked") + "> Foto física ao parar</label>" +
          /* [frente F] */ '<label style="display:flex;gap:6px;align-items:center;background:rgba(10,12,16,.72);border-radius:8px;padding:4px 10px" title="Grama em 3D perto da câmera, árvores e arbustos com vento em volta da casa. Ligado, a foto física espera (ela não conhece o entorno)"><input type="checkbox" data-rv="entorno"' + (p.entorno === false ? "" : " checked") + "> Entorno</label>" +
          '<button type="button" class="btn sm" data-rva="png">' + ic("baixar") + " Imagem</button>" +
          '<button type="button" class="btn sm" data-rva="fechar">' + ic("fechar") + " Fechar</button>" +
          '<span data-rv="estado" style="margin-left:auto;background:rgba(10,12,16,.72);border-radius:8px;padding:4px 10px;font-variant-numeric:tabular-nums"></span>' +
        "</div>" +
        '<div data-rv="dica" style="position:absolute;left:10px;bottom:10px;z-index:4;font-size:11.5px;color:#cfd4dc;background:rgba(10,12,16,.6);border-radius:8px;padding:4px 10px">Arraste para girar · botão direito para mover · roda para aproximar · Caminhar: W A S D</div>';
      /* [Cena] no módulo OrçaPRO Cena a barra é da Cena (js/bimcenaui.js): esta fica escondida, sem sair do lugar (o código abaixo a usa) */
      if (this.modoCena) { var bb = tela.querySelector('[data-rv="barra"]'), dd = tela.querySelector('[data-rv="dica"]'); if (bb) bb.style.display = "none"; if (dd) dd.style.display = "none"; }
      this._tela = tela;
      return tela;
    },

    /* ABRIR: extrai a cena do modelo, monta o motor ao vivo e o refino */
    abrir: function (opcoes) {
      var self = this, o = opcoes || {}, b = B();
      if (!b) return Promise.resolve(null);
      return RM().carregar().then(function () { return b._aplicarVista(); }).then(function () {
        var e = b.extrair();
        if (!e || !e.grupos.length) { toast("Não há o que renderizar: abra ou modele algo primeiro.", "aviso"); return null; }
        return import(url("bimrendervivo.js")).then(function (Mod) {
          return Mod.suportado().then(function (sup) {
            if (!sup.ok) { toast("O render ao vivo precisa de WebGPU: " + sup.motivo, "erro", 9000); return null; }
            self.fechar(true);
            var tela = self._aba(), palco = tela.querySelector('[data-rv="palco"]'), p = prefs();
            var qual = o.qualidade || p.qual || "ultra";
            var vivo = self.vivo = new Mod.RenderVivo(palco, { qualidade: qual, tom: o.tom || p.tom || "aces", luzAssada: o.luzAssada !== false, reflexo: o.reflexo !== false /* [frente R] */, entorno: o.entorno !== undefined ? !!o.entorno : p.entorno !== false, medirGpu: o.medirGpu === true /* [frente F] */, estadoLuzes: o.estadoLuzes || self._estadoLuzes /* [frente I] */ });
            self._estado("Preparando a placa de vídeo…");
            return vivo.iniciar().then(function () {
              return self._comCeuFoto(self.ambiente(o.hora || p.hora)).then(function (am) {
              self._am = am;
              var cena = self._cena = self._cenaDe(e, am);
              self._estado("Montando a cena: " + e.materiais.length + " materiais…");
              return vivo.preparar(cena).then(function (info) {
                vivo.definirBalanco(self._wb());
                vivo.definirComp(p.comp || 0);
                vivo.definirCamera(o.camera || e.camera);
                vivo.modo(o.modo || p.modo || "orbita");
                self._ligarTela(tela, am);
                vivo.aoQuadro = function () { self._porQuadro(); };
                /* mexeu a câmera (ou a hora, o tamanho): a foto física sai NA HORA — por evento, não por consulta de tempo
                   (consultando "parado < 300 ms" a parada às vezes escapava e a foto seguia somando a vista anterior) */
                vivo.aoMexer = function () { if (self._refino.ativo) self._pararRefino(); };
                vivo.rodar();
                /* [frente N] o MAPA DA PLANTA: minimapa com o pontinho, "ir para" o ambiente e o seletor de pavimento (js/bimmapaplanta.js) */
                self._mapaPronto = self._abrirMapa(tela, vivo, e);
                /* [frente I] o painel LUZES (comandos, dia/noite, Sugerir iluminação) — js/bimiluminacaoui.js */
                self._luzesPronto = self._abrirLuzes(tela, vivo);
                /* [Cena] a cena vestida: a Cena põe a tela, os materiais editados, os objetos e os efeitos (js/bimcenaui.js) */
                if (typeof o.aposPreparar === "function") { try { self._cenaPronta = Promise.resolve(o.aposPreparar(vivo, tela, info)); } catch (eCena) { try { console.warn("cena:", eCena); } catch (x) {} } }
                self.info = { placa: sup.placa || vivo.adaptador, qualidade: qual, cena: info, three: Mod.REVISAO_THREE };
                if (o.refino !== false && p.refino !== false) self._prepararRefino(cena);
                self.info.ceu = am.ceuFoto || null;
                return self.info;
              });
              });
            });
          });
        });
      })["catch"](function (err) { toast("O render ao vivo falhou: " + (err && err.message || err), "erro", 9000); try { console.error(err); } catch (e2) {} self._estado("Falhou: " + (err && err.message || err)); return null; });
    },

    _ligarTela: function (tela, am) {
      var self = this, v = this.vivo, q = function (s) { return tela.querySelector(s); };
      var hr = q('[data-rv="hora"]'), ht = q('[data-rv="hora-txt"]');
      hr.value = minutos(am.hora); ht.textContent = am.hora;
      var tH = 0;
      hr.oninput = function () {
        ht.textContent = hm(+hr.value);
        clearTimeout(tH); tH = setTimeout(function () { self.hora(hm(+hr.value)); }, 120);
      };
      q('[data-rv="comp"]').oninput = function () { var c = +this.value; v.definirComp(c); var p = prefs(); p.comp = c; gravarPrefs(p); };
      var sc = q('[data-rv="ceu"]'), pc = prefs();
      import(url("bimceuhdri.js")).then(function (H) { return H.manifesto(); }).then(function (m) {
        (m.ceus || []).forEach(function (c) { var op = document.createElement("option"); op.value = c.id; op.textContent = "Céu: " + c.nome + " (" + c.tipo.replace(/-/g, " ") + ")"; sc.appendChild(op); });
        sc.value = pc.ceu || "auto";
      })["catch"](function () {});
      sc.onchange = function () { self.ceu(this.value); };
      q('[data-rv="qual"]').onchange = function () { var p = prefs(); p.qual = this.value; gravarPrefs(p); self.abrir({ qualidade: this.value, camera: v.cameraAtual(), modo: v.nav.modo, hora: self._am && self._am.hora }); };
      /* [frente F] liga/desliga o entorno; a foto física some (ela não tem grama nem árvore) */
      q('[data-rv="entorno"]').onchange = function () { var p = prefs(); p.entorno = !!this.checked; gravarPrefs(p); self._pararRefino(); v.entornoLigado(!!this.checked); };
      q('[data-rv="entorno"]').checked = v.entornoLigado();
      q('[data-rv="refino"]').onchange = function () { var p = prefs(); p.refino = !!this.checked; gravarPrefs(p); if (!this.checked) self._pararRefino(); else if (!self.motor) self._prepararRefino(self._cena); };
      var bm = function (m) { v.modo(m); var p = prefs(); p.modo = m; gravarPrefs(p); ["orbita", "caminhar"].forEach(function (k) { var x = q('[data-rva="' + k + '"]'); if (x) x.classList.toggle("primary", k === m); }); q('[data-rv="dica"]').textContent = m === "caminhar" ? "W A S D: andar · arraste para olhar · Q/E: descer/subir · Shift: correr" : "Arraste para girar · botão direito para mover · roda para aproximar · Caminhar: W A S D"; };
      q('[data-rva="orbita"]').onclick = function () { bm("orbita"); };
      q('[data-rva="caminhar"]').onclick = function () { bm("caminhar"); v.canvas.focus(); };
      bm(v.nav.modo);
      q('[data-rva="png"]').onclick = function () { self.baixar(); };
      q('[data-rva="fechar"]').onclick = function () { self.fechar(); };
    },

    /* [frente N] MAPA DA PLANTA — o módulo entra por import() só aqui; falhar não derruba o passeio */
    _abrirMapa: function (tela, vivo, e) {
      var self = this, p = prefs(); this._fecharMapa();
      return import(url("bimmapaplanta.js")).then(function (M) {
        if (self.vivo !== vivo) return null;
        return M.abrirMapa({ vivo: vivo, tela: tela, global: global, origem: e.origem, aberto: p.mapa !== false, aoPref: function (o) { var q = prefs(); q.mapa = o.mapa; gravarPrefs(q); } });
      }).then(function (m) {
        if (self.vivo !== vivo) { if (m) m.descartar(); return null; }
        self._mapa = m; return m;
      })["catch"](function (err) { try { console.warn("mapa da planta:", err); } catch (x) {} return null; });
    },
    _fecharMapa: function () { if (this._mapa) { try { this._mapa.descartar(); } catch (e) {} this._mapa = null; } },
    /* [frente I] o painel LUZES — por import() só aqui; falhar não derruba o passeio */
    _abrirLuzes: function (tela, vivo) {
      var self = this; this._fecharLuzes();
      return import(url("bimiluminacaoui.js")).then(function (M) {
        if (self.vivo !== vivo) return null;
        var l = M.abrirLuzes({ vivo: vivo, tela: tela, global: global, ui: self }); self._luzes = l; return l;
      })["catch"](function (err) { try { console.warn("painel de luzes:", err); } catch (x) {} return null; });
    },
    _fecharLuzes: function () { if (this._luzes) { try { this._luzes.descartar(); } catch (e) {} this._luzes = null; } },

    /* trocar a hora: só o sol e o céu (a cena fica) */
    hora: function (h) {
      if (!this.vivo) return Promise.resolve(null);
      var self = this, tok = this._tokHora = (this._tokHora || 0) + 1;
      var p = prefs(); p.hora = h; gravarPrefs(p);
      return this._comCeuFoto(this.ambiente(h)).then(function (am) {
        if (tok !== self._tokHora || !self.vivo) return null;   /* outra hora pedida no meio: vale a última */
        var c = self._cena; self._am = am;
        c.sol = am.sol.lux > 0 ? { direcao: am.sol.direcao, lux: am.sol.lux, cor: am.sol.cor } : null; c.ceu = am.ceu;
        self.vivo.definirCeu(c.sol, c.ceu);
        self._pararRefino();
        if (self.motor) { var m = self.motor; self.motor = null; self._motorPronto = false; try { m.descartar(); } catch (e) {} self._prepararRefino(c); }
        return am.ceuFoto || null;
      });
    },
    /* trocar o céu (id do manifesto, "auto" ou "calculado"): refaz como a troca de hora */
    ceu: function (id) { var p = prefs(); p.ceu = id; gravarPrefs(p); return this.hora(this._am && this._am.hora); },

    /* ------------------------------------------------ o refino físico */
    _prepararRefino: function (cena) {
      var self = this, cv = this._tela && this._tela.querySelector('[data-rv="foto"]');
      if (!cv || this.motor) return;
      import(url("bimrendermotor.js")).then(function (M) {
        if (!M.suportado().ok || !self.vivo) return;
        var m = self.motor = new M.MotorRender(cv);
        self._motorPronto = false;
        return m.preparar(cena).then(function () {
          if (self.motor !== m) return;
          m.aquecer(self._planoRefino(64, 36));
          var t = setInterval(function () { if (self.motor !== m) { clearInterval(t); return; } if (m.aquecido) { clearInterval(t); self._motorPronto = true; } }, 400);
        });
      })["catch"](function (err) { try { console.warn("refino:", err); } catch (e) {} });
    },
    _planoRefino: function (w, h) {
      var v = this.vivo, cam = v.cameraAtual();
      return { amostras: 2048, quiques: 6, w: w, h: h, tom: v.o.tom || "aces", ev: v.evEfetivo(), comp: 0, wb: this._wb(), denoise: true,
               camera: { tipo: "perspectiva", fov: cam.fov, near: cam.near, far: cam.far, pos: cam.pos, quat: cam.quat } };
    },
    _porQuadro: function () {
      var v = this.vivo, R = this._refino, cv = this._tela && this._tela.querySelector('[data-rv="foto"]');
      if (!v || !cv) return;
      var parado = v.parado();
      if (R.ativo && parado < 300) this._pararRefino();
      /* começa só com o OLHO ASSENTADO na vista nova: começar antes levava o EV de fora para dentro de casa (foto escura) */
      else if (!R.ativo && !this.pausarRefino && this.motor && this._motorPronto && parado > 900 && v.olhoAssentado() && !v.entornoLigado() /* [frente F] */) {
        var pr = Math.min(global.devicePixelRatio || 1, 2), w = Math.round(v.palco.clientWidth * pr), h = Math.round(v.palco.clientHeight * pr);
        var self = this; R.ativo = true; R.amostras = 0; R.inicio = performance.now();
        this.motor.iniciar(this._planoRefino(w, h), function (p) {
          R.amostras = p.amostras;
          var op = Math.max(0, Math.min(1, (p.amostras - 6) / 20));
          cv.style.opacity = String(op); R.visivel = op >= 1;
          v.refino = { visivel: R.visivel, convergindo: R.visivel };
          self._pintarEstado();
        });
      }
      if (this._quadro++ % 15 === 0) this._pintarEstado();
    },
    _quadro: 0,
    _pararRefino: function () {
      var R = this._refino; R.ativo = false; R.visivel = false; R.amostras = 0;
      if (this.motor) this.motor.parar();
      var cv = this._tela && this._tela.querySelector('[data-rv="foto"]'); if (cv) cv.style.opacity = "0";
      if (this.vivo) this.vivo.refino = null;
    },

    _estado: function (t) { var s = this._tela && this._tela.querySelector('[data-rv="estado"]'); if (s) s.textContent = t; },
    _pintarEstado: function () {
      var v = this.vivo, R = this._refino; if (!v) return;
      var t;
      if (R.ativo && R.amostras > 0) t = "Foto física · " + R.amostras + " amostras";
      else if (R.ativo) t = "Foto física começando…";
      else t = "Ao vivo · " + v.estado.qps + " qps · EV " + v.evEfetivo().toFixed(1);
      /* a luz assada (atlas, na placa) manda no aviso; sem ela, o das sondas */
      var la = v.assadaInfo;
      if (la && la.calculando) t += " · calculando a luz da obra " + Math.round((la.progresso || 0) * 100) + "%" + (la.ms_rapida ? " (rápida pronta)" : "");
      else if (v.luzInfo && v.luzInfo.calculando) t += " · calculando a luz da obra " + Math.round(v.luzInfo.progresso * 100) + "%";
      if (v.entornoLigado() && !R.ativo) t += " · Entorno ligado (a foto física espera)";   /* [frente F] */
      if (this.motor && !this._motorPronto && !R.ativo) t += " · preparando a foto física (1ª vez ~1–2 min)";
      this._estado(t);
    },

    /* a imagem da tela (a foto física, se estiver por cima) */
    imagem: function () {
      var R = this._refino;
      if (R.visivel && this.motor) return this.motor.imagem("image/png");
      return this.vivo ? this.vivo.imagem("image/png") : null;
    },
    baixar: function () {
      var d = this.imagem(); if (!d) return;
      var a = document.createElement("a"); a.href = d; a.download = "render-ao-vivo-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".png";
      document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
    },
    estado: function () {
      var v = this.vivo; if (!v) return null;
      return { qps: v.estado.qps, ev: v.evEfetivo(), evAlvo: v.evAlvo, medida: v._ultMedida || null, luz: v.luzInfo, assada: v.assadaInfo, entorno: { ligado: v.entornoLigado(), info: v.entornoInfo || null } /* [frente F] */, refino: { ativo: this._refino.ativo, visivel: this._refino.visivel, amostras: this._refino.amostras, motorPronto: !!this._motorPronto },
               mapa: this._mapa ? this._mapa.estado() : null,   /* [frente N] */
               info: this.info, camera: v.cameraAtual(), modo: v.nav.modo, hora: this._am && this._am.hora, ceu: this._am && this._am.ceuFoto || null };
    },
    fechar: function (semAba) {
      this._fecharMapa();   /* [frente N] */
      this._fecharLuzes();   /* [frente I] */
      this._pararRefino();
      if (this.motor) { try { this.motor.descartar(); } catch (e) {} this.motor = null; }
      if (this.vivo) { try { this.vivo.descartar(); } catch (e) {} this.vivo = null; }
      this._motorPronto = false;
      if (!semAba && this._tela) {
        var G = global.Gestao;
        try { if (G && G._bimVxFechar) G._bimVxFechar("render-vivo"); else if (this._tela.parentNode && this._tela.style.position === "fixed") this._tela.parentNode.removeChild(this._tela); } catch (e) {}
        try { if (G && G._bimVxAtivar) G._bimVxAtivar("3d"); } catch (e) {}
      }
    }
  };

  global.BimRenderVivo = V;
})(typeof window !== "undefined" ? window : this);
