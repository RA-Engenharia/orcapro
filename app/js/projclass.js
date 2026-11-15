/* =====================================================================
 * projclass.js — CLASSIFICADOR de camadas e blocos do projeto (motor PURO, Node-testável). window.ProjClass.
 * Entrada: o resultado do js/dxf.js (camadas, segmentos, inserções). Saída: o que cada camada e cada bloco É
 * (parede, porta, janela, louça com tipo, elétrica, hidráulica, rótulo de ambiente, mobiliário…), com o «Por quê?».
 *
 * Ordem de decisão (a primeira que responde vence):
 *   1. MEMÓRIA do motor (correção do usuário — js/mor/memoria.js, tipo «camada»/«bloco»): vence sempre.
 *   2. NOME (regras em dados: js/projclass-dados.js).
 *   3. ATRIBUTOS do bloco (AMBIENTE, TÍTULO, BTU, ELEVAÇÃO…) — blocos dinâmicos «*U…» não têm nome útil.
 *   4. CAMADA da inserção (bloco sem nome reconhecido numa camada de louças vira louça; o tipo sai do tamanho).
 *   5. GEOMETRIA (só camadas): camada sem nome reconhecido cujos traços formam PARES PARALELOS na espessura
 *      de parede (js/planta3d.js) → parede DEDUZIDA (amarela).
 * ⚠ UM CLIQUE, ZERO PERGUNTAS (decisão do Rogério, 14/11/2026): o que nenhuma regra resolve NÃO vira pergunta —
 *   entra como «não reconhecido», com a contagem, e não vai ao orçamento. A pessoa corrige depois, se quiser, e a
 *   correção vai para a memória (aprender) e vale nas próximas vezes.
 * Sem IA/LLM: só regras determinísticas. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, c) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(c); } catch (e) { return null; } } return null; }
  var D = mod("ProjClassDados", "./projclass-dados.js");
  function sa(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* */ } return t.toLowerCase().replace(/[_]+/g, " ").trim(); }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------------------------------------------------------------- memória (tipo «camada»/«bloco») */
  function chaveMem(tipo, nome) { return tipo + "|" + sa(nome); }
  function daMemoria(mem, tipo, nome) {
    var m = mem && mem.camadas; if (!m) return null;
    var it = m[chaveMem(tipo, nome)];
    return it && it.classe ? it : null;
  }
  /* a correção do usuário: grava e devolve { ok, acao }. Idempotente (mesma classe = reforça). */
  function aprender(mem, tipo, nome, classe, sub, opts) {
    if (!mem || (tipo !== "camada" && tipo !== "bloco") || !sa(nome) || !classe) return { ok: false, motivo: "tipo, nome ou classe ausente" };
    mem.camadas = mem.camadas || {};
    var k = chaveMem(tipo, nome), at = mem.camadas[k], agora = (opts && opts.agora) || new Date().toISOString();
    if (at && at.classe === classe && (at.sub || "") === (sub || "")) { at.usos = (at.usos || 1) + 1; at.ultima = agora; return { ok: true, acao: "reforcado" }; }
    mem.camadas[k] = { tipo: tipo, nome: String(nome), classe: String(classe), sub: String(sub || ""), usos: 1, corrigido: true, ultima: agora };
    return { ok: true, acao: at ? "trocado" : "novo" };
  }

  /* ---------------------------------------------------------------- regra por nome */
  function porNome(nome, alvo) {
    var t = sa(nome); if (!t || !D) return null;
    for (var i = 0; i < D.regras.length; i++) {
      var r = D.regras[i];
      if (r.alvo !== alvo && r.alvo !== "ambos") continue;
      if (r.re.test(t)) return { classe: r.classe, sub: r.sub || "", fonte: "nome", regra: r.regra + " («" + nome + "»)", confianca: "alta" };
    }
    return null;
  }
  function porAtributos(atribs) {
    if (!atribs || !D) return null;
    var ks = Object.keys(atribs);
    for (var i = 0; i < D.atributos.length; i++) {
      var r = D.atributos[i];
      for (var j = 0; j < ks.length; j++) if (r.re.test(sa(ks[j]))) return { classe: r.classe, sub: r.sub || "", fonte: "atributo", regra: r.regra + " (atributo «" + ks[j] + "»)", confianca: "alta" };
    }
    return null;
  }
  function porTamanho(w, h) {
    if (!(w > 0 && h > 0) || !D) return "";
    var a = Math.min(w, h), b = Math.max(w, h);
    for (var i = 0; i < D.tamanhoLouca.length; i++) {
      var f = D.tamanhoLouca[i];
      if (a >= f.min[0] && b >= f.min[1] && a <= f.max[0] && b <= f.max[1]) return f.sub;
    }
    return "";
  }

  /* ---------------------------------------------------------------- uma camada */
  function classificarCamada(nome, mem) {
    var m = daMemoria(mem, "camada", nome);
    if (m) return { classe: m.classe, sub: m.sub || "", fonte: "memoria", regra: "você ensinou: a camada «" + nome + "» é " + m.classe + (m.sub ? " (" + m.sub + ")" : ""), confianca: "alta" };
    var r = porNome(nome, "camada");
    return r && r.classe ? r : { classe: "", sub: "", fonte: "", regra: r ? r.regra : "", confianca: "" };
  }

  /* ---------------------------------------------------------------- um bloco (pela inserção) */
  function classificarBloco(ins, camadas, mem) {
    var nome = ins.nome || "", anonimo = /^\*/.test(nome);
    var m = daMemoria(mem, "bloco", nome);
    if (m && !anonimo) return { classe: m.classe, sub: m.sub || "", fonte: "memoria", regra: "você ensinou: o bloco «" + nome + "» é " + m.classe + (m.sub ? " (" + m.sub + ")" : ""), confianca: "alta" };
    var r = anonimo ? null : porNome(nome, "bloco");
    if (r && r.classe === "porta" && ins.atribs && Object.keys(ins.atribs).some(function (k) { return /textidnt|^tag$|^id$|^codigo$/.test(sa(k)); })) {
      /* etiqueta de esquadria («P21»): conta UMA porta por etiqueta, o tipo vem do texto */
      r.sub = "etiqueta"; r.regra += "; é a ETIQUETA da porta (atributo de identificação), conta 1 porta";
    }
    /* atributo que diz o que o bloco É (AMBIENTE, TÍTULO, BTU…) vence o nome genérico de símbolo («[RotlNivlCt]» = anotação) */
    var ra = porAtributos(ins.atribs);
    if (r && ra && (r.classe === "anotacao" || r.classe === "titulo") && ra.classe !== "anotacao") return ra;
    if (r) return r;
    r = ra;
    if (r) return r;
    var cl = camadas[ins.layer] || classificarCamada(ins.layer, mem);
    if (cl && cl.classe) {
      if (cl.classe === "louca") {
        var sub = porTamanho(ins.w, ins.h);
        return { classe: "louca", sub: sub, fonte: sub ? "camada+tamanho" : "camada", regra: "bloco «" + nome + "» na camada de louças «" + ins.layer + "»" + (sub ? "; tamanho " + (ins.w || 0).toFixed(2) + "×" + (ins.h || 0).toFixed(2) + " m de " + sub : "; o TIPO não sai do nome nem do tamanho"), confianca: sub ? "media" : "baixa" };
      }
      return { classe: cl.classe, sub: cl.sub || "", fonte: "camada", regra: "bloco «" + nome + "» herda a camada «" + ins.layer + "» (" + cl.classe + ")", confianca: "media" };
    }
    return { classe: "", sub: "", fonte: "", regra: "", confianca: "" };
  }

  /* ---------------------------------------------------------------- geometria: camada com pares paralelos = parede */
  function paredePorGeometria(segs, P3) {
    if (!P3 || !P3.detectarParedes) return null;
    var retos = segs.filter(function (s) { if (s.curva) return false; var dx = s.x2 - s.x1, dy = s.y2 - s.y1; return dx * dx + dy * dy >= 0.09; });
    if (retos.length < 10) return null;
    var amostra = retos.length > 1500 ? retos.slice(0, 1500) : retos;   /* amostra estável (ordem do arquivo) — custo quadrático */
    var r = P3.detectarParedes(amostra, { espMin: 0.09, espMax: 0.40 });
    var frac = r.stats.segmentosAnalisados ? r.stats.segmentosUsados / r.stats.segmentosAnalisados : 0;
    var nLig = r.paredes.filter(function (p) { return p.ligada !== false; }).length;
    if (nLig >= 3 && frac >= 0.35) return { frac: frac, n: nLig };
    return null;
  }

  /* ---------------------------------------------------------------- o projeto inteiro */
  function classificar(dx, opts) {
    opts = opts || {};
    var mem = opts.mem || null, P3 = opts.planta3d || mod("Planta3D", "./planta3d.js");
    var camadas = {}, blocos = {}, naoCam = [], naoBl = {};
    var porCamada = {};
    (dx.segmentos || []).forEach(function (s) { (porCamada[s.layer] = porCamada[s.layer] || []).push(s); });
    var nomes = {}; Object.keys(dx.layers || {}).forEach(function (k) { nomes[k] = 1; });
    (dx.textos || []).forEach(function (t) { nomes[t.layer] = 1; });
    (dx.inserts || []).forEach(function (i) { nomes[i.layer] = 1; });
    Object.keys(nomes).sort().forEach(function (L) {
      var c = classificarCamada(L, mem);
      c.n = (dx.layers && dx.layers[L]) || 0;
      if (!c.classe && opts.geometria !== false && porCamada[L]) {
        var g = paredePorGeometria(porCamada[L], P3);
        if (g) { c.classe = "parede"; c.fonte = "geometria"; c.confianca = "media"; c.regra = "a camada «" + L + "» não diz o que é pelo nome, mas " + Math.round(g.frac * 100) + "% dos traços retos formam pares paralelos na espessura de parede (9–40 cm): parede DEDUZIDA"; }
      }
      camadas[L] = c;
      if (!c.classe && c.n > 0) naoCam.push({ nome: L, n: c.n });
    });
    (dx.inserts || []).forEach(function (ins, ix) {
      var c = classificarBloco(ins, camadas, mem);
      var k = ins.nome + "@" + ins.layer;
      if (!blocos[k]) blocos[k] = { nome: ins.nome, layer: ins.layer, classe: c.classe, sub: c.sub, fonte: c.fonte, regra: c.regra, confianca: c.confianca, n: 0, idx: [] };
      blocos[k].n++; blocos[k].idx.push(ix);
      if (!c.classe || (c.classe === "louca" && !c.sub)) naoBl[k] = blocos[k];
    });
    var resumo = { camadas: Object.keys(camadas).length, camadasNao: naoCam.length, blocosTipos: Object.keys(blocos).length, insercoesNao: 0, porClasse: {} };
    Object.keys(blocos).forEach(function (k) { var b = blocos[k]; resumo.porClasse[b.classe || "nao-reconhecido"] = (resumo.porClasse[b.classe || "nao-reconhecido"] || 0) + b.n; });
    Object.keys(naoBl).forEach(function (k) { resumo.insercoesNao += naoBl[k].n; });
    return {
      camadas: camadas, blocos: blocos,
      naoReconhecidos: { camadas: naoCam.sort(function (a, b) { return b.n - a.n; }), blocos: Object.keys(naoBl).map(function (k) { var b = naoBl[k]; return { nome: b.nome, layer: b.layer, n: b.n, classe: b.classe, motivo: b.classe === "louca" ? "louça sem tipo (nome e tamanho não dizem)" : "nenhuma regra de nome, atributo ou camada" }; }).sort(function (a, b) { return b.n - a.n; }) },
      resumo: resumo
    };
  }
  /* classe de uma inserção pelo resultado */
  function deInsert(res, ins) { var b = res.blocos[ins.nome + "@" + ins.layer]; return b || { classe: "", sub: "" }; }

  var ProjClass = { classificar: classificar, classificarCamada: classificarCamada, classificarBloco: classificarBloco, aprender: aprender, deInsert: deInsert, chaveMem: chaveMem, _sa: sa };
  global.ProjClass = ProjClass;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjClass;
})(typeof window !== "undefined" ? window : globalThis);
