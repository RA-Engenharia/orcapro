/* ============================================================
   OrçaPro — Construtor 3D : ÁUDIO
   Sons sintetizados via Web Audio API (sem arquivos externos).
   Efeitos: martelo, betoneira (loop), serra, dinheiro, sucesso,
   erro, chuva (loop), clique.
   ============================================================ */
(function (global) {
  'use strict';

  var ctx = null, master = null;
  var mudo = false;
  var loops = {};

  function init() {
    if (ctx) return true;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { return false; }
    return true;
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function env(node, t0, a, d, peak) {
    var g = node;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tom(freq, dur, tipo, peak, quando) {
    if (!ctx || mudo) return;
    var t0 = ctx.currentTime + (quando || 0);
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = tipo || 'sine'; osc.frequency.value = freq;
    env(g, t0, 0.008, dur, peak || 0.3);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // ruído branco curto (impacto/serra)
  function ruido(dur, peak, filtroFreq, quando) {
    if (!ctx || mudo) return null;
    var t0 = ctx.currentTime + (quando || 0);
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filtroFreq || 1200;
    env(g, t0, 0.006, dur, peak || 0.25);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return { src: src, g: g };
  }

  var API = {
    ativar: function () { if (init()) resume(); },
    mudo: function () { return mudo; },
    toggleMudo: function () {
      mudo = !mudo;
      if (mudo) { API.pararTodos(); }
      try { localStorage.setItem('orcapro_mudo', mudo ? '1' : '0'); } catch (e) {}
      return mudo;
    },
    carregarPref: function () {
      try { mudo = localStorage.getItem('orcapro_mudo') === '1'; } catch (e) {}
      return mudo;
    },

    // --- efeitos pontuais ---
    martelo: function () { ruido(0.09, 0.35, 2200); tom(180, 0.08, 'square', 0.12); },
    tijolo: function () { ruido(0.07, 0.28, 900); tom(120, 0.06, 'sine', 0.1); },
    clique: function () { tom(660, 0.05, 'triangle', 0.14); },
    serra: function () { ruido(0.25, 0.2, 3000); },
    dinheiro: function () {
      [880, 1320, 1760].forEach(function (f, i) { tom(f, 0.12, 'triangle', 0.18, i * 0.06); });
    },
    sucesso: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tom(f, 0.22, 'sine', 0.22, i * 0.12); });
    },
    erro: function () { tom(200, 0.18, 'sawtooth', 0.2); tom(150, 0.22, 'sawtooth', 0.18, 0.08); },
    alerta: function () { tom(440, 0.12, 'square', 0.18); tom(440, 0.12, 'square', 0.18, 0.18); },

    // --- loops (betoneira, chuva) ---
    betoneira: function (on) {
      if (!init()) return;
      if (on && !loops.betoneira && !mudo) {
        var osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = 55;
        lfo.type = 'sine'; lfo.frequency.value = 6; lg.gain.value = 8;
        lfo.connect(lg); lg.connect(osc.frequency);
        g.gain.value = 0.06;
        osc.connect(g); g.connect(master);
        osc.start(); lfo.start();
        loops.betoneira = { osc: osc, lfo: lfo, g: g };
      } else if (!on && loops.betoneira) {
        try { loops.betoneira.osc.stop(); loops.betoneira.lfo.stop(); } catch (e) {}
        loops.betoneira = null;
      }
    },
    chuva: function (on) {
      if (!init()) return;
      if (on && !loops.chuva && !mudo) {
        var n = Math.floor(ctx.sampleRate * 1.2);
        var buf = ctx.createBuffer(1, n, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
        var g = ctx.createGain(); g.gain.value = 0.08;
        src.connect(f); f.connect(g); g.connect(master);
        src.start();
        loops.chuva = { src: src, g: g };
      } else if (!on && loops.chuva) {
        try { loops.chuva.src.stop(); } catch (e) {}
        loops.chuva = null;
      }
    },

    pararTodos: function () {
      Object.keys(loops).forEach(function (k) {
        if (loops[k]) { try { (loops[k].osc || loops[k].src).stop(); if (loops[k].lfo) loops[k].lfo.stop(); } catch (e) {} loops[k] = null; }
      });
    }
  };

  global.AUDIO = API;
})(window);
