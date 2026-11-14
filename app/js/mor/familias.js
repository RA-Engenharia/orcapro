/* =====================================================================
 * mor/familias.js — AS FAMÍLIAS DE SERVIÇO (regras tabeladas do compositor)
 *
 * Uma FAMÍLIA é um conjunto de serviços que a SINAPI publica variando um parâmetro
 * ("alvenaria de bloco" varia o bloco, "contrapiso" varia a espessura, "pintura" varia
 * as demãos, "concreto" varia o fck…). Dado um serviço-alvo que a base NÃO tem, o
 * compositor (compositor.js) acha uma composição da MESMA família e a família diz,
 * insumo por insumo, o que muda — com a conta escrita.
 *
 * REGRA DE OURO (ESPEC-MOTOR-ORCAMENTO.md §0 e §5): coeficiente só nasce de
 *   (a) outro coeficiente da própria base (referência), ou
 *   (b) geometria exata de medida que está escrita na descrição do serviço.
 * Nunca de chute. Quando a base não basta (mão de obra de bloco maior, por exemplo), o
 * coeficiente da referência é MANTIDO e isso é dito na premissa — com o erro medido contra
 * a SINAPI em tools/test-mor-compositor.js.
 *
 * Cada família expõe:
 *   reconhece(desc)  → params | null          (null = não é desta família)
 *   chave(desc)      → texto com o parâmetro trocado por «#» (igual = mesma família e mesmo serviço)
 *   distancia(pRef, pAlvo) → número (menor = referência melhor)
 *   variante(refs, pAlvo, opts) → { insumos:[plano], regras:[texto], premissas:[texto], faltou:[texto] }
 *     refs = [{ comp, params, codigo }] já ordenadas pela distância; plano de insumo =
 *     { ref:<insumo da referência>, coef, regra, troca?:{descBusca, aceita(item)→bool, rotulo} }
 * Puro, ES5, sem DOM, sem base: quem busca insumo é o compositor.
 * ===================================================================== */
(function (global) {
  "use strict";

  var C = global.MorConversoes || (typeof require === "function" ? require("./conversoes.js") : null);
  var sa = function (s) { return C.semAcento(s).replace(/²/g, "2").replace(/³/g, "3"); };
  var nb = function (s) { return C.numBR(s); };
  var r6 = function (x) { return Math.round(x * 1e6) / 1e6; };
  var r4 = function (x) { return Math.round(x * 1e4) / 1e4; };
  function fmt(n) { return String(r6(n)).replace(".", ","); }
  function semAF(D) { return D.replace(/\s*AF_\S*\s*$/, "").replace(/\.\s*$/, "").replace(/\s+/g, " ").trim(); }
  function ehMO(i) { return String(i.categoria || "").toUpperCase() === "MO" || String(i.tipoInsumo || "") === "mao_obra"; }
  function ehEQ(i) { return String(i.categoria || "").toUpperCase() === "EQ"; }
  function ehMAT(i) { return !ehMO(i) && !ehEQ(i); }
  function mesmoCod(a, b) { return String(a.codigo) === String(b.codigo); }

  var J_CM = 1;   /* junta de assentamento: 1 cm — conferida nos coeficientes da SINAPI (ver test-mor-compositor.js [1]) */

  var NUMRE = "(\\d+(?:,\\d+)?)";

  /* ---------------------------------------------------------------- ALVENARIA DE BLOCO */
  var DIMS = new RegExp(NUMRE + "X" + NUMRE + "X" + NUMRE + " CM");
  function dimsDoTexto(D) {   /* "9 X 19 X 39 CM" ou "9X19X39 CM" → [9,19,39] */
    var m = new RegExp(NUMRE + " ?X ?" + NUMRE + " ?X ?" + NUMRE + " ?CM").exec(D);
    return m ? [nb(m[1]), nb(m[2]), nb(m[3])] : null;
  }
  /* nº de blocos por m² (já com junta) e volume geométrico de junta por m² (esp em cm; o que importa é a razão) */
  function blocosPorM2(c, a) { return 1 / (((c + J_CM) / 100) * ((a + J_CM) / 100)); }
  function volJunta(esp, c, a) { return (esp / 100) * (1 - (c * a) / ((c + J_CM) * (a + J_CM))); }

  var ALVENARIA = {
    id: "alvenaria-bloco", nome: "Alvenaria de vedação em bloco", unidades: ["m2"],
    reconhece: function (desc) {
      var D = sa(desc);
      if (!/^ALVENARIA DE VEDACAO DE BLOCOS/.test(D)) return null;
      var m = DIMS.exec(D); if (!m) return null;
      var e = new RegExp("ESPESSURA " + NUMRE + " CM").exec(D), L = nb(m[1]);
      return { L: L, A: nb(m[2]), C: nb(m[3]), esp: e ? nb(e[1]) : L };
    },
    chave: function (desc) {
      return semAF(sa(desc)).replace(DIMS, "#").replace(new RegExp("ESPESSURA " + NUMRE + " CM"), "ESPESSURA #");
    },
    distancia: function (r, a) {
      return (r.esp !== a.esp ? 1000 : 0) + Math.abs(Math.log((r.C * r.A) / (a.C * a.A))) * 10 + Math.abs(r.L - a.L) / 100;
    },
    variante: function (refs, p, opts) {
      opts = opts || {};
      var R = refs[0], pr = R.params, out = { insumos: [], regras: [], premissas: [], faltou: [] };
      var moBloco = opts.moPorBloco !== false && pr.esp === p.esp;   /* LIGADO por padrão (decisão de engenharia 13/11): erro medido 18% máx. na mesma espessura */
      var nR = blocosPorM2(pr.C, pr.A), nA = blocosPorM2(p.C, p.A);
      var vR = volJunta(pr.esp, pr.C, pr.A), vA = volJunta(p.esp, p.C, p.A);
      if (pr.esp !== p.esp) out.premissas.push("Referência " + R.codigo + " tem espessura " + fmt(pr.esp) + " cm e o serviço pede " + fmt(p.esp) + " cm: a argamassa de assentamento muda de espessura e o erro medido na SINAPI é maior (ver test-mor-compositor.js). Confira.");
      var permut = null;
      R.comp.insumos.forEach(function (i) {
        var D = sa(i.descricao), plano = { ref: i, coef: Number(i.coeficiente), regra: "mantido da referência" };
        if (i.unidade && C.chaveUn(i.unidade) === "un" && /^(BLOCO|TIJOLO)/.test(D)) {
          var bd = dimsDoTexto(D), sv = [pr.L, pr.A, pr.C];
          if (!bd) { out.faltou.push("não achei as dimensões do bloco na descrição do insumo " + i.codigo); out.insumos.push(plano); return; }
          /* o bloco "deitado" tem as medidas em outra ordem (14X9X19 de serviço = bloco 9 X 14 X 19): acha a permutação */
          var perm = [], usado = [false, false, false], k, j;
          for (k = 0; k < 3; k++) { perm[k] = -1; for (j = 0; j < 3; j++) if (!usado[j] && Math.abs(sv[j] - bd[k]) < 1e-9) { perm[k] = j; usado[j] = true; break; } }
          if (perm.some(function (x) { return x < 0; })) { out.faltou.push("as dimensões do bloco da referência (" + bd.join(" x ") + ") não correspondem às do serviço — não sei mapear"); out.insumos.push(plano); return; }
          var sa3 = [p.L, p.A, p.C], nd = [sa3[perm[0]], sa3[perm[1]], sa3[perm[2]]];
          plano.coef = r4(Number(i.coeficiente) * nA / nR);
          plano.regra = "bloco/m² = 1 ÷ ((C+j)×(A+j)) com j = " + J_CM + " cm: " + fmt(r4(nR)) + " → " + fmt(r4(nA)) + " pç/m² da face " + fmt(p.C) + "×" + fmt(p.A) + "; a perda da referência é mantida (coef × " + fmt(r4(nA / nR)) + ")";
          var alvoDims = nd.map(fmt).join(" X ");
          plano.troca = {
            rotulo: "bloco " + alvoDims + " cm",
            descBusca: String(i.descricao).replace(new RegExp(NUMRE + " ?X ?" + NUMRE + " ?X ?" + NUMRE + " ?CM", "i"), alvoDims + " CM"),
            dims: nd,
            aceita: function (item) {
              var d2 = sa(item.descricao), b2 = dimsDoTexto(d2);
              return !!b2 && b2[0] === nd[0] && b2[1] === nd[1] && b2[2] === nd[2] && /^(BLOCO|TIJOLO)/.test(d2) && C.chaveUn(item.unidade) === "un";
            }
          };
        } else if (/^ARGAMASSA/.test(D)) {
          plano.coef = r4(Number(i.coeficiente) * vA / vR);
          plano.regra = "argamassa de junta ∝ volume geométrico esp × (1 − C·A/((C+j)(A+j))): coef × " + fmt(r4(vA / vR)) + "; a perda da referência é mantida";
        } else if (ehMO(i) && moBloco) {
          plano.coef = r4(Number(i.coeficiente) * nA / nR);
          plano.regra = "MO ∝ nº de blocos/m² (padrão ligado, só na mesma espessura; opts.moPorBloco=false mantém a da referência): coef × " + fmt(r4(nA / nR));
        } else if (ehMO(i) || ehEQ(i)) {
          plano.regra = "MO/EQ mantido da referência (sem escalar): a SINAPI não publica fator de produtividade por bloco";
        } else {
          plano.regra = "mantido da referência (consumo por m² de parede independe do bloco: tela, pino…)";
        }
        out.insumos.push(plano);
      });
      out.regras.push("Família alvenaria de bloco: referência " + R.codigo + " (" + pr.L + "x" + pr.A + "x" + pr.C + ", esp " + fmt(pr.esp) + " cm) → " + p.L + "x" + p.A + "x" + p.C + ", esp " + fmt(p.esp) + " cm.");
      out.premissas.push(moBloco ? "MO escalada pelo nº de blocos/m² (padrão decidido pelo engenheiro; só na mesma espessura da referência " + R.codigo + ")." : "MO e equipamento mantidos da referência " + R.codigo + " (sem escalar por bloco; na SINAPI a MO acompanha o nº de blocos/m² dentro da mesma espessura — decisão do engenheiro).");
      return out;
    }
  };

  /* ---------------------------------------------------------------- REVESTIMENTO CERÂMICO */
  var CER_DIM = new RegExp("DIMENSOES(?: DE)? " + NUMRE + "X" + NUMRE + " CM");
  /* "FORMATO MENOR OU IGUAL A 2025 CM2" | "FORMATO MAIOR QUE 2025 CM2" | "MAIOR A 2025" | "MAIOR QUE 2500 ATE 6400 CM2" */
  var FAIXA_RE = /FORMATO (MENOR OU IGUAL A|MAIOR QUE|MAIOR A) (\d+)(?: ATE (\d+))? CM2/;
  function faixaDe(desc) {
    var m = FAIXA_RE.exec(sa(desc)); if (!m) return null;
    var x = Number(m[2]);
    if (m[1] === "MENOR OU IGUAL A") return { min: 0, max: x, texto: m[0] };
    return { min: x, max: m[3] ? Number(m[3]) : Infinity, texto: m[0] };   /* (min, max] */
  }
  function areaNaFaixa(a, f) { return a > f.min && a <= f.max || (f.min === 0 && a <= f.max); }
  function semFaixa(desc) { return sa(desc).replace(FAIXA_RE, "FORMATO #").replace(/,\s*$/, "").replace(/\s+/g, " "); }

  var CERAMICA = {
    id: "revestimento-ceramico", nome: "Revestimento cerâmico (placas esmaltada/porcelanato)", unidades: ["m2"],
    reconhece: function (desc) {
      var D = sa(desc);
      if (!/^REVESTIMENTO CERAMICO PARA (PAREDES|PISO) .*PLACAS TIPO (ESMALTADA|PORCELANATO) /.test(D)) return null;
      var m = CER_DIM.exec(D); if (!m) return null;
      var a = nb(m[1]), b = nb(m[2]);
      return { a: a, b: b, area: a * b };
    },
    chave: function (desc) { return semAF(sa(desc)).replace(CER_DIM, "DIMENSOES #"); },
    distancia: function (r, a) { return Math.abs(Math.log(r.area / a.area)) + (faixaDeArea(r.area) !== faixaDeArea(a.area) ? 0.5 : 0); },
    variante: function (refs, p) {
      var R = refs[0], pr = R.params, out = { insumos: [], regras: [], premissas: [], faltou: [] };
      var perim = function (x) { return (x.a + x.b) / (x.a * x.b); };
      R.comp.insumos.forEach(function (i) {
        var D = sa(i.descricao), plano = { ref: i, coef: Number(i.coeficiente), regra: "mantido da referência" };
        var un = C.chaveUn(i.unidade);
        if (/^REJUNTE/.test(D)) {
          plano.coef = r4(Number(i.coeficiente) * perim(p) / perim(pr));
          plano.regra = "rejunte ∝ (a+b)/(a·b) da peça (largura e espessura de junta e densidade se cancelam): coef × " + fmt(r4(perim(p) / perim(pr)));
        } else if (un === "m2" && /^(PISO EM|REVESTIMENTO|PORCELANATO)/.test(D)) {
          var f = faixaDe(i.descricao);
          plano.regra = "peça por m² = 1 + perda, perda mantida da referência (coef " + fmt(Number(i.coeficiente)) + ")";
          if (f && !areaNaFaixa(p.area, f)) {
            /* a SINAPI NÃO escreve igual nas duas classes ("REVESTIMENTO PARA PAREDE, EM CERAMICA ESMALTADA, … ≤ 2025" × "REVESTIMENTO EM
               CERAMICA ESMALTADA, … > 2025"): vale a cabeça (PISO/REVESTIMENTO), o tipo (esmaltada/porcelanato) e a faixa que contém a área. */
            var cab = /^PISO/.test(D) ? "PISO" : "REVESTIMENTO", tipo = /PORCELANATO/.test(D) ? "PORCELANATO" : "CERAMICA ESMALTADA";
            plano.troca = {
              rotulo: "peça cerâmica de formato " + fmt(p.area) + " cm²",
              descBusca: String(i.descricao).replace(/FORMATO (MENOR OU IGUAL A|MAIOR QUE|MAIOR A) \d+(?: ATE \d+)? CM2/i, "FORMATO " + (p.area > f.max ? "MAIOR QUE " + fmt(f.max) : "MENOR OU IGUAL A " + fmt(f.max)) + " CM2"),
              aceita: function (item) {
                var f2 = faixaDe(item.descricao);
                var d2 = sa(item.descricao);
                return !!f2 && areaNaFaixa(p.area, f2) && d2.indexOf(cab) === 0 && d2.indexOf(tipo) > -1 && C.chaveUn(item.unidade) === "m2";
              }
            };
          }
        } else if (un === "un" && /CERAMIC|PORCELANATO|PISO|REVESTIMENTO/.test(D)) {
          plano.coef = r4(Number(i.coeficiente) * pr.area / p.area);
          plano.regra = "peça (un) por m² = (1+perda) ÷ área da peça: coef × " + fmt(r4(pr.area / p.area)) + " (perda da referência mantida)";
        } else if (/^ARGAMASSA COLANTE/.test(D)) {
          plano.regra = "argamassa colante mantida da referência (a SINAPI a muda por classe de formato; erro medido em test-mor-compositor.js)";
        } else if (ehMO(i) || ehEQ(i)) {
          plano.regra = "MO/EQ mantido da referência (sem escalar): a SINAPI cresce com o formato mas não publica o fator";
        }
        out.insumos.push(plano);
      });
      out.regras.push("Família revestimento cerâmico: referência " + R.codigo + " (" + fmt(pr.a) + "x" + fmt(pr.b) + " cm) → " + fmt(p.a) + "x" + fmt(p.b) + " cm.");
      out.premissas.push("MO mantida da referência " + R.codigo + " (SINAPI usa mais horas para formato maior; o erro medido está no teste).");
      return out;
    }
  };
  function faixaDeArea(a) { return a <= 2025 ? 0 : 1; }

  /* ---------------------------------------------------------------- CONTRAPISO POR ESPESSURA */
  var ESPRE = new RegExp("ESPESSURA " + NUMRE + " ?CM");
  var CONTRAPISO = {
    id: "contrapiso-espessura", nome: "Contrapiso / argamassa por espessura", unidades: ["m2"],
    reconhece: function (desc) {
      var D = sa(desc);
      if (!/^CONTRAPISO/.test(D)) return null;
      var m = ESPRE.exec(D); if (!m) return null;
      return { esp: nb(m[1]) };
    },
    chave: function (desc) { return semAF(sa(desc)).replace(ESPRE, "ESPESSURA #"); },
    distancia: function (r, a) { return Math.abs(r.esp - a.esp); },
    variante: function (refs, p) {
      var R = refs[0], pr = R.params, out = { insumos: [], regras: [], premissas: [], faltou: [] };
      var R2 = null, k;
      for (k = 1; k < refs.length; k++) if (refs[k].params.esp !== pr.esp) { R2 = refs[k]; break; }
      R.comp.insumos.forEach(function (i) {
        var D = sa(i.descricao), plano = { ref: i, coef: Number(i.coeficiente), regra: "mantido da referência" };
        if (ehMAT(i) && /^ARGAMASSA/.test(D)) {
          var i2 = R2 ? R2.comp.insumos.filter(function (x) { return mesmoCod(x, i); })[0] : null;
          if (i2) {
            var c1 = Number(i.coeficiente), c2 = Number(i2.coeficiente), e1 = pr.esp, e2 = R2.params.esp;
            var c = c1 + (c2 - c1) * (p.esp - e1) / (e2 - e1);
            if (c > 0) {
              plano.coef = r4(c);
              plano.regra = "argamassa por espessura: reta entre as composições SINAPI " + R.codigo + " (" + fmt(e1) + " cm → " + fmt(c1) + ") e " + R2.codigo + " (" + fmt(e2) + " cm → " + fmt(c2) + ") em " + fmt(p.esp) + " cm";
              out.insumos.push(plano); return;
            }
          }
          plano.coef = r4(Number(i.coeficiente) * p.esp / pr.esp);
          plano.regra = "argamassa ∝ espessura (volume = área × e): coef × " + fmt(r4(p.esp / pr.esp)) + " (" + fmt(pr.esp) + " → " + fmt(p.esp) + " cm); a SINAPI tem perda decrescente com a espessura (erro medido no teste)";
        } else if (ehMO(i) || ehEQ(i)) {
          plano.regra = "MO/EQ mantido da referência (sem escalar)";
        } else {
          plano.regra = "mantido da referência (consumo fixo por m²: aditivo, cimento de ponte…)";
        }
        out.insumos.push(plano);
      });
      out.regras.push("Família contrapiso por espessura: referência " + R.codigo + " (" + fmt(pr.esp) + " cm)" + (R2 ? " e " + R2.codigo + " (" + fmt(R2.params.esp) + " cm)" : "") + " → " + fmt(p.esp) + " cm.");
      out.premissas.push("MO mantida da referência " + R.codigo + " (sem escalar por espessura).");
      return out;
    }
  };

  /* ---------------------------------------------------------------- PINTURA / DEMÃOS */
  var DEMAO_RE = /\b(UMA|DUAS|TRES|QUATRO|CINCO|\d+) DEMAOS?\b/;
  var NOMES_N = { UMA: 1, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5 };
  var PINTURA = {
    id: "pintura-demaos", nome: "Pintura / massa / selador por demãos", unidades: ["m2"],
    reconhece: function (desc) {
      var D = sa(desc), m = DEMAO_RE.exec(D); if (!m) return null;
      if (/^IMPERMEABILIZACAO/.test(D)) return null;
      var n = NOMES_N[m[1]] || Number(m[1]);
      return n > 0 ? { n: n } : null;
    },
    chave: function (desc) { return semAF(sa(desc)).replace(DEMAO_RE, "# DEMAO"); },
    distancia: function (r, a) { return Math.abs(r.n - a.n); },
    variante: function (refs, p, opts) {
      opts = opts || {};
      var R = refs[0], pr = R.params, out = { insumos: [], regras: [], premissas: [], faltou: [] };
      var moProp = opts.moPorDemao !== "manter";   /* LIGADO por padrão (decisão de engenharia 13/11): erro medido 36% máx. */
      var f = p.n / pr.n;
      R.comp.insumos.forEach(function (i) {
        var plano = { ref: i, coef: Number(i.coeficiente), regra: "mantido da referência" };
        if (ehMAT(i) && /^(FITA|SELADOR|FUNDO)/.test(sa(i.descricao))) {
          /* medido: SINAPI 102491 (2 demãos) × 102492 (3 demãos) — selador e fita crepe NÃO acompanham as demãos da tinta */
          plano.regra = "mantido da referência (selador/fita crepe não escalam com as demãos da tinta: SINAPI 102491 × 102492)";
        } else if (ehMAT(i)) {
          plano.coef = r4(Number(i.coeficiente) * f);
          plano.regra = "material ∝ nº de demãos: coef × " + p.n + "/" + pr.n;
        } else if (ehMO(i) && moProp) {
          plano.coef = r4(Number(i.coeficiente) * f);
          plano.regra = "MO ∝ nº de demãos (opção moPorDemao=proporcional): coef × " + p.n + "/" + pr.n;
        } else {
          plano.regra = "MO/EQ mantido da referência (sem escalar por demão)";
        }
        out.insumos.push(plano);
      });
      out.regras.push("Família pintura por demãos: referência " + R.codigo + " (" + pr.n + " demão/demãos) → " + p.n + ".");
      out.premissas.push(moProp ? "MO proporcional ao nº de demãos (padrão decidido pelo engenheiro; a SINAPI mostra de 1,47× a 2× por dobro de demãos)." : "MO mantida da referência " + R.codigo + " (sem escalar por demão; a SINAPI mostra de 1,47× a 2× por dobro de demãos — decisão do engenheiro).");
      return out;
    }
  };

  /* ---------------------------------------------------------------- CONCRETO POR FCK */
  var FCK_RE = /FCK ?=? ?(\d+) ?MPA/;
  var CLASSE_RE = /CLASSE DE RESISTENCIA C(\d+)/;
  var SLUMP_RE = /SLUMP ?= ?(\d+) ?\+\/- ?\d+ ?MM/;
  /* a classe E o slump saem da comparação: a própria SINAPI usa C25 slump 130 e C40 slump 100 (não existe C40 de 130);
     o slump diferente vira NOTA na composição, não motivo de recusa */
  function semClasse(D) { return D.replace(CLASSE_RE, "CLASSE DE RESISTENCIA C#").replace(SLUMP_RE, "SLUMP #"); }
  function slumpDe(D) { var m = SLUMP_RE.exec(D); return m ? Number(m[1]) : null; }
  var CONCRETO = {
    id: "concreto-fck", nome: "Concreto por fck (troca do insumo concreto)", unidades: null,
    reconhece: function (desc) {
      var m = FCK_RE.exec(sa(desc)); if (!m) return null;
      return { fck: Number(m[1]) };
    },
    chave: function (desc) { return semAF(sa(desc)).replace(FCK_RE, "FCK #"); },
    distancia: function (r, a) { return Math.abs(r.fck - a.fck); },
    variante: function (refs, p) {
      var R = refs[0], pr = R.params, out = { insumos: [], regras: [], premissas: [], faltou: [] }, trocou = 0;
      R.comp.insumos.forEach(function (i) {
        var D = sa(i.descricao), plano = { ref: i, coef: Number(i.coeficiente), regra: "mantido da referência (mesmo consumo, mesma MO)" };
        var m = CLASSE_RE.exec(D);
        if (/^CONCRETO/.test(D) && m && Number(m[1]) === pr.fck) {
          var base = semClasse(D), un = C.chaveUn(i.unidade);
          plano.regra = "insumo concreto trocado de C" + pr.fck + " para C" + p.fck + " (classe escrita na descrição da base); coeficiente igual ao da referência";
          plano.troca = {
            rotulo: "concreto C" + p.fck,
            nota: function (item) {
              var a = slumpDe(D), b = slumpDe(sa(item.descricao));
              return (a !== null && b !== null && a !== b) ? "ATENÇÃO: o concreto C" + p.fck + " da base tem slump " + b + " mm (a referência usa " + a + " mm) — não existe C" + p.fck + " com o mesmo slump; confira." : "";
            },
            descBusca: String(i.descricao).replace(/CLASSE DE RESISTENCIA C\d+/i, "CLASSE DE RESISTENCIA C" + p.fck),
            aceita: function (item) {
              var d2 = sa(item.descricao), m2 = CLASSE_RE.exec(d2);
              return !!m2 && Number(m2[1]) === p.fck && semClasse(d2) === base && C.chaveUn(item.unidade) === un;
            }
          };
          trocou++;
        }
        out.insumos.push(plano);
      });
      if (!trocou) out.faltou.push("a referência " + R.codigo + " não tem insumo «CONCRETO … CLASSE DE RESISTENCIA Cnn» para trocar (concreto produzido na obra tem outro traço)");
      out.regras.push("Família concreto por fck: referência " + R.codigo + " (fck " + pr.fck + ") → fck " + p.fck + ".");
      out.premissas.push("MO e equipamento iguais aos da referência " + R.codigo + " (na SINAPI não mudam entre classes de concreto usinado).");
      return out;
    }
  };

  var LISTA = [ALVENARIA, CERAMICA, CONTRAPISO, PINTURA, CONCRETO];

  /* ERRO MEDIDO DO CUSTO TOTAL (revisão adversária): máximo |custo gerado ÷ custo SINAPI − 1| no ensaio «deixa-de-fora» sobre a SINAPI
     MG 2026-06 (tools/test-mor-compositor.js mede e CONFERE que estes números são limites verdadeiros). Acima de LIMITE_CONFERIR o
     compositor devolve a composição marcada «conferir», com o erro escrito na premissa. */
  var LIMITE_CONFERIR = 15;
  var ERRO_CUSTO = {
    "alvenaria-bloco": { mesma: 7.1, outra: 15.7, nota: "mão de obra proporcional aos blocos só na mesma espessura; argamassa de junta erra mais em outra espessura" },
    "revestimento-ceramico": { todos: 27, medido: 26.9, nota: "MO mantida da referência (a SINAPI usa mais horas em formato maior) e argamassa colante por classe de formato" },
    "contrapiso-espessura": { todos: 16.4, nota: "argamassa por espessura (reta entre irmãs) e MO mantida" },
    "pintura-demaos": { todos: 32.2, nota: "MO proporcional às demãos (a SINAPI cresce de 1,47× a 2× por dobro de demãos)" },
    "concreto-fck": { todos: 19.4, nota: "coeficientes e insumo idênticos à SINAPI; a diferença vem do slump/preço do concreto escolhido" }
  };
  function erroCusto(famId, pRef, pAlvo) {
    var e = ERRO_CUSTO[famId]; if (!e) return { erro: 0, nota: "" };
    if (famId === "alvenaria-bloco") return { erro: (pRef && pAlvo && pRef.esp === pAlvo.esp) ? e.mesma : e.outra, nota: e.nota };
    return { erro: e.todos, nota: e.nota };
  }
  var Fam = {
    lista: function () { return LISTA.slice(); },
    porId: function (id) { return LISTA.filter(function (f) { return f.id === id; })[0] || null; },
    /* Qual família reconhece a descrição (a 1ª; as regras são disjuntas). */
    detectar: function (desc, unidade) {
      var uk = unidade ? C.chaveUn(unidade) : null, i;
      for (i = 0; i < LISTA.length; i++) {
        var f = LISTA[i];
        if (f.unidades && uk && f.unidades.indexOf(uk) < 0) continue;
        var p = f.reconhece(desc);
        if (p) return { familia: f, params: p };
      }
      return null;
    },
    nomes: function () { return LISTA.map(function (f) { return f.nome; }); },
    ERRO_CUSTO: ERRO_CUSTO, LIMITE_CONFERIR: LIMITE_CONFERIR, erroCusto: erroCusto,
    _interno: { faixaDe: faixaDe, areaNaFaixa: areaNaFaixa, semFaixa: semFaixa, semClasse: semClasse, blocosPorM2: blocosPorM2, volJunta: volJunta, dimsDoTexto: dimsDoTexto, J_CM: J_CM }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Fam;
  global.MorFamilias = Fam;
})(typeof window !== "undefined" ? window : globalThis);
