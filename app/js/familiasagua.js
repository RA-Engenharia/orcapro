/* =====================================================================
 * familiasagua.js — TODA PEÇA QUE RECEBE ÁGUA TEM O PONTO DE ÁGUA (FRENTE H7, 21/10/2026). Motor puro, ES5, Node-testável.
 *
 * POR QUE. O Rogério (21/10/2026): "todas as cubas, chuveiro, vaso parametrizados, com o parâmetro para ele conseguir colocar as
 * tubulações. Coloquei uma cuba e ele não queria colocar de jeito nenhum a água fria nela, colocou só o esgoto." A varredura das
 * famílias com cuba achou: a cuba de bancada do hidro (hid-cuba-apoio) só com o esgoto (corrigida no js/hidfamilias.js), a bancada
 * de pedra "Sem torneira" só com o esgoto (corrigida no js/marmoraria.js) e as famílias da biblioteca RA e do mobiliário com cuba
 * SEM ponto nenhum — a bancada de cozinha com cuba, o lavatório e o tanque simplificados, o armário inferior de cozinha com cuba,
 * a ilha, a bancada de banheiro com gabinete, a churrasqueira de tijolinho com cuba e o tanque com gabinete do catálogo.
 * Este arquivo dá a cada uma os PONTOS (conectores do js/familia.js, em fórmula sobre os parâmetros da própria família — a
 * posição da cuba é a mesma conta do gerador da peça) e os PARÂMETROS para escolher a torneira:
 *   Torneira_de_parede (sim/não), Agua_quente (misturador), Agua_afastamento, Agua_abaixo_tampo / Agua_altura_parede,
 *   Esgoto_abaixo_tampo — todos com a fonte na descrição.
 * O kit (js/hidkit.js, dados-fonte/hidro/kits/kits.json) liga cada família ao tipo de aparelho: bancada → kit por cuba,
 * lavatório → ponto, tanque → ponto na parede. O Traçar automaticamente passa a levar a água fria (e a quente) a todas.
 *
 * COMO ENTRA. Na carga, embrulha o FamiliasRA.registrar (as famílias de mobiliário se registram depois, cada uma no seu
 * arquivo) e completa as que já estão lá. A família que JÁ tem ponto de água fria não muda (idempotente). Os arquivos das
 * famílias (js/familiasmob*.js, js/familiaschurras.js, js/familiascat.js, js/familiasra.js) não são editados.
 *
 * ⚠ NÚMEROS: as alturas e afastamentos vêm do js/marmoraria.js REGRA (Deca p.115-116, Tigre p.40) e do js/hidkitdados.js
 *   (Tigre p.40: TQ) quando carregados; a cópia de reserva abaixo tem a mesma fonte. O resto é desenho (o gerador da peça).
 *   API: FamiliasAgua.ESPEC (as famílias), aplicar(fam), completarRegistradas(), ehPecaDeAgua(famId), exigidos(famId, valores).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* hid:fisica-inicio — REGRAS DE PONTO com fonte (a cópia de reserva; o js/marmoraria.js e o js/hidkitdados.js mandam quando carregados) */
  var FONTE_DECA = "Deca — Linha de Produtos (AECweb), p.115-116 (sugestão de medidas de instalação de cubas)";
  var FONTE_TIGRE = "Tigre — Manual Técnico Instalações Hidráulicas Prediais 2025, p.40 (alturas dos pontos)";
  var RESERVA = {
    aguaAbaixoTampo: 0.22,       /* Deca p.116: ponto de água 220 mm abaixo da face do tampo (torneira de mesa) */
    metalParedeAcimaTampo: 0.22, /* Deca p.116: metais de parede 170 a 220 mm acima do tampo — adotado o maior */
    piaParede: 1.10,             /* Tigre p.40: PIA – pia, 110 cm (torneira de parede) */
    tanqueParede: 1.15,          /* Tigre p.40: TQ – tanque, 115 cm */
    esgotoEmbutir: 0.35,         /* Deca p.115 tabela 3: esgoto abaixo do tampo, cuba de embutir — o maior da classe */
    esgotoApoio: 0.35,           /* Deca p.115 tabela 3: cuba de apoio — o maior da classe */
    esgotoAbaixoFundo: 0.06,     /* inox: o sifão desce 6 cm abaixo do fundo da cuba até a parede (o desenho do js/hidlouca.js / js/marmoraria.js) */
    entreMesa: 0.27              /* entre-eixos dos pontos de água da torneira de mesa: 2 × (10 cm livres + raios DN 20 e DN 50), FRENTE H5 (js/marmoraria.js entreMesa) */
  };
  /* hid:fisica-fim */
  function regra() {
    var MM = dep("Marmoraria", "./marmoraria.js"), R = (MM && MM.REGRA) || {}, out = copia(RESERVA);
    if (num(R.aguaAbaixoTampo, 0) > 0) out.aguaAbaixoTampo = R.aguaAbaixoTampo;
    if (num(R.metalParedeAcimaTampo, 0) > 0) out.metalParedeAcimaTampo = R.metalParedeAcimaTampo;
    if (num(R.piaParede, 0) > 0) out.piaParede = R.piaParede;
    if (R.esgoto && num(R.esgoto.embutir, 0) > 0) out.esgotoEmbutir = R.esgoto.embutir;
    if (R.esgoto && num(R.esgoto.apoio, 0) > 0) out.esgotoApoio = R.esgoto.apoio;
    if (num(R.esgotoAbaixoFundo, 0) > 0) out.esgotoAbaixoFundo = R.esgotoAbaixoFundo;
    try { if (MM && MM.entreMesa) { var em = Number(MM.entreMesa("cozinha")); if (em > 0) out.entreMesa = Math.round(em * 1000) / 1000; } } catch (e) {}   // hid:ok arredonda a mm
    var KD = dep("HidKitDados", "./hidkitdados.js"), A = KD && KD.alturas;
    if (A && arr(A.dados).length) {
      var cs = arr(A.colunas), iS = cs.indexOf("sigla"), iH = cs.indexOf("altura_cm");
      arr(A.dados).forEach(function (l) { var h = num(l[iH], 0) / 100; if (h > 0 && l[iS] === "TQ") out.tanqueParede = h; if (h > 0 && l[iS] === "PIA") out.piaParede = h; });
    }
    return out;
  }

  /* ------------------------------------------------------------------ AS FAMÍLIAS
   * Cada uma: amb (banheiro | cozinha | gourmet | servico), parede (fórmula do Z da face da parede: 0 = família encostada pelo fundo;
   * "-Profundidade/2" = origem no centro), tampo (fórmula da face do tampo/borda), cubas [{ x, visivel }], esgoto ("apoio" | "embutir" |
   * fórmula da profundidade da cuba de inox), torneira ("mesa" | "parede"), quente (padrão do Agua_quente), kit (o tipo em kits.json),
   * piso (true = ponto pelo piso: ilha, sem parede atrás), fonte (o gerador de onde saiu a posição). */
  var ESPEC = {
    "ra-bancada": { amb: "cozinha", parede: "-Profundidade/2", tampo: "Altura", cubas: [{ x: "Comprimento/4", visivel: "Com_cuba" }], esgoto: { inox: "0.17", topo: "0.01" }, torneira: "mesa", quente: false,
      kit: "bancada_cozinha", fonte: "js/familiasra.js ra-bancada (sólido Cuba: x = Comprimento/4, 17 cm de fundo, topo 1 cm abaixo do tampo)" },
    "ra-lavatorio-coluna": { amb: "banheiro", parede: "-Profundidade/2", tampo: "Altura_borda", cubas: [{ x: "0" }], esgoto: "embutir", torneira: "mesa", quente: true, kit: "lavatorio",
      fonte: "js/familiasra.js ra-lavatorio-coluna (cuba no eixo, fundo na parede)" },
    "ra-tanque": { amb: "servico", parede: "-Profundidade/2", tampo: "Altura_borda", cubas: [{ x: "0" }], esgoto: { inox: "0.30", topo: "0" }, torneira: "parede", quente: false, kit: "tanque_familia",
      fonte: "js/familiasra.js ra-tanque (cuba de 30 cm no eixo)" },
    "ra-coz-inferior": { amb: "cozinha", parede: "0", tampo: "Altura", esgoto: { inox: "0.20", topo: "0" }, torneira: "mesa", quente: false, kit: "bancada_cozinha",
      cubas: [{ x: "se(Com_cooktop e (Comprimento >= 1.8); -Comprimento/2 + min(0.6; Comprimento*0.28); -Comprimento/2 + max(0.45; Comprimento*0.3))", visivel: "Com_cuba e (Comprimento >= 1)" }],
      fonte: "js/familiasmobcoz.js ra-coz-inferior (furo da cuba: a mesma conta do gerador; cuba de inox de 20 cm)" },
    "ra-coz-ilha": { amb: "cozinha", piso: true, parede: "-Profundidade/2 + (Profundidade - Balanco)/2", tampo: "Altura", esgoto: { inox: "0.20", topo: "0" }, torneira: "mesa", quente: false, kit: null,
      cubas: [{ x: "se(Com_cooktop e (Comprimento >= 1.8); -Comprimento/4; -Comprimento/6)", visivel: "Com_cuba e (Comprimento >= 1.4)" }],
      fonte: "js/familiasmobcoz.js ra-coz-ilha (a ilha não encosta em parede: os pontos sobem pelo piso, sob a cuba)" },
    "ra-banho-bancada": { amb: "banheiro", parede: "0", tampo: "Altura_tampo", esgoto: "apoio", torneira: "mesa", quente: true, kit: "bancada_banho",
      cubas: [{ x: "se(Cubas >= 2; -Comprimento/4; 0)" }, { x: "Comprimento/4", visivel: "Cubas >= 2" }],
      fonte: "js/familiasmobcoz.js ra-banho-bancada (cuba de apoio: 1 no eixo ou 2 a ±Comprimento/4)" },
    "ra-lazer-churrasqueira-tijolinho-a": { amb: "gourmet", parede: "0", tampo: "Altura_bancada", esgoto: "embutir", torneira: "mesa", quente: false, kit: "bancada_cozinha",
      cubas: [{ x: "-(Largura_bancada + Largura_forno + Largura_torre)/2 + Largura_bancada/2 - Largura_bancada*0.18", visivel: "Cuba" }],
      fonte: "js/familiaschurras.js opção A (cuba de inox na bancada, a 18 % da largura à esquerda do meio)" },
    /* R03 (Casa 487): famílias da obra feitas por fórmula (sem `mob`), sem conectores: bancadas R14 (cuba redonda no eixo, x = 0; face do tampo em 0,855 m,
       z = 0 é o fundo) e a gourmet R11 (cuba em x = Comp_pia/2; Alt_bancada/Alt_cuba são parâmetros da família) */
    "c487-r14-bancada-suite": { amb: "banheiro", parede: "0", tampo: "0.855", esgoto: "apoio", cubas: [{ x: "0" }], torneira: "mesa", quente: true, kit: "bancada_banho",
      fonte: "familia c487-r14-bancada-suite (R14): cuba redonda de apoio no eixo; tampo de granito com face a 0,855 m" },
    "c487-r14-bancada-social": { amb: "banheiro", parede: "0", tampo: "0.855", esgoto: "apoio", cubas: [{ x: "0" }], torneira: "mesa", quente: true, kit: "bancada_banho",
      fonte: "familia c487-r14-bancada-social (R14): cuba redonda de apoio no eixo; tampo de granito com face a 0,855 m" },
    "c487-gourmet-churrasqueira-lenha": { amb: "gourmet", parede: "0", tampo: "Alt_bancada", esgoto: { inox: "Alt_cuba", topo: "0" }, cubas: [{ x: "Comp_pia / 2", visivel: "Com_pia" }], torneira: "mesa", quente: false, kit: "bancada_cozinha",
      fonte: "familia c487-gourmet-churrasqueira-lenha (R11): cuba de inox em x = Comp_pia/2, fundo Alt_cuba abaixo do tampo" },
    "ra-cat-tanque-lavanderia-gabinete": { amb: "servico", parede: "0", tampo: "Altura", esgoto: { inox: "min(0.3; Altura*0.45)", topo: "0" }, torneira: "parede", quente: false, kit: "tanque_familia",
      cubas: [{ x: "0" }], fonte: "js/familiascat.js G.tanque (bacia de min(0,30; 45 % da altura) no eixo)" }
  };

  /* os parâmetros que a família ganha (instância: a escolha da torneira; tipo: as alturas com fonte) */
  function parametros(e, R) {
    var parede = e.torneira === "parede", alturaParede = e.amb === "servico" ? R.tanqueParede : (e.amb === "banheiro" ? null : R.piaParede);
    var ps = [
      { nome: "Torneira_de_parede", tipoDado: "simnao", escopo: "instancia", valor: parede, grupo: "Instalação", descricao: "Torneira de PAREDE (o ponto de água vai para a parede, acima do tampo); desligado = torneira de MESA (ponto sob o tampo, " + FONTE_DECA + ")" },
      { nome: "Agua_quente", tipoDado: "simnao", escopo: "instancia", valor: !!e.quente, grupo: "Instalação", descricao: "Misturador (água fria + quente): dois pontos a ±Agua_afastamento/2 do eixo da cuba; desligado = só água fria" },
      { nome: "Agua_afastamento", tipoDado: "comprimento", escopo: "tipo", valor: R.entreMesa, grupo: "Instalação", descricao: "Entre-eixos dos pontos de água: Deca p.116 (200 mm) ou mais, para 10 cm livres da saída do esgoto (critério RA R-C3, FRENTE H5)" },
      { nome: "Agua_abaixo_tampo", tipoDado: "comprimento", escopo: "tipo", valor: R.aguaAbaixoTampo, grupo: "Instalação", descricao: "Torneira de mesa: ponto de água abaixo da face do tampo — " + FONTE_DECA + " (220 mm)" },
      { nome: "Agua_altura_parede", tipoDado: "comprimento", escopo: "tipo", valor: alturaParede != null ? alturaParede : R.metalParedeAcimaTampo, grupo: "Instalação",
        descricao: alturaParede != null ? "Torneira de parede: altura do ponto acima do PISO — " + FONTE_TIGRE + (e.amb === "servico" ? " (TQ 115 cm)" : " (PIA 110 cm)") : "Torneira de parede: ponto acima da face do TAMPO — " + FONTE_DECA + " (170 a 220 mm; adotado 220)" }
    ];
    var ea = typeof e.esgoto === "string" ? (e.esgoto === "apoio" ? R.esgotoApoio : R.esgotoEmbutir) : null;
    if (ea != null) ps.push({ nome: "Esgoto_abaixo_tampo", tipoDado: "comprimento", escopo: "tipo", valor: ea, grupo: "Instalação", descricao: "Ponto de esgoto abaixo da face do tampo — " + FONTE_DECA + ", tabela 3 (o maior da classe: o sifão alcança o ponto mais alto encurtando o tubo)" });
    else ps.push({ nome: "Esgoto_abaixo_fundo", tipoDado: "comprimento", escopo: "tipo", valor: R.esgotoAbaixoFundo, grupo: "Instalação", descricao: "Cuba de inox: o sifão desce até 6 cm abaixo do fundo e vai à parede (o desenho do js/hidlouca.js e do js/marmoraria.js)" });
    return ps;
  }
  function conectores(e) {
    var out = [], alturaParedeAbs = e.amb !== "banheiro";
    var yA = "se(Torneira_de_parede; " + (alturaParedeAbs ? "Agua_altura_parede" : "(" + e.tampo + ") + Agua_altura_parede") + "; (" + e.tampo + ") - Agua_abaixo_tampo)";
    var yE = typeof e.esgoto === "string" ? "(" + e.tampo + ") - Esgoto_abaixo_tampo" : "(" + e.tampo + ") - (" + e.esgoto.topo + ") - (" + e.esgoto.inox + ") - Esgoto_abaixo_fundo";
    if (e.piso) { yA = "0"; yE = "0"; }
    e.cubas.forEach(function (c, i) {
      var suf = i ? "_" + (i + 1) : "", vis = c.visivel || null, cx = "(" + c.x + ")";
      function v(extra) { return vis && extra ? "(" + vis + ") e (" + extra + ")" : (vis || extra || null); }
      var nomeC = e.cubas.length > 1 ? " (cuba " + (i + 1) + ")" : "", ond = e.piso ? ", pelo piso" : "";
      var es = { id: "esgoto" + suf, nome: "Esgoto (saída do sifão" + ond + ")" + nomeC, sistema: "esgoto", dn: "0", x: cx, y: yE, z: e.parede };
      var af = { id: "af" + suf, nome: "Água fria (torneira" + ond + ")" + nomeC, sistema: "agua_fria", dn: "0", x: cx + " + Agua_afastamento/2", y: yA, z: e.parede };
      var aq = { id: "aq" + suf, nome: "Água quente (misturador" + ond + ")" + nomeC, sistema: "agua_quente", dn: "0", x: cx + " - Agua_afastamento/2", y: yA, z: e.parede, visivel: v("Agua_quente") };
      if (vis) { es.visivel = vis; af.visivel = vis; }
      out.push(es, af, aq);
    });
    return out;
  }
  function temAgua(fam) { return arr(fam && fam.conectores).some(function (k) { return k && k.sistema === "agua_fria"; }); }
  /* aplicar(fam): a cópia da família com os pontos e os parâmetros (a que já tem água fria volta igual) */
  function aplicar(fam) {
    if (!fam || !fam.id) return fam;
    var e = ESPEC[fam.mob || fam.id];
    if (!e || temAgua(fam)) return fam;
    var R = regra(), f = copia(fam), nomes = {};
    arr(f.parametros).forEach(function (p) { nomes[String(p.nome).toLowerCase()] = 1; });
    parametros(e, R).forEach(function (p) { if (!nomes[p.nome.toLowerCase()]) f.parametros.push(p); });
    f.conectores = arr(f.conectores).filter(function (k) { return k && k.sistema !== "esgoto"; }).concat(conectores(e));
    f.sistemas = ["esgoto", "agua_fria", "agua_quente"];
    /* a face da parede = o fundo da peça (js/familia.js faceParede): o chapéu da churrasqueira, atrás do fundo, não tira o ponto da parede */
    if (!e.piso) f.faceParede = e.parede;
    f.pontosAgua = { amb: e.amb, kit: e.kit, piso: !!e.piso, fonte: e.fonte, regra: "FRENTE H7 — js/familiasagua.js" };
    return f;
  }
  /* ATUALIZAR AS FAMÍLIAS DE UM PROJETO ABERTO (F7 da Casa 487, 28/10/2026). POR QUE: o .opbim leva CÓPIAS das famílias (pasta familias/), feitas
     quando o projeto foi salvo — as da Casa 487 são "embrulhos" (geometria "mob", `mob` = o id da biblioteca) feitos ANTES dos pontos de água
     existirem: bancadas de banheiro, a ilha e a banheira de hidromassagem ficaram "sem conectores no arquivo do cliente" e o Traçar não ligava nada.
     Regra: família do arquivo SEM nenhum conector hidráulico (água fria/quente ou esgoto) cuja base (fam.mob || fam.id) tem os pontos na biblioteca
       (1) pela ESPEC deste arquivo (aplicar: pontos + parâmetros da torneira), ou
       (2) pelos conectores da família da biblioteca com o MESMO id-base (ex.: ra-banho-hidromassagem, F3) — copiados, sem mexer em geometria,
           tipos nem parâmetros escolhidos pelo cliente; só vale se TODO nome citado pela fórmula do conector existe nos parâmetros da família do arquivo;
     recebe os pontos. Família que já tem algum conector hidráulico NÃO muda (idempotente). Devolve { familias (nova lista), atualizadas[{ id, base, via }], avisos[] }. */
  var SIS_HID = { agua_fria: 1, agua_quente: 1, esgoto: 1 };
  function temHidraulico(fam) { return arr(fam && fam.conectores).some(function (k) { return k && SIS_HID[k.sistema]; }); }
  function nomesDaFormula(s) { return String(s == null ? "" : s).replace(/[0-9]+(\.[0-9]+)?/g, " ").split(/[^A-Za-zÀ-ÿ_]+/).filter(function (x) { return x && !/^(se|e|ou|nao|não|min|max|abs|sen|cos|raiz)$/i.test(x); }); }
  function atualizarDoProjeto(familias) {
    var out = { familias: [], atualizadas: [], avisos: [] }, RA = dep("FamiliasRA", "./familiasra.js");
    arr(familias).forEach(function (f) {
      if (!f || !f.id || temHidraulico(f)) { out.familias.push(f); return; }
      var base = f.mob || f.id, g = null, via = "";
      if (ESPEC[base]) { g = aplicar(f); via = "pontos de água da biblioteca (js/familiasagua.js, " + base + ")"; if (g === f || !temHidraulico(g)) g = null; }
      else if (RA && RA.obter) {
        var lib = null; try { lib = RA.obter(base, true); } catch (e) { lib = null; }
        var cs = arr(lib && lib.conectores).filter(function (k) { return k && SIS_HID[k.sistema]; });
        if (cs.length) {
          var nomes = {}; arr(f.parametros).forEach(function (p) { nomes[String(p.nome).toLowerCase()] = 1; });
          var faltam = [];
          arr(lib.conectores).forEach(function (k) { ["x", "y", "z", "dn", "visivel"].forEach(function (c) { nomesDaFormula(k[c]).forEach(function (n) { if (!nomes[n.toLowerCase()] && faltam.indexOf(n) < 0) faltam.push(n); }); }); });
          if (faltam.length) out.avisos.push("Família " + f.id + ": a biblioteca (" + base + ") tem os conectores, mas a cópia do arquivo não tem o(s) parâmetro(s) " + faltam.join(", ") + " — conectores NÃO copiados.");
          else { g = copia(f); g.conectores = copia(lib.conectores); g.sistemas = (function () { var s = arr(g.sistemas).slice(); arr(lib.sistemas).concat(cs.map(function (k) { return k.sistema; })).forEach(function (x) { if (s.indexOf(x) < 0) s.push(x); }); return s; })(); via = "conectores da família da biblioteca " + base; }
        }
      }
      if (g) { out.familias.push(g); out.atualizadas.push({ id: f.id, base: base, via: via }); } else out.familias.push(f);
    });
    return out;
  }
  /* as que já estão registradas + as que vierem (o embrulho do registrar) */
  function completarRegistradas() {
    var RA = dep("FamiliasRA", "./familiasra.js"); if (!RA || !RA.obter || !RA.registrar) return 0;
    if (!RA._hidCubas) {
      var orig = RA.registrar;
      RA.registrar = function (fams) { return orig.call(this, arr(fams).map(aplicar)); };
      RA._hidCubas = true;
    }
    var n = 0;
    Object.keys(ESPEC).forEach(function (id) { var f = RA.obter(id, true); if (f && !temAgua(f)) { RA.registrar([f]); n++; } });
    return n;
  }
  /* o que a peça de água EXIGE (o auditor do js/hidequipar.js): os sistemas e quantas cubas, pelos valores avaliados */
  function ehPecaDeAgua(famId) { return !!ESPEC[famId]; }
  var FamiliasAgua = { ESPEC: ESPEC, REGRA: regra, aplicar: aplicar, completarRegistradas: completarRegistradas, atualizarDoProjeto: atualizarDoProjeto, ehPecaDeAgua: ehPecaDeAgua, conectoresDe: conectores, FONTE_DECA: FONTE_DECA, FONTE_TIGRE: FONTE_TIGRE };
  global.FamiliasAgua = FamiliasAgua;
  completarRegistradas();
  if (typeof module !== "undefined" && module.exports) module.exports = FamiliasAgua;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
