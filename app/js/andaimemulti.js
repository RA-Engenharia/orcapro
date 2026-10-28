/* =====================================================================
 * andaimemulti.js — ANDAIME MULTIDIRECIONAL (motor PURO, ES5, sem DOM, Node-testável).
 * Frente "Andaimes", etapa M1 (27/10/2026): catálogo das duas linhas (roseta e estribo), motor de montagem,
 * lista de LOCAÇÃO e 3D provisório. Especificação fechada: docs/andaime-multi/ESPEC-M1.md; o que a especificação
 * deixou aberto está em docs/andaime-multi/DUVIDAS-M1.md (numerado).
 *
 * Para que serve (igual ao tubo-roll): o PROJETO que a engenharia aprova para o trabalho em altura — modelo
 * montado, lista de locação, plano, checklist, liberação, memorial. NÃO é custo nem fabricação.
 *
 * COMO SE LIGA AO TUBO-ROLL (js/andaime.js): o mesmo tipo "andaime" das Peças prontas. Quando `sistema` é
 * "multidirecional", Andaime.normalizar / validar / montar / pecasLocacao / tabelaLocacao e o `gerar` do
 * registrarTipo DESPACHAM para este módulo (dependência preguiçosa). Sem `sistema` (ou "tuboroll") nada muda.
 * Daqui só se usam os auxiliares puros de leitura de caminho/contorno/lado: Andaime._geo.
 *
 * MODELO ABSTRATO = ÚNICA fonte de quantidade (3D, lista, plano, cálculo e memorial leem dele). Diferença
 * essencial para o tubo-roll: aqui TODA barra tem comprimento de CATÁLOGO e liga dois NÓS exatos (a roseta
 * do poste a cada 0,50 m); não existe tubo comercial com ponta, nem luva, nem abraçadeira de travessa.
 *
 * REGRAS DE FONTE (as mesmas do tubo-roll): valor de NR-18 = regra (validar reprova); valor sem norma
 * brasileira = `confirmarRT` com a fonte ao lado; sem fonte = null + aviso — nunca chutado. Nenhum nome de
 * fabricante aparece como nome de sistema: as linhas se chamam "roseta" e "estribo"; o fabricante só é RÓTULO
 * de fonte (FONTES).
 *
 * ⚠ AS PEÇAS DO ANDAIME NÃO SÃO AÇO FABRICADO. Toda caixa do 3D leva `caixa.andaime = { peca, cod }`: é a
 * marca que js/metalfab.js, js/metalorc.js, js/metalcorte.js e js/metalmontagem.js usam para pular a peça
 * (senão o tubo de locação virava "aço por kg" no orçamento — dinheiro errado).
 *
 * CONVENÇÕES: metros e kg; x e z em planta, y para cima; "esquerda" do sentido de traçado = (u.z, −u.x);
 * em contorno fechado "fora" é o lado de fora do polígono; y = 0 é o CHÃO (o calço apoia nele, a base vem por
 * cima, o 1º nó do poste fica em hCalco + rosca + peça base). Referencial do trecho: s ao longo (u) e w a partir
 * da face (ns, para o lado do andaime).
 *
 * API
 *   AndaimeMulti.CATALOGO_MULTI / FONTES / PARAMETROS_RT / PADRAO_MULTI
 *   AndaimeMulti.normalizar(par) · validar(par) → null | texto PT-BR · montar(par) → modelo
 *   AndaimeMulti.pecasLocacao(modelo) · tabelaLocacao(modelo) · gerar(p, K, novoId, ctx, H)
 * Teste: node tools/test-andaimemulti.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function brf(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function bool(v) { return !(v === false || v === "false" || v === 0 || v === "0" || v === "nao" || v === "não"); }
  var GRAU = Math.PI / 180;
  function Aand() { return dep("Andaime", "./andaime.js"); }
  function Geo() { var a = Aand(); return a && a._geo ? a._geo : null; }

  /* ================================================================ FONTES
   * M01…M05, N18 e R2 vêm da ESPEC (seção 1). R1 é a mesma fonte secundária do tubo-roll (apostilas): só o calço
   * (pranchão 9 kg/m) e a densidade vêm dela — não há outro valor para o calço. */
  var FONTES = {
    M01: { rotulo: "Catálogo \"Andaime Multidirecional Mecanflex\" (Grupo Orguel/Locguel/Mecan), pp. 3–6", classe: "primaria", arquivo: "Downloads/515813928-Andaime-Multidirecional-Mecanflex.pdf", obs: "códigos e medidas; SEM pesos e SEM cargas" },
    M02: { rotulo: "Manual \"Andaime Multidirecional\" PEMAX, versão 01, jul/2016", classe: "primaria", arquivo: "Downloads/589366997-Manual-Andaime-Multidirecional-V02.pdf", obs: "medidas; PESOS (p.6); carga do piso (p.18); montagem (pp.14–22); checklist (p.27)" },
    M03: { rotulo: "Apostila \"Capacitação para montadores de andaimes\", Ultraseg", classe: "secundaria", arquivo: "Downloads/544036691-APOSTILA-MONTAGEM-DE-ANDAIMES.pdf", obs: "conexões a cada cinquenta centímetros (p.8)" },
    M04: { rotulo: "Projeto de terceiro \"Esquema de montagem de andaime multidirecional — torre 1,5 × 1,5 × 6,0 + 1,0 m\", 005-R00, 14/12/2023", classe: "secundaria", arquivo: "Downloads/782936708-ANDAIME-PROJETO-005-R00.pdf", obs: "projeto de referência (nomes do terceiro não são citados no código)" },
    M05: { rotulo: "Projeto de terceiro \"Escoramento — andaime multidirecional\" (plataforma em volta de 2 tanques de 20 000 L)", classe: "secundaria", arquivo: "Downloads/427551612-01-Escoramento-Andaime-Multidirecional.pdf", obs: "referência para a volumetria (E6)" },
    N18: { rotulo: "NR-18 (texto atualizado 2026) — 18.12.15.2 e definição de \"Andaime Multidirecional\" (Portaria MTE nº 836, de 13/05/2026, vigência 29/06/2026); 18.12.3; 18.12.5; 18.12.14; 18.12.15/18.12.15.1", classe: "regra", arquivo: "biblioteca de normas", obs: "" },
    R2: { rotulo: "ABNT NBR 6494:1990 — Segurança nos andaimes (exemplar NÃO licenciado: só valores com o item; conferir no exemplar licenciado)", classe: "secundaria", arquivo: null, exemplarLicenciado: false, obs: "regra a conferir" },
    R1: { rotulo: "Apostilas de treinamento de montador (fonte secundária; mesma R1 do tubo-roll)", classe: "secundaria", arquivo: null, obs: "usada só no calço (pranchão de 9 kg/m)" }
  };

  /* ================================================================ CATÁLOGO
   * Cada peça: { cod, nomeLocacao, descricao, un, medidas (m), pesoKg | null, fonteId, pagina, confirmarRT, obs }.
   * cod null = a fonte não dá código para aquela medida (não se inventa). */
  function serie(pref, cods, nome, descr, un, chave, meds, pesos, fonteId, pag, rt, obs, medExtra, extra) {
    return meds.map(function (m, i) {
      var cod = cods ? cods[i] : (pref == null ? null : pref + (i < 9 ? "0" : "") + (i + 1));
      var o = { cod: cod, nomeLocacao: nome, descricao: descr, un: un, medidas: {}, pesoKg: pesos && pesos[i] != null ? pesos[i] : null, fonteId: fonteId, pagina: pag, confirmarRT: !!rt, obs: obs || "" };
      o.medidas[chave] = m;
      if (medExtra) Object.keys(medExtra).forEach(function (k) { var v = medExtra[k]; o.medidas[k] = typeof v === "function" ? v(i, m) : (Array.isArray(v) ? v[i] : v); });
      if (extra) Object.keys(extra).forEach(function (k) { var v = extra[k]; o[k] = typeof v === "function" ? v(i, m) : (Array.isArray(v) ? v[i] : v); });
      return o;
    });
  }
  function unica(cod, nome, descr, un, medidas, peso, fonteId, pag, rt, obs, extra) {
    var o = { cod: cod, nomeLocacao: nome, descricao: descr, un: un, medidas: medidas || {}, pesoKg: peso == null ? null : peso, fonteId: fonteId, pagina: pag, confirmarRT: !!rt, obs: obs || "" };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }

  var TRAV = [0.80, 1.14, 1.64, 2.14, 2.48, 3.14];
  var OBS_TRAV = "Medida NOMINAL do catálogo; o motor a usa como distância entre eixos de poste (confirmar com o locador: eixo a eixo conforme o catálogo da locadora).";

  /* ---- Linha ROSETA (M02, pesos da p.6) ---- */
  var ROSETA = {
    id: "roseta", rotulo: "Multidirecional de roseta",
    motor: { passoNo: 0.50, passoFonteId: "M03", hPecaBase: 0.20, regulMin: 0.05, rodapeAlt: 0.20, acessoComp: [2.48], acessoForcado: 2.48, pisoModo: "n32", emenda: "pinoTrava", diagModo: "levante2", ganchos: true, alcapaoNaLargura: true },
    pecas: {
      poste: serie("PO", null, "Poste", "Poste de roseta a cada 0,50 m; emenda por espigão + pino trava (M02 p.17).", "pç", "L", [0.5, 1.0, 1.5, 2.0, 2.5, 3.0], [3, 5, 7, 9, 11, 14], "M02", "6; 16; 17", false, "primeira emenda desencontrada: interno 2,00 m e externo 3,00 m (M02 p.16)"),
      travessa: serie("TR", null, "Travessa", "Travessa de encaixe por cunha na roseta (90° ou 30°–60°, M02 p.14 fig.04).", "pç", "vao", TRAV, [3.5, 4.5, 6, 8, 9, 11], "M02", "6; 14", true, OBS_TRAV),
      diagonal: serie("DI", null, "Diagonal vertical", "Diagonal de contraventamento do plano externo, levante de 2,00 m.", "pç", "L", [2.14, 2.26, 2.52, 2.85, 3.10, 3.62], [8.5, 9, 9.5, 10.5, 11.5, 13.5], "M02", "6; 10; 21", true,
        "DERIVADO (DUVIDAS-M1 2): cada DI corresponde ao vão TR de mesma ordem com levante de 2,00 m (√(vão²+2²) é maior que a peça: 2,15≈2,14; 2,30≈2,26; 2,59≈2,52; 2,93≈2,85; 3,19≈3,10; 3,72≈3,62 — o catálogo dá a peça, menor que o eixo).",
        { levante: 2.0, vao: function (i) { return TRAV[i]; } }),
      piso: serie("PI", null, "Piso metálico", "Piso metálico 0,32 m de largura, engata na travessa (M02 p.18).", "pç", "L", TRAV, [8.5, 9.5, 11.5, 13.5, 15, 17], "M02", "6; 18", true,
        "quantos pisos cabem por travessa: conferir no catálogo do locador", { larg: 0.32 },
        { cargaKgfM2: [600, 600, 600, 600, 450, 300], cargaConcentradaKgf: 300, areaCargaConcentradaM2: 0.5 }),
      pisoAlcapao: [unica("PI07", "Piso com alçapão e escada", "Piso com alçapão e escada incorporada.", "pç", { larg: 0.32, L: 2.5 }, 36.5, "M02", "6; 18", true,
        "PI07: o catálogo escreve 0,32 × 2,5; conferir largura com o locador. O motor adota o alçapão na LARGURA DO MÓDULO (substitui os pisos do vão), com comprimento 2,48 m — só existe no vão de 2,48 m nesta linha.",
        { adotado: { L: 2.48, larg: "módulo" } })],
      rodape: serie("RO", null, "Rodapé metálico", "Rodapé de encaixe (sem abraçadeira), altura 0,20 m.", "pç", "L", TRAV, [1.7, 2.4, 3.8, 4.5, 5.2, 6.6], "M02", "6", true, "", { alt: 0.20 }),
      pecaBase: unica("AC03", "Peça base", "Tubo de início com a 1ª roseta (M02 p.15: base = sapata ajustável + tubo de início + travessas).", "pç", { altura: 0.20 }, 1.8, "M02", "6; 15", true, "altura da 1ª roseta na peça base: padrão/fallback 0,20 m (confirmarRT); a linha roseta lê 0,065 m da família ra-andaime-m-peca-base (M2.1)"),
      baseRegulavel: unica("AC04", "Base regulável", "Sapata ajustável, 500 mm; regulagem máxima da rosca 0,25 m em condição normal (M02 p.10 e checklist item 15).", "pç", { comprimento: 0.5, regulagemMax: 0.25 }, 1.8, "M02", "6; 10", true, "o motor nunca passa de 0,25 m de rosca"),
      baseArticulada: unica("AC05", "Base regulável articulada", "Para piso inclinado, 500 mm.", "pç", { comprimento: 0.5 }, 3.2, "M02", "6", true, ""),
      emenda: unica("AC08", "Pino trava", "Obrigatório em toda união de postes (M02 p.17).", "pç", {}, 0.13, "M02", "6; 17", false, ""),
      ganchoCurto: unica("AC01", "Gancho de ancoragem 0,25 m", "Prende o poste interno à estrutura.", "pç", { L: 0.25 }, 1.5, "M02", "6; 21", true, ""),
      ganchoLongo: unica("AC02", "Gancho de ancoragem 0,50 m", "Prende o poste interno à estrutura (afastamento maior).", "pç", { L: 0.50 }, 2.3, "M02", "6; 21", true, ""),
      abracFixa: unica("AC06", "Abraçadeira fixa", "Liga tubos em ângulo reto (ancoragem).", "pç", {}, 1.1, "M02", "6", true, ""),
      abracGiratoria: unica("AC07", "Abraçadeira giratória", "Liga tubos em qualquer ângulo.", "pç", {}, 1.2, "M02", "6", true, "catálogo apenas (M1 não usa)"),
      abracPino: unica("AC15", "Abraçadeira com pino", "Abraçadeira com pino.", "pç", {}, 1.3, "M02", "6", true, "catálogo apenas; o código AC15 também aparece na treliça (código repetido no catálogo)"),
      olhal: unica("AC14", "Parafuso olhal", "Olhal da ancoragem (M02 pp.21–22).", "pç", {}, 0.3, "M02", "6; 21; 22", true, "o código AC14 também aparece na treliça 4,28 (código repetido no catálogo)"),
      chumbador: unica("AC13", "Chumbador mecânico", "Chumbador PBI 5/8\": furo Ø20 × 70 mm (M02 p.22).", "pç", { furoD: 0.020, furoProf: 0.070 }, 0.1, "M02", "6; 22", true, ""),
      protetorTubo: unica("AC09", "Protetor de tubo", "Protetor de tubo.", "pç", {}, null, "M02", "6", true, "sem peso na fonte; catálogo apenas"),
      maoFrancesa: serie("AC1", ["AC10", "AC11", "AC12"], "Mão francesa", "Depende de projeto específico (M02 p.23).", "pç", "L", [0.32, 0.64, 0.96], null, "M02", "6; 23", true, "sem peso na fonte; catálogo apenas — NÃO entra no motor M1"),
      trelica: serie("AC", ["AC14", "AC15", "AC16"], "Treliça", "Treliça (catálogo apenas).", "pç", "L", [4.28, 4.96, 6.28], [48, 56, 69], "M02", "6", true, "códigos AC14–AC16 repetidos no catálogo (colidem com olhal e abraçadeira com pino); guardados como estão; M1 não usa", { larg: 0.5 }),
      calco: unica(null, "Calço", "Pedaço de pranchão sob a base (distribui a carga no solo).", "pç", { L: 0.50, larg: 0.30, esp: 0.038 }, null, "R1", "—", true, "0,30 × 0,038 × 0,50 m e 9 kg/m: mesmo calço do tubo-roll (apostila R1); peso derivado do pranchão", { pesoPorM: 9 }),
      escadaExterna: unica(null, "Escada de acesso Ø48 × 2 m", "Escada de acesso externa, presa ao plano externo.", "pç", { L: 2.0 }, null, "M01", "3–6", true, "item do catálogo M01 (sem peso); usado também na linha roseta quando acesso = escada — conferir com o locador"),
      tela: unica(null, "Tela de proteção da fachada (m²)", "Tela da 1ª plataforma até 2 m acima da última (NR-18 18.12.15.1).", "m²", {}, null, "N18", "18.12.15.1", false, "peso SEM FONTE")
    }
  };

  /* ---- Linha ESTRIBO (M01 pp.3–4; sem pesos → pesoKg null, a lista sai «sem peso de fonte»; códigos transcritos na M1.1) ---- */
  var PL_L = [0.7, 1.0, 1.5, 2.0, 2.5, 3.0];
  function k6(x) { return "200100" + x; }
  function cods6(l) { return l.map(k6); }
  var D_EST = [   /* [comprimento da peça (mm), altura (mm), largura (mm), código] — M01 p.3 */
    [1970, 500, 2000, "200"], [1170, 1000, 700, "201"], [1350, 1000, 1000, "202"], [1720, 1000, 1500, "203"], [2150, 1000, 2000, "204"], [2600, 1000, 2500, "205"], [3080, 1000, 3000, "206"],
    [1620, 1500, 700, "207"], [1750, 1500, 1000, "208"], [2060, 1500, 1500, "209"], [2420, 1500, 2000, "210"], [2840, 1500, 2500, "211"], [3420, 1500, 3000, "212"],
    [2090, 2000, 700, "213"], [2190, 2000, 1000, "214"], [2450, 2000, 1500, "215"], [2760, 2000, 2000, "217"], [3130, 2000, 2500, "218"], [3530, 2000, 3000, "219"]];
  var ESTRIBO = {
    id: "estribo", rotulo: "Multidirecional de estribo",
    motor: { passoNo: 0.50, passoFonteId: "M01", hPecaBase: 0.20, regulMin: 0.05, rodapeAlt: 0.15, acessoComp: [1.0, 1.5, 2.0, 2.5], acessoForcado: 2.0, pisoModo: "plataformas", emenda: "espiga", diagModo: "tabela", ganchos: false, alcapaoNaLargura: false },
    pecas: {
      poste: serie(null, cods6(["005", "003", "002", "001", "000"]), "Poste", "Poste do estribo.", "pç", "L", [0.5, 1.0, 1.5, 2.0, 3.0], null, "M01", "3", true, "passo do estribo (nó a cada 0,50 m) conforme o locador — M01 não diz o passo"),
      posteCurto: [unica(k6("007"), "Poste 0,27 m com espiga", "Poste curto com espiga.", "pç", { L: 0.27 }, null, "M01", "3", true, "catálogo apenas"),
        unica(k6("018"), "Poste 0,27 m sem espiga", "Poste curto sem espiga.", "pç", { L: 0.27 }, null, "M01", "3", true, "catálogo apenas"),
        unica(k6("006"), "Poste 0,50 m sem espiga", "Poste sem espiga.", "pç", { L: 0.5 }, null, "M01", "3", true, "catálogo apenas"),
        unica(k6("004"), "Poste 1,00 m sem espiga", "Poste sem espiga.", "pç", { L: 1.0 }, null, "M01", "3", true, "catálogo apenas")],
      emenda: unica(k6("008"), "Espiga", "Espiga de emenda de postes.", "pç", {}, null, "M01", "3", true, "uma por emenda de postes (no estribo a emenda é pela espiga; não há pino trava no M01)"),
      travessa: serie(null, cods6(["101", "102", "103", "104", "105", "107", "108", "109"]), "Travessa", "Travessa simples do estribo.", "pç", "vao", [0.35, 0.50, 0.70, 1.00, 1.50, 2.00, 2.50, 3.00], null, "M01", "3", true, "8 medidas e 8 códigos; o 200100106 não existe no catálogo"),
      travessaReforcada: serie(null, cods6(["110", "111", "112", "113"]), "Travessa reforçada", "Travessa reforçada.", "pç", "vao", [1.5, 2.0, 2.5, 3.0], null, "M01", "3", true, "catálogo apenas"),
      travessaDupla: serie(null, cods6(["114", "115", "116", "118", "119", "120"]), "Travessa dupla", "Travessa dupla.", "pç", "vao", PL_L, null, "M01", "3", true, "catálogo apenas"),
      travessaIntermediaria: serie(null, cods6(["122", "123", "124", "125", "126", "127"]), "Travessa intermediária", "Travessa intermediária.", "pç", "vao", PL_L, null, "M01", "3", true, "catálogo apenas"),
      diagonal: D_EST.map(function (d) { return unica(k6(d[3]), "Diagonal", "Diagonal vertical: tabela comprimento da peça | altura × largura (M01 p.3). Levante 1,0 / 1,5 / 2,0 m (0,5 m só no vão de 2,0).", "pç", { alt: d[1] / 1000, larg: d[2] / 1000, L: d[0] / 1000 }, null, "M01", "3", true, ""); }),
      piso: serie(null, cods6(["506", "507", "508", "509", "510", "511"]), "Plataforma 0,30 m", "Plataforma metálica 0,30 m de largura.", "pç", "L", PL_L, null, "M01", "4", true, "", { larg: 0.30 })
        .concat(serie(null, cods6(["500", "501", "502", "503", "504", "505"]), "Plataforma 0,20 m", "Plataforma metálica 0,20 m de largura.", "pç", "L", PL_L, null, "M01", "4", true, "", { larg: 0.20 })),
      pisoAlcapao: serie(null, cods6(["517", "512", "513", "515", "516"]), "Plataforma com escada", "Plataforma 0,60 m com alçapão e escada.", "pç", "L", [1.0, 1.5, 2.0, 2.5, 3.0], null, "M01", "4", true, "", { larg: 0.60 }),
      alcapaoSemEscada: [unica(k6("561"), "Alçapão sem escada", "Plataforma 0,60 × 1,0 com alçapão (sem escada).", "pç", { larg: 0.60, L: 1.0 }, null, "M01", "4", true, "catálogo apenas")],
      escadaAlcapao: [unica(k6("551"), "Escada para alçapão", "Escada para o alçapão.", "pç", {}, null, "M01", "4", true, "catálogo apenas")],
      plataformaTriangular: [unica(k6("531"), "Plataforma triangular 1,0 × 1,0", "Plataforma triangular.", "pç", { L: 1.0, larg: 1.0 }, null, "M01", "4", true, "catálogo apenas")],
      passadorS25: [unica(k6("585"), "Passador S25", "Passador S25.", "pç", {}, null, "M01", "4", true, "catálogo apenas")],
      rodape: serie(null, cods6(["449", "450", "451", "452", "453", "454", "455"]), "Rodapé metálico", "Rodapé do estribo.", "pç", "L", [0.5, 0.7, 1.0, 1.5, 2.0, 2.5, 3.0], null, "M01", "4", true, "o M01 não dá a altura: o motor adota 0,15 m (NR-18 18.9.4.2 c: mínimo 0,15 m) — confirmarRT", { alt: null }),
      sapataFixa: [unica("100305920", "Sapata simples fixa", "Sapata fixa bicromatizada.", "pç", {}, null, "M01", "3", true, "catálogo apenas")],
      baseRegulavel: unica("100306030", "Sapata ajustável Ø38", "Sapata ajustável bicromatizada Ø38.", "pç", { comprimento: null, regulagemMax: 0.25 }, null, "M01", "3", true, "o M01 não dá o curso da sapata; vale o limite de 0,25 m do motor (M02 p.10)"),
      console: serie(null, cods6(["300", "301", "302", "303"]), "Console", "Console.", "pç", "L", [0.30, 0.50, 0.70, 1.00], null, "M01", "3", true, "catálogo apenas; existe também o console 0,70 com ponta").concat([unica(k6("304"), "Console 0,70 m com ponta", "Console com ponta.", "pç", { L: 0.70 }, null, "M01", "3", true, "catálogo apenas")]),
      abracFixa: unica("100309004", "Abraçadeira fixa Ø48,2", "Abraçadeira revenida fixa para tubo Ø48,2.", "pç", {}, null, "M01", "4", true, ""),
      abracGiratoria: unica("100309002", "Abraçadeira giratória Ø48,2", "Abraçadeira revenida giratória para tubo Ø48,2.", "pç", {}, null, "M01", "4", true, "catálogo apenas"),
      tubo: serie(null, ["100309000", "100309001", "100309200", "100309300", "100309400", "100309500", "100309600", "100309700", "100309800", "100309900", "100310100", "100310200"], "Tubo galvanizado Ø48,2 × 3,0", "Tubo galvanizado Ø48,2 × 3,0 mm.", "pç", "L", [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0], null, "M01", "3", true, "no M1 só o tubo de 1,00 m da ancoragem", { D: 0.0482, parede: 0.003 }),
      viga: serie(null, cods6(["350", "351", "352"]), "Viga", "Viga.", "pç", "L", [4, 5, 6], null, "M01", "4", true, "catálogo apenas"),
      trelica: serie(null, cods6(["344", "346", "348", "624", "625", "626"]), "Treliça", "Treliça (largura × comprimento).", "pç", "L", [1.0, 2.0, 3.0, 1.0, 2.0, 3.0], null, "M01", "4", true, "catálogo apenas", { larg: [0.5, 0.5, 0.5, 1.0, 1.0, 1.0] }),
      espigaTrelica: [unica(k6("355"), "Espiga para treliça", "Espiga para treliça.", "pç", {}, null, "M01", "4", true, "catálogo apenas")],
      suporteTravessa: [unica(k6("140"), "Suporte da travessa", "Suporte da travessa.", "pç", {}, 0.75, "M01", "4", true, "o ÚNICO peso do M01; catálogo apenas")],
      forcado: [unica("100304120", "Forcado simples", "Forcado simples.", "pç", {}, null, "M01", "4", true, "catálogo apenas"), unica("100304220", "Forcado duplo", "Forcado duplo.", "pç", {}, null, "M01", "4", true, "catálogo apenas")],
      escadaExterna: unica("100309023", "Escada de acesso Ø48 × 2 m", "Escada de acesso Ø48 × 2 m (prende ao plano externo, uma por levante).", "pç", { L: 2.0, D: 0.048 }, null, "M01", "4", true, ""),
      acessoMateriais: [unica(k6("009"), "Poste 1000 com ligação", "Material de acesso.", "pç", { L: 1.0 }, null, "M01", "4", true, "catálogo apenas"),
        unica(k6("015"), "Suporte para poste", "Material de acesso.", "pç", {}, null, "M01", "4", true, "catálogo apenas"),
        unica(k6("718"), "Suporte simples para escada", "Material de acesso.", "pç", {}, null, "M01", "4", true, "catálogo apenas"),
        unica(k6("719"), "Suporte duplo para escada", "Material de acesso.", "pç", {}, null, "M01", "4", true, "catálogo apenas"),
        unica(k6("741"), "Degrau 1000", "Material de acesso.", "pç", { L: 1.0 }, null, "M01", "4", true, "catálogo apenas"),
        unica(k6("582"), "Trava de degrau", "Material de acesso.", "pç", {}, null, "M01", "4", true, "catálogo apenas")],
      escadaSuporteEsq: serie(null, cods6(["710", "711", "712", "713", "714", "715", "716", "717", "701"]), "Escada suporte esquerdo", "Escada suporte esquerdo (2 a 10 degraus).", "pç", "degraus", [2, 3, 4, 5, 6, 7, 8, 9, 10], null, "M01", "4", true, "catálogo apenas"),
      escadaSuporteDir: serie(null, cods6(["702", "703", "704", "705", "706", "707", "708", "709", "700"]), "Escada suporte direito", "Escada suporte direito (2 a 10 degraus).", "pç", "degraus", [2, 3, 4, 5, 6, 7, 8, 9, 10], null, "M01", "4", true, "catálogo apenas"),
      calco: unica(null, "Calço", "Pedaço de pranchão sob a base.", "pç", { L: 0.50, larg: 0.30, esp: 0.038 }, null, "R1", "—", true, "mesmo calço do tubo-roll (apostila R1)", { pesoPorM: 9 }),
      olhal: unica(null, "Parafuso olhal", "Olhal da ancoragem.", "pç", {}, null, "M02", "21; 22", true, "o M01 não traz olhal nem chumbador: item genérico do M02 (sem código aqui; conferir o item da linha estribo com o locador)"),
      chumbador: unica(null, "Chumbador mecânico", "Chumbador PBI 5/8\".", "pç", { furoD: 0.020, furoProf: 0.070 }, null, "M02", "22", true, "idem: item genérico do M02"),
      tela: unica(null, "Tela de proteção da fachada (m²)", "Tela da 1ª plataforma até 2 m acima da última (NR-18 18.12.15.1).", "m²", {}, null, "N18", "18.12.15.1", false, "peso SEM FONTE")
    }
  };
  /* diagonalPara[vão][levante] = { cod, L } — a tabela inteira do M01 p.3 (o motor escolhe a diagonal pelo par levante × vão) */
  ESTRIBO.diagonalPara = (function () {
    var o = {};
    ESTRIBO.pecas.diagonal.forEach(function (q) { var kv = q.medidas.larg.toFixed(2); (o[kv] = o[kv] || {})[q.medidas.alt.toFixed(1)] = { cod: q.cod, L: q.medidas.L }; });
    return o;
  })();

  var CATALOGO_MULTI = {
    versao: "M1", data: "2026-10-27", FONTES: FONTES,
    tubo: { cat: "HSS48.3X3.0", Dmm: 48.3, paredeNominalMm: 3.0, fonteId: "M02", obs: "M01: Ø48,20 × 3,0; M02: Ø48,3. Mesmo HSS48.3X3.0 do tubo-roll para o 3D e para o M3." },
    linhas: { roseta: ROSETA, estribo: ESTRIBO },
    /* roseta: DI ↔ TR de mesmo vão (levante 2,00 m); estribo: tabela alt × larg (ver peças) */
    diagonalPara: { "0.80": "DI01", "1.14": "DI02", "1.64": "DI03", "2.14": "DI04", "2.48": "DI05", "3.14": "DI06" }
  };

  /* os valores que NÃO são regra de norma brasileira: editáveis; o RT confirma; fonte ao lado (null = sem fonte alguma) */
  var PARAMETROS_RT = {
    passoNo: { padrao: 0.50, fonteId: "M03", obs: "conexões a cada 0,50 m (M03 p.8; NR-18: \"rosetas fixas a intervalos regulares\"); estribo: passo conforme o locador" },
    hPecaBase: { padrao: 0.20, fonteId: "M02", obs: "padrão/fallback 0,20 m (M1). Linha ROSETA: lê a cota 'posicaoDaRosetaAPartirDaBase' da família ra-andaime-m-peca-base (0,065 m, Layher B.S.9, secundária — familias-m-cotas.json, M2.1); estribo: o M01 não dá, fica 0,20" },
    regulagemMin: { padrao: 0.05, fonteId: null, obs: "rosca mínima exposta da base: sem fonte (critério de modelagem para não deixar a base sem folga)" },
    regulagemMax: { padrao: 0.25, fonteId: "M02", regra: true, max: 0.25, obs: "M02 p.10 e checklist item 15: regulagem máxima da sapata em condição normal; a NR não diz — vale o valor do fabricante e o motor nunca passa dele" },
    larguraModulo: { padrao: 0.80, fonteId: "M02", obs: "uma travessa da linha (roseta 0,80; estribo 1,00 por padrão do motor)" },
    offPiso: { padrao: 0, fonteId: null, obs: "o estrado encaixa na travessa no nível da roseta; se ficar acima, conferir o guarda-corpo" },
    afastamento: { padrao: 0.15, fonteId: "M02", obs: "M02 p.15: travessas a 15 cm da fachada; checklist item 8: vão fachada-piso < 0,20 m" },
    vaoMax: { padrao: 2.50, fonteId: "M02", obs: "vão longitudinal máximo adotado pela ESPEC; a carga do piso cai de 600 para 450 kgf/m² no piso de 2,48 m (M02 p.18)" },
    levanteMax: { padrao: 2.0, fonteId: "M02", obs: "levante de 2,00 m (única diagonal da linha roseta)" },
    diagCada: { padrao: 5, fonteId: "M02", obs: "M02 p.10/p.20: a cada 5 módulos, no mínimo um conjunto de diagonais, desde a base" },
    ancH: { padrao: 6.0, fonteId: "R2", regra: true, max: 6.0, obs: "REGRA NBR 6494:1990 4.5.2 (exemplar não licenciado — conferir)" },
    ancV: { padrao: 4.0, fonteId: "R2", regra: true, max: 6.0, obs: "REGRA NBR 6494:1990 4.5.2: ancH × ancV ≤ 36 m²" },
    espPisoMetal: { padrao: 0.045, fonteId: null, obs: "espessura do piso metálico no 3D: nenhuma das fontes informa (mesmo valor provisório do tubo-roll)" },
    larguraMinima: { padrao: 0.60, fonteId: "R2", regra: true, obs: "REGRA NBR 6494:1990 4.5.6: plataforma com largura ≥ 0,60 m" },
    alturaLivreMin: { padrao: 1.75, fonteId: "R2", regra: true, obs: "REGRA NBR 6494:1990 4.5.6: altura livre ≥ 1,75 m entre pisos forrados" },
    rodapeAlt: { padrao: 0.20, fonteId: "M02", obs: "rodapé metálico de encaixe, altura 0,20 m (estribo: 0,15 m, mínimo da NR-18 18.9.4.2 c, porque o M01 não dá a altura)" },
    guardaSuperior: { padrao: 1.00, fonteId: "N18", regra: true, obs: "REGRA NR-18 18.12.15.2: travessão superior entre 1,00 e 1,20 m acima do estrado" },
    cantoGraus: { padrao: 90, fonteId: null, obs: "cantos ortogonais (90° ± 5°) no M1; outros ângulos ligam-se com travessa em ângulo (30°–60°, M02 p.14) — conferir no projeto" }
  };

  function linhaDe(id) { return CATALOGO_MULTI.linhas[String(id)] || null; }
  function achar(lista, chave, valor) {
    for (var i = 0; i < lista.length; i++) { var v = lista[i].medidas ? lista[i].medidas[chave] : null; if (v != null && Math.abs(v - valor) < 1e-6) return lista[i]; }
    return null;
  }
  function fonteTxt(it) {
    if (!it || !it.fonteId) return "";
    var f = FONTES[it.fonteId];
    return it.fonteId + (it.pagina ? " p." + it.pagina : "") + (f ? " — " + f.rotulo : "");
  }

  /* ================================================================ PADRÃO
   * Os padrões do multidirecional que diferem do tubo-roll (ESPEC seção 3). O PADRAO de Andaime só ganhou as 5 chaves novas;
   * estes valores entram no normalizar quando o usuário não passou o campo. */
  /* SÓ PARA OS TESTES (controles reais da revisão nº 2): cada chave liga o caminho de código ANTIGO de uma correção. Nunca ligado em produção. ancPorCum = a caminhada de ancoragem por cota acumulada global (A-N1);
     emendaNoTopo = o empilhamento de postes antigo (emenda acima do último nó, sem tela); ancSentido = o gerador de ancoragem sem a simetria de sentido (M4-C). */
  var LEGADO = { ancPorCum: false, emendaNoTopo: false, ancSentido: false };
  var PADRAO_MULTI = { afastamento: 0.15, vaoMax: 2.50, levanteMax: 2.0, pisos: "todos", acesso: "alcapao", diagCada: 5, base: "regulavel", calco: true };

  function normalizar(par) {
    var An = Aand(), P0 = An && An.PADRAO ? An.PADRAO : {}, NUMS = An && An.NUMS ? An.NUMS : [], BOOLS = An && An.BOOLS ? An.BOOLS : [];
    var p = clone(P0); par = par || {};
    Object.keys(par).forEach(function (k) { if (par[k] != null && par[k] !== "") p[k] = clone(par[k]); });
    /* ⚠ via Peças prontas (MetalProntas.normalizar) o par já chega COMPLETADO com o PADRAO do tubo-roll (tem `aco` e `x0`): um valor igual ao padrão
       do tubo-roll é tratado como «não passado» e troca pelo padrão do multidirecional. Limite conhecido: pela tela não dá para pedir
       explicitamente o valor do tubo-roll (ex.: pisos "topo") — a tela do M4 precisa guardar o que o usuário mexeu (DUVIDAS-M1 3). */
    var viaMP = par.aco != null && par.x0 != null;
    Object.keys(PADRAO_MULTI).forEach(function (k) {
      var passou = par[k] != null && par[k] !== "", dv = PADRAO_MULTI[k], igualTubo = false;
      if (passou) igualTubo = typeof dv === "number" ? num(par[k], NaN) === num(P0[k], NaN) : String(par[k]) === String(P0[k]);
      if (!passou || (viaMP && igualTubo)) p[k] = dv;
    });
    p.sistema = "multidirecional"; p.linha = String(p.linha == null || p.linha === "" ? "roseta" : p.linha).toLowerCase();
    var lwPassou = par.larguraModulo != null && par.larguraModulo !== "";
    if (p.linha === "estribo" && (!lwPassou || num(par.larguraModulo, NaN) === num(P0.larguraModulo, NaN))) p.larguraModulo = 1.00;   /* 0,80 não é travessa do estribo (DUVIDAS-M1 4) */
    NUMS.forEach(function (k) { p[k] = num(p[k], P0[k]); });
    BOOLS.forEach(function (k) { p[k] = bool(p[k]); });
    /* M4-C (ressalva 6): acesso "auto" (padrão do tubo-roll, E9) no multi = alçapão com escada incorporada quando algum vão de acesso da linha cabe no vão máximo (roseta: 2,48 m; estribo: plataforma
       com alçapão de 1,00 a 2,50 m), senão escada externa. Nunca erro. Resolvido AQUI para o par normalizado já trazer o acesso efetivo (idempotente). */
    if (String(p.acesso) === "auto") {
      var Lx = linhaDe(p.linha), compAc = Lx && Lx.motor ? Lx.motor.acessoComp : null, vm = num(p.vaoMax, 0);
      p.acesso = compAc && compAc.some(function (c) { return c <= vm + 1e-9; }) ? "alcapao" : "escada";
    }
    return p;
  }

  /* ================================================================ VERTICAL
   * Nós a cada `passoNo`; 1º nó y0 = calço + rosca + peça base. A rosca (regulagem) é o que fecha a altura pedida:
   * o piso mais alto fica EXATAMENTE em `altura` se existe m (nº de nós) com rosca em [regulMin, regulagemMax]; senão fica na altura
   * possível mais próxima ACIMA (rosca no mínimo) e o motor avisa. Níveis a cada levante, com o levante curto EMBAIXO. */
  var CALCO_ESP = 0.038;
  /* M2.1 (27/10/2026): a altura da 1ª roseta na peça base da linha ROSETA vem da cota da família ra-andaime-m-peca-base
     ("posicaoDaRosetaAPartirDaBase" = 65 mm, js/familiasandaimemdados.js, gerado de docs/andaime-multi/familias-m-cotas.json; Layher B.S.9, SECUNDÁRIA).
     Se os dados não carregarem, volta ao 0,20 m do M1 e o motor AVISA (hPBlido = false). Estribo: o JSON não dá a cota → fica o 0,20 do motor. */
  function hPecaBaseDe(L, dados) {
    var pad = L.motor.hPecaBase;
    if (L.id !== "roseta") return { h: pad, lido: true, fonte: "motor" };
    var D = dados !== undefined ? dados : dep("FamiliasAndaimeMDados", "./familiasandaimemdados.js"), v = null;
    try { v = D.pecas["ra-andaime-m-peca-base"].cotas.posicaoDaRosetaAPartirDaBase.v; } catch (e) { v = null; }
    if (typeof v === "number" && isFinite(v) && v > 0 && v < 1000) return { h: v / 1000, lido: true, fonte: "familias-m-cotas.json (ra-andaime-m-peca-base, posicaoDaRosetaAPartirDaBase)" };
    return { h: pad, lido: false, fonte: "fallback do M1" };
  }
  function planoVertical(p, L) {
    var M = L.motor, passo = M.passoNo, hCalco = p.calco ? CALCO_ESP : 0, hpbD = hPecaBaseDe(L), hPB = hpbD.h, rmin = M.regulMin, rmax = p.regulagemMax, A = p.altura, off = p.offPiso;
    var base0 = off + hCalco + hPB, m, mFim = null, hb = null, exato = false, abaixo = null, acima = null;
    /* M1.1: altura ALCANÇÁVEL mais próxima da pedida, para cima ou para baixo; no empate fica a de cima. Alcançável = rosca em [regulMin, regulagemMax] */
    for (m = 1; m <= 400; m++) {
      var lo = base0 + rmin + passo * m, hi = base0 + rmax + passo * m;
      if (A >= lo - 1e-9 && A <= hi + 1e-9) { mFim = m; hb = Math.min(rmax, Math.max(rmin, A - base0 - passo * m)); exato = true; break; }
      if (lo > A + 1e-9) { acima = { m: m, hb: rmin, topo: lo }; break; }
      abaixo = { m: m, hb: rmax, topo: hi };
    }
    if (mFim == null) {
      var esc = acima;
      if (abaixo && (!acima || (A - abaixo.topo) < (acima.topo - A) - 1e-9)) esc = abaixo;
      if (!esc) return null;
      mFim = esc.m; hb = esc.hb;
    }
    var y0 = hCalco + hb + hPB, q = Math.max(2, Math.floor(p.levanteMax / passo + 1e-9)), rest = mFim % q, idxs = [0];
    if (rest > 0) idxs.push(rest);
    while (idxs[idxs.length - 1] < mFim) idxs.push(idxs[idxs.length - 1] + q);
    var niveis = idxs.map(function (ix, k) { var y = r4(y0 + passo * ix); return { k: k, idx: ix, y: y, yPiso: k > 0 ? r4(y + off) : null, piso: false, papel: k === 0 ? "varredor" : "travessa" }; });
    var nL = niveis.length - 1, t = String(p.pisos == null ? "todos" : p.pisos).trim().toLowerCase(), set = {};
    set[nL] = true;
    if (t === "todos") { for (var k = 1; k <= nL; k++) set[k] = true; }
    else if (t !== "topo" && t !== "") {
      String(p.pisos).split(/[;\s]+/).forEach(function (s) {
        var h = num(s, NaN); if (!isFinite(h) || h <= 0) return;
        var kb = 1, db = Infinity; for (var kq = 1; kq <= nL; kq++) { var dd = Math.abs(niveis[kq].yPiso - h); if (dd < db - 1e-9) { db = dd; kb = kq; } } set[kb] = true;
      });
    }
    niveis.forEach(function (n) { n.piso = !!set[n.k]; });
    return { niveis: niveis, nL: nL, m: mFim, idxTopo: mFim, hBase: r4(hb), y0: r4(y0), hCalco: hCalco, hPB: hPB, hPBlido: hpbD.lido, alturaPiso: r4(y0 + passo * mFim + off), alturaPedida: A, exato: exato, passo: passo, q: q, pisosK: niveis.filter(function (n) { return n.piso; }).map(function (n) { return n.k; }) };
  }
  function yDoNo(V, idx) { return r4(V.y0 + V.passo * idx); }

  /* ================================================================ VÃOS (programação dinâmica sobre os comprimentos do catálogo, em cm)
   * 'cobrir': soma ≥ alvo — minimiza (nº de vãos, depois a soma), com sobra ≤ menor vão usado.
   * 'ate':    soma ≤ alvo — a maior soma que cabe (empate: menos vãos).
   * Devolve { seq (desc), soma } ou null. */
  function combinarVaos(alvo, modo, tams) {
    if (!(tams && tams.length)) return null;
    if (alvo <= 1e-9) return modo === "ate" || modo === "cobrir" ? { seq: [], soma: 0 } : null;
    var cm = tams.map(function (t) { return Math.round(t * 100); }), maxC = Math.max.apply(null, cm);
    var T = modo === "cobrir" ? Math.ceil(alvo * 100 - 1e-6) : Math.floor(alvo * 100 + 1e-6), cap = modo === "cobrir" ? T + maxC : T;
    var cnt = [0], prev = [0], s, i;
    for (s = 1; s <= cap; s++) {
      cnt[s] = Infinity; prev[s] = 0;
      for (i = 0; i < cm.length; i++) { if (s >= cm[i] && cnt[s - cm[i]] + 1 < cnt[s]) { cnt[s] = cnt[s - cm[i]] + 1; prev[s] = cm[i]; } }
    }
    function monta(sum) { var seq = []; while (sum > 0) { seq.push(prev[sum] / 100); sum -= prev[sum]; } seq.sort(function (a, b) { return b - a; }); return seq; }
    if (modo === "ate") {
      for (s = T; s >= 0; s--) if (cnt[s] < Infinity) return { seq: monta(s), soma: s / 100 };
      return { seq: [], soma: 0 };
    }
    var cand = [];
    for (s = T; s <= cap; s++) if (cnt[s] < Infinity) cand.push({ n: cnt[s], s: s });
    cand.sort(function (a, b) { return a.n - b.n || a.s - b.s; });
    for (i = 0; i < cand.length; i++) {
      var seq = monta(cand[i].s), menor = seq[seq.length - 1];
      if (cand[i].s / 100 - alvo <= menor + 1e-6) return { seq: seq, soma: cand[i].s / 100 };
    }
    return cand.length ? { seq: monta(cand[0].s), soma: cand[0].s / 100 } : null;
  }

  /* pisos por largura do módulo: roseta n × 0,32; estribo plataformas 0,30 e 0,20 que cubram W − 0,10 com sobra ≤ 0,05 */
  function faixasPiso(L, W) {
    var alvo = W - 0.10;
    if (L.motor.pisoModo === "n32") {
      var n = Math.floor(alvo / 0.32 + 1e-9), o = []; for (var i = 0; i < n; i++) o.push(0.32);
      return { larguras: o, util: r4(n * 0.32) };
    }
    var best = null, a, b;
    for (a = 0; a <= 12; a++) for (b = 0; b <= 12; b++) {
      var soma = a * 0.30 + b * 0.20, sobra = soma - alvo;
      if (sobra < -1e-9 || sobra > 0.05 + 1e-9) continue;
      var c = { n: a + b, sobra: sobra, a: a, b: b, soma: soma };
      if (!best || c.n < best.n || (c.n === best.n && c.sobra < best.sobra - 1e-9)) best = c;
    }
    if (!best) return { larguras: [], util: 0 };
    var l = []; for (a = 0; a < best.a; a++) l.push(0.30); for (b = 0; b < best.b; b++) l.push(0.20);
    return { larguras: l, util: r4(best.soma) };
  }

  /* peça de piso do catálogo para (largura, comprimento) */
  function pecaPiso(L, larg, comp) {
    var l = L.pecas.piso;
    for (var i = 0; i < l.length; i++) if (Math.abs(l[i].medidas.larg - larg) < 1e-6 && Math.abs(l[i].medidas.L - comp) < 1e-6) return l[i];
    return null;
  }
  /* diagonal do catálogo para (vão, levante): roseta só no levante de 2,00 m; estribo pela tabela (o resto = geométrica + pendência) */
  function diagCat(L, vao, h) {
    if (L.motor.diagModo === "levante2") {
      if (Math.abs(h - 2.0) > 1e-6) return null;
      var it = achar(L.pecas.diagonal, "vao", vao); return it ? { item: it, L: it.medidas.L, cod: it.cod, estimada: false } : null;
    }
    var t = L.pecas.diagonal, i;
    for (i = 0; i < t.length; i++) if (Math.abs(t[i].medidas.alt - h) < 1e-6 && Math.abs(t[i].medidas.larg - vao) < 1e-6) return { item: t[i], L: t[i].medidas.L, cod: t[i].cod, estimada: false };
    if ([0.5, 1.0, 1.5, 2.0].some(function (a) { return Math.abs(a - h) < 1e-6; })) return { item: null, L: r3(hyp(h, vao)), cod: null, estimada: true };
    return null;
  }

  /* ================================================================ VALIDAR
   * Texto PT-BR que diz o que fazer. Os limites da NR-18 citam o item; valor de fabricante cita a fonte. */
  function validar(par) {
    var p = normalizar(par), L = linhaDe(p.linha), geo = Geo();
    if (!L) return "Andaime multidirecional: linha «" + p.linha + "» desconhecida — use roseta ou estribo.";
    if (!geo) return "Andaime multidirecional: o módulo base (js/andaime.js) não carregou.";
    var M = L.motor, g = geo.caminhoDe(p), cam = g.cam;
    var txtC = String(p.caminho || "").trim(), txtK = String(p.contorno || "").trim(), cm0 = geo.lerCaminho(p.caminho), ck0 = geo.lerCaminho(p.contorno);
    if (txtK && ck0.length < 3) return "Andaime: o contorno precisa de 3 pontos ou mais (x z; x z…).";
    if (!(txtK && ck0.length >= 3) && txtC && cm0.length < 2) return "Andaime: o caminho precisa de 2 pontos ou mais (x z; x z…).";
    if (p.fechado && !(ck0.length >= 3 || cm0.length >= 3)) return "Andaime fechado (em volta de um equipamento): precisa de um contorno de 3 pontos ou mais.";
    var nT = g.fechado ? cam.length : cam.length - 1, i;
    for (i = 0; i < nT; i++) { var a = cam[i], b = cam[(i + 1) % cam.length]; if (hyp(b[0] - a[0], b[1] - a[1]) < 0.30) return "Andaime: o trecho " + (i + 1) + " tem menos de 0,30 m (dois pontos quase no mesmo lugar)."; }
    if (cam.length === 2 && !(txtC || txtK) && !(p.comprimento >= 1 && p.comprimento <= 200)) return "Andaime: comprimento de 1 a 200 m (clique o começo e o fim, ou digite).";
    var vIni = g.fechado ? 0 : 1, vFim = g.fechado ? cam.length : cam.length - 1;
    for (var vi = vIni; vi < vFim; vi++) {
      var Ap = cam[(vi - 1 + cam.length) % cam.length], Bp = cam[vi], Cp = cam[(vi + 1) % cam.length];
      var w1 = [Bp[0] - Ap[0], Bp[1] - Ap[1]], w2 = [Cp[0] - Bp[0], Cp[1] - Bp[1]];
      var cs = Math.max(-1, Math.min(1, dot2(w1, w2) / (hyp(w1[0], w1[1]) * hyp(w2[0], w2[1]))));
      var ang = 180 - Math.acos(cs) / GRAU;
      if (ang < 30 - 1e-6) return "Andaime: o encontro de " + brf(ang, 0) + "° é fechado demais para o andaime (mínimo 30°): divida em dois andaimes.";
    }
    if (!(p.altura >= 0.5 && p.altura <= 60)) return "Altura do piso de trabalho de 0,5 a 60 m.";
    /* largura do módulo = uma travessa da linha */
    var trs = L.pecas.travessa, W = p.larguraModulo;
    if (!achar(trs, "vao", W)) return "Largura " + brf(W) + ": use uma travessa da linha (" + trs.map(function (t) { return brf(t.medidas.vao); }).join("; ") + ").";
    var fx = faixasPiso(L, W);
    if (!fx.larguras.length) return "Largura " + brf(W) + " m: nenhuma combinação de pisos da linha cobre o módulo (M01/M02). Escolha outra travessa de largura.";
    if (fx.util < PARAMETROS_RT.larguraMinima.padrao - 1e-9) return "Largura útil do piso de " + brf(fx.util) + " m: a NBR 6494 (4.5.6) pede no mínimo 0,60 m. Escolha uma travessa de largura maior.";
    if (!(p.regulagemMax > 0 && p.regulagemMax <= PARAMETROS_RT.regulagemMax.max + 1e-9)) return "Regulagem máxima da base de " + brf(p.regulagemMax) + " m: o fabricante limita a 0,25 m em condição normal (M02 p.10 e checklist item 15). Use até 0,25 m.";
    if (!(p.afastamento >= 0.05 && p.afastamento <= 0.60)) return "Afastamento da face de 0,05 a 0,60 m.";
    if (!(p.vaoMax >= trs[0].medidas.vao - 1e-9 && p.vaoMax <= 3.5)) return "Vão longitudinal máximo de " + brf(trs[0].medidas.vao) + " a 3,5 m (a menor travessa da linha é " + brf(trs[0].medidas.vao) + " m).";
    if (!(p.levanteMax >= 1 && p.levanteMax <= 3)) return "Distância máxima entre níveis (levante) de 1,0 a 3,0 m.";
    if (["alcapao", "escada", "nenhum"].indexOf(String(p.acesso)) < 0) return "Acesso: alcapao, escada ou nenhum.";
    if (["regulavel", "articulada"].indexOf(String(p.base)) < 0) return "Base: regulável ou articulada (a linha multidirecional não tem base fixa nem rodízio no catálogo).";
    if (["tubo", "gancho", "nenhuma"].indexOf(String(p.ancoragem)) < 0) return "Ancoragem: tubo/gancho (o motor escolhe pelo afastamento) ou nenhuma.";
    if (!(p.diagCada >= 1)) return "Diagonais: uma torre a cada N vãos, N de 1 em diante.";
    if (!(p.ancH > 0 && p.ancV > 0)) return "Ancoragem: os espaçamentos horizontal e vertical têm de ser maiores que zero.";
    if (p.ancoragem !== "nenhuma" && (p.ancH > PARAMETROS_RT.ancH.max + 1e-9 || p.ancV > PARAMETROS_RT.ancV.max + 1e-9 || p.ancH * p.ancV > 36 + 1e-9)) return "Ancoragem " + brf(p.ancH) + " × " + brf(p.ancV) + " m (" + brf(p.ancH * p.ancV) + " m²): a NBR 6494 (4.5.2) pede amarração a no máximo 6,00 m nas duas direções e ao menos uma a cada 36,00 m². Diminua os espaçamentos.";
    if (!(num(p.acessoPos, 0) >= 0 && num(p.acessoPos, 0) <= 1)) return "Posição do acesso de 0 a 1 ao longo do caminho (0 = 1º vão).";
    /* guarda-corpo NR-18 18.12.15.2: travessão superior entre 1,00 e 1,20 m acima do ESTRADO; o superior fica no nó +2 (2 passos) */
    var guardaReal = 2 * M.passoNo - p.offPiso;
    if (guardaReal < PARAMETROS_RT.guardaSuperior.padrao - 1e-9 || guardaReal > 1.20 + 1e-9) return "Guarda-corpo: com o estrado a " + brf(p.offPiso) + " m do nó, o travessão superior fica a " + brf(guardaReal) + " m do estrado; a NR-18 (18.12.15.2) pede entre 1,00 e 1,20 m acima do estrado. Ajuste o nível do estrado (offPiso entre −0,20 e 0,00 m).";
    if (p.acesso === "alcapao") {
      var ok = M.acessoComp.some(function (c) { return c <= p.vaoMax + 1e-9; });
      if (!ok) return "Acesso por alçapão: precisa de um vão de " + M.acessoComp.map(function (c) { return brf(c); }).join(" ou ") + " m e o vão máximo é " + brf(p.vaoMax) + " m. Aumente o vão máximo ou use escada.";
    }
    var V = planoVertical(p, L);
    if (!V) return "Altura do piso: não foi possível compor os nós da linha para esta altura.";
    if (p.acesso === "nenhum" && V.niveis[V.pisosK[0]].yPiso > 1.0 + 1e-9) return "Sem acesso: a NR-18 (18.12.14) exige escada quando o piso de trabalho passa de 1,00 m (aqui o piso mais baixo está a " + brf(V.niveis[V.pisosK[0]].yPiso) + " m). Escolha alçapão ou escada.";
    for (var iq = 1; iq < V.pisosK.length; iq++) {
      var yA = V.niveis[V.pisosK[iq - 1]].yPiso, yB = V.niveis[V.pisosK[iq]].yPiso, livre = (yB - yA) - PARAMETROS_RT.espPisoMetal.padrao;
      if (livre < PARAMETROS_RT.alturaLivreMin.padrao - 1e-9) return "Altura livre de " + brf(livre) + " m entre os pisos de " + brf(yA) + " e " + brf(yB) + " m: a NBR 6494 (4.5.6) pede no mínimo 1,75 m entre pisos forrados. Tire um dos pisos (pisos: topo) ou aumente o levante.";
    }
    return null;
  }

  /* ================================================================ MONTAR */
  function montar(par) {
    var p = normalizar(par), erro = validar(par);
    if (erro) return { ok: false, erro: erro, avisos: [] };
    var L = linhaDe(p.linha), geo = Geo(), M = L.motor, passo = M.passoNo, W = p.larguraModulo, S = L.pecas;
    var avisos = [], visto = {}, pendencias = [], pvisto = {};
    function aviso(t) { if (!visto[t]) { visto[t] = 1; avisos.push(t); } }
    function pend(t) { if (!pvisto[t]) { pvisto[t] = 1; pendencias.push(t); } }
    var V = planoVertical(p, L), niveis = V.niveis, nL = V.nL, idxTopo = V.idxTopo;
    var fx = faixasPiso(L, W), nPisoLarg = fx.larguras.length;
    var espPiso = PARAMETROS_RT.espPisoMetal.padrao;
    aviso("Espessura do piso metálico no 3D: nenhuma das fontes informa; usando " + brf(espPiso, 3) + " m (provisório, confirmar com o responsável técnico).");
    if (!V.exato) aviso("piso a " + brf(V.alturaPiso) + " m (pedido " + brf(V.alturaPedida) + " m, " + brf(Math.abs(V.alturaPiso - V.alturaPedida), 3) + " m " + (V.alturaPiso > V.alturaPedida ? "acima" : "abaixo") + "): " + (L.id === "roseta" ? "a roseta" : "o nó do estribo") + " anda de " + brf(passo) + " em " + brf(passo) + " m; a rosca da base fica em " + brf(V.hBase) + " m — altura alcançável mais próxima (no empate, a de cima).");
    if (p.vaoMax > 2.5 + 1e-9) aviso("Vão máximo de " + brf(p.vaoMax) + " m passa de 2,50 m: a carga do piso cai (450 kgf/m² no piso de 2,48 m e 300 kgf/m² no de 3,14 m, M02 p.18) — confirmar com o responsável técnico.");
    if (p.afastamento > 0.20 + 1e-9) aviso("Afastamento de " + brf(p.afastamento) + " m passa de 0,20 m (checklist M02 item 8, vão fachada-piso < 0,20 m): o guarda-corpo interno entra em todos os pisos.");
    var piBase = niveis[0];
    if (!V.hPBlido) aviso("Altura da 1ª roseta na peça base: os dados da família (js/familiasandaimemdados.js) não carregaram — usando o 0,20 m do M1 (fallback); conferir com o locador.");

    /* ---------------- caminho, lado, trechos */
    var g = geo.caminhoDe(p), cam = g.cam, closed = g.fechado, nCam = cam.length, nT = closed ? nCam : nCam - 1, sLado;
    if (closed) { var Ar = geo.areaAssinada(cam), sOut = Ar > 0 ? 1 : -1; sLado = String(p.lado) === "dentro" ? -sOut : sOut; }
    else sLado = String(p.lado) === "direita" ? -1 : 1;
    var trecho = [], ti, Ltotal = 0;
    for (ti = 0; ti < nT; ti++) {
      var P = cam[ti], Q = cam[(ti + 1) % nCam], L0 = hyp(Q[0] - P[0], Q[1] - P[1]), u0 = [(Q[0] - P[0]) / L0, (Q[1] - P[1]) / L0];
      trecho.push({ ti: ti, P: P, L: L0, u: u0, ns: [sLado * u0[1], -sLado * u0[0]], cumIni: Ltotal, e: 0, wI: p.afastamento, wE: p.afastamento + W, seq: [], st: [], cells: [] });
      Ltotal += L0;
    }
    function ptAt(T0, s, w) { return [T0.P[0] + T0.u[0] * s + T0.ns[0] * w, T0.P[1] + T0.u[1] * s + T0.ns[1] * w]; }
    /* tipo do vértice no FIM de cada trecho: convexo | concavo | livre (ângulo fora de 90° ± 5°) | null (fim do aberto) */
    var vt = [];
    for (ti = 0; ti < nT; ti++) {
      if (!closed && ti === nT - 1) { vt.push(null); continue; }
      var TA = trecho[ti], TB = trecho[(ti + 1) % nT], cs = Math.max(-1, Math.min(1, dot2(TA.u, TB.u))), angi = 180 - Math.acos(cs) / GRAU;
      if (Math.abs(angi - 90) <= 5) vt.push(dot2(TA.ns, TB.u) <= 1e-9 ? "convexo" : "concavo");
      else {
        vt.push("livre");
        aviso("Canto de " + brf(angi, 0) + "° entre os trechos " + (ti + 1) + " e " + (((ti + 1) % nT) + 1) + ": ligar com travessa em ângulo (30°–60°, M02 p.14) — conferir no projeto. Os trechos ficam separados, sem piso no canto.");
        pend("Canto de " + brf(angi, 0) + "° (trechos " + (ti + 1) + " e " + (((ti + 1) % nT) + 1) + "): ligação em ângulo fora do M1 — o responsável técnico define o encontro.");
      }
    }

    /* ---------------- vãos permitidos: travessas da linha ≤ vaoMax (estribo: só as que têm plataforma, senão o piso não fecha) */
    var lensVao = [];
    S.travessa.forEach(function (t) {
      var v = t.medidas.vao; if (v > p.vaoMax + 1e-9) return;
      if (M.pisoModo === "plataformas" && !S.piso.some(function (q) { return Math.abs(q.medidas.L - v) < 1e-6; })) return;
      lensVao.push(v);
    });
    lensVao.sort(function (a, b) { return a - b; });
    if (!lensVao.length) return { ok: false, erro: "Nenhuma travessa da linha cabe no vão máximo de " + brf(p.vaoMax) + " m.", avisos: avisos };
    function ehAcc(v) { return M.acessoComp.some(function (c) { return Math.abs(c - v) < 1e-6; }); }
    var posAcc = p.acesso === "alcapao" ? Math.max(0, Math.min(1, num(p.acessoPos, 0))) * Ltotal : -1, tAcc = -1;
    if (posAcc >= 0) { for (ti = 0; ti < nT; ti++) if (posAcc <= trecho[ti].cumIni + trecho[ti].L + 1e-9 || ti === nT - 1) { tAcc = ti; break; } }

    /* escolhe os vãos de um trecho (com o vão de acesso garantido no trecho do acesso) */
    function escolher(base, modo, ti2) {
      var need = ti2 === tAcc, r = combinarVaos(base, modo, lensVao);
      if (!r) return null;
      if (!need) return { outros: r.seq, acc: null, soma: r.soma };
      var iAcc = -1, k;
      for (k = 0; k < r.seq.length; k++) if (ehAcc(r.seq[k])) { iAcc = k; break; }
      if (iAcc >= 0) { var outros = r.seq.slice(); var av = outros.splice(iAcc, 1)[0]; return { outros: outros, acc: av, soma: r.soma }; }
      var f = M.acessoForcado, ac = lensVao.indexOf(f) >= 0 ? f : null;
      if (ac == null) { for (k = lensVao.length - 1; k >= 0; k--) if (ehAcc(lensVao[k])) { ac = lensVao[k]; break; } }
      if (ac == null) return null;
      var rest = modo === "cobrir" ? combinarVaos(base - ac, "cobrir", lensVao) : (base - ac >= -1e-9 ? combinarVaos(base - ac, "ate", lensVao) : null);
      if (!rest) return null;
      aviso("O vão de acesso de " + brf(ac) + " m não saiu da combinação mais curta: forcei um vão desse comprimento na posição do acesso e recombinei o resto (M02 p.18: o alçapão tem o comprimento do vão).");
      return { outros: rest.seq, acc: ac, soma: rest.soma + ac };
    }

    /* ---------------- cadeias: o aberto (ou o fechado cortado em cantos «livres») vira trechos em sequência; o anel fechado sem canto livre é resolvido por iteração */
    var chains, ring, j, erroGeo, anelFalhou, tentativasAnel = 0;
    for (;;) {   /* se o anel não fechar com as travessas do catálogo, o canto que não fecha vira «livre» (trechos separados) e refaz */
    chains = []; ring = false; erroGeo = null; anelFalhou = -1;
    var iLivre = -1; for (ti = 0; ti < nT; ti++) if (vt[ti] === "livre") { iLivre = ti; break; }
    if (closed && iLivre < 0) { chains.push([]); for (ti = 0; ti < nT; ti++) chains[0].push(ti); ring = true; }
    else {
      var st0 = closed ? (iLivre + 1) % nT : 0, cur = [];
      for (j = 0; j < nT; j++) { var tj = (st0 + j) % nT; cur.push(tj); if (vt[tj] === "livre" || vt[tj] == null) { chains.push(cur); cur = []; } }
      if (cur.length) chains.push(cur);
    }
    chains.forEach(function (chain) {
      if (erroGeo || anelFalhou >= 0) return;
      var nC = chain.length, e = [], sums = [], sols = [], it, mudou, jj;
      for (jj = 0; jj < nC; jj++) e.push(0);
      function sStartDe(jx) {
        var pj = jx > 0 ? jx - 1 : (ring ? nC - 1 : -1);
        if (pj < 0) return 0;
        var wIp = p.afastamento + e[pj];
        return vt[chain[pj]] === "convexo" ? -wIp : wIp + W;
      }
      for (it = 0; it < (ring ? 12 : 1); it++) {
        mudou = false;
        for (jj = 0; jj < nC && !erroGeo; jj++) {
          var i2 = chain[jj], T1 = trecho[i2], ss = sStartDe(jj), nj = jj < nC - 1 ? jj + 1 : (ring ? 0 : -1), base, modo, sol, enovo = null;
          if (nj < 0) { base = T1.L - ss; modo = "cobrir"; }
          else if (vt[i2] === "convexo") { base = T1.L + p.afastamento - ss; modo = "cobrir"; }
          else { base = T1.L - p.afastamento - W - ss; modo = "ate"; }
          if (nj >= 0 && base < -1e-9) { erroGeo = "Andaime: o trecho " + (i2 + 1) + " é curto demais para os dois cantos (faltam " + brf(-base) + " m de comprimento): afaste os pontos ou use outro afastamento."; break; }
          sol = escolher(base, modo, i2);
          if (!sol) { erroGeo = "Andaime: não consegui compor os vãos do trecho " + (i2 + 1) + " com as travessas da linha (vão máximo " + brf(p.vaoMax) + " m)."; break; }
          if (nj < 0 && !sol.outros.length && sol.acc == null) sol = { outros: [lensVao[0]], acc: null, soma: lensVao[0] };
          sols[jj] = sol; sums[jj] = sol.soma;
          if (nj >= 0) { enovo = vt[i2] === "convexo" ? sol.soma - base : base - sol.soma; if (Math.abs(e[nj] - enovo) > 1e-6) { e[nj] = enovo; mudou = true; } }
        }
        if (erroGeo || !mudou) break;
      }
      if (erroGeo) return;
      if (ring) {   /* confere o fechamento do anel: o comprimento real de cada trecho = a soma escolhida */
        for (jj = 0; jj < nC; jj++) {
          var i3 = chain[jj], ss3 = sStartDe(jj), nj3 = jj < nC - 1 ? jj + 1 : 0, wIn = p.afastamento + e[nj3];
          var fimReg = vt[i3] === "convexo" ? trecho[i3].L + wIn : trecho[i3].L - wIn - W;
          if (Math.abs((fimReg - ss3) - sums[jj]) > 1e-4) { anelFalhou = i3; return; }
        }
      }
      for (jj = 0; jj < nC; jj++) {
        var Tt = trecho[chain[jj]], sol2 = sols[jj];
        Tt.e = e[jj]; Tt.wI = p.afastamento + e[jj]; Tt.wE = Tt.wI + W; Tt.sS = sStartDe(jj); Tt.cadeiaIdx = jj; Tt.cadeia = chain; Tt.fimLivre = jj === nC - 1 && !ring;
        Tt.temCanto = jj < nC - 1 || ring; Tt.tipoCanto = vt[chain[jj]];
        var outros = sol2.outros.slice(), seq = outros;
        if (sol2.acc != null) {
          var alvoD = Math.max(0, Math.min(sol2.soma, (posAcc - Tt.cumIni) - Tt.sS)), melhorI = 0, melhorD = Infinity, acum = 0, kq;
          for (kq = 0; kq <= outros.length; kq++) {
            var d1 = Math.abs(acum + sol2.acc / 2 - alvoD); if (d1 < melhorD - 1e-9) { melhorD = d1; melhorI = kq; }
            if (kq < outros.length) acum += outros[kq];
          }
          seq = outros.slice(0, melhorI).concat([sol2.acc], outros.slice(melhorI)); Tt.accIdx = melhorI;
        } else Tt.accIdx = -1;
        Tt.seq = seq;
        if (Tt.e > 0.02) aviso("Trecho " + (Tt.ti + 1) + ": para fechar o canto com travessas do catálogo o afastamento da face ficou em " + brf(Tt.wI) + " m (nominal " + brf(p.afastamento) + " m, +" + brf(Tt.e, 3) + " m).");
        if (Tt.wI > 0.45 + 1e-9) aviso("Trecho " + (Tt.ti + 1) + ": afastamento de " + brf(Tt.wI) + " m passa de 0,45 m — a ancoragem passa a ser por tubo + 2 abraçadeiras fixas.");
      }
    });
    if (anelFalhou >= 0 && tentativasAnel < nT) {
      var vx = anelFalhou, vy = (anelFalhou + 1) % nT;
      vt[vx] = "livre"; tentativasAnel++;
      aviso("Contorno fechado: as travessas do catálogo não fecham o anel no canto entre os trechos " + (vx + 1) + " e " + (vy + 1) + " — o canto ficou separado (sem piso no canto, cabeceira nos dois lados).");
      pend("Canto entre os trechos " + (vx + 1) + " e " + (vy + 1) + ": o reticulado não fechou o anel; ligar com travessa em ângulo/ajuste de projeto — o responsável técnico define o encontro. (Ou ajuste os lados do contorno a medidas que fechem com as travessas da linha.)");
      continue;
    }
    break;
    }
    if (erroGeo) return { ok: false, erro: erroGeo, avisos: avisos };

    /* ---------------- nós (postes em planta) com fusão por proximidade (2 cm) e por identidade (cantos) */
    var nos = [];
    function res(id) { while (nos[id].alias != null) id = nos[id].alias; return id; }
    function nodoEm(pt) {
      for (var q = 0; q < nos.length; q++) if (nos[q].alias == null && hyp(nos[q].x - pt[0], nos[q].z - pt[1]) < 0.02) return q;
      nos.push({ x: pt[0], z: pt[1], alias: null }); return nos.length - 1;
    }
    function fundir(a, b) { a = res(a); b = res(b); if (a !== b) nos[a].alias = b; }
    var cells = [], estacoes = [], vaosN = 0;
    chains.forEach(function (chain) {
      chain.forEach(function (ix, jj) {
        var T0 = trecho[ix], s = T0.sS, stl = [], k;
        function mk(sv, I, O) { var st = { id: estacoes.length, trecho: T0.ti, s: sv, I: I != null ? I : nodoEm(ptAt(T0, sv, T0.wI)), O: O != null ? O : nodoEm(ptAt(T0, sv, T0.wE)), cum: T0.cumIni + sv }; estacoes.push(st); stl.push(st); return st; }
        var prevT = jj > 0 ? trecho[chain[jj - 1]] : null, I0 = null, O0 = null;
        if (prevT && prevT.tipoCanto !== "livre") {
          var pr = prevT.st, regEnd = pr[pr.length - 2], bayEnd = pr[pr.length - 1];
          if (prevT.tipoCanto === "convexo") { I0 = regEnd.I; O0 = bayEnd.I; } else { I0 = bayEnd.O; O0 = regEnd.O; }
        }
        mk(s, I0, O0);
        for (k = 0; k < T0.seq.length; k++) { s += T0.seq[k]; mk(s); }
        if (T0.temCanto && T0.tipoCanto !== "livre") { s += W; mk(s); }
        T0.st = stl;
        /* M3.1 (M7): estações das PONTAS do trecho aberto e dos CANTOS recebem ancoragem em TODA fiada (a ponta livre é o pior lugar para o vento) */
        if (jj === 0 && !ring) stl[0].forca = true;
        if (prevT && prevT.tipoCanto !== "livre") stl[0].forca = true;   /* 1ª estação depois de um canto (no côncavo o poste interno dela é o EXTERNO da estação do canto anterior) */
        if (ring && jj === 0) stl[0].forca = true;
        if (T0.fimLivre) stl[stl.length - 1].forca = true;
        if (T0.temCanto && T0.tipoCanto !== "livre") { stl[stl.length - 1].forca = true; if (stl.length >= 2) stl[stl.length - 2].forca = true; }
        var nReg = T0.seq.length, v = 0;
        for (k = 0; k + 1 < stl.length; k++) {
          var isBay = T0.temCanto && T0.tipoCanto !== "livre" && k === stl.length - 2;
          var c = { id: cells.length, trecho: T0.ti, kind: isBay ? "canto" : "vao", v: isBay ? -1 : v, s0: stl[k].s, s1: stl[k + 1].s, L: isBay ? W : T0.seq[k], a: stl[k], b: stl[k + 1], first: k === 0, last: k === stl.length - 2, acesso: false };
          if (!isBay) { if (T0.accIdx === k) c.acesso = true; v++; vaosN++; }
          cells.push(c); T0.cells.push(c);
        }
        if (nReg === 0 && !T0.temCanto) aviso("Trecho " + (T0.ti + 1) + " ficou sem vãos.");
      });
    });
    if (ring) {   /* fecha o anel: o 1º trecho da cadeia nasceu por posição; o último trecho é quem manda nos nós do canto */
      var ch0 = chains[0], tF = trecho[ch0[0]], tL = trecho[ch0[ch0.length - 1]], prL = tL.st, rE = prL[prL.length - 2], bE = prL[prL.length - 1];
      if (tL.tipoCanto === "convexo") { fundir(tF.st[0].I, rE.I); fundir(tF.st[0].O, bE.I); } else { fundir(tF.st[0].I, bE.O); fundir(tF.st[0].O, rE.O); }
    }

    /* ---------------- arestas do plano (cada célula contribui com 4; contagem 1 = contorno do piso) */
    var arestas = {}, listaAr = [];
    function addAr(a, b, Lc, tipo, papel, ti2) {
      a = res(a); b = res(b); if (a === b) return;
      var k = a < b ? a + "|" + b : b + "|" + a, o = arestas[k];
      if (!o) { o = { id: listaAr.length, a: a < b ? a : b, b: a < b ? b : a, L: Lc, tipo: tipo, papel: papel, ti: ti2, cont: 0 }; arestas[k] = o; listaAr.push(o); }
      o.cont++;
    }
    cells.forEach(function (c) {
      var T0 = trecho[c.trecho], canto = c.kind === "canto", convex = T0.tipoCanto === "convexo";
      addAr(c.a.I, c.b.I, c.L, "long", "int", T0.ti);
      addAr(c.a.O, c.b.O, c.L, "long", canto && !convex ? "tr" : "ext", T0.ti);
      addAr(c.a.I, c.a.O, W, "transv", c.first && (T0.cadeiaIdx === 0 && !ring) ? "cab" : "tr", T0.ti);
      var papelFim = "tr";
      if (c.last) { if (T0.fimLivre) papelFim = "cab"; else if (canto) papelFim = convex ? "cabCanto" : "int"; }
      addAr(c.b.I, c.b.O, W, "transv", papelFim, T0.ti);
    });
    /* M4 (27/10): o critério é o VÃO REAL fachada–piso (afastamento da travessa + a folga do piso dentro do módulo), não só o afastamento da travessa —
       na roseta 0,80 com 2 pisos de 0,32 o vão é 0,15 + 0,08 = 0,23 m > 0,20 (checklist M02 Anexo A item 8): sem o guarda-corpo do lado da fachada o vão ficava aberto */
    var folgaPiso = Math.max(0, (W - fx.util) / 2), avisouGI = {};
    function giEf(ti2) { var g = trecho[ti2].wI + folgaPiso, on = p.guardaInterno || g > 0.20 + 1e-9; if (on && !p.guardaInterno && !avisouGI[ti2]) { avisouGI[ti2] = 1; aviso("Vão entre a fachada e o piso de " + brf(g) + " m no trecho " + (ti2 + 1) + " (passa de 0,20 m, checklist M02 item 8): o guarda-corpo do lado da fachada entra em todos os pisos desse trecho."); } return on; }
    listaAr.forEach(function (e2) {
      e2.guarda = e2.cont === 1 && (e2.papel === "ext" || e2.papel === "cab" || e2.papel === "cabCanto");
      e2.guardaInt = e2.cont === 1 && (e2.papel === "int") && giEf(e2.ti);
    });

    /* ---------------- postes */
    var postes = {}, postesL = [];
    function poste(id) { var k = res(id); if (!postes[k]) { postes[k] = { id: postesL.length, key: "P" + postesL.length, no: k, x: r4(nos[k].x), z: r4(nos[k].z), inner: false, outer: false, cab: false, guarda: false, ext: false }; postesL.push(postes[k]); } return postes[k]; }
    listaAr.forEach(function (e2) {
      var pa = poste(e2.a), pb = poste(e2.b);
      [pa, pb].forEach(function (q) {
        if (e2.papel === "int") q.inner = true;
        if (e2.guarda) { q.outer = true; q.ext = true; q.guarda = true; if (e2.papel === "cab") q.cab = true; }
        if (e2.guardaInt) q.guarda = true;
      });
    });
    /* interno/externo = o poste cai na linha interna/externa de algum trecho (o mesmo poste de canto pode ser as duas) */
    estacoes.forEach(function (s2) { poste(s2.I).interno = true; poste(s2.O).externo = true; });
    var faceAteN = p.faceAte == null || p.faceAte === "" ? null : num(p.faceAte, null);
    var idxAncTopo = idxTopo + 4;   /* M3.1 (A2): a ancoragem de topo fica no nó +2,00 m acima do último piso (topo da tela, NR-18 18.12.15.1), onde há transversal */
    var yAncTopo = yDoNo(V, idxAncTopo);
    var comAncTopo = !!(p.tela && p.ancTopo && p.ancoragem !== "nenhuma" && (faceAteN == null || faceAteN >= yAncTopo + 0.10 - 1e-9));
    if (p.tela && p.ancTopo && p.ancoragem !== "nenhuma" && !comAncTopo) aviso("ancTopo desligado: a face/estrutura só vai até " + brf(faceAteN) + " m e a ancoragem do topo ficaria a " + brf(yAncTopo) + " m — o balanço da tela é verificado como balanço.");
    if (comAncTopo && faceAteN == null) pend("ancTopo: confirmar pelo RT que há onde ancorar a " + brf(yAncTopo) + " m (face/estrutura existente até essa cota); informe faceAte.");

    /* ---------------- barras e conexões */
    var barras = [], conexoes = [], bKey = {}, seqB = 0, seqC = 0;
    function addBarra(papel, A3, B3, Lc, extra) {
      var ka = r3(A3[0]) + "," + r3(A3[1]) + "," + r3(A3[2]), kb = r3(B3[0]) + "," + r3(B3[1]) + "," + r3(B3[2]), kk = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      if (bKey[kk]) return bKey[kk];
      var o = { id: "B" + (++seqB), papel: papel, a: [r4(A3[0]), r4(A3[1]), r4(A3[2])], b: [r4(B3[0]), r4(B3[1]), r4(B3[2])], L: Lc, cod: "tubo", codCat: null };
      if (extra) Object.keys(extra).forEach(function (k2) { o[k2] = extra[k2]; });
      barras.push(o); bKey[kk] = o; return o;
    }
    function addCon(tipo, pos, bs, extra) { var o = { id: "C" + (++seqC), tipo: tipo, pos: [r4(pos[0]), r4(pos[1]), r4(pos[2])], barras: bs }; if (extra) Object.keys(extra).forEach(function (k2) { o[k2] = extra[k2]; }); conexoes.push(o); return o; }
    function P3(no, y) { return [nos[no].x, y, nos[no].z]; }
    var postLens = S.poste.map(function (q) { return q.medidas.L; }).sort(function (a, b) { return b - a; });

    /* POSTES: emendas desencontradas — 1º poste interno 2,00 m e externo 3,00 m (M02 p.16), depois 3,00 m, o último o que alcança */
    var nEmendas = 0;
    postesL.forEach(function (q) {
      /* M3.1 (A2): com tela os dois postes da estação (interno e externo) sobem até o nó +2,00 m (+4 nós) — o topo é um levante completo, não balanço */
      var topIdx = idxTopo + (p.tela && (q.ext || q.interno) ? 4 : (q.guarda ? 2 : 0));
      if (comAncTopo) topIdx = Math.max(topIdx, idxAncTopo);
      q.topIdx = topIdx;
      var T = topIdx * passo, first = q.ext ? 3.0 : 2.0, pcs = [], rem = T, k, Tbase = T, ultima = null;
      /* M4-C (ressalva 2 da revisão nº 2): SEM TELA o poste externo termina num BALANÇO de guarda-corpo (o travessão a +1,00 m do último nível). Uma emenda (rótula, C-N1) acima do último nó com transversal deixava
         o trecho de cima sem apoio de rotação na raiz do balanço (mecanismo sob o guarda-corpo). A última emenda do EXTERNO vai para o PENÚLTIMO nível com transversal e a peça de cima (<= 3,00 m) ATRAVESSA o
         último nó (ex.: 3,853 a 6,853 m). As demais emendas ficam como estavam (desencontradas, M02 p.16): pôr TODAS em nível dava o mecanismo das três rótulas colineares (interno e externo rotulados no mesmo nível,
         DUVIDAS-M4-C). Só vale se a peça de cima é de catálogo; senão, o empilhamento antigo e um aviso. */
      if (!p.tela && q.ext && topIdx > idxTopo && nL >= 2 && !LEGADO.emendaNoTopo) {
        var yPenD = r4(niveis[nL - 1].y - V.y0), cima = r4(T - yPenD);
        if (yPenD >= 0.5 - 1e-9 && cima <= 3.0 + 1e-9 && achar(S.poste, "L", cima)) { Tbase = yPenD; ultima = cima; }
        else aviso("Poste externo sem tela: não consegui pôr a última emenda no penúltimo nível (peça de cima de " + brf(cima) + " m): a emenda fica acima do último nó — o RT confere o balanço do guarda-corpo.");
      }
      if (Tbase <= first + 1e-9) { pcs.push(Tbase); rem = 0; } else { pcs.push(first); rem = Tbase - first; }
      rem = rem > 0 ? rem : 0;
      while (rem > 1e-9) { var pick = null; for (k = 0; k < postLens.length; k++) if (postLens[k] <= rem + 1e-9 && postLens[k] <= 3.0 + 1e-9) { pick = postLens[k]; break; } if (pick == null) break; pcs.push(pick); rem -= pick; }
      if (ultima != null) pcs.push(ultima);
      var y = V.y0, bs = [], itm;
      pcs.forEach(function (len, ix) {
        itm = achar(S.poste, "L", len);
        if (!itm) pend("Poste de " + brf(len) + " m não existe no catálogo da linha " + L.id + ": confirmar a composição dos postes com o locador.");
        var b = addBarra("poste", P3(q.no, y), P3(q.no, y + len), len, { poste: q.key, linha: q.ext ? "e" : "i", nivel: null });
        b.cod = "poste"; b.codCat = itm ? itm.cod : null; bs.push({ id: b.id, y1: y + len });
        y += len;
        if (ix < pcs.length - 1) { nEmendas++; }
      });
      for (k = 0; k + 1 < bs.length; k++) addCon("espigao", [nos[q.no].x, bs[k].y1, nos[q.no].z], [bs[k].id, bs[k + 1].id], { pino: 1 });
      q.barras = bs; q.nPecas = pcs.length; q.pecas = pcs;
    });

    /* NÍVEIS: travessas longitudinais e transversais em cada nó de nível (nível 0 = varredor, M02 p.15) */
    function codTrav(len) { var it = achar(S.travessa, "vao", len); return it ? it.cod : null; }
    niveis.forEach(function (nv) {
      listaAr.forEach(function (e2) {
        var b = addBarra(e2.tipo === "long" ? "travessa" : "transversal", P3(e2.a, nv.y), P3(e2.b, nv.y), e2.L, { nivel: nv.k, linha: e2.papel === "int" ? "i" : (e2.papel === "ext" ? "e" : "t"), trecho: e2.ti });
        if (b.codCat == null) { b.cod = "travessa"; b.codCat = codTrav(e2.L); }
      });
    });
    /* GUARDA-CORPO NR-18 18.12.15.2: superior no nó +2 (1,00 m) e intermediário no nó +1 (0,50 m); rodapé metálico de encaixe */
    var rodapes = [], seqR = 0;
    V.pisosK.forEach(function (k) {
      var nv = niveis[k];
      listaAr.forEach(function (e2) {
        if (!(e2.guarda || e2.guardaInt)) return;
        [[nv.idx + 2, "guarda"], [nv.idx + 1, "intermediaria"]].forEach(function (yy) {
          var b = addBarra(yy[1], P3(e2.a, yDoNo(V, yy[0])), P3(e2.b, yDoNo(V, yy[0])), e2.L, { nivel: k, linha: e2.papel === "int" ? "i" : "e", trecho: e2.ti, cabeceira: e2.papel === "cab" });
          if (b.papel === yy[1]) { b.cod = "travessa"; b.codCat = codTrav(e2.L); }
        });
        var rit = achar(S.rodape, "L", e2.L), alt = rit && rit.medidas.alt != null ? rit.medidas.alt : M.rodapeAlt;
        if (!rit) pend("Rodapé de " + brf(e2.L) + " m não existe no catálogo da linha " + L.id + ": confirmar com o locador.");
        if (M.pisoModo === "plataformas") pend("Rodapé do estribo: o M01 não dá a altura; adotados " + brf(alt) + " m (NR-18 18.9.4.2 c: mínimo 0,15 m) — confirmar com o locador.");
        rodapes.push({ id: "RD" + (++seqR), cod: "rodape", codCat: rit ? rit.cod : null, nivel: k, a: [r4(nos[e2.a].x), nv.yPiso, r4(nos[e2.a].z)], b: [r4(nos[e2.b].x), nv.yPiso, r4(nos[e2.b].z)], L: e2.L, alt: alt, esp: p.rodapeEsp, yTopo: r4(nv.yPiso + alt), cabeceira: e2.papel === "cab", trecho: e2.ti });
      });
    });

    /* M3.1 (A2, NR-18 18.12.15.1): TOPO COM TELA = levante completo. TRANSVERSAL interno–externo nos nós +1,00 e +2,00 m de CADA estação (o elo que o cálculo lê como apoio do
       poste externo) e longitudinal externa em +1,50 e +2,00 m (amarração da tela); o intermediário (+0,50) e o travessão (+1,00) já saem do guarda-corpo acima. Sem tela nada disto:
       o topo é o guarda-corpo, em balanço (ESPEC-M3.1 §3). Papéis reaproveitados (transversal/travessa) com `topo: true`: a lista de locação e o 3D os contam sem mudança. */
    if (p.tela) {
      /* M3.3 (A-N1): a aresta interno–externo da 1ª estação depois de um canto côncavo/convexo é também a aresta «longa» da célula do canto (nasceu antes, com tipo `long`): sem este teste ela ficava SEM a
         transversal de topo (+1,00 e +2,00 m) e, com o espigão rótula, o trecho do poste acima da última emenda virava mecanismo — o L, o U e o anel não fechavam no padrão. */
      var parEst = {}; estacoes.forEach(function (s3) { var a3 = res(s3.I), b3 = res(s3.O); parEst[a3 < b3 ? a3 + "|" + b3 : b3 + "|" + a3] = true; });
      listaAr.forEach(function (e2) {
        if (e2.tipo === "transv" || parEst[e2.a + "|" + e2.b]) {
          [idxTopo + 2, idxTopo + 4].forEach(function (ix) {
            var b = addBarra("transversal", P3(e2.a, yDoNo(V, ix)), P3(e2.b, yDoNo(V, ix)), e2.L, { nivel: nL, linha: "t", trecho: e2.ti, topo: true, idxNo: ix });
            if (b.papel === "transversal" && b.codCat == null) { b.cod = "travessa"; b.codCat = codTrav(e2.L); }
          });
        } else if (e2.tipo === "long" && e2.guarda && e2.papel === "ext") {
          [idxTopo + 3, idxTopo + 4].forEach(function (ix) {
            var b = addBarra("travessa", P3(e2.a, yDoNo(V, ix)), P3(e2.b, yDoNo(V, ix)), e2.L, { nivel: nL, linha: "e", trecho: e2.ti, topo: true, idxNo: ix });
            if (b.papel === "travessa" && b.codCat == null) { b.cod = "travessa"; b.codCat = codTrav(e2.L); }
          });
        }
      });
    }

    /* DIAGONAIS verticais: plano EXTERNO, uma torre a cada diagCada vãos começando no 1º, desde a base até o último piso, zigue-zague (M02 p.10 e p.21).
       ⚠ M1.2 (27/10): os lances de diagonal NÃO seguem os níveis de piso. A diagonal da roseta só existe para 2,00 m (4 nós) e o 1º levante
       costuma ser curto (ex.: 1,50 m do nó da base ao 1º piso) — preso aos pisos, o trecho de baixo ficava SEM contraventamento. Agora os lances
       sobem da 1ª roseta de 2,00 em 2,00 m (nó a nó) e, se sobrar, o último lance encosta no topo (sobrepõe o anterior): nenhum trecho fica sem diagonal. */
    var nDiagV = 0, nDiagT = 0, semDiag = {};
    var hDiag = 2.0, yD0 = niveis[0].y, yDT = niveis[nL].y, lances = [];
    for (var yq = yD0; yq + hDiag <= yDT + 1e-6; yq += hDiag) lances.push([r4(yq), r4(yq + hDiag)]);
    if (!lances.length) lances.push([r4(yD0), r4(yDT)]);
    else if (lances[lances.length - 1][1] < yDT - 1e-6) { lances.push([r4(yDT - hDiag), r4(yDT)]); lances.sobreposto = true; }
    /* sentido do lance: zigue-zague; o lance que SOBREPÕE o anterior vai no mesmo sentido dele (paralelas, sem se cruzar no mesmo plano) */
    function sobeL(l) { return lances.sobreposto && l === lances.length ? (l - 1) % 2 === 1 : l % 2 === 1; }
    function diagonal(papel, nA, yA, nB, yB, h, vao, ti2, nivel, extra) {
      var dc = diagCat(L, vao, h);
      if (!dc) { var kk = papel + "|" + brf(vao) + "|" + brf(h); if (!semDiag[kk]) { semDiag[kk] = 1; aviso("Sem diagonal no catálogo da linha " + L.id + " para vão de " + brf(vao) + " m e levante de " + brf(h) + " m — o plano fica sem contraventamento nesse levante."); pend("Diagonal ausente (vão " + brf(vao) + " m, levante " + brf(h) + " m): o catálogo da linha " + L.id + " não tem essa peça — o RT define o contraventamento."); } return null; }
      if (dc.estimada) pend("Diagonal do estribo (alt " + brf(h) + " × larg " + brf(vao) + "): a tabela do M01 p.3 não foi transcrita — comprimento geométrico " + brf(dc.L) + " m, sem código.");
      var b = addBarra(papel, P3(nA, yA), P3(nB, yB), dc.L, extra);
      b.cod = "diagonal"; b.codCat = dc.cod; b.estimada = dc.estimada; b.Lgeom = r3(hyp(hyp(nos[nB].x - nos[nA].x, nos[nB].z - nos[nA].z), yB - yA));
      if (papel === "diagonal") nDiagV++; else nDiagT++;
      return b;
    }
    trecho.forEach(function (T0) {
      T0.cells.forEach(function (c) {
        if (c.kind !== "vao" || c.v % Math.max(1, Math.round(p.diagCada)) !== 0) return;
        for (var l = 1; l <= lances.length; l++) {
          var yA = lances[l - 1][0], yB = lances[l - 1][1], h = r3(yB - yA), sobe = sobeL(l), oA = res(c.a.O), oB = res(c.b.O);
          diagonal("diagonal", sobe ? oA : oB, yA, sobe ? oB : oA, yB, h, c.L, T0.ti, l, { lance: l, trecho: T0.ti });
        }
      });
    });
    if (p.diagTransv) {
      var estDT = [];
      trecho.forEach(function (T0) {
        if (!T0.cells.length) return;
        if (T0.cadeiaIdx === 0 && !ring) estDT.push(T0.st[0]);
        if (T0.fimLivre) estDT.push(T0.st[T0.st.length - 1]);
        else if (T0.temCanto && T0.tipoCanto !== "livre") estDT.push(T0.st[T0.st.length - 1]);
      });
      estDT.forEach(function (st) {
        for (var l = 1; l <= lances.length; l++) {
          var yA = lances[l - 1][0], yB = lances[l - 1][1], sobe = sobeL(l);
          diagonal("diagonalTransv", sobe ? res(st.I) : res(st.O), yA, sobe ? res(st.O) : res(st.I), yB, r3(yB - yA), W, st.trecho, l, { lance: l, estacao: st.id });
        }
      });
    }

    /* ---------------- PISOS (um por faixa, comprimento = o vão), ALÇAPÃO no vão de acesso alternando o lado por nível, apoio da escada no nível 0 */
    var pranchas = [], seqP = 0, areaForrada = 0, cargaMin = null;
    var larguras = fx.larguras.slice(), wUtil = fx.util;
    function slotsDe(T0, c, k, yTopo, lista, extraComum) {
      var lat = T0.wI + (W - wUtil) / 2, m;
      lista.forEach(function (lg, mi) {
        var latC = lat + lg / 2, A0 = ptAt(T0, c.s0, latC), B0 = ptAt(T0, c.s1, latC), item = M.pisoModo === "n32" ? achar(S.piso, "L", c.L) : pecaPiso(L, lg, c.L);
        if (!item) { aviso("Piso de " + brf(lg) + " × " + brf(c.L) + " m não existe no catálogo da linha " + L.id + "."); }
        var pr = { id: "P" + (++seqP), tipo: "metalico", cod: "piso", codCat: item ? item.cod : null, nivel: k, trecho: T0.ti, celula: c.id, slot: mi, a: [r4(A0[0]), r4(yTopo - espPiso / 2), r4(A0[1])], b: [r4(B0[0]), r4(yTopo - espPiso / 2), r4(B0[1])], L: c.L, larg: lg, esp: espPiso, yTopo: r4(yTopo) };
        if (extraComum) Object.keys(extraComum).forEach(function (k2) { pr[k2] = extraComum[k2]; });
        pranchas.push(pr); areaForrada += c.L * lg;
        if (item && item.cargaKgfM2 != null) cargaMin = cargaMin == null ? item.cargaKgfM2 : Math.min(cargaMin, item.cargaKgfM2);
        lat += lg;
      });
    }
    cells.forEach(function (c) {
      var T0 = trecho[c.trecho];
      niveis.forEach(function (nv) {
        var acc = c.acesso && p.acesso === "alcapao";
        if (nv.k === 0) { if (acc) slotsDe(T0, c, 0, nv.y + p.offPiso, larguras, { apoioEscada: true }); return; }
        if (!nv.piso) return;
        if (!acc) { slotsDe(T0, c, nv.k, nv.yPiso, larguras); return; }
        var esc = nv.k % 2 === 1 ? "inicio" : "fim";
        if (M.alcapaoNaLargura) {
          var ai = S.pisoAlcapao[0], latA = T0.wI + (W - wUtil) / 2 + wUtil / 2, A1 = ptAt(T0, c.s0, latA), B1 = ptAt(T0, c.s1, latA);
          pranchas.push({ id: "P" + (++seqP), tipo: "alcapao", cod: "pisoAlcapao", codCat: ai.cod, nivel: nv.k, trecho: T0.ti, celula: c.id, slot: 0, a: [r4(A1[0]), r4(nv.yPiso - espPiso / 2), r4(A1[1])], b: [r4(B1[0]), r4(nv.yPiso - espPiso / 2), r4(B1[1])], L: c.L, larg: wUtil, esp: espPiso, yTopo: r4(nv.yPiso), escotilha: esc });
          areaForrada += c.L * wUtil;
        } else {
          var aiE = null; S.pisoAlcapao.forEach(function (q) { if (Math.abs(q.medidas.L - c.L) < 1e-6) aiE = q; });
          var wAlc = aiE ? aiE.medidas.larg : 0.60, latA2 = T0.wI + (W - wUtil) / 2 + wAlc / 2, A2 = ptAt(T0, c.s0, latA2), B2 = ptAt(T0, c.s1, latA2);
          if (!aiE) aviso("Plataforma com escada de " + brf(c.L) + " m não existe no catálogo do estribo.");
          pranchas.push({ id: "P" + (++seqP), tipo: "alcapao", cod: "pisoAlcapao", codCat: aiE ? aiE.cod : null, nivel: nv.k, trecho: T0.ti, celula: c.id, slot: 0, a: [r4(A2[0]), r4(nv.yPiso - espPiso / 2), r4(A2[1])], b: [r4(B2[0]), r4(nv.yPiso - espPiso / 2), r4(B2[1])], L: c.L, larg: wAlc, esp: espPiso, yTopo: r4(nv.yPiso), escotilha: esc });
          areaForrada += c.L * wAlc;
          var restoL = fx.larguras.slice(), acum2 = 0, kq2 = 0;
          while (kq2 < restoL.length && acum2 < wAlc - 1e-9) { acum2 += restoL[kq2]; kq2++; }
          var sobraL = restoL.slice(kq2);
          if (sobraL.length) { var T1 = T0; (function () { var lat2 = T1.wI + (W - wUtil) / 2 + wAlc; sobraL.forEach(function (lg, mi) { var latC2 = lat2 + lg / 2, A3 = ptAt(T1, c.s0, latC2), B3 = ptAt(T1, c.s1, latC2), it3 = pecaPiso(L, lg, c.L); pranchas.push({ id: "P" + (++seqP), tipo: "metalico", cod: "piso", codCat: it3 ? it3.cod : null, nivel: nv.k, trecho: T1.ti, celula: c.id, slot: mi + 1, a: [r4(A3[0]), r4(nv.yPiso - espPiso / 2), r4(A3[1])], b: [r4(B3[0]), r4(nv.yPiso - espPiso / 2), r4(B3[1])], L: c.L, larg: lg, esp: espPiso, yTopo: r4(nv.yPiso) }); areaForrada += c.L * lg; lat2 += lg; }); })(); }
        }
      });
    });
    if (p.acesso === "alcapao" && tAcc >= 0 && !cells.some(function (c) { return c.acesso; })) aviso("Não encontrei o vão de acesso do alçapão no trecho do acesso.");

    /* ---------------- BASES e CALÇOS (um por poste no chão) */
    var bases = [], calcos = [];
    var codBase = p.base === "articulada" ? "baseArticulada" : "baseRegulavel";
    postesL.forEach(function (q, iq) {
      var T0 = trecho[0], bq = { id: "BS" + (iq + 1), cod: codBase, codCat: (S[codBase] || S.baseRegulavel).cod, tipo: p.base, pos: [q.x, V.hCalco, q.z], y0: V.hCalco, h: V.hBase, rosca: V.hBase, poste: q.key, pecaBase: { cod: "pecaBase", codCat: S.pecaBase ? S.pecaBase.cod : null, h: V.hPB } };
      bases.push(bq);
      if (V.hCalco > 0) {
        /* o calço acompanha o trecho mais próximo do poste (distância ao segmento do trecho) */
        var uC = trecho[0].u, dMin = Infinity;
        trecho.forEach(function (T2) {
          var dx = q.x - T2.P[0], dz = q.z - T2.P[1], sp = Math.max(0, Math.min(T2.L, dx * T2.u[0] + dz * T2.u[1])), dd = hyp(dx - T2.u[0] * sp, dz - T2.u[1] * sp);
          if (dd < dMin - 1e-9) { dMin = dd; uC = T2.u; }
        });
        calcos.push({ id: "CL" + (iq + 1), cod: "calco", pos: [q.x, V.hCalco / 2, q.z], L: 0.5, larg: 0.30, esp: V.hCalco, u: [uC[0], uC[1]], base: bq.id });
      }
      addCon("base", [q.x, V.hCalco + V.hBase / 2, q.z], [q.barras[0].id, bq.id]);
    });

    /* ---------------- ANCORAGENS: nos postes INTERNOS. M3.1 (A3): a fiada SÓ cai em nó com transversal e longitudinal nas duas linhas = os NÍVEIS (e o nó +2,00 m do topo, que ganha transversal
       com tela): nunca no meio do levante. 1ª fiada no 1º nível com cota ≥ 2,0 m; a malha vertical efetiva é um MÚLTIPLO do levante (o maior nível que não passa de ancV acima do anterior;
       se ancV < levante, anda de levante em levante); o último nível (topo) é sempre uma fiada. Horizontal: ancH, da estação mais distante que cabe. (M7) pontas e cantos em toda fiada. */
    var anc = [], nAbrac = 0, nGanchoC = 0, nGanchoL = 0, nTuboAnc = 0;
    if (p.ancoragem !== "nenhuma") {
      var linhasI = {}, kPrim = null, kq3;
      for (kq3 = 1; kq3 <= nL; kq3++) if (niveis[kq3].y >= 2.0 - 1e-9) { kPrim = kq3; break; }
      if (kPrim != null) {
        var kcur = kPrim; linhasI[niveis[kcur].idx] = true;
        while (kcur < nL) { var kprox = kcur + 1; for (kq3 = kcur + 1; kq3 <= nL; kq3++) if (niveis[kq3].y <= niveis[kcur].y + p.ancV + 1e-9) kprox = kq3; linhasI[niveis[kprox].idx] = true; kcur = kprox; }
      }
      linhasI[idxTopo] = true;
      if (comAncTopo) linhasI[idxAncTopo] = true;
      var ks = Object.keys(linhasI).map(Number).sort(function (a, b) { return a - b; }), feito = {};
      var estAnc = estacoes.slice();
      estAnc.sort(function (a, b) { return a.cum - b.cum; });
      var poeAnc = function (best, idxA) {
        var qI = poste(best.I), kfe = qI.key + "|" + idxA + "|" + best.trecho;   /* um poste de CANTO é interno de dois trechos: o gancho de cada trecho é perpendicular ao SEU trecho (um por direção) */
        if (feito[kfe] || qI.topIdx < idxA) return;
        feito[kfe] = true;
        var T4 = trecho[best.trecho], yA = yDoNo(V, idxA), aff = T4.wI, hook;
        if (M.ganchos && aff <= 0.20 + 1e-9) hook = { cod: "ganchoCurto", item: S.ganchoCurto, L: S.ganchoCurto.medidas.L };
        else if (M.ganchos && aff <= 0.45 + 1e-9) hook = { cod: "ganchoLongo", item: S.ganchoLongo, L: S.ganchoLongo.medidas.L };
        else hook = { cod: "tubo", item: S.tubo ? achar(S.tubo, "L", 1.0) : null, L: 1.0 };
        var Pq = P3(qI.no, yA), Bq = [Pq[0] - T4.ns[0] * hook.L, yA, Pq[2] - T4.ns[1] * hook.L];
        var bt = addBarra("ancoragem", Pq, Bq, hook.L, { nivel: null, idx: idxA, estacao: best.id, trecho: T4.ti });
        bt.cod = hook.cod; bt.codCat = hook.item ? hook.item.cod : null;
        addCon("ancoragem", Pq, [bt.id, qI.barras[0].id]);
        var nab = hook.cod === "tubo" ? 2 : 1; nAbrac += nab;
        if (hook.cod === "ganchoCurto") nGanchoC++; else if (hook.cod === "ganchoLongo") nGanchoL++; else nTuboAnc++;
        var nvAnc = 0; for (var qq = 0; qq < niveis.length; qq++) if (niveis[qq].idx <= idxA) nvAnc = qq;
        anc.push({ id: "AN" + (anc.length + 1), barra: bt.id, estacao: best.id, trecho: T4.ti, nivel: nvAnc, idx: idxA, y: yA, topo: idxA > idxTopo, poste: qI.key, gancho: hook.cod, hook: hook.cod, abracadeiras: nab,
          olhal: { tipo: "olhal", carga: null, cod: "olhal", pos: [r4(Pq[0] - T4.ns[0] * aff), yA, r4(Pq[2] - T4.ns[1] * aff)] } });
      };
      /* cada fiada anda de estação em estação pegando a MAIS DISTANTE que ainda cabe em ancH (o espaçamento nunca passa de ancH, NBR 6494 4.5.2); a fiada ímpar começa deslocada de ancH/2.
         M3.3 (A-N1, revisão nº 2): a caminhada é feita POR TRECHO, contando a cota acumulada DENTRO do próprio trecho (s − s da 1ª estação), e não pela cota global `cum`. Com `cum` a 1ª estação do
         trecho seguinte (s < 0 depois de um canto) entrava na caminhada do trecho anterior, a estação regular vizinha ao canto ficava sem gancho do PRÓPRIO trecho (o gancho do outro trecho não é
         apoio do vento ⟂ a este — D-M31.5) e, com a cunha rótula (padrão), virava mecanismo: o L, o U e o anel só fechavam num sentido de traçado. */
      var estPorT = {}; estAnc.forEach(function (st2) { (estPorT[st2.trecho] = estPorT[st2.trecho] || []).push(st2); });
      Object.keys(estPorT).forEach(function (tk) { estPorT[tk].sort(function (a, b) { return a.s - b.s; }); });
      ks.forEach(function (idxA, r) {
        var deslocar = (r % 2) * p.ancH / 2;
        if (LEGADO.ancPorCum) {   /* SÓ TESTE: o código ANTIGO (até a M3.2): caminhada pela cota acumulada GLOBAL `cum`, misturando os trechos (A-N1 da revisão nº 2) */
          var ultimoC = estAnc.length ? estAnc[estAnc.length - 1].cum : 0, atualC = null, passosC = 0;
          while (estAnc.length && passosC++ < 2000) {
            var bestC = null, kC;
            if (atualC == null) { for (kC = 0; kC < estAnc.length; kC++) if (estAnc[kC].cum <= deslocar + 1e-9) bestC = estAnc[kC]; if (bestC == null) bestC = estAnc[0]; }
            else { for (kC = 0; kC < estAnc.length; kC++) if (estAnc[kC].cum <= atualC.cum + p.ancH + 1e-9) bestC = estAnc[kC]; if (bestC === atualC) bestC = estAnc[estAnc.indexOf(atualC) + 1] || null; }
            if (bestC == null) break;
            atualC = bestC; poeAnc(bestC, idxA);
            if (atualC.cum >= ultimoC - 1e-9) break;
          }
          estAnc.forEach(function (st2) { if (st2.forca) poeAnc(st2, idxA); });
          return;
        }
        Object.keys(estPorT).forEach(function (tk) {
          var lst = estPorT[tk], s0 = lst[0].s, ultimo = lst[lst.length - 1].s - s0, atual = null, passos = 0;
          while (lst.length && passos++ < 2000) {
            var best = null, k3;
            if (atual == null) { for (k3 = 0; k3 < lst.length; k3++) if (lst[k3].s - s0 <= deslocar + 1e-9) best = lst[k3]; if (best == null) best = lst[0]; }
            else { for (k3 = 0; k3 < lst.length; k3++) if (lst[k3].s - s0 <= atual.s - s0 + p.ancH + 1e-9) best = lst[k3]; if (best === atual) best = lst[lst.indexOf(atual) + 1] || null; }
            if (best == null) break;
            atual = best;
            poeAnc(best, idxA);
            if (atual.s - s0 >= ultimo - 1e-9) break;
          }
        });
        estAnc.forEach(function (st2) { if (st2.forca) poeAnc(st2, idxA); });   /* M7: pontas e cantos em toda fiada */
      });
      if (nTuboAnc && M.ganchos) aviso("Afastamento acima de 0,45 m em " + nTuboAnc + " ancoragem(ns): usei tubo de 1,00 m + 2 abraçadeiras fixas no lugar do gancho (conferir com o locador).");
      if (!M.ganchos && nTuboAnc) pend("Ancoragem do estribo: o M01 não traz gancho — usado tubo de 1,00 m + 2 abraçadeiras fixas + olhal + chumbador (olhal e chumbador do M02).");
    } else if (closed) aviso("Anel fechado sem ancoragem: o responsável técnico confirma a estabilidade.");
    /* NR-18 18.12.3: torre sem ancoragem, altura ≤ 4 × a menor dimensão da base */
    if (p.ancoragem === "nenhuma" && !closed && nT === 1) {
      var Lpl = trecho[0].st[trecho[0].st.length - 1].s - trecho[0].st[0].s, menor = Math.min(Lpl, W);
      if (V.alturaPiso > 4 * menor + 1e-9) return { ok: false, erro: "Torre sem ancoragem: a altura do piso (" + brf(V.alturaPiso) + " m) passa de 4 vezes a menor dimensão da base (" + brf(menor) + " m → máximo " + brf(4 * menor) + " m) — NR-18 18.12.3. Ancore à estrutura ou alargue a base.", avisos: avisos };
    }

    /* ---------------- ACESSO */
    var acessos = [];
    var cAcc = null; cells.forEach(function (c) { if (c.acesso) cAcc = c; });
    if ((p.acesso === "alcapao" || p.acesso === "escada") && cAcc) {
      var TA = trecho[cAcc.trecho], sMid = (cAcc.s0 + cAcc.s1) / 2;
      for (var kA = 1; kA <= nL; kA++) {
        var yIni = kA === 1 ? 0 : (niveis[kA - 1].piso ? niveis[kA - 1].yPiso : niveis[kA - 1].y), nvA = niveis[kA];
        if (p.acesso === "alcapao") {
          var C0 = ptAt(TA, sMid, TA.wI + W / 2);
          acessos.push({ id: "AC" + kA, tipo: "escada", cod: "escadaIncorporada", incorporada: true, nivel: kA, trecho: TA.ti, externa: false, larg: 0.60, L: r4(nvA.yPiso - yIni), a: [r4(C0[0]), r4(yIni), r4(C0[1])], b: [r4(C0[0]), r4(nvA.yPiso), r4(C0[1])], u: [TA.u[0], TA.u[1]] });
        } else {
          var C1 = ptAt(TA, sMid, TA.wE + 0.25), yFim = nvA.yPiso + 1.0;
          acessos.push({ id: "AC" + kA, tipo: "escada", cod: "escadaExterna", incorporada: false, nivel: kA, trecho: TA.ti, externa: true, larg: 0.40, L: r4(yFim - yIni), nPecas: Math.ceil((yFim - yIni) / S.escadaExterna.medidas.L - 1e-9), a: [r4(C1[0]), r4(yIni), r4(C1[1])], b: [r4(C1[0]), r4(yFim), r4(C1[1])], u: [TA.u[0], TA.u[1]] });
        }
      }
    }
    if (p.acesso === "escada" && !cAcc) {   /* escada externa: o vão (regular) mais próximo da posição do acesso ao longo do caminho */
      var posEsc = Math.max(0, Math.min(1, num(p.acessoPos, 0))) * Ltotal, Tx = trecho[0], c1 = null, dBest = Infinity;
      cells.forEach(function (cq) { if (cq.kind !== "vao") return; var T6 = trecho[cq.trecho], dq = Math.abs(T6.cumIni + (cq.s0 + cq.s1) / 2 - posEsc); if (dq < dBest - 1e-9) { dBest = dq; c1 = cq; Tx = T6; } });
      if (c1) { var sM = (c1.s0 + c1.s1) / 2; for (var kB = 1; kB <= nL; kB++) { var yI2 = kB === 1 ? 0 : niveis[kB - 1].y, C2 = ptAt(Tx, sM, Tx.wE + 0.25), yF2 = niveis[kB].yPiso + 1.0; acessos.push({ id: "AC" + kB, tipo: "escada", cod: "escadaExterna", incorporada: false, nivel: kB, trecho: Tx.ti, externa: true, larg: 0.40, L: r4(yF2 - yI2), nPecas: Math.ceil((yF2 - yI2) / S.escadaExterna.medidas.L - 1e-9), a: [r4(C2[0]), r4(yI2), r4(C2[1])], b: [r4(C2[0]), r4(yF2), r4(C2[1])], u: [Tx.u[0], Tx.u[1]] }); } }
    }

    /* ---------------- TELA: face externa do 1º piso até 2,00 m acima do último (NR-18 18.12.15.1) */
    var perimE = 0; listaAr.forEach(function (e2) { if (e2.cont === 1 && (e2.papel === "ext" || e2.papel === "cabCanto")) perimE += e2.L; });
    var topoPiso = niveis[nL].yPiso, altTela = (topoPiso - niveis[V.pisosK[0]].yPiso) + 2.0, tela = { area: p.tela ? r3(perimE * altTela) : 0, perimetro: r3(perimE), altura: r3(altTela) };

    /* ---------------- CONEXÕES: cunha em cada ponta de travessa/diagonal no nó (parte da travessa, não é item de locação) */
    var nCunha = 0;
    barras.forEach(function (b) {
      if (b.papel === "poste" || b.papel === "ancoragem") return;
      addCon("cunha", b.a, [b.id]); addCon("cunha", b.b, [b.id]); nCunha += 2;
    });
    var nCon = { cunha: nCunha, espigao: nEmendas, pinoTrava: M.emenda === "pinoTrava" ? nEmendas : 0, espiga: M.emenda === "espiga" ? nEmendas : 0, abracFixa: nAbrac, olhal: anc.length, chumbador: anc.length, ancoragem: anc.length, base: bases.length };

    /* ---------------- PESOS: ver pecasLocacao (mesma conta). Total só existe se TODA peça estrutural tem peso de fonte */
    var modelo = { ok: true, sistema: "multidirecional", linha: p.linha, par: p, avisos: avisos, pendencias: pendencias, niveis: niveis,
      estacoes: estacoes.map(function (s4) { var T5 = trecho[s4.trecho]; return { id: s4.id, trecho: s4.trecho, k: null, s: r3(s4.s), pi: [r4(nos[res(s4.I)].x), r4(nos[res(s4.I)].z)], pe: [r4(nos[res(s4.O)].x), r4(nos[res(s4.O)].z)], outerOnly: false, cum: r3(s4.cum), I: res(s4.I), O: res(s4.O) }; }),
      postes: postesL.map(function (q) { return { id: q.id, key: q.key, x: q.x, z: q.z, inner: q.inner, outer: q.outer, interno: !!q.interno, externo: !!q.externo, cab: q.cab, topIdx: q.topIdx, pecas: q.pecas }; }),
      trechos: trecho.map(function (t) { return { ti: t.ti, L: r3(t.L), nb: t.seq.length, u: t.u, ns: t.ns, wI: r4(t.wI), wE: r4(t.wE), sS: r3(t.sS), vaos: t.seq.slice(), tipoCanto: t.tipoCanto || null }; }),
      vaos: cells.filter(function (c) { return c.kind === "vao"; }).map(function (c) { return { idx: c.id, trecho: c.trecho, v: c.v, s0: r3(c.s0), s1: r3(c.s1), L: c.L, acesso: c.acesso }; }),
      celulas: cells.map(function (c) { return { id: c.id, trecho: c.trecho, kind: c.kind, s0: r3(c.s0), s1: r3(c.s1), L: c.L, acesso: c.acesso, nos: [res(c.a.I), res(c.b.I), res(c.b.O), res(c.a.O)] }; }),
      barras: barras, conexoes: conexoes, pranchas: pranchas, rodapes: rodapes, bases: bases, calcos: calcos, ancoragens: anc, acessos: acessos, tela: tela,
      yOffCalco: 0, faceAte: faceAteN, violacoes: [], tubo: { cat: p.tubo, D: 0.0483, Dmm: CATALOGO_MULTI.tubo.Dmm, rotulo: "Tubo Ø48,3 × 3,0 mm" } };
    var nPostesBar = postesL.length, nTrav = 0; barras.forEach(function (b) { if (b.papel === "travessa" || b.papel === "transversal") nTrav++; });
    var nPisosM = 0, nAlc = 0; pranchas.forEach(function (x) { if (x.tipo === "metalico") nPisosM++; else nAlc++; });
    var medidas = { nVaos: vaosN, nLevantes: nL, alturaPiso: V.alturaPiso, alturaPisoPedida: V.alturaPedida, regulagemBase: V.hBase, guardaReal: r3(2 * passo - p.offPiso), nPostes: nPostesBar, nTravessas: nTrav, nDiagonais: nDiagV + nDiagT, nDiagonaisVert: nDiagV, nDiagonaisTransv: nDiagT,
      nPisos: nPisosM, nAlcapoes: nAlc, nRodapes: rodapes.length, nBases: bases.length, nAncoragens: anc.length, nConexoes: nCon, nConexoesTotal: conexoes.length, nEmendas: nEmendas, y0: V.y0, hCalco: V.hCalco, hPecaBase: V.hPB,
      largura: W, larguraUtil: wUtil, nPisosLargura: larguras.length, comprimento: r3(Ltotal), areaForrada: r3(areaForrada), cargaPisoMinKgfM2: cargaMin, metrosTubo: 0, nTubos: barras.length, fechado: closed, nMetrosBarras: 0 };
    var mt = 0; barras.forEach(function (b) { mt += b.L; }); medidas.nMetrosBarras = r3(mt);
    modelo.medidas = medidas;
    modelo.vertical = { y0: V.y0, hBase: V.hBase, idxTopo: idxTopo, passo: passo, exato: V.exato };
    /* peso: a mesma agregação da lista de locação */
    var loc = pecasLocacao(modelo), estrut = ["poste", "travessa", "diagonal", "piso", "pisoAlcapao"], falta = [], pt = 0, parcial = 0, algum = false;
    loc.forEach(function (r) {
      if (r.pesoTotal != null) { parcial += r.pesoTotal; algum = true; }
      else if (r.cod !== "tela" && estrut.indexOf(r.cod) >= 0) falta.push(r.peca);
    });
    loc.forEach(function (r) { if (r.pesoTotal == null && r.cod !== "tela") aviso("Peso de " + r.peca.toLowerCase() + " sem fonte: não somado."); });
    medidas.pesoParcial = r3(parcial);
    if (!falta.length && algum) medidas.pesoTotal = r3(parcial);
    else { medidas.pesoTotal = null; aviso("Peso total não calculado: a linha " + L.id + " tem peças estruturais sem peso na fonte (" + (falta.length ? falta.filter(function (x, i2) { return falta.indexOf(x) === i2; }).join(", ") : "nenhuma pesada") + ") — a lista sai «sem peso de fonte»."); }
    modelo.parametrosRT = ["afastamento", "vaoMax", "levanteMax", "diagCada", "ancH", "ancV", "regulagemMax", "larguraModulo", "offPiso", "passoNo", "hPecaBase", "espPisoMetal"].map(function (k2) {
      var R = PARAMETROS_RT[k2], v = k2 === "passoNo" ? passo : (k2 === "hPecaBase" ? V.hPB : (k2 === "espPisoMetal" ? espPiso : p[k2]));
      return { chave: k2, valor: v, fonteId: R.fonteId, obs: R.obs };
    });
    modelo.avisos = avisos; modelo.pendencias = pendencias;
    return modelo;
  }

  /* ================================================================ LISTA DE LOCAÇÃO
   * Mesmas colunas do tubo-roll. Ordem: postes (maior → menor), travessas, diagonais, pisos, piso com alçapão, rodapés, peça base, base regulável,
   * calço, pino trava / espiga, gancho de ancoragem, abraçadeira fixa, parafuso olhal, chumbador, escada, tela. Peso unitário da fonte (null = sem peso). */
  var COLUNAS_LOCACAO = ["ITEM", "QNT", "PEÇA", "DIMENSÕES", "COMP. (m)", "ÁREA (m²)", "PESO UNIT", "PESO TOTAL"];
  function pecasLocacao(modelo) {
    if (!modelo || !modelo.ok) return [];
    var L = linhaDe(modelo.linha || (modelo.par && modelo.par.linha)); if (!L) return [];
    var S = L.pecas, M = L.motor, out = [], P = modelo.par || {};
    function linha(cod, item, peca, dimensoes, qtd, comp, area, pesoUnit, extra) {
      var o = { item: out.length + 1, cod: cod, peca: peca, dimensoes: dimensoes || "", nomeLocacao: peca + (dimensoes ? " " + dimensoes : ""), descricao: item ? item.descricao : "", un: item ? item.un : "pç",
        qtd: qtd, qnt: qtd, comp: comp == null ? null : comp, area: area == null ? null : r3(area * qtd), pesoUnit: pesoUnit == null ? null : pesoUnit, pesoTotal: pesoUnit == null ? null : r3(pesoUnit * qtd),
        fonte: fonteTxt(item), confirmarRT: item ? !!item.confirmarRT : true, refCatalogo: item ? item.cod : null, linhaCatalogo: L.id };
      if (comp != null) o.L = comp;
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      out.push(o); return o;
    }
    function agrupa(lista, filtro, chave) {
      var m = {}, ordem = [];
      lista.forEach(function (x) { if (filtro && !filtro(x)) return; var k = chave(x); if (!m[k]) { m[k] = { k: k, q: 0, x: x }; ordem.push(k); } m[k].q++; });
      return ordem.map(function (k) { return m[k]; });
    }
    /* postes */
    agrupa(modelo.barras, function (b) { return b.papel === "poste"; }, function (b) { return b.L.toFixed(2); }).sort(function (a, b) { return b.x.L - a.x.L; }).forEach(function (g) {
      var it = achar(S.poste, "L", g.x.L); linha("poste", it, "Poste", brf(g.x.L, 2) + " m", g.q, g.x.L, Math.PI * 0.0483 * g.x.L, it ? it.pesoKg : null);
    });
    /* travessas (longitudinais + transversais: a mesma peça) */
    /* ⚠ M4 (27/10, achado na frente B): o travessão e o intermediário do guarda-corpo SÃO travessas da linha (mesma peça de catálogo, encaixe na roseta) — antes ficavam fora da lista (90 peças a menos no 10 × 6 m: o pedido à locadora saía curto e o peso total, baixo) */
    agrupa(modelo.barras, function (b) { return b.papel === "travessa" || b.papel === "transversal" || b.papel === "guarda" || b.papel === "intermediaria"; }, function (b) { return b.L.toFixed(2); }).sort(function (a, b) { return b.x.L - a.x.L; }).forEach(function (g) {
      var it = achar(S.travessa, "vao", g.x.L); linha("travessa", it, "Travessa", brf(g.x.L, 2) + " m", g.q, g.x.L, null, it ? it.pesoKg : null);
    });
    /* diagonais */
    agrupa(modelo.barras, function (b) { return b.papel === "diagonal" || b.papel === "diagonalTransv"; }, function (b) { return b.L.toFixed(2) + "|" + (b.codCat || "-"); }).sort(function (a, b) { return b.x.L - a.x.L; }).forEach(function (g) {
      var it = null; S.diagonal.forEach(function (q) { if (Math.abs(q.medidas.L - g.x.L) < 1e-6 && q.cod === g.x.codCat) it = q; });
      linha("diagonal", it, "Diagonal", brf(g.x.L, 2) + " m", g.q, g.x.L, null, it ? it.pesoKg : null, it ? null : { descricao: "Diagonal sem item de catálogo (tabela M01 p.3 não transcrita): comprimento geométrico.", fonte: "SEM ITEM DE CATÁLOGO" });
    });
    /* pisos */
    agrupa(modelo.pranchas, function (x) { return x.tipo === "metalico"; }, function (x) { return x.larg.toFixed(2) + "|" + x.L.toFixed(2); }).sort(function (a, b) { return b.x.L - a.x.L || b.x.larg - a.x.larg; }).forEach(function (g) {
      var it = M.pisoModo === "n32" ? achar(S.piso, "L", g.x.L) : pecaPiso(L, g.x.larg, g.x.L);
      linha("piso", it, M.pisoModo === "n32" ? "Piso metálico" : "Plataforma", brf(g.x.larg, 2) + " × " + brf(g.x.L, 2) + " m", g.q, g.x.L, g.x.larg * g.x.L, it ? it.pesoKg : null);
    });
    agrupa(modelo.pranchas, function (x) { return x.tipo === "alcapao"; }, function (x) { return x.L.toFixed(2); }).sort(function (a, b) { return b.x.L - a.x.L; }).forEach(function (g) {
      var it = M.alcapaoNaLargura ? S.pisoAlcapao[0] : null; if (!M.alcapaoNaLargura) S.pisoAlcapao.forEach(function (q) { if (Math.abs(q.medidas.L - g.x.L) < 1e-6) it = q; });
      linha("pisoAlcapao", it, M.alcapaoNaLargura ? "Piso com alçapão e escada" : "Plataforma com escada", brf(g.x.larg, 2) + " × " + brf(g.x.L, 2) + " m", g.q, g.x.L, g.x.larg * g.x.L, it ? it.pesoKg : null);
    });
    /* rodapés */
    agrupa(modelo.rodapes, null, function (x) { return x.L.toFixed(2) + "|" + x.alt.toFixed(2); }).sort(function (a, b) { return b.x.L - a.x.L; }).forEach(function (g) {
      var it = achar(S.rodape, "L", g.x.L); linha("rodape", it, "Rodapé metálico", brf(g.x.alt, 2) + " × " + brf(g.x.L, 2) + " m", g.q, g.x.L, g.x.alt * g.x.L, it ? it.pesoKg : null);
    });
    var nb = modelo.bases.length;
    if (nb && S.pecaBase) linha("pecaBase", S.pecaBase, "Peça base", "", nb, null, null, S.pecaBase.pesoKg);
    var cods = {}; modelo.bases.forEach(function (b) { cods[b.cod] = (cods[b.cod] || 0) + 1; });
    Object.keys(cods).forEach(function (cod) { var it = S[cod] || S.baseRegulavel; linha(cod, it, it.nomeLocacao, "", cods[cod], null, null, it.pesoKg); });
    if (modelo.calcos.length) linha("calco", S.calco, "Calço", "0,30 × 0,038 × 0,50 m", modelo.calcos.length, 0.5, null, S.calco.pesoPorM != null ? r3(S.calco.pesoPorM * 0.5) : null);
    var nc = modelo.medidas.nConexoes;
    if (nc.espigao) linha("emenda", S.emenda, S.emenda.nomeLocacao, "", nc.espigao, null, null, S.emenda.pesoKg);
    if (modelo.ancoragens.length) {
      var gC = 0, gL = 0, tb = 0; modelo.ancoragens.forEach(function (a) { if (a.gancho === "ganchoCurto") gC++; else if (a.gancho === "ganchoLongo") gL++; else tb++; });
      if (gC) linha("ganchoCurto", S.ganchoCurto, "Gancho de ancoragem", "0,25 m", gC, 0.25, null, S.ganchoCurto.pesoKg);
      if (gL) linha("ganchoLongo", S.ganchoLongo, "Gancho de ancoragem", "0,50 m", gL, 0.50, null, S.ganchoLongo.pesoKg);
      var itTubo = S.tubo ? achar(S.tubo, "L", 1.0) : null;
      if (tb) linha("tuboAnc", itTubo, "Tubo de amarração", "Ø48,3 × 3,0 mm, 1,00 m", tb, 1.0, null, null, { descricao: "Tubo de amarração (ancoragem com afastamento acima de 0,45 m ou linha sem gancho).", fonte: itTubo ? fonteTxt(itTubo) : "M02" });
      if (nc.abracFixa) linha("abracFixa", S.abracFixa, "Abraçadeira fixa", "", nc.abracFixa, null, null, S.abracFixa.pesoKg);
      linha("olhal", S.olhal, "Parafuso olhal", "", modelo.ancoragens.length, null, null, S.olhal.pesoKg);
      linha("chumbador", S.chumbador, "Chumbador mecânico", "", modelo.ancoragens.length, null, null, S.chumbador.pesoKg);
    }
    var esc = modelo.acessos.filter(function (a) { return !a.incorporada; });
    if (esc.length) { var nEsc = 0; esc.forEach(function (a) { nEsc += a.nPecas || 1; }); linha("escadaExterna", S.escadaExterna, "Escada de acesso", "Ø48 × 2,00 m", nEsc, 2.0, null, S.escadaExterna.pesoKg); }
    if (modelo.tela && modelo.tela.area > 0) linha("tela", S.tela, "Tela de proteção", "(m²)", modelo.tela.area, null, null, null, { area: modelo.tela.area, qtd: modelo.tela.area, qnt: modelo.tela.area });
    return out;
  }
  function tabelaLocacao(modelo) {
    var l = pecasLocacao(modelo), pt = 0, ar = 0, qt = 0;
    var linhas = l.map(function (r) {
      if (r.pesoTotal != null) pt += r.pesoTotal; if (r.area != null) ar += r.area; qt += r.cod === "tela" ? 0 : r.qtd;
      var o = {}; o["ITEM"] = r.item; o["QNT"] = r.qtd; o["PEÇA"] = r.peca; o["DIMENSÕES"] = (r.dimensoes || "") + (r.refCatalogo ? (r.dimensoes ? " " : "") + "(ref. " + r.refCatalogo + ")" : ""); o["COMP. (m)"] = r.comp; o["ÁREA (m²)"] = r.area; o["PESO UNIT"] = r.pesoUnit; o["PESO TOTAL"] = r.pesoTotal; return o;
    });
    var sem = l.some(function (r) { return r.pesoTotal == null; });
    return { colunas: COLUNAS_LOCACAO.slice(), linhas: linhas, total: { qtd: qt, area: r3(ar), pesoTotal: modelo && modelo.medidas && modelo.medidas.pesoTotal == null ? null : r3(pt) }, avisoPeso: sem ? "Linhas sem peso de fonte não entram no total." : "" };
  }

  /* ================================================================ 3D PROVISÓRIO (até as famílias do M2)
   * Postes, travessas, diagonais, guarda-corpo, ganchos: K.barra com o tubo HSS48.3X3.0. Roseta: disco provisório Ø~0,12 × 0,009 em cada nó usado.
   * Pisos e rodapés: K.chapa com a massa do catálogo. Bases e escada: famílias ra-andaime-* já existentes (as do tubo-roll). Tudo leva caixa.andaime. */
  var NOME_PAPEL = { poste: "Poste do andaime multidirecional", travessa: "Travessa do andaime multidirecional", transversal: "Travessa transversal do andaime multidirecional", diagonal: "Diagonal do andaime multidirecional",
    diagonalTransv: "Diagonal transversal do andaime multidirecional", guarda: "Guarda-corpo do andaime multidirecional (travessão)", intermediaria: "Guarda-corpo do andaime multidirecional (intermediário)", ancoragem: "Ancoragem do andaime multidirecional" };
  var TETO_ROSETAS = 1500, TETO_CONEXOES_FAM = 6000, TETO_PECAS_FAM = 20000;
  function FAnd() { var Fa = dep("FamiliasAndaime", "./familiasandaime.js"); return Fa && Fa.cota ? Fa : null; }
  function FAndM() { var Fm = dep("FamiliasAndaimeM", "./familiasandaimem.js"); return Fm && Fm.r0 && Fm.IDS && Fm.IDS.length === 13 ? Fm : null; }
  function gerar(p, K, novoId, ctx, H) {
    var mod = montar(p);
    if (!mod.ok) return { erro: mod.erro };
    /* M2: as famílias ra-andaime-m-* (js/familiasandaimem.js) desenham o modelo; o 3D provisório do M1 (K.barra / K.chapa) continua como caminho
       quando as famílias não carregaram, quando o pedido traz familias3d: false, ou quando o modelo passa de TETO_PECAS_FAM peças. */
    var FM = (p.familias3d === false || p.familias3d === "false" || !mod.calcos.length) ? null : FAndM();   /* sem calço (calco: false) não há caixa para carregar a identidade do conjunto: volta ao provisório (DUVIDAS-M2 D5) */
    if (FM) {
      var nPc = mod.barras.length + mod.pranchas.length + mod.rodapes.length + 2 * mod.bases.length;
      if (nPc <= TETO_PECAS_FAM) return gerarFamilias(p, mod, K, novoId, FM);
      K.avisos.push("Mais de " + TETO_PECAS_FAM + " peças (" + nPc + "): desenhei o modelo com o 3D provisório (sem as famílias de detalhe) — a lista de locação é a mesma.");
    }
    else if (!(p.familias3d === false || p.familias3d === "false") && !mod.calcos.length && FAndM()) K.avisos.push("Sem calço (calco: false): desenhei o modelo com o 3D provisório — o conjunto «Peça pronta» precisa de uma caixa para guardar a identidade e o calço de madeira é a única do multidirecional com famílias (DUVIDAS-M2 D5).");
    var L = linhaDe(mod.linha), S = L.pecas, F = K.F, yOff = mod.yOffCalco, FA = FAnd();
    function famOp(famId, tipoId, Pw, rotY, inst, peca, cod, massa) {
      var ii = {}; Object.keys(inst || {}).forEach(function (kk) { ii[kk] = inst[kk]; });
      ii.andaime = { peca: peca, cod: cod }; if (massa > 0) ii.Massa_kg = massa;
      K.ops.push({ op: "familia", id: String(novoId()), famId: famId, tipoId: tipoId, x: r4(Pw[0]), y: r4(Pw[1]), z: r4(Pw[2]), rotY: r4(rotY), inst: ii });
    }
    mod.avisos.forEach(function (a) { K.avisos.push(a); });
    var n0 = K.pecas.length;
    function marca(cx, peca, cod) { if (cx) cx.andaime = { peca: peca, cod: cod }; return cx; }
    function massaDe(it, extraKg) { return it && it.pesoKg != null ? it.pesoKg : (extraKg || 0); }
    var pcDe = { poste: function (b) { return achar(S.poste, "L", b.L); }, travessa: function (b) { return achar(S.travessa, "vao", b.L); }, transversal: function (b) { return achar(S.travessa, "vao", b.L); }, guarda: function (b) { return achar(S.travessa, "vao", b.L); }, intermediaria: function (b) { return achar(S.travessa, "vao", b.L); } };
    /* tubos (postes, travessas, diagonais, guarda-corpo, ganchos) */
    mod.barras.forEach(function (b) {
      var nm = (NOME_PAPEL[b.papel] || "Tubo do andaime multidirecional");
      var cx = K.barra([b.a[0], b.a[1] + yOff, b.a[2]], [b.b[0], b.b[1] + yOff, b.b[2]], { cat: p.tubo || CATALOGO_MULTI.tubo.cat, papel: nm, nome: nm + " " + b.id + " — " + brf(b.L, 2) + " m" + (b.codCat ? " (" + b.codCat + ")" : ""), ifc: "IFCMEMBER", aco: p.aco }, "tubos");
      if (cx) { marca(cx, b.papel, b.codCat || b.cod); var it = pcDe[b.papel] ? pcDe[b.papel](b) : null; if (b.papel === "diagonal" || b.papel === "diagonalTransv") { S.diagonal.forEach(function (q) { if (q.cod === b.codCat && q.cod) it = q; }); } cx.massa = massaDe(it, 0); }
    });
    /* roseta: disco provisório em cada nó usado por travessa/diagonal (só se conexoes3d e abaixo do teto) */
    var nosUsados = {}, listaNos = [];
    mod.barras.forEach(function (b) { if (b.papel === "poste" || b.papel === "ancoragem") return; [b.a, b.b].forEach(function (q) { var k = r3(q[0]) + "|" + r3(q[1]) + "|" + r3(q[2]); if (!nosUsados[k]) { nosUsados[k] = 1; listaNos.push(q); } }); });
    if (p.conexoes3d !== false && L.id === "roseta") {
      if (listaNos.length <= TETO_ROSETAS) listaNos.forEach(function (q, i) {
        var cx = K.chapa({ origem: [q[0] - 0.06, q[1] + yOff + 0.0045, q[2] - 0.06], ex: [1, 0, 0], ey: [0, 0, 1], t: 0.009, ret: { L: 0.12, B: 0.12 }, papel: "Roseta do andaime multidirecional (provisória)", aco: p.aco, nome: "Roseta " + (i + 1), ifc: "IFCMECHANICALFASTENER" }, "rosetas");
        marca(cx, "roseta", "roseta");
      });
      else K.avisos.push("Mais de " + TETO_ROSETAS + " rosetas (" + listaNos.length + "): não desenhei os discos provisórios no 3D — as travessas continuam na lista de locação.");
    }
    /* pisos e alçapões (chapa metálica) e rodapés */
    function chapaHoriz(x, nome, papel) {
      var u = [x.b[0] - x.a[0], x.b[2] - x.a[2]], Lu = hyp(u[0], u[1]) || 1; u = [u[0] / Lu, u[1] / Lu];
      return K.chapa({ origem: [x.a[0] + u[1] * x.larg / 2, x.yTopo + yOff, x.a[2] - u[0] * x.larg / 2], ex: [u[0], 0, u[1]], ey: [-u[1], 0, u[0]], t: x.esp, ret: { L: x.L, B: x.larg }, papel: papel, aco: p.aco, nome: nome }, "pranchas");
    }
    mod.pranchas.forEach(function (x) {
      var it = x.tipo === "alcapao" ? (S.pisoAlcapao.length === 1 ? S.pisoAlcapao[0] : null) : (L.motor.pisoModo === "n32" ? achar(S.piso, "L", x.L) : pecaPiso(L, x.larg, x.L));
      if (x.tipo === "alcapao" && !it) S.pisoAlcapao.forEach(function (q) { if (Math.abs(q.medidas.L - x.L) < 1e-6) it = q; });
      var cx = chapaHoriz(x, (x.tipo === "alcapao" ? "Piso com alçapão do andaime multidirecional " : "Piso metálico do andaime multidirecional ") + x.id, x.tipo === "alcapao" ? "Piso com alçapão do andaime multidirecional" : "Piso metálico do andaime multidirecional");
      if (cx) { marca(cx, x.tipo === "alcapao" ? "pisoAlcapao" : "piso", x.codCat || x.cod); cx.massa = massaDe(it, 0); }
    });
    mod.rodapes.forEach(function (x) {
      var u = [x.b[0] - x.a[0], x.b[2] - x.a[2]], Lu = hyp(u[0], u[1]) || 1; u = [u[0] / Lu, u[1] / Lu];
      var cx = K.chapa({ origem: [x.a[0], x.a[1] + yOff, x.a[2]], ex: [u[0], 0, u[1]], ey: [0, 1, 0], t: x.esp, ret: { L: Lu, B: x.alt }, papel: "Rodapé metálico do andaime multidirecional", aco: p.aco, nome: "Rodapé do andaime multidirecional " + x.id + " — " + brf(x.L, 2) + " m", ifc: "IFCPLATE" }, "rodapes");
      if (cx) { marca(cx, "rodape", x.codCat || x.cod); cx.massa = massaDe(achar(S.rodape, "L", x.L), 0); }
    });
    /* bases (família existente, com Altura_rosca), calços e escada (família existente) */
    mod.bases.forEach(function (b) {
      if (FA) {
        var Wb = F.W([b.pos[0], 0, b.pos[2]]);
        famOp("ra-andaime-base-regulavel", "padrao", [Wb[0], b.y0 + yOff, Wb[2]], F.th, { Altura_rosca: r4(b.h), Altura_total: r4(b.h + b.pecaBase.h) }, "base", b.codCat || b.cod, massaDe(S[b.cod], 0) + massaDe(S.pecaBase, 0));
        return;
      }
      var cx = K.chapa({ origem: [b.pos[0] - 0.06, b.y0 + b.h + b.pecaBase.h + yOff, b.pos[2] - 0.06], ex: [1, 0, 0], ey: [0, 0, 1], t: b.h + b.pecaBase.h, ret: { L: 0.12, B: 0.12 }, papel: "Base do andaime multidirecional", aco: p.aco, nome: "Base do andaime multidirecional " + b.id, ifc: "IFCMECHANICALFASTENER" }, "bases");
      if (cx) { marca(cx, "base", b.codCat || b.cod); cx.massa = massaDe(S[b.cod], 0) + massaDe(S.pecaBase, 0); }
    });
    mod.calcos.forEach(function (c) {
      var cx = K.chapa({ origem: [c.pos[0] - c.u[0] * c.L / 2 - c.u[1] * c.larg / 2, c.esp + yOff, c.pos[2] - c.u[1] * c.L / 2 + c.u[0] * c.larg / 2], ex: [c.u[0], 0, c.u[1]], ey: [-c.u[1], 0, c.u[0]], t: c.esp, ret: { L: c.L, B: c.larg }, papel: "Calço do andaime multidirecional", aco: p.aco, nome: "Calço do andaime multidirecional " + c.id }, "calcos");
      if (cx) { marca(cx, "calco", "calco"); cx.massa = r3(9 * c.L); }
    });
    mod.acessos.forEach(function (a) {
      if (FA) {
        var Wa = F.W([a.a[0], 0, a.a[2]]), exw = F.D([-a.u[1], 0, a.u[0]]);
        famOp("ra-andaime-escada", "padrao", [Wa[0], a.a[1] + yOff, Wa[2]], Math.atan2(-exw[2], exw[0]), { Altura: a.L }, "escada", a.cod, 0);
        return;
      }
      var ex = [-a.u[1], 0, a.u[0]], O = [a.a[0] - ex[0] * a.larg / 2, a.a[1] + yOff, a.a[2] - ex[2] * a.larg / 2];
      var cx = K.chapa({ origem: O, ex: ex, ey: [0, 1, 0], t: 0.03, ret: { L: a.larg, B: a.L }, papel: "Escada de acesso do andaime multidirecional", aco: p.aco, nome: "Escada de acesso do andaime multidirecional " + a.id, ifc: "IFCSTAIR" }, "acessos");
      if (cx) { marca(cx, "escada", a.cod); cx.massa = 0; }
    });
    for (var z = n0; z < K.pecas.length; z++) if (!K.pecas[z].andaime) K.pecas[z].andaime = { peca: "andaime", cod: "" };
    var m = mod.medidas;
    return { resumo: "Andaime multidirecional (" + mod.linha + "): " + m.nVaos + (m.nVaos === 1 ? " vão" : " vãos") + " × " + m.nLevantes + (m.nLevantes === 1 ? " levante" : " levantes") + ", piso a " + brf(m.alturaPiso) + " m — " + m.nPostes + " postes, " + m.nTravessas + " travessas, " + m.nDiagonais + " diagonais, " + m.nPisos + " pisos",
      medidas: { andaime: m, locacao: pecasLocacao(mod) } };
  }

  /* ================================================================ 3D COM AS FAMÍLIAS (M2) — js/familiasandaimem.js
   * Cada peça do modelo vira uma instância de família no lote (op "familia"); o js/andaime3d.js as divide em InstancedMesh por tipo de peça.
   * ALINHAMENTO MOTOR × FAMÍLIA (o teste reprova se errar):
   *   poste: a ponta de baixo da família fica (passo − r0) acima da ponta da barra do motor — r0 = 400 mm (1ª roseta da família), então as rosetas caem em y0 + 0,50·k
   *     = os nós do motor. Estribo: r0 = o passo, os laços caem nos nós. A roseta gira com o 1º tubo de travessa que chega no nó (os furos são a 0/90/180/270°).
   *   travessa: origem no eixo do poste A, no plano do nó; +X até o poste B; Comprimento = distância real entre os dois nós.
   *   diagonal: origem no nó de baixo; Vao = distância horizontal, Altura = desnível; `Lado` põe a diagonal para fora do andaime (longe do centro dos postes).
   *   piso/alçapão: origem no eixo do poste A, no meio da largura; o topo do tampo em yPiso. Rodapé: origem no pé, o perfil para fora.
   *   peça base: a roseta dela cai no 1º nó (y0). Base regulável: a porca fica logo abaixo da peça base (a rosca vem do motor).
   * hPecaBase do motor (0,20) × a cota do JSON (0,065): o motor manda nos nós; a família segue o JSON — ver DUVIDAS-M2 (D4). */
  function gerarFamilias(p, mod, K, novoId, FM) {
    var L = linhaDe(mod.linha), S = L.pecas, F = K.F, yOff = mod.yOffCalco, FA = FAnd(), est = mod.linha === "estribo", linha = est ? "estribo" : "roseta", passo = L.motor.passoNo, G = "ra-andaime-m-";
    var tipo1 = {}; FM.lista().forEach(function (f) { tipo1[f.id] = (f.tipos[0] || {}).id; });
    var r0 = FM.r0(linha), dyPoste = passo - r0, MMm = 0.001;
    function famOp(famId, Pw, rotY, inst, peca, cod, massa) {
      var ii = {}; Object.keys(inst || {}).forEach(function (kk) { ii[kk] = inst[kk]; });
      ii.andaime = { peca: peca, cod: cod }; if (massa > 0) ii.Massa_kg = massa;
      K.ops.push({ op: "familia", id: String(novoId()), famId: famId, tipoId: tipo1[famId] || "padrao", x: r4(Pw[0]), y: r4(Pw[1]), z: r4(Pw[2]), rotY: r4(rotY), inst: ii });
    }
    mod.avisos.forEach(function (a) { K.avisos.push(a); });
    function massaDe(it, extraKg) { return it && it.pesoKg != null ? it.pesoKg : (extraKg || 0); }
    function Wp(q, y) { var w = F.W([q[0], 0, q[2]]); return [w[0], y + yOff, w[2]]; }
    function rotDe(dx, dz) { var d = F.D([dx, 0, dz]); return Math.atan2(-d[2], d[0]); }
    function unit2(dx, dz) { var l = hyp(dx, dz) || 1; return [dx / l, dz / l]; }
    var cx0 = 0, cz0 = 0; mod.postes.forEach(function (q) { cx0 += q.x / mod.postes.length; cz0 += q.z / mod.postes.length; });
    function foraDe(mx, mz, dir) {   /* sentido «para fora do andaime» perpendicular à direção dada (longe do centro dos postes) */
      var o = unit2(mx - cx0, mz - cz0), pr = dot2(o, dir), q = [o[0] - pr * dir[0], o[1] - pr * dir[1]];
      return hyp(q[0], q[1]) < 1e-6 ? [-dir[1], dir[0]] : unit2(q[0], q[1]);
    }
    function ladoDe(th, out) { var o = F.D([out[0], 0, out[1]]); return (o[0] * Math.sin(th) + o[2] * Math.cos(th)) >= 0 ? 1 : -1; }
    /* a direção da travessa que chega em cada nó (xz): é por ela que a roseta e o furo do pino giram */
    var dirNo = {}, ehTrav = { travessa: 1, transversal: 1, guarda: 1, intermediaria: 1, diagonalTransv: 1 };
    function nk(q) { return r3(q[0]) + "|" + r3(q[2]); }
    mod.barras.forEach(function (b) {
      if (!ehTrav[b.papel]) return;
      var u = unit2(b.b[0] - b.a[0], b.b[2] - b.a[2]); if (!dirNo[nk(b.a)]) dirNo[nk(b.a)] = u; if (!dirNo[nk(b.b)]) dirNo[nk(b.b)] = [-u[0], -u[1]];
    });
    function rotNo(q) { var d = dirNo[nk(q)]; return d ? rotDe(d[0], d[1]) : F.th; }
    var ancPorBarra = {}; mod.ancoragens.forEach(function (a) { ancPorBarra[a.barra] = a; });
    function itemDiag(b) { var r = null; S.diagonal.forEach(function (q) { if (q.cod && q.cod === b.codCat) r = q; }); return r; }
    mod.barras.forEach(function (b) {
      var A = b.a, B = b.b, dx = B[0] - A[0], dz = B[2] - A[2], hz = hyp(dx, dz);
      if (b.papel === "poste") {
        famOp(G + "poste", Wp(A, A[1] + dyPoste), rotNo(A), { Comprimento: r3(b.L), Linha: linha }, "poste", b.codCat || b.cod, massaDe(achar(S.poste, "L", b.L), 0));
      } else if (b.papel === "ancoragem") {
        var an = ancPorBarra[b.id], aff = an ? hyp(an.olhal.pos[0] - A[0], an.olhal.pos[2] - A[2]) : Math.min(b.L, 0.2), u = unit2(dx, dz), th = rotDe(u[0], u[1]), zt = FA ? FA.cota("ra-andaime-abracadeira-fixa", "distanciaEixosTubos") * MMm : 0.054;
        /* o gancho e a abraçadeira fixa ficam logo ACIMA do disco da roseta (meia espessura do disco + meia calha + 3 mm de folga, decisão de forma): a calha de 37 mm não cabe no mesmo plano do disco */
        var dyG = FM.cota(G + "poste", "roseta_espessura") * MMm / 2 + (FA ? FA.cota("ra-andaime-abracadeira-fixa", "larguraCalhaAoLongoDoTubo_forjada") * MMm / 2 : 0.0185) + 0.003;
        famOp(G + "gancho-ancoragem", Wp(A, A[1] + dyG), th, { Comprimento: r3(b.L), Afastamento: r4(aff) }, "gancho", b.codCat || b.cod, (b.cod === "ganchoCurto" || b.cod === "ganchoLongo") ? massaDe(S[b.cod], 0) : 0);
        if (FA) {   /* a abraçadeira fixa que prende o tubo ao poste (família do tubo-roll): no meio entre o eixo do poste e o do tubo */
          var Wc = Wp(A, A[1] + dyG); famOp("ra-andaime-abracadeira-fixa", [Wc[0] + Math.sin(th) * zt / 2, Wc[1], Wc[2] + Math.cos(th) * zt / 2], th, {}, "abracFixa", S.abracFixa.cod, massaDe(S.abracFixa, 0));
        }
      } else if (b.papel === "diagonal" || b.papel === "diagonalTransv") {
        var ud = unit2(dx, dz), thd = rotDe(ud[0], ud[1]), out = foraDe((A[0] + B[0]) / 2, (A[2] + B[2]) / 2, ud), itd = itemDiag(b);
        famOp(G + "diagonal", Wp(A, A[1]), thd, { Comprimento: r3(b.L), Vao: r4(hz), Altura: r4(B[1] - A[1]), Lado: ladoDe(thd, out), Linha: linha }, b.papel, b.codCat || b.cod, massaDe(itd, 0));
      } else {   // travessa | transversal | guarda | intermediaria
        var ut = unit2(dx, dz), it = achar(S.travessa, "vao", b.L);
        famOp(G + "travessa", Wp(A, A[1]), rotDe(ut[0], ut[1]), { Comprimento: r4(hz), Linha: linha }, b.papel, b.codCat || b.cod, massaDe(it, 0));
      }
    });
    /* pino trava em toda emenda de postes (linha roseta): no furo do espigão, 35 mm acima do ombro */
    if (!est) mod.conexoes.forEach(function (c) {
      if (c.tipo !== "espigao") return;
      famOp(G + "pino-trava", Wp(c.pos, c.pos[1] + dyPoste + FM.cota(G + "poste", "espigaoFuroPosicao") * MMm), rotNo(c.pos), {}, "emenda", S.emenda.cod, massaDe(S.emenda, 0));
    });
    /* pisos e alçapões */
    var accL = {}; mod.acessos.forEach(function (a) { if (a.incorporada) accL[a.nivel] = a.L; });
    mod.pranchas.forEach(function (x) {
      var it = x.tipo === "alcapao" ? (S.pisoAlcapao.length === 1 ? S.pisoAlcapao[0] : null) : (L.motor.pisoModo === "n32" ? achar(S.piso, "L", x.L) : pecaPiso(L, x.larg, x.L));
      if (x.tipo === "alcapao" && !it) S.pisoAlcapao.forEach(function (q) { if (Math.abs(q.medidas.L - x.L) < 1e-6) it = q; });
      var u = unit2(x.b[0] - x.a[0], x.b[2] - x.a[2]), th = rotDe(u[0], u[1]);
      if (x.tipo === "alcapao") famOp(G + "alcapao", Wp(x.a, x.yTopo), th, { Comprimento: r4(x.L), Largura: r4(x.larg), Escotilha: x.escotilha || "inicio", Desnivel: r4(accL[x.nivel] || 2.0) }, "pisoAlcapao", x.codCat || x.cod, massaDe(it, 0));
      else famOp(G + "piso", Wp(x.a, x.yTopo), th, { Comprimento: r4(x.L), Largura: r4(x.larg) }, "piso", x.codCat || x.cod, massaDe(it, 0));
    });
    mod.rodapes.forEach(function (x) {
      var u = unit2(x.b[0] - x.a[0], x.b[2] - x.a[2]), out = foraDe((x.a[0] + x.b[0]) / 2, (x.a[2] + x.b[2]) / 2, u), th = rotDe(u[0], u[1]), O = x.a;
      if (ladoDe(th, out) < 0) { u = [-u[0], -u[1]]; th = rotDe(u[0], u[1]); O = x.b; }   /* o perfil (+Z da família) tem de sair para fora */
      famOp(G + "rodape", Wp(O, x.a[1]), th, { Comprimento: r4(x.L), Altura: r4(x.alt) }, "rodape", x.codCat || x.cod, massaDe(achar(S.rodape, "L", x.L), 0));
    });
    /* peça base + base regulável (a porca logo abaixo da peça base) e calço */
    var posR = FM.cota(G + "peca-base", "posicaoDaRosetaAPartirDaBase") * MMm, hTubo = FM.cota(G + "peca-base", "tuboAteOTopoDoTuboInterno") * MMm, hN = FM.cota(G + "base-regulavel", "porcaBorboletaAltura") * MMm, hHaste = FM.cota(G + "base-regulavel", "PEMAX_comprimento") * MMm;
    mod.bases.forEach(function (b) {
      var Wb = Wp([b.pos[0], 0, b.pos[2]], 0), yPB = mod.medidas.y0 - posR, rel = yPB - b.y0, th = rotNo([b.pos[0], 0, b.pos[2]]);
      famOp(G + "base-regulavel", [Wb[0], b.y0 + yOff, Wb[2]], th, { Altura_rosca: r4(rel - hN), Altura_total: r4(Math.min(hHaste, rel + hTubo)), Articulada: b.tipo === "articulada" }, "base", b.codCat || b.cod, massaDe(S[b.cod], 0));
      famOp(G + "peca-base", [Wb[0], yPB + yOff, Wb[2]], th, { Linha: linha }, "pecaBase", b.pecaBase.codCat || "pecaBase", massaDe(S.pecaBase, 0));
    });
    /* o calço é madeira (eucalipto) e fica como CAIXA, igual ao tubo-roll: o conjunto «Peça pronta» (MetalProntas.identidade) pendura a identidade e a aprovação na 1ª caixa */
    var BA = dep("BimArq", "./bimarq.js");
    mod.calcos.forEach(function (c) {
      if (!BA || !BA.vigaPerfil) { K.avisos.push("Calço de madeira: o modelador (js/bimarq.js) não carregou."); return; }
      var A = F.W([c.pos[0] - c.u[0] * c.L / 2, yOff, c.pos[2] - c.u[1] * c.L / 2]), B = F.W([c.pos[0] + c.u[0] * c.L / 2, yOff, c.pos[2] + c.u[1] * c.L / 2]), top = F.W([0, c.esp + yOff, 0])[1];
      var cx = BA.vigaPerfil([A[0], A[2]], [B[0], B[2]], { perfil: { forma: "ret", b: c.larg, h: c.esp }, material: "madeira", topo: top });
      if (!cx) { K.avisos.push("Calço do andaime " + c.id + ": não foi possível criar a peça de madeira."); return; }
      cx.nome = "Calço do andaime multidirecional " + c.id; cx.massa = r3(9 * c.L); cx.madeiraMat = "madeira eucalipto"; cx.andaime = { peca: "calco", cod: "calco" };
      K.nova(cx, cx.nome, "calcos");
    });
    mod.acessos.forEach(function (a) {
      if (a.incorporada || !FA) return;   // a escada incorporada vem dentro do alçapão
      var Wa = F.W([a.a[0], 0, a.a[2]]), exw = F.D([-a.u[1], 0, a.u[0]]);
      famOp("ra-andaime-escada", [Wa[0], a.a[1] + yOff, Wa[2]], Math.atan2(-exw[2], exw[0]), { Altura: a.L }, "escada", a.cod, 0);
    });
    var m = mod.medidas;
    return { resumo: "Andaime multidirecional (" + mod.linha + "): " + m.nVaos + (m.nVaos === 1 ? " vão" : " vãos") + " × " + m.nLevantes + (m.nLevantes === 1 ? " levante" : " levantes") + ", piso a " + brf(m.alturaPiso) + " m — " + m.nPostes + " postes, " + m.nTravessas + " travessas, " + m.nDiagonais + " diagonais, " + m.nPisos + " pisos",
      medidas: { andaime: m, locacao: pecasLocacao(mod) } };
  }

  var AndaimeMulti = { _legado: LEGADO,
    CATALOGO_MULTI: CATALOGO_MULTI, FONTES: FONTES, PARAMETROS_RT: PARAMETROS_RT, PADRAO_MULTI: PADRAO_MULTI, COLUNAS_LOCACAO: COLUNAS_LOCACAO,
    normalizar: normalizar, validar: validar, montar: montar, pecasLocacao: pecasLocacao, tabelaLocacao: tabelaLocacao, gerar: gerar,
    planoVertical: planoVertical, hPecaBaseDe: hPecaBaseDe, combinarVaos: combinarVaos, faixasPiso: faixasPiso, diagCat: diagCat, linhaDe: linhaDe, achar: achar
  };
  global.AndaimeMulti = AndaimeMulti;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeMulti;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
