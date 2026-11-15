/* =====================================================================
 * bimdesempenho.js — O BIM SE AJUSTA À MÁQUINA (14/11/2026).
 *
 * ⚠ ROTEIRO DO DEFEITO. Pedido do Rogério em 14/11/2026: "alguns clientes estão
 * reclamando... fui testar no Mac, estava travando o Mac dele". Medido no código e
 * nos diag/ do PC dele:
 *  1. O laço do 3D (js/bim.js, tick) desenhava a cena INTEIRA 60 vezes por segundo
 *     mesmo com ninguém mexendo: placa de vídeo e processador ocupados o tempo todo,
 *     ventilador no máximo no notebook e no Mac.
 *  2. Toda máquina recebia a mesma qualidade: sombra suave (PCFSoft, mapa 2048),
 *     bordas suaves e resolução até 2× — na tela Retina do Mac são 4× os pixels
 *     de uma tela comum, numa placa integrada.
 * Este motor decide, sem tocar na cena:
 *  - a CLASSE da máquina (forte / média / leve) pelo nome da placa de vídeo, núcleos,
 *    memória e densidade da tela → a qualidade de partida;
 *  - o REGULADOR: mede o tempo entre quadros enquanto a pessoa mexe e baixa (ou
 *    devolve) a resolução de desenho, com folga para não ficar oscilando;
 *  - o OCIOSO: quando ninguém mexe há 2 s e a cena não mudou, desenha 5 vezes por
 *    segundo em vez de 60. ⚠ Nunca PARA de desenhar: uma mudança que nenhum aviso
 *    pegou aparece em no máximo 0,2 s — a tela nunca fica presa no quadro velho.
 * A preferência da pessoa (auto / qualidade / economia) fica em
 * localStorage "orcapro:bim:desempenho" — por aparelho, porque é da máquina.
 * Motor puro: a fiação é no js/bim.js (criarRenderer, tick).
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE_PREF = "orcapro:bim:desempenho";
  var PREFS = ["auto", "qualidade", "economia"];

  /* nome da placa (WEBGL_debug_renderer_info) → "forte" | "media" | "fraca" | "software".
     A ordem importa: "Radeon RX" é dedicada, "Radeon(TM) Graphics" é a integrada do Ryzen. */
  function classificarGpu(nome) {
    var n = String(nome || "").toLowerCase();
    if (!n) return "media";   /* o navegador escondeu o nome: não dá para afirmar fraca */
    if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(n)) return "software";
    if (/rtx|gtx\s*1[0-9]{3}|gtx\s*9[0-9]{2}|quadro|radeon\s*(rx|pro)|arc\s*a[0-9]|apple m[1-9]\s*(pro|max|ultra)|tesla|titan/.test(n)) return "forte";
    if (/apple m[1-9]|apple gpu|iris(\(r\))?\s*xe|radeon\s*(\(tm\)\s*)?(graphics|vega)|mx\s*[1-9][0-9]{2}|gtx/.test(n)) return "media";
    if (/intel.*(hd|uhd)|mali|adreno|powervr|apple a[0-9]|videocore|intel/.test(n)) return "fraca";
    return "media";
  }

  /* d = { gpu, nucleos, memoriaGB, dpr, movel, pref } → perfil de partida */
  function perfil(d) {
    d = d || {};
    var g = classificarGpu(d.gpu), nuc = +d.nucleos || 4, mem = +d.memoriaGB || 0, dpr = +d.dpr || 1;
    var classe;
    if (g === "software") classe = "leve";
    else if (g === "forte" && nuc >= 6 && (!mem || mem >= 8)) classe = "forte";
    else if (g === "fraca" || d.movel || nuc <= 2 || (mem && mem <= 4)) classe = "leve";
    else classe = "media";
    var pref = PREFS.indexOf(d.pref) >= 0 ? d.pref : "auto";
    if (pref === "qualidade") classe = "forte";
    if (pref === "economia") classe = "leve";
    var cfg = {
      forte: { prMax: 2, prMin: 1, sombra: "suave", mapaSombra: 2048, antialias: true },
      media: { prMax: 1.5, prMin: 1, sombra: "suave", mapaSombra: 2048, antialias: true },
      leve: { prMax: 1, prMin: 0.75, sombra: "simples", mapaSombra: 1024, antialias: false }
    }[classe];
    return {
      classe: classe, gpuClasse: g, pref: pref,
      /* ⚠ nunca acima da densidade real da tela: 2× numa tela 1× é só custo */
      pixelRatio: Math.max(cfg.prMin, Math.min(dpr, cfg.prMax)),
      prMax: Math.min(Math.max(dpr, 1), cfg.prMax), prMin: cfg.prMin,
      sombra: cfg.sombra, mapaSombra: cfg.mapaSombra, antialias: cfg.antialias,
      /* "qualidade" é escolha da pessoa: o regulador não baixa a resolução por conta própria */
      regular: pref !== "qualidade"
    };
  }

  /* REGULADOR — o = { prIni, prMin, prMax, passo }. anotar(dtSeg) a cada quadro DESENHADO
     enquanto há atividade; devolve o pixelRatio novo quando muda, senão null. */
  function Regulador(o) {
    o = o || {};
    this.pr = +o.prIni || 1; this.prMin = +o.prMin || 0.75; this.prMax = +o.prMax || 2;
    this.passo = +o.passo || 0.25; this.janela = +o.janela || 45;
    this.lento = +o.lento || (1 / 40); this.folga = +o.folga || (1 / 57);
    this.amostras = []; this.bons = 0;
  }
  Regulador.prototype.anotar = function (dt) {
    dt = +dt;
    if (!(dt > 0) || dt > 0.5) return null;   /* aba escondida / pausa: não é o desenho */
    this.amostras.push(dt);
    if (this.amostras.length < this.janela) return null;
    var a = this.amostras.slice().sort(function (x, y) { return x - y; }), med = a[a.length >> 1];
    this.amostras.length = 0;
    if (med > this.lento && this.pr > this.prMin) {
      this.bons = 0;
      this.pr = Math.max(this.prMin, Math.round((this.pr - this.passo) * 100) / 100);
      return this.pr;
    }
    /* ⚠ sobe devagar (3 janelas seguidas com folga): subir e descer a cada janela é tremor na tela */
    if (med < this.folga && this.pr < this.prMax) {
      if (++this.bons >= 3) { this.bons = 0; this.pr = Math.min(this.prMax, Math.round((this.pr + this.passo) * 100) / 100); return this.pr; }
    } else this.bons = 0;
    return null;
  };

  /* OCIOSO — e = { agora, atividade, mudou, ultimoDesenho, sempre } (ms).
     true = desenhar este quadro. */
  var OCIOSO_APOS_MS = 2000, OCIOSO_INTERVALO_MS = 200;
  function deveDesenhar(e) {
    if (!e || e.sempre) return true;
    var agora = +e.agora || 0;
    if (agora - (+e.atividade || 0) < OCIOSO_APOS_MS) return true;
    if (agora - (+e.mudou || 0) < OCIOSO_APOS_MS) return true;
    return agora - (+e.ultimoDesenho || 0) >= OCIOSO_INTERVALO_MS;
  }

  function lerPref() {
    try { var v = global.localStorage && global.localStorage.getItem(CHAVE_PREF); return PREFS.indexOf(v) >= 0 ? v : "auto"; } catch (e) { return "auto"; }
  }
  function gravarPref(v) {
    if (PREFS.indexOf(v) < 0) return false;
    try { global.localStorage.setItem(CHAVE_PREF, v); return true; } catch (e) { return false; }
  }

  /* nome da placa: um contexto descartável (o do 3D ainda não existe quando a qualidade é decidida) */
  function lerGpu(doc) {
    try {
      var cv = (doc || global.document).createElement("canvas");
      var gl = cv.getContext("webgl2") || cv.getContext("webgl");
      if (!gl) return "";
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      var nome = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      /* ⚠ solta o contexto na hora: o navegador mata o MAIS ANTIGO quando passa do teto (ver "O 3D NUNCA FICA PRESO VAZIO") */
      try { var lc = gl.getExtension("WEBGL_lose_context"); if (lc) lc.loseContext(); } catch (e2) {}
      return String(nome || "");
    } catch (e) { return ""; }
  }

  /* o perfil desta máquina (no navegador) */
  function perfilDaMaquina() {
    var nav = global.navigator || {};
    return perfil({
      gpu: lerGpu(), nucleos: nav.hardwareConcurrency, memoriaGB: nav.deviceMemory,
      dpr: global.devicePixelRatio || 1,
      movel: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent || ""),
      pref: lerPref()
    });
  }

  var BimDesempenho = {
    CHAVE_PREF: CHAVE_PREF, PREFS: PREFS, OCIOSO_APOS_MS: OCIOSO_APOS_MS, OCIOSO_INTERVALO_MS: OCIOSO_INTERVALO_MS,
    classificarGpu: classificarGpu, perfil: perfil, Regulador: Regulador, deveDesenhar: deveDesenhar,
    lerPref: lerPref, gravarPref: gravarPref, lerGpu: lerGpu, perfilDaMaquina: perfilDaMaquina
  };
  global.BimDesempenho = BimDesempenho;
  if (typeof module !== "undefined" && module.exports) module.exports = BimDesempenho;
})(typeof window !== "undefined" ? window : this);
