/* ============================================================
   OrçaPro — Construtor 3D : CENA 3D (Three.js)
   Constrói a obra em blocos 3D conforme as etapas avançam.
   Controles touch (orbitar/pinça) para tablet.
   ============================================================ */
(function (global) {
  'use strict';

  function Cena3D(canvas) {
    this.canvas = canvas;
    this.ok = (typeof THREE !== 'undefined');
    if (!this.ok) return;

    var w = canvas.clientWidth || 800, h = canvas.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    }

    this.scene = new THREE.Scene();
    var corCeu = 0x86b9e0;
    this.scene.background = new THREE.Color(corCeu);
    this.scene.fog = new THREE.Fog(0xc8dcec, 110, 320);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);

    // câmera orbital
    this.target = new THREE.Vector3(0, 2, 0);
    this.az = Math.PI * 0.25;   // azimute
    this.pol = Math.PI * 0.34;  // polar (de cima)
    this.dist = 60;
    this.minDist = 18; this.maxDist = 160;

    this._setupLuzes();
    this._setupAmbiente();

    this.grupoObra = new THREE.Group();   // tudo que é construção
    this.grupoCanteiro = new THREE.Group();
    this.grupoProps = new THREE.Group();  // animados
    this.grupoTijolos = new THREE.Group(); // blocos do modo mão na massa
    this.scene.add(this.grupoObra);
    this.scene.add(this.grupoCanteiro);
    this.scene.add(this.grupoProps);
    this.scene.add(this.grupoTijolos);
    this.onTap = null;                     // callback de toque (assentar bloco)

    this.animados = [];       // {mesh, tipo}
    this.tempo = 0;

    this._setupControles();
    this._atualizaCamera();

    var self = this;
    this._loop = function () {
      self.tempo += 0.016;
      self._tick();
      self.renderer.render(self.scene, self.camera);
      self._raf = requestAnimationFrame(self._loop);
    };
    this._raf = requestAnimationFrame(this._loop);

    global.addEventListener('resize', function () { self.resize(); });
  }

  Cena3D.prototype.resize = function () {
    if (!this.ok) return;
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  Cena3D.prototype._setupLuzes = function () {
    var amb = new THREE.HemisphereLight(0xeaf4ff, 0x6f7d52, 0.75);
    this.scene.add(amb);
    var sol = new THREE.DirectionalLight(0xfff4dc, 2.4);
    sol.position.set(48, 80, 36);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.radius = 4;
    sol.shadow.bias = -0.0004;
    var d = 110;
    sol.shadow.camera.left = -d; sol.shadow.camera.right = d;
    sol.shadow.camera.top = d; sol.shadow.camera.bottom = -d;
    sol.shadow.camera.near = 1; sol.shadow.camera.far = 320;
    this.scene.add(sol);
    // luz de preenchimento suave (céu) sem sombra
    var fill = new THREE.DirectionalLight(0xbcd4ee, 0.35);
    fill.position.set(-40, 30, -30);
    this.scene.add(fill);
  };

  Cena3D.prototype._setupAmbiente = function () {
    // domo de céu com gradiente
    var ceu = new THREE.Mesh(
      new THREE.SphereGeometry(480, 24, 16),
      new THREE.MeshBasicMaterial({ map: px('ceu'), side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(ceu);
    // nuvens
    this._nuvens();
    // chão / grama (textura)
    var chao = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      tmat('grama', 120, 120, { r: 1 })
    );
    chao.rotation.x = -Math.PI / 2;
    chao.position.y = -0.02;
    chao.receiveShadow = true;
    this.scene.add(chao);
  };

  Cena3D.prototype._nuvens = function () {
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
    var posic = [[-90, 70, -120], [120, 85, -60], [40, 95, -160], [-140, 78, 40], [90, 70, 90]];
    for (var i = 0; i < posic.length; i++) {
      var nuvem = new THREE.Group();
      var nb = 4 + (i % 3);
      for (var b = 0; b < nb; b++) {
        var r = 8 + (b % 3) * 4;
        var s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
        s.position.set((b - nb / 2) * 7, (b % 2) * 3, (b % 2) * 4);
        s.scale.y = 0.6;
        nuvem.add(s);
      }
      nuvem.position.set(posic[i][0], posic[i][1], posic[i][2]);
      this.scene.add(nuvem);
    }
  };

  // ---------- Controles touch / mouse -------------------------
  Cena3D.prototype._setupControles = function () {
    var self = this, el = this.canvas;
    var lastX = 0, lastY = 0, dragging = false, pinch = 0, moved = 0, startX = 0, startY = 0;

    function pos(e) { return e.touches ? e.touches[0] : e; }

    function down(e) {
      if (e.touches && e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        return;
      }
      dragging = true; moved = 0;
      var p = pos(e); lastX = startX = p.clientX; lastY = startY = p.clientY;
    }
    function move(e) {
      if (e.touches && e.touches.length === 2) {
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (pinch) { self.dist *= (pinch / d); self._clampDist(); }
        pinch = d;
        self._atualizaCamera();
        e.preventDefault();
        return;
      }
      if (!dragging) return;
      var p = pos(e);
      moved += Math.abs(p.clientX - lastX) + Math.abs(p.clientY - lastY);
      self.az -= (p.clientX - lastX) * 0.006;
      self.pol -= (p.clientY - lastY) * 0.006;
      self.pol = Math.max(0.15, Math.min(1.45, self.pol));
      lastX = p.clientX; lastY = p.clientY;
      self._atualizaCamera();
      e.preventDefault();
    }
    function up() {
      // toque curto (sem arrastar) = assentar bloco, se em modo mão na massa
      if (dragging && moved < 10 && self.onTap) self.onTap();
      dragging = false; pinch = 0;
    }

    el.addEventListener('mousedown', down);
    global.addEventListener('mousemove', move);
    global.addEventListener('mouseup', up);
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('wheel', function (e) {
      self.dist *= (e.deltaY > 0 ? 1.1 : 0.9);
      self._clampDist(); self._atualizaCamera(); e.preventDefault();
    }, { passive: false });
  };

  Cena3D.prototype._clampDist = function () {
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
  };

  Cena3D.prototype._atualizaCamera = function () {
    var x = this.target.x + this.dist * Math.sin(this.pol) * Math.sin(this.az);
    var y = this.target.y + this.dist * Math.cos(this.pol);
    var z = this.target.z + this.dist * Math.sin(this.pol) * Math.cos(this.az);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  };

  Cena3D.prototype._tick = function () {
    for (var i = 0; i < this.animados.length; i++) {
      var a = this.animados[i];
      if (a.tipo === 'grua') { a.mesh.rotation.y += 0.004; }
      else if (a.tipo === 'betoneira') { a.mesh.rotation.z += 0.05; }
      else if (a.tipo === 'worker') {
        a.mesh.position.y = a.base + Math.abs(Math.sin(this.tempo * 3 + a.fase)) * 0.18;
      } else if (a.tipo === 'flag') {
        a.mesh.rotation.y = Math.sin(this.tempo * 2) * 0.2;
      }
    }
  };

  // ---------- Texturas procedurais (geradas em canvas) --------
  var TEX = {};
  function cv(size) { var c = document.createElement('canvas'); c.width = c.height = size; return c; }
  function rnd(a, b) { return a + (b - a) * (Math.sin(rnd._s++ * 12.9898) * 43758.5453 % 1 + 1) % 1; }
  rnd._s = 1;
  function speckle(ctx, size, n, cols) {
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = cols[(i * 7) % cols.length];
      var s = 1 + (i % 3);
      ctx.fillRect((i * 53) % size, (i * 97) % size, s, s);
    }
  }
  function gerarTextura(kind) {
    var size = 256, c = cv(size), g = c.getContext('2d');
    if (kind === 'ceu') {
      var lin = g.createLinearGradient(0, 0, 0, size);
      lin.addColorStop(0, '#3f7fc4'); lin.addColorStop(0.55, '#86b9e0'); lin.addColorStop(1, '#dceaf6');
      g.fillStyle = lin; g.fillRect(0, 0, size, size);
    } else if (kind === 'tijolo') {
      g.fillStyle = '#9a9388'; g.fillRect(0, 0, size, size); // argamassa
      var bw = 64, bh = 30, y = 0, row = 0;
      while (y < size) {
        var off = (row % 2) ? -bw / 2 : 0;
        for (var x = off; x < size; x += bw) {
          var v = 150 + ((x + y) % 40);
          g.fillStyle = 'rgb(' + (v + 20) + ',' + Math.round(v * 0.55) + ',' + Math.round(v * 0.4) + ')';
          g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
        y += bh; row++;
      }
    } else if (kind === 'telha') {
      g.fillStyle = '#a4471f'; g.fillRect(0, 0, size, size);
      for (var ry = 0; ry < size; ry += 22) {
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, ry + 18, size, 4);
        for (var rx = 0; rx < size; rx += 18) {
          g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(rx, ry, 2, 22);
          g.fillStyle = 'rgba(120,40,15,.5)'; g.beginPath();
          g.arc(rx + 9, ry + 18, 8, Math.PI, 0, true); g.fill();
        }
      }
    } else if (kind === 'concreto' || kind === 'reboco') {
      var base = kind === 'reboco' ? '#cfc9bd' : '#b9bcc0';
      g.fillStyle = base; g.fillRect(0, 0, size, size);
      speckle(g, size, 2600, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.08)']);
    } else if (kind === 'parede') { // parede pintada lisa (tingível)
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
      speckle(g, size, 1200, ['rgba(0,0,0,.025)', 'rgba(0,0,0,.04)']);
    } else if (kind === 'grama') {
      g.fillStyle = '#5f9b40'; g.fillRect(0, 0, size, size);
      var verdes = ['#6fae49', '#558c38', '#79b94f', '#4d8233', '#86c45a'];
      for (var i = 0; i < 4200; i++) {
        g.fillStyle = verdes[i % verdes.length];
        g.fillRect((i * 71) % size, (i * 113) % size, 2, 3);
      }
    } else if (kind === 'terra') {
      g.fillStyle = '#a9855c'; g.fillRect(0, 0, size, size);
      speckle(g, size, 3000, ['#9c7748', '#b8966a', '#8a6a3e', '#c2a172']);
    } else if (kind === 'madeira') {
      g.fillStyle = '#b3884f'; g.fillRect(0, 0, size, size);
      for (var wy = 0; wy < size; wy += 6) {
        g.fillStyle = (wy % 12) ? 'rgba(90,60,25,.25)' : 'rgba(70,45,18,.35)';
        g.fillRect(0, wy, size, 2);
      }
    } else if (kind === 'areia') {
      g.fillStyle = '#d8c08a'; g.fillRect(0, 0, size, size);
      speckle(g, size, 2600, ['#c9ad72', '#e3cf9d', '#bda062']);
    } else if (kind === 'brita') {
      g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, size, size);
      speckle(g, size, 3200, ['#7c828a', '#b3b9bf', '#6b7077', '#c4c9ce']);
    } else if (kind === 'metal') {
      g.fillStyle = '#7d858d'; g.fillRect(0, 0, size, size);
      for (var mx = 0; mx < size; mx += 16) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(mx, 0, 1, size); }
    } else {
      g.fillStyle = '#cccccc'; g.fillRect(0, 0, size, size);
    }
    var t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding && kind !== 'ceu') t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function px(kind) { if (!TEX[kind]) TEX[kind] = gerarTextura(kind); return TEX[kind]; }

  // ---------- Materiais utilitários ---------------------------
  function mat(color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: color, roughness: opts.r == null ? 0.9 : opts.r, metalness: opts.m || 0,
      transparent: !!opts.t, opacity: opts.o || 1
    });
  }
  // material texturizado: kind + repetições
  function tmat(kind, rx, ry, opts) {
    opts = opts || {};
    var t = px(kind).clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    return new THREE.MeshStandardMaterial({
      map: t, color: opts.color || 0xffffff,
      roughness: opts.r == null ? 0.92 : opts.r, metalness: opts.m || 0,
      transparent: !!opts.t, opacity: opts.o || 1
    });
  }
  function box(w, h, d, m) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  // ---------- Construção principal ----------------------------
  // estagios = Set de strings (ids de 'estagio' concluídos)
  // cfg = { tipo, pavimentos, escala, frente, fundo, canteiro:[], equipe:n, ferramentas:[], emObra:estagio }
  // altura de uma fiada de blocos (modo mão na massa)
  var COURSE_H = 0.34, BLOCK_LEN = 0.7, BASE_Y = 0.5, WALL_ESP = 0.22;

  // calcula o footprint a partir do cfg (usado por construir e pelos tijolos)
  Cena3D.prototype._calcFP = function (cfg) {
    cfg = cfg || {};
    var frente = (cfg.frente || 10), fundo = (cfg.fundo || 20);
    var bw = Math.max(6, Math.min(frente - 2.4, frente * 0.78));
    var bd = Math.max(6, Math.min(fundo * 0.6, fundo - 6));
    return {
      frente: frente, fundo: fundo, bw: bw, bd: bd,
      pav: cfg.pavimentos || 1, hPav: 3.0, tipo: cfg.tipo || 'residencial'
    };
  };

  Cena3D.prototype.construir = function (estagios, cfg) {
    if (!this.ok) return;
    estagios = estagios || new Set();
    cfg = cfg || {};
    this._limpar(this.grupoObra);
    this._limpar(this.grupoCanteiro);
    this._limpar(this.grupoProps);
    if (this.grupoTijolos) this._limpar(this.grupoTijolos);
    this.brick = null;
    this.animados = [];

    var fp = this._calcFP(cfg);
    var frente = fp.frente, fundo = fp.fundo, bw = fp.bw, bd = fp.bd,
        pav = fp.pav, hPav = fp.hPav, tipo = fp.tipo;
    this.fp = fp;

    // contorno do lote
    this._lote(frente, fundo);

    // canteiro
    this._montarCanteiro(cfg, frente, fundo);

    var has = function (s) { return estagios.has(s); };

    if (has('fundacao')) this._fundacao(bw, bd);
    if (has('estrutura')) this._estrutura(bw, bd, pav, hPav, tipo);
    // 1ª fiada = ~1 course; elevação = paredes cheias
    if (has('alvenaria2')) this._paredes(bw, bd, pav, hPav, 1, has('reboco'), tipo);
    else if (has('alvenaria1')) this._paredes(bw, bd, pav, hPav, COURSE_H / (hPav - 0.35), false, tipo);
    if (has('laje')) this._lajes(bw, bd, pav, hPav);
    if (has('cobertura')) this._cobertura(bw, bd, pav, hPav, tipo);
    if (has('esquadrias')) this._esquadrias(bw, bd, pav, hPav);
    if (has('pintura')) this._pintar(tipo);
    if (has('entrega')) this._paisagismo(frente, fundo);

    // equipamentos pesados conforme alugados
    if (cfg.ferramentas) {
      if (cfg.ferramentas.indexOf('grua') >= 0 || cfg.ferramentas.indexOf('guindaste') >= 0)
        this._grua(bw, bd);
      if (cfg.ferramentas.indexOf('munck') >= 0) this._munck(frente);
      if (cfg.ferramentas.indexOf('cacamba') >= 0) this._cacamba(frente, fundo);
    }
    // andaime durante alvenaria/reboco/pintura
    if (cfg.emObra && ['alvenaria2', 'reboco', 'pintura'].indexOf(cfg.emObra) >= 0
        && (cfg.ferramentas || []).indexOf('andaime') >= 0) {
      this._andaime(bw, bd, pav, hPav);
    }

    // trabalhadores
    this._trabalhadores(cfg.equipe || 0, bw, bd);

    // foca a câmera
    this.target.set(0, Math.max(2, pav * hPav * 0.4), 0);
    this.dist = Math.max(34, (Math.max(frente, fundo) + pav * hPav) * 1.7);
    this._clampDist();
    this._atualizaCamera();
  };

  Cena3D.prototype._limpar = function (g) {
    while (g.children.length) {
      var c = g.children.pop();
      if (c.geometry) c.geometry.dispose();
      g.remove(c);
    }
  };

  Cena3D.prototype._lote = function (frente, fundo) {
    var terreno = new THREE.Mesh(
      new THREE.PlaneGeometry(frente, fundo),
      tmat('terra', frente / 3, fundo / 3, { r: 1 })
    );
    terreno.rotation.x = -Math.PI / 2;
    terreno.position.y = 0.01;
    terreno.receiveShadow = true;
    this.grupoObra.add(terreno);
    // cerca/divisa
    var lm = mat(0xddd6c0);
    var e = 0.12, hc = 0.5;
    [[0, fundo / 2], [0, -fundo / 2]].forEach(function (p) {
      var w = box(frente, hc, e, lm); w.position.set(p[0], hc / 2, p[1]); this.grupoObra.add(w);
    }, this);
    [[frente / 2, 0], [-frente / 2, 0]].forEach(function (p) {
      var w = box(e, hc, fundo, lm); w.position.set(p[0], hc / 2, p[1]); this.grupoObra.add(w);
    }, this);
  };

  Cena3D.prototype._montarCanteiro = function (cfg, frente, fundo) {
    var lista = cfg.canteiro || [];
    var x0 = -frente / 2 + 1.6;
    var z0 = fundo / 2 - 2;
    var g = this.grupoCanteiro;
    var self = this;
    function put(mesh, dx, dz) { mesh.position.x += dx; mesh.position.z += dz; g.add(mesh); }

    if (lista.indexOf('tapume') >= 0) {
      var tm = mat(0x2e6f9e);
      var hh = 2.0;
      [[0, fundo / 2 + 0.1, frente, 0.12], [0, -fundo / 2 - 0.1, frente, 0.12],
       [frente / 2 + 0.1, 0, 0.12, fundo], [-frente / 2 - 0.1, 0, 0.12, fundo]].forEach(function (p) {
        var w = box(p[2], hh, p[3], tm); w.position.set(p[0], hh / 2, p[1]); g.add(w);
      });
    }
    if (lista.indexOf('barracao') >= 0) {
      var b = box(4, 2.4, 3, mat(0xc8552b)); b.position.set(x0, 1.2, z0); g.add(b);
      var tel = box(4.4, 0.2, 3.4, mat(0x8a8f98)); tel.position.set(x0, 2.5, z0); g.add(tel);
    }
    if (lista.indexOf('escritorio') >= 0) {
      var o = box(3, 2.6, 2.6, mat(0xeef2f6)); o.position.set(x0 + 5, 1.3, z0); g.add(o);
      var j = box(0.05, 0.8, 1.4, mat(0x2e6f9e)); j.position.set(x0 + 5 + 1.5, 1.5, z0); g.add(j);
    }
    if (lista.indexOf('vivencia') >= 0) {
      var v = box(3.4, 2.4, 2.6, mat(0xf2c14e)); v.position.set(x0, 1.2, z0 - 4); g.add(v);
    }
    if (lista.indexOf('banheiro') >= 0) {
      var ban = box(1.2, 2.2, 1.2, mat(0x16a34a)); ban.position.set(x0 + 4.5, 1.1, z0 - 4); g.add(ban);
    }
    if (lista.indexOf('caixa_dagua') >= 0) {
      var tor = box(0.3, 4, 0.3, mat(0x8a8f98)); tor.position.set(frente / 2 - 2, 2, z0); g.add(tor);
      var cx = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 16), mat(0x2e6f9e));
      cx.position.set(frente / 2 - 2, 4.6, z0); cx.castShadow = true; g.add(cx);
    }
    if (lista.indexOf('baia') >= 0) {
      this._pilhaAgregado(x0 + 2, z0 + 4, 'areia');
      this._pilhaAgregado(x0 + 4.5, z0 + 4, 'brita');
    }
    // pilhas de blocos e sacos de cimento sempre que tiver insumo no canteiro
    if (cfg.insumosNoCanteiro) {
      this._pilhaBlocos(frente / 2 - 4, z0 + 3);
      this._pilhaSacos(frente / 2 - 6, z0 + 3);
    }
    // betoneira se comprada/alugada
    if ((cfg.ferramentas || []).indexOf('betoneira') >= 0) {
      this._betoneira(x0 + 3, z0 + 1.5);
    }
    if ((cfg.ferramentas || []).indexOf('carrinho') >= 0) {
      this._carrinho(2, fundo / 2 - 4);
    }
  };

  Cena3D.prototype._pilhaAgregado = function (x, z, kind) {
    var m = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 10), tmat(kind, 2, 2, { r: 1 }));
    m.position.set(x, 0.7, z); m.castShadow = true; m.receiveShadow = true; this.grupoCanteiro.add(m);
  };
  Cena3D.prototype._pilhaBlocos = function (x, z) {
    var bm = tmat('tijolo', 1, 1);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 4; j++) {
      var b = box(0.4, 0.2, 0.9, bm);
      b.position.set(x + i * 0.45, 0.1 + Math.floor(j / 2) * 0.22, z + (j % 2) * 0.95);
      this.grupoCanteiro.add(b);
    }
  };
  Cena3D.prototype._pilhaSacos = function (x, z) {
    var sm = mat(0xb9b3a0);
    for (var i = 0; i < 4; i++) {
      var s = box(0.7, 0.25, 0.5, sm);
      s.position.set(x, 0.13 + i * 0.26, z); s.rotation.y = (i % 2) * 0.2;
      this.grupoCanteiro.add(s);
    }
  };
  Cena3D.prototype._betoneira = function (x, z) {
    var grp = new THREE.Group();
    var base = box(1.2, 0.5, 1, mat(0xf59e0b)); base.position.y = 0.25; grp.add(base);
    var drum = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.9, 14), mat(0xf2c14e));
    drum.rotation.x = Math.PI / 2.6; drum.position.set(0, 1.1, 0); drum.castShadow = true;
    grp.add(drum);
    grp.position.set(x, 0, z);
    this.grupoCanteiro.add(grp);
    this.animados.push({ mesh: drum, tipo: 'betoneira' });
  };
  Cena3D.prototype._carrinho = function (x, z) {
    var grp = new THREE.Group();
    var caçamba = box(0.9, 0.4, 0.6, mat(0xdc2626)); caçamba.position.y = 0.45; grp.add(caçamba);
    var roda = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12), mat(0x222222));
    roda.rotation.z = Math.PI / 2; roda.position.set(0.4, 0.22, 0); grp.add(roda);
    grp.position.set(x, 0, z);
    this.grupoCanteiro.add(grp);
  };

  // ---------- Elementos da edificação -------------------------
  Cena3D.prototype._fundacao = function (bw, bd) {
    var m = tmat('concreto', 1, 1, { r: 0.95 });
    var nx = Math.max(2, Math.round(bw / 4)), nz = Math.max(2, Math.round(bd / 4));
    for (var i = 0; i <= nx; i++) for (var j = 0; j <= nz; j++) {
      var x = -bw / 2 + (bw / nx) * i;
      var z = -bd / 2 + (bd / nz) * j;
      var sap = box(1, 0.5, 1, m); sap.position.set(x, 0.25, z); this.grupoObra.add(sap);
    }
    // baldrame perimetral
    this._perimetro(bw, bd, 0.4, 0.4, 0.55, m);
  };

  Cena3D.prototype._perimetro = function (bw, bd, hbase, h, esp, m) {
    var y = hbase + h / 2;
    var a = box(bw, h, esp, m); a.position.set(0, y, bd / 2); this.grupoObra.add(a);
    var b = box(bw, h, esp, m); b.position.set(0, y, -bd / 2); this.grupoObra.add(b);
    var c = box(esp, h, bd, m); c.position.set(bw / 2, y, 0); this.grupoObra.add(c);
    var d = box(esp, h, bd, m); d.position.set(-bw / 2, y, 0); this.grupoObra.add(d);
  };

  Cena3D.prototype._estrutura = function (bw, bd, pav, hPav, tipo) {
    var m = tipo === 'industrial' ? tmat('metal', 2, 4, { r: 0.55, m: 0.6, color: 0xb0b6bd })
                                  : tmat('concreto', 1, 3, { r: 0.9 });
    var cols = [[bw / 2, bd / 2], [-bw / 2, bd / 2], [bw / 2, -bd / 2], [-bw / 2, -bd / 2],
                [0, bd / 2], [0, -bd / 2], [bw / 2, 0], [-bw / 2, 0]];
    var esp = tipo === 'industrial' ? 0.6 : 0.4;
    var totalH = pav * hPav;
    for (var c = 0; c < cols.length; c++) {
      var pil = box(esp, totalH, esp, m);
      pil.position.set(cols[c][0], 0.5 + totalH / 2, cols[c][1]);
      this.grupoObra.add(pil);
    }
    // vigas por pavimento
    for (var p = 1; p <= pav; p++) {
      var y = 0.5 + p * hPav - 0.2;
      var v1 = box(bw, 0.35, esp, m); v1.position.set(0, y, bd / 2); this.grupoObra.add(v1);
      var v2 = box(bw, 0.35, esp, m); v2.position.set(0, y, -bd / 2); this.grupoObra.add(v2);
      var v3 = box(esp, 0.35, bd, m); v3.position.set(bw / 2, y, 0); this.grupoObra.add(v3);
      var v4 = box(esp, 0.35, bd, m); v4.position.set(-bw / 2, y, 0); this.grupoObra.add(v4);
    }
  };

  Cena3D.prototype._paredes = function (bw, bd, pav, hPav, frac, rebocado, tipo) {
    if (tipo === 'industrial') { this._fechamentoIndustrial(bw, bd, hPav * 2.2, rebocado); return; }
    var kind = rebocado ? 'reboco' : 'tijolo';
    this.corParede = rebocado ? 0xcfcabb : 0xb5572f;
    var esp = 0.22, self = this;
    function parede(lenVis, hParede, w, d, x, y, z) {
      var rx = rebocado ? lenVis / 2.4 : lenVis / 1.7;   // ~tile a cada 1,7m (tijolo)
      var ry = rebocado ? hParede / 2.4 : hParede / 1.0;
      var wmesh = box(w, hParede, d, tmat(kind, Math.max(1, rx), Math.max(1, ry)));
      wmesh.position.set(x, y, z); self.grupoObra.add(wmesh); wmesh.userData.parede = true;
    }
    for (var p = 0; p < pav; p++) {
      var hParede = (hPav - 0.35) * frac;
      var yc = 0.5 + p * hPav + hParede / 2;
      parede(bw, hParede, bw, esp, 0, yc, bd / 2);
      parede(bw, hParede, bw, esp, 0, yc, -bd / 2);
      parede(bd, hParede, esp, bd, bw / 2, yc, 0);
      parede(bd, hParede, esp, bd, -bw / 2, yc, 0);
      if (frac >= 1) parede(bw * 0.6, hParede, bw * 0.6, esp, -bw * 0.1, yc, 0); // divisória
    }
  };

  Cena3D.prototype._fechamentoIndustrial = function (bw, bd, h, rebocado) {
    var cor = rebocado ? 0xe2e6ea : 0xc6ccd2;
    var esp = 0.2, yc = 0.5 + h / 2, self = this;
    function painel(lenVis, w, d, x, z) {
      var wmesh = box(w, h, d, tmat('reboco', Math.max(1, lenVis / 3), Math.max(1, h / 3), { color: cor }));
      wmesh.position.set(x, yc, z); self.grupoObra.add(wmesh); wmesh.userData.parede = true;
    }
    painel(bw, bw, esp, 0, bd / 2); painel(bw, bw, esp, 0, -bd / 2);
    painel(bd, esp, bd, bw / 2, 0); painel(bd, esp, bd, -bw / 2, 0);
    this.corParede = cor;
  };

  Cena3D.prototype._lajes = function (bw, bd, pav, hPav) {
    for (var p = 1; p <= pav; p++) {
      var laje = box(bw + 0.3, 0.25, bd + 0.3, tmat('concreto', bw / 3, bd / 3, { r: 0.92 }));
      laje.position.set(0, 0.5 + p * hPav, 0); this.grupoObra.add(laje);
    }
  };

  Cena3D.prototype._cobertura = function (bw, bd, pav, hPav, tipo) {
    var topo = 0.5 + pav * hPav;
    if (tipo === 'industrial' || tipo === 'predial') {
      // telhado metálico levemente inclinado
      var m = tmat('metal', bw / 2, bd / 2, { r: 0.5, m: 0.55, color: 0x6b7682 });
      var cob = box(bw + 1, 0.18, bd + 1, m);
      cob.position.set(0, topo + 0.5, 0); cob.rotation.z = 0.04; this.grupoObra.add(cob);
      // platibanda
      this._perimetro(bw + 0.6, bd + 0.6, topo, 0.5, 0.2, tmat('reboco', 2, 1, { color: this.corParede || 0xdfe7ee }));
      if (tipo === 'predial') {
        var cx = box(2, 1.4, 2, mat(0x8a8f98)); cx.position.set(bw / 3, topo + 1.3, 0); this.grupoObra.add(cx);
      }
      return;
    }
    // telhado cerâmico de 2 águas (textura de telha)
    var altura = Math.min(2.4, bw * 0.28);
    var meia = bw / 2 + 0.55;
    var lado = Math.hypot(meia, altura);
    var ang = Math.atan2(altura, meia);
    var beiral = bd + 1.1;
    var mt = tmat('telha', lado / 0.9, beiral / 0.9, { r: 0.8 });
    var agua1 = box(lado, 0.14, beiral, mt);
    agua1.position.set(-meia / 2, topo + altura / 2, 0); agua1.rotation.z = ang; this.grupoObra.add(agua1);
    var agua2 = box(lado, 0.14, beiral, mt);
    agua2.position.set(meia / 2, topo + altura / 2, 0); agua2.rotation.z = -ang; this.grupoObra.add(agua2);
    // cumeeira
    var cume = box(0.3, 0.18, beiral, mat(0x8a3c1f, { r: 0.8 }));
    cume.position.set(0, topo + altura, 0); this.grupoObra.add(cume);
    // oitões (frontão triangular)
    var ot = tmat('reboco', 2, 1, { color: this.corParede || 0xcfcabb });
    var tri = new THREE.Shape();
    tri.moveTo(-bw / 2 - 0.5, 0); tri.lineTo(bw / 2 + 0.5, 0); tri.lineTo(0, altura); tri.lineTo(-bw / 2 - 0.5, 0);
    var geo = new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false });
    [bd / 2, -bd / 2].forEach(function (z) {
      var fr = new THREE.Mesh(geo, ot);
      fr.position.set(0, topo, z - 0.09); fr.castShadow = true; this.grupoObra.add(fr);
    }, this);
  };

  Cena3D.prototype._esquadrias = function (bw, bd, pav, hPav) {
    var vidro = new THREE.MeshStandardMaterial({ color: 0x9fd0ec, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 });
    var caixilho = mat(0x3a4046, { r: 0.6, m: 0.4 });
    var porta = tmat('madeira', 1, 2, { r: 0.7 });
    var self = this;
    function janela(x, y, z, ry, larg) {
      var fr = box(larg + 0.12, 1.22, 0.08, caixilho);
      fr.position.set(x, y, z); fr.rotation.y = ry; self.grupoObra.add(fr);
      var v = box(larg, 1.04, 0.04, vidro);
      v.position.set(x + Math.sin(ry) * 0.05, y, z + Math.cos(ry) * 0.05); v.rotation.y = ry;
      self.grupoObra.add(v);
      var peit = box(larg + 0.18, 0.08, 0.16, mat(0xd8d8d8));
      peit.position.set(x, y - 0.6, z); peit.rotation.y = ry; self.grupoObra.add(peit);
    }
    for (var p = 0; p < pav; p++) {
      var y = 0.5 + p * hPav + 1.4;
      for (var i = -1; i <= 1; i++) {
        janela(i * (bw / 3), y, bd / 2 + 0.04, 0, 1.2);
        janela(bw / 2 + 0.04, y, i * (bd / 3), Math.PI / 2, 1.2);
      }
      if (p === 0) {
        var batente = box(1.18, 2.22, 0.1, caixilho);
        batente.position.set(bw / 4, 0.5 + 1.1, bd / 2 + 0.03); this.grupoObra.add(batente);
        var pt = box(1, 2.1, 0.08, porta);
        pt.position.set(bw / 4, 0.5 + 1.05, bd / 2 + 0.06); this.grupoObra.add(pt);
        var maca = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xd4af37, { m: 0.7, r: 0.3 }));
        maca.position.set(bw / 4 + 0.38, 0.5 + 1.0, bd / 2 + 0.11); this.grupoObra.add(maca);
      }
    }
  };

  Cena3D.prototype._pintar = function (tipo) {
    var paleta = { residencial: 0xf2e8d5, predial: 0xdfe7ee, industrial: 0xeef1f4 };
    var cor = paleta[tipo] || 0xf2e8d5;
    this.grupoObra.traverse(function (o) {
      if (o.userData && o.userData.parede && o.material) {
        var rx = (o.material.map && o.material.map.repeat) ? o.material.map.repeat.x : 2;
        var ry = (o.material.map && o.material.map.repeat) ? o.material.map.repeat.y : 2;
        o.material = tmat('parede', rx, ry, { color: cor, r: 0.85 });
      }
    });
  };

  Cena3D.prototype._paisagismo = function (frente, fundo) {
    // árvore
    var tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 8), mat(0x6b4423));
    tronco.position.set(frente / 2 - 1.5, 0.7, -fundo / 2 + 2); tronco.castShadow = true;
    this.grupoObra.add(tronco);
    var copa = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat(0x3f9142));
    copa.position.set(frente / 2 - 1.5, 1.9, -fundo / 2 + 2); copa.castShadow = true;
    this.grupoObra.add(copa);
    // calçada
    var cal = box(frente, 0.08, 1.4, mat(0xcfd3d7));
    cal.position.set(0, 0.05, fundo / 2 - 0.7); this.grupoObra.add(cal);
    // bandeira de obra concluída
    var mastro = box(0.08, 3, 0.08, mat(0xcccccc));
    mastro.position.set(-frente / 2 + 1, 1.5, fundo / 2 - 1); this.grupoObra.add(mastro);
    var flag = box(1.2, 0.7, 0.05, mat(0x16a34a));
    flag.position.set(-frente / 2 + 1.7, 2.7, fundo / 2 - 1); this.grupoObra.add(flag);
    this.animados.push({ mesh: flag, tipo: 'flag' });
  };

  // ---------- Equipamentos pesados ----------------------------
  Cena3D.prototype._grua = function (bw, bd) {
    var grp = new THREE.Group();
    var mastH = (this.fp ? this.fp.pav * this.fp.hPav : 6) + 8;
    var mastro = box(0.6, mastH, 0.6, mat(0xf2c14e)); mastro.position.y = mastH / 2; grp.add(mastro);
    var lanca = new THREE.Group();
    var braco = box(16, 0.4, 0.4, mat(0xf2c14e)); braco.position.set(5, 0, 0); lanca.add(braco);
    var contra = box(4, 0.4, 0.4, mat(0xf2c14e)); contra.position.set(-2.5, 0, 0); lanca.add(contra);
    var cabo = box(0.05, 3, 0.05, mat(0x333333)); cabo.position.set(11, -1.5, 0); lanca.add(cabo);
    lanca.position.y = mastH; grp.add(lanca);
    grp.position.set(bw / 2 + 5, 0, -bd / 2 - 3);
    this.grupoProps.add(grp);
    this.animados.push({ mesh: lanca, tipo: 'grua' });
  };

  Cena3D.prototype._munck = function (frente) {
    var grp = new THREE.Group();
    var cab = box(2, 1.6, 2.4, mat(0x2e6f9e)); cab.position.set(-2.5, 1, 0); grp.add(cab);
    var carr = box(4, 0.8, 2.4, mat(0x1c4b73)); carr.position.set(1, 0.7, 0); grp.add(carr);
    var braco = box(4, 0.3, 0.3, mat(0xf59e0b)); braco.position.set(1, 1.8, 0); braco.rotation.z = 0.5; grp.add(braco);
    [[-2.5, 1], [-2.5, -1], [1.5, 1], [1.5, -1]].forEach(function (p) {
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), mat(0x111111));
      r.rotation.x = Math.PI / 2; r.position.set(p[0], 0.5, p[1]); grp.add(r);
    });
    grp.position.set(-frente / 2 - 4, 0, 0);
    this.grupoProps.add(grp);
  };

  Cena3D.prototype._cacamba = function (frente, fundo) {
    var c = box(3, 1.2, 1.6, mat(0xf59e0b));
    c.position.set(-frente / 2 + 2.5, 0.6, -fundo / 2 + 2);
    this.grupoProps.add(c);
  };

  Cena3D.prototype._andaime = function (bw, bd, pav, hPav) {
    var m = mat(0x3b82c4);
    var H = pav * hPav + 0.5;
    var fz = bd / 2 + 0.6;
    for (var x = -bw / 2; x <= bw / 2; x += 2) {
      var p1 = box(0.08, H, 0.08, m); p1.position.set(x, H / 2, fz); this.grupoProps.add(p1);
      var p2 = box(0.08, H, 0.08, m); p2.position.set(x, H / 2, fz + 0.8); this.grupoProps.add(p2);
    }
    for (var lvl = 1; lvl * 2 <= H; lvl++) {
      var plat = box(bw, 0.06, 0.8, mat(0xc8a45a));
      plat.position.set(0, lvl * 2, fz + 0.4); this.grupoProps.add(plat);
      var trav = box(bw, 0.05, 0.05, m); trav.position.set(0, lvl * 2 + 0.9, fz); this.grupoProps.add(trav);
    }
  };

  Cena3D.prototype._trabalhadores = function (n, bw, bd) {
    n = Math.min(n, 14);
    var cores = [0xf59e0b, 0x16a34a, 0x2e6f9e, 0xdc2626, 0xeab308];
    for (var i = 0; i < n; i++) {
      var grp = new THREE.Group();
      var cor = cores[i % cores.length];
      var corpo = box(0.4, 0.7, 0.3, mat(cor)); corpo.position.y = 0.6; grp.add(corpo);
      var cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xe8b58b));
      cabeca.position.y = 1.1; grp.add(cabeca);
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c14e));
      cap.position.y = 1.18; grp.add(cap);
      var ang = (i / n) * Math.PI * 2;
      var rx = (bw / 2 + 1.5) * Math.cos(ang) * (0.6 + (i % 3) * 0.15);
      var rz = (bd / 2 + 1.5) * Math.sin(ang) * (0.6 + (i % 2) * 0.2);
      grp.position.set(rx, 0, rz);
      grp.castShadow = true;
      this.grupoProps.add(grp);
      this.animados.push({ mesh: grp, tipo: 'worker', base: 0, fase: i });
    }
  };

  // ============ MODO MÃO NA MASSA (assentar tijolos) ============
  // número total de fiadas de uma parede cheia
  Cena3D.prototype.calcularFiadas = function (cfg) {
    var fp = this._calcFP(cfg);
    return Math.max(1, Math.round((fp.pav * fp.hPav - 0.35) / COURSE_H));
  };

  // prepara a sessão de assentamento para as fiadas [deFiada, ateFiada)
  Cena3D.prototype.iniciarTijolos = function (cfg, deFiada, ateFiada) {
    if (!this.ok) return { total: 0, fiadas: 0 };
    this._limpar(this.grupoTijolos);
    var fp = this._calcFP(cfg);
    var bw = fp.bw, bd = fp.bd;
    var lados = [
      { len: bw, x: 0, z: bd / 2, horiz: true },
      { len: bw, x: 0, z: -bd / 2, horiz: true },
      { len: bd, x: bw / 2, z: 0, horiz: false },
      { len: bd, x: -bw / 2, z: 0, horiz: false }
    ];
    var slots = [];
    for (var c = deFiada; c < ateFiada; c++) {
      var y = BASE_Y + c * COURSE_H + COURSE_H / 2;
      var stagger = (c % 2) ? BLOCK_LEN / 2 : 0;
      for (var L = 0; L < lados.length; L++) {
        var lado = lados[L];
        var n = Math.max(1, Math.round(lado.len / BLOCK_LEN));
        var seg = lado.len / n;
        for (var i = 0; i < n; i++) {
          var t = -lado.len / 2 + seg * (i + 0.5);
          var px, pz;
          if (lado.horiz) { px = lado.x + t; pz = lado.z; }
          else { px = lado.x; pz = lado.z + t; }
          slots.push({
            x: px, y: y, z: pz,
            w: lado.horiz ? seg * 0.94 : WALL_ESP,
            d: lado.horiz ? WALL_ESP : seg * 0.94,
            fiada: c, par: (i + c) % 2
          });
        }
      }
    }
    this.brick = { slots: slots, placed: 0, de: deFiada, ate: ateFiada };
    return { total: slots.length, fiadas: ateFiada - deFiada };
  };

  Cena3D.prototype._assentarUm = function () {
    var b = this.brick;
    if (!b || b.placed >= b.slots.length) return false;
    var s = b.slots[b.placed];
    var cor = s.par ? 0xb5572f : 0xc06a3c;
    var m = box(s.w, COURSE_H * 0.88, s.d, mat(cor));
    m.position.set(s.x, s.y, s.z);
    this.grupoTijolos.add(m);
    b.placed++;
    return true;
  };

  // assenta 1 bloco
  Cena3D.prototype.assentarBloco = function () { this._assentarUm(); return this.estadoTijolos(); };
  // assenta a fiada atual inteira
  Cena3D.prototype.assentarFiada = function () {
    var b = this.brick; if (!b) return this.estadoTijolos();
    if (b.placed >= b.slots.length) return this.estadoTijolos();
    var atual = b.slots[b.placed].fiada;
    while (b.placed < b.slots.length && b.slots[b.placed].fiada === atual) this._assentarUm();
    return this.estadoTijolos();
  };
  // assenta tudo que falta
  Cena3D.prototype.assentarTudo = function () {
    var b = this.brick; if (!b) return this.estadoTijolos();
    while (b.placed < b.slots.length) this._assentarUm();
    return this.estadoTijolos();
  };

  Cena3D.prototype.estadoTijolos = function () {
    var b = this.brick;
    if (!b) return { placed: 0, total: 0, completo: true, fiadaAtual: 0, fiadasTotal: 0 };
    var idx = Math.min(b.placed, b.slots.length - 1);
    var fiadaAtual = b.slots.length ? (b.slots[idx].fiada - b.de + 1) : 0;
    return {
      placed: b.placed, total: b.slots.length,
      completo: b.placed >= b.slots.length,
      fiadaAtual: fiadaAtual, fiadasTotal: b.ate - b.de
    };
  };

  Cena3D.prototype.destruir = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
  };

  global.Cena3D = Cena3D;
})(window);
