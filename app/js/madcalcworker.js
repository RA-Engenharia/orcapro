/* =====================================================================
 * madcalcworker.js — o CÁLCULO DA ESTRUTURA DE MADEIRA num Web Worker
 * (processo paralelo do navegador) e o PACOTE DA OBRA de madeira.
 * O MadDimensionar.calcular leva ~25 s (piso seco, modelo analítico com
 * casca, 14+ combinações, autovalor da estabilidade, verificação por
 * membro): na página, a tela ficaria parada esse tempo todo.
 *
 * DOIS JEITOS DE RODAR, O MESMO CÓDIGO (o molde do js/acocalcworker.js):
 *   · como Worker (new Worker("js/madcalcworker.js")): carrega os motores
 *     com importScripts NA ORDEM DO docs/madeira/CONTRATO.md, recebe
 *       { tipo: "calcular", id, pacote, premissas }
 *     e devolve { tipo: "progresso", etapa, … } durante o cálculo e
 *     { tipo: "fim", texto } (o RESUMO em JSON) no fim — ou { tipo: "erro" }.
 *     O resultado COMPLETO fica guardado no Worker; as saídas pedem
 *       { tipo: "gerar", id, qual: "memorial"|"pranchas"|"manual"|"cype", opcoes }
 *     e voltam como { tipo: "saida", id, qual, texto }.
 *   · na página (o <script> do grupo "bim"): registra `MadCalcWorker` com as
 *     mesmas funções — o pacote da obra (montar, conferir) é usado pela tela
 *     sempre, e o cálculo roda aqui quando o navegador não deixa abrir o
 *     Worker (a tela então injeta os motores e avisa que fica parada).
 *
 * ⚠ AS SAÍDAS SAEM DO RESULTADO ORIGINAL, NO MESMO PROCESSO DO CÁLCULO. O
 *   resultado tem RegExp (as regras de espécie), Infinity e ~10 MB de
 *   modelo; uma cópia por JSON para a página perderia parte disso e os
 *   geradores (memorial, pranchas, manual, CYPE) nunca foram provados sobre
 *   uma cópia. Para a tela viaja só o resumo (texto), e cada documento é
 *   gerado onde o resultado nasceu.
 *
 * PACOTE DA OBRA DE MADEIRA (formato "orcapro-madeira-obra", versão 1): UM
 * arquivo .json (ou .json.gz) com tudo o que o cálculo precisa —
 *   { formato, versao, nome, criadoEm, obra: { nome, local },
 *     arquivos: { fonte, sobreposicao, calcPiso, cargasCype, ventoParedes,
 *                 ligacoes, calcLigacoes, cena, resultadosCype, calcPisoPrevio,
 *                 paredes, camadasPiso },
 *     premissasObra: { painelPiso, pendenciasObra } }
 * `juntar` reconhece cada arquivo da obra PELO CONTEÚDO (as chaves que só
 * ele tem), não pelo nome: o nome muda a cada rodada (V18, R03, R04…).
 * Exemplo servido pelo app: data/madeira-exemplo.json.gz (montado por
 * tools/montar-mad-exemplo.js, anonimizado). Teste: tools/test-mad-pacote.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NO_WORKER = typeof global.importScripts === "function" && typeof global.document === "undefined";
  /* ordem do contrato: materiais → viga → verificações → espécies → modelo → análise → ligações → piso → mercado → paredes → catálogo → orquestrador */
  var MOTORES = ["madmateriais.js", "madviga.js", "maddim7190.js", "madespecie.js", "madmodelo.js", "madanalise.js", "madligcalc.js",
                 "madpiso.js", "madmercado.js", "madwoodframe.js", "madcatalogo.js", "maddimensionar.js"];
  /* geradores das saídas (prancha/padraodet/acopranchas são do padrão de desenho da casa, usados pelo madpranchas) */
  var SAIDAS = ["prancha.js", "padraodet.js", "acopranchas.js", "madmemorial.js", "madpranchas.js", "madmanual.js", "madcype.js"];
  var GLOBAL_DE = { "madmateriais.js": "MadMateriais", "madviga.js": "MadViga", "maddim7190.js": "MadDim", "madespecie.js": "MadEspecie", "madmodelo.js": "MadModelo",
    "madanalise.js": "MadAnalise", "madligcalc.js": "MadLigCalc", "madpiso.js": "MadPiso", "madmercado.js": "MadMercado", "madwoodframe.js": "MadWoodFrame",
    "madcatalogo.js": "MadCatalogo", "maddimensionar.js": "MadDimensionar", "prancha.js": "Prancha", "padraodet.js": "PadraoDet", "acopranchas.js": "AcoPranchas",
    "madmemorial.js": "MadMemorial", "madpranchas.js": "MadPranchas", "madmanual.js": "MadManual", "madcype.js": "MadCype" };
  var FORMATO = "orcapro-madeira-obra", VERSAO = 1;

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function num(v, d) { var n = Number(v); return v == null || v === "" || !isFinite(n) ? d : n; }
  function tem(o, ks) { return obj(o) && ks.every(function (k) { return o[k] !== undefined; }); }
  /* cópia profunda que PRESERVA RegExp (as regras de espécie e os grupos do orquestrador são RegExp) */
  function clonar(o) {
    if (o instanceof RegExp) return new RegExp(o.source, o.flags);
    if (Array.isArray(o)) return o.map(clonar);
    if (obj(o)) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = clonar(o[k]); }); return r; }
    return o;
  }
  function G(nome) { return global[nome] || null; }

  /* ============================================================ PACOTE DA OBRA */
  /* cada arquivo da obra pelo que SÓ ele tem (medido nos arquivos da rodada R03 do quiosque de referência) */
  var ARQUIVOS = [
    { id: "fonte", rotulo: "Fonte de peças (peças com seção, espécie e posição)", obrigatorio: true, arquivo: "madeira_*.json", e: function (j) { return obj(j) && Array.isArray(j.pecas) && j.piso_pw !== undefined; } },
    { id: "sobreposicao", rotulo: "Sobreposição do modelo (pilaretes e painéis)", obrigatorio: true, arquivo: "*_sobreposicao.json", e: function (j) { return tem(j, ["pilaretes_v18"]) || tem(j, ["paineis_v18", "novas"]); } },
    { id: "calcPiso", rotulo: "Cargas do piso por zona (calc_piso_v18)", obrigatorio: true, arquivo: "calc_piso_v18.json", e: function (j) { return tem(j, ["G_Z_kN_m2", "cargas_area_barrotes"]); } },
    { id: "cargasCype", rotulo: "Cargas da cobertura e das paredes", obrigatorio: true, arquivo: "cargas_cype.json", e: function (j) { return tem(j, ["cobertura_g_kN_m2", "piso_SC_kN_m2"]); } },
    { id: "ventoParedes", rotulo: "Vento nas paredes (NBR 6123)", obrigatorio: true, arquivo: "vento_paredes.json", e: function (j) { return tem(j, ["q_kPa", "X", "Y"]); } },
    { id: "ligacoes", rotulo: "Ligações da fonte (tipos, quantidades, ferragens)", obrigatorio: false, arquivo: "ligacoes_*.json", e: function (j) { return tem(j, ["ligacoes", "ferragens", "regras"]); } },
    { id: "calcLigacoes", rotulo: "Cálculo das ligações emitido (L01–L15)", obrigatorio: false, arquivo: "calc_ligacoes.json", e: function (j) { return obj(j) && j.premissas !== undefined && Object.keys(j).some(function (k) { return /^L\d{2}$/.test(k); }); } },
    { id: "cena", rotulo: "Cena 3D (piso e manual de montagem)", obrigatorio: false, arquivo: "cena_*.json", e: function (j) { return tem(j, ["objetos", "mats"]); } },
    { id: "resultadosCype", rotulo: "Resultados do CYPE 3D (reações e esforços)", obrigatorio: false, arquivo: "resultados_*.json", e: function (j) { return tem(j, ["reacoes", "esforcos", "bandas_placas"]); } },
    { id: "calcPisoPrevio", rotulo: "Piso — hold-downs e cortante do vento", obrigatorio: false, arquivo: "calc_piso.json", e: function (j) { return tem(j, ["hold_downs", "cortante_vento", "painel"]); } },
    { id: "paredes", rotulo: "Paredes de contraventamento (painéis e planos)", obrigatorio: false, arquivo: "entrada.json (wood frame)", e: function (j) { return obj(j) && j.paineis && typeof j.paineis === "object" && Array.isArray(j.planos); } },
    { id: "camadasPiso", rotulo: "Camadas do piso por zona", obrigatorio: false, arquivo: "camadas_piso.json", e: function (j) { return tem(j, ["pacotes", "zonas", "camadas"]); } }
  ];
  function reconhecer(json) {
    if (obj(json) && json.formato === FORMATO) return "pacote";
    for (var i = 0; i < ARQUIVOS.length; i++) { try { if (ARQUIVOS[i].e(json)) return ARQUIVOS[i].id; } catch (e) {} }
    return null;
  }
  function novoPacote(obra) {
    return { formato: FORMATO, versao: VERSAO, nome: (obra && obra.nome) || "", criadoEm: new Date().toISOString().slice(0, 10), obra: { nome: (obra && obra.nome) || "", local: (obra && obra.local) || "" },
             arquivos: {}, premissasObra: {} };
  }
  /* põe um arquivo no pacote; devolve { ok, id, rotulo, motivo } */
  function juntar(pacote, nome, json) {
    var id = reconhecer(json);
    if (id === "pacote") {
      if (num(json.versao, 0) > VERSAO) return { ok: false, motivo: "“" + nome + "” é de uma versão mais nova do pacote (" + json.versao + "): atualize o OrçaPRO." };
      Object.keys(json.arquivos || {}).forEach(function (k) { pacote.arquivos[k] = json.arquivos[k]; });
      if (json.obra) pacote.obra = json.obra;
      if (json.nome) pacote.nome = json.nome;
      if (json.premissasObra) pacote.premissasObra = json.premissasObra;
      if (json.exemplo) pacote.exemplo = json.exemplo;
      return { ok: true, id: "pacote", rotulo: "Pacote da obra (" + Object.keys(json.arquivos || {}).length + " arquivos)" };
    }
    if (!id) return { ok: false, motivo: "“" + nome + "” não é um arquivo que o cálculo da madeira conheça (fonte de peças, sobreposição, cargas, vento, ligações, cena, piso, paredes)." };
    pacote.arquivos[id] = json;
    var d = ARQUIVOS.filter(function (a) { return a.id === id; })[0];
    return { ok: true, id: id, rotulo: d.rotulo };
  }
  function conferir(pacote) {
    var a = (pacote && pacote.arquivos) || {}, falta = [], tem2 = [], opc = [];
    ARQUIVOS.forEach(function (d) {
      if (a[d.id]) tem2.push({ id: d.id, rotulo: d.rotulo, obrigatorio: d.obrigatorio });
      else if (d.obrigatorio) falta.push({ id: d.id, rotulo: d.rotulo, arquivo: d.arquivo });
      else opc.push({ id: d.id, rotulo: d.rotulo, arquivo: d.arquivo });
    });
    var avisos = [];
    if (!a.cena || !a.resultadosCype || !a.calcPisoPrevio || !a.ligacoes) avisos.push("Sem cena, resultados do CYPE, piso prévio e ligações da fonte o piso seco não é verificado localmente (fica em “não abrangido”) e o manual de montagem sai sem ilustração.");
    if (!a.paredes) avisos.push("Sem os painéis de wood frame as paredes de contraventamento ficam fora do cálculo.");
    return { ok: !falta.length, falta: falta, tem: tem2, opcionais: opc, avisos: avisos,
             pecas: a.fonte ? arr(a.fonte.pecas).length : 0 };
  }

  /* ============================================================ PREMISSAS */
  /* espécie POR FUNÇÃO: cada função liga os grupos do MODELO analítico (MadDimensionar.QUIOSQUE.grupoEspecie)
     às regras da FONTE (MadEspecie.QUIOSQUE). ⚠ Trocar só um lado deixaria o cálculo numa madeira e a compra,
     as pranchas e o memorial em outra — por isso a tela troca a FUNÇÃO e os dois lados mudam juntos. */
  var FUNCOES = [
    { id: "pergolado", rotulo: "Pergolado — pilares compostos e vigas das coberturas", modelo: "^PILAR$|^COB_|^COBINF_", fonte: ["^PILAR_|^COB_"] },
    { id: "embutida", rotulo: "Viga de topo e vergas (embutidas na parede)", modelo: "^GUIA_10x20$|^VERGA_10x20$", fonte: ["^WF_GUIA_SUP$", "^WF_VERGA$"] },
    { id: "piso", rotulo: "Piso seco — barrotes, vigas principais e testeiras", modelo: "^BAR_|^VP_|^DORM_|^TEST_", fonte: ["^PISO_"] },
    { id: "woodframe", rotulo: "Wood frame (montantes, guias) e forro", modelo: "^FORRO_|^GUIA_10x5$", fonte: ["^WF_|^FORRO_"] },
    { id: "aparente", rotulo: "Brise e ripado (fora do modelo analítico)", modelo: null, fonte: ["^BRISE|^RIPADO|^PERGOLADO"] }
  ];
  function regraModelo(Q, src) { var g = arr(Q && Q.grupoEspecie); for (var i = 0; i < g.length; i++) if (g[i][0] && g[i][0].source === src) return g[i]; return null; }
  function regraFonte(regras, src) { for (var i = 0; i < regras.length; i++) if (regras[i].grupo && regras[i].grupo.source === src && !regras[i].secoes) return regras[i]; for (var j = 0; j < regras.length; j++) if (regras[j].grupo && regras[j].grupo.source === src) return regras[j]; return null; }
  function premissasPadrao() {
    var D = G("MadDimensionar"), ME = G("MadEspecie"), Q = D && D.QUIOSQUE, R = (ME && ME.QUIOSQUE) || [], esp = {};
    FUNCOES.forEach(function (f) {
      var rm = f.modelo ? regraModelo(Q, f.modelo) : null, rf = regraFonte(R, f.fonte[0]);
      esp[f.id] = (rm && rm[1]) || (rf && rf.especie) || "";
    });
    var dec = {};
    Object.keys((Q && Q.decisoesRT) || {}).forEach(function (g) { var d = Q.decisoesRT[g]; dec[g] = { ativo: true, b_cm: d.b_cm, h_cm: d.h_cm, especie: d.especie || "", motivo: d.motivo || "" }; });
    return { especiePorFuncao: esp, classes: { tatajuba: "nativa:D40", itauba: "nativa:D40", pinus_cca: "peca:C20" },
             perfil: { umidade: 3, limVao: 350, limBalanco: 175, psi2: 0.4 }, decisoesRT: dec };
  }
  /* as listas que a tela oferece (do motor de materiais — nada digitado aqui) */
  function opcoes() {
    var MM = G("MadMateriais"), o = { especies: [], classes: [], funcoes: FUNCOES.map(function (f) { return { id: f.id, rotulo: f.rotulo, modelo: !!f.modelo }; }) };
    if (MM) {
      Object.keys(MM.ESPECIES || {}).forEach(function (k) { o.especies.push({ id: k, nome: MM.ESPECIES[k].nome, classe2022: MM.ESPECIES[k].classe2022 }); });
      Object.keys(MM.CLASSES_2022 || {}).forEach(function (k) { o.classes.push({ id: k, nome: MM.CLASSES_2022[k].nome, grupo: MM.CLASSES_2022[k].grupo }); });
    }
    return o;
  }
  /* catálogo de madeira serrada da compra: o da Nibra que já está no MadCatalogo (gerado de nibra_pro_2025.json) */
  function catalogoMadeira() {
    var MC = G("MadCatalogo"), MER = G("MadMercado");
    if (!MC || !MER || !MC.DADOS) return { lista: null, fonte: "" };
    var f = MC.DADOS.fontes && MC.DADOS.fontes.nibra_pro_2025;
    var lista = MER.catalogoDeJson({ fonte: f, produtos: MC.DADOS.produtos.filter(function (p) { return p.catalogo === "nibra_pro_2025"; }) }, "Nibra");
    return { lista: lista, fonte: "Nibra — " + ((f && (f.titulo || f.arquivo)) || "Catálogo Pro 2025") + " (Wood Framing, p. 5)" };
  }

  /* a entrada do MadDimensionar.calcular a partir do pacote e das premissas da tela */
  function entrada(pacote, premissas) {
    var a = (pacote && pacote.arquivos) || {}, P = premissas || premissasPadrao(), D = G("MadDimensionar"), ME = G("MadEspecie"), MP = G("MadPiso"), MC = G("MadCatalogo");
    if (!D || !ME) throw new Error("os motores da madeira não carregaram (maddimensionar.js / madespecie.js)");
    var cf = conferir(pacote);
    if (!cf.ok) throw new Error("faltam no pacote: " + cf.falta.map(function (x) { return x.rotulo; }).join("; "));
    /* espécie por função → os dois lados (modelo e fonte) */
    var Q = clonar(D.QUIOSQUE), regras = clonar(ME.QUIOSQUE), hoje = new Date().toISOString().slice(0, 10), mudou = [];
    FUNCOES.forEach(function (f) {
      var e2 = (P.especiePorFuncao || {})[f.id]; if (!e2) return;
      if (f.modelo) { var rm = regraModelo(Q, f.modelo); if (rm && rm[1] !== e2) { rm[1] = e2; mudou.push(f.id); } }
      f.fonte.forEach(function (src) {
        regras.forEach(function (r) {
          if (r.grupo && r.grupo.source === src && r.especie !== e2) { r.especie = e2; r.origem = "premissa alterada na tela do cálculo (" + hoje + ")"; r.data = hoje; if (mudou.indexOf(f.id) < 0) mudou.push(f.id); }
        });
      });
    });
    /* decisões do RT (troca de seção): as desligadas saem; as ligadas valem com a seção/espécie da tela */
    var dec = {};
    Object.keys(P.decisoesRT || {}).forEach(function (g) {
      var d = P.decisoesRT[g], base = (D.QUIOSQUE.decisoesRT || {})[g] || {};
      if (!d || d.ativo === false) return;
      dec[g] = { b_cm: num(d.b_cm, base.b_cm), h_cm: num(d.h_cm, base.h_cm), especie: d.especie || base.especie, grupoFonte: base.grupoFonte, motivo: d.motivo || base.motivo || "decisão do RT (tela do cálculo)" };
    });
    Q.decisoesRT = dec;
    var po = pacote.premissasObra || {}, cat = catalogoMadeira();
    var e = {
      fonte: a.fonte, sobreposicao: a.sobreposicao, calcPiso: a.calcPiso, cargasCype: a.cargasCype, ventoParedes: a.ventoParedes,
      especies: regras, grupos: Q, semDecisoesRT: !Object.keys(dec).length,
      classes: clonar(P.classes || premissasPadrao().classes),
      perfil: { umidade: num(P.perfil && P.perfil.umidade, 3), limVao: num(P.perfil && P.perfil.limVao, 350), limBalanco: num(P.perfil && P.perfil.limBalanco, 175), psi2: num(P.perfil && P.perfil.psi2, 0.4) },
      catalogo: MC || undefined, catalogoMadeira: cat.lista || undefined, catalogoMadeiraFonte: cat.lista ? cat.fonte : undefined,
      calcLigacoes: a.calcLigacoes, ligacoesFonte: a.ligacoes, camadasPiso: a.camadasPiso,
      painelPiso: po.painelPiso, pendenciasObra: arr(po.pendenciasObra).slice()
    };
    if (a.paredes) { e.paineis = a.paredes.paineis; e.planos = a.paredes.planos; }
    if (MP && MP.entradasQuiosque && a.cena && a.resultadosCype && a.calcPisoPrevio && a.ligacoes) {
      e.entradasPiso = MP.entradasQuiosque({ madeira: a.fonte, sobreposicao: a.sobreposicao, ligacoes: a.ligacoes, cena: a.cena, cype: a.resultadosCype, calcPiso: a.calcPisoPrevio });
    }
    e._mudou = mudou;
    return e;
  }

  /* ============================================================ PROGRESSO */
  /* ⚠ só etapas que o orquestrador de fato chama, na ordem dele (medido em 12/10/2026): as ligações vêm do cálculo
     emitido com os passos refeitos e não passam por uma função embrulhável — uma etapa listada que nunca acende
     diria à pessoa que algo ficou por fazer */
  var ETAPAS = ["motores", "especies", "piso", "modelo", "analise", "esforcos", "estabilidade", "verificacao", "compra", "paredes"];
  function comProgresso(fn, aviso) {
    var orig = [], nVer = 0, ultimo = 0, t0 = Date.now();
    function av(x) { x.ms = Date.now() - t0; try { aviso(x); } catch (e) {} }
    function embrulha(o, nome, antes) {
      if (!o || typeof o[nome] !== "function") return;
      var f0 = o[nome]; orig.push([o, nome, f0]);
      o[nome] = function () { antes.apply(this, arguments); return f0.apply(this, arguments); };
    }
    embrulha(G("MadEspecie"), "aplicar", function () { av({ etapa: "especies" }); });
    embrulha(G("MadPiso"), "calcular", function () { av({ etapa: "piso" }); });
    embrulha(G("MadModelo"), "gerar", function () { av({ etapa: "modelo" }); });
    embrulha(G("MadAnalise"), "montar", function (m) { av({ etapa: "analise", barras: m && m.barras ? m.barras.length : 0, nos: m && m.nos ? m.nos.length : 0 }); });
    embrulha(G("MadAnalise"), "esforcos", function () { av({ etapa: "esforcos" }); });
    embrulha(G("MadAnalise"), "estabilidade", function () { av({ etapa: "estabilidade" }); });
    embrulha(G("MadDim"), "barra2022", function () { nVer++; var t = Date.now(); if (t - ultimo > 150) { ultimo = t; av({ etapa: "verificacao", n: nVer }); } });
    embrulha(G("MadMercado"), "listaDeCompra", function () { av({ etapa: "compra" }); });
    embrulha(G("MadWoodFrame"), "calcular", function () { av({ etapa: "paredes" }); });
    try { return fn(); }
    finally { orig.forEach(function (o) { o[0][o[1]] = o[2]; }); }
  }

  /* ============================================================ CALCULAR + RESUMO */
  var ULTIMO = null;   /* { r, pacote, premissas } — o resultado completo fica onde nasceu */
  function rodar(pacote, premissas, aviso) {
    aviso = typeof aviso === "function" ? aviso : function () {};
    var D = G("MadDimensionar");
    if (!D || !D.calcular) throw new Error("O motor do cálculo da madeira (js/maddimensionar.js) não carregou.");
    var t0 = Date.now();
    var r = comProgresso(function () { var e = entrada(pacote, premissas); var x = D.calcular(e); x._mudou = e._mudou; return x; }, aviso);
    r.msTotal = Date.now() - t0;
    ULTIMO = { r: r, pacote: pacote, premissas: premissas || premissasPadrao() };
    return r;
  }
  function nomeEspecie(id) { var MM = G("MadMateriais"); try { return (MM && MM.especie(id).nome) || id; } catch (e) { return id; } }
  function curto(nome) { return String(nome || "").split(" (")[0]; }
  function resumir(r) {
    if (!r) return null;
    var Q = (G("MadDimensionar") || {}).QUIOSQUE || {}, nomes = Q.funcoes || {}, por = {}, ordem = [];
    arr(r.verificacoes).forEach(function (v) {
      var g = por[v.grupo];
      if (!g) { g = por[v.grupo] = { grupo: v.grupo, funcao: v.funcao || nomes[v.grupo] || v.grupo, n: 0, reprovados: 0, max: null }; ordem.push(v.grupo); }
      g.n++; if (!(v.eta <= 1)) g.reprovados++;
      if (!g.max || v.eta > g.max.eta) g.max = v;
    });
    var funcoes = ordem.map(function (k) {
      var g = por[k], m = g.max;
      return { grupo: g.grupo, funcao: g.funcao, n: g.n, reprovados: g.reprovados, etaMax: m.eta, governa: m.governa, combinacao: m.combinacao, membro: m.membro,
               especie: curto(m.especie), classe: m.classe, secao: m.secao, beta: m.beta, ok: g.reprovados === 0 };
    });
    var an = r.analise || {}, est = an.estabilidade || {};
    var comp = r.compra ? { pendencias: arr(r.compra.pendencias), catalogoFonte: r.compra.catalogoFonte || "", cotacao: arr(r.compra.cotacao), grupos: arr(r.compra.grupos).map(function (x) {
      var pl = x.plano || null;
      return { especie: x.especie, especieNome: curto(nomeEspecie(x.especie)), secao: x.secao, b_mm: x.b_mm, h_mm: x.h_mm, n: x.n, util_m: x.util_m, volume_m3: x.volume_m3,
               fornecedor: x.catalogo ? x.catalogo.fornecedor : (x.sobMedida ? x.sobMedida.fornecedor : ""), produto: x.catalogo ? (x.catalogo.nome || x.catalogo.produtoId) + (x.origem ? " — " + x.origem.texto : "") : (x.sobMedida ? "serrada sob medida (cotação por m³)" : ""), bruta: !!(x.catalogo && x.catalogo.bruta),
               origem: x.origem ? x.origem.texto : "", sobMedida: !!x.sobMedida,
               porComprimento: pl ? pl.porComprimento : null, barras: pl ? arr(pl.barras).length : 0, comprado_m: pl ? pl.comprado_m : null, aproveitamento: pl ? pl.aproveitamento : null,
               pendencia: x.pendencia || "" };
    }) } : null;
    return {
      ok: !!r.ok, msTotal: r.msTotal || r.ms || 0, mudou: arr(r._mudou),
      impedimentos: arr(r.impedimentos), pendencias: arr(r.pendencias), avisos: arr(r.avisos), naoAbrangido: arr(r.naoAbrangido),
      premissas: arr(r.premissas).map(function (p) { return { item: p.item, valor: p.valor, fonte: p.fonte, confianca: p.confianca }; }),
      alphaCr: an.alphaCr == null ? null : an.alphaCr, alphaCrMin: est.alphaCrMin == null ? null : est.alphaCrMin, combinacaoCritica: est.combinacaoCritica || "",
      criterioBeta: an.criterioBeta || "", beta: an.beta || {}, combinacoes: arr(r.combinacoes).length,
      funcoes: funcoes, verificados: arr(r.verificacoes).length,
      reprovacoes: arr(r.reprovacoes).map(function (x) { return { grupo: x.grupo, funcao: x.funcao, membros: arr(x.membros).length, etaMax: x.etaMax, mecanismo: x.mecanismo, alternativas: arr(x.alternativas) }; }),
      reacoes: arr(r.reacoesFundacao).map(function (x) {
        var o = { pilarete: x.pilarete, x: x.x, y: x.y, G: x.G ? x.G.N : null, Q: x.Q ? x.Q.N : null };
        ["V1", "V2", "V3", "V4"].forEach(function (k) { o[k] = x[k] ? { N: x[k].N, Vx: x[k].Vx, Vy: x[k].Vy } : null; });
        return o;
      }),
      reacoesConvencao: r.reacoesConvencao || "",
      ligacoes: arr(r.ligacoes).map(function (l) { return { codigo: l.codigo, sub: l.sub || "", tipo: l.tipo, descricao: l.descricao, quantidade: l.quantidade, eta: l.eta == null ? null : l.eta, ok: l.ok }; }),
      painelWall: r.painelWall ? { conclusao: r.painelWall.conclusao || "", impedeUso: !!r.painelWall.impedeUso } : null,
      nivel: r.nivel || null,
      modelo: r.modelo ? { nos: r.modelo.nos, barras: r.modelo.barras, placas: r.modelo.placas } : null,
      porEspecie: r.especies && r.especies.porEspecie ? Object.keys(r.especies.porEspecie).map(function (k) { var x = r.especies.porEspecie[k]; return { especie: k, nome: curto(nomeEspecie(k)), n: x.n, volume_m3: x.volume_m3 }; }) : [],
      compra: comp
    };
  }

  /* ============================================================ SAÍDAS (do resultado guardado) */
  /* ⚠ LATIN-1 DE VERDADE: o MadCype.paraLatin1 só troca as quebras de linha; o caractere fora do latin-1 (o
     travessão "—" da tabela de séries, medido em 12/10/2026) virava outro byte ao gravar e o CYPE lia lixo.
     Aqui ele vira o equivalente ASCII; o que não tiver equivalente vira "?" — visível, nunca um byte errado. */
  var TRANSLIT = { "\u2014": "-", "\u2013": "-", "\u2212": "-", "\u2264": "<=", "\u2265": ">=", "\u2192": "->", "\u2018": "'", "\u2019": "'", "\u201c": "\"", "\u201d": "\"",
    "\u2026": "...", "\u03b7": "eta", "\u03c3": "sigma", "\u03a3": "Soma", "\u03b1": "alfa", "\u03b2": "beta", "\u03b3": "gama", "\u03bb": "lambda", "\u2248": "~", "\u26a0": "!" };
  function latin1Seguro(t) { return String(t).replace(/[^\u0000-\u00ff]/g, function (ch) { return TRANSLIT[ch] || "?"; }); }
  function gerar(qual, opcoes) {
    if (!ULTIMO || !ULTIMO.r) throw new Error("Calcule primeiro: os documentos saem do resultado do cálculo.");
    var r = ULTIMO.r, a = ULTIMO.pacote.arquivos || {}, o = clonar(opcoes || {});
    if (qual === "memorial") {
      var MM = G("MadMemorial"); if (!MM) throw new Error("o gerador do memorial (js/madmemorial.js) não carregou");
      var m = MM.gerar(r, o);
      return { ok: m.ok, html: m.html, titulo: m.titulo, secoes: arr(m.secoes).length, avisos: arr(m.avisos) };
    }
    if (qual === "pranchas") {
      var MP = G("MadPranchas"); if (!MP) throw new Error("o gerador das pranchas (js/madpranchas.js) não carregou");
      o.fonte = a.fonte; o.ligacoesFonte = a.ligacoes; o.catalogo = G("MadCatalogo");
      var p = MP.gerar(r, o);
      return { ok: p.ok, avisos: arr(p.avisos), folhas: arr(p.folhas).map(function (f) { return { id: f.id, numero: f.numero, titulo: f.titulo, formato: f.formato, escala: f.escala, svg: f.svg, dxf: f.dxf }; }) };
    }
    if (qual === "manual") {
      var MN = G("MadManual"); if (!MN) throw new Error("o gerador do manual (js/madmanual.js) não carregou");
      o.fonte = a.fonte; o.cena = a.cena; o.catalogo = G("MadCatalogo");
      var n = MN.gerar(r, o);
      return { ok: n.ok, html: n.html, paginas: arr(n.paginas).length, etapas: arr(n.etapas).length, avisos: arr(n.avisos) };
    }
    if (qual === "cype") {
      var MC = G("MadCype"); if (!MC) throw new Error("o exportador do CYPE (js/madcype.js) não carregou");
      var c = MC.pacote(r, o), arqs = {};
      /* o CYPE 3D lê os textos em latin-1 (o .md do roteiro fica em UTF-8, como no teste do motor) */
      Object.keys(c.arquivos || {}).forEach(function (k) { arqs[k] = { latin1: !/\.md$/i.test(k), texto: /\.md$/i.test(k) ? c.arquivos[k] : latin1Seguro(MC.paraLatin1(c.arquivos[k])) }; });
      return { ok: true, arquivos: arqs, avisos: arr(c.avisos), series: arr(c.series).length, cargas: arr(c.cargas).length };
    }
    throw new Error("saída desconhecida: " + qual);
  }

  var API = { FORMATO: FORMATO, VERSAO: VERSAO, MOTORES: MOTORES, SAIDAS: SAIDAS, GLOBAL_DE: GLOBAL_DE, ARQUIVOS: ARQUIVOS, FUNCOES: FUNCOES, ETAPAS: ETAPAS,
    reconhecer: reconhecer, novoPacote: novoPacote, juntar: juntar, conferir: conferir, premissasPadrao: premissasPadrao, opcoes: opcoes,
    catalogoMadeira: catalogoMadeira, entrada: entrada, comProgresso: comProgresso, rodar: rodar, resumir: resumir, gerar: gerar,
    ultimo: function () { return ULTIMO; }, clonar: clonar };

  if (!NO_WORKER) {
    global.MadCalcWorker = API;
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    return;
  }

  /* ============================================================ WORKER */
  var carregados = null, faltam = [], ver = "";
  try { var mv = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); if (mv) ver = "?v=" + mv[1]; } catch (e) {}
  function carregar() {
    if (carregados) return;
    carregados = [];
    MOTORES.concat(SAIDAS).forEach(function (arq) {
      try { global.importScripts(arq + ver); carregados.push(arq); }
      catch (e) { faltam.push(arq); }
    });
  }
  global.onmessage = function (ev) {
    var m = ev.data || {}, t0 = Date.now();
    try {
      carregar();
      if (m.tipo === "calcular") {
        global.postMessage({ tipo: "motores", id: m.id, carregados: carregados, faltam: faltam });
        var obrig = faltam.filter(function (f) { return MOTORES.indexOf(f) >= 0; });
        if (obrig.length) { global.postMessage({ tipo: "erro", id: m.id, mensagem: "Não carregou: " + obrig.join(", ") }); return; }
        var prog = function (p) { p.tipo = "progresso"; p.id = m.id; global.postMessage(p); };
        var r = rodar(m.pacote, m.premissas, prog);
        global.postMessage({ tipo: "fim", id: m.id, ms: Date.now() - t0, texto: JSON.stringify(resumir(r)) });
      } else if (m.tipo === "gerar") {
        var s = gerar(m.qual, m.opcoes);
        global.postMessage({ tipo: "saida", id: m.id, qual: m.qual, ms: Date.now() - t0, texto: JSON.stringify(s) });
      }
    } catch (e) {
      global.postMessage({ tipo: "erro", id: m.id, qual: m.qual, mensagem: e && e.message ? e.message : String(e), pilha: e && e.stack ? String(e.stack).slice(0, 1200) : "" });
    }
  };
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this)));
