/* =====================================================================
 * icarficha.js — A FICHA DO EQUIPAMENTO: forma, massa e geometria, cada número com a fonte.
 * Motor PURO (ES5, testável em Node). Especificação: ESPEC-ICAMENTO-CENARIO.md §B e §II.3.1.
 *
 * O que faz: junta o que o CATÁLOGO já tem (js/icarcatalogo.js — o único lugar com número de fabricante) com o que a
 * pessoa INFORMA com fonte (plano.fichaAjustes, plano.veiculo do CRLV) e devolve a ficha "montada" que a física
 * (js/icarfisica.js) e a cinemática (js/icarcinematica.js) usam. Cada campo: número com `fonte`, ou null + o que falta.
 *
 * ⚠ NENHUM NÚMERO DE EQUIPAMENTO NASCE AQUI. O que o catálogo não tem fica "[a levantar]" (null) e a parte da física
 *   que depende dele fica CINZA, dizendo o que falta e onde costuma estar (tabela da §B).
 * ⚠ FORMA ≠ FÍSICA. Para DESENHAR o equipamento, o que falta usa a proporção do desenho genérico (`forma()`), sempre
 *   marcado `estimado: true` (contorno tracejado no 3D). A física NUNCA lê um número estimado.
 * ⚠ Informado pela pessoa só vale com FONTE escrita (ex.: "plano de rigging do locador, rev. 2"): sem fonte, ignorado.
 * ===================================================================== */
(function (global) {
  "use strict";

  var A_LEVANTAR = "[a levantar]";
  /* o que levantar, por campo — para a lista de pendências da tela (§B: "Dados por equipamento") */
  var CAMPOS = {
    guindaste: {
      patolaA: { rotulo: "base longitudinal das patolas", onde: "desenho de dimensões da ficha técnica", usa: ["reações", "solo", "tombamento"] },
      patolaB: { rotulo: "base transversal das patolas", onde: "desenho de dimensões da ficha técnica", usa: ["reações", "solo", "tombamento"] },
      forcaPatolaMax_kN: { rotulo: "força máxima por patola", onde: "ficha técnica (Liebherr publica)", usa: ["patolas"] },
      sapataLado_m: { rotulo: "lado da sapata da patola", onde: "ficha técnica / desenho", usa: ["solo"] },
      giroU: { rotulo: "posição do eixo de giro no chassi (em relação ao centro das patolas)", onde: "desenho de dimensões", usa: ["reações", "solo", "tombamento"] },
      chassiMassa_t: { rotulo: "massa do chassi (o que não gira)", onde: "ficha (pesos por eixo) ou fabricante", usa: ["reações", "solo", "tombamento"] },
      chassiCgU: { rotulo: "CG do chassi", onde: "cargas por eixo da ficha", usa: ["reações", "solo", "tombamento"] },
      superMassa_t: { rotulo: "massa da superestrutura (giro, cabine, guincho)", onde: "fabricante (raramente publicado)", usa: ["reações", "solo", "tombamento"] },
      superCgR: { rotulo: "CG da superestrutura (raio a partir do giro)", onde: "fabricante", usa: ["reações", "solo", "tombamento"] },
      contrapeso_t: { rotulo: "massa do contrapeso", onde: "ficha técnica", usa: ["reações", "solo", "tombamento"] },
      contrapesoRaio: { rotulo: "raio do CG do contrapeso", onde: "desenho (raio de giro da traseira)", usa: ["reações", "solo", "tombamento"] },
      lancaMassa_t: { rotulo: "massa da lança", onde: "fabricante (raro publicar)", usa: ["reações", "solo", "tombamento"] },
      lancaCgR: { rotulo: "CG da lança (raio)", onde: "fabricante", usa: ["reações", "solo", "tombamento"] },
      peU: { rotulo: "posição do pé da lança (raio a partir do giro)", onde: "desenho de dimensões / diagrama de alcance", usa: ["cinemática"] },
      peW: { rotulo: "altura do pino do pé da lança", onde: "desenho de dimensões / diagrama de alcance", usa: ["cinemática"] },
      alfaMax: { rotulo: "ângulo máximo da lança", onde: "diagrama de alcance", usa: ["cinemática"] },
      dPonta: { rotulo: "distância mínima da ponta ao gancho (moitão + limitador)", onde: "ficha / manual", usa: ["cinemática"] },
      cabo: { rotulo: "cabo: tração máxima por perna e ruptura mínima", onde: "ficha / certificado do cabo", usa: ["cabo"] },
      moitao: { rotulo: "moitão: peso, polias, capacidade", onde: "placa do moitão", usa: ["moitão"] }
    },
    munck: {
      patolaA: { rotulo: "base longitudinal dos apoios (patolas × eixo traseiro ou patolas traseiras)", onde: "montagem no caminhão (implementador)", usa: ["reações", "solo", "tombamento"] },
      patolaB: { rotulo: "abertura das patolas", onde: "ficha técnica do guindaste", usa: ["reações", "solo", "tombamento"] },
      forcaPatolaMax_kN: { rotulo: "força máxima por patola", onde: "ficha técnica do guindaste", usa: ["patolas"] },
      sapataLado_m: { rotulo: "lado da sapata da patola", onde: "ficha técnica", usa: ["solo"] },
      giroU: { rotulo: "posição do guindaste no chassi", onde: "montagem (implementador)", usa: ["reações", "solo", "tombamento"] },
      taraCaminhao_kg: { rotulo: "tara do caminhão", onde: "CRLV do caminhão", usa: ["reações", "solo", "tombamento"] },
      caminhaoCgU: { rotulo: "CG do caminhão vazio", onde: "pesagem por eixo / ficha do veículo", usa: ["reações", "solo", "tombamento"] },
      guindasteMassa_kg: { rotulo: "massa do guindaste articulado", onde: "ficha técnica do guindaste", usa: ["reações", "solo", "tombamento"] },
      L1: { rotulo: "comprimento da 1ª lança", onde: "desenho do guindaste", usa: ["cinemática"] },
      L2: { rotulo: "comprimento da 2ª lança (recolhida)", onde: "desenho do guindaste", usa: ["cinemática"] },
      extMax: { rotulo: "curso das extensões hidráulicas", onde: "ficha (alcance hidráulico)", usa: ["cinemática"] },
      colunaW: { rotulo: "altura da articulação da coluna", onde: "desenho do guindaste", usa: ["cinemática"] }
    }
  };

  function num(v) { var n = +v; return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function fonteCat(eq) { var f = eq && eq.fonte || {}; return (f.doc || "catálogo") + (f.levantamento ? " (levantamento " + f.levantamento + ")" : ""); }

  /* a ficha montada: { id, tipo, <campo>: número|null, fontes: {campo: texto}, notas: [], faltas: [...], moitoes: [...] }
     opcoes = { moitaoIdx } — o moitão escolhido na lista do fabricante (sem escolha: nenhum, a física diz o que falta) */
  function montar(eq, ajustes, veiculo, opcoes) {
    eq = eq || {}; opcoes = opcoes || {};
    var munck = eq.tipo === "munck";
    var f = { id: eq.id || null, tipo: munck ? "munck" : "guindaste", nome: [eq.fabricante, eq.modelo].filter(Boolean).join(" "), fontes: {}, notas: [], estimadosNaForma: [] };
    var fc = fonteCat(eq);
    function poe(campo, v, fonte, nota) { var n = num(v); if (n == null) return; f[campo] = n; f.fontes[campo] = fonte; if (nota) f.notas.push(nota); }
    Object.keys(CAMPOS[f.tipo]).forEach(function (k) { if (k !== "cabo" && k !== "moitao") f[k] = null; });
    /* cabo e moitão: null = falta (nunca undefined — a física e a tela tratam os dois iguais, o teste não) */
    ["caboTmax_kN", "caboRuptura_kN", "moitaoCap_kN", "moitaoMassa_kg", "moitaoPernas"].forEach(function (k) { f[k] = null; });
    f.moitoes = [];
    /* ---- do catálogo (o que já tem fonte) ---- */
    if (!munck) {
      var pat = eq.patolas_m || [];
      poe("patolaA", pat[0], fc + (eq.patolas_status ? " — " + eq.patolas_status : ""), eq.patolas_status ? "Base das patolas " + eq.patolas_status + ": conferir no desenho de dimensões." : "");
      poe("patolaB", pat[1], fc + (eq.patolas_status ? " — " + eq.patolas_status : ""));
      var fp = (eq.forca_patola_kN || []).map(num).filter(function (x) { return x > 0; });
      /* ⚠ Fmax ("Max. supporting forces") é a força que a patola DESCARREGA NO CHÃO no pior caso, em duas configurações de
         patola — não é capacidade. Para o solo o lado seguro é o MAIOR. (Até 01/10/2026 adotava o menor, lendo como
         capacidade; a página de dados do PDF desfez o engano — ver FICHAS_FAB no js/icarcatalogo.js.) */
      var pgD = eq.ficha && eq.ficha.pagDados ? ", p. " + eq.ficha.pagDados : "";
      if (fp.length) poe("forcaPatolaMax_kN", Math.max.apply(null, fp), fc + pgD, fp.length > 1 ? "Força máxima de apoio (Fmax) publicada em duas configurações de patola: " + fp.join(" e ") + " kN — adotado o MAIOR (" + Math.max.apply(null, fp) + " kN), o pior caso para o solo." : "");
      poe("contrapeso_t", eq.contrapeso_t, fc);
      if (eq.lanca_m) { poe("Lmin", eq.lanca_m[0], fc); poe("Lmax", eq.lanca_m[eq.lanca_m.length - 1], fc); }
      poe("alturaMax_m", eq.altura_max_m, fc); poe("raioMax_m", eq.raio_max_m, fc);
      if (eq.dim_m) { poe("comprimento", eq.dim_m[0], fc); poe("largura", eq.dim_m[1], fc); poe("altura", eq.dim_m[2], fc); }
      poe("eixos", eq.eixos, fc);
      poe("moitao_kg", eq.moitao_kg, fc);
      /* o que o PDF publica além da tabela (catálogo → FICHAS_FAB, com a página) */
      var fb = eq.ficha;
      if (fb) {
        var pDim = fc + ", desenho de dimensões p. " + fb.pagDim, pDad = fc + ", p. " + fb.pagDados;
        if (num(fb.giroFrente_m) > 0 && num(fb.giroTras_m) > 0) {
          poe("giroU", (fb.giroTras_m - fb.giroFrente_m) / 2, pDim + " (giro a " + String(fb.giroFrente_m).replace(".", ",") + " m das patolas dianteiras e " + String(fb.giroTras_m).replace(".", ",") + " m das traseiras)");
          if (f.patolaA == null || Math.abs(f.patolaA - (fb.giroFrente_m + fb.giroTras_m)) < 0.01) { f.patolaA = fb.giroFrente_m + fb.giroTras_m; f.fontes.patolaA = pDim; }
          if (f.fontes.patolaB) f.fontes.patolaB = pDim;
          /* o desenho CONFIRMA a base (as duas cotas somam a base longitudinal): o aviso "inferido, conferir" sai */
          f.notas = f.notas.filter(function (n) { return n.indexOf("Base das patolas") !== 0; });
        }
        poe("sapataLado_m", fb.sapata_m, pDim);
        if (fb.raioTraseira_m && fb.raioTraseira_m.length) poe("raioTraseira_m", Math.max.apply(null, fb.raioTraseira_m), pDim);
        poe("alfaMax", fb.alfaMax_graus, pDad);
        if (fb.cabo) { poe("caboTmax_kN", fb.cabo[2], pDad + " (tração máxima por perna)"); poe("caboDiam_mm", fb.cabo[0], pDad); poe("caboComp_m", fb.cabo[1], pDad); }
        poe("giro_rpm", fb.giro_rpm, pDad); poe("icar_m_min", fb.icar_m_min, pDad);
        (fb.notas || []).forEach(function (n) { f.notas.push(n); });
        f.moitoes = (fb.moitoes || []).map(function (m, i) { return { idx: i, cap_t: m[0], polias: m[1], pernas: m[2], massa_t: m[3], fonte: pDad }; });
        var mi = num(opcoes.moitaoIdx);
        if (mi != null && f.moitoes[mi]) {
          var mo = f.moitoes[mi];
          poe("moitaoCap_kN", mo.cap_t * 9.80665, pDad + " (moitão de " + String(mo.cap_t).replace(".", ",") + " t)");
          poe("moitaoMassa_kg", mo.massa_t * 1000, pDad); poe("moitaoPernas", mo.pernas, pDad);
          f.moitao = mo;
        }
      }
    } else {
      var pm = (eq.patolas_m || []).map(num).filter(function (x) { return x > 0; });
      if (pm.length) poe("patolaB", Math.max.apply(null, pm), fc, pm.length > 1 ? "Abertura das patolas: " + pm.join(" / ") + " m na ficha — adotada a maior (a da tabela de carga com patolas totalmente abertas). Conferir na montagem." : "");
      poe("guindasteMassa_kg", eq.peso_kg, fc);
      poe("alcanceHid_m", eq.alcance_hid_m, fc); poe("alcanceMax_m", eq.alcance_max_m, fc); poe("alturaMax_m", eq.altura_max_m, fc);
      poe("momento_tm", eq.momento_tm, fc);
      var fm = eq.ficha;
      if (fm) {
        var pM = fc + ", p. " + fm.pagDados;
        poe("larguraTransporte_m", fm.larguraTransporte_m, pM); poe("espacoMontagem_m", fm.espacoMontagem_m, pM);
        poe("anguloAbertura_graus", fm.anguloAbertura_graus, pM); poe("raioMin_m", fm.raioMin_m, pM); poe("alcanceVertHid_m", fm.alcanceVertHid_m, pM);
      }
      /* o caminhão: o que a pessoa informou do CRLV */
      var vc = veiculo || {};
      if (num(vc.tara_kg) > 0) poe("taraCaminhao_kg", vc.tara_kg, vc.fonte || "CRLV do caminhão (informado)");
      if (num(vc.comprimento_m) > 0) poe("comprimento", vc.comprimento_m, vc.fonte || "ficha do veículo (informado)");
      if (num(vc.entreEixos_m) > 0) poe("entreEixos_m", vc.entreEixos_m, vc.fonte || "ficha do veículo (informado)");
    }
    /* ---- o que a pessoa INFORMOU com fonte (fichaAjustes: { campo: { v, fonte } }) ---- */
    var aj = ajustes || {};
    Object.keys(aj).forEach(function (k) {
      var a = aj[k]; if (!a || num(a.v) == null || !String(a.fonte || "").trim()) return;   // ⚠ sem fonte não entra
      f[k] = num(a.v); f.fontes[k] = "informado: " + String(a.fonte).trim();
    });
    f.faltas = faltas(f);
    return f;
  }

  /* o que falta, com rótulo, onde achar e o que fica cinza por causa disso */
  function faltas(f) {
    var tab = CAMPOS[f.tipo] || {}, out = [];
    Object.keys(tab).forEach(function (k) {
      if (k === "cabo" || k === "moitao") { if (f[k === "cabo" ? "caboTmax_kN" : "moitaoCap_kN"] == null) out.push({ campo: k, rotulo: tab[k].rotulo, onde: tab[k].onde, usa: tab[k].usa }); return; }
      if (f[k] == null) out.push({ campo: k, rotulo: tab[k].rotulo, onde: tab[k].onde, usa: tab[k].usa });
    });
    return out;
  }
  /* validação: o que fica cinza na física (lista para a tela) e coerência do que existe */
  function validar(f) {
    var o = { ok: true, erros: [], cinza: [], faltas: (f && f.faltas) || [] };
    if (!f) { o.ok = false; o.erros.push("sem ficha"); return o; }
    if (f.Lmin != null && f.Lmax != null && !(f.Lmin < f.Lmax)) { o.ok = false; o.erros.push("lança: Lmin ≥ Lmax"); }
    ["patolaA", "patolaB"].forEach(function (k) { if (f[k] != null && !(f[k] > 0)) { o.ok = false; o.erros.push(k + " ≤ 0"); } });
    Object.keys(f.fontes || {}).forEach(function (k) { if (!String(f.fontes[k] || "").trim()) { o.ok = false; o.erros.push(k + " sem fonte"); } });
    var mapa = {};
    o.faltas.forEach(function (x) { (x.usa || []).forEach(function (u) { mapa[u] = 1; }); });
    o.cinza = Object.keys(mapa);
    return o;
  }

  /* ---- FORMA para o desenho (proporção genérica onde falta — SEMPRE marcado estimado) ----
     ⚠ estes números são de APARÊNCIA, nunca entram na física: vêm do desenho genérico de um guindaste
     telescópico de 2–4 eixos e de um munck sobre caminhão toco/truck, em proporção ao comprimento/largura. */
  function forma(f) {
    f = f || {};
    var e = {}, o = { tipo: f.tipo, estimado: e };
    function v(campo, real, generico) { if (real != null) return real; e[campo] = true; return generico; }
    if (f.tipo === "munck") {
      var comp = v("comprimento", f.comprimento, 8.5), larg = 2.5;
      o.caminhao = { comprimento: comp, largura: larg, cabine: { comprimento: 2.1, altura: 2.0 }, chassiAltura: 1.0, rodaD: 1.0, eixos: [comp / 2 - 1.0, -comp / 2 + 2.2, -comp / 2 + 1.0] };
      e.caminhaoDetalhe = true;
      o.giroU = v("giroU", f.giroU, (comp - 3.05) / 2);
      o.colunaW = v("colunaW", f.colunaW, 3.2);
      /* a base do guindaste no chassi: largura em transporte × espaço de montagem (catálogo), senão 1,3 × 1,3 */
      o.base = { largura: v("larguraTransporte_m", f.larguraTransporte_m, 1.3), comprimento: v("espacoMontagem_m", f.espacoMontagem_m, 1.3) };
      o.anguloMax = f.anguloAbertura_graus != null ? f.anguloAbertura_graus : null;
      var alc = f.alcanceHid_m || f.alcanceMax_m || 8;
      o.L1 = v("L1", f.L1, Math.max(2.5, alc * 0.42));
      o.L2 = v("L2", f.L2, Math.max(2.0, alc * 0.36));
      o.extMax = v("extMax", f.extMax, Math.max(0, alc - o.L2 - 0.6));
      o.patolaB = v("patolaB", f.patolaB, larg + 2);
      o.patolaA = v("patolaA", f.patolaA, comp - 2.75);
    } else {
      var cg = v("comprimento", f.comprimento, 12), lg = v("largura", f.largura, 2.55), nx = v("eixos", f.eixos, 3);
      o.chassi = { comprimento: cg, largura: lg, altura: 1.0, rodaD: 1.2, eixos: [] };
      for (var i = 0; i < nx; i++) o.chassi.eixos.push(cg / 2 - 1.8 - i * (cg - 3.4) / Math.max(1, nx - 1));
      e.chassiDetalhe = true;
      o.cabineMotorista = { comprimento: 2.0, altura: 1.9 }; e.cabineMotorista = true;
      o.giroU = v("giroU", f.giroU, 0);
      o.plataforma = { raio: lg * 0.45, altura: 0.5 }; e.plataforma = true;
      o.superestrutura = { comprimento: cg * 0.32, largura: lg * 0.9, altura: 1.1 }; e.superestrutura = true;
      /* contrapeso: o CG não é publicado (fica estimado e fora da física); com o RAIO DA TRASEIRA do desenho, a borda de trás do
         bloco cai nele — o desenho fica do tamanho certo para a folga com o entorno */
      o.contrapeso = { raio: v("contrapesoRaio", f.contrapesoRaio, f.raioTraseira_m != null ? f.raioTraseira_m - 0.45 : lg * 1.15), largura: lg * 0.95, altura: 1.0, comprimento: 0.9 };
      o.raioTraseira = f.raioTraseira_m != null ? f.raioTraseira_m : null;
      o.peU = v("peU", f.peU, -0.6);
      o.peW = v("peW", f.peW, 2.5);
      o.Lmin = v("Lmin", f.Lmin, 9); o.Lmax = v("Lmax", f.Lmax, 30);
      o.secoes = 4; e.secoes = true;
      o.dPonta = v("dPonta", f.dPonta, 3.0);
      o.alfaMax = v("alfaMax", f.alfaMax, 82);
      o.patolaA = v("patolaA", f.patolaA, cg * 0.55);
      o.patolaB = v("patolaB", f.patolaB, lg + 3.5);
      o.sapataLado = v("sapataLado_m", f.sapataLado_m, 0.6);
    }
    return o;
  }

  var IcarFicha = { A_LEVANTAR: A_LEVANTAR, CAMPOS: CAMPOS, montar: montar, faltas: faltas, validar: validar, forma: forma };
  global.IcarFicha = IcarFicha;
  if (typeof module !== "undefined" && module.exports) module.exports = IcarFicha;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
