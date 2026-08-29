/* =====================================================================
 * alvenaria.js — Regras de projeto de ALVENARIA (estrutural e de vedação).
 *
 * Motor PURO (Node-testável, ES5). Trabalha em METROS.
 * O js/blocos.js sabe QUE PEÇA existe; este aqui sabe COMO SE PROJETA:
 * malha modular, amarração, verga, contraverga, cinta, junta de controle,
 * armadura construtiva, graute e o validador de junta a prumo.
 *
 * ---------------------------------------------------------------------
 * NORMA VIGENTE — atenção, isto muda memorial
 * ---------------------------------------------------------------------
 * A NBR 15961 (bloco de concreto) e a NBR 15812 (bloco cerâmico) foram
 * CANCELADAS e substituídas pela ABNT NBR 16868-1/2/3:2020. Memorial que
 * ainda cite as antigas está desatualizado. Complementam: NBR 6136 (bloco),
 * NBR 15873 (coordenação modular) e NBR 8545 (vedação em cerâmico).
 *
 * ---------------------------------------------------------------------
 * O QUE É NORMA E O QUE É PRÁTICA CONSAGRADA
 * ---------------------------------------------------------------------
 * Marcado em cada função. O único critério NUMÉRICO de amarração que a
 * bibliografia fecha é o da junta a prumo (defasagem mínima entre juntas
 * verticais de fiadas vizinhas). Por isso a estratégia aqui é: desenhar a
 * paginação e DEPOIS VALIDAR por esse critério — em vez de confiar que o
 * padrão desenhado está certo.
 *
 * Valores derivados por cálculo (não publicados) vêm marcados com
 * `derivado: true` no retorno, para o memorial poder dizer de onde veio.
 *
 * Teste: node tools/test-alvenaria.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }
  function r4(n) { return Math.round(num(n) * 10000) / 10000; }
  function _B() { return (typeof Blocos !== "undefined" && Blocos) || (global && global.Blocos) || null; }

  var Alvenaria = {
    _deps: { Blocos: null },
    B: function () { return this._deps.Blocos || _B(); },

    NORMAS: {
      estrutural: "ABNT NBR 16868-1/2/3:2020 (substitui as canceladas NBR 15961 e NBR 15812)",
      bloco: "ABNT NBR 6136",
      modular: "ABNT NBR 15873",
      vedacaoCeramica: "ABNT NBR 8545"
    },

    /* =================================================================
     * MALHA MODULAR
     * Definida a família, toda dimensão em planta tem de ser múltipla do
     * módulo horizontal. A espessura no modelo é MODULAR (t + junta), não
     * a largura crua do bloco — senão os encontros não fecham.
     * ================================================================= */
    malha: function (famId) {
      var B = this.B(); if (!B) return null;
      var f = B.familia(famId); if (!f) return null;
      var inteiro = B.peca(famId, "inteiro");
      return {
        familia: famId,
        horizontal: f.modulo,                    // 0,15 ou 0,20 m
        vertical: r3(inteiro.a + B.JUNTA_PADRAO), // 0,20 m em todas
        espessuraModular: r3(inteiro.l + B.JUNTA_PADRAO),
        larguraBloco: inteiro.l
      };
    },

    /* Confere uma cota de projeto contra a malha. Devolve o múltiplo mais
     * próximo e a correção em milímetros — é o que o usuário precisa ver. */
    conferirCota: function (medida, famId, opts) {
      opts = opts || {};
      var m = this.malha(famId);
      if (!m) return { ok: false, motivo: "Família desconhecida." };
      var L = num(medida);
      if (!(L > 0)) return { ok: false, motivo: "Medida precisa ser maior que zero." };
      var tol = opts.tolerancia != null ? num(opts.tolerancia) : 0.002;
      var n = L / m.horizontal;
      var nInt = Math.round(n);
      var alvo = r4(nInt * m.horizontal);
      var dif = r4(L - alvo);
      if (Math.abs(dif) <= tol) {
        return { ok: true, modular: true, medida: r4(L), modulos: nInt, malha: m.horizontal, ajuste: 0 };
      }
      var abaixo = r4(Math.floor(n) * m.horizontal), acima = r4(Math.ceil(n) * m.horizontal);
      return {
        ok: true, modular: false, medida: r4(L), malha: m.horizontal,
        maisProximo: alvo, ajuste: r4(-dif), ajusteMm: Math.round(-dif * 1000),
        abaixo: abaixo, acima: acima,
        aviso: "A medida não é múltipla de " + Math.round(m.horizontal * 100) + " cm. " +
               "O mais próximo é " + alvo.toFixed(2) + " m (" + (dif > 0 ? "reduzir " : "aumentar ") + Math.abs(Math.round(dif * 1000)) + " mm)."
      };
    },

    /* Pé-direito: piso a laje tem de ser múltiplo do módulo vertical (20 cm). */
    conferirPeDireito: function (altura, famId) {
      var m = this.malha(famId);
      if (!m) return { ok: false, motivo: "Família desconhecida." };
      var h = num(altura);
      var n = h / m.vertical, nInt = Math.round(n);
      var alvo = r4(nInt * m.vertical);
      var modular = Math.abs(h - alvo) <= 0.002;
      return {
        ok: true, modular: modular, altura: r4(h), fiadas: nInt, malha: m.vertical,
        maisProximo: alvo,
        aviso: modular ? "" : "Pé-direito de " + h.toFixed(2) + " m não fecha em fiadas inteiras. Use " + alvo.toFixed(2) + " m (" + nInt + " fiadas de 20 cm)."
      };
    },

    /* =================================================================
     * VALIDADOR DE JUNTA A PRUMO — o único critério numérico da norma.
     * Entre duas fiadas vizinhas, a distância entre juntas verticais tem
     * de ser >= max(9 cm ; 1/4 do comprimento do bloco). Menos que isso é
     * junta a prumo: ou corrige a paginação, ou exige tela, ou a parede
     * deixa de ser estrutural.
     * ================================================================= */
    validarAmarracao: function (fiadaA, fiadaB, famId, opts) {
      opts = opts || {};
      var B = this.B();
      var inteiro = B ? B.peca(famId, "inteiro") : null;
      if (!inteiro) return { ok: false, motivo: "Família desconhecida." };
      var minimo = Math.max(0.09, inteiro.c / 4);

      var jA = this._juntasVerticais(fiadaA, opts.junta);
      var jB = this._juntasVerticais(fiadaB, opts.junta);
      var problemas = [];
      jA.forEach(function (a) {
        jB.forEach(function (b) {
          var d = Math.abs(a - b);
          if (d < minimo - 1e-6) problemas.push({ x: r3(a), xVizinha: r3(b), defasagem: r3(d) });
        });
      });
      return {
        ok: problemas.length === 0,
        minimoExigido: r3(minimo),
        criterio: "defasagem >= max(9 cm; 1/4 do bloco = " + Math.round(inteiro.c / 4 * 100) + " cm)",
        juntasFiadaA: jA.length, juntasFiadaB: jB.length,
        problemas: problemas,
        aviso: problemas.length
          ? problemas.length + " junta(s) a prumo. Corrija a paginação, ou especifique tela de amarração a cada 2 fiadas, ou trate a parede como não estrutural."
          : ""
      };
    },
    /* posições das juntas verticais de uma fiada (acumulado das peças) */
    _juntasVerticais: function (fiada, junta) {
      var B = this.B();
      var j = junta != null ? num(junta) : (B ? B.JUNTA_PADRAO : 0.01);
      var out = [], x = 0;
      var pecas = (fiada && fiada.pecas) ? fiada.pecas : [];
      pecas.forEach(function (p, i) {
        for (var k = 0; k < p.qtd; k++) {
          x = r4(x + p.comprimento);
          /* a última junta é o fim da parede, não conta como junta interna */
          if (!(i === pecas.length - 1 && k === p.qtd - 1)) { out.push(x); x = r4(x + j); }
        }
      });
      return out;
    },

    /* =================================================================
     * VERGA E CONTRAVERGA
     * Estrutural (ABCP): apoio de 15 cm para vão <= 1,00 m e 30 cm acima
     * disso; contraverga sempre 30 cm de cada lado.
     * Vedação cerâmica (NBR 8545): 20 cm de cada lado.
     * Vão maior que 2,40 m deixa de ser verga e passa a ser viga.
     * ================================================================= */
    verga: function (vao, famId, opts) {
      opts = opts || {};
      var tipo = opts.tipo || "estrutural";       // "estrutural" | "vedacao"
      var V = num(vao);
      if (!(V > 0)) return { ok: false, motivo: "Vão precisa ser maior que zero." };
      var m = this.malha(famId);
      var apoio = tipo === "vedacao" ? 0.20 : (V <= 1.00 ? 0.15 : 0.30);
      var comp = r3(V + 2 * apoio);
      /* arredonda para múltiplo da malha, para caber em canaleta inteira */
      var compMod = m ? r3(Math.ceil(comp / m.horizontal - 1e-6) * m.horizontal) : comp;
      var r = {
        ok: true, elemento: "verga", vao: r3(V), tipo: tipo,
        apoioCada: apoio, comprimento: comp, comprimentoModular: compMod,
        fonte: tipo === "vedacao" ? "NBR 8545 (20 cm de cada lado)" : "ABCP — 15 cm até 1,00 m; 30 cm acima",
        nota: "Comprimento arredondado para " + compMod.toFixed(2) + " m, para fechar em canaleta inteira."
      };
      if (V > 2.40) {
        r.viga = true;
        r.aviso = "Vão de " + V.toFixed(2) + " m passa de 2,40 m: não é mais verga, tem de ser calculado como VIGA.";
      }
      return r;
    },
    contraverga: function (vao, famId, opts) {
      opts = opts || {};
      var tipo = opts.tipo || "estrutural";
      var V = num(vao);
      if (!(V > 0)) return { ok: false, motivo: "Vão precisa ser maior que zero." };
      var m = this.malha(famId);
      var apoio = tipo === "vedacao" ? 0.20 : 0.30;
      var comp = r3(V + 2 * apoio);
      var compMod = m ? r3(Math.ceil(comp / m.horizontal - 1e-6) * m.horizontal) : comp;
      return {
        ok: true, elemento: "contraverga", vao: r3(V), tipo: tipo,
        apoioCada: apoio, comprimento: comp, comprimentoModular: compMod,
        fonte: tipo === "vedacao" ? "NBR 8545 (20 cm)" : "ABCP (30 cm de cada lado)",
        nota: "Só sob janela. Porta não leva contraverga."
      };
    },

    /* Porta encostada no canto: se não sobra apoio para a verga, a solução
     * é grautear o encontro. O software tem de perceber isso sozinho. */
    conferirApoioVerga: function (distanciaAoCanto, vao, famId, opts) {
      opts = opts || {};
      var v = this.verga(vao, famId, opts);
      if (!v.ok) return v;
      var d = num(distanciaAoCanto);
      if (d >= v.apoioCada - 1e-6) return { ok: true, suficiente: true, apoioNecessario: v.apoioCada, apoioDisponivel: r3(d) };
      return {
        ok: true, suficiente: false, apoioNecessario: v.apoioCada, apoioDisponivel: r3(d),
        acao: "grautear-encontro",
        aviso: "Sobram só " + Math.round(d * 100) + " cm de apoio (precisa de " + Math.round(v.apoioCada * 100) + " cm). " +
               "Lance ponto de graute no encontro das paredes e marque na elevação."
      };
    },

    /* =================================================================
     * CINTAS
     * Respaldo: última fiada, por padrão (obrigatória quando a laje é
     * concretada no local).
     * Intermediária: a meia altura, quando a parede é longa demais.
     * ================================================================= */
    cintas: function (comprimento, altura, famId, opts) {
      opts = opts || {};
      var externa = !!opts.externa;
      var curadoVapor = !!opts.curadoVapor;
      var L = num(comprimento), H = num(altura);
      var out = [];
      out.push({
        tipo: "respaldo", posicao: "última fiada", altura: r3(H),
        comprimento: r3(L), obrigatoria: opts.lajeConcretadaNoLocal !== false,
        nota: opts.lajeMacicaIcada
          ? "Laje pré-moldada içada: pode ir na penúltima fiada — e aí fica proibida qualquer concretagem no local."
          : "Laje concretada no local exige cinta na última fiada."
      });
      var limite = externa ? (curadoVapor ? 7.0 : 6.0) : (curadoVapor ? 12.0 : 10.0);
      if (L > limite) {
        out.push({
          tipo: "intermediaria", posicao: "meia altura", altura: r3(H / 2),
          comprimento: r3(L), armadura: "1 φ10",
          motivo: "Parede " + (externa ? "externa" : "interna") + " de " + L.toFixed(2) + " m passa do limite de " + limite.toFixed(1) + " m."
        });
      }
      return { ok: true, cintas: out, limiteAplicado: limite, curadoVapor: curadoVapor };
    },

    /* =================================================================
     * JUNTA DE CONTROLE (retração) e JUNTA DE DILATAÇÃO
     * Espaçamento base por espessura, com redutores quando há abertura e
     * quando o bloco não é curado a vapor.
     * ================================================================= */
    juntaControle: function (comprimento, famId, opts) {
      opts = opts || {};
      var externa = !!opts.externa;
      var L = num(comprimento);
      var base = externa ? 6.0 : 10.0;              /* espaçamento base, m */
      if (opts.armaduraHorizontal) base = externa ? 9.0 : 15.0;
      var fator = 1;
      if (opts.comAbertura && !opts.curadoVapor) fator = 0.70;
      else if (opts.comAbertura) fator = 0.85;
      else if (!opts.curadoVapor) fator = 0.80;
      var limite = r3(base * fator);
      var n = L > limite ? Math.floor(L / limite) : 0;
      var posicoes = [];
      for (var i = 1; i <= n; i++) posicoes.push(r3(i * (L / (n + 1))));
      return {
        ok: true, comprimento: r3(L), limite: limite, base: base, fator: fator,
        necessarias: n, posicoes: posicoes, espessuraJunta: 0.010,
        nota: n ? "Interromper 50% da armadura horizontal na junta. Manter 10 mm, sem quebrar a modulação." : "Comprimento dentro do limite: não precisa de junta de controle."
      };
    },
    juntaDilatacao: function (maiorDimensaoPlanta) {
      var d = num(maiorDimensaoPlanta);
      return {
        ok: true, dimensao: r3(d), limite: 24.0,
        necessaria: d > 24.0,
        aviso: d > 24.0 ? "A edificação passa de 24 m em planta: prever junta de dilatação." : ""
      };
    },

    /* =================================================================
     * ARMADURA VERTICAL CONSTRUTIVA
     * 1 φ10 grauteado em todo canto externo e em toda reentrância,
     * independentemente do número de pavimentos. Acima de 5 pavimentos,
     * estende-se a mais pontos.
     * ================================================================= */
    armaduraConstrutiva: function (opts) {
      opts = opts || {};
      var pav = num(opts.pavimentos) || 1;
      var pontos = [];
      (opts.cantosExternos || []).forEach(function (p, i) { pontos.push({ tipo: "canto externo", ref: p, barras: 1, bitola: 10 }); });
      (opts.reentrancias || []).forEach(function (p) { pontos.push({ tipo: "reentrância", ref: p, barras: 1, bitola: 10 }); });
      if (pav > 5) {
        (opts.encontrosPrincipais || []).forEach(function (p) { pontos.push({ tipo: "encontro de paredes principais", ref: p, barras: 1, bitola: 10 }); });
        (opts.paredesLongas || []).forEach(function (p) { pontos.push({ tipo: "parede > 3,5 m", ref: p, barras: 1, bitola: 10 }); });
        (opts.paredesIsoladas || []).forEach(function (p) { pontos.push({ tipo: "parede isolada sem travamento", ref: p, barras: 1, bitola: 10 }); });
      }
      return {
        ok: true, pavimentos: pav, pontos: pontos, total: pontos.length,
        regra: "1 φ10 grauteado por ponto. Uma barra por furo — se o cálculo pedir mais, verificar As,máx (8% da área grauteada).",
        fonte: "ABCP / NBR 16868"
      };
    },

    /* =================================================================
     * GRAUTE
     * Vertical: conta por FURO, nunca por m² de parede. A área do furo
     * varia com o bloco e com o fabricante — por isso é sobrescrevível.
     * Horizontal: coeficiente SINAPI por metro de canaleta.
     * ================================================================= */
    AREA_FURO: { "29": 0.0075, "39-14": 0.0115, "39-19": 0.0190 },  /* m² por furo — DERIVADO da ABCP */

    grauteVertical: function (nFuros, alturaGrauteada, famId, opts) {
      opts = opts || {};
      var area = opts.areaFuro != null ? num(opts.areaFuro) : this.AREA_FURO[famId];
      if (!(area > 0)) return { ok: false, motivo: "Informe a área do furo do bloco do seu fornecedor." };
      var n = Math.max(0, Math.round(num(nFuros)));
      var h = num(alturaGrauteada);
      return {
        ok: true, furos: n, altura: r3(h), areaFuro: area,
        volume: r4(n * area * h),
        derivado: opts.areaFuro == null,
        fonte: opts.areaFuro == null ? "Área do furo derivada da Figura 6.3 do livro da ABCP — sobrescreva com a ficha do seu fornecedor." : "Área informada pelo usuário.",
        nota: "Prever bloco com janela de limpeza na 1ª fiada dos furos grauteados; limpeza a cada ~6 fiadas."
      };
    },
    grauteHorizontal: function (metrosCanaleta, larguraCm) {
      var L = num(metrosCanaleta);
      var coef = num(larguraCm) >= 14 ? 0.021 : 0.011;   /* m³/m — SINAPI */
      return {
        ok: true, metros: r3(L), coeficiente: coef, volume: r4(L * coef),
        fonte: "SINAPI — 0,021 m³/m para canaleta de 14/15 cm; 0,011 m³/m para 9/10 cm."
      };
    },

    /* Aço: nunca somar sem o transpasse. Emenda varia com o fck do graute. */
    EMENDA: { 15: 53, 20: 43.7, 25: 37.7 },     /* × φ */
    MASSA_LINEAR: { 5.0: 0.154, 6.3: 0.245, 8.0: 0.395, 10.0: 0.617, 12.5: 0.963, 16.0: 1.578, 20.0: 2.466 },

    aco: function (comprimentoTotal, bitolaMm, opts) {
      opts = opts || {};
      var fck = num(opts.fckGraute) || 20;
      var phi = num(bitolaMm);
      var massa = this.MASSA_LINEAR[phi];
      if (!massa) return { ok: false, motivo: "Bitola " + phi + " mm não está na tabela. Informe a massa linear." };
      var L = num(comprimentoTotal);
      var nEmendas = Math.max(0, Math.round(num(opts.emendas) || 0));
      var fatorEmenda = this.EMENDA[fck] || this.EMENDA[20];
      var compEmenda = r3(nEmendas * fatorEmenda * phi / 1000);
      var ancoragem = r3((num(opts.apoios) || 0) * 12 * phi / 1000);
      var total = r3(L + compEmenda + ancoragem);
      return {
        ok: true, bitola: phi, massaLinear: massa,
        comprimentoBarras: r3(L), comprimentoEmendas: compEmenda, comprimentoAncoragem: ancoragem,
        comprimentoTotal: total, peso: r3(total * massa),
        fckGraute: fck, fatorEmenda: fatorEmenda,
        nota: "Emenda de " + fatorEmenda + "φ para graute C" + fck + "; ancoragem sobre apoio de 12φ."
      };
    },

    /* =================================================================
     * VEDAÇÃO x ESTRUTURAL
     * Parede de vedação nunca amarra direto na estrutural: vai tela. E
     * onde há tela, o cálculo não pode considerar interação entre elas.
     * ================================================================= */
    tipoDeAmarracao: function (paredeA, paredeB) {
      var a = String((paredeA && paredeA.funcao) || "").toLowerCase();
      var b = String((paredeB && paredeB.funcao) || "").toLowerCase();
      if (a === "estrutural" && b === "estrutural") {
        return { tipo: "direta", tela: false, interacao: true, nota: "Amarração direta: considerar interação (flange) no cálculo." };
      }
      if (a !== b) {
        return {
          tipo: "indireta", tela: true, interacao: false,
          especificacao: "Tela de aço a cada 2 fiadas",
          nota: "Vedação não amarra direto na estrutural. Com tela, o cálculo NÃO considera interação entre as duas."
        };
      }
      return { tipo: "direta", tela: false, interacao: false, nota: "Duas paredes de vedação: amarração direta, sem efeito estrutural." };
    },

    /* Encunhamento (aperto) — só vedação. A parede sobe depois da estrutura
     * e o topo é fechado dias depois, para a estrutura acomodar antes. */
    encunhamento: function (opts) {
      opts = opts || {};
      return {
        ok: true, aplicavel: String(opts.funcao || "vedacao").toLowerCase() === "vedacao",
        folga: 0.02,
        prazoDias: 7,
        tecnicas: ["Argamassa expansiva", "Tijolo maciço inclinado a 45°", "Espuma de poliuretano (só onde não há exigência de desempenho estrutural)"],
        nota: "Deixar 2 cm no topo e encunhar depois de pelo menos 7 dias, para a estrutura acomodar. Alvenaria estrutural NÃO leva encunhamento."
      };
    },

    /* =================================================================
     * ASSISTENTE: qual família usar
     * ================================================================= */
    recomendarFamilia: function (espessuraParedeM, funcao) {
      var t = num(espessuraParedeM);
      if (Math.abs(t - 0.14) < 0.02) {
        return {
          ok: true, recomendada: "29", rotulo: "Família 29 (módulo 15 cm)",
          motivo: "Parede de 14 cm fecha melhor na malha de 15 cm: os encontros em L saem com o próprio bloco inteiro.",
          alternativa: "39-14",
          avisoAlternativa: "A família 39 com 14 cm também serve, mas exige os blocos especiais 34 (canto) e 54 (T) e rende menos."
        };
      }
      if (Math.abs(t - 0.19) < 0.02) {
        return {
          ok: true, recomendada: "39-19", rotulo: "Família 39 · largura 19",
          motivo: "Com 19 cm de largura o módulo da largura (20 cm) é o mesmo do comprimento — nenhum bloco especial de amarração."
        };
      }
      return {
        ok: false,
        motivo: "Espessura de " + (t * 100).toFixed(0) + " cm não corresponde a bloco de concreto estrutural comum (14 ou 19 cm).",
        opcoes: [{ id: "29", t: 0.14 }, { id: "39-14", t: 0.14 }, { id: "39-19", t: 0.19 }]
      };
    },

    /* =================================================================
     * ALERTAS DE COMPRA — o que a base de preços NÃO tem
     * Armadilha real: o SINAPI chama o bloco de amarração 14x19x34 de
     * "MEIO BLOCO". Casar por texto troca a peça. Tem de ser por código.
     * ================================================================= */
    alertasDeBase: function (famId, pecasUsadas) {
      var av = [];
      var usa = {};
      (pecasUsadas || []).forEach(function (p) { usa[p.id || p] = true; });
      if (usa["39-amarr-t"]) {
        av.push({ nivel: "atencao", peca: "14x19x54", texto: "O bloco de amarração 14x19x54 não existe como insumo no SINAPI. Vai precisar de composição própria ou cotação." });
      }
      if (famId === "39-19") {
        av.push({ nivel: "atencao", peca: "largura 19", texto: "O SINAPI só tem composição de alvenaria estrutural de concreto para 14x19x29 e 14x19x39. Para largura 19 não há composição pronta." });
      }
      if (usa["39-amarr-l"]) {
        av.push({ nivel: "info", peca: "14x19x34", texto: "No SINAPI o 14x19x34 aparece com a descrição \"MEIO BLOCO\" (insumos 38594/38591/44901). Case por CÓDIGO, nunca pelo texto — senão vira o meio-bloco 14x19x19." });
      }
      return av;
    }
  };

  global.Alvenaria = Alvenaria;
  if (typeof module !== "undefined" && module.exports) module.exports = Alvenaria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
