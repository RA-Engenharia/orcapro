/* =====================================================================
 * hides.js — ESGOTO SANITÁRIO: dimensionamento pelo método das Unidades
 * Hunter de Contribuição (motor PURO, ES5, Node-testável). Fase 1 do
 * docs/hidro/PLANO-HIDROSSANITARIO.md; contrato em docs/hidro/CONTRATO.md
 * (sistemas.esgoto).
 *
 * O que faz:
 *  1. grafo do esgoto (js/hidgrafo.js) com o SENTIDO do traço: no horizontal
 *     p1 → p2 (a convenção do biminst: esgoto desce de p1 para p2); no
 *     vertical, de cima para baixo;
 *  2. UHC de cada aparelho/ralo e UHC ACUMULADO a jusante;
 *  3. classe do trecho: ramal de descarga (de UM aparelho até a primeira
 *     junção/desconector), ramal de esgoto, tubo de queda (vertical) e
 *     subcoletor (horizontal depois de um tubo de queda, ou marcado);
 *  4. DN pela tabela da classe; ⚠ o DN NUNCA diminui a jusante e nunca fica
 *     abaixo do DN mínimo do aparelho mais exigente a montante (a bacia);
 *  5. declividade mínima por DN;
 *  6. ventilação: primária no topo de cada tubo de queda, ramal e coluna de
 *     ventilação pela tabela, distância máxima do desconector à ventilação;
 *  7. desconectores: ralo seco tem de passar por caixa/ralo sifonado.
 *
 * ⚠ Nenhum valor de norma aqui (CONTRATO §0): UHC, DN mínimo, tabelas de
 *   ramal, tubo de queda, coletor, declividade e ventilação vêm do HidNormas.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? n : d; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function GR() { return dep("HidGrafo", "./hidgrafo.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  var MM = 1000;   /* mm por m */
  var EPS = 1e-9;   // hid:ok tolerância de ponto flutuante nas comparações (não é valor de norma)
  function f2(v) { return v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }

  /* família → aparelho (o mesmo nome das tabelas do CONTRATO §1.1) */
  var APARELHO_DA_FAMILIA = { "ra-bacia": "bacia_caixa_acoplada", "ra-lavatorio": "lavatorio" };
  /* peça do biminst que CONTRIBUI com UHC próprio (o ralo recebe o chuveiro/piso) e as que são DESCONECTOR */
  var PECA_COM_UHC = { ralo_sifonado: 1, ralo_seco: 1, caixa_sifonada: 1 };
  var DESCONECTOR = { ralo_sifonado: 1, caixa_sifonada: 1 };
  /* aparelho com desconector (sifão) próprio: conta como desconector na distância à ventilação */
  /* a família hid-* declara `aparelhoPrograma`: HidAF traduz para a chave da norma (hidaf.js); sem HidAF só os ra-* */
  function aparelhoFam(famId) {
    var AF = dep("HidAF", "./hidaf.js");
    if (AF && AF.aparelhoDaFamilia) return AF.aparelhoDaFamilia(famId);
    return APARELHO_DA_FAMILIA[famId] || null;
  }
  var SIFAO_PROPRIO = { bacia_caixa_acoplada: 1, bacia_valvula: 1, lavatorio: 1, pia_cozinha: 1, tanque: 1, mictorio: 1, bide: 1 };
  var BACIA = { bacia_caixa_acoplada: 1, bacia_valvula: 1 };
  /* aparelhos que ESTÃO na tabela de aparelhos da NBR 8160 (tab. 3): nunca caem na tabela de
     "aparelhos não relacionados" (tab. 4) — a norma reserva a tab. 4 a quem não está na 3 */
  var TAB3 = { bacia_caixa_acoplada: 1, bacia_valvula: 1, banheira: 1, filtro_bebedouro: 1, bide: 1, chuveiro: 1, lavatorio: 1, pia_cozinha: 1, tanque: 1,
               maquina_lavar_louca: 1, maquina_lavar_roupa: 1, mictorio: 1, mictorio_valvula: 1, mictorio_caixa: 1, mictorio_automatica: 1, mictorio_calha: 1, chuveiro_coletivo: 1, lavatorio_uso_geral: 1 };
  /* MICTÓRIO (NBR 8160:1999, Tabela 3, p.16): UHC e DN do ramal de descarga dependem do TIPO DE DESCARGA. A família
     hid-mictorio tem a propriedade de instância Tipo_descarga (índice desta lista) e Comprimento_calha (m).
     Sem valor na instância: PADRÃO DECLARADO = válvula de descarga (a linha de maior UHC e maior DN — lado seguro),
     com premissa no memorial. "De calha": UHC por METRO de calha (nota 2) × comprimento; sem comprimento = pendência. */
  var MICTORIO_DESCARGA = ["mictorio_valvula", "mictorio_caixa", "mictorio_automatica", "mictorio_calha"];
  var MICTORIO_NOME = { mictorio_valvula: "válvula de descarga", mictorio_caixa: "caixa de descarga", mictorio_automatica: "descarga automática", mictorio_calha: "de calha" };
  function mictorioDe(inst) {
    inst = inst || {};
    var cru = inst.Tipo_descarga, ix = cru === "" || cru == null ? null : num(cru, null), padrao = ix == null || !MICTORIO_DESCARGA[ix];
    var ap = MICTORIO_DESCARGA[padrao ? 0 : ix], comp = ap === "mictorio_calha" ? num(inst.Comprimento_calha, null) : null;
    return { aparelho: ap, padrao: padrao, comprimento_m: comp, nome: MICTORIO_NOME[ap],
             texto: "Mictório: " + MICTORIO_NOME[ap] + (padrao ? " (padrão declarado: o tipo de maior UHC e DN da Tabela 3 da NBR 8160:1999 — mude em Propriedades › Tipo_descarga)" : " (Propriedades › Tipo_descarga)") };
  }
  /* fora do uso residencial a tab. 3 pede a linha de uso geral/coletivo (UHC maior). Revisão F7 M2:
     escritório com lavatório "de residência" (1 UHC no lugar de 2) subdimensionava ramal e TQ. */
  var USO_GERAL = { lavatorio: "lavatorio_uso_geral", chuveiro: "chuveiro_coletivo" };

  function aviso(lista, grav, texto, elementos, corrigir) {
    lista.push({ id: "es-" + lista.length, sistema: "esgoto", gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null });
  }

  /* o menor DN da tabela que atende: linhas [{dn, <col>}] com <col> ≥ alvo */
  /* "150x185x75" → corpo 150, saída 75 (peça do biminst); família hid-*: campos corpo/saida do grafo */
  function numerosDn(dn) { var m = String(dn == null ? "" : dn).match(/\d+(\.\d+)?/g); return m ? m.map(Number) : []; }
  function dnSaidaPeca(pc) { if (pc.saida != null) return num(pc.saida, null); var v = numerosDn(pc.dn); return v.length >= 2 ? v[v.length - 1] : null; }
  function dnCorpoPeca(pc) { if (pc.corpo != null) return num(pc.corpo, null); var v = numerosDn(pc.dn); return v.length ? v[0] : null; }
  function menorDn(linhas, col, alvo) {
    var ls = linhas.filter(function (l) { return num(l[col], null) != null && num(l[col], 0) >= alvo; }).sort(function (a, b) { return num(a.dn, 0) - num(b.dn, 0); });
    return ls.length ? ls[0] : null;
  }

  function calcular(entrada, ctx, R) {
    var B = BI(), Gr = GR(), Nn = NR();
    entrada = entrada || {}; ctx = ctx || Nn.contexto();
    var opc = entrada.opcoes || {}, mod = entrada.modelo || {}, est = mod.estado || {};
    R = R || B.rede(est, mod.avaliarFam);
    var travados = {}; arr(opc.travados).forEach(function (id) { travados[id] = 1; });
    var out = { status: "ok", trechos: [], pontos: [], ventilacao: [], caixas: [], verificacoes: [], avisos: [], premissas: [], ops: [], opsDesfazer: [] };
    function premissa(item, valor) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: "padrao_motor" }); }
    var uso = entrada.programa && entrada.programa.uso ? String(entrada.programa.uso) : null, residencial = !!uso && /^residencial/.test(uso);
    var G = Gr.montar(R, est, ["esgoto"]);
    if (!G.ordemA.length) { out.status = "vazio"; return out; }
    function verif(alvo, nome, valor, limite, unidade, eta, ok, passos, fonte) {
      out.verificacoes.push({ id: "es-v" + out.verificacoes.length, sistema: "esgoto", alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade, eta: eta, ok: ok,
                              status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos || [], fonte: fonte || null });
    }

    /* 1) sentido */
    var ent = {}, sai = {};
    G.ordemN.forEach(function (id) { ent[id] = []; sai[id] = []; });
    G.ordemA.forEach(function (eid) {
      var e = G.arestas[eid];
      if (e.vertical) { if (G.nos[e.a].y >= G.nos[e.b].y) { e.de = e.a; e.para = e.b; } else { e.de = e.b; e.para = e.a; } }
      else { e.de = e.a; e.para = e.b; }
      sai[e.de].push(eid); ent[e.para].push(eid);
    });
    G.ordemN.forEach(function (id) {
      if (sai[id].length > 1) aviso(out.avisos, "erro", "o esgoto se divide no nó " + id + " (" + sai[id].length + " saídas): esgoto só se junta, nunca se divide — confira o sentido dos trechos", sai[id].map(function (eid) { return G.arestas[eid].trecho; }), { texto: "inverter o trecho desenhado ao contrário (p1 → p2 no sentido do escoamento)" });
    });

    /* 2) ordem topológica (Kahn); ciclo = aviso */
    var grauE = {}, fila = [], topo = [];
    G.ordemN.forEach(function (id) { grauE[id] = ent[id].length; if (!grauE[id]) fila.push(id); });
    while (fila.length) { var n0 = fila.shift(); topo.push(n0); sai[n0].forEach(function (eid) { var p = G.arestas[eid].para; if (--grauE[p] === 0) fila.push(p); }); }
    if (topo.length < G.ordemN.length) aviso(out.avisos, "erro", "o esgoto tem um ciclo (o escoamento volta ao mesmo ponto): " + (G.ordemN.length - topo.length) + " nó(s) fora do cálculo", [], { texto: "conferir o sentido dos trechos do ciclo" });

    /* 3) contribuições próprias (aparelho ou ralo/caixa) */
    var forc = entrada.aparelhos || {}, proprio = {};
    topo.forEach(function (id) {
      var n = G.nos[id], ap = null, quem = null;
      if (n.aparelho) { ap = forc[n.aparelho.famInst] || aparelhoFam(n.aparelho.famId); quem = n.aparelho.famInst; }
      else if (n.peca && PECA_COM_UHC[n.peca.peca]) { ap = forc[n.peca.id] || n.peca.peca; quem = n.peca.id; }
      if (!quem) return;
      /* uso geral × residência (tab. 3): sem programa, o lado seguro (uso geral), declarado */
      if (n.aparelho && USO_GERAL[ap] && !residencial && !forc[quem] && Nn.consulta("es.aparelhos", { aparelho: USO_GERAL[ap] }, "uhc").ok) {
        if (!uso) premissa("UHC de " + ap + " sem uso informado", "linha de uso geral/coletivo da NBR 8160 (lado seguro) — informe o uso da edificação");
        ap = USO_GERAL[ap];
      }
      var pt = { no: id, famInst: n.aparelho ? n.aparelho.famInst : null, peca: n.peca ? n.peca.id : null, aparelho: ap, uhc: null, dnMin: null, status: "pendente" };
      /* ⚠ DN de SAÍDA da peça (caixa/ralo "AxBxS"): o tubo que sai nunca é menor que ela
         (revisão F7 M1: o motor trocava a saída DN 75 da caixa por um tubo DN 40) */
      var saidaPeca = n.peca ? dnSaidaPeca(n.peca) : null;
      if (!ap) ctx.pendencia("entrada.aparelhos[" + quem + "]", "a família " + (n.aparelho && n.aparelho.famId) + " não tem aparelho de norma associado (UHC)", "esgoto");
      else if (ap === "mictorio" || ap === "mictorio_calha") {
        /* tipo de descarga pela propriedade da instância (padrão declarado: válvula) */
        var fMi = arr(est.familias).filter(function (f0) { return f0.id === quem; })[0], md = mictorioDe(fMi && fMi.inst);
        if (ap === "mictorio_calha" && md.aparelho !== "mictorio_calha") md = { aparelho: "mictorio_calha", padrao: false, comprimento_m: num(fMi && fMi.inst && fMi.inst.Comprimento_calha, null), nome: MICTORIO_NOME.mictorio_calha };
        ap = pt.aparelho = md.aparelho; pt.mictorio = md.nome;
        if (md.padrao) premissa("tipo de descarga do mictório " + quem, "válvula de descarga — a linha de maior UHC e maior DN da Tabela 3 da NBR 8160:1999 (lado seguro); mude em Propriedades › Tipo_descarga");
        var cuM = ctx.consulta("es.aparelhos", { aparelho: ap }, "uhc", "ponto " + quem), cdM = ctx.consulta("es.aparelhos", { aparelho: ap }, "dn_min", "ponto " + quem);
        if (cuM.ok) pt.uhc = num(cuM.valor, null);
        if (cdM.ok) pt.dnMin = num(cdM.valor, null);
        pt.status = cuM.ok && cdM.ok ? "ok" : "pendente";
        if (ap === "mictorio_calha" && pt.uhc != null) {
          /* nota 2 da Tabela 3: UHC por metro de calha; o trecho é ramal de ESGOTO (Tabela 5) */
          if (!(md.comprimento_m > 0)) { ctx.pendencia("entrada.aparelhos[" + quem + "].Comprimento_calha", "mictório de calha: informe o comprimento da calha (a NBR 8160:1999, Tabela 3, dá UHC por metro)", "esgoto"); pt.uhc = null; pt.status = "pendente"; }
          else {
            pt.uhcPorMetro = pt.uhc; pt.comprimentoCalha_m = md.comprimento_m; pt.uhc = pt.uhcPorMetro * md.comprimento_m;
            var tRe = ctx.linhas("es.ramal_esgoto", null, "mictório de calha (ramal de esgoto)"), lRe = tRe ? menorDn(tRe, "uhc_max", pt.uhc) : null;
            if (lRe) pt.dnMin = Math.max(pt.dnMin || 0, num(lRe.dn, 0));
            else { ctx.pendencia("es.ramal_esgoto", "mictório de calha com " + f2(pt.uhc) + " UHC acima da tabela de ramais de esgoto", "esgoto"); pt.status = "pendente"; }
          }
        }
      }
      else if (ap === "caixa_sifonada" && !Nn.consulta("es.aparelhos", { aparelho: ap }, "uhc").ok) {
        /* caixa sifonada sem linha própria: soma só o que chega a ela (ralo/aparelhos) */
        pt.uhc = 0; pt.status = "ok"; pt.semUhcProprio = true;
      } else if (!(n.aparelho && TAB3[ap]) && !Nn.consulta("es.aparelhos", { aparelho: ap }, "uhc").ok && sai[id].length === 1 && Nn.consulta("es.uhc_por_dn", { dn: G.arestas[sai[id][0]].dn }, "uhc").ok) {
        /* aparelho/ralo fora da tabela de aparelhos: UHC pelo DN do ramal de descarga
           que sai dele (tabela de "aparelhos não relacionados" da norma) */
        var dnS = G.arestas[sai[id][0]].dn, cn = ctx.consulta("es.uhc_por_dn", { dn: dnS }, "uhc", "ponto " + quem);
        pt.uhc = num(cn.valor, null); pt.dnMin = dnS; pt.status = "ok"; pt.porDn = true;
      } else {
        /* ⚠ FICHA DA PEÇA (js/hidpecas.js): a família colocada diz qual linha de UHC/DN é a dela (só quando é o MESMO
           aparelho de norma que o motor escolheu — uso geral, mictório e aparelho forçado seguem a tabela direta) */
        var PCs = dep("HidPecas", "./hidpecas.js"), fxU = n.aparelho && PCs && PCs.uhcDaFamilia ? PCs.uhcDaFamilia(n.aparelho.famId, ap) : null;
        var cu = fxU ? ctx.consulta(fxU.uhc.ref.chave, fxU.uhc.ref.filtro, fxU.uhc.ref.coluna, "ponto " + quem) : ctx.consulta("es.aparelhos", { aparelho: ap }, "uhc", "ponto " + quem);
        var cd = fxU && fxU.dnMin ? ctx.consulta(fxU.dnMin.ref.chave, fxU.dnMin.ref.filtro, fxU.dnMin.ref.coluna, "ponto " + quem) : ctx.consulta("es.aparelhos", { aparelho: ap }, "dn_min", "ponto " + quem);
        if (fxU) pt.ficha = fxU.peca;
        if (cu.ok) pt.uhc = num(cu.valor, null);
        if (cd.ok) pt.dnMin = num(cd.valor, null);
        pt.status = cu.ok && cd.ok ? "ok" : "pendente";
      }
      if (saidaPeca) { pt.dnSaida = saidaPeca; pt.dnMin = Math.max(pt.dnMin || 0, saidaPeca); }
      proprio[id] = pt; out.pontos.push(pt);
    });

    /* 4) acumulados (UHC, DN mínimo, bacia, tubo de queda a montante, ramal de descarga) */
    var uhc = {}, pend = {}, dnMinAc = {}, temBacia = {}, temTQ = {}, descarga = {};
    /* NBR 8160:1999, 5.1.4.2: em prédio RESIDENCIAL, no coletor e nos subcoletores conta só o aparelho de MAIOR
       descarga de cada banheiro. Banheiro = ambiente do modelo (entrada.ambientes[id] ou inst.ambiente da
       família). Sem ambiente: soma todos (lado seguro, declarado); opcoes.somarTodosUhc = conservador. */
    var ambDe = {}, ambs = entrada.ambientes || {};
    arr(est.familias).forEach(function (f) { var a0 = ambs[f.id] || (f.inst && f.inst.ambiente) || f.ambiente; if (a0) ambDe[f.id] = String(a0); });
    Object.keys(ambs).forEach(function (k) { if (!ambDe[k]) ambDe[k] = String(ambs[k]); });
    var porAmb = {}, semAmb = {}, algumAmb = false;
    var E = {};
    topo.forEach(function (id) {
      var p0 = proprio[id];
      uhc[id] = p0 && p0.uhc != null ? p0.uhc : 0;
      pend[id] = !!(p0 && p0.uhc == null);
      dnMinAc[id] = p0 && p0.dnMin ? p0.dnMin : 0;
      temBacia[id] = !!(p0 && BACIA[p0.aparelho]);
      temTQ[id] = false;
      porAmb[id] = {}; semAmb[id] = 0;
      if (p0 && p0.uhc != null) { var ak = ambDe[p0.famInst || p0.peca]; if (ak) { algumAmb = true; porAmb[id][ak] = Math.max(porAmb[id][ak] || 0, p0.uhc); } else semAmb[id] += p0.uhc; }
      ent[id].forEach(function (eid) {
        var r = E[eid]; if (!r) return;
        Object.keys(r.porAmb || {}).forEach(function (k) { porAmb[id][k] = Math.max(porAmb[id][k] || 0, r.porAmb[k]); }); semAmb[id] += r.semAmb || 0;
        uhc[id] += r.uhc; pend[id] = pend[id] || r.pend; dnMinAc[id] = Math.max(dnMinAc[id], r.dnMinAc); temBacia[id] = temBacia[id] || r.temBacia; temTQ[id] = temTQ[id] || r.classe === "tubo_queda" || r.temTQ;
      });
      /* ramal de descarga: o nó É o aparelho/ralo, ou só recebe um ramal de descarga e não é desconector */
      var n = G.nos[id];
      if (p0 && p0.aparelho && p0.aparelho !== "caixa_sifonada" && !ent[id].length) descarga[id] = p0;
      else if (ent[id].length === 1 && !p0 && E[ent[id][0]] && E[ent[id][0]].classe === "ramal_descarga") descarga[id] = E[ent[id][0]].descargaDe;
      sai[id].forEach(function (eid) {
        var e = G.arestas[eid], classe;
        if (descarga[id]) classe = "ramal_descarga";
        else if (e.vertical) classe = "tubo_queda";
        else if (temTQ[id] || e.aplicacao === "subcoletor") classe = "subcoletor";
        else classe = "ramal_esgoto";
        E[eid] = { porAmb: porAmb[id], semAmb: semAmb[id], e: e, uhc: uhc[id], pend: pend[id], dnMinAc: dnMinAc[id], temBacia: temBacia[id], temTQ: temTQ[id], classe: classe, descargaDe: descarga[id] || null,
                   travado: !!travados[e.trecho], passos: [], pendencias: [], dn: null, status: "pendente" };
        if (n.peca && DESCONECTOR[n.peca.peca]) E[eid].saiDeDesconector = n.peca.peca;
      });
    });

    /* 4b) caixa sifonada pelo ΣUHC que recebe (NBR 8160, tabela da caixa sifonada; chave
       es.caixa_sifonada.dn). Revisão F7 M1: a regra existia na base e nenhum motor a usava —
       caixa 100×100 recebendo 8 UHC passava calada. */
    topo.forEach(function (id) {
      var n = G.nos[id]; if (!n.peca || n.peca.peca !== "caixa_sifonada") return;
      var U = uhc[id], corpo = dnCorpoPeca(n.peca), quem = n.peca.id, rot = "caixa sifonada " + quem;
      if (pend[id]) { verif(quem, "caixa sifonada pelo ΣUHC", null, null, "mm", null, null, ["pendente: UHC a montante"], null); return; }
      var tc = ctx.linhas("es.caixa_sifonada.dn", null, rot);
      if (!tc) { verif(quem, "caixa sifonada pelo ΣUHC", corpo, null, "mm", null, null, ["pendente: tabela da caixa sifonada"], null); return; }
      var cand = tc.filter(function (x) { return num(x.uhc_max, null) != null && num(x.dn_caixa, null) != null && num(x.uhc_max, 0) >= U; }).sort(function (a, b) { return a.uhc_max - b.uhc_max; });
      var fonteC = Nn.fonte("es.caixa_sifonada.dn");
      if (!cand.length) {
        var maxU = Math.max.apply(null, tc.map(function (x) { return num(x.uhc_max, 0); }));
        verif(quem, "caixa sifonada pelo ΣUHC", U, maxU, "UHC", U / maxU, false, ["ΣUHC = " + U + " acima do máximo da tabela (" + maxU + ")"], fonteC);
        aviso(out.avisos, "erro", rot + " recebe " + U + " UHC, acima do máximo da tabela (" + maxU + ")", [quem], { texto: "dividir a contribuição com uma caixa sifonada adicional" });
        return;
      }
      var req = num(cand[0].dn_caixa, 0);
      out.caixas.push({ id: quem, uhc: U, dnReq: req, corpo: corpo, saida: dnSaidaPeca(n.peca) });
      if (corpo == null) {
        ctx.pendencia("es.caixa_sifonada.corpo[" + quem + "]", "DN do corpo da caixa não identificado na peça", rot);
        verif(quem, "caixa sifonada pelo ΣUHC", null, req, "mm", null, null, ["ΣUHC = " + U + " → caixa DN ≥ " + req + "; corpo da peça desconhecido"], fonteC);
        return;
      }
      var okC = corpo >= req;
      verif(quem, "caixa sifonada pelo ΣUHC", corpo, req, "mm", req / corpo, okC, ["ΣUHC = " + U + " ≤ " + cand[0].uhc_max + " → caixa DN ≥ " + req + "; peça DN " + corpo], fonteC);
      if (!okC) aviso(out.avisos, "erro", rot + " DN " + corpo + " recebe " + U + " UHC: a tabela pede caixa DN " + req, [quem], { texto: "trocar a caixa sifonada por uma de DN " + req + " (ou dividir a contribuição)" });
    });

    /* 5) tubos de queda: cadeias verticais (o DN é o da base, uniforme) e nº de pavimentos */
    var cadeia = {}, cadeias = {};
    topo.forEach(function (id) {
      sai[id].forEach(function (eid) {
        var r = E[eid]; if (!r || r.classe !== "tubo_queda") return;
        var acima = ent[id].filter(function (x) { return E[x] && E[x].classe === "tubo_queda"; })[0];
        var c = acima ? cadeia[acima] : "TQ" + Object.keys(cadeias).length;
        cadeia[eid] = c; (cadeias[c] = cadeias[c] || []).push(eid);
      });
    });
    var pavs = arr(entrada.pavimentos).map(function (p) { return num(p.cota, null); }).filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
    var TOL = B.TOL;
    function pavimentoDe(y) { var k = -1; pavs.forEach(function (c, i) { if (y >= c - TOL) k = i; }); return k; }
    var infoTQ = {};
    Object.keys(cadeias).forEach(function (c) {
      var es = cadeias[c], niveis = {}, base = es[es.length - 1];
      es.forEach(function (eid) {
        var nd = G.arestas[eid].de;
        ent[nd].forEach(function (x) { if (cadeia[x] !== c && E[x]) { var k = pavs.length ? pavimentoDe(G.nos[nd].y) : Math.round(G.nos[nd].y / TOL); niveis[k] = (niveis[k] || 0) + E[x].uhc; } });
        if (proprio[nd]) { var k2 = pavs.length ? pavimentoDe(G.nos[nd].y) : Math.round(G.nos[nd].y / TOL); niveis[k2] = (niveis[k2] || 0) + (proprio[nd].uhc || 0); }
      });
      var topoNo = G.arestas[es[0]].de;
      infoTQ[c] = { trechos: es.map(function (eid) { return G.arestas[eid].trecho; }), base: base, topo: topoNo, uhc: E[base].uhc, pavimentos: Object.keys(niveis).length, porPavimento: niveis,
                    comprimento_m: es.reduce(function (s, eid) { return s + G.arestas[eid].comprimento; }, 0), dn: null };
    });
    if (Object.keys(cadeias).length && !pavs.length) aviso(out.avisos, "info", "pavimentos não informados: cada nível de chegada no tubo de queda conta como um pavimento", [], { texto: "informar entrada.pavimentos (nome e cota)" });

    var residencial = !!uso && /^residencial/.test(uso);
    function uhcColetor(r) {
      if (!residencial || opc.somarTodosUhc) return { uhc: r.uhc, passo: residencial ? "residencial: somadas todas as UHC (opção conservadora)" : null };
      if (!algumAmb) { premissa("UHC no coletor (5.1.4.2)", "prédio residencial sem banheiro identificável no modelo: somadas TODAS as UHC (lado seguro)"); return { uhc: r.uhc, passo: null }; }
      var u = Object.keys(r.porAmb || {}).reduce(function (s0, k) { return s0 + r.porAmb[k]; }, 0) + (r.semAmb || 0);
      return { uhc: u, passo: "5.1.4.2 (residencial): no coletor/subcoletor conta só o aparelho de maior descarga de cada banheiro: ΣUHC = " + u + " (soma de todos: " + r.uhc + ")" };
    }

    /* 6) DN por classe */
    var tRamal = ctx.linhas("es.ramal_esgoto", null, "ramal de esgoto"), tTQ = null, tCol = null;
    function dnsDe(material) { var M = B.MATERIAIS[material]; return M ? M.dns.slice().sort(function (a, b) { return a - b; }) : []; }
    function comercial(material, dn) { var l = dnsDe(material).filter(function (d) { return d >= dn; }); return l.length ? l[0] : null; }
    Object.keys(cadeias).forEach(function (c) {
      var I = infoTQ[c], r = E[I.base];
      if (r.pend) return;
      tTQ = tTQ || ctx.linhas("es.tubo_queda", null, "tubo de queda");
      if (!tTQ) return;
      /* a tabela traz, por DN, o limite de UHC para até N pavimentos (coluna
         pavimentos_max; "*" = qualquer número) — vale a linha mais específica
         que cobre o nº de pavimentos do tubo de queda */
      var maxPav = Math.max.apply(null, [0].concat(Object.keys(I.porPavimento).map(function (k) { return I.porPavimento[k]; })));
      var porDn = {};
      tTQ.forEach(function (x) {
        var pm = x.pavimentos_max === "*" ? Infinity : num(x.pavimentos_max, null);
        if (pm == null || pm < I.pavimentos) return;
        var d = num(x.dn, 0); if (!porDn[d] || pm < porDn[d].pm) porDn[d] = { pm: pm, l: x };
      });
      var l = Object.keys(porDn).map(function (d) { return porDn[d].l; })
        .filter(function (x) { return num(x.uhc_max, 0) >= I.uhc && (num(x.uhc_max_pavimento, null) == null || num(x.uhc_max_pavimento, 0) >= maxPav); })
        .sort(function (a, b) { return num(a.dn, 0) - num(b.dn, 0); })[0] || null;
      I.maxPorPavimento = maxPav;
      var col = "uhc_max";
      I.linha = l; I.coluna = col;
    });
    topo.forEach(function (id) {
      sai[id].forEach(function (eid) {
        var r = E[eid], e = r.e, req = null;
        if (r.pend) { r.pendencias.push("UHC de aparelho a montante"); r.passos.push("pendente: falta UHC a montante"); return; }
        if (r.classe === "ramal_descarga") {
          var pd = r.descargaDe;
          if (!pd || pd.dnMin == null) { r.pendencias.push("DN mínimo do aparelho"); return; }
          req = pd.dnMin; r.passos.push("ramal de descarga de " + pd.aparelho + ": DN mínimo " + pd.dnMin + " (UHC " + pd.uhc + ")");
        } else if (r.classe === "ramal_esgoto") {
          if (!tRamal) { r.pendencias.push("es.ramal_esgoto"); return; }
          var l = menorDn(tRamal, "uhc_max", r.uhc);
          if (!l) { r.pendencias.push("UHC " + r.uhc + " acima da tabela de ramal"); r.passos.push("UHC " + r.uhc + " acima do maior ramal da tabela: passe a subcoletor/tubo de queda"); return; }
          req = num(l.dn, 0); r.passos.push("ramal de esgoto: ΣUHC = " + r.uhc + " ≤ " + l.uhc_max + " → DN " + l.dn);
        } else if (r.classe === "tubo_queda") {
          var I = infoTQ[cadeia[eid]];
          if (!I.linha) { r.pendencias.push(tTQ ? "UHC " + I.uhc + " (" + I.pavimentos + " pavimentos) acima da tabela de tubo de queda" : "es.tubo_queda"); return; }
          req = num(I.linha.dn, 0);
          r.passos.push("tubo de queda (" + I.pavimentos + " pavimento(s), linha até " + I.linha.pavimentos_max + "): ΣUHC na base = " + I.uhc + " ≤ " + I.linha.uhc_max + (I.linha.uhc_max_pavimento != null ? "; maior por pavimento " + I.maxPorPavimento + " ≤ " + I.linha.uhc_max_pavimento : "") + " → DN " + I.linha.dn);
        } else {
          tCol = tCol || ctx.linhas("es.coletor", null, "subcoletor");
          if (!tCol) { r.pendencias.push("es.coletor"); return; }
          var dec = e.inclinacao == null ? null : e.inclinacao;
          var decls = tCol.map(function (x) { return num(x.declividade_pct, null); }).filter(function (v) { return v != null && dec != null && v <= dec + EPS; });
          if (!decls.length) { r.pendencias.push("declividade " + f2(dec) + "% abaixo da menor da tabela de coletor"); r.passos.push("declividade do trecho abaixo da menor da tabela"); return; }
          var dUsar = Math.max.apply(null, decls);
          var uCol = uhcColetor(r);
          var l3 = menorDn(tCol.filter(function (x) { return num(x.declividade_pct, null) === dUsar; }), "uhc_max", uCol.uhc);
          if (uCol.passo) r.passos.push(uCol.passo);
          if (!l3) { r.pendencias.push("UHC " + r.uhc + " acima da tabela de coletor a " + dUsar + "%"); return; }
          req = num(l3.dn, 0); r.passos.push("subcoletor a " + f2(dUsar) + "% (declividade do trecho " + f2(dec) + "%): ΣUHC = " + uCol.uhc + " ≤ " + l3.uhc_max + " → DN " + l3.dn);
          /* NBR 8160:1999, 5.1.4.1: coletor predial com DN mínimo 100 */
          var cDc = ctx.consulta("es8160.coletor_dn_min", null, "valor", "coletor");
          if (cDc.ok && req < num(cDc.valor, 0)) { req = num(cDc.valor, 0); r.passos.push("DN mínimo do coletor predial = " + req + " (5.1.4.1)"); }
        }
        /* ⚠ DN mínimo do aparelho mais exigente a montante e DN nunca diminui a jusante */
        var montante = ent[id].map(function (x) { return E[x] && E[x].dn; }).filter(function (v) { return v != null; });
        var reqF = Math.max.apply(null, [req, r.dnMinAc].concat(montante));
        if (reqF > req) r.passos.push("DN ≥ " + reqF + " (" + (reqF === r.dnMinAc ? "DN mínimo de aparelho a montante" : "DN não diminui a jusante") + ")");
        r.dnReq = reqF;
        if (r.travado) { r.dn = e.dn; if (e.dn < reqF) r.reprovadoTravado = true; }
        else {
          var dc = comercial(e.material, reqF);
          if (dc == null) {
            r.dn = null; r.pendencias.push("DN " + reqF + " acima do maior DN comercial de " + e.material);
            /* NBR 7362:2025: coletor/subcoletor ENTERRADO em PVC ocre vai a DN 1000 (resolve o DN ≥ 200 que o PVC predial não tem) */
            if (e.material !== "pvc_esgoto_enterrado" && comercial("pvc_esgoto_enterrado", reqF) != null)
              aviso(out.avisos, "aviso", "trecho " + e.trecho + ": DN " + reqF + " acima do maior DN de " + e.material + " — se for enterrado (rede/ramal predial), use o PVC ocre da NBR 7362:2025", [e.trecho],
                    { texto: "trocar " + e.trecho + " para pvc_esgoto_enterrado (NBR 7362, DN " + comercial("pvc_esgoto_enterrado", reqF) + ")", ops: [{ op: "instAlterar", id: e.trecho, material: "pvc_esgoto_enterrado" }] });
            return;
          }
          r.dn = dc;
        }
      });
    });
    /* tubo de queda uniforme: todos os trechos da cadeia com o DN da base */
    Object.keys(cadeias).forEach(function (c) {
      var ds = cadeias[c].map(function (eid) { return E[eid].dn; }).filter(function (v) { return v != null; });
      if (!ds.length) return;
      var mx = Math.max.apply(null, ds);
      cadeias[c].forEach(function (eid) { if (!E[eid].travado && E[eid].dn != null && E[eid].dn < mx) { E[eid].dn = mx; E[eid].passos.push("DN da base do tubo de queda (" + mx + ")"); } });
      infoTQ[c].dn = mx;
    });

    /* 7) declividade e verificações por trecho */
    G.ordemA.forEach(function (eid) {
      var r = E[eid]; if (!r) return;
      var e = r.e;
      if (r.dn != null && !r.pendencias.length) {
        if (r.reprovadoTravado) { verif(e.trecho, "DN mínimo (" + r.classe.replace("_", " ") + ")", e.dn, r.dnReq, "mm", r.dnReq / e.dn, false, r.passos, null); aviso(out.avisos, "erro", "trecho travado " + e.trecho + " com DN " + e.dn + " abaixo do exigido (" + r.dnReq + ")", [e.trecho], { texto: "destravar ou trocar para DN " + r.dnReq }); }
        else verif(e.trecho, "DN (" + r.classe.replace("_", " ") + ")", r.dn, r.dnReq, "mm", r.dnReq / r.dn, true, r.passos, null);
      }
      /* a declividade se confere mesmo com o DN pendente (usa o do modelo) — senão o
         trecho mais deitado, que é o que falha na tabela de coletor, nunca era avisado */
      var dnRef = r.dn != null ? r.dn : e.dn;
      if (!e.vertical && dnRef != null) {
        var cm = ctx.linhas("es.declividade_minima", null, "declividade");
        if (cm) {
          /* dn_max "*" = vale para todo DN acima das outras linhas */
          var lin = cm.filter(function (x) { return x.dn_max === "*" || num(x.dn_max, 0) >= dnRef; }).sort(function (a, b) { return (a.dn_max === "*" ? Infinity : a.dn_max) - (b.dn_max === "*" ? Infinity : b.dn_max); })[0];
          if (!lin) { ctx.pendencia("es.declividade_minima[dn=" + dnRef + "]", "sem linha de declividade para DN " + dnRef, "trecho " + e.trecho); r.pendencias.push("declividade mínima DN " + dnRef); }
          else {
            var dmin = num(lin.declividade_pct, 0), d0 = e.inclinacao == null ? 0 : e.inclinacao, okD = d0 >= dmin - EPS;
            r.declMin = dmin;
            verif(e.trecho, "declividade mínima", d0, dmin, "%", d0 > 0 ? dmin / d0 : null, okD, ["i = " + f2(d0) + "% ≥ " + f2(dmin) + "% (DN " + dnRef + ")"], Nn.fonte("es.declividade_minima"));
            if (!okD) {
              var a = e.de === e.a ? e.pa : e.pb, b = e.de === e.a ? e.pb : e.pa, Lh = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)), yN = a.y - dmin / 100 * Lh;
              r.reprovado = true;
              aviso(out.avisos, "erro", "trecho " + e.trecho + ": declividade " + f2(d0) + "% abaixo da mínima de " + f2(dmin) + "% para DN " + dnRef, [e.trecho],
                    { texto: "aumentar a declividade para " + f2(dmin) + "%: cota de saída " + f2(yN) + " m (hoje " + f2(b.y) + " m) — ajuste a jusante junto" });
            }
          }
        } else r.pendencias.push("es.declividade_minima");
      }
      /* NBR 8160:1999, 4.2.5.2: declividade MÁXIMA de 5 % no subcoletor e no coletor */
      if (r.classe === "subcoletor" && !e.vertical && e.inclinacao != null) {
        var cMx = ctx.consulta("es8160.declividade_maxima", null, "valor", "trecho " + e.trecho);
        if (cMx.ok) { var dMx = num(cMx.valor, 0), okMx = e.inclinacao <= dMx + EPS;
          verif(e.trecho, "declividade máxima (subcoletor/coletor)", e.inclinacao, dMx, "%", e.inclinacao / dMx, okMx, ["i = " + f2(e.inclinacao) + "% ≤ " + f2(dMx) + "% (NBR 8160:1999, 4.2.5.2)"], cMx.fonte);
          if (!okMx) { r.reprovado = true; aviso(out.avisos, "erro", "trecho " + e.trecho + ": declividade " + f2(e.inclinacao) + "% acima da máxima de " + f2(dMx) + "% no coletor/subcoletor", [e.trecho], { texto: "reduzir a declividade para no máximo " + f2(dMx) + "% (degrau com caixa de inspeção, se preciso)" }); } }
      }
      r.status = r.pendencias.length ? "pendente" : (r.reprovado || r.reprovadoTravado ? "reprovado" : "ok");
      /* ⚠ revisão F7 C1 (CRÍTICO): pendência de TRECHO (UHC acima da tabela, DN inexistente no
         material…) ficava só no trecho — o resultado saía ok=true e a capa dizia "Atende". Agora
         entra no contexto (pendências do resultado) e vira verificação pendente. */
      if (r.pendencias.length) {
        ctx.pendencia("es.trecho[" + e.trecho + "]", r.pendencias.join("; "), "trecho " + e.trecho + " (" + r.classe.replace("_", " ") + ")");
        verif(e.trecho, "DN (" + r.classe.replace("_", " ") + ")", r.dn, r.dnReq == null ? null : r.dnReq, "mm", null, null, r.passos.concat(["pendente: " + r.pendencias.join("; ")]), null);
      }
      out.trechos.push({ id: e.trecho, aresta: eid, parte: e.parte, de: e.de, para: e.para, classe: r.classe, material: e.material, dnModelo: e.dn, dn: r.dn,
                         uhc: r.pend ? null : r.uhc, declividade_pct: e.vertical ? null : e.inclinacao, declividadeMin_pct: r.declMin == null ? null : r.declMin,
                         tuboQueda: cadeia[eid] || null, travado: r.travado, status: r.status, passos: r.passos, pendencias: r.pendencias });
    });

    /* 8) ventilação */
    var GV = Gr.montar(R, est, ["ventilacao"]);
    var contato = {};   /* nó da ventilação → nó do esgoto (ou aresta, se cai no meio) */
    GV.ordemN.forEach(function (vid) {
      var v = GV.nos[vid], melhor = null;
      G.ordemN.forEach(function (id) { var n = G.nos[id], dx = n.x - v.x, dy = n.y - v.y, dz = n.z - v.z; if (!melhor && Math.sqrt(dx * dx + dy * dy + dz * dz) <= TOL) melhor = { no: id }; });
      if (!melhor) G.ordemA.forEach(function (eid) {
        if (melhor) return;
        var e = G.arestas[eid], a = e.pa, b = e.pb, ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
        var t = ((v.x - a.x) * ab.x + (v.y - a.y) * ab.y + (v.z - a.z) * ab.z) / L2;
        if (t <= 0 || t >= 1) return;
        var px = a.x + ab.x * t - v.x, py = a.y + ab.y * t - v.y, pz = a.z + ab.z * t - v.z;
        if (Math.sqrt(px * px + py * py + pz * pz) <= TOL) melhor = { aresta: eid, no: e.de, t: e.a === e.de ? t : 1 - t };
      });
      if (melhor) contato[vid] = melhor;
    });
    /* componentes da ventilação */
    var compDe = {}, comps = [];
    GV.ordemN.forEach(function (vid) {
      if (compDe[vid] != null) return;
      var c = comps.length, pilha = [vid], nosC = [], arestasC = {};
      compDe[vid] = c;
      while (pilha.length) { var x = pilha.pop(); nosC.push(x); GV.nos[x].arestas.forEach(function (eid) { arestasC[eid] = 1; var o = GV.outro(GV.arestas[eid], x); if (compDe[o] == null) { compDe[o] = c; pilha.push(o); } }); }
      comps.push({ nos: nosC, arestas: Object.keys(arestasC) });
    });
    var ventilados = {}, ventAresta = {};   /* nó do esgoto → ventilado; aresta → fração onde a ventilação entra */
    var topoVentilado = {}, colunaNoTQ = {}, compInfo = [];
    comps.forEach(function (cp, ci) {
      var cts = cp.nos.filter(function (v) { return contato[v]; }).map(function (v) { return contato[v]; });
      var noTQ = cts.filter(function (c) { return c.no && Object.keys(infoTQ).some(function (k) { return infoTQ[k].topo === c.no; }); });
      var naCadeia = cts.filter(function (c) { var ar = c.aresta ? [c.aresta] : ent[c.no].concat(sai[c.no]); return ar.some(function (x) { return cadeia[x]; }); });
      var tipo = !cts.length ? "solta" : (noTQ.length === cts.length ? "primaria" : (naCadeia.length ? "coluna" : "ramal"));
      /* ⚠ ventilação que entra no MEIO de um trecho: a distância conta até o ponto
         de entrada (fração t do trecho), não até o nó de montante */
      cts.forEach(function (c) { if (c.aresta) ventAresta[c.aresta] = Math.min(ventAresta[c.aresta] == null ? 1 : ventAresta[c.aresta], c.t); else ventilados[c.no] = 1; });
      noTQ.forEach(function (c) { Object.keys(infoTQ).forEach(function (k) { if (infoTQ[k].topo === c.no) topoVentilado[k] = 1; }); });
      if (tipo === "coluna") Object.keys(infoTQ).forEach(function (k) { if (naCadeia.some(function (c) { var ar = c.aresta ? [c.aresta] : ent[c.no].concat(sai[c.no]); return ar.some(function (x) { return cadeia[x] === k; }); })) colunaNoTQ[k] = 1; });
      compInfo.push({ ci: ci, tipo: tipo, cts: cts, arestas: cp.arestas, nos: cp.nos });
      var comp = cp.arestas.reduce(function (s, eid) { return s + GV.arestas[eid].comprimento; }, 0), req = null, passos = [], fonte = null, pendV = [];
      var uhcV = cts.reduce(function (s, c) { return Math.max(s, uhc[c.no] || 0); }, 0), bacia = cts.some(function (c) { return temBacia[c.no]; });
      if (tipo === "ramal") {
        /* o GRUPO ventilado (Tabela 8: "com/sem bacia"): a ventilação do banheiro sai do ramal da caixa sifonada ANTES da
           junção com o ramal da bacia (correção do Rogério, 18/10/2026) — o grupo é o que chega à 1ª junção a jusante
           (a bacia entra ali), não só o que passa pelo ponto de tomada */
        var grupoJ = null;
        cts.forEach(function (c) {
          var n0 = c.aresta ? G.arestas[c.aresta].para : c.no, gd = 0;
          while (n0 != null && ent[n0].length < 2 && sai[n0] && sai[n0].length && gd++ <= G.ordemA.length) { var r0 = E[sai[n0][0]]; if (r0 && (r0.classe === "tubo_queda" || r0.classe === "subcoletor")) { n0 = null; break; } n0 = G.arestas[sai[n0][0]].para; }
          /* a junção NO tubo de queda/subcoletor não conta: ali o grupo é só o do ramal (o TQ tem a ventilação dele) */
          if (n0 != null && ent[n0].concat(sai[n0] || []).some(function (x) { return E[x] && (E[x].classe === "tubo_queda" || E[x].classe === "subcoletor"); })) n0 = null;
          if (n0 != null && ent[n0].length >= 2 && (uhc[n0] || 0) > uhcV) { uhcV = uhc[n0] || 0; bacia = bacia || !!temBacia[n0]; grupoJ = n0; }
        });
        if (grupoJ != null) passos.push("grupo ventilado = aparelhos que chegam à junção a jusante da tomada (" + uhcV + " UHC, " + (bacia ? "com" : "sem") + " bacia)");
        var tv = ctx.linhas("es.ventilacao.ramal", null, "ramal de ventilação");
        if (!tv) pendV.push("es.ventilacao.ramal");
        else {
          var l = menorDn(tv.filter(function (x) { return num(x.com_bacia, 0) === (bacia ? 1 : 0); }), "uhc_max", uhcV);
          if (l) { req = num(l.dn, 0); passos.push("ramal de ventilação " + (bacia ? "com" : "sem") + " bacia: UHC " + uhcV + " ≤ " + l.uhc_max + " → DN " + l.dn); fonte = Nn.fonte("es.ventilacao.ramal"); }
          else pendV.push("UHC " + uhcV + " acima da tabela de ramal de ventilação");
        }
      } else if (tipo === "coluna") {
        var tc = ctx.linhas("es.ventilacao.coluna", null, "coluna de ventilação");
        var tqs = Object.keys(infoTQ).filter(function (k) { return naCadeia.some(function (c) { var ar = c.aresta ? [c.aresta] : ent[c.no].concat(sai[c.no]); return ar.some(function (x) { return cadeia[x] === k; }); }); });
        var I = tqs.length ? infoTQ[tqs[0]] : null;
        if (!tc) pendV.push("es.ventilacao.coluna");
        else if (!I || I.dn == null) pendV.push("DN do tubo de queda ventilado");
        else {
          var ls = tc.filter(function (x) { return num(x.dn_tq, 0) === I.dn && num(x.uhc_max, 0) >= I.uhc && num(x.comprimento_max_m, 0) >= comp; }).sort(function (a, b) { return a.dn - b.dn; });
          if (ls.length) { req = num(ls[0].dn, 0); passos.push("coluna de ventilação do TQ DN " + I.dn + " (UHC " + I.uhc + ", comprimento " + f2(comp) + " m ≤ " + ls[0].comprimento_max_m + " m) → DN " + ls[0].dn); fonte = Nn.fonte("es.ventilacao.coluna"); }
          else pendV.push("nenhuma linha da coluna de ventilação para TQ DN " + I.dn + ", UHC " + I.uhc + ", " + f2(comp) + " m");
        }
      } else if (tipo === "primaria") {
        /* ⚠ decisão do RT (17/10/2026, CONTRATO §1.2-7): a ventilação primária é o prolongamento do
           tubo de queda e tem o MESMO DN dele (lado seguro; conferir no texto da 8160 quando comprada).
           Antes saía "ok" sem conta nenhuma (revisão F7 A5). */
        var kTQ = Object.keys(infoTQ).filter(function (k) { return noTQ.some(function (c) { return infoTQ[k].topo === c.no; }); })[0];
        var dTQ = kTQ ? infoTQ[kTQ].dn : null;
        if (dTQ == null) pendV.push("DN do tubo de queda ventilado (ventilação primária)");
        else { req = dTQ; passos.push("ventilação primária = prolongamento do tubo de queda " + kTQ + ": DN ≥ DN do TQ = " + dTQ + " (decisão do RT)"); }
      }
      else aviso(out.avisos, "aviso", "ventilação sem ligação com o esgoto (" + cp.arestas.length + " trecho(s))", cp.arestas.map(function (eid) { return GV.arestas[eid].trecho; }), { texto: "ligar a ventilação ao ramal ou ao tubo de queda" });
      pendV.forEach(function (p) { ctx.pendencia(/^es\./.test(p) ? p : "es.ventilacao." + tipo, p, "ventilação"); });
      cp.arestas.forEach(function (eid) {
        var e = GV.arestas[eid], trav = !!travados[e.trecho], dn = req == null ? e.dn : (trav ? e.dn : (comercial(e.material, Math.max(req, 0)) || null));
        var st = pendV.length ? "pendente" : (trav && req != null && e.dn < req ? "reprovado" : "ok");
        out.ventilacao.push({ id: e.trecho, aresta: eid, tipo: tipo, componente: ci, dn: dn, dnModelo: e.dn, dnReq: req, uhc: uhcV, comprimento_m: comp, travado: trav, status: st, passos: passos, fonte: fonte, pendencias: pendV });
        if (req != null) verif(e.trecho, "DN da ventilação (" + tipo + ")", dn, req, "mm", dn ? req / dn : null, st !== "reprovado", passos, fonte);
      });
    });
    /* NBR 8160:1999, 4.3.12: com pelo menos um ventilador primário DN 100 no prédio, dispensa o prolongamento do
       TQ que tenha comprimento ≤ 1/4 da altura do prédio, ≤ 36 UHC e coluna de ventilação ligada */
    var vRegra = function (par) { var c = Nn.consulta("es8160.ventilacao_regras", { parametro: par }, "valor"); if (c.ok) ctx.consulta("es8160.ventilacao_regras", { parametro: par }, "valor", "ventilação"); return c.ok ? num(c.valor, null) : null; };
    var yTodos = G.ordemN.map(function (id) { return G.nos[id].y; }), alturaPredio = yTodos.length ? Math.max.apply(null, yTodos) - Math.min.apply(null, yTodos) : 0;
    var temVp100 = Object.keys(infoTQ).some(function (k) { return topoVentilado[k] && infoTQ[k].dn != null && infoTQ[k].dn >= (vRegra("ventilador_predio_terreo_dn") || Infinity); });
    var dispensaProl = {};
    Object.keys(infoTQ).forEach(function (k) {
      if (topoVentilado[k]) return;
      var I = infoTQ[k], fr = vRegra("dispensa_prolongamento_fracao_altura"), uMx = vRegra("dispensa_prolongamento_uhc_max");
      if (temVp100 && fr != null && uMx != null && I.comprimento_m <= fr * alturaPredio && I.uhc <= uMx && colunaNoTQ[k]) {
        dispensaProl[k] = 1; topoVentilado[k] = 1;
        verif(I.trechos[0], "dispensa do prolongamento do tubo de queda (4.3.12)", I.uhc, uMx, "UHC", I.uhc / uMx, true, ["prédio com ventilador primário DN 100; TQ " + k + ": " + f2(I.comprimento_m) + " m ≤ " + f2(fr) + " × " + f2(alturaPredio) + " m; " + I.uhc + " UHC ≤ " + uMx + "; coluna de ventilação ligada (NBR 8160:1999, 4.3.12)"], Nn.fonte("es8160.ventilacao_regras"));
      }
    });
    Object.keys(infoTQ).forEach(function (k) {
      if (dispensaProl[k]) return;
      if (!topoVentilado[k]) aviso(out.avisos, "erro", "tubo de queda " + k + " (" + infoTQ[k].trechos.join(", ") + ") sem ventilação primária no topo", [infoTQ[k].trechos[0]],
                                   { texto: "prolongar o tubo de queda acima da cobertura como ventilação (trecho de ventilação saindo do topo, cota " + f2(G.nos[infoTQ[k].topo].y) + " m)" });
      verif(infoTQ[k].trechos[0], "ventilação primária do tubo de queda", topoVentilado[k] ? 1 : 0, 1, "", null, !!topoVentilado[k], [topoVentilado[k] ? "topo ligado à ventilação" : "topo sem ventilação"], null);
    });

    /* Anexo C (suficiência da ventilação primária), por TQ: entrada.anexoC[k|"*"] = dados (ver HidES.anexoC) */
    var anexoCRes = {};
    Object.keys(infoTQ).forEach(function (k) {
      var dd = (entrada.anexoC || {})[k] || (entrada.anexoC || {})["*"]; if (!dd) return;
      var rc = anexoC(dd); anexoCRes[k] = rc; out.anexoC = out.anexoC || {}; out.anexoC[k] = rc;
      verif(infoTQ[k].trechos[0], "suficiência da ventilação primária (Anexo C)", rc.Dr, rc.Das, "Pa", rc.Das ? rc.Dr / rc.Das : null, rc.suficiente === null ? null : rc.suficiente, rc.passos, Nn.fonte("es8160.anexo_c"));
      if (rc.suficiente === false) aviso(out.avisos, "erro", "tubo de queda " + k + ": a ventilação primária NÃO basta (Anexo C) — exige ventilação secundária", [infoTQ[k].trechos[0]], { texto: "prever ventilação secundária (ramais/coluna de ventilação) ou mudar a geometria (DN do TQ, desconectores)" });
    });
    function anexoCDoTQ(noEsg) { var r0 = null; Object.keys(cadeias).forEach(function (k) { if (cadeias[k].some(function (x) { return G.arestas[x].de === noEsg || G.arestas[x].para === noEsg; }) && anexoCRes[k]) r0 = anexoCRes[k].suficiente; }); return r0; }

    /* 9) desconectores: distância até a ventilação; ralo seco passa por sifonado */
    var tDist = null;
    /* a ventilação que sai de um RAMO VIZINHO (o ramal da caixa sifonada, antes da junção com o da bacia — correção do
       Rogério, 18/10/2026): a distância do desconector é pelo tubo, descendo até a junção e subindo o ramo até a tomada.
       distTap[nó] = do ponto de tomada (só ventilação do tipo "ramal") descendo até o nó */
    var distTap = {};
    compInfo.filter(function (c) { return c.tipo === "ramal"; }).forEach(function (cp) {
      cp.cts.forEach(function (c) {
        var n0 = c.aresta ? G.arestas[c.aresta].para : c.no, s0 = c.aresta ? (1 - c.t) * G.arestas[c.aresta].comprimento : 0, gd = 0;
        while (n0 != null && gd++ <= G.ordemA.length + 1) {
          if (distTap[n0] == null || s0 < distTap[n0]) distTap[n0] = s0;
          if (!sai[n0] || !sai[n0].length) break;
          var ea = G.arestas[sai[n0][0]], ra = E[ea.id]; if (ra && (ra.classe === "tubo_queda" || ra.classe === "subcoletor")) break;
          s0 += ea.comprimento; n0 = ea.para;
        }
      });
    });
    function ventiladoNo(id) { if (ventilados[id]) return true; return Object.keys(infoTQ).some(function (k) { return topoVentilado[k] && cadeias[k].some(function (eid) { return G.arestas[eid].de === id || G.arestas[eid].para === id; }); }); }
    out.pontos.forEach(function (pt) {
      var n = G.nos[pt.no], ehDesc = (n.peca && DESCONECTOR[n.peca.peca]) || (pt.aparelho && SIFAO_PROPRIO[pt.aparelho]);
      /* desce pelo caminho de saída: L até o 1º ponto ventilado; e se passa por
         desconector ANTES de chegar ao tubo de queda/subcoletor (ralo seco) */
      var id = pt.no, L = 0, ate = ventiladoNo(id) ? id : null, passou = false, passouAntes = false, chegouTQ = false, guarda = 0, noChegada = null;
      var Lw = 0, alt = distTap[id] != null ? distTap[id] : null;   /* pela junção, até a tomada num ramo vizinho */
      while (sai[id] && sai[id].length && guarda++ <= G.ordemA.length) {
        var e1 = G.arestas[sai[id][0]], r1 = E[e1.id];
        if (r1 && (r1.classe === "tubo_queda" || r1.classe === "subcoletor")) { if (!chegouTQ) noChegada = e1.de; chegouTQ = true; }
        if (ate == null && ventAresta[e1.id] != null) { L += ventAresta[e1.id] * e1.comprimento; ate = e1.id; }
        if (ate == null) L += e1.comprimento;
        id = e1.para; Lw += e1.comprimento;
        if (!chegouTQ && ate == null && distTap[id] != null && (alt == null || Lw + distTap[id] < alt)) alt = Lw + distTap[id];
        if (!chegouTQ && G.nos[id].peca && DESCONECTOR[G.nos[id].peca.peca]) { passou = true; if (ate == null) passouAntes = true; }
        if (ate == null && ventiladoNo(id)) ate = id;
        if (ate != null && (passou || chegouTQ)) break;
      }
      if (n.peca && n.peca.peca === "ralo_seco" && !passou)
        aviso(out.avisos, "erro", "ralo seco " + n.peca.id + " não passa por caixa sifonada nem ralo sifonado antes do tubo de queda/coletor: o gás do esgoto volta pelo ralo", [n.peca.id], { texto: "ligar o ralo seco a uma caixa sifonada" });
      if (!ehDesc) return;
      /* o aparelho que descarrega numa caixa/ralo sifonado antes da ventilação é
         protegido por ela: a distância que conta é a da caixa (NBR 8160, ventilação
         de desconector) */
      if (passouAntes) return;
      /* NBR 8160:1999, 4.3.18: dispensa ventilar o ramal da BACIA exclusivo, ≤ 2,40 m até o TQ, quando o TQ recebe
         logo abaixo, no mesmo pavimento, outros ramais ventilados */
      if (BACIA[pt.aparelho] && chegouTQ) {
        var comprB = 0, exclusivo = true, idB = pt.no, eB = null, gB = 0;
        while (sai[idB] && sai[idB].length && gB++ <= G.ordemA.length) { eB = G.arestas[sai[idB][0]]; if (!E[eB.id] || E[eB.id].classe === "tubo_queda") break; if (E[eB.id].classe !== "ramal_descarga") exclusivo = false; comprB += eB.comprimento; idB = eB.para; }
        var lB = vRegra("ramal_bacia_dispensa_comprimento_max_m"), noTQb = idB, kB = null;
        Object.keys(cadeias).forEach(function (k) { cadeias[k].forEach(function (x) { if (G.arestas[x].de === noTQb || G.arestas[x].para === noTQb) kB = k; }); });
        var pavB = pavimentoDe(G.nos[noTQb].y), abaixoVent = kB != null && cadeias[kB].some(function (x) { var nd = G.arestas[x].para; return G.nos[nd].y < G.nos[noTQb].y && pavimentoDe(G.nos[nd].y) === pavB && ent[nd].some(function (y0) { return cadeia[y0] !== kB && (ventAresta[y0] != null || ventilados[G.arestas[y0].de]); }); });
        if (lB != null && exclusivo && comprB <= lB + EPS && abaixoVent) {
          verif(pt.famInst || pt.peca, "ventilação do ramal da bacia dispensada (4.3.18)", comprB, lB, "m", comprB / lB, true, ["ramal exclusivo da bacia com " + f2(comprB) + " m ≤ " + f2(lB) + " m até o TQ, que recebe logo abaixo outro ramal ventilado no mesmo pavimento (NBR 8160:1999, 4.3.18)"], Nn.fonte("es8160.ventilacao_regras"));
          return;
        }
      }
      /* Anexo C: ventilação primária SUFICIENTE no TQ dispensa a secundária dos desconectores dele */
      if (chegouTQ && anexoCDoTQ(noChegada) === true) { verif(pt.famInst || pt.peca, "ventilação do desconector", null, null, "m", null, true, ["ventilação secundária dispensada: ventilação primária suficiente pelo Anexo C da NBR 8160:1999"], null); return; }
      var sai0 = sai[pt.no][0], dnR = sai0 && E[sai0] ? E[sai0].dn : null, viaJuncao = false;
      if (alt != null && (ate == null || alt < L - EPS)) { L = alt; ate = "juncao"; viaJuncao = true; }
      if (ate == null) { aviso(out.avisos, "aviso", "desconector " + (pt.famInst || pt.peca) + " sem ventilação a jusante", [pt.famInst || pt.peca], { texto: "ventilar o ramal ou ligar a um tubo de queda com ventilação primária" }); verif(pt.famInst || pt.peca, "ventilação do desconector", null, null, "m", null, false, ["nenhuma ventilação a jusante"], null); return; }
      if (dnR == null) return;
      tDist = tDist || ctx.linhas("es.ventilacao.distancia_maxima", null, "distância do desconector");
      if (!tDist) return;
      var lin = tDist.filter(function (x) { return num(x.dn_ramal, 0) === dnR; })[0];
      if (!lin) { ctx.pendencia("es.ventilacao.distancia_maxima[dn_ramal=" + dnR + "]", "sem linha para o ramal DN " + dnR, "desconector " + (pt.famInst || pt.peca)); return; }
      var lim = num(lin.distancia_m, 0), okL = L <= lim + EPS;
      verif(pt.famInst || pt.peca, "distância do desconector à ventilação", L, lim, "m", lim > 0 ? L / lim : null, okL, ["L = " + f2(L) + " m ≤ " + f2(lim) + " m (ramal DN " + dnR + ")" + (viaJuncao ? " — pelo tubo até a junção e pelo ramo vizinho até a tomada da ventilação" : "")], Nn.fonte("es.ventilacao.distancia_maxima"));
      if (!okL) aviso(out.avisos, "erro", "desconector " + (pt.famInst || pt.peca) + " a " + f2(L) + " m da ventilação (máximo " + f2(lim) + " m para DN " + dnR + ")", [pt.famInst || pt.peca], { texto: "pôr um ramal de ventilação a no máximo " + f2(lim) + " m do desconector" });
    });

    regras8160();
    regrasTubos();

    /* ============== Tubos PVC pela norma do produto (NBR 5688:2018 e 7362:2025 — texto lido em 17/10/2026)
       5688: série NORMAL (pvc_esgoto) tem classe de temperatura CT 45 °C; a REFORÇADA (pvc_serie_r), CT 75 °C. Ramal que
       recebe descarga QUENTE (máquina de lavar louça/roupa, retorno de água quente, dreno de aquecedor — opcoes.descargasQuentes)
       em série normal → aviso com a troca para a SR. 7362: tubo ENTERRADO (pvc_esgoto_enterrado), fluido ≤ 40 °C. */
    function regrasTubos() {
      var cS = Nn.consulta("tubo.nbr5688.series", { serie: "SN" }, "ct_c"), quente = {}; arr(opc.descargasQuentes).forEach(function (q) { quente[q] = 1; });
      var QUENTE = /^maquina_lavar/;
      out.pontos.forEach(function (pt) {
        if (!(QUENTE.test(pt.aparelho || "") || quente[pt.famInst] || quente[pt.peca])) return;
        var n0 = pt.no, g0 = 0, sn = [], ent0 = [], vis = {};
        while (sai[n0] && sai[n0].length && g0++ <= G.ordemA.length) {
          var e0 = G.arestas[sai[n0][0]], r0 = E[sai[n0][0]];
          if (!r0 || (r0.classe !== "ramal_descarga" && r0.classe !== "ramal_esgoto")) break;
          if (e0.trecho != null && !vis[e0.trecho]) { vis[e0.trecho] = 1; if (e0.material === "pvc_esgoto") sn.push(e0.trecho); if (e0.material === "pvc_esgoto_enterrado") ent0.push(e0.trecho); }
          n0 = e0.para;
        }
        var quem = pt.famInst || pt.peca;
        if (sn.length) {
          var ct = cS.ok ? num(cS.valor, null) : null;
          if (cS.ok) ctx.consulta("tubo.nbr5688.series", { serie: "SN" }, "ct_c", "descarga quente " + quem);
          aviso(out.avisos, "aviso", "ramal de " + quem + " (descarga quente) em PVC série normal" + (ct != null ? " — classe de temperatura CT " + ct + " °C" : "") + " (NBR 5688): usar a série reforçada", sn,
                { texto: "trocar os trechos " + sn.join(", ") + " para PVC série reforçada (CT 75 °C)", ops: sn.map(function (t0) { return { op: "instAlterar", id: t0, material: "pvc_serie_r" }; }) });
        }
        if (ent0.length) {
          var cTe = Nn.consulta("tubo.nbr7362.uso", { parametro: "temperatura_max_c" }, "valor");
          if (cTe.ok) ctx.consulta("tubo.nbr7362.uso", { parametro: "temperatura_max_c" }, "valor", "descarga quente " + quem);
          aviso(out.avisos, "aviso", "descarga quente de " + quem + " chega direto ao tubo enterrado (NBR 7362: fluido ≤ " + (cTe.ok ? f2(num(cTe.valor, 0)) : "?") + " °C)", ent0, { texto: "resfriar antes (caixa/ramal predial) ou confirmar a temperatura de descarga" });
        }
      });
    }

    /* ============== NBR 8160:1999 — regras do texto (lido em 17/10/2026; CONTRATO §1.2) */
    function regras8160() {
      function fontes(id0) { var vis = {}, l0 = []; (function rec(n0) { if (vis[n0]) return; vis[n0] = 1; if (proprio[n0]) l0.push(proprio[n0]); ent[n0].forEach(function (x) { rec(G.arestas[x].de); }); })(id0); return l0; }
      function cs(par) { var c = Nn.consulta("es8160.inspecao", { parametro: par }, "valor"); if (c.ok) ctx.consulta("es8160.inspecao", { parametro: par }, "valor", "inspeção"); return c.ok ? num(c.valor, null) : null; }
      function zona(par) { var c = Nn.consulta("es8160.zonas_sobrepressao", { zona: par }, "fator_d"); if (c.ok) ctx.consulta("es8160.zonas_sobrepressao", { zona: par }, "fator_d", "zonas de sobrepressão"); return c.ok ? num(c.valor, null) : null; }
      var ESPUMA = /^(pia_cozinha|tanque|maquina_lavar)/, PIA_LOUCA = /^(pia_cozinha|maquina_lavar_louca)/;
      /* --- 4.2.3.5: nada se liga por joelho/curva (inspeção) no ramal de descarga da BACIA */
      topo.forEach(function (id) {
        var eb = ent[id].filter(function (x) { var r = E[x]; return r && r.classe === "ramal_descarga" && r.descargaDe && BACIA[r.descargaDe.aparelho]; })[0];
        if (!eb || ent[id].length < 2 || !sai[id].length) return;
        var eo = G.arestas[sai[id][0]];
        /* o ramal que passa reto (mesmo trecho antes e depois do nó) recebendo a descida da bacia é junção normal;
           o proibido é OUTRO trecho terminar no joelho da bacia (ramal modelado em dois pedaços no nó cai aqui:
           lado seguro) */
        var outros = ent[id].filter(function (x) { return x !== eb && G.arestas[x].trecho !== eo.trecho; });
        if (outros.length && G.arestas[eb].vertical !== eo.vertical) aviso(out.avisos, "erro", "ligação de outro ramal no joelho/curva do ramal de descarga da bacia (nó " + id + "): proibido (NBR 8160:1999, 4.2.3.5)", ent[id].map(function (x) { return G.arestas[x].trecho; }),
          { texto: "levar o outro ramal a uma junção no trecho reto do ramal da bacia (ou à caixa sifonada/TQ)" });
      });
      /* --- 4.2.2.4: caixa sifonada de mictório não recebe outro aparelho */
      topo.forEach(function (id) {
        var n = G.nos[id]; if (!n.peca || n.peca.peca !== "caixa_sifonada") return;
        var fs = fontes(id).filter(function (p) { return p.no !== id; }), mic = fs.some(function (p) { return /^mictorio/.test(p.aparelho || ""); }), outro = fs.some(function (p) { return !/^mictorio/.test(p.aparelho || ""); });
        if (mic && outro) aviso(out.avisos, "erro", "caixa sifonada " + n.peca.id + " recebe mictório e outros aparelhos: a de mictório tem tampa cega e não recebe outro (NBR 8160:1999, 4.2.2.4)", [n.peca.id], { texto: "caixa sifonada exclusiva para o mictório" });
      });
      /* --- TQ: pia/louça em vários pavimentos (4.2.4.4/4.2.6.1) e zonas de sobrepressão (4.2.4.3) */
      Object.keys(cadeias).forEach(function (k) {
        var I = infoTQ[k], base = G.arestas[cadeias[k][cadeias[k].length - 1]].para, yb = G.nos[base].y;
        var fsTQ = fontes(base).filter(function (p) { return p.aparelho; }), pavPia = {};
        fsTQ.forEach(function (p) { if (PIA_LOUCA.test(p.aparelho)) pavPia[pavimentoDe(G.nos[p.no].y)] = 1; });
        if (Object.keys(pavPia).length >= 2) {
          var outros = fsTQ.filter(function (p) { return !PIA_LOUCA.test(p.aparelho) && p.aparelho !== "caixa_gordura"; });
          if (outros.length) aviso(out.avisos, "erro", "tubo de queda " + k + " recebe pia de cozinha/máquina de lavar louça de vários pavimentos junto com outros aparelhos: precisa ser TQ ESPECIAL, exclusivo (NBR 8160:1999, 4.2.4.4)", [I.trechos[0]], { texto: "separar as pias/máquinas de louça num tubo de queda exclusivo, com ventilação primária, que desce para a caixa de gordura coletiva" });
          var cgAndar = topo.filter(function (id) { var n = G.nos[id]; return n.peca && n.peca.peca === "caixa_gordura" && n.y > yb + EPS; }).filter(function (id) { var vis = {}, achou = false; (function rec(n0) { if (vis[n0] || achou) return; vis[n0] = 1; if (n0 === base) achou = true; sai[n0].forEach(function (x) { rec(G.arestas[x].para); }); })(id); return achou; });
          if (cgAndar.length) aviso(out.avisos, "erro", "caixa de gordura individual nos andares (" + cgAndar.map(function (id) { return G.nos[id].peca.id; }).join(", ") + ") num TQ de vários pavimentos: proibida (NBR 8160:1999, 4.2.6.1)", cgAndar.map(function (id) { return G.nos[id].peca.id; }), { texto: "retirar as caixas de gordura dos andares; caixa de gordura COLETIVA no pé do tubo de queda" });
          var nCoz = fsTQ.filter(function (p) { return /^pia_cozinha/.test(p.aparelho); }).length, cg = caixaGordura({ cozinhas: nCoz, uso: uso });
          aviso(out.avisos, "info", "tubo de queda " + k + " de pias em vários pavimentos: caixa de gordura COLETIVA no pé — " + (cg.tipo ? cg.tipo + " (" + nCoz + " cozinhas)" : "tipo pendente: " + cg.motivo), [I.trechos[0]], null);
        }
        /* zonas de sobrepressão: prédio ≥ 2 andares com pia/tanque/máquina (espuma) */
        if (I.pavimentos >= 2 && fsTQ.some(function (p) { return ESPUMA.test(p.aparelho); }) && I.dn != null) {
          var fBase = zona("tq_montante_base"), fJus = zona("coletor_jusante_base"), D = I.dn / MM, proib = [];
          if (fBase != null) cadeias[k].forEach(function (x) { var nd = G.arestas[x].de; if (G.nos[nd].y < yb + fBase * D - EPS && ent[nd].some(function (y0) { return cadeia[y0] !== k; })) proib.push(nd); });
          if (fJus != null) { var dist = 0, nd2 = base, g = 0; while (sai[nd2] && sai[nd2].length && g++ <= G.ordemA.length) { var e2 = G.arestas[sai[nd2][0]]; dist += e2.comprimento; nd2 = e2.para; if (dist >= fJus * D) break; if (ent[nd2].length > 1) proib.push(nd2); } }
          GV.ordemN.forEach(function (vid) { var c = contato[vid]; if (c && c.no && G.nos[c.no].y < yb + (fBase || 0) * D - EPS && cadeias[k].some(function (x) { return G.arestas[x].de === c.no; })) proib.push(c.no); });
          if (fBase == null || fJus == null) verif(I.trechos[0], "zonas de sobrepressão (4.2.4.3)", null, null, "", null, null, ["pendente: fatores das zonas (es8160.zonas_sobrepressao)"], null);
          else {
            verif(I.trechos[0], "zonas de sobrepressão (4.2.4.3)", proib.length, 0, "ligações", null, !proib.length, ["prédio com " + I.pavimentos + " andares e aparelho de espuma: sem ligação de esgoto/ventilação a menos de " + fBase + "·D = " + f2(fBase * D) + " m acima da base do TQ e a menos de " + fJus + "·D = " + f2(fJus * D) + " m a jusante dela (NBR 8160:1999, 4.2.4.3)"], Nn.fonte("es8160.zonas_sobrepressao"));
            if (proib.length) aviso(out.avisos, "erro", "ligação na zona de sobrepressão do tubo de queda " + k + " (nó(s) " + proib.join(", ") + ")", [I.trechos[0]], { texto: "subir a ligação para mais de " + f2(fBase * D) + " m acima da base do TQ ou levá-la além de " + f2(fJus * D) + " m a jusante" });
          }
        }
      });
      /* --- 4.2.6.2 e 5.1.5.3: dispositivos de inspeção */
      /* NBR 7362:2025 (Tabelas 15–17): o TIL substitui a caixa de inspeção na rede/ramal ENTERRADO onde a concessionária aceitar —
         só entra como dispositivo de inspeção com opcoes.tilComoInspecao (opção do projetista, declarada como premissa) */
      var tils = topo.filter(function (id) { return G.nos[id].peca && G.nos[id].peca.peca === "til"; });
      if (tils.length && !opc.tilComoInspecao) aviso(out.avisos, "aviso", "TIL no modelo (" + tils.map(function (id) { return G.nos[id].peca.id; }).join(", ") + ") não conta como dispositivo de inspeção: a NBR 7362 o admite onde a concessionária aceitar", tils.map(function (id) { return G.nos[id].peca.id; }),
                                                      { texto: "confirmar com a concessionária e declarar opcoes.tilComoInspecao = true, ou usar caixa de inspeção" });
      if (tils.length && opc.tilComoInspecao) {
        out.premissas.push({ item: "TIL como dispositivo de inspeção", valor: "declarado pelo projetista (NBR 7362:2025, Tabelas 15–17: onde a concessionária aceitar)", origem: "entrada" });
        var cTd = Nn.consulta("tubo.nbr7362.uso", { parametro: "til_dn_min" }, "valor"), cTD = Nn.consulta("tubo.nbr7362.uso", { parametro: "til_dn_max" }, "valor");
        tils.forEach(function (id) {
          var dnT = Math.max.apply(null, ent[id].concat(sai[id]).map(function (x) { return G.arestas[x].dn || 0; })), pT = G.nos[id].peca;
          var enterrado = ent[id].concat(sai[id]).every(function (x) { return G.arestas[x].material === "pvc_esgoto_enterrado"; });
          if (cTd.ok && cTD.ok) { ctx.consulta("tubo.nbr7362.uso", { parametro: "til_dn_min" }, "valor", "TIL " + pT.id); var okT = dnT >= num(cTd.valor, 0) && dnT <= num(cTD.valor, 0) && enterrado;
            verif(pT.id, "TIL na rede enterrada (NBR 7362, Tabelas 15–17)", dnT, num(cTD.valor, 0), "DN", null, okT, ["DN " + dnT + " entre " + cTd.valor + " e " + cTD.valor + (enterrado ? "; tubos ligados em PVC ocre enterrado" : "; ⚠ tubo ligado fora do PVC ocre enterrado (NBR 7362)")], cTd.fonte);
            if (!okT) aviso(out.avisos, "erro", "TIL " + pT.id + ": " + (enterrado ? "DN " + dnT + " fora de " + cTd.valor + "–" + cTD.valor : "ligado a tubo que não é o PVC ocre enterrado"), [pT.id], { texto: enterrado ? "ajustar o DN do TIL" : "usar pvc_esgoto_enterrado nos trechos do TIL, ou caixa de inspeção" }); }
        });
      }
      var cis = topo.filter(function (id) { return G.nos[id].peca && (G.nos[id].peca.peca === "caixa_inspecao" || (opc.tilComoInspecao && G.nos[id].peca.peca === "til")); }), temSub = Object.keys(E).some(function (x) { return E[x].classe === "subcoletor"; });
      if (temSub && !cis.length) {
        ctx.pendencia("modelo.inspecao", "nenhuma caixa de inspeção no modelo: as distâncias da NBR 8160 (4.2.6.2: 25 m entre dispositivos, 15 m até a ligação pública, 10 m de bacia/CG/CS) não foram verificadas", "inspeção");
        verif("esgoto", "dispositivos de inspeção (4.2.6.2)", null, null, "m", null, null, ["pendente: colocar as caixas de inspeção no modelo (biblioteca hid-caixa-inspecao)"], null);
      } else if (cis.length) {
        var d25 = cs("entre_dispositivos_max"), d15 = cs("ligacao_publica_max"), d10 = cs("bacia_cg_cs_ate_inspecao_max"), d2 = cs("ci_ao_tq_min_predio_mais_2pav");
        var ehCI = {}; cis.forEach(function (id) { ehCI[id] = 1; });
        function anda(id0, para) { var L0 = 0, n0 = id0, g0 = 0; while (sai[n0] && sai[n0].length && g0++ <= G.ordemA.length) { var e0 = G.arestas[sai[n0][0]]; L0 += e0.comprimento; n0 = e0.para; if (para(n0, e0)) return { L: L0, no: n0, fim: false }; } return { L: L0, no: n0, fim: true }; }
        cis.forEach(function (id) {
          var a0 = anda(id, function (n0) { return ehCI[n0]; }), pc = G.nos[id].peca;
          if (!a0.fim && d25 != null) { var ok25 = a0.L <= d25 + EPS; verif(pc.id, "distância entre dispositivos de inspeção (4.2.6.2)", a0.L, d25, "m", a0.L / d25, ok25, ["até " + G.nos[a0.no].peca.id + ": " + f2(a0.L) + " m ≤ " + f2(d25) + " m"], Nn.fonte("es8160.inspecao")); if (!ok25) aviso(out.avisos, "erro", "caixas de inspeção " + pc.id + " → " + G.nos[a0.no].peca.id + " a " + f2(a0.L) + " m (máximo " + f2(d25) + " m)", [pc.id], { texto: "intercalar outra caixa de inspeção" }); }
          if (a0.fim && d15 != null) { var ok15 = a0.L <= d15 + EPS; verif(pc.id, "distância até a ligação pública (4.2.6.2)", a0.L, d15, "m", a0.L / d15, ok15, ["da última inspeção até a saída: " + f2(a0.L) + " m ≤ " + f2(d15) + " m"], Nn.fonte("es8160.inspecao")); if (!ok15) aviso(out.avisos, "erro", "última caixa de inspeção " + pc.id + " a " + f2(a0.L) + " m da ligação pública (máximo " + f2(d15) + " m)", [pc.id], { texto: "aproximar a caixa de inspeção da saída" }); }
          /* PENDÊNCIAS FINAIS (18/10/2026): o DISPOSITIVO de PVC Ø 300 só vale onde a 8160 aceita dispositivo e não caixa — fora do
             coletor/subcoletor ENTERRADO (4.2.5.5: enterrada, caixa de inspeção ou PV). Ligado a subcoletor/coletor: erro com o Corrigir
             que troca pela caixa de alvenaria de 0,60 m (a escolha é do projetista; nada é trocado em silêncio) */
          var corrigeCx = { texto: "trocar por caixa de inspeção de alvenaria de 0,60 m (a composição SINAPI sai da profundidade)", ops: [{ op: "instAlterar", id: pc.id, tipoCaixa: "alvenaria", tampa: "concreto" }] };
          var noColetor = ent[id].concat(sai[id]).some(function (x) { return E[x] && (E[x].classe === "subcoletor" || (E[x].e && (E[x].e.redeParte === "coletor" || E[x].e.redeParte === "saida"))); }) ||   /* o coletor e a saída da rede (js/hidrede.js) são coletor mesmo sem tubo de queda no modelo */ !ent[id].concat(sai[id]).some(function (x) { return E[x] && /^ramal/.test(E[x].classe || ""); });
          if (pc.dispositivo && noColetor) aviso(out.avisos, "erro", "inspeção " + pc.id + " é o DISPOSITIVO de PVC Ø " + f2(num(pc.diametro_m, 0)) + " m no coletor/subcoletor enterrado: a NBR 8160 (4.2.5.5 e 5.1.5.3) pede caixa de inspeção (ou poço de visita) — o dispositivo só vale fora dele", [pc.id], corrigeCx);
          /* POÇO DE VISITA (decisão da coordenação, 18/10/2026, noite): acima da profundidade máxima da caixa, a inspeção JÁ É o PV
             (js/hidcigeo.js) — confere a NBR 8160 5.1.5.3 (p.19) do PV: Ø do balão, Ø da chaminé e altura do balão */
          if (pc.pv) {
            var pvP = [{ par: "Dimensão mínima em planta (lado ou diâmetro interno)", v: pc.diametro_m, nome: "Ø do balão do poço de visita (5.1.5.3 b)", grav: "erro" },
                       { par: "Chaminé de acesso: diâmetro interno mínimo", v: num(pc.chamineAltura_m, 0) > EPS ? pc.chamine_m : null, nome: "Ø da chaminé do poço de visita (5.1.5.3 f)", grav: "erro" },
                       { par: "Câmara de trabalho (balão): altura mínima", v: pc.balao_m, nome: "altura do balão do poço de visita (5.1.5.3 f)", grav: "aviso" }];
            pvP.forEach(function (q) {
              if (q.v == null) return;
              var cq = ctx.consulta("es.poco_visita", { parametro: q.par }, "valor", "poço de visita"); if (!cq.ok) return;
              var mn = num(cq.valor, 0), vq = num(q.v, 0), okq = vq >= mn - EPS;
              verif(pc.id, q.nome, vq, mn, "m", mn / Math.max(EPS, vq), okq, [f2(vq) + " m ≥ " + f2(mn) + " m"], cq.fonte);
              if (!okq) aviso(out.avisos, q.grav, "poço de visita " + pc.id + ": " + q.nome + " = " + f2(vq) + " m, abaixo de " + f2(mn) + " m (NBR 8160 5.1.5.3)", [pc.id], q.grav === "aviso" ? { texto: "conferir a cota da rede (PV raso) ou aprofundar o poço" } : null);
            });
            return;
          }
          var lado = pc.forma === "prismatica";
          var cDi = Nn.consulta("es.caixa_inspecao", { parametro: lado ? "Caixa prismática: lado interno mínimo" : "Caixa cilíndrica: diâmetro interno mínimo" }, "valor"), medida = lado ? pc.lado_m : pc.diametro_m;
          if (cDi.ok && medida != null && !(pc.dispositivo && !noColetor)) { var dMin = num(cDi.valor, 0), okD = medida >= dMin - EPS; ctx.consulta("es.caixa_inspecao", { parametro: lado ? "Caixa prismática: lado interno mínimo" : "Caixa cilíndrica: diâmetro interno mínimo" }, "valor", "caixa de inspeção");
            verif(pc.id, (lado ? "lado" : "diâmetro") + " da caixa de inspeção (5.1.5.3)", medida, dMin, "m", dMin / medida, okD, [(lado ? "lado " : "Ø ") + f2(medida) + " m ≥ " + f2(dMin) + " m"], cDi.fonte);
            if (!okD && !pc.dispositivo) aviso(out.avisos, "erro", "caixa de inspeção " + pc.id + " com " + (lado ? "lado " : "Ø ") + f2(medida) + " m: a NBR 8160 (5.1.5.3) pede " + (lado ? "lado" : "Ø") + " ≥ " + f2(dMin) + " m", [pc.id], corrigeCx); }
          /* a PROFUNDIDADE máxima da caixa (5.1.5.3): acima dela, poço de visita (sem composição na base: orçada pela maior caixa, com o aviso) */
          var cPm = Nn.consulta("es.caixa_inspecao", { parametro: "Profundidade máxima" }, "valor");
          if (cPm.ok && pc.prof_m != null && !pc.dispositivo) { var pMax = num(cPm.valor, 0), okP = pc.prof_m <= pMax + EPS; ctx.consulta("es.caixa_inspecao", { parametro: "Profundidade máxima" }, "valor", "caixa de inspeção");
            verif(pc.id, "profundidade da caixa de inspeção (5.1.5.3)", pc.prof_m, pMax, "m", pc.prof_m / pMax, okP, ["profundidade " + f2(pc.prof_m) + " m ≤ " + f2(pMax) + " m"], cPm.fonte);
            if (!okP) aviso(out.avisos, "erro", "caixa de inspeção " + pc.id + " com " + f2(pc.prof_m) + " m de profundidade: acima de " + f2(pMax) + " m a NBR 8160 (5.1.5.3) pede POÇO DE VISITA (lado ou Ø maior, com degraus) — sem composição de PV na base: a caixa ficou orçada pela maior composição (confira)", [pc.id], { texto: "subir a rede (menos profundidade) ou projetar o poço de visita à parte" }); }
        });
        if (d10 != null) out.pontos.forEach(function (pt) {
          var n = G.nos[pt.no], alvo = BACIA[pt.aparelho] || (n.peca && (n.peca.peca === "caixa_sifonada" || n.peca.peca === "caixa_gordura")); if (!alvo) return;
          var a1 = anda(pt.no, function (n0, e0) { return ehCI[n0] || (E[e0.id] && E[e0.id].classe === "tubo_queda"); });
          if (a1.fim) return;
          var ok10 = a1.L <= d10 + EPS; verif(pt.famInst || pt.peca, "distância até a inspeção (4.2.6.2)", a1.L, d10, "m", a1.L / d10, ok10, [f2(a1.L) + " m até o dispositivo de inspeção/TQ ≤ " + f2(d10) + " m"], Nn.fonte("es8160.inspecao"));
          if (!ok10) aviso(out.avisos, "erro", (pt.famInst || pt.peca) + " a " + f2(a1.L) + " m do dispositivo de inspeção (máximo " + f2(d10) + " m)", [pt.famInst || pt.peca], { texto: "pôr uma caixa/peça de inspeção a no máximo " + f2(d10) + " m" });
        });
        if (d2 != null && pavs.length > 2) Object.keys(cadeias).forEach(function (k) {
          var base = G.arestas[cadeias[k][cadeias[k].length - 1]].para, a2 = anda(base, function (n0) { return ehCI[n0]; });
          if (a2.fim) return;
          var ok2 = a2.L >= d2 - EPS; verif(infoTQ[k].trechos[0], "caixa de inspeção a partir do TQ (4.2.6.2)", a2.L, d2, "m", d2 / (a2.L || EPS), ok2, ["prédio com mais de 2 pavimentos: CI a " + f2(a2.L) + " m da base do TQ ≥ " + f2(d2) + " m"], Nn.fonte("es8160.inspecao"));
          if (!ok2) aviso(out.avisos, "erro", "caixa de inspeção a " + f2(a2.L) + " m do tubo de queda " + k + " (mínimo " + f2(d2) + " m em prédio com mais de 2 pavimentos)", [infoTQ[k].trechos[0]], { texto: "afastar a caixa de inspeção para ≥ " + f2(d2) + " m da base do TQ" });
        });
      }
      /* --- ventilação: terminal (4.3.5/4.3.6), aclive (4.3.9/4.3.13), prédio térreo (4.3.11), complementar (5.2.2), bateria (4.3.19-21) */
      var aclive = vRegra("aclive_min_pct");
      GV.ordemA.forEach(function (eid) {
        var e = GV.arestas[eid]; if (e.vertical || e.tipo !== "tubo" || aclive == null) return;
        var ic = Math.abs(num(e.inclinacao, 0)), okA = ic >= aclive - EPS;
        verif(e.trecho, "aclive da ventilação horizontal (4.3.9)", ic, aclive, "%", ic > 0 ? aclive / ic : null, okA, ["|i| = " + f2(ic) + "% ≥ " + f2(aclive) + "% (o líquido volta ao esgoto)"], Nn.fonte("es8160.ventilacao_regras"));
        if (!okA) aviso(out.avisos, "erro", "ventilação " + e.trecho + " horizontal com " + f2(ic) + "% (mínimo " + f2(aclive) + "% de aclive)", [e.trecho], { texto: "dar " + f2(aclive) + "% de aclive no sentido de quem sai do esgoto" });
      });
      var cob = entrada.cobertura, tExt = { acima: null };
      compInfo.filter(function (c) { return c.tipo === "primaria" || c.tipo === "coluna"; }).forEach(function (c) {
        var yTopo = Math.max.apply(null, c.nos.map(function (v) { return GV.nos[v].y; })), idT = GV.arestas[c.arestas[0]].trecho;
        if (!cob || num(cob.cota, null) == null) {
          ctx.pendencia("entrada.cobertura", "cota e uso da cobertura não informados: a altura do terminal de ventilação (0,30 m / 2,00 m — NBR 8160:1999, 4.3.6) não foi verificada", "ventilação");
          verif(idT, "terminal de ventilação acima da cobertura (4.3.6)", null, null, "m", null, null, ["pendente: informe entrada.cobertura { cota, usoLaje }"], null); return;
        }
        var req = cob.usoLaje ? vRegra("acima_laje_uso_min") : vRegra("acima_cobertura_min");
        req = req != null ? req : (function () { var cc = Nn.consulta("es8160.terminal_ventilacao", { parametro: cob.usoLaje ? "acima_laje_uso_min" : "acima_cobertura_min" }, "valor"); if (cc.ok) ctx.consulta("es8160.terminal_ventilacao", { parametro: cob.usoLaje ? "acima_laje_uso_min" : "acima_cobertura_min" }, "valor", "ventilação"); return cc.ok ? num(cc.valor, null) : null; })();
        if (req == null) return;
        var acima = yTopo - num(cob.cota, 0), okT = acima >= req - EPS;
        verif(idT, "terminal de ventilação acima da cobertura (4.3.6)", acima, req, "m", acima > 0 ? req / acima : null, okT, ["topo a " + f2(acima) + " m da cobertura ≥ " + f2(req) + " m" + (cob.usoLaje ? " (laje usada para outros fins)" : "")], Nn.fonte("es8160.terminal_ventilacao"));
        if (!okT) aviso(out.avisos, "erro", "terminal de ventilação " + idT + " a " + f2(acima) + " m da cobertura (mínimo " + f2(req) + " m)", [idT], { texto: "prolongar o ventilador até " + f2(num(cob.cota, 0) + req) + " m" });
        aviso(out.avisos, "info", "terminal de ventilação " + idT + ": conferir o afastamento de 4,00 m de janelas, portas e vãos (ou 1,00 m acima da verga) — NBR 8160:1999, 4.3.5", [idT], null);
      });
      if (pavs.length === 1 && G.ordemA.length) {
        var dn100 = vRegra("ventilador_predio_terreo_dn");
        if (dn100 != null) { var temV = GV.ordemA.some(function (x) { return num(GV.arestas[x].dn, 0) >= dn100; });
          verif("ventilacao", "prédio térreo: ventilador DN " + dn100 + " (4.3.11)", temV ? 1 : 0, 1, "", null, temV, [temV ? "há ventilador DN ≥ " + dn100 : "nenhum ventilador DN ≥ " + dn100 + " prolongado acima da cobertura"], Nn.fonte("es8160.ventilacao_regras"));
          if (!temV) aviso(out.avisos, "erro", "prédio de 1 pavimento sem tubo ventilador DN " + dn100 + " (NBR 8160:1999, 4.3.11)", [], { texto: "prolongar um ventilador DN " + dn100 + " acima da cobertura, ligado à caixa de inspeção, ao coletor, ao subcoletor ou ao ramal da bacia" }); }
      }
      var frc = vRegra("complementar_fracao_dn_ramal");
      if (frc != null) compInfo.filter(function (c) { return c.tipo === "ramal"; }).forEach(function (c) {
        var dnEsg = Math.max.apply(null, [0].concat(c.cts.map(function (ct) { var x = ct.aresta ? E[ct.aresta] : (ent[ct.no].length ? E[ent[ct.no][0]] : null); return x && x.dn ? x.dn : 0; })));
        var dnV = Math.max.apply(null, [0].concat(c.arestas.map(function (x) { return num(GV.arestas[x].dn, 0); })));
        if (!dnEsg) return;
        var okC = dnV >= frc * dnEsg - EPS, idV = GV.arestas[c.arestas[0]].trecho;
        verif(idV, "ventilador ≥ metade do DN do ramal de esgoto (5.2.2)", dnV, frc * dnEsg, "mm", dnV ? frc * dnEsg / dnV : null, okC, ["DN " + dnV + " ≥ " + f2(frc) + " × " + dnEsg], Nn.fonte("es8160.ventilacao_regras"));
        if (!okC) aviso(out.avisos, "erro", "ventilação " + idV + " DN " + dnV + " menor que a metade do ramal de esgoto (DN " + dnEsg + ")", [idV], { texto: "usar DN ≥ " + Math.ceil(frc * dnEsg) });
      });
      var cada = vRegra("bateria_suplementar_cada_bacias"), nSup = vRegra("bateria_ramal_bacias_min_suplementar");
      if (cada != null && nSup != null) Object.keys(E).forEach(function (eid) {
        var r = E[eid]; if (r.classe !== "ramal_esgoto") return;
        var para = r.e.para; if (!sai[para].length || !E[sai[para][0]] || E[sai[para][0]].classe !== "tubo_queda") return;   /* o último trecho do ramal, que entra no TQ */
        var bacias = fontes(r.e.de).filter(function (p) { return BACIA[p.aparelho]; }); if (bacias.length < 2) return;
        var vis = {}, nCont = 0; (function rec(n0) { if (vis[n0]) return; vis[n0] = 1; if (ventilados[n0]) nCont++; ent[n0].forEach(function (x) { if (ventAresta[x] != null) nCont++; rec(G.arestas[x].de); }); })(r.e.de);
        if (ventAresta[eid] != null) nCont++;
        var kq = cadeia[sai[para][0]], acima = kq && cadeias[kq].some(function (x) { var nd = G.arestas[x].de; return G.nos[nd].y > G.nos[para].y + EPS && ent[nd].some(function (y0) { return cadeia[y0] !== kq; }); });
        var exig = 1 + Math.floor((bacias.length - 1) / cada) + (bacias.length > nSup && acima ? 1 : 0), okBt = nCont >= exig;
        verif(r.e.trecho, "bacias em bateria: ventilação de circuito/suplementar (4.3.19-4.3.21)", nCont, exig, "ventiladores", exig / (nCont || EPS), okBt, [bacias.length + " bacias no ramal: circuito entre a última e a penúltima + suplementar a cada " + cada + (bacias.length > nSup && acima ? " + suplementar entre o TQ e a 1ª bacia (mais de " + nSup + " bacias e aparelhos nos andares de cima)" : "") + " = " + exig + "; ligados: " + nCont], Nn.fonte("es8160.ventilacao_regras"));
        if (!okBt) aviso(out.avisos, "erro", "ramal " + r.e.trecho + " com " + bacias.length + " bacias em bateria: faltam ventiladores (" + nCont + " de " + exig + ")", [r.e.trecho], { texto: "tubo ventilador de circuito entre a última e a penúltima bacia" + (exig > 1 ? " e suplementar(es)" : "") });
      });
    }

    /* 10) ops */
    function opsDe(partes, lista, chaveDn) {
      Object.keys(partes).forEach(function (tid) {
        var ps = partes[tid].map(function (eid) { return lista[eid]; }).filter(Boolean);
        if (!ps.length || ps.some(function (r) { return r.dn == null || (r.pendencias && r.pendencias.length) || r.travado; })) return;
        var dnF = Math.max.apply(null, ps.map(function (r) { return r.dn; })), dn0 = ps[0][chaveDn];
        if (dnF !== dn0) { out.ops.push({ op: "instAlterar", id: tid, dn: dnF }); out.opsDesfazer.push({ op: "instAlterar", id: tid, dn: dn0 }); }
      });
    }
    var porAresta = {}; Object.keys(E).forEach(function (eid) { porAresta[eid] = { dn: E[eid].dn, pendencias: E[eid].pendencias, travado: E[eid].travado, dnModelo: E[eid].e.dn }; });
    opsDe(G.partes, porAresta, "dnModelo");
    var porV = {}; out.ventilacao.forEach(function (v) { porV[v.aresta] = { dn: v.dnReq == null ? null : v.dn, pendencias: v.pendencias, travado: v.travado, dnModelo: v.dnModelo }; });
    opsDe(GV.partes, porV, "dnModelo");

    out.tubosQueda = Object.keys(infoTQ).map(function (k) { var I = infoTQ[k]; return { id: k, trechos: I.trechos, uhc: I.uhc, pavimentos: I.pavimentos, dn: I.dn, comprimento_m: I.comprimento_m, ventilacaoPrimaria: !!topoVentilado[k] }; });
    var sts = out.trechos.map(function (t) { return t.status; }).concat(out.ventilacao.map(function (v) { return v.status; })).concat(out.verificacoes.map(function (v) { return v.status; }));
    out.status = sts.indexOf("reprovado") >= 0 ? "reprovado" : (sts.indexOf("pendente") >= 0 || out.pontos.some(function (p) { return p.status === "pendente"; }) ? "pendente" : "ok");
    if (out.avisos.some(function (a) { return a.gravidade === "erro"; }) && out.status === "ok") out.status = "reprovado";
    return out;
  }

  /* ================= caixa de gordura (NBR 8160:1999, 5.1.5.1) — pelo nº de cozinhas; CGE: V = a·N + b
   *   { cozinhas, pessoas (N, turno de maior afluxo — só CGE), uso } → { tipo, dims…, V_L, passos } ou { tipo:null, motivo } */
  var USO_CGE = /^(restaurante|escola|hospital|quartel)/;
  function caixaGordura(o) {
    var Nn = NR(); o = o || {};
    var t = Nn.tabela("es8160.caixa_gordura_escolha"); if (!t) return { tipo: null, motivo: "tabela es8160.caixa_gordura_escolha" };
    var nC = num(o.cozinhas, 0), l = null, forcaCGE = !!(o.uso && USO_CGE.test(o.uso));
    if (!forcaCGE) l = t.linhas.filter(function (x) { return !x.coletiva_obrigatoria && nC >= num(x.cozinhas_min, 0) && nC <= num(x.cozinhas_max, Infinity); })[0];
    if (!l) l = t.linhas.filter(function (x) { return x.coletiva_obrigatoria; })[0];
    if (!l) return { tipo: null, motivo: "sem linha para " + nC + " cozinhas" };
    var out = { tipo: l.tipo, diametro_m: l.diametro_m, septo_m: l.septo_m, retencao_L: l.retencao_L, dn_saida: l.dn_saida, passos: [nC + " cozinha(s)" + (forcaCGE ? " (uso " + o.uso + ")" : "") + " → " + l.tipo], fonte: Nn.fonte("es8160.caixa_gordura_escolha") };
    if (l.coletiva_obrigatoria || forcaCGE) {
      var c = Nn.consulta("es8160.cge", null, "a");
      if (!c.ok || num(o.pessoas, null) == null) { out.V_L = null; out.motivo = !c.ok ? c.motivo : "CGE: informe N = pessoas servidas no turno de maior afluxo"; out.passos.push("pendente: " + out.motivo); return out; }
      out.V_L = num(c.valor, 0) * num(o.pessoas, 0) + num(c.linha.b, 0); out.alturaMolhada_m = c.linha.altura_molhada_m;
      out.passos.push("V = " + c.valor + "·N + " + c.linha.b + " = " + c.valor + " × " + o.pessoas + " + " + c.linha.b + " = " + out.V_L + " L (CGE)");
    } else out.V_L = l.retencao_L;
    return out;
  }
  /* ================= recalque de esgoto (NBR 8160:1999, 5.1.6) — caixa coletora e bombas
   *   { vazaoAfluente_Ls, vazaoBomba_Ls, intervalo_min, volumeTotal_m3, comBacias, dnRecalque, nBombas, profundidade_m }
   *   → { Vu_m3, verificacoes[{nome, valor, limite, ok, passos}], passos } */
  function recalqueEsgoto(o) {
    var Nn = NR(), out = { Vu_m3: null, verificacoes: [], passos: [] }; o = o || {};
    var col = o.comBacias ? "com_bacias" : "sem_bacias";
    function p(par) { var c = Nn.consulta("es8160.recalque", { parametro: par }, col); return c.ok ? num(c.valor, null) : null; }
    function v(nome, valor, limite, ok, passo) { out.verificacoes.push({ nome: nome, valor: valor, limite: limite, ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: [passo], fonte: Nn.fonte("es8160.recalque") }); }
    var qa = num(o.vazaoAfluente_Ls, null), qb = num(o.vazaoBomba_Ls, null), t = num(o.intervalo_min, p("intervalo_partidas_min_min")), div = p("fator_vu_divisor");
    if (qb != null && t != null && div) { out.Vu_m3 = qb * MIN_S / LS * t / div; out.passos.push("Vu = Q·t/" + div + " = " + f2(qb * MIN_S / LS) + " m³/min × " + t + " min / " + div + " = " + f2(out.Vu_m3) + " m³ (5.1.6)"); }
    var tMin = p("intervalo_partidas_min_min"); if (tMin != null) v("intervalo entre partidas (5.1.6.8)", t, tMin, t == null ? null : t >= tMin, "t = " + t + " min ≥ " + tMin + " min");
    var fb = p("fator_bomba_afluente"); if (fb != null) v("vazão da bomba ≥ " + fb + " × afluente (5.1.6.9)", qb, qa == null ? null : fb * qa, qa == null || qb == null ? null : qb >= fb * qa - EPS, "Qb = " + qb + " L/s ≥ " + fb + " × " + qa + " L/s");
    var dMax = p("detencao_max_min"); if (dMax != null) { var vt = num(o.volumeTotal_m3, null), det = vt != null && qa ? vt * LS / qa / MIN_S : null; v("tempo de detenção (5.1.6.11/12)", det, dMax, det == null ? null : det <= dMax + EPS, "d = Vt/q = " + (det == null ? "?" : f2(det)) + " min ≤ " + dMax + " min"); }
    var dnMin = p("dn_recalque_min"); if (dnMin != null) v("DN do recalque (5.1.6.3/4)", num(o.dnRecalque, null), dnMin, num(o.dnRecalque, null) == null ? null : num(o.dnRecalque, 0) >= dnMin, "DN " + o.dnRecalque + " ≥ " + dnMin + (o.comBacias ? " (com bacias)" : " (sem bacias)"));
    var bMin = p("bombas_min"); if (bMin != null) v("número de bombas (5.1.6.3)", num(o.nBombas, null), bMin, num(o.nBombas, null) == null ? null : num(o.nBombas, 0) >= bMin, o.nBombas + " ≥ " + bMin);
    var hMin = p("profundidade_min_m"); if (hMin != null) v("profundidade da caixa coletora (5.1.6.3/4)", num(o.profundidade_m, null), hMin, num(o.profundidade_m, null) == null ? null : num(o.profundidade_m, 0) >= hMin - EPS, "h = " + o.profundidade_m + " m ≥ " + hMin + " m abaixo do afluente mais baixo");
    return out;
  }
  var MIN_S = 60, LS = 1000;   // hid:ok s por min; L por m³ (unidades)
  /* ================= Anexo C (normativo): suficiência da ventilação primária (NBR 8160:1999, p.54–60)
   * Reproduz o exemplo resolvido da norma (gabarito no test-hid-es8160). Equações do texto:
   *   he = Ce·π·(1−y)·Δt (3); Ha = Ho − he (2); Hs = 0,102·γ·Ho/(1+Rv) (5); Da = 9,81·(1+Rv)·mín(Ha; Hs) (6)(7);
   *   Sa = mín[(1+Rv)²·Ha·γ/Rv ; (Rv ≥ 1 ? Rv : 1)·γ·Ho] (9)(10); Dr,si = kTq·Qar² (13); Qar = α·QTq^(2/5) − 1,5·QTq (14);
   *   kTq = 4,9·10⁵·(A + B) (15), A = (1 + 70·ls/DTq + 0,4·nc)/DTq⁴ (16), B = 2·Σ kj/(DTq − 2·et)⁴ (17),
   *   et = 25·(Qet/DTq)^(3/5) com Qet = Σ Qej a montante (18); Dr,tv = 176,77·(−19,62·hTq·Δθ/(θi·θe) + ε·Ve²/θe) (19);
   *   Dr = máx(|Dr,si|; |Dr,tv|) + I1·Dr,amb (12).
   * ⚠ kTq (18/10/2026, texto completo): a forma (15) foi reconstituída e CONFERIDA — com A = 3,41·10⁻⁸ e o B ARREDONDADO
   *   do texto (4,2·10⁻⁷) dá exatamente o 0,2225090 do exemplo. O motor calcula SEM arredondar (kTq 0,2243; Dr 189,45 Pa —
   *   lado seguro). Dr,tv pela eq. (19) = −67,21 Pa; o texto imprime −64,14 e 67,14 (errataTexto de es8160.anexo_c).
   *   kTq informado (d.kTq) prevalece sobre a geometria (d.ls, d.nc, d.kj).
   * Condições: Das ≥ Dr e Sas ≥ Sr (Sr = Dr, premissa) e Ha ≥ Hr (Hr informado; sem ele, não avaliado). */
  function kTqAnexoC(d) {
    /* hid:fisica-inicio — constantes ESCRITAS nas equações (15) a (18) do Anexo C da NBR 8160:1999 (não são tabela) */
    var K_KTQ = 4.9e5, K_LS = 70, K_NC = 0.4, K_E = 25, EXP_E = 3 / 5, EXP_D = 4;
    /* hid:fisica-fim */
    d = d || {};
    var D = num(d.DTq, null), ls = num(d.ls, null), nc = num(d.nc, 0), kj = arr(d.kj), Q = arr(d.Qej);
    if (D == null || ls == null || !kj.length || kj.length !== Q.length) return { kTq: null, motivo: "kTq: informe DTq, ls (parte seca do TQ, m), nc (curvas na parte seca) e kj e Qej de cada ramal em uso simultâneo (Tabela C.5)" };
    var A = (1 + K_LS * ls / D + K_NC * nc) / Math.pow(D, EXP_D), Qet = 0, e = [], B = 0;
    Q.forEach(function (q, j) { Qet += num(q, 0); var et = K_E * Math.pow(Qet / D, EXP_E); e.push(et); B += num(kj[j], 0) / Math.pow(D - 2 * et, EXP_D); });
    B = 2 * B;
    return { kTq: K_KTQ * (A + B), A: A, B: B, e: e, K: K_KTQ };
  }
  function anexoC(d) {
    /* hid:fisica-inicio — constantes ESCRITAS nas equações do Anexo C da NBR 8160:1999 (não são tabela) */
    var K_HS = 0.102, K_DA = 9.81, K_QAR = 1.5, K_E = 25, K_TV = 176.77, K_TV2 = 19.62, EXP_QAR = 2 / 5, EXP_E = 3 / 5;
    /* hid:fisica-fim */
    var g = num(d.gama, K_DA), pas = [], des = [], out = { passos: pas };
    arr(d.desconectores).forEach(function (q) {
      var he = num(q.Ce, 0) * num(d.pi, 0) * (1 - num(d.y, 0)) * num(d.dt, 0), Ha = num(q.Ho, 0) - he, Rv = num(q.Rv, 0);
      var Hs = K_HS * g * num(q.Ho, 0) / (1 + Rv), Da = K_DA * (1 + Rv) * Math.min(Ha, Hs), Sa = Math.min((1 + Rv) * (1 + Rv) * Ha * g / Rv, (Rv >= 1 ? Rv : 1) * g * num(q.Ho, 0));
      des.push({ id: q.id, he: he, Ha: Ha, Hs: Hs, Da: Da, Sa: Sa });
      pas.push((q.id || "desconector") + ": he = " + f2(he) + " mm; Ha = " + f2(Ha) + " mm; Hs = " + f2(Hs) + " mm; Da = " + f2(Da) + " Pa; Sa = " + f2(Sa) + " Pa");
    });
    out.desconectores = des;
    out.Das = des.length ? Math.min.apply(null, des.map(function (x) { return x.Da; })) : null;
    out.Sas = des.length ? Math.min.apply(null, des.map(function (x) { return x.Sa; })) : null;
    out.Ha_min = des.length ? Math.min.apply(null, des.map(function (x) { return x.Ha; })) : null;
    /* e_t pela vazão ACUMULADA dos ramais a montante (Qet = Σ Qej, eq. 18): d.Qej = vazão de CADA ramal em uso simultâneo */
    var qAc = 0; out.e = arr(d.Qej).map(function (q) { qAc += num(q, 0); return K_E * Math.pow(qAc / num(d.DTq, 1), EXP_E); });
    out.Qar = num(d.alfa, 0) * Math.pow(num(d.QTq, 0), EXP_QAR) - K_QAR * num(d.QTq, 0);
    out.kTq = num(d.kTq, null); out.kTqOrigem = out.kTq != null ? "informado" : null;
    if (out.kTq == null) { var kc = kTqAnexoC(d); if (kc.kTq != null) { out.kTq = kc.kTq; out.kTqOrigem = "calculado"; out.A = kc.A; out.B = kc.B; pas.push("kTq = 4,9·10⁵·(A + B): A = (1 + 70·ls/DTq + 0,4·nc)/DTq⁴ = " + kc.A.toExponential(3) + "; B = 2·Σ kj/(DTq − 2·et)⁴ = " + kc.B.toExponential(3) + " → kTq = " + kc.kTq.toFixed(4) + " (eqs. 15 a 18)"); } else out.kTqMotivo = kc.motivo; }   // hid:ok formatação (casas decimais de apresentação)
    out.Dr_si = out.kTq == null ? null : out.kTq * out.Qar * out.Qar;
    var dth = num(d.thetaI, 0) - num(d.thetaE, 0);
    out.Dr_tv = K_TV * (-K_TV2 * num(d.hTq, 0) * dth / (num(d.thetaI, 1) * num(d.thetaE, 1)) + num(d.eps, 0) * num(d.Ve, 0) * num(d.Ve, 0) / num(d.thetaE, 1));
    out.Dr = out.Dr_si == null ? null : Math.max(Math.abs(out.Dr_si), Math.abs(out.Dr_tv)) + num(d.I1, 0) * num(d.Dr_amb, 0);
    pas.push("Das = " + f2(out.Das) + " Pa; Sas = " + f2(out.Sas) + " Pa; Qar = α·QTq^(2/5) − 1,5·QTq = " + f2(out.Qar) + " L/s; e_j = " + out.e.map(f2).join(" e ") + " mm");
    pas.push(out.Dr_si == null ? "pendente: " + (out.kTqMotivo || "kTq não informado nem calculável") : "Dr,si = kTq·Qar² = " + (Math.round(out.kTq * 1e4) / 1e4) + " × " + f2(out.Qar) + "² = " + f2(out.Dr_si) + " Pa; Dr,tv = " + f2(out.Dr_tv) + " Pa (eq. 19); Dr = " + f2(out.Dr) + " Pa");   // hid:ok arredondamento de apresentação (4 casas)
    if (out.Dr == null) { out.suficiente = null; return out; }
    var c1 = out.Das >= out.Dr, c2 = out.Sas >= out.Dr, c3 = num(d.Hr, null) == null ? null : out.Ha_min >= num(d.Hr, 0);
    out.suficiente = c1 && c2 && c3 !== false;
    pas.push("Das " + f2(out.Das) + " ≥ Dr " + f2(out.Dr) + ": " + (c1 ? "sim" : "não") + "; Sas " + f2(out.Sas) + " ≥ Sr (= Dr, premissa): " + (c2 ? "sim" : "não") + "; Ha ≥ Hr: " + (c3 === null ? "Hr não informado (não avaliado)" : (c3 ? "sim" : "não")) + " → " + (out.suficiente ? "ventilação primária SUFICIENTE" : "INSUFICIENTE: exige ventilação secundária"));
    return out;
  }
  /* ================= Anexo D (normativo): coluna de ventilação pelo método hidráulico — CONFERÊNCIA (p.62)
   *   Qar' = 40·Qar (L/min); Dcv = 4,06·[f·Lv·Qar'²]^(1/5); comercial = o imediatamente superior.
   * ⚠ Lv em METROS (18/10/2026): o texto diz "em milímetros", mas a eq. (1) é Darcy para o ar com 25 mmca e ρ = 1,2
   *   (4,06 só sai com L em m) e o exemplo (Qar' = 1162,40 L/min → Dcv ≈ 75 mm, DN 100) só fecha com Lv em metros
   *   (Lv = 45,50 m, o TQ do exemplo do Anexo C). errataTexto em es8160.anexo_d. */
  function dcvAnexoD(Qar_Ls, Lv_m) {
    /* hid:fisica-inicio — constantes escritas no Anexo D da NBR 8160:1999 */
    var K_Q = 40, K_D = 4.06, EXP = 1 / 5;
    /* hid:fisica-fim */
    var Nn = NR(), t = Nn.tabela("es8160.anexo_d"); if (!t) return { dn: null, motivo: "tabela es8160.anexo_d" };
    var fs = t.linhas.filter(function (x) { return x.grupo === "D2"; }).sort(function (a, b) { return a.dn - b.dn; }), Qp = K_Q * Qar_Ls, res = null;
    fs.forEach(function (x) { if (res) return; var D = K_D * Math.pow(num(x.valor, 0) * Lv_m * Qp * Qp, EXP); if (D <= num(x.dn, 0)) res = { dn: num(x.dn, 0), Dcv: D, f: num(x.valor, 0) }; });
    return res ? { dn: res.dn, Dcv_mm: res.Dcv, f: res.f, Qar_Lmin: Qp } : { dn: null, Qar_Lmin: Qp, motivo: "Dcv acima do maior DN da Tabela D.2" };
  }

  var HidES = { VERSAO: 1, APARELHO_DA_FAMILIA: APARELHO_DA_FAMILIA, DESCONECTOR: DESCONECTOR, calcular: calcular, caixaGordura: caixaGordura, recalqueEsgoto: recalqueEsgoto, anexoC: anexoC, kTqAnexoC: kTqAnexoC, dcvAnexoD: dcvAnexoD,
                MICTORIO_DESCARGA: MICTORIO_DESCARGA, mictorioDe: mictorioDe };
  global.HidES = HidES;
  if (typeof module !== "undefined" && module.exports) module.exports = HidES;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
