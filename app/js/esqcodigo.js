/* =====================================================================
 * esqcodigo.js — CÓDIGO DE OBRAS POR MUNICÍPIO, EM DADOS (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do dono (21/10/2026): a iluminação e a ventilação das esquadrias, a profundidade do compartimento, a distância à divisa,
 * o pé-direito e a área mínima seguem o CÓDIGO DE OBRAS DO MUNICÍPIO, e a regra mora em DADOS (a tabela MUNICIPIOS abaixo), não no
 * código dos motores. Hoje: Uberlândia/MG (LC 524/2011). Município sem regra cadastrada cai no PADRÃO NACIONAL CONSERVADOR: o mesmo
 * critério (iluminação pelo vão, ventilação pela área que abre ≥ 50 % da iluminação exigida) com os números mais exigentes que a
 * RA conhece, tudo como AVISO e com a frase "conferir o código de obras do município". O dado de um município novo entra aqui.
 *
 * DECISÃO DO DONO sobre vão × vidro (21/10/2026): a lei diz "área das aberturas" (art. 53) e "área de ventilação" (art. 54) e não
 * define nenhum dos dois. Adotado: ILUMINAÇÃO = área do VÃO (sem descontar caixilho); VENTILAÇÃO = área que ABRE da esquadria
 * (geometria da família: js/esqabertura.js), ≥ 50 % da iluminação EXIGIDA (art. 54). É interpretação do texto, não definição legal.
 *
 * FONTE DE UBERLÂNDIA (e como ler o nível):
 *   B — arts. 36 a 41, 47, 49 a 55 e 72: texto de 2011 lido em CÓPIA NÃO OFICIAL (Scribd, 63 páginas), conferido palavra por palavra
 *       com o art. 17 do Diário Oficial de 2020; as LC 713/2020 e 739/2022 NÃO alteram esses artigos. Pode estar desatualizado: conferir
 *       no texto consolidado da Prefeitura (que a pesquisa de 21/10/2026 não conseguiu abrir). A LC 638/2018 não foi lida.
 *   A — arts. 48 e 52 (e o inciso VIII do art. 51): redação da LC 739/2022, lida no Diário Oficial do Município nº 6497 (30/11/2022).
 *   Detalhes e o que ficou sem fonte: docs/arquitetura/esquadrias/UBERLANDIA-LC524.md.
 *
 *   EsqCodigo.resolver(entrada)  → a regra do município ("Uberlândia/MG", "Rua X, Uberlândia - MG", id ou objeto). Nunca falha: cai no padrão.
 *   EsqCodigo.fracao(K, classe)  → { valor, art, nivel }   1/6 · 1/8 (art. 53) e a ventilação (art. 54): K.ventilacao.fracaoDaIluminacao
 *   EsqCodigo.conferirAmbiente(K, amb, ctx)   → achados de pé-direito (art. 41) e de área/dimensão mínima (art. 72)
 *   EsqCodigo.profundidade(K, pe, pts, aberturas)  → ponto mais afastado × 2,5 / 2,0 pé-direito (art. 50)
 *   EsqCodigo.conferirPoco(K, poco, servidos)      → claraboia/poço: círculo 1,50, área 6,00 / 4,00 (arts. 48 e 49)
 *   EsqCodigo.raioDivisa(divisa, origem, dir)      → distância em planta da perpendicular do eixo da abertura até a divisa (art. 47)
 *   EsqCodigo.circuloInscrito(pts) · distSeg(p, a, b)
 * Teste: node tools/test-esquadrias-lc524.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var CONFERIR_UDI = "texto de 2011 em cópia não oficial + alterações no Diário Oficial; conferir no texto consolidado da Prefeitura";
  var CONFERIR_NAC = "padrão nacional conservador da RA: conferir o código de obras do município";

  /* usos do edifício: o art. 52 (ventilação indireta de sanitário) e o art. 72 (áreas mínimas) dependem dele */
  var USOS = {
    residencial_unifamiliar: "Residencial unifamiliar",
    residencial_vertical: "Residencial vertical (multifamiliar)",
    nao_residencial: "Não residencial"
  };
  var USO_PADRAO = "residencial_unifamiliar";

  /* ------------------------------------------------------------------ OS DADOS */
  var MUNICIPIOS = {
    uberlandia: {
      id: "uberlandia", nome: "Uberlândia/MG", sin: ["uberlandia"], padrao: false, nivel: "B",
      sigla: "LC 524/2011",
      lei: "Lei Complementar nº 524, de 8 de abril de 2011 (Código Municipal de Obras de Uberlândia), alterada pelas LC 713/2020 e LC 739/2022",
      fonte: "LC 524/2011 de Uberlândia, com as alterações da LC 713/2020 e da LC 739/2022 — " + CONFERIR_UDI,
      conferir: "Conferir no texto consolidado da Prefeitura: o texto de 2011 foi lido em cópia não oficial; a LC 638/2018 e qualquer lei posterior à LC 739/2022 não foram lidas.",
      aviso: null, orgao: "a Seplan (Prefeitura de Uberlândia)",
      gravidadeNovas: "erro",
      /* art. 53 e 54 — iluminação pelo vão, ventilação pela área que abre */
      iluminacao: { base: "vao", art: "53", nivel: "B", prolongada: { fracao: 1 / 6, inc: "I" }, transitoria: { fracao: 1 / 8, inc: "II" } },
      ventilacao: { base: "area_que_abre", art: "54", nivel: "B", fracaoDaIluminacao: 0.5 },
      /* art. 50 — distância do ponto mais afastado à abertura iluminante */
      profundidade: { art: "50", nivel: "B", externo: 2.5, interno: 2.0 },
      /* art. 47 — nenhuma abertura a menos de 1,50 m da divisa de outra unidade autônoma, medida em planta na perpendicular do EIXO da abertura */
      divisa: { art: "47", nivel: "B", minimo: 1.5, referencia: "eixo", incluiPortasExternas: "aviso",
        frenteViaPublica: "a lei fala em \"divisa de outra unidade autônoma\"; o texto lido não diz se a frente do lote (via pública) entra — conferir com a Prefeitura" },
      /* art. 41 — pé-direito mínimo (altura entre o piso e o forro acabados) */
      peDireito: { art: "41", nivel: "B", transitoria: 2.4, demais: 2.6 },
      /* art. 72 — áreas e dimensões mínimas (dimensão = diâmetro do círculo inscrito, parágrafo único); residencial */
      areaMinima: { art: "72", nivel: "B", soResidencial: true,
        itens: {
          sala_estar: { rotulo: "sala", inc: "I", area: 7.0, dim: 2.0 },
          dormitorio: { rotulo: "dormitório", inc: "II", area: 7.0, dim: 2.0, demais: 6.0, grupo: "dormitorio" },
          suite: { rotulo: "dormitório (suíte)", inc: "II", area: 7.0, dim: 2.0, demais: 6.0, grupo: "dormitorio" },
          cozinha: { rotulo: "cozinha", inc: "III", area: 5.0, dim: 1.8 },
          banheiro: { rotulo: "banheiro", inc: "IV", area: 1.8, dim: 1.0, reduzida: 1.2 },
          area_servico: { rotulo: "espaço de lavagem de roupa e serviços de limpeza (área de serviço)", inc: "V", area: 1.5, dim: null }
        },
        naoCobre: "O art. 72 não fixa lavabo, circulação, escritório, sala de jantar/copa, varanda nem garagem: sem conferência de área mínima para eles." },
      /* arts. 48 e 49 — claraboia (poço de luz) e espaço interno descoberto */
      poco: { artCirculo: "48", nivelCirculo: "A", circulo: 1.5, facesMin: 3,
        artArea: "49", nivelArea: "B", areaProlongada: 6.0, areaTransitoria: 4.0,
        divisa: "claraboia na divisa respeita o afastamento mínimo do loteamento (art. 48, parágrafo único, LC 739/2022)",
        antes: "A redação de 2011 do art. 48 (círculo h/4, mínimo 2,00 m) foi revogada pela LC 739/2022: não usar." },
      /* art. 51 e 52 — abertura para espaço descoberto e ventilação indireta de sanitário */
      sanitario: { artAbertura: "51", artIndireta: "52", nivel: "A",
        indiretaSomenteEm: ["nao_residencial", "residencial_vertical"],
        lavaboArtificial: "o art. 51, parágrafo único, dispensa a abertura para espaço descoberto nos lavabos com ventilação artificial assegurada por poços ou dutos",
        duto: "duto horizontal: seção ≥ 0,25 m², dimensão mínima 0,20 m, extensão máxima 6,00 m, com boca para o exterior; chaminé: 0,006 m² por metro de altura, círculo de 0,60 m, 1 m acima da cobertura; ou ventilação forçada (art. 52)",
        confirmar: "Depois da LC 739/2022 caiu a restrição \"só o lavabo\" no uso residencial: como o analista da Prefeitura interpreta é ponto a confirmar",
        /* REVISÃO (21/10/2026): o inc. VIII do parágrafo único do art. 51 (LC 739/2022) dispensa a abertura para espaço descoberto em
           "demais ambientes" com laudo técnico + ART da iluminação e ventilação artificiais. Banheiro sem janela NÃO é ilegal por si:
           é AVISO com o caminho do laudo, nunca erro (erro falso trava projeto que a Prefeitura aprovaria). */
        laudoArtificial: "o art. 51, parágrafo único, VIII (redação da LC 739/2022) dispensa a abertura para espaço descoberto nos demais ambientes acompanhados de laudo técnico e ART que atestem iluminação e ventilação artificiais por equipamentos que atendam às normas técnicas",
        seplan: "ponto a confirmar com a Seplan (Prefeitura de Uberlândia) antes de aprovar" },
      /* classificação (arts. 37 e 38). Área de serviço NÃO está classificada: pendência, usa a regra mais exigente */
      classes: {
        pendentes: { area_servico: { usar: "prolongada", texto: "A LC 524/2011 não classifica a área de serviço/lavanderia nos arts. 37 e 38 (o art. 72, V só fixa 1,50 m²). Usada a regra MAIS EXIGENTE (permanência prolongada: iluminação 1/6, ventilação 1/12, pé-direito 2,60 m). Pendência: confirmar a classificação com a Prefeitura." } },
        porTipo: { garagem: "transitoria" }   /* art. 38, V */
      }
    },

    nacional: {
      id: "nacional", nome: "Padrão nacional conservador", sin: [], padrao: true, nivel: "C",
      sigla: "padrão nacional RA",
      lei: "Sem código de obras cadastrado para o município: usados, como referência conservadora, os critérios da LC 524/2011 de Uberlândia",
      fonte: CONFERIR_NAC + " (referência: LC 524/2011 de Uberlândia, arts. 41, 50, 53, 54 e 72)",
      conferir: "Conferir o código de obras do município: a regra local pode ser mais ou menos exigente.",
      aviso: "Município sem regra cadastrada: usado o padrão nacional conservador — conferir o código de obras do município.", orgao: "a Prefeitura do município",
      gravidadeNovas: "aviso",
      iluminacao: { base: "vao", art: "-", nivel: "C", prolongada: { fracao: 1 / 6, inc: "" }, transitoria: { fracao: 1 / 8, inc: "" } },
      ventilacao: { base: "area_que_abre", art: "-", nivel: "C", fracaoDaIluminacao: 0.5 },
      profundidade: { art: "-", nivel: "C", externo: 2.5, interno: 2.0 },
      divisa: null,
      peDireito: { art: "-", nivel: "C", transitoria: 2.4, demais: 2.6 },
      areaMinima: { art: "-", nivel: "C", soResidencial: true,
        itens: {
          sala_estar: { rotulo: "sala", inc: "", area: 7.0, dim: 2.0 },
          dormitorio: { rotulo: "dormitório", inc: "", area: 7.0, dim: 2.0, demais: 6.0, grupo: "dormitorio" },
          suite: { rotulo: "dormitório (suíte)", inc: "", area: 7.0, dim: 2.0, demais: 6.0, grupo: "dormitorio" },
          cozinha: { rotulo: "cozinha", inc: "", area: 5.0, dim: 1.8 },
          banheiro: { rotulo: "banheiro", inc: "", area: 1.8, dim: 1.0, reduzida: 1.2 },
          area_servico: { rotulo: "área de serviço", inc: "", area: 1.5, dim: null }
        },
        naoCobre: "" },
      poco: { artCirculo: "-", nivelCirculo: "C", circulo: 1.5, facesMin: 3, artArea: "-", nivelArea: "C", areaProlongada: 6.0, areaTransitoria: 4.0, divisa: "", antes: "" },
      sanitario: null,
      classes: {
        pendentes: { area_servico: { usar: "prolongada", texto: "A classificação da área de serviço depende do código de obras do município. Usada a regra MAIS EXIGENTE (permanência prolongada: iluminação 1/6, ventilação 1/12). Pendência: conferir o código de obras do município." } },
        porTipo: { garagem: "transitoria" }
      }
    }
  };

  /* ------------------------------------------------------------------ resolver o município */
  function normalizar(s) {
    var t = String(s == null ? "" : s).toLowerCase(), m = { "á": "a", "à": "a", "â": "a", "ã": "a", "é": "e", "ê": "e", "í": "i", "ó": "o", "ô": "o", "õ": "o", "ú": "u", "ü": "u", "ç": "c" };
    t = t.replace(/[áàâãéêíóôõúüç]/g, function (c) { return m[c] || c; });
    return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  /* resolver("Uberlândia/MG") · resolver("Av. X, 100 - Uberlândia - MG") · resolver("uberlandia") · resolver({ id }) · resolver("") → padrão.
     O objeto devolvido é uma CÓPIA com `reconhecido` (achou o município) e `entrada` (o que veio). */
  function resolver(entrada) {
    var K = null, txt = "", i, j, k;
    if (entrada && typeof entrada === "object") {
      if (entrada.iluminacao && entrada.ventilacao) { K = copia(entrada); txt = String(entrada.nome || ""); }
      else { txt = String(entrada.municipio || entrada.id || entrada.nome || entrada.local || entrada.endereco || ""); }
    } else txt = String(entrada == null ? "" : entrada);
    var norm = normalizar(txt);
    if (!K) {
      var ks = Object.keys(MUNICIPIOS);
      for (i = 0; i < ks.length && !K; i++) {
        var M = MUNICIPIOS[ks[i]];
        if (!M.padrao && (norm === M.id || M.sin.some(function (s) { return (" " + norm + " ").indexOf(" " + s + " ") >= 0; }))) K = copia(M);
      }
    }
    var reconhecido = !!K;
    if (!K) { K = copia(MUNICIPIOS.nacional); if (norm) K.aviso = "Município \"" + String(txt).trim() + "\" sem regra cadastrada: usado o padrão nacional conservador — conferir o código de obras do município."; }
    K.reconhecido = reconhecido; K.entrada = txt;
    return K;
  }
  function usoValido(uso) { return USOS[uso] ? uso : USO_PADRAO; }
  function listaMunicipios() { return Object.keys(MUNICIPIOS).map(function (k) { return { id: k, nome: MUNICIPIOS[k].nome, padrao: !!MUNICIPIOS[k].padrao }; }); }

  /* "LC 524/2011, art. 53, I" */
  function cita(K, art, inc) {
    if (!art || art === "-") return K.sigla;
    return K.sigla + ", art. " + art + (inc ? ", " + inc : "");
  }

  /* ------------------------------------------------------------------ classe, iluminação, ventilação */
  /* a classe que vale para o tipo de ambiente: aplica a pendência (área de serviço → a mais exigente) */
  function classeEfetiva(K, tipoId, classeAmb) {
    var pend = K.classes && K.classes.pendentes ? K.classes.pendentes[tipoId] : null;
    if (pend) return { classe: pend.usar, pendente: true, texto: pend.texto };
    return { classe: classeAmb, pendente: false, texto: "" };
  }
  function fracao(K, classe) {
    if (!K || !K.iluminacao || !classe) return null;
    var q = classe === "transitoria" ? K.iluminacao.transitoria : K.iluminacao.prolongada;
    return { valor: q.fracao, art: K.iluminacao.art, inc: q.inc, nivel: K.iluminacao.nivel, texto: classe === "transitoria" ? "1/8" : "1/6", citacao: cita(K, K.iluminacao.art, q.inc) };
  }

  /* ------------------------------------------------------------------ geometria plana */
  function distSeg(p, a, b) {
    var ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez, k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2)) : 0;
    var qx = a[0] + ex * k, qz = a[1] + ez * k;
    return Math.sqrt((p[0] - qx) * (p[0] - qx) + (p[1] - qz) * (p[1] - qz));
  }
  function dentroPol(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c;
    }
    return c;
  }
  function bbox(P) {
    var x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    P.forEach(function (q) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[0]); z1 = Math.max(z1, q[1]); });
    return [x0, z0, x1, z1];
  }
  function distBorda(p, P) { var d = Infinity; for (var i = 0; i < P.length; i++) d = Math.min(d, distSeg(p, P[i], P[(i + 1) % P.length])); return d; }
  /* diâmetro do maior círculo inscrito no polígono (parágrafo único do art. 72): amostra em grade e refina por busca local */
  function circuloInscrito(P) {
    if (!P || P.length < 3) return 0;
    var B = bbox(P), step = Math.max(0.05, Math.min(B[2] - B[0], B[3] - B[1]) / 40), cand = [], x, z;
    for (x = B[0] + step / 2; x < B[2]; x += step) for (z = B[1] + step / 2; z < B[3]; z += step) if (dentroPol([x, z], P)) cand.push({ p: [x, z], d: distBorda([x, z], P) });
    if (!cand.length) return 0;
    cand.sort(function (a, b) { return b.d - a.d; });
    var melhor = 0;
    cand.slice(0, 6).forEach(function (c) {
      var p = c.p.slice(), d = c.d, s = step;
      while (s > 0.0005) {
        var ach = false;
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (v) {
          var q = [p[0] + v[0] * s, p[1] + v[1] * s];
          if (!dentroPol(q, P)) return;
          var dq = distBorda(q, P); if (dq > d + 1e-12) { d = dq; p = q; ach = true; }
        });
        if (!ach) s /= 2;
      }
      if (d > melhor) melhor = d;
    });
    return 2 * melhor;
  }

  /* ------------------------------------------------------------------ art. 50 — profundidade do compartimento */
  /* aberturas: [{ a: [x, z], b: [x, z], interno: bool }] (o vão em planta, no lado de dentro do ambiente).
     O ponto mais afastado é o que maximiza a distância à abertura MAIS PERTO dela (cada abertura vale pelo seu fator:
     2,5 × pé-direito para espaço externo, 2,0 × para espaço interno). */
  function profundidade(K, pe, pts, aberturas) {
    var rg = K && K.profundidade;
    aberturas = arr(aberturas);
    if (!rg || !(pe > 0) || !pts || pts.length < 3 || !aberturas.length) return null;
    var B = bbox(pts), step = Math.max(0.1, Math.sqrt(Math.max(0, (B[2] - B[0]) * (B[3] - B[1])) / 4000)), cand = pts.map(function (q) { return [q[0], q[1]]; }), x, z;
    for (x = B[0] + step / 2; x < B[2]; x += step) for (z = B[1] + step / 2; z < B[3]; z += step) if (dentroPol([x, z], pts)) cand.push([x, z]);
    var pior = null;
    cand.forEach(function (p) {
      var melhor = null;
      aberturas.forEach(function (ab) {
        var d = distSeg(p, ab.a, ab.b), lim = (ab.interno ? rg.interno : rg.externo) * pe, r = d / lim;
        if (!melhor || r < melhor.r) melhor = { r: r, d: d, lim: lim, interno: !!ab.interno };
      });
      if (!pior || melhor.r > pior.r) pior = { r: melhor.r, d: melhor.d, lim: melhor.lim, interno: melhor.interno, ponto: p };
    });
    if (!pior) return null;
    return { maxima: r4(pior.d), limite: r4(pior.lim), ponto: pior.ponto, interno: pior.interno, ok: pior.r <= 1 + 1e-9, fator: pior.interno ? rg.interno : rg.externo, pe: pe, citacao: cita(K, rg.art, pior.interno ? "II" : "I"), nivel: rg.nivel };
  }

  /* ------------------------------------------------------------------ art. 47 — divisa (a perpendicular do eixo da abertura) */
  /* origem = o ponto do eixo da abertura na face da parede; dir = a normal para fora (unitária). Devolve a menor distância
     positiva até uma aresta da divisa e o índice da aresta (lado do lote) — ou null se a perpendicular não encontra divisa. */
  function raioDivisa(divisa, origem, dir) {
    var P = arr(divisa), best = null;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dir[0] * ez - dir[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      var wx = a[0] - origem[0], wz = a[1] - origem[1], t = (wx * ez - wz * ex) / den, s = (wx * dir[1] - wz * dir[0]) / den;
      if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (!best || t < best.dist)) best = { dist: r4(t), lado: i };
    }
    return best;
  }

  /* ------------------------------------------------------------------ art. 41 e art. 72 — pé-direito e área mínima */
  function peDireitoMinimo(K, classe) {
    var q = K && K.peDireito; if (!q) return null;
    var tr = classe === "transitoria" || classe === "semPermanencia";
    return { valor: tr ? q.transitoria : q.demais, inc: tr ? "I" : "II", art: q.art, nivel: q.nivel, citacao: cita(K, q.art, tr ? "I" : "II") };
  }
  /* amb: { id, nome, tipoId, classe, area, pe, peMedio?, pts } (peMedio = volume ÷ área: forro inclinado/parcial) · ctx: { uso, nBanheiros, dormitorios: [{ id, area }] } */
  function conferirAmbiente(K, amb, ctx) {
    ctx = ctx || {};
    var out = [], g = K.gravidadeNovas || "aviso", eps = 0.005;
    function achado(codigo, grav, nivel, titulo, texto, art, solucao) { out.push({ codigo: codigo, gravidade: grav, nivel: nivel, titulo: titulo, texto: texto, art: art, solucao: solucao, ambiente: amb.id }); }
    /* pé-direito */
    var cls = K.classes && K.classes.porTipo && K.classes.porTipo[amb.tipoId] ? K.classes.porTipo[amb.tipoId] : amb.classe;
    if (cls && amb.tipoId !== "escada" && amb.pe > 0) {
      var pd = peDireitoMinimo(K, cls), med = num(amb.peMedio, null);
      /* REVISÃO (21/10/2026): forro INCLINADO ou que cobre só PARTE do ambiente — a menor altura não é "o" pé-direito: o texto lido (art. 41,
         parágrafo único: "entre o piso e o forro acabados") não diz onde medir. Média (volume ÷ área) ≥ mínimo → aviso; média abaixo → erro. */
      if (pd && amb.pe < pd.valor - eps && med != null && med > amb.pe + 0.01 && med >= pd.valor - eps) achado("ESQ_PE_DIREITO", "aviso", pd.nivel, "\"" + amb.nome + "\": forro a " + f2(amb.pe) + " m no ponto mais baixo (média " + f2(med) + " m; mínimo " + f2(pd.valor) + " m)",
        "O forro é inclinado ou cobre só parte do ambiente: a menor altura é " + f2(amb.pe) + " m e a média é " + f2(med) + " m. O pé-direito mínimo é " + f2(pd.valor) + " m, medido do piso ao forro acabados (" + pd.citacao + "), e o texto lido não diz onde medir em forro inclinado ou rebaixo parcial — ponto a confirmar com " + (K.orgao || "a Prefeitura") + ".", pd.citacao,
        "Confirme o critério com " + (K.orgao || "a Prefeitura") + "; para eliminar a dúvida, suba o ponto mais baixo do forro para " + f2(pd.valor) + " m.");
      else if (pd && amb.pe < pd.valor - eps) achado("ESQ_PE_DIREITO", g, pd.nivel, "\"" + amb.nome + "\": pé-direito " + f2(amb.pe) + " m < " + f2(pd.valor) + " m",
        "Pé-direito mínimo de " + (cls === "transitoria" ? "permanência transitória" : "os demais compartimentos") + ": " + f2(pd.valor) + " m, medido do piso ao forro acabados (" + pd.citacao + ").", pd.citacao,
        "Aumente a altura das paredes/do forro do ambiente para " + f2(pd.valor) + " m ou mais.");
    }
    /* área e dimensão mínimas (residencial) */
    var AM = K.areaMinima;
    if (AM && AM.itens && AM.itens[amb.tipoId]) {
      var it = AM.itens[amb.tipoId], uso = usoValido(ctx.uso);
      if (AM.soResidencial && uso === "nao_residencial") return out;
      var areaMin = it.area, nota = "", pular = false, citacao = cita(K, AM.art, it.inc ? it.inc : "");
      if (it.grupo === "dormitorio") {
        var ds = arr(ctx.dormitorios).slice().sort(function (a, b) { return b.area - a.area; });
        if (ds.length > 1 && ds[0].id !== amb.id) { areaMin = it.demais; nota = " (havendo mais de um dormitório, os demais podem ter " + f2(it.demais) + " m²)"; }
      }
      if (it.reduzida) {
        if (amb.area >= it.area - eps) areaMin = it.area;
        else if (amb.area >= it.reduzida - eps) {
          if (num(ctx.nBanheiros, 1) > 1) areaMin = it.reduzida;
          else { pular = true; achado("ESQ_AREA_MINIMA", "aviso", AM.nivel, "\"" + amb.nome + "\": " + f2(amb.area) + " m² só vale com lavatório fora do banheiro",
            "O banheiro com vaso, chuveiro e lavatório tem mínimo de " + f2(it.area) + " m²; cai para " + f2(it.reduzida) + " m² quando o lavatório é externo ou há mais de um banheiro (" + citacao + "). Há um banheiro só e o modelo não diz onde está o lavatório: confirme.", citacao,
            "Ponha o lavatório fora do banheiro, ou aumente o banheiro para " + f2(it.area) + " m², ou preveja outro banheiro."); }
        } else areaMin = it.reduzida;
      }
      if (!pular && amb.area < areaMin - eps) achado("ESQ_AREA_MINIMA", g, AM.nivel, "\"" + amb.nome + "\": " + f2(amb.area) + " m² < " + f2(areaMin) + " m²",
        "Área mínima de " + it.rotulo + ": " + f2(areaMin) + " m²" + nota + " (" + citacao + ").", citacao, "Aumente o ambiente para " + f2(areaMin) + " m² ou mais.");
      if (it.dim && amb.pts) {
        var dm = circuloInscrito(amb.pts);
        if (dm < it.dim - 0.01) achado("ESQ_AREA_MINIMA", g, AM.nivel, "\"" + amb.nome + "\": dimensão mínima " + f2(dm) + " m < " + f2(it.dim) + " m",
          "A dimensão mínima de " + it.rotulo + " é " + f2(it.dim) + " m — o diâmetro do círculo inscrito no plano horizontal do compartimento (" + cita(K, AM.art, "parágrafo único") + ").", cita(K, AM.art, "parágrafo único"),
          "Alargue o ambiente até caber um círculo de " + f2(it.dim) + " m.");
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ arts. 48 e 49 — claraboia / espaço interno descoberto */
  /* poco: { id, nome, area, pts, faces } (faces = quantas arestas são fechadas por edificação; null = não sabido) ·
     servidos: [{ classe }] (os compartimentos que se abrem para ele) */
  function conferirPoco(K, poco, servidos) {
    var rg = K && K.poco, out = [], g = K.gravidadeNovas || "aviso";
    if (!rg) return out;
    function achado(codigo, grav, nivel, titulo, texto, art, solucao) { out.push({ codigo: codigo, gravidade: grav, nivel: nivel, titulo: titulo, texto: texto, art: art, solucao: solucao, ambiente: poco.id }); }
    var dm = circuloInscrito(poco.pts), citC = cita(K, rg.artCirculo), citA = cita(K, rg.artArea);
    if (dm < rg.circulo - 0.01) achado("ESQ_POCO", g, rg.nivelCirculo, "\"" + poco.nome + "\": cabe um círculo de só " + f2(dm) + " m (mínimo " + f2(rg.circulo) + " m)",
      "Claraboia (espaço interno descoberto, fechado em 3 ou mais faces pela edificação) precisa comportar um círculo de diâmetro mínimo de " + f2(rg.circulo) + " m (" + citC + ", redação da LC 739/2022).", citC, "Alargue o poço até caber um círculo de " + f2(rg.circulo) + " m.");
    var prol = arr(servidos).some(function (s) { return s.classe === "prolongada"; }), min = prol ? rg.areaProlongada : rg.areaTransitoria;
    if (poco.area < min - 0.005) achado("ESQ_POCO", g, rg.nivelArea, "\"" + poco.nome + "\": " + f2(poco.area) + " m² < " + f2(min) + " m²",
      "Espaço interno descoberto: área mínima de " + f2(rg.areaProlongada) + " m² para compartimentos de permanência prolongada e " + f2(rg.areaTransitoria) + " m² para os de permanência transitória (" + citA + "). Este serve " + (prol ? "permanência prolongada" : "permanência transitória") + ".", citA, "Aumente o poço para " + f2(min) + " m² ou mais.");
    if (poco.faces != null && poco.faces < rg.facesMin) achado("ESQ_POCO", "aviso", rg.nivelCirculo, "\"" + poco.nome + "\": fechado em " + poco.faces + " face(s)",
      "A claraboia é \"fechada em 03 (três) ou mais faces\" da área edificada (" + citC + ").", citC, "Confira se o poço é cercado por edificação em 3 faces ou mais; com menos, ele é pátio/recuo, não claraboia.");
    return out;
  }

  var EsqCodigo = {
    MUNICIPIOS: MUNICIPIOS, USOS: USOS, USO_PADRAO: USO_PADRAO, CONFERIR_UDI: CONFERIR_UDI, CONFERIR_NAC: CONFERIR_NAC,
    resolver: resolver, listaMunicipios: listaMunicipios, usoValido: usoValido, normalizar: normalizar, cita: cita,
    classeEfetiva: classeEfetiva, fracao: fracao, peDireitoMinimo: peDireitoMinimo, conferirAmbiente: conferirAmbiente, conferirPoco: conferirPoco,
    profundidade: profundidade, raioDivisa: raioDivisa, circuloInscrito: circuloInscrito, distSeg: distSeg, dentroPol: dentroPol
  };
  global.EsqCodigo = EsqCodigo;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqCodigo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
