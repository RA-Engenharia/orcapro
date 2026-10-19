/* =====================================================================
 * climcarga.js — CARGA TÉRMICA por ambiente (climatização, frente C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md.
 *
 * DOIS CAMINHOS, LADO A LADO (pedido do Rogério, 16/10/2026):
 *  1) método de COMPONENTES — paredes e cobertura por U × DTE (diferença de
 *     temperatura equivalente), vidros por ganho solar × fator solar e por
 *     condução, pessoas, iluminação, equipamentos, ar exterior (RE 9/2003) ou
 *     infiltração. Cada coeficiente vem do HidNormas (chaves cl.*) ou do
 *     usuário (premissa "entrada"); faltou → componente PENDENTE com a chave.
 *  2) VERIFICAÇÃO RÁPIDA pela regra de fabricante (Midea, Electrolux) e pela
 *     faixa BTU/h·m² do ASHRAE Pocket Guide, mostrando a DIVERGÊNCIA.
 *
 * ⚠ Nenhum valor de norma/fabricante aqui. Os números que a fonte só traz
 *   em TEXTO ("27 m3/h por pessoa", "600 BTU/h por m2") são LIDOS do texto
 *   por numeros(); a linha é achada pelo rótulo. Se o texto da fonte mudar e
 *   a leitura falhar, vira pendência — nunca um valor de reserva.
 * ⚠ Hoje (17/10/2026) os coeficientes do método de componentes NÃO existem
 *   em dados-fonte (cl.nbr16655_3_fatores_numericos está pendente na F1):
 *   sem entrada do RT, o método sai PENDENTE e a capacidade usa a maior das
 *   duas (parcial × regra de fabricante) — CONTRATO-CLIMA §6.1. Isso é de
 *   propósito: recado que mente é pior que recado nenhum.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? n : null; }
  function r1(v) { return Math.round(v * 10) / 10; }   /* clim:ok arredondamento a 1 casa */
  function r0(v) { return Math.round(v); }
  function fmt(v, casas) { if (!fin(v)) return "—"; var c = casas == null ? 1 : casas; return v.toFixed(c).replace(".", ","); }

  /* -------------------------------------------------------------- FÍSICA */
  /* clim:fisica-inicio — conversões e psicrometria (ASHRAE Handbook — Fundamentals 2017, cap. 1)
     · 1 W = 3,412141633 BTU/h (BTU da Tabela Internacional; NIST SP 811)
     · 1 TR (tonelada de refrigeração) = 12 000 BTU/h (definição)
     · R do ar seco = 287,042 J/(kg·K); razão das massas molares água/ar = 0,621945 (eq. 20)
     · cp do ar seco 1,006 kJ/(kg·K); cp do vapor 1,86 kJ/(kg·K); h de vaporização a 0 °C 2501 kJ/kg (eq. 30 e 32)
     · atmosfera padrão: p = 101,325 (1 − 2,25577e−5 Z)^5,2559 kPa (eq. 3)
     · pressão de saturação sobre água, Hyland-Wexler (eq. 6), T em K, p em Pa
     · W pela TBU (eq. 33, t* ≥ 0 °C)
     · volume específico do ar úmido v = R·T·(1 + 1,607858 W)/p (eq. 28) */
  var W_PARA_BTUH = 3.412141633, BTUH_POR_TR = 12000;
  var R_AR = 287.042, MM = 0.621945, F_V = 1.607858, KELVIN = 273.15;
  var CP_AR = 1.006, CP_VAP = 1.86, HFG0 = 2501, CP_AGUA_TBU = 2.326, CP_LIQ = 4.186;
  var C8 = -5.8002206e3, C9 = 1.3914993, C10 = -4.8640239e-2, C11 = 4.1764768e-5, C12 = -1.4452093e-8, C13 = 6.5459673;
  function patm_kPa(z) { return 101.325 * Math.pow(1 - 2.25577e-5 * (z || 0), 5.2559); }
  function pws_kPa(t) { var T = t + KELVIN; return Math.exp(C8 / T + C9 + C10 * T + C11 * T * T + C12 * T * T * T + C13 * Math.log(T)) / 1000; }
  function W_de_UR(t, ur_pct, p) { var pw = ur_pct / 100 * pws_kPa(t); return MM * pw / (p - pw); }
  function W_de_TBU(t, tbu, p) {
    var ps = pws_kPa(tbu), Ws = MM * ps / (p - ps);
    return ((HFG0 - CP_AGUA_TBU * tbu) * Ws - CP_AR * (t - tbu)) / (HFG0 + CP_VAP * t - CP_LIQ * tbu);
  }
  /* massa específica do AR SECO (kg ar seco / m³ de ar úmido) — a base do q = ṁ·Δh */
  function rhoSeco(t, W, p) { return p * 1000 / (R_AR * (t + KELVIN) * (1 + F_V * W)); }
  /* calor sensível e latente de uma vazão de ar (m³/h) entre dois estados — W */
  function arSensivel_W(Q_m3h, rho, W, dT) { return rho * (Q_m3h / 3600) * (CP_AR + CP_VAP * W) * dT * 1000; }
  function arLatente_W(Q_m3h, rho, dW) { return rho * (Q_m3h / 3600) * HFG0 * dW * 1000; }
  /* azimute (graus, horário a partir do norte verdadeiro) de um vetor da cena:
     norte do projeto = −Z, x = leste; anguloNorte = norte verdadeiro girado a
     partir do norte do projeto, anti-horário (a convenção do js/bimterreno.js) */
  var GRAUS_POR_RAD = 180 / Math.PI, VOLTA = 360, INCLINACAO_PAREDE = 90;   /* parede vertical = 90° do plano horizontal */
  function azimute(dx, dz, anguloNorte) { var a = Math.atan2(dx, -dz) * GRAUS_POR_RAD + (Number(anguloNorte) || 0); a = a % VOLTA; return a < 0 ? a + VOLTA : a; }
  /* clim:fisica-fim */

  function W_para_BTUh(w) { return w * W_PARA_BTUH; }
  function BTUh_para_W(b) { return b / W_PARA_BTUH; }
  function BTUh_para_TR(b) { return b / BTUH_POR_TR; }

  /* oito setores (rosa dos ventos em PT-BR), cada um com 1/8 de volta centrado no rumo */
  var SETORES = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  function setor(az) { var passo = VOLTA / SETORES.length; return SETORES[Math.round(((az % VOLTA) + VOLTA) % VOLTA / passo) % SETORES.length]; }
  /* ⚠ SOL FORTE por hemisfério (decisão do RT, revisão 17/10/2026 M4): no hemisfério SUL o sol passa ao
     NORTE a maior parte do ano e à tarde vem do oeste — fachadas N, NO, O e SO (lado seguro). A versão
     anterior só tinha O/NO/SO e dava a fachada norte igual à sul. No hemisfério norte, o espelho.
     Geometria solar (latitude × mês) NÃO foi usada: transformar irradiação em "forte/fraco" pede um
     limiar que nenhuma fonte dá — fica a regra fixa, declarada. */
  var SETORES_SOL_FORTE = { S: ["N", "NO", "O", "SO"], N: ["S", "SO", "O", "NO"] };
  /* "S 19 graus 52.98 min" (TMYx) ou "19,851 S" (NBR 16401-1 A.2) */
  function hemisferioDe(lat) { var t = String(lat == null ? "" : lat).trim(); return /^N\b|\sN$/i.test(t) ? "N" : (/^S\b|\sS$/i.test(t) ? "S" : null); }

  /* ------------------------------------------------- NÚMEROS NO TEXTO
   * Lê os números de um texto de fonte no formato brasileiro: "10.200"
   * (milhar com ponto), "0,4" (decimal com vírgula), "26,5". Não lê o
   * algarismo grudado em letra ("m3", "m2", "CO2", "G1"). */
  function numeros(texto) {
    var s = String(texto == null ? "" : texto), out = [], m;
    var re = /(^|[^\w.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?![\w])/g;
    while ((m = re.exec(s))) out.push(Number(m[2].replace(/\./g, "") + (m[3] ? "." + m[3] : "")));   /* clim:ok grupos da regex */
    return out;
  }
  /* o primeiro número SEGUIDO de uma unidade/palavra ("18 kW", "6 vezes", "40 kg") — null se não há */
  function numeroAntesDe(texto, sufixo) {
    var s = String(texto == null ? "" : texto), re = new RegExp("(^|[^\\w.,])(\\d{1,3}(?:\\.\\d{3})+|\\d+)(?:,(\\d+))?\\s*(?=" + sufixo.source + ")", "gi"), m = re.exec(s);
    return m ? Number(m[2].replace(/\./g, "") + (m[3] ? "." + m[3] : "")) : null;   /* clim:ok grupos da regex */
  }
  /* o número da linha cujo rótulo casa; null + pendência quando não acha */
  function linhaPorRotulo(ctx, chave, filtro, colRotulo, re, usadoEm) {
    var ls = ctx.linhas(chave, filtro || null, usadoEm);
    if (!ls) return null;
    var l = ls.filter(function (x) { return re.test(String(x[colRotulo] || "")); })[0];
    if (!l) { ctx.pendencia(chave + "[" + colRotulo + "~" + re.source + "]", "linha não encontrada pelo rótulo em " + chave + " — o texto da fonte mudou?", usadoEm); return null; }
    return l;
  }
  /* a fonte da tabela com o endereço e a seção da PRÓPRIA linha (a tabela de regras junta fabricantes) */
  function fonteLinha(ctx, chave, l) {
    var f = fonteDe(ctx, chave) || {}, o = {}; Object.keys(f).forEach(function (k) { o[k] = f[k]; });
    if (l && l.fonte_url && /^https?:/.test(l.fonte_url)) o.url = l.fonte_url;
    if (l && l.pagina_ou_secao && !/^idem$/i.test(l.pagina_ou_secao)) o.pagina = l.pagina_ou_secao;
    if (l && l.fabricante) o.doc = l.fabricante + " — " + (l.pagina_ou_secao || "") + (o.url === f.url ? " (" + (f.doc || "") + ")" : "");
    return o;
  }
  function fonteDe(ctx, chave, coluna) { var c = ctx.consulta(chave, null, coluna || null); return c && c.ok ? c.fonte : null; }

  /* ------------------------------------------------------ CONDIÇÕES
   * externa (revisão 17/10/2026, NBR 16401-1:2024 lida no texto): a cidade do Anexo A (Tabelas A.2 a
   *   A.5) é a FONTE das condições de projeto (tbs e tbu coincidente no percentil, pressão, Δtbs diária);
   *   o TMYx da estação (cl.condicoes_externas_mg_ashrae_tmyx + js/climclima.js) fica para o perfil
   *   horário e a radiação, e para a cidade que a norma não lista (declarado). local.fonte = "tmyx" força.
   * percentil: 5.1.1.1 — 1 % para residencial/comercial, 0,4 % OBRIGATÓRIO em projeto crítico.
   * interna: entrada, senão o CENTRO das faixas de verão da RE 9/2003 */
  var PERCENTIS = { "04": ["tbs_04pct", "tbu_coinc_04pct"], "1": ["tbs_1pct", "tbu_coinc_1pct"], "2": ["tbs_2pct", "tbu_coinc_2pct"] };
  var PERCENTIS_16401 = { "04": ["tbs_04pct", "tbuc_04pct"], "1": ["tbs_1pct", "tbuc_1pct"], "2": ["tbs_2pct", "tbuc_2pct"] };
  /* nome sem acento e sem caixa, para casar "Uberlandia" (TMYx) com "Uberlândia" (norma) */
  var ACENTOS = { "á": "a", "à": "a", "â": "a", "ã": "a", "é": "e", "ê": "e", "í": "i", "ó": "o", "ô": "o", "õ": "o", "ú": "u", "ü": "u", "ç": "c" };
  function chaveNome(s) { return String(s == null ? "" : s).toLowerCase().replace(/[áàâãéêíóôõúüç]/g, function (c) { return ACENTOS[c]; }).replace(/[^a-z0-9]+/g, " ").trim(); }
  /* a linha da cidade no Anexo A: local.cidade (+ local.aeroporto) ou a estação TMYx que COMEÇA pelo nome da cidade */
  function cidade16401(local, ctx, uso) {
    var ls = ctx.linhas("cl.nbr16401_1.condicoes_externas", null, uso);
    if (!ls) return null;
    var alvo = local.cidade ? chaveNome(local.cidade) : null, est = chaveNome(local.estacao), aero = local.aeroporto ? chaveNome(local.aeroporto) : null;
    var cand = ls.filter(function (l) { var c = chaveNome(l.cidade); return alvo ? c === alvo : (est && (est === c || est.indexOf(c + " ") === 0)); });
    if (aero) cand = cand.filter(function (l) { return chaveNome(l.local).indexOf(aero) >= 0; }).concat(cand.filter(function (l) { return chaveNome(l.local).indexOf(aero) < 0; }));
    return cand[0] || null;
  }
  function aplicacaoProjeto(local, edificacao) { return local.critico ? "critico" : (edificacao === "comercial" ? "comercial" : "residencial"); }
  function condicoes(local, interno, ctx, opcoes) {
    local = local || {}; interno = interno || {}; opcoes = opcoes || {};
    var prem = [], verifs = [], res = { externa: null, interna: null, premissas: prem, verificacoes: verifs, ok: true };
    var uso = "condições externas de projeto";
    /* percentil pela 16401-1 5.1.1.1 */
    var apl = aplicacaoProjeto(local, opcoes.edificacao), fq = ctx.consulta("cl.nbr16401_1.frequencia_projeto", { aplicacao: apl }, "percentil", uso);
    var percNorma = fq.ok ? String(fq.valor) : null, perc = PERCENTIS[local.percentil] ? String(local.percentil) : (percNorma || "1");
    if (!PERCENTIS[local.percentil]) prem.push({ item: "percentil das condições externas", valor: perc + " % — " + (fq.ok ? fq.linha.texto + " (NBR 16401-1:2024 5.1.1.1)" : "padrão do motor (tabela de frequência sem fonte)"), origem: fq.ok ? "norma" : "padrao_motor", fonte: fq.ok ? fq.fonte : null });
    if (fq.ok && fq.linha.obrigatorio === true && perc !== percNorma) {
      verifs.push({ alvo: "local", nome: "percentil das condições externas em projeto crítico (NBR 16401-1 5.1.1.1 a)", valor: perc, limite: percNorma, unidade: "%", eta: null, ok: false, status: "reprovado",
                    passos: ["projeto crítico: " + fq.linha.texto + "; informado " + perc + " %"], fonte: fq.fonte });
    }
    var linha16401 = local.fonte === "tmyx" ? null : cidade16401(local, ctx, uso);
    if (linha16401 && linha16401.defeito) {
      ctx.pendencia("cl.nbr16401_1.condicoes_externas[" + linha16401.cidade + "]", linha16401.defeito, uso); linha16401 = null; res.ok = false;
    }
    if (linha16401) {
      var col = PERCENTIS_16401[perc], tbs = num(linha16401[col[0]]), tbu = num(linha16401[col[1]]), pk = num(linha16401.pressao_kpa), dt = num(linha16401.dtbs_diaria_c);
      if (tbs == null || tbu == null || pk == null) { ctx.pendencia("cl.nbr16401_1.condicoes_externas[" + linha16401.cidade + "]." + col.join(","), "coluna vazia na linha da cidade", uso); res.ok = false; }
      else {
        var f16 = fonteDe(ctx, "cl.nbr16401_1.condicoes_externas", "cidade");
        res.externa = { fonteCondicoes: "nbr16401_1", cidade: linha16401.cidade, uf: linha16401.uf, aeroporto: linha16401.local, estacao: local.estacao || null, percentil: perc,
                        hemisferio: hemisferioDe(linha16401.latitude), latitude: linha16401.latitude, tbs_C: tbs, tbu_C: tbu, altitude_m: num(linha16401.elevacao_m), amplitude_C: dt, p_kPa: pk,
                        fonte: f16, declaracao: "condições externas de projeto da ABNT NBR 16401-1:2024, Anexo A (" + linha16401.cidade + "/" + linha16401.uf + ", " + linha16401.local + ", " + perc + " %: tbs " + fmt(tbs) + " °C, tbu coincidente " + fmt(tbu) + " °C, " + fmt(pk, 2) + " kPa)" +
                                    (local.estacao ? "; o arquivo TMYx da estação " + local.estacao + " só dá o perfil horário e a radiação" : "") };
        res.externa.W = W_de_TBU(tbs, tbu, pk);
        res.externa.tem_C = dt != null ? tbs - dt / 2 : null;
      }
    } else if (!local.estacao) { ctx.pendencia("local.estacao", "cidade/estação climática não informada (entrada.local.cidade ou .estacao)", uso); res.ok = false; }
    else {
      var cT = ctx.consulta("cl.condicoes_externas_mg_ashrae_tmyx", { estacao: local.estacao }, PERCENTIS[perc][0], uso);
      var cU = ctx.consulta("cl.condicoes_externas_mg_ashrae_tmyx", { estacao: local.estacao }, PERCENTIS[perc][1], uso);
      if (cT.ok && cU.ok) {
        var alt = num(cT.linha.altitude_m), p = patm_kPa(alt || 0), amp = num(cT.linha.amplitude_diaria_verao_c);
        res.externa = { fonteCondicoes: "tmyx", estacao: local.estacao, percentil: perc, hemisferio: hemisferioDe(cT.linha.latitude), latitude: cT.linha.latitude, tbs_C: num(cT.valor), tbu_C: num(cU.valor), altitude_m: alt, amplitude_C: amp, p_kPa: p,
                        fonte: cT.fonte, declaracao: "condições externas calculadas de arquivo climático TMYx (Climate.OneBuilding, método ASHRAE): a cidade não está no Anexo A da NBR 16401-1:2024 transcrito" + (local.fonte === "tmyx" ? " (forçado: local.fonte = tmyx)" : "") + " — 16401-1 5.1.1.3 manda adotar a cidade listada de clima mais próximo: decisão do RT" };
        res.externa.W = W_de_TBU(res.externa.tbs_C, res.externa.tbu_C, p);
        res.externa.tem_C = fin(amp) ? res.externa.tbs_C - amp / 2 : null;
      } else res.ok = false;
    }
    var p0 = res.externa ? res.externa.p_kPa : patm_kPa(num(local.altitude_m) || 0);
    var ti = num(interno.tbs_C), ur = num(interno.ur_pct), origem = "entrada";
    if (ti == null || ur == null) {
      var lT = linhaPorRotulo(ctx, "cl.ar_exterior_re9_2003", null, "parametro", /bulbo seco - verão/i, "condição interna (TBS)");
      var lU = linhaPorRotulo(ctx, "cl.ar_exterior_re9_2003", null, "parametro", /Umidade relativa - verão/i, "condição interna (UR)");
      var nT = lT ? numeros(lT.valor) : [], nU = lU ? numeros(lU.valor) : [];
      if (ti == null && nT.length >= 2) { ti = (nT[0] + nT[1]) / 2; prem.push({ item: "TBS interna", valor: fmt(ti) + " °C = centro da faixa de verão " + nT[0] + " a " + nT[1] + " °C (RE 9/2003 " + lT.item + ")", origem: "norma" }); }
      if (ur == null && nU.length >= 2) { ur = (nU[0] + nU[1]) / 2; prem.push({ item: "UR interna", valor: fmt(ur) + " % = centro da faixa de verão " + nU[0] + " a " + nU[1] + " % (RE 9/2003 " + lU.item + ")", origem: "norma" }); }
      origem = "norma";
    }
    if (ti == null || ur == null) { res.ok = false; if (ti == null) ctx.pendencia("interno.tbs_C", "TBS interna sem entrada e sem faixa legível na fonte", "condição interna"); if (ur == null) ctx.pendencia("interno.ur_pct", "UR interna sem entrada e sem faixa legível na fonte", "condição interna"); }
    else res.interna = { tbs_C: ti, ur_pct: ur, W: W_de_UR(ti, ur, p0), origem: origem };
    return res;
  }

  /* ---------------------------------------------------- USOS E ATIVIDADE */
  var NAO_RESIDENCIAL = { escritorio: 1, loja: 1, reuniao: 1, restaurante: 1, escola: 1, hotel: 1 };
  /* ⚠ ROTULOS — o ÚNICO lugar onde o uso do ambiente vira o RÓTULO da linha na tabela de fonte (revisão
     17/10/2026 A5: a fixture inventava "escritorio"/"em_pe_leve" e o dado real tem "trabalho_escritorio"/
     "em_pe_andando_devagar" → pessoas pendentes em todo escritório, sem nenhum teste reprovar).
     tools/test-clim-rotulos.js reprova se um rótulo daqui não existir no dado REAL gerado.
     Uso sem rótulo = pendência (informe o valor no ambiente) — nunca o rótulo "parecido".
     Escolhas (decisão C1, declaradas no memorial pelo passo): dormitório = sentado em repouso (a linha
     "dormindo" só traz o total, sem sensível/latente); sala, escritório, reunião, hotel = sentado, trabalho
     leve (NBR 16401-1:2008 apud IFPI: escritórios, hotéis, apartamentos); loja/cozinha = em pé, andando
     devagar; restaurante = trabalho moderado (garçom — o lado seguro); escola = sentado, trabalho leve (decisão
     do RT 17/10/2026: aluno em aula libera mais calor que em repouso — lado seguro). */
  var ROTULOS = {
    "cl.pessoas.calor": { coluna: "atividade", porUso: { dormitorio: "sentado_repouso", sala: "sentado_trabalho_leve", reuniao: "sentado_trabalho_leve", escritorio: "sentado_trabalho_leve",
                          hotel: "sentado_trabalho_leve", outro: "sentado_trabalho_leve", loja: "em_pe_andando_devagar", cozinha: "em_pe_andando_devagar", restaurante: "trabalho_moderado", escola: "sentado_trabalho_leve" } },
    "cl.ocupacao.densidade": { coluna: "uso", porUso: { dormitorio: "dormitorio", escritorio: "escritorio", loja: "loja", restaurante: "restaurante", escola: "educacao_fundamental_medio", hotel: "hospedagem" } },
    "cl.iluminacao.densidade": { coluna: "uso", porUso: { dormitorio: "dormitorio", sala: "sala", escritorio: "escritorio", reuniao: "reuniao", cozinha: "cozinha", loja: "loja",
                                 hotel: "dormitorio_hotel", escola: "sala_aula", banheiro: "banheiro", circulacao: "circulacao", servico: "lavanderia", deposito: "deposito" } },
    "cl.equipamentos.densidade": { coluna: "uso", porUso: { escritorio: "escritorio", reuniao: "escritorio", loja: "loja", restaurante: "restaurante", escola: "educacional", hotel: "hospedagem", sala: "sala" } },
    /* infiltração: pelo TIPO DE EDIFICAÇÃO + vedação (a fonte é por edificação, não por ambiente); vedação desconhecida = a "moderada"/"média" da própria fonte */
    "cl.infiltracao": { coluna: "uso", porEdificacao: { residencial: { uso: "residencial", construcao: "moderada" }, comercial: { uso: "comercial", construcao: "media" } } },
    /* velocidade máxima no duto: residência × "escolas, teatros, edifícios públicos" (o comercial vai para público) */
    "cl.duto.velocidade_maxima": { coluna: "uso", porUso: { dormitorio: "residencial", sala: "residencial", cozinha: "residencial", escritorio: "publico", reuniao: "publico",
                                   loja: "publico", escola: "publico", restaurante: "publico", hotel: "publico", outro: "publico" } },
    "cl.carga_por_m2_ashrae_pocket": { coluna: "ocupacao", porUso: { residencial: "Residências", apartamento: "Apartamentos", hotel: "Hotel - dormitórios", escritorio: "Escritórios",
                                       reuniao: "Escritórios", escola: "Escolas", loja: "Lojas/Shoppings", restaurante: "Restaurantes" } }
  };
  function rotuloDe(chave, uso) { var r = ROTULOS[chave]; return r && r.porUso && Object.prototype.hasOwnProperty.call(r.porUso, uso) ? r.porUso[uso] : null; }
  var ATIVIDADE_DO_USO = ROTULOS["cl.pessoas.calor"].porUso, OCUPACAO_ASHRAE = ROTULOS["cl.carga_por_m2_ashrae_pocket"].porUso;
  /* edificação comercial: todo ambiente é não residencial; senão decide o uso do ambiente */
  function ehResidencial(amb, edificacao) { return edificacao === "comercial" ? false : !NAO_RESIDENCIAL[amb.uso]; }

  /* ------------------------------------------------------- COMPONENTES */
  function coef(ctx, chave, filtro, coluna, usadoEm) { var c = ctx.consulta(chave, filtro, coluna, usadoEm); return c.ok ? { v: num(c.valor), linha: c.linha, fonte: c.fonte } : null; }
  /* motor solar e dados climáticos: no navegador pelo global, no Node pelo require ao lado deste arquivo */
  function dep(nome, arquivo) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arquivo); } catch (e) {} } return null; }
  /* azimute da normal: o do modelo; sem ele, o centro do setor da orientação (dito no passo) */
  function azimuteDe(x) { if (num(x.azimute) != null) return { v: num(x.azimute), dito: null }; var i = SETORES.indexOf(x.orientacao); return i < 0 ? null : { v: i * VOLTA / SETORES.length, dito: "azimute " + (i * VOLTA / SETORES.length) + "° = centro do setor " + x.orientacao + " (o ambiente não trouxe o azimute)" }; }

  function calcular(amb, cond, ctx, opcoes) {
    opcoes = opcoes || {};
    var comps = [], ext = cond && cond.externa, int = cond && cond.interna, rotulo = "carga de " + (amb.nome || amb.id);
    function comp(tipo, alvo) { var c = { tipo: tipo, alvo: alvo, sensivel_W: 0, latente_W: 0, passos: [], fonte: null, status: "ok", pendencias: [] }; comps.push(c); return c; }
    function falta(c, chave) { c.status = "pendente"; c.pendencias.push(chave); }
    /* falta que NÃO passou por ctx.consulta (rótulo sem mapeamento, linha ausente): registra no contexto também */
    function faltaCtx(c, chave) { falta(c, chave); ctx.pendencia(chave, "componente " + c.tipo + " sem valor: " + chave, rotulo); }
    var dT = ext && int ? ext.tbs_C - int.tbs_C : null;

    /* ⚠ MÉTODO DA ENVOLTÓRIA (frente carga térmica solar, 17/10/2026). Com dado climático horário da
       estação (js/climclima.js), paredes, cobertura e vidros saem da FÍSICA (js/climsolar.js: sol-ar e
       radiação no plano, hora a hora, nos 12 meses) — a DTE e o ganho solar tabelados não existem para
       o hemisfério sul (CONTRATO-CLIMA §1.2). Sem dado climático da cidade, volta ao caminho da tabela
       (cl.componentes.dte / cl.vidro.ganho_solar), que hoje sai PENDENTE com a ação "informar cidade com
       dado climático". opcoes.metodoEnvoltoria "dte" força a tabela (quem tiver a do RT). */
    var SOL = dep("ClimSolar", "./climsolar.js"), CLI = dep("ClimClima", "./climclima.js");
    var clima = opcoes.clima !== undefined ? opcoes.clima : (ext && CLI && CLI.obter ? CLI.obter(ext.estacao) : null);
    var solar = opcoes.metodoEnvoltoria !== "dte" && !!(SOL && clima && ext && int);
    var opacos = [], vidrosS = [], alertas = [], premissasCarga = [];
    /* ⚠ recado que mente é pior que nenhum: motor/dado NÃO CARREGADO na página é diferente de cidade sem dado */
    if (!solar && opcoes.metodoEnvoltoria !== "dte" && ext && (arr(amb.paredes).some(function (p) { return p.externa; }) || arr(amb.vidros).length || amb.cobertura)) {
      if (!SOL || (!CLI && opcoes.clima === undefined)) ctx.pendencia("clima.motor", "o motor solar (js/climsolar.js) ou os dados climáticos (js/climclima.js) não foram carregados nesta tela: paredes, cobertura e vidros ficaram pela tabela de DTE/ganho solar, sem fonte — recarregar a página; persistindo, avisar o suporte", rotulo);
      else ctx.pendencia("clima.estacao[" + ext.estacao + "]", "sem dado climático horário (TMYx) para a estação " + ext.estacao + ": paredes, cobertura e vidros ficam pela tabela de DTE/ganho solar, que não tem fonte — informar uma cidade com dado climático (Clima › Local)", rotulo);
    }
    /* absortância/emissividade (cl.solar.absortancia): entrada → rótulo do acabamento → referência INI-C */
    function superficie(c, elemento, x) {
      if (num(x.alfa) != null) { c.passos.push("α = " + fmt(num(x.alfa), 2) + (num(x.eps) != null ? ", ε = " + fmt(num(x.eps), 2) : ", ε não informado (sem perda de onda longa)") + " (entrada)"); return { alfa: num(x.alfa), eps: num(x.eps) }; }
      var rot = x.superficie || ("referencia_" + elemento), a = coef(ctx, "cl.solar.absortancia", { superficie: rot }, "alfa_a", rotulo);
      if (!a || a.v == null) { falta(c, "cl.solar.absortancia"); return null; }
      var e = num(a.linha.emissividade_de), ad = num(a.linha.alfa_de);
      c.passos.push("α = " + fmt(a.v, 2) + (ad != null && ad !== a.v ? " (maior da faixa " + fmt(ad, 2) + "–" + fmt(a.v, 2) + ")" : "") + ", ε = " + (e == null ? "— (a fonte não dá: sem perda de onda longa, lado seguro)" : fmt(e, 2) + (num(a.linha.emissividade_a) !== e ? " (menor da faixa)" : "")) +
                   " — " + (x.superficie ? x.superficie : "acabamento não informado: referência INI-C (premissa)"));
      c.fonte = c.fonte || a.fonte; return { alfa: a.v, eps: e };
    }
    function rse(c, elemento) {
      var r = coef(ctx, "cl.solar.resistencia_superficial", { direcao_fluxo: elemento === "cobertura" ? "descendente" : "horizontal" }, "rse_m2k_w", rotulo);
      if (!r || r.v == null) { falta(c, "cl.solar.resistencia_superficial"); return null; }
      return r.v;
    }
    function opacoSolar(c, elemento, x, U, A, inclinacao) {
      var az = elemento === "cobertura" ? { v: num(x.azimute) || 0, dito: num(x.inclinacao_graus) > 0 && num(x.azimute) == null ? "cobertura inclinada sem azimute: tomado 0° (norte)" : null } : azimuteDe(x);
      var s = superficie(c, elemento, x), R = rse(c, elemento), am = x.amortecimento || {};
      /* ⚠ revisão B4 (17/10/2026): f e atraso REDUZEM a carga (f = 0,1 corta 90 % da parcela oscilante) — só valem com a
         FONTE do RT (cálculo pela NBR 15220-2, ficha do sistema construtivo); sem fonte são ignorados (f = 1, φ = 0) e avisados */
      var temAm = num(am.f) != null || num(am.atraso_h) != null, fonteAm = String(am.fonte == null ? "" : am.fonte).trim();
      if (temAm && !fonteAm) { c.passos.push("amortecimento informado SEM fonte: ignorado (f = 1, φ = 0, lado seguro) — informar amortecimento.fonte"); alertas.push({ alvo: c.alvo, texto: "amortecimento de " + c.tipo + " " + c.alvo + " informado sem fonte: ignorado (f = 1, φ = 0)" }); am = {}; }
      else if (temAm) { c.passos.push("amortecimento informado pelo RT: f = " + fmt(num(am.f) == null ? 1 : num(am.f), 2) + ", atraso " + (num(am.atraso_h) || 0) + " h — fonte: " + fonteAm); premissasCarga.push({ item: "amortecimento de " + c.tipo + " " + c.alvo, valor: "informado pelo RT: f = " + fmt(num(am.f) == null ? 1 : num(am.f), 2) + ", atraso " + (num(am.atraso_h) || 0) + " h (fonte: " + fonteAm + ")", origem: "entrada" }); }
      if (!az) falta(c, "ambiente.paredes[" + x.id + "].azimute");
      if (az && az.dito) c.passos.push(az.dito);
      if (U != null && A != null && s && R != null && az) opacos.push({ comp: c, tipo: elemento, id: c.alvo, U: U, A: A, inclinacao: inclinacao, azimute: az.v, alfa: s.alfa, eps: s.eps, Rse: R, f: num(am.f), atraso_h: num(am.atraso_h) });
    }

    /* DTE corrigida pela temperatura interna e pela média externa quando a fonte traz a referência */
    function dte(c, elemento, tipo, orient) {
      var d = coef(ctx, "cl.componentes.dte", { elemento: elemento, tipo: tipo || "padrao", orientacao: orient }, "dte_k", rotulo);
      if (!d || d.v == null) { falta(c, "cl.componentes.dte"); return null; }
      var v = d.v, tir = num(d.linha.ti_ref_c), ter = num(d.linha.tem_ref_c);
      if (tir != null && ter != null && int && ext && fin(ext.tem_C)) {
        var corr = (tir - int.tbs_C) + (ext.tem_C - ter);
        c.passos.push("DTE " + orient + " = " + fmt(v) + " + (" + fmt(tir) + " − " + fmt(int.tbs_C) + ") + (" + fmt(ext.tem_C) + " − " + fmt(ter) + ") = " + fmt(v + corr) + " K");
        v += corr;
      } else c.passos.push("DTE " + orient + " = " + fmt(v) + " K (sem correção: a tabela não traz a referência)");
      c.fonte = d.fonte; return v;
    }
    function uDe(c, elemento, tipo, uEntrada) {
      if (num(uEntrada) != null) { c.passos.push("U = " + fmt(num(uEntrada), 2) + " W/(m²·K) (entrada)"); return num(uEntrada); }
      var u = coef(ctx, "cl.componentes.u", { elemento: elemento, tipo: tipo || "padrao" }, "u_w_m2k", rotulo);
      if (!u || u.v == null) { falta(c, "cl.componentes.u"); return null; }
      c.passos.push("U = " + fmt(u.v, 2) + " W/(m²·K) (" + elemento + ", " + (tipo || "padrão") + ")"); c.fonte = c.fonte || u.fonte; return u.v;
    }

    /* 1) paredes externas: Q = U · A_líquida · DTE (tabela) ou pela sol-ar hora a hora (solar) */
    arr(amb.paredes).forEach(function (p) {
      if (!p.externa) return;
      var A = num(p.areaLiquida_m2) != null ? num(p.areaLiquida_m2) : num(p.area_m2);
      var c = comp("parede", p.id), U = uDe(c, "parede", p.tipo, p.U);
      if (solar) { opacoSolar(c, "parede", p, U, A, INCLINACAO_PAREDE); return; }
      var D = dte(c, "parede", p.tipo, p.orientacao);
      if (U != null && D != null && A != null) { c.sensivel_W = U * A * D; c.passos.push("Q = U·A·DTE = " + fmt(U, 2) + " × " + fmt(A, 2) + " × " + fmt(D) + " = " + fmt(c.sensivel_W) + " W"); }
    });
    /* 2) cobertura exposta (horizontal, salvo cobertura.inclinacao_graus) */
    if (amb.cobertura && num(amb.cobertura.area_m2) > 0) {
      var cc = comp("cobertura", amb.id), Uc = uDe(cc, "cobertura", amb.cobertura.tipo, amb.cobertura.U);
      if (solar) {
        var inc = num(amb.cobertura.inclinacao_graus) || 0;
        if (num(amb.cobertura.inclinacao_graus) == null) cc.passos.push("cobertura tomada HORIZONTAL (o modelo não dá a inclinação do telhado: premissa)");
        opacoSolar(cc, "cobertura", amb.cobertura, Uc, num(amb.cobertura.area_m2), inc);
      } else {
        var Dc = dte(cc, "cobertura", amb.cobertura.tipo, "H");
        if (Uc != null && Dc != null) { cc.sensivel_W = Uc * amb.cobertura.area_m2 * Dc; cc.passos.push("Q = " + fmt(Uc, 2) + " × " + fmt(amb.cobertura.area_m2, 2) + " × " + fmt(Dc) + " = " + fmt(cc.sensivel_W) + " W"); }
      }
    }
    /* 3) vidros: solar (A · FS · G · FCR, ou A · FS · It hora a hora) + condução (U · A · ΔT, ou U·A·(To − Ti) na hora de pico) */
    arr(amb.vidros).forEach(function (v) {
      var A = num(v.area_m2); if (!(A > 0)) return;
      var cs = comp("vidro_solar", v.id), FS = num(v.fatorSolar);
      if (FS != null) cs.passos.push("FS = " + fmt(FS, 2) + " (entrada / produto)");
      else { var f = coef(ctx, "cl.vidro.fator_solar", { tipo: v.tipo || "padrao" }, "fs", rotulo); if (f && f.v != null) { FS = f.v; cs.fonte = f.fonte; cs.passos.push("FS = " + fmt(FS, 2) + " (" + (v.tipo || "padrão") + ")"); } else falta(cs, "cl.vidro.fator_solar"); }
      var ck;
      if (solar) {
        ck = comp("vidro_conducao", v.id);
        var Uvs = uDe(ck, "vidro", v.tipo, v.U), azv = azimuteDe(v);
        if (!azv) falta(cs, "ambiente.vidros[" + v.id + "].azimute");
        else if (azv.dito) cs.passos.push(azv.dito);
        if (v.beiral && !(num(v.altura_m) > 0)) cs.passos.push("beiral informado sem a altura da janela: sombra NÃO considerada (lado seguro)");
        /* ⚠ sem FS ou sem azimute o SOL fica pendente, mas a CONDUÇÃO ainda se calcula (FS 0 só na conta, o componente solar segue PENDENTE) */
        if ((FS != null && azv) || Uvs != null) vidrosS.push({ cs: cs, semSol: !(FS != null && azv), ck: Uvs == null ? null : ck, id: v.id, A: A, FS: FS != null && azv ? FS : 0, U: Uvs, inclinacao: INCLINACAO_PAREDE, azimute: azv ? azv.v : 0, altura_m: num(v.altura_m), beiral: v.beiral || null });
        return;
      }
      var g = coef(ctx, "cl.vidro.ganho_solar", { orientacao: v.orientacao }, "w_m2", rotulo), fcr = 1;
      if (!g || g.v == null) falta(cs, "cl.vidro.ganho_solar");
      else { cs.fonte = g.fonte; if (num(g.linha.fcr) != null) fcr = num(g.linha.fcr); else cs.passos.push("FCR = 1 (a tabela não traz o fator de carga de resfriamento: sem amortecimento, conservador)"); }
      if (FS != null && g && g.v != null) { cs.sensivel_W = A * FS * g.v * fcr; cs.passos.push("Q = A·FS·G·FCR = " + fmt(A, 2) + " × " + fmt(FS, 2) + " × " + fmt(g.v) + " × " + fmt(fcr, 2) + " = " + fmt(cs.sensivel_W) + " W (" + v.orientacao + ")"); }
      ck = comp("vidro_conducao", v.id);
      var Uv = uDe(ck, "vidro", v.tipo, v.U);
      if (Uv != null && dT != null) { ck.sensivel_W = Uv * A * dT; ck.passos.push("Q = U·A·ΔT = " + fmt(Uv, 2) + " × " + fmt(A, 2) + " × " + fmt(dT) + " = " + fmt(ck.sensivel_W) + " W"); }
      else if (dT == null) falta(ck, "condicoes");
    });
    /* 3b) a envoltória pela física: UMA chamada por ambiente — a hora e o mês de pico são do AMBIENTE
       (soma coincidente), não o pico de cada componente somado (que daria carga que nunca acontece) */
    var envSolar = null;
    if (solar && (opacos.length || vidrosS.length)) {
      envSolar = SOL.envoltoria({ clima: clima, tbsAnual: ext.tbs_C, ti: int.tbs_C, meses: opcoes.meses,
                                  opacos: opacos.map(function (o) { return { tipo: o.tipo, id: o.id, U: o.U, A: o.A, inclinacao: o.inclinacao, azimute: o.azimute, alfa: o.alfa, eps: o.eps, Rse: o.Rse, f: o.f, atraso_h: o.atraso_h }; }),
                                  vidros: vidrosS.map(function (v) { return { id: v.id, A: v.A, FS: v.FS, U: v.U, inclinacao: v.inclinacao, azimute: v.azimute, altura_m: v.altura_m, beiral: v.beiral }; }) });
      var fonteClima = clima.fonte ? { chave: "clima.tmyx", doc: clima.fonte.doc, url: clima.fonte.url, pagina: clima.fonte.pagina, tipo: clima.fonte.tipo } : null;
      if (!envSolar.ok) {
        opacos.forEach(function (o) { faltaCtx(o.comp, "clima[" + ext.estacao + "]." + envSolar.faltam.join(",")); });
        vidrosS.forEach(function (v) { faltaCtx(v.cs, "clima[" + ext.estacao + "]." + envSolar.faltam.join(",")); if (v.ck) falta(v.ck, "clima"); });
      } else {
        var porChave = {}; envSolar.componentes.forEach(function (k) { porChave[k.tipo + "|" + k.alvo] = k; });
        opacos.forEach(function (o) { var k = porChave[o.tipo + "|" + o.id]; o.comp.sensivel_W = k.W; o.comp.passos = o.comp.passos.concat(k.passos); o.comp.fonte = o.comp.fonte || fonteClima; o.comp.solar = { tsa_C: k.tsa, It_Wm2: k.It }; });
        vidrosS.forEach(function (v) {
          var k = porChave["vidro_solar|" + v.id]; if (!v.semSol) { v.cs.sensivel_W = k.W; v.cs.passos = v.cs.passos.concat(k.passos); v.cs.fonte = v.cs.fonte || fonteClima; v.cs.solar = { It_Wm2: k.It }; }
          var kc = porChave["vidro_conducao|" + v.id]; if (v.ck && kc) { v.ck.sensivel_W = kc.W; v.ck.passos = v.ck.passos.concat(kc.passos); }
        });
      }
    }
    /* 4) pessoas */
    var nP = num(amb.pessoas), cp = comp("pessoas", amb.id), origemP = "entrada";
    if (nP == null) {
      var oc = ocupacao(amb, ctx, rotulo);
      if (oc.n != null) { nP = oc.n; origemP = oc.origem; cp.passos.push(oc.passo); } else faltaCtx(cp, oc.falta);
    } else cp.passos.push("pessoas = " + nP + " (entrada)");
    var ativ = amb.atividade || rotuloDe("cl.pessoas.calor", amb.uso);
    if (nP != null && nP > 0 && !ativ) faltaCtx(cp, "cl.pessoas.calor[uso=" + amb.uso + "] (sem rótulo de atividade: informe ambiente.atividade)");
    else if (nP != null) {
      if (nP === 0) cp.passos.push("sem ocupação");
      else {
        var pc = ctx.consulta("cl.pessoas.calor", { atividade: ativ }, "sensivel_w", rotulo), pl = ctx.consulta("cl.pessoas.calor", { atividade: ativ }, "latente_w", rotulo);
        if (pc.ok && pl.ok) { cp.sensivel_W = nP * num(pc.valor); cp.latente_W = nP * num(pl.valor); cp.fonte = pc.fonte; cp.passos.push("Q = " + nP + " × (" + fmt(num(pc.valor)) + " + " + fmt(num(pl.valor)) + ") W (" + ativ + ")"); }
        else falta(cp, "cl.pessoas.calor");
      }
    }
    /* 5) iluminação e 6) equipamentos: W informado ou densidade × área */
    [["iluminacao", "iluminacao_W", "cl.iluminacao.densidade"], ["equipamentos", "equipamentos_W", "cl.equipamentos.densidade"]].forEach(function (k) {
      var c = comp(k[0], amb.id), v = num(amb[k[1]]);
      if (v != null) { c.sensivel_W = v; c.passos.push(k[0] + " = " + fmt(v) + " W (entrada)"); return; }
      var rot = rotuloDe(k[2], amb.uso), ls = rot ? ctx.linhas(k[2], { uso: rot }, rotulo) : null, l = ls && ls[0];
      if (!rot) { faltaCtx(c, k[2] + "[uso=" + amb.uso + "] (sem rótulo: informe ambiente." + k[1] + ")"); return; }
      if (l && num(l.w_m2) != null && num(amb.area_m2) != null) { c.sensivel_W = num(l.w_m2) * amb.area_m2; c.fonte = l.fonte || null; c.passos.push("Q = " + fmt(num(l.w_m2)) + " W/m² × " + fmt(amb.area_m2, 2) + " m² = " + fmt(c.sensivel_W) + " W (" + rot + ")"); }
      else if (l && num(l.potencia_w) != null) { c.sensivel_W = num(l.potencia_w); c.fonte = l.fonte || null; c.passos.push(k[0] + " = " + fmt(num(l.potencia_w)) + " W por ambiente (" + rot + ")"); }
      else faltaCtx(c, k[2] + "[uso=" + rot + "] (ou ambiente." + k[1] + ")");
    });
    /* 7) ar exterior (RE 9, não residencial) ou infiltração (residencial) — CONTRATO-CLIMA §6.4 */
    var forca = opcoes.arExterno, usaRE9 = forca === true || (forca !== false && !ehResidencial(amb, opcoes.edificacao));
    var Q = null, ca;
    if (usaRE9) {
      ca = comp("ar_exterior", amb.id);
      var lr = linhaPorRotulo(ctx, "cl.ar_exterior_re9_2003", null, "parametro", /renovação de ar adequada/i, rotulo), taxa = lr ? numeros(lr.valor)[0] : null;
      if (taxa == null) falta(ca, "cl.ar_exterior_re9_2003");
      else if (nP == null) falta(ca, "pessoas");
      else { Q = nP * taxa; ca.fonte = fonteDe(ctx, "cl.ar_exterior_re9_2003"); ca.passos.push("V = " + nP + " pessoas × " + fmt(taxa) + " m³/h (RE 9/2003 " + lr.item + ") = " + fmt(Q) + " m³/h"); }
    } else {
      ca = comp("infiltracao", amb.id);
      var fi = ROTULOS["cl.infiltracao"].porEdificacao[ehResidencial(amb, opcoes.edificacao) ? "residencial" : "comercial"];
      var filtroI = { uso: fi.uso, construcao: opcoes.vedacao || fi.construcao };
      var inf = coef(ctx, "cl.infiltracao", filtroI, "trocas_h", rotulo);
      if (inf && inf.v != null && num(amb.volume_m3) != null) { Q = inf.v * amb.volume_m3; ca.fonte = inf.fonte; ca.passos.push("V = " + fmt(inf.v, 2) + " trocas/h (" + filtroI.uso + ", vedação " + filtroI.construcao + (opcoes.vedacao ? "" : " — premissa: vedação desconhecida") + ") × " + fmt(amb.volume_m3, 2) + " m³ = " + fmt(Q) + " m³/h"); }
      else falta(ca, "cl.infiltracao");
    }
    if (Q != null) {
      if (!ext || !int) falta(ca, "condicoes");
      else {
        var rho = rhoSeco(int.tbs_C, int.W, ext.p_kPa), dW = ext.W - int.W;
        ca.sensivel_W = arSensivel_W(Q, rho, ext.W, dT); ca.latente_W = Math.max(0, arLatente_W(Q, rho, dW));
        ca.passos.push("ρ(ar seco) = " + fmt(rho, 3) + " kg/m³ a " + fmt(ext.p_kPa, 2) + " kPa; We = " + fmt(ext.W * 1000, 2) + " g/kg, Wi = " + fmt(int.W * 1000, 2) + " g/kg");   /* clim:ok casas na formatação */
        ca.passos.push("Qs = ρ·V·(cp_ar + cp_v·We)·ΔT = " + fmt(ca.sensivel_W) + " W; Ql = ρ·V·hfg·ΔW = " + fmt(ca.latente_W) + " W");
        /* ⚠ LATENTE no ponto de DESUMIDIFICAÇÃO (revisão do gerente 17/10/2026): o ponto de resfriamento (TBS 1 % + TBU
           coincidente) é SECO em MG — em BH We 10,5 < Wi 11,2 g/kg → latente do ar externo ZERO, num verão úmido. O ASHRAE
           (cap. 14) dá à parte o ponto de desumidificação (TPO + TBS coincidente); vale o MAIOR latente dos dois (lado
           seguro: sensível do ponto de resfriamento + latente do de desumidificação, que não coincidem — declarado). */
        var dsm = clima && clima.desumidificacao && clima.desumidificacao[ext.percentil];
        if (dsm && num(dsm.tpo_c) != null) {
          var pwd = pws_kPa(num(dsm.tpo_c)), Wd = MM * pwd / (ext.p_kPa - pwd), latD = Math.max(0, arLatente_W(Q, rho, Wd - int.W));
          ca.passos.push("ponto de desumidificação " + ext.percentil + " % (TMYx/ASHRAE): TPO " + fmt(num(dsm.tpo_c)) + " °C → Wd = " + fmt(Wd * 1000, 2) + " g/kg; Ql = ρ·V·hfg·(Wd − Wi) = " + fmt(latD) + " W" +   /* clim:ok casas na formatação */
                         (latD > ca.latente_W ? " → VALE este latente (maior que o do ponto de resfriamento)" : " (menor: vale o do ponto de resfriamento)"));
          if (latD > ca.latente_W) ca.latente_W = latD;
        } else if (clima !== null && clima !== undefined) ca.passos.push("sem ponto de desumidificação no dado climático: latente só no ponto de resfriamento");
      }
    }

    var sens = 0, lat = 0, pend = comps.filter(function (c) { return c.status !== "ok"; });
    comps.forEach(function (c) { sens += c.sensivel_W; lat += c.latente_W; c.sensivel_W = r1(c.sensivel_W); c.latente_W = r1(c.latente_W); });
    var tot = sens + lat;
    var res = { status: pend.length ? "pendente" : "ok", parcial: pend.length > 0, componentes: comps,
                sensivel_W: r1(sens), latente_W: r1(lat), total_W: r1(tot), total_BTUh: r0(W_para_BTUh(tot)), total_TR: Math.round(BTUh_para_TR(W_para_BTUh(tot)) * 100) / 100,
                pessoas: nP, pessoasOrigem: nP == null ? null : origemP,
                rapida: rapida(amb, ctx, { tipoResidencia: opcoes.tipoResidencia, hemisferio: ext && ext.hemisferio, pessoas: nP, pessoasOrigem: origemP }), base: null, requerida_W: null, requerida_BTUh: null, pendencias: [] };
    pend.forEach(function (c) { c.pendencias.forEach(function (k) { if (res.pendencias.indexOf(k) < 0) res.pendencias.push(k); }); });
    /* método da envoltória + hora/mês de pico e a carga horária do dia de pico (envoltória hora a hora +
       cargas internas e de ar, que o motor toma CONSTANTES no dia: lado seguro) */
    res.metodoEnvoltoria = solar ? "solar" : "dte";
    res.alertas = alertas; res.premissas = premissasCarga;
    /* ⚠ decisão do RT 17/10/2026 (revisão A2): Rse 0,04 da NBR 15220-2 — mesma origem dos U, par coerente; vai ao resultado
       como premissa EXPLÍCITA, com o tamanho do que o ASHRAE daria (quem assina vê) */
    if (opacos.length) premissasCarga.push({ item: "película externa (sol-ar)", valor: "Rse " + fmt(opacos[0].Rse, 2) + " m²K/W (NBR 15220-2, a mesma origem dos U usados); com o coeficiente do ASHRAE (ho ≈ 17 W/m²K) a parcela solar seria até ~40 % maior — decisão do RT 17/10/2026", origem: "decisao_rt" });
    if (envSolar && envSolar.ok) {
      var outros = 0; comps.forEach(function (c) { if (["parede", "cobertura", "vidro_solar", "vidro_conducao"].indexOf(c.tipo) < 0) outros += c.sensivel_W + c.latente_W; });
      res.solar = { estacao: ext.estacao, pico: { mes: envSolar.pico.mes, hora: envSolar.pico.hora, envoltoria_W: r1(envSolar.pico.W) }, dia: envSolar.dia.dia, To_C: envSolar.dia.To.map(r1),
                    envoltoria_W: envSolar.serie.map(r1), cargaHoraria_W: envSolar.serie.map(function (w) { return r1(w + outros); }),
                    porMes: envSolar.meses.map(function (m) { return { mes: m.mes, hora: m.hora, envoltoria_W: r1(m.W) }; }),
                    declaracao: "paredes, cobertura e vidros pela temperatura sol-ar e pela radiação de céu claro hora a hora (dia 21 de cada mês, dados TMYx da estação " + ext.estacao + "), no lugar da DTE/ganho solar tabelados (sem tabela do hemisfério sul)" };
    }
    /* ⚠ RESIDENCIAL: o método da NBR 16655-3:2019 é o PADRÃO (revisão 17/10/2026, texto da norma lido);
       componentes + solar viram a CONFERÊNCIA. Apartamento/repetitivo: a norma exige o cálculo completo →
       a base fica nos componentes e a 16655-3 é a conferência. opcoes.metodoResidencial "componentes" força. */
    res.metodo = "componentes";
    if (ehResidencial(amb, opcoes.edificacao) && opcoes.metodoResidencial !== "componentes") {
      var r16 = carga16655(amb, cond, ctx, opcoes);
      res.nbr16655 = r16;
      var repetitivo = opcoes.repetitivo === true || opcoes.tipoResidencia === "apartamento";
      if (!repetitivo && r16.status === "ok") {
        res.metodo = "nbr16655_3"; res.base = "nbr16655_3"; res.requerida_BTUh = r16.total_BTUh; res.requerida_W = r16.total_W;
        res.conferencia = { metodo: res.metodoEnvoltoria === "solar" ? "componentes + solar" : "componentes", status: res.status, total_BTUh: res.total_BTUh,
                            divergencia_pct: res.total_BTUh > 0 && !res.parcial ? r1((res.total_BTUh - r16.total_BTUh) / r16.total_BTUh * 100) : null };
        if (res.rapida.maior_BTUh != null && r16.total_BTUh > 0) res.rapida.divergencia_pct = r1((r16.total_BTUh - res.rapida.maior_BTUh) / res.rapida.maior_BTUh * 100);
        return res;
      }
      if (repetitivo) res.nbr16655.papel = "conferência (ambiente repetitivo/apartamento: a 16655-3 exige o cálculo completo)";
    }
    /* base da capacidade — CONTRATO-CLIMA §6.1 */
    var regra = res.rapida.maior_BTUh;
    if (!res.parcial) { res.base = "componentes"; res.requerida_BTUh = res.total_BTUh; }
    else if (regra != null && regra >= res.total_BTUh) { res.base = "regra_fabricante"; res.requerida_BTUh = regra; }
    else if (res.total_BTUh > 0) { res.base = "maior_das_duas"; res.requerida_BTUh = res.total_BTUh; }
    if (res.requerida_BTUh != null) res.requerida_W = r1(BTUh_para_W(res.requerida_BTUh));
    if (!res.parcial && regra != null && regra > 0) res.rapida.divergencia_pct = r1((res.total_BTUh - regra) / regra * 100);
    return res;
  }

  /* ===================================================== NBR 16655-3:2019
   * MÉTODO DA NORMA para carga térmica RESIDENCIAL (CLTD/SCL/CLF simplificado, às 16 h, um ambiente
   * por vez). Lido no texto em 17/10/2026 (2ª edição, que cancela a de 2018). Decisão pelo texto:
   *   · é o método PADRÃO do residencial; a carga por componentes + solar fica de CONFERÊNCIA;
   *   · o próprio escopo EXIGE cálculo completo em ambientes repetitivos/apartamentos → aí a base é
   *     a carga por componentes e a 16655-3 vira a conferência (opcoes.tipoResidencia "apartamento" ou
   *     opcoes.repetitivo);
   *   · sem fator de segurança nem folga (4.1 e Seção 5).
   * Gabarito: Anexo A, sala de 60 m² em São Paulo → 12 340 W e 7 549 W (tools/test-clim-nbr.js).
   * Fórmulas: Eq. 1–5 (ar externo), Eq. 6 (CLTDr), Eq. 7 (opaco e vidro por condução: A·CLTD/R),
   * Eq. 8 (insolação: A·SC·SHGF·CLF), Eq. 9–13 (pessoas, iluminação, equipamentos). Nenhum número da
   * norma aqui: todos de cl.nbr16655_3.* (e 16401-1 para a cidade que a Tabela 1 não lista). */
  var ROTULOS_16655 = {
    iluminacao: { dormitorio: "quartos_dormir", escritorio: "escritorio" },     /* "sala de jantar" NÃO é a sala de estar: sem rótulo → entrada ou INI-R */
    pessoas: "sentadas_trabalho_leve",
    aparelho: "televisao_40pol"                                                  /* ambiente.aparelhos (contagem) = televisão 40 pol da Tabela 13 — premissa declarada */
  };
  function regra16655(ctx, parametro, usadoEm) { var c = ctx.consulta("cl.nbr16655_3.regras", { parametro: parametro }, "valor", usadoEm); return c.ok ? num(c.valor) : null; }
  function latitudeGraus(t) {
    var s = String(t == null ? "" : t), n = numeros(s.replace(/(\d)\.(\d)/g, "$1,$2"));
    if (!n.length) return null;
    return /graus/i.test(s) && n.length >= 2 ? n[0] + n[1] / GRAUS_MIN : n[0];
  }
  var GRAUS_MIN = 60;   /* clim:ok minutos por grau */
  /* entalpia e volume específico do ar úmido — ASHRAE Fundamentals 2017 cap. 1, eq. 32 e 28 (física, não norma) */
  function entalpia_kJkg(t, W) { return CP_AR * t + W * (HFG0 + CP_VAP * t); }
  function volumeEsp(t, W, p) { return R_AR * (t + KELVIN) * (1 + F_V * W) / (p * 1000); }

  var PREM_PAREDE = "parede externa sem U informado: R da Tabela 5 (bloco de concreto 20 cm rebocado) — informe o U para outra parede";
  function carga16655(amb, cond, ctx, opcoes) {
    opcoes = opcoes || {};
    var rotulo = "NBR 16655-3 (" + (amb.nome || amb.id) + ")", comps = [], prem = [], alertas = [], ext = cond && cond.externa, intC = cond && cond.interna;
    function comp(tipo, alvo) { var c = { tipo: tipo, alvo: alvo, sensivel_W: 0, latente_W: 0, passos: [], status: "ok", pendencias: [] }; comps.push(c); return c; }
    function falta(c, chave, motivo) { c.status = "pendente"; c.pendencias.push(chave); ctx.pendencia(chave, motivo || ("16655-3 sem valor: " + chave), rotulo); }
    var cidade = (ext && ext.cidade) || null;
    /* 1) interna: 24 °C (referência das Tabelas 3 e 7), ou a da entrada */
    var tiRef = regra16655(ctx, "tbs_interna_referencia", rotulo), ti = intC && intC.origem === "entrada" ? intC.tbs_C : tiRef;
    if (ti == null || tiRef == null) { var c0 = comp("condicoes", amb.id); falta(c0, "cl.nbr16655_3.regras[tbs_interna_referencia]"); return fechar16655(comps, prem, alertas, "pendente"); }
    if (!(intC && intC.origem === "entrada") && tiRef != null) prem.push("tbs interna " + fmt(ti) + " °C = referência das Tabelas 3 e 7 da NBR 16655-3 (26 °C dá menor custo — informe para usar)");
    /* 2) externa: Tabela 1 da 16655-3; cidade fora → NBR 16401-1 a 0,4 % (a Tabela 1 é a coluna 0,4 %) com psicrometria (4.2.1) */
    var e = null, l1 = cidade ? (ctx.linhas("cl.nbr16655_3.ext_verao", { cidade: cidade }, rotulo) || [])[0] : null;
    if (l1) e = { tbs: num(l1.tbs_c), W: num(l1.w_kg_kg), v: num(l1.v_m3_kg), h: num(l1.h_kj_kg), alt: num(l1.altitude_m), origem: "Tabela 1 da NBR 16655-3 (" + cidade + ")" };
    else if (ext) {
      var l04 = ext.fonteCondicoes === "nbr16401_1" ? (ctx.linhas("cl.nbr16401_1.condicoes_externas", { cidade: ext.cidade }, rotulo) || [])[0] : null;
      var tE = l04 ? num(l04.tbs_04pct) : ext.tbs_C, tuE = l04 ? num(l04.tbuc_04pct) : ext.tbu_C, pE = ext.p_kPa, WE = W_de_TBU(tE, tuE, pE);
      e = { tbs: tE, W: WE, v: volumeEsp(tE, WE, pE), h: entalpia_kJkg(tE, WE), alt: ext.altitude_m, origem: l04 ? "NBR 16401-1 Anexo A, " + ext.cidade + " a 0,4 % (a Tabela 1 da 16655-3 não lista a cidade — 4.2.1)" : "arquivo TMYx da estação " + ext.estacao + " (cidade fora da 16655-3 e da 16401-1 transcritas)" };
    }
    if (!e || e.tbs == null) { var cx = comp("condicoes", amb.id); falta(cx, "nbr16655_3.condicoes_externas", "sem condição externa para a 16655-3"); return fechar16655(comps, prem, alertas, "pendente"); }
    prem.push("ar externo: " + e.origem + " — tbs " + fmt(e.tbs) + " °C, W " + fmt(e.W * 1000, 2) + " g/kg, h " + fmt(e.h, 2) + " kJ/kg");   /* clim:ok casas na formatação */
    /* 3) interna (W, h): Tabela 3 pela altitude mais próxima com a mesma tbs; senão psicrometria a UR 50 % (a base da Tabela 3) */
    var t3 = (ctx.linhas("cl.nbr16655_3.int_verao", null, rotulo) || []).filter(function (l) { return num(l.tbs_c) === ti; })
      .sort(function (a, b) { return Math.abs(num(a.altitude_m) - (e.alt || 0)) - Math.abs(num(b.altitude_m) - (e.alt || 0)); })[0], ia;
    if (t3) ia = { W: num(t3.w_kg_kg), h: num(t3.h_kj_kg), origem: "Tabela 3, condição " + t3.condicao + " (" + t3.altitude_m + " m, " + fmt(ti) + " °C)" };
    else { var pI = ext ? ext.p_kPa : patm_kPa(e.alt || 0), urRef = regra16655(ctx, "ur_interna_referencia", rotulo), WI = W_de_UR(ti, intC && intC.ur_pct != null ? intC.ur_pct : urRef, pI); ia = { W: WI, h: entalpia_kJkg(ti, WI), origem: "psicrometria a " + fmt(ti) + " °C (fora da Tabela 3)" }; }
    prem.push("ar interno: " + ia.origem + " — W " + fmt(ia.W * 1000, 2) + " g/kg, h " + fmt(ia.h, 2) + " kJ/kg");   /* clim:ok casas na formatação */
    /* 4) CLTD: cidade da Tabela 7 → valor da coluna + (24 − ti); senão a referência pela Eq. 6 com TBSaem = tbs − Δtbs/2 */
    var k25 = regra16655(ctx, "cltd_ref_tbs_interna", rotulo), k29 = regra16655(ctx, "cltd_ref_tbs_media_externa", rotulo);
    var dtb = ext && ext.amplitude_C != null ? ext.amplitude_C : null, tbsMed = dtb != null ? e.tbs - dtb / 2 : null;
    var tabCLTD = ctx.linhas("cl.nbr16655_3.cltd", null, rotulo) || [], temCidade = cidade && tabCLTD.some(function (l) { return l.cidade === cidade; });
    function cltd(orient) {
      if (temCidade) { var lc = tabCLTD.filter(function (l) { return l.cidade === cidade && l.orientacao === orient; })[0]; return lc ? { v: num(lc.cltd_c) + (tiRef - ti), p: "CLTD " + orient + " " + cidade + " (Tabela 7) " + fmt(num(lc.cltd_c), 2) + (ti !== tiRef ? " + (" + tiRef + " − " + fmt(ti) + ")" : "") } : null; }
      var lr = tabCLTD.filter(function (l) { return l.cidade === "referencia" && l.orientacao === orient; })[0];
      if (!lr || k25 == null || k29 == null || tbsMed == null) return null;
      var v = num(lr.cltd_c) + (k25 - ti) + (tbsMed - k29);
      return { v: v, p: "CLTDr " + orient + " = " + fmt(num(lr.cltd_c)) + " + (" + k25 + " − " + fmt(ti) + ") + (" + fmt(tbsMed, 2) + " − " + k29 + ") = " + fmt(v, 2) + " (Eq. 6, TBSaem = tbs − Δtbs/2)" };
    }
    if (!temCidade && tbsMed == null) alertas.push("Δtbs diária ausente: o CLTD da cidade fora da Tabela 7 não se corrige (Eq. 6)");
    function R(elemento) { var c = ctx.consulta("cl.nbr16655_3.resistencia", { elemento: elemento }, "r_m2c_w", rotulo); return c.ok ? num(c.valor) : null; }
    /* 5) SHGF: a cidade da Tabela 8; outra → a de latitude mais próxima (só hemisfério sul) — aviso para o RT confirmar */
    var tabS = ctx.linhas("cl.nbr16655_3.shgf", null, rotulo) || [], cidS = cidade && tabS.some(function (l) { return l.cidade === cidade; }) ? cidade : null;
    if (!cidS && tabS.length) {
      var lat = latitudeGraus(ext && ext.latitude);
      if (lat != null && (!ext.hemisferio || ext.hemisferio === "S")) {
        var cs = {}; tabS.forEach(function (l) { cs[l.cidade] = num(l.latitude_graus); });
        cidS = Object.keys(cs).sort(function (a, b) { return Math.abs(cs[a] - lat) - Math.abs(cs[b] - lat); })[0];
        alertas.push("SHGF (Tabela 8) da cidade de latitude mais próxima: " + cidS + " (" + fmt(cs[cidS], 2) + "° S) para " + fmt(lat, 2) + "° S — 4.2.1 admite valor aproximado; o RT confirma");
        ctx.pendencia("cl.nbr16655_3.shgf_outras_latitudes", "SHGF da Tabela 8 por aproximação de latitude (" + cidS + ") — confirmar com o RT", rotulo);
      }
    }
    function shgf(orient) { var l = tabS.filter(function (x) { return x.cidade === cidS && x.orientacao === orient; })[0]; return l ? num(l.shgf_w_m2) : null; }
    function clf(orient) { var c = ctx.consulta("cl.nbr16655_3.clf_insolacao", { orientacao: orient }, "clf", rotulo); return c.ok ? num(c.valor) : null; }
    /* 6) opacos externos: Eq. 7  q = A · CLTDr / R */
    function opaco(c, A, cl, r, rotR) {
      if (A == null || cl == null || r == null) { falta(c, "cl.nbr16655_3." + (cl == null ? "cltd" : "resistencia")); return; }
      c.sensivel_W = A * cl.v / r; c.passos.push(cl.p + "; R " + fmt(r, 3) + " (" + rotR + "); q = " + fmt(A, 2) + " × " + fmt(cl.v, 2) + " / " + fmt(r, 3) + " = " + fmt(c.sensivel_W) + " W");   /* clim:ok casas na formatação */
    }
    arr(amb.paredes).forEach(function (p) {
      if (!p.externa) return;
      var c = comp("parede", p.id), A = num(p.areaLiquida_m2) != null ? num(p.areaLiquida_m2) : num(p.area_m2), rot = p.r16655 || "parede_externa";
      var r = num(p.U) ? 1 / num(p.U) : R(rot); if (!num(p.U) && !p.r16655 && prem.indexOf(PREM_PAREDE) < 0) prem.push(PREM_PAREDE);
      opaco(c, A, cltd(p.orientacao), r, num(p.U) ? "1/U informado" : rot);
    });
    if (amb.cobertura && num(amb.cobertura.area_m2) > 0) {
      var cc = comp("cobertura", amb.id), rotC = amb.cobertura.r16655 || "laje_externa_espaco_ar";
      opaco(cc, num(amb.cobertura.area_m2), cltd("H"), num(amb.cobertura.U) ? 1 / num(amb.cobertura.U) : R(rotC), rotC);
    }
    /* adjacentes não condicionados (4.4): ΔT = tbs externa + 3 − ti */
    var acr = regra16655(ctx, "adjacente_nao_condicionado_acrescimo", rotulo);
    arr(amb.adjacentesNaoCond).forEach(function (a) {
      var c = comp("adjacente", a.id), r = num(a.R) != null ? num(a.R) : R(a.tipo || "parede_interna");
      if (acr == null || r == null) { falta(c, "cl.nbr16655_3." + (acr == null ? "regras" : "resistencia")); return; }
      var dT = e.tbs + acr - ti; c.sensivel_W = num(a.area_m2) * dT / r;
      c.passos.push((a.tipo || "parede_interna") + ": ΔT = " + fmt(e.tbs) + " + " + acr + " − " + fmt(ti) + " = " + fmt(dT, 2) + " °C (4.4); q = " + fmt(num(a.area_m2), 2) + " × " + fmt(dT, 2) + " / " + fmt(r, 3) + " = " + fmt(c.sensivel_W) + " W");   /* clim:ok casas na formatação */
    });
    /* 7) vidros: condução (Eq. 7, CLTD "vidro") + insolação (Eq. 8) */
    arr(amb.vidros).forEach(function (v) {
      var A = num(v.area_m2); if (!(A > 0)) return;
      var ck = comp("vidro_conducao", v.id), rotJ = v.janela16655 === "cortina" ? "janela_externa_cortina" : "janela_externa_simples";
      opaco(ck, A, cltd("vidro"), R(rotJ), rotJ);
      var ci = comp("vidro_insolacao", v.id), rotSC = v.sc16655 || "simples", sc = ctx.consulta("cl.nbr16655_3.sc", { vidro: rotSC }, "sc", rotulo), sg = shgf(v.orientacao), cf = clf(v.orientacao);
      if (!sc.ok || sg == null || cf == null) { falta(ci, "cl.nbr16655_3." + (!sc.ok ? "sc" : (sg == null ? "shgf" : "clf_insolacao"))); return; }
      ci.sensivel_W = A * num(sc.valor) * sg * cf;
      ci.passos.push("q = A·SC·SHGF·CLF = " + fmt(A, 2) + " × " + fmt(num(sc.valor), 2) + " (" + rotSC + ") × " + sg + " (" + v.orientacao + ", " + cidS + ") × " + fmt(cf, 2) + " = " + fmt(ci.sensivel_W) + " W");
    });
    /* 8) infiltração e renovação (Eq. 1–5): Qae = Qinf · A, mae = Qae/3 600/v, qt = mae·Δh, ql = mae·hlv·ΔW, qs = qt − ql */
    var ci2 = comp("infiltracao", amb.id), qmin = regra16655(ctx, "renovacao_minima", rotulo), hlv = regra16655(ctx, "hlv", rotulo), qInf = num(amb.renovacao_m3h_m2 != null ? amb.renovacao_m3h_m2 : opcoes.renovacao_m3h_m2);
    if (qmin == null || hlv == null || num(amb.area_m2) == null) falta(ci2, "cl.nbr16655_3.regras");
    else {
      if (qInf == null || qInf < qmin) { ci2.passos.push((qInf == null ? "renovação não informada" : "renovação informada " + fmt(qInf, 2) + " < mínimo") + ": " + fmt(qmin, 2) + " m³/h·m² (4.5.1)"); qInf = qmin; }
      var Qae = qInf * amb.area_m2, mae = Qae / 3600 / e.v, qt = mae * (e.h - ia.h) * 1000, ql = mae * hlv * (e.W - ia.W) * 1000;
      if (ql < 0) { ci2.passos.push("ar externo mais seco que o interno (ΔW < 0): latente 0, sem abater o sensível"); ql = 0; qt = Math.max(qt, 0); }
      ci2.latente_W = ql; ci2.sensivel_W = qt - ql;
      ci2.passos.push("Qae = " + fmt(qInf, 2) + " × " + fmt(amb.area_m2, 2) + " = " + fmt(Qae) + " m³/h; mae = Qae/3 600/" + fmt(e.v, 3) + " = " + fmt(mae, 5) + " kg/s; qt = mae·(" + fmt(e.h, 2) + " − " + fmt(ia.h, 2) + ") = " + fmt(qt) + " W; ql = mae·" + hlv + "·(" + fmt(e.W, 4) + " − " + fmt(ia.W, 4) + ") = " + fmt(ql) + " W");   /* clim:ok casas na formatação */
    }
    /* 9) pessoas (Eq. 9 e 10) */
    var cp = comp("pessoas", amb.id), nP = num(amb.pessoas);
    if (nP == null) { var oc = ocupacao(amb, ctx, rotulo); if (oc.n != null) { nP = oc.n; cp.passos.push(oc.passo); } }
    if (nP == null) falta(cp, "ambiente.pessoas", "ocupação não informada");
    else {
      var lp = (ctx.linhas("cl.nbr16655_3.pessoas", { atividade: ROTULOS_16655.pessoas }, rotulo) || [])[0];
      if (!lp) falta(cp, "cl.nbr16655_3.pessoas");
      else { var cfp = num(lp.clf) != null ? num(lp.clf) : 1; cp.sensivel_W = nP * num(lp.sensivel_w) * cfp; cp.latente_W = nP * (num(lp.total_w) - num(lp.sensivel_w)); cp.passos.push(nP + " pessoa(s) sentadas, trabalho leve: qs = " + nP + " × " + lp.sensivel_w + " × " + cfp + ", ql = " + nP + " × (" + lp.total_w + " − " + lp.sensivel_w + ") (Tabela 11)"); }
    }
    /* 10) iluminação (Eq. 11–12): entrada → Tabela 12 → INI-R (cl.iluminacao.densidade) */
    var cil = comp("iluminacao", amb.id), wI = num(amb.iluminacao_W);
    if (wI != null) { cil.sensivel_W = wI; cil.passos.push("iluminação = " + fmt(wI) + " W (entrada)"); }
    else {
      var rI = ROTULOS_16655.iluminacao[amb.uso], li = rI ? (ctx.linhas("cl.nbr16655_3.iluminacao", { ambiente: rI }, rotulo) || [])[0] : null;
      if (li) { cil.sensivel_W = num(li.w_m2) * amb.area_m2 * (num(li.clf) != null ? num(li.clf) : 1); cil.passos.push(fmt(num(li.w_m2)) + " W/m² (" + rI + ", Tabela 12) × " + fmt(amb.area_m2, 2) + " m²"); }
      else {
        var rIn = rotuloDe("cl.iluminacao.densidade", amb.uso), lin = rIn ? (ctx.linhas("cl.iluminacao.densidade", { uso: rIn }, rotulo) || [])[0] : null;
        if (lin && num(lin.w_m2) != null) { cil.sensivel_W = num(lin.w_m2) * amb.area_m2; cil.passos.push(fmt(num(lin.w_m2)) + " W/m² (" + rIn + ", INI-R — a Tabela 12 não lista o ambiente) × " + fmt(amb.area_m2, 2) + " m²"); }
        else falta(cil, "ambiente.iluminacao_W", "iluminação: o ambiente não está na Tabela 12 nem no INI-R — informe a potência");
      }
    }
    /* 11) equipamentos (Eq. 13): lista da Tabela 13 → potência informada → aparelhos (TV 40 pol, premissa) */
    var ce = comp("equipamentos", amb.id), wE = num(amb.equipamentos_W);
    function itemEq(rot, qtd) { var l = (ctx.linhas("cl.nbr16655_3.equipamentos", { equipamento: rot }, rotulo) || [])[0]; if (!l) { falta(ce, "cl.nbr16655_3.equipamentos[" + rot + "]"); return 0; } var w = qtd * num(l.potencia_w) * num(l.clf); ce.passos.push(qtd + " × " + rot + " " + l.potencia_w + " W × CLF " + fmt(num(l.clf), 2) + " = " + fmt(w) + " W (Tabela 13)"); return w; }
    if (arr(amb.equipamentos16655).length) arr(amb.equipamentos16655).forEach(function (x) { ce.sensivel_W += itemEq(x.equipamento, num(x.qtd) || 1); });
    else if (wE != null) { ce.sensivel_W = wE; ce.passos.push("equipamentos = " + fmt(wE) + " W (entrada)"); }
    else if (num(amb.aparelhos) != null) { ce.sensivel_W = itemEq(ROTULOS_16655.aparelho, num(amb.aparelhos)); prem.push("cada 'aparelho' do ambiente = televisão 40 pol da Tabela 13 (premissa C1)"); }
    else falta(ce, "ambiente.equipamentos", "equipamentos não informados (lista da Tabela 13, potência ou nº de aparelhos)");
    return fechar16655(comps, prem, alertas, null, { tbsExt: e.tbs, ti: ti, cidadeCLTD: temCidade ? cidade : "referência (Eq. 6)", cidadeSHGF: cidS });
  }
  function fechar16655(comps, prem, alertas, forca, info) {
    var s = 0, l = 0, pend = comps.some(function (c) { return c.status !== "ok"; });
    comps.forEach(function (c) { s += c.sensivel_W; l += c.latente_W; c.sensivel_W = r1(c.sensivel_W); c.latente_W = r1(c.latente_W); });
    var t = s + l;
    return { metodo: "nbr16655_3", status: forca || (pend ? "pendente" : "ok"), componentes: comps, premissas: prem, alertas: alertas, info: info || null,
             sensivel_W: r1(s), latente_W: r1(l), total_W: r1(t), total_BTUh: r0(W_para_BTUh(t)),
             declaracao: "carga térmica residencial pelo método da ABNT NBR 16655-3:2019 (CLTD/SCL/CLF às 16 h, Equações 1 a 13), sem fator de segurança nem folga (4.1 e Seção 5)" };
  }

  /* ---------------------------------------------- VERIFICAÇÃO RÁPIDA */
  /* hemisfério: o da estação climática; sem ela, SUL (o produto é brasileiro) — declarado no passo */
  function solForte(amb, hemisferio) {
    if (typeof amb.solForte === "boolean") return amb.solForte;
    if (amb.cobertura && num(amb.cobertura.area_m2) > 0) return true;
    var set = SETORES_SOL_FORTE[hemisferio === "N" ? "N" : "S"];
    return arr(amb.paredes).some(function (p) { return p.externa && set.indexOf(p.orientacao) >= 0; }) ||
           arr(amb.vidros).some(function (v) { return set.indexOf(v.orientacao) >= 0; });
  }
  /* a ocupação do ambiente: pessoas por ambiente (residencial) ou área / m² por pessoa — o MESMO número
     vai à carga por componentes e à regra de fabricante (revisão 17/10/2026 A4) */
  function ocupacao(amb, ctx, usadoEm) {
    var rot = rotuloDe("cl.ocupacao.densidade", amb.uso);
    if (!rot) return { n: null, falta: "ambiente.pessoas (uso " + amb.uso + " sem densidade de ocupação na fonte)" };
    var ls = ctx.linhas("cl.ocupacao.densidade", { uso: rot }, usadoEm), l = ls && ls[0];
    if (l && num(l.pessoas_por_ambiente) != null) return { n: num(l.pessoas_por_ambiente), origem: "fonte", passo: "pessoas = " + num(l.pessoas_por_ambiente) + " por ambiente (" + rot + ")" };
    if (l && num(l.m2_por_pessoa) > 0 && num(amb.area_m2) > 0) { var n = Math.ceil(amb.area_m2 / num(l.m2_por_pessoa)); return { n: n, origem: "fonte", passo: "pessoas = ⌈" + fmt(amb.area_m2, 2) + " / " + fmt(num(l.m2_por_pessoa), 2) + "⌉ = " + n + " (" + rot + ")" }; }
    return { n: null, falta: "cl.ocupacao.densidade[uso=" + rot + "] (ou ambiente.pessoas)" };
  }
  function rapida(amb, ctx, opcoes) {
    opcoes = opcoes || {};
    var A = num(amb.area_m2), sol = solForte(amb, opcoes.hemisferio), nA = num(amb.aparelhos) || 0;
    var nP = num(opcoes.pessoas) != null ? num(opcoes.pessoas) : num(amb.pessoas);
    var out = { regras: [], faixaAshrae: null, maior_BTUh: null, divergencia_pct: null, solForte: sol, hemisferio: opcoes.hemisferio || "S", pessoas: nP, pessoasPendente: nP == null };
    if (A == null) return out;
    var uso = "verificação rápida (" + (amb.nome || amb.id) + ")", chave = "cl.carga_simplificada_fabricantes";
    /* ⚠ sem ocupação nenhuma a regra NÃO soma zero calada: pendência com a chave (revisão A4) */
    if (nP == null) ctx.pendencia("ambiente.pessoas", "ocupação não informada e sem densidade na fonte para o uso: a regra de fabricante ficou sem as pessoas", uso);
    var pTxt = nP == null ? "pessoas PENDENTES (0 acrescentadas)" : nP + " pessoa(s)" + (opcoes.pessoasOrigem === "fonte" ? " (estimadas pela densidade da fonte)" : "");
    /* Midea: base (ou com sol) × área + por pessoa + por aparelho (§6.6: todas as pessoas) */
    var mb = linhaPorRotulo(ctx, chave, { fabricante: "Midea" }, "regra", /^Base por área$/i, uso),
        ms = linhaPorRotulo(ctx, chave, { fabricante: "Midea" }, "regra", /alta incidência de sol/i, uso),
        mp = linhaPorRotulo(ctx, chave, { fabricante: "Midea" }, "regra", /por pessoa/i, uso),
        ma = linhaPorRotulo(ctx, chave, { fabricante: "Midea" }, "regra", /aparelho que gera calor/i, uso);
    if (mb && ms && mp && ma) {
      var fb = numeros((sol ? ms : mb).valor)[0], fp = numeros(mp.valor)[0], fa = numeros(ma.valor)[0];
      if (fb != null && fp != null && fa != null) {
        var vM = A * fb + (nP || 0) * fp + nA * fa;
        out.regras.push({ fabricante: "Midea", BTUh: r0(vM), fonte: fonteLinha(ctx, chave, mb),
                          passos: [fmt(A, 2) + " m² × " + fb + (sol ? " (sol forte)" : "") + " + " + pTxt + " × " + fp + " + " + nA + " aparelho(s) × " + fa + " = " + fmt(vM, 0) + " BTU/h"] });
      }
    }
    /* Electrolux: (base sem/com sol) × área + (pessoas + itens) × acréscimo sem/com sol */
    var eb = linhaPorRotulo(ctx, chave, { fabricante: "Electrolux" }, "regra", /Base por área sem sol \/ com sol/i, uso),
        ep = linhaPorRotulo(ctx, chave, { fabricante: "Electrolux" }, "regra", /Acréscimo por pessoa/i, uso);
    if (eb && ep) {
      var nb = numeros(eb.valor), np2 = numeros(ep.valor);
      if (nb.length >= 2 && np2.length >= 2) {
        var b = sol ? nb[1] : nb[0], a = sol ? np2[1] : np2[0], vE = A * b + ((nP || 0) + nA) * a;
        out.regras.push({ fabricante: "Electrolux", BTUh: r0(vE), fonte: fonteLinha(ctx, chave, eb), passos: [fmt(A, 2) + " m² × " + b + " + (" + pTxt + " + " + nA + " item(ns)) × " + a + " = " + fmt(vE, 0) + " BTU/h"] });
      }
    }
    /* Daikin: capacidade pela faixa de área (cl.regra_daikin_area), sem e com sol direto; área entre duas
       faixas (ex.: 9,5 m²) vai para a faixa de CIMA; acima da última, a regra não se aplica (dito) */
    var dk = ctx.linhas("cl.regra_daikin_area", null, uso);
    if (dk) {
      var fx = dk.filter(function (l) { return num(l.area_ate_m2) != null && A <= num(l.area_ate_m2); }).sort(function (a, b) { return num(a.area_ate_m2) - num(b.area_ate_m2); })[0];
      var vD = fx ? num(sol ? fx.com_sol_direto_btu_h : fx.sem_sol_direto_btu_h) : null;
      if (vD != null) out.regras.push({ fabricante: "Daikin", BTUh: vD, fonte: fonteDe(ctx, "cl.regra_daikin_area", "faixa_area_m2"), passos: [fmt(A, 2) + " m² na faixa " + fx.faixa_area_m2 + " m², " + (sol ? "com" : "sem") + " sol direto = " + vD + " BTU/h (a Daikin não soma pessoas)"] });
      else out.foraDaFaixaDaikin = true;
    }
    /* faixa ASHRAE Pocket Guide por ocupação */
    var oc = OCUPACAO_ASHRAE[NAO_RESIDENCIAL[amb.uso] ? amb.uso : (opcoes && opcoes.tipoResidencia) || "residencial"];
    if (oc) {
      var lde = ctx.consulta("cl.carga_por_m2_ashrae_pocket", { ocupacao: oc }, "btu_h_m2_de", uso), la = ctx.consulta("cl.carga_por_m2_ashrae_pocket", { ocupacao: oc }, "btu_h_m2_a", uso);
      if (lde.ok && la.ok) out.faixaAshrae = { ocupacao: oc, de: num(lde.valor), a: num(la.valor), BTUh_de: r0(A * num(lde.valor)), BTUh_a: r0(A * num(la.valor)), fonte: lde.fonte };
    }
    out.regras.forEach(function (r) { if (out.maior_BTUh == null || r.BTUh > out.maior_BTUh) out.maior_BTUh = r.BTUh; });
    return out;
  }

  var ClimCarga = {
    VERSAO: 1, SETORES: SETORES, SETORES_SOL_FORTE: SETORES_SOL_FORTE, ATIVIDADE_DO_USO: ATIVIDADE_DO_USO, ROTULOS: ROTULOS, rotuloDe: rotuloDe, ocupacao: ocupacao, hemisferioDe: hemisferioDe,
    numeros: numeros, numeroAntesDe: numeroAntesDe, linhaPorRotulo: linhaPorRotulo, setor: setor, azimute: azimute, solForte: solForte, ehResidencial: ehResidencial,
    condicoes: condicoes, calcular: calcular, rapida: rapida, carga16655: carga16655, cidade16401: cidade16401, chaveNome: chaveNome, latitudeGraus: latitudeGraus, ROTULOS_16655: ROTULOS_16655,
    conv: { W_para_BTUh: W_para_BTUh, BTUh_para_W: BTUh_para_W, BTUh_para_TR: BTUh_para_TR },
    psicro: { patm_kPa: patm_kPa, pws_kPa: pws_kPa, W_de_UR: W_de_UR, W_de_TBU: W_de_TBU, rhoSeco: rhoSeco, arSensivel_W: arSensivel_W, arLatente_W: arLatente_W }
  };
  global.ClimCarga = ClimCarga;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimCarga;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
