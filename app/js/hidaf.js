/* =====================================================================
 * hidaf.js — ÁGUA FRIA: dimensionamento da rede (motor PURO, ES5,
 * Node-testável). Fase 1 do docs/hidro/PLANO-HIDROSSANITARIO.md; contrato
 * em docs/hidro/CONTRATO.md (sistemas.agua_fria).
 *
 * O que faz, na ordem:
 *  1. grafo da rede de água fria do modelo (js/hidgrafo.js);
 *  2. SENTIDO do escoamento a partir da alimentação (busca em largura):
 *     reservatório (conector "saida" da caixa) ou ponto da rede pública;
 *  3. pesos/vazões acumulados de jusante para montante; VAZÃO DE PROJETO por
 *     trecho pelo método escolhido (plugável: METODOS);
 *  4. MENOR DN comercial do material (BimInst.MATERIAIS[m].dns) cuja
 *     velocidade atende o limite;
 *  5. perda distribuída (Darcy/Colebrook, FWH ou Hazen-Williams) + localizada
 *     (conexões DEDUZIDAS no nó, como o BimInst.decidir, e os acessórios);
 *  6. pressão dinâmica e estática em cada nó; ponto mais desfavorável;
 *  7. se um ponto não tem pressão, AUMENTA o DN do trecho de maior perda no
 *     caminho até ele e refaz (laço limitado), ou devolve a correção.
 *
 * ⚠ Nenhum valor de norma aqui (CONTRATO §0): vazão, peso, pressões,
 *   velocidade, diâmetro interno, rugosidade e perdas localizadas vêm do
 *   HidNormas. Faltou → o trecho/ponto sai "pendente" com a chave.
 * ⚠ Rede em ANEL não é calculada nesta fase: o trecho que fecha o anel sai
 *   com aviso (o método de pesos é para rede ramificada).
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
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function GR() { return dep("HidGrafo", "./hidgrafo.js"); }
  function NR() { return dep("HidNormas", "./hidnormas.js"); }
  function HP() { return dep("HidPerda", "./hidperda.js"); }
  function f2(v) { return v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","); }
  function f3(v) { return v == null ? "—" : String(Math.round(v * 1000) / 1000).replace(".", ","); }
  var LS = 1000;   /* L por m³ */
  var MM = 1000;   /* mm por m */
  var PA_KPA = 1000;   /* Pa por kPa */
  var GPA = 1e9;   // hid:ok Pa por GPa (unidade)
  /* N23: o TOCO da saída lateral do reservatório até a descida da tomada (adaptador, registro, tê da ventilação) — critério de projeto
     declarado (não é norma): até isto somado, deitado na cota da saída (± a tolerância), conta como tomada (NBR 5626:2020 6.9.3) */
  var TOMADA_TOCO_MAX = 0.60;   // hid:ok m de toco deitado na saída (o js/hidbarrilete.js usa 0,30 m)
  var TOMADA_TOCO_DY = 0.01;    // hid:ok 1 cm: "na cota da saída"

  /* família do modelo → nome do aparelho nas tabelas (CONTRATO §1.1). A
     entrada.aparelhos força outro (ex.: chuveiro elétrico). Família fora
     daqui e sem força = pendência "entrada.aparelhos[<id>]". */
  var APARELHO_DA_FAMILIA = { "ra-bacia": "bacia_caixa_acoplada", "ra-lavatorio": "lavatorio", "ra-chuveiro": "chuveiro" };
  /* Famílias hid-* (js/hidfamilias.js) declaram `aparelhoPrograma` (bacia, lavatorio, pia, tanque, mictorio, chuveiro,
     ducha_higienica). Daí sai a chave da tabela da norma (af.aparelhos / es.aparelhos). "bacia" cobre caixa acoplada E
     convencional; a convencional é a de válvula de descarga (nome da própria família). Sem correspondência na tabela
     (ducha higiênica, torneira): null → o ponto fica PENDENTE, nunca com valor inventado. */
  var NORMA_DO_PROGRAMA = { bacia: "bacia_caixa_acoplada", lavatorio: "lavatorio", pia: "pia_cozinha", tanque: "tanque", mictorio: "mictorio", chuveiro: "chuveiro" };
  var NORMA_DA_FAMILIA = { "hid-bacia-convencional": "bacia_valvula" };
  function familiaHid(famId) {
    var F = dep("HidFamilias", "./hidfamilias.js");
    try { return F && F.porId ? F.porId(famId) : null; } catch (e) { return null; }
  }
  function aparelhoDaFamilia(famId) {
    if (APARELHO_DA_FAMILIA[famId]) return APARELHO_DA_FAMILIA[famId];
    /* BIBLIOTECA DO ESCRITÓRIO (js/biminstbiblioteca.js): a bacia/o mictório importados do Revit pelo tipo equivalente;
       a peça genérica (não reconhecida, não mapeada) volta null = pendência, nunca um aparelho por palpite */
    var HB = dep("HidBiblioteca", "./biminstbiblioteca.js");
    if (HB && HB.ehEscritorio(famId)) return HB.aparelho(famId);
    var f = familiaHid(famId);
    if (f && f.aparelhoPrograma) return NORMA_DA_FAMILIA[famId] || NORMA_DO_PROGRAMA[f.aparelhoPrograma] || null;
    return aparelhoDoKit(famId);
  }
  /* N23 (25/10/2026) — o APARELHO DE NORMA das famílias do CATÁLOGO (bancada de pedra com cuba, tanque com gabinete…): o kit do
     hidro (dados-fonte/hidro/kits/kits.json → js/hidkitdados.js) já declara qual aparelho cada família é (`familias` do kit e
     `aparelhoNorma`). O Traçar automaticamente lançava o kit da bancada como LAVATÓRIO/PIA e o Dimensionar não sabia: a bancada
     ficava "sem aparelho de norma" (UHC e peso pendentes em toda a rede a jusante) e a descida vertical do ramal dela era lida
     como TUBO DE QUEDA ("sem ventilação primária no topo"). Agora o cálculo lê o MESMO dado do Traçar. Só os nomes que são linha
     das tabelas (af.aparelhos / es.aparelhos) — o mictório depende da instância (tipo de descarga) e fica com a família hid-*. */
  var NORMA_DO_KIT = { bacia_caixa_acoplada: 1, bacia_valvula: 1, lavatorio: 1, chuveiro: 1, pia_cozinha: 1, tanque: 1 };
  var KIT_DA_FAM = null;
  function aparelhoDoKit(famId) {
    if (!KIT_DA_FAM) {
      KIT_DA_FAM = {};
      var D = dep("HidKitDados", "./hidkitdados.js"), K = (D && D.kits) || {};
      Object.keys(K).forEach(function (k) {
        var ap = (K[k] && K[k].aparelhoNorma) || k;
        if (!NORMA_DO_KIT[ap]) return;
        arr(K[k] && K[k].familias).forEach(function (fid) { if (KIT_DA_FAM[fid] == null) KIT_DA_FAM[fid] = ap; });
      });
    }
    return KIT_DA_FAM[famId] || null;
  }
  /* grupo do quadro de aparelhos mínimos (HidPrograma): "bacia", "lavatorio"… ou null se a família não é aparelho */
  function grupoDaFamilia(famId) {
    var P = dep("HidPrograma", "./hidprograma.js");
    var HB = dep("HidBiblioteca", "./biminstbiblioteca.js");
    if (HB && HB.ehEscritorio(famId)) return HB.grupo(famId);
    if (APARELHO_DA_FAMILIA[famId]) return P && P.grupo ? P.grupo(APARELHO_DA_FAMILIA[famId]) : APARELHO_DA_FAMILIA[famId];
    var f = familiaHid(famId);
    return f && f.aparelhoPrograma ? f.aparelhoPrograma : null;
  }
  /* conectores de família que NÃO são ponto de consumo: a saída da caixa é a
     alimentação; a entrada (boia) é a chegada do recalque/alimentador */
  var CONECTOR_ALIMENTACAO = { "ra-caixa-dagua": { saida: "alimentacao", entrada: "chegada" }, "hid-caixa-dagua": { saida: "alimentacao", entrada: "chegada" }, "hid-reservatorio-tanque": { saida: "alimentacao", entrada: "chegada" } };

  /* ------------------------------------------------ MÉTODOS DE VAZÃO (plugáveis)
   * acc = { somaPesos, somaVazao, maxVazao, nPontos }. Devolvem { ok, q (L/s), passos }.
   * "pesos": Q = C·√ΣP, e nunca menos que a maior vazão de UM aparelho a
   *   jusante (um aparelho sozinho aberto tem de ser atendido) — decisão
   *   conservadora registrada para o gerente (o método de pesos subestima o
   *   sub-ramal de um aparelho só).
   * "consumo_maximo": Q = ΣQ (todos abertos ao mesmo tempo). */
  var METODOS = {
    pesos: function (acc, ctx, uso) {
      var c = ctx.consulta("af.pesos.coeficiente", null, "valor", uso);
      if (!c.ok) return { ok: false, passos: ["pendente: " + c.motivo] };
      var q = num(c.valor, 0) * Math.sqrt(acc.somaPesos), qf = Math.max(q, acc.maxVazao);
      var p = ["Q = C·√ΣP = " + f3(num(c.valor, 0)) + " × √" + f2(acc.somaPesos) + " = " + f3(q) + " L/s"];
      if (qf > q) p.push("Q ≥ maior vazão de um aparelho a jusante (" + f3(acc.maxVazao) + " L/s) → Q = " + f3(qf) + " L/s");
      return { ok: true, q: qf, passos: p };
    },
    consumo_maximo: function (acc) {
      return { ok: true, q: acc.somaVazao, passos: ["Q = ΣQ (consumo máximo possível) = " + f3(acc.somaVazao) + " L/s"] };
    }
  };

  /* consulta OPCIONAL: coluna que pode não existir sem virar pendência
     (ex.: pressão mínima própria do aparelho, que cai na geral) */
  function opcional(ctx, chave, filtro, coluna) {
    var c = NR().consulta(chave, filtro, coluna);
    if (!c.ok) return null;
    return ctx.consulta(chave, filtro, coluna);
  }

  function aviso(lista, sistema, grav, texto, elementos, corrigir) {
    lista.push({ id: "af-" + lista.length, sistema: sistema, gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null });
  }

  /* --------------------------------------------- ALIMENTAÇÃO (nó de partida) */
  /* as saídas de reservatório `ids` estão ligadas entre si por tubo e na mesma cota (a tolerância do grupo de caixas do barrilete)? */
  function fontesInterligadas(G, ids) {
    var HBRf = dep("HidBarrilete", "./hidbarrilete.js"), tolY = HBRf && HBRf.GEO_BAR ? HBRf.GEO_BAR.nivelGrupo : 0.30;   // hid:ok mesma tolerância do agrupamento das caixas
    if (ids.some(function (id) { return Math.abs(G.nos[id].y - G.nos[ids[0]].y) > tolY + 1e-9; })) return false;   // hid:ok tolerância numérica
    var vis = {}, fila = [ids[0]]; vis[ids[0]] = 1;
    for (var q = 0; q < fila.length; q++) G.nos[fila[q]].arestas.forEach(function (eid) { var o = G.outro(G.arestas[eid], fila[q]); if (!vis[o]) { vis[o] = 1; fila.push(o); } });
    return ids.every(function (id) { return vis[id]; });
  }
  function acharFonte(G, al, avisos, SIS) {
    al = al || {};
    var ids = G.ordemN, achado = null;
    if (al.conector) ids.forEach(function (id) { var n = G.nos[id]; if (!achado && n.aparelho && n.aparelho.conector === al.conector) achado = id; });
    else if (al.ponto) {
      var BIt = BI().TOL, dm = Infinity;
      ids.forEach(function (id) { var n = G.nos[id], dx = n.x - al.ponto.x, dy = n.y - al.ponto.y, dz = n.z - al.ponto.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d <= BIt && d < dm) { dm = d; achado = id; } });
    } else {
      var cands = ids.filter(function (id) { var a = G.nos[id].aparelho; return a && CONECTOR_ALIMENTACAO[a.famId] && CONECTOR_ALIMENTACAO[a.famId][a.cid] === "alimentacao"; });
      if (cands.length === 1) achado = cands[0];
      else if (cands.length > 1 && fontesInterligadas(G, cands)) {
        /* 27/10/2026 (Casa 487, duas caixas): reservatórios LIGADOS entre si pela rede e no MESMO nível d'água são uma fonte só (barrilete comum) —
           o cálculo parte do de menor id e as outras saídas ficam como fontes irmãs (sem fechar anel: a árvore chega nelas pelo coletor) */
        achado = cands.slice().sort(function (a, b) { return String(G.nos[a].aparelho.famInst) < String(G.nos[b].aparelho.famInst) ? -1 : 1; })[0];
        aviso(avisos, SIS || "agua_fria", "info", "reservatórios interligados (" + cands.map(function (id) { return G.nos[id].aparelho.famInst; }).join(", ") + "): mesmo nível d'água, barrilete comum — a rede é calculada a partir de " + G.nos[achado].aparelho.famInst + " com todas as colunas; o volume útil é a soma", cands.map(function (id) { return G.nos[id].aparelho.famInst; }), null);
      }
      else if (cands.length > 1) aviso(avisos, SIS || "agua_fria", "erro", "há " + cands.length + " reservatórios ligados à rede de água fria: diga qual alimenta (entrada.alimentacao.conector)", cands.map(function (id) { return G.nos[id].aparelho.famInst; }), { texto: "escolher o reservatório de alimentação" });
    }
    return achado;
  }

  /* ================================================================ CALCULAR
   * entrada = a do HidDimensionar (CONTRATO §2); ctx = HidNormas.contexto();
   * R = BimInst.rede(...) (o orquestrador passa a mesma para AF e ES).
   * perfil (opcional) — o MESMO método para outra rede pressurizada (água quente, js/hidaq.js):
   *   { sistema, nome, prefixo, temperatura_C, alimentacao, aparelho(ctx, ap, coluna, uso) → consulta,
   *     di(material, dn, uso, registrarFalta) → m | null, semDnMin, semPminPeca,
   *     pontosExtra: { famInst: { aparelho, vazao_ls, peso, pressaoMin_kpa, fonte } } }
   *   Sem perfil = água fria, exatamente como antes (os testes da fase 1 são o controle). */
  function calcular(entrada, ctx, R, perfil) {
    perfil = perfil || {};
    var SIS = perfil.sistema || "agua_fria", NOME = perfil.nome || "água fria";
    var H = HH(), B = BI(), Gr = GR();
    entrada = entrada || {}; ctx = ctx || NR().contexto();
    var opc = entrada.opcoes || {}, mod = entrada.modelo || {}, est = mod.estado || {};
    R = R || B.rede(est, mod.avaliarFam);
    var metodoNome = opc.metodoVazao || "pesos", formula = opc.formulaPerda || "auto";
    var Tagua = perfil.temperatura_C != null ? perfil.temperatura_C : (opc.temperatura_C == null ? H.T_PADRAO_C : opc.temperatura_C), Tdeclarada = perfil.temperatura_C != null || opc.temperatura_C != null;
    var fluido = H.agua(Tagua);
    var travados = {}; arr(opc.travados).forEach(function (id) { travados[id] = 1; });
    var out = { status: "ok", metodoVazao: metodoNome, formulaPerda: formula, temperatura_C: fluido.T,
                fluido: { rho: fluido.rho, nu: fluido.nu, fonte: fluido.fonte }, alimentacao: null,
                trechos: [], pontos: [], pontoCritico: null, verificacoes: [], avisos: [], premissas: [], ops: [], opsDesfazer: [] };
    function premissa(item, valor) { if (!out.premissas.some(function (p) { return p.item === item; })) out.premissas.push({ item: item, valor: valor, origem: "padrao_motor" }); }
    var G = Gr.montar(R, est, [SIS]);
    if (!G.ordemA.length) { out.status = "vazio"; return out; }
    if (fluido.foraDaTabela) aviso(out.avisos, SIS, "aviso", "temperatura " + fluido.T + " °C fora da tabela de propriedades da água (0–100 °C): extrapolada", []);
    var metodo = METODOS[metodoNome];
    if (!metodo) { ctx.pendencia("opcoes.metodoVazao", "método de vazão \"" + metodoNome + "\" desconhecido (" + Object.keys(METODOS).join(", ") + ")", NOME); out.status = "pendente"; return out; }

    /* 1) alimentação */
    var al = (perfil.alimentacao !== undefined ? perfil.alimentacao : entrada.alimentacao) || {}, src = acharFonte(G, al, out.avisos, SIS);
    if (!src) {
      ctx.pendencia("entrada.alimentacao", "a rede de " + NOME + " não tem ponto de partida: ligue a saída de um reservatório ou informe entrada.alimentacao", NOME);
      aviso(out.avisos, SIS, "erro", "rede de " + NOME + " sem alimentação: nenhum reservatório ligado nem ponto informado", [], { texto: "ligar a saída do reservatório à rede ou informar o ponto de alimentação" });
      out.status = "pendente"; return out;
    }
    /* "pressao": carga dada por outro cálculo (a água quente recebe a pressão da água fria na entrada do aquecedor) */
    var nS = G.nos[src], rede = al.tipo === "rede_publica" || al.tipo === "pressao";
    var Hsrc, alAviso = null;
    if (rede && num(al.carga_m, null) != null) Hsrc = num(al.carga_m, 0);   /* carga já calculada por outro motor (cota + p/ρg) */
    else if (rede) {
      if (num(al.pressao_kpa, null) == null) { ctx.pendencia(al.chavePressao || "entrada.alimentacao.pressao_kpa", al.motivoSemPressao || "pressão disponível da rede pública não informada", NOME); out.status = "pendente"; return out; }
      Hsrc = nS.y + H.kpaParaM(num(al.pressao_kpa, 0), fluido.rho);
    } else if (num(al.nivelAgua, null) != null) Hsrc = num(al.nivelAgua, 0);
    /* Casa 487 (F9): nível mínimo DECLARADO na cota da saída (a caixa esvazia até a saída quando falta água da rede; sem folga por boia). Premissa de projeto, não "dado faltando": sem o aviso de "não informado" */
    else if (al.nivelMinimoNaSaida) { Hsrc = nS.y; alAviso = "nível d'água mínimo na cota da saída do reservatório (premissa de projeto: a caixa pode esvaziar até a saída)"; premissa("nível d'água mínimo", "cota da saída do reservatório (" + f2(nS.y) + " m): a caixa pode esvaziar até a saída quando falta água da rede pública; sem folga por boia"); }
    else { Hsrc = nS.y; alAviso = "nível d'água mínimo não informado: considerado na cota da saída do reservatório (o mais desfavorável)"; aviso(out.avisos, SIS, "aviso", alAviso, nS.aparelho ? [nS.aparelho.famInst] : [], { texto: "informar o nível d'água mínimo do reservatório (entrada.alimentacao.nivelAgua)" }); }
    /* ⚠ ESTÁTICA com o nível MÁXIMO (revisão F7 A2): o nível mínimo é o do cálculo dinâmico
       (conservador para a pressão que falta), mas para a pressão que SOBRA (VRP) o lado seguro é o
       máximo — extravasor/boia. Ordem: informado (nivelAguaMax) → mínimo + altura útil → topo do
       reservatório da família (declarado) → sem dado: verificação estática PENDENTE. */
    var Hmax = null, origemMax = null;
    if (rede && num(al.cargaEstatica_m, null) != null) { Hmax = num(al.cargaEstatica_m, 0); origemMax = al.origemCargaEstatica || "carga estática informada"; }
    /* ⚠ "pressao" (carga DINÂMICA vinda de outro cálculo) não é estática: sem cargaEstatica_m a estática fica PENDENTE
       (revisão fase 2 A1 — antes caía em "pressão disponível da rede pública" com a carga dinâmica) */
    else if (rede && al.tipo === "pressao") { Hmax = null; }
    else if (rede) { Hmax = Hsrc; origemMax = "pressão disponível da rede pública"; }
    else if (num(al.nivelAguaMax, null) != null) { Hmax = num(al.nivelAguaMax, 0); origemMax = "nível máximo informado"; }
    else if (num(al.nivelAgua, null) != null && num(al.alturaUtil, null) != null) { Hmax = num(al.nivelAgua, 0) + num(al.alturaUtil, 0); origemMax = "nível mínimo + altura útil informada"; }
    else {
      var fRes = nS.aparelho ? arr(est.familias).filter(function (f) { return f.id === nS.aparelho.famInst; })[0] : null, avR = null;
      if (fRes && typeof mod.avaliarFam === "function") { try { avR = mod.avaliarFam(fRes.famId, fRes.tipoId, fRes.inst); } catch (eR) { avR = null; } }
      var altR = avR && avR.valores ? num(avR.valores.Altura, null) : null, yR = fRes ? num(fRes.inst && fRes.inst.y != null ? fRes.inst.y : fRes.y, null) : null;
      if (altR != null && yR != null) {
        Hmax = yR + altR; origemMax = "topo do reservatório da família (cota " + f2(Hmax) + " m)";
        premissa("nível d'água máximo (estática)", "topo do reservatório " + fRes.id + " = " + f2(Hmax) + " m — informe o nível do extravasor (entrada.alimentacao.nivelAguaMax)");
      }
    }
    out.alimentacao = { no: src, tipo: rede ? (al.tipo === "pressao" ? "pressao" : "rede_publica") : "reservatorio", cota: nS.y, nivelAgua: rede ? null : Hsrc, nivelAguaMax: rede ? null : Hmax, origemNivelMax: origemMax, pressao_kpa: rede && al.tipo !== "pressao" ? num(al.pressao_kpa, null) : null, carga_m: Hsrc, aviso: alAviso,
                        famInst: nS.aparelho ? nS.aparelho.famInst : null };

    /* 2) sentido: busca em largura a partir da alimentação */
    var pai = {}, filhos = {}, ordem = [src], visto = {}, anel = {};
    visto[src] = 1; filhos[src] = [];
    for (var qi = 0; qi < ordem.length; qi++) {
      var nid = ordem[qi];
      G.nos[nid].arestas.forEach(function (eid) {
        if (eid === pai[nid]) return;
        var e = G.arestas[eid], o = G.outro(e, nid);
        if (visto[o]) { if (!anel[eid] && pai[o] !== eid) { anel[eid] = 1; } return; }
        visto[o] = 1; pai[o] = eid; filhos[o] = []; filhos[nid].push(eid); e.de = nid; e.para = o; ordem.push(o);
      });
    }
    Object.keys(anel).forEach(function (eid) {
      var e = G.arestas[eid];
      aviso(out.avisos, SIS, "aviso", "o trecho " + (e.trecho || e.acessorio) + " fecha um anel na rede de " + NOME + ": rede em malha não é calculada nesta fase (o trecho fica sem dimensionar)", [e.trecho || e.acessorio], { texto: "abrir o anel (rede ramificada) ou dimensionar o trecho à mão" });
    });
    /* D5b (27/10/2026, frente 1b-ii): a válvula de retenção / pé com crivo é UNIDIRECIONAL (face 1 = entrada, face 2 = saída): se o escoamento a partir da
       alimentação chega pela face 2 (o nó de jusante é o da ENTRADA), ela foi instalada ao contrário — o motor não a vira sozinho */
    G.ordemA.forEach(function (eid) {
      var e = G.arestas[eid];
      if (e.tipo === "acessorio" && e.conexao === "valvula_retencao" && e.de && e.noFaceE && e.para === e.noFaceE)
        aviso(out.avisos, SIS, "aviso", "válvula de retenção instalada ao contrário (" + e.acessorio + "): o escoamento chega pela face de SAÍDA — gire a válvula (a seta aponta para o consumo)", [e.acessorio]);
    });
    var soltos = G.ordemA.filter(function (eid) { return !G.arestas[eid].de && !anel[eid]; });
    if (soltos.length) aviso(out.avisos, SIS, "aviso", soltos.length + " trecho(s) de " + NOME + " sem ligação com a alimentação: não foram calculados", soltos.map(function (eid) { return G.arestas[eid].trecho || G.arestas[eid].acessorio; }), { texto: "ligar os trechos à rede alimentada" });

    /* PRESSURIZAÇÃO (js/hidpressao.js): a maior altura que as bombas a montante podem somar em cada nó (curva na
       vazão mínima) — entra na carga ESTÁTICA (bomba parada no shut-off) e na conta "aumentar DN resolve?" */
    var HPZ = dep("HidPressao", "./hidpressao.js"), gmax = {};
    ordem.forEach(function (nid0) { if (nid0 === src) gmax[nid0] = 0; filhos[nid0].forEach(function (eid) { var e = G.arestas[eid]; gmax[e.para] = (gmax[nid0] || 0) + (e.tipo === "bomba" && e.equipamento && e.equipamento.papel === "bomba" && e.de === e.equipamento.entrada && HPZ ? num(HPZ.ganhoMax(e.equipamento.famId), 0) : 0); }); });

    /* 3) pontos de consumo */
    var aparelhosForcados = entrada.aparelhos || {}, pontoDe = {};
    ordem.forEach(function (nid) {
      var n = G.nos[nid];
      if (nid === src) return;
      if (!n.aparelho) {
        if (n.arestas.length === 1 && !n.peca) aviso(out.avisos, SIS, "info", "ponta de tubo sem aparelho (" + f2(n.x) + "; " + f2(n.y) + "; " + f2(n.z) + "): não consome", [G.arestas[n.arestas[0]].trecho], null);
        return;
      }
      var a = n.aparelho, papel = CONECTOR_ALIMENTACAO[a.famId] && CONECTOR_ALIMENTACAO[a.famId][a.cid];
      if (papel === "alimentacao" && G.nos[src].aparelho && CONECTOR_ALIMENTACAO[G.nos[src].aparelho.famId] && fontesInterligadas(G, [src, nid])) { aviso(out.avisos, SIS, "info", "a saída do reservatório " + a.famInst + " está ligada ao barrilete comum com " + G.nos[src].aparelho.famInst + " (mesmo nível d'água): fonte irmã, não é ponto de consumo", [a.famInst], null); return; }
      if (papel) { aviso(out.avisos, SIS, "aviso", "a " + (papel === "chegada" ? "entrada (boia)" : "saída") + " do reservatório " + a.famInst + " está no meio da rede alimentada por outro ponto: confira o esquema", [a.famInst], null); return; }
      var ap = aparelhosForcados[a.famInst] || aparelhoDaFamilia(a.famId);
      var pt = { no: nid, famInst: a.famInst, famId: a.famId, conector: a.conector, aparelho: ap, cota: n.y, vazao_ls: null, peso: null, pressaoMinima_kpa: null, dnMin: null,
                 pressaoDinamica_kpa: null, pressaoEstatica_kpa: null, ok: null, eta: null, status: "pendente", fontePmin: null };
      var ex = perfil.pontosExtra ? perfil.pontosExtra[a.famInst] : null;
      if (ex) { pt.aparelho = ap = ex.aparelho || ap || "ponto"; pt.extra = true; }
      if (!ap) ctx.pendencia("entrada.aparelhos[" + a.famInst + "]", "a família " + (a.famId || "?") + " não tem aparelho de norma associado (vazão e peso)", NOME);
      else {
        /* consumo do ponto: tabela da água fria, a do perfil (água quente) ou o que outro cálculo
           entregou (pontosExtra: a entrada de água fria do aquecedor consome o que a água quente pede) */
        var cq = ex ? { ok: num(ex.vazao_ls, null) != null, valor: ex.vazao_ls } : (perfil.aparelho ? perfil.aparelho(ctx, ap, "vazao_ls", "ponto " + a.famInst) : ctx.consulta("af.aparelhos", { aparelho: ap }, "vazao_ls", "ponto " + a.famInst));
        if (cq.ok) pt.vazao_ls = num(cq.valor, null);
        pt.fonteVazao = cq.ok ? (cq.fonte || (ex ? ex.fonte : null)) : null;
        if (metodoNome === "pesos") { var cp = ex ? { ok: num(ex.peso, null) != null, valor: ex.peso } : (perfil.aparelho ? perfil.aparelho(ctx, ap, "peso", "ponto " + a.famInst) : ctx.consulta("af.aparelhos", { aparelho: ap }, "peso", "ponto " + a.famInst)); if (cp.ok) pt.peso = num(cp.valor, null); }
        /* pressão mínima do ponto: a geral da norma e, se houver, a da peça (catálogo
           do fabricante) — vale a MAIOR (a 5626:2020: "a pressão requerida pelo
           fabricante prevalece se maior") */
        var pg = ctx.consulta("af.pressao.dinamica_minima_ponto", null, "valor", "ponto " + a.famInst);
        var pp = ex && num(ex.pressaoMin_kpa, null) != null ? { ok: true, valor: num(ex.pressaoMin_kpa, 0), fonte: ex.fontePressao || ex.fonte || null } : (perfil.aparelho ? null : opcional(ctx, "af.aparelhos", { aparelho: ap }, "pressao_min_kpa"));
        var cands = [pg, pp].filter(function (c) { return c && c.ok; }).sort(function (x, y) { return num(y.valor, 0) - num(x.valor, 0); });
        if (cands.length) { pt.pminGeral = num(cands[0].valor, null); pt.fonteGeral = cands[0].fonte; pt.pressaoMinima_kpa = pt.pminGeral; pt.fontePmin = pt.fonteGeral; }
        /* a peça tem pressão de serviço tabelada por DN do sub-ramal (ex.: válvula de descarga,
           tabela do fabricante): decide-se depois do DN (pminPonto) — revisão F7 A1 */
        pt.temPminPeca = !perfil.semPminPeca && NR().linhas("af.aparelhos.pressao_min", { aparelho: ap }).length > 0;
        var dm = perfil.semDnMin ? null : (opcional(ctx, "af.aparelhos.dn_min", { aparelho: ap }, "dn_min") || opcional(ctx, "af.aparelhos", { aparelho: ap }, "dn_min"));
        if (dm) pt.dnMin = num(dm.valor, null);
      }
      pontoDe[nid] = pt; out.pontos.push(pt);
    });

    /* 4) acumulados de jusante para montante */
    var acc = {};
    for (var k = ordem.length - 1; k >= 0; k--) {
      var id = ordem[k], p0 = pontoDe[id];
      var a0 = { somaPesos: 0, somaVazao: 0, maxVazao: 0, nPontos: 0, pend: false };
      if (p0) {
        a0.nPontos = 1;
        if (p0.vazao_ls == null || (metodoNome === "pesos" && p0.peso == null)) a0.pend = true;
        else { a0.somaVazao = p0.vazao_ls; a0.maxVazao = p0.vazao_ls; a0.somaPesos = metodoNome === "pesos" ? p0.peso : 0; }
      }
      filhos[id].forEach(function (eid) { var c = acc[G.arestas[eid].para]; a0.somaPesos += c.somaPesos; a0.somaVazao += c.somaVazao; a0.maxVazao = Math.max(a0.maxVazao, c.maxVazao); a0.nPontos += c.nPontos; a0.pend = a0.pend || c.pend; });
      acc[id] = a0;
    }

    /* 5) vazão por aresta */
    var E = {};    /* estado de cálculo por aresta */
    ordem.forEach(function (nid) {
      filhos[nid].forEach(function (eid) {
        var e = G.arestas[eid], c = acc[e.para], r = { e: e, q: null, passosQ: [], pend: [], dn: e.tipo === "acessorio" ? null : e.dn, travado: !!(e.trecho != null && (travados[e.trecho] || (HPZ && HPZ.travado && HPZ.travado(e.trecho)))) };
        if (c.nPontos === 0) { r.q = 0; r.passosQ.push("sem aparelho a jusante: Q = 0"); }
        else if (c.pend) { r.pend.push("vazão/peso de aparelho a jusante"); r.passosQ.push("pendente: falta vazão ou peso de aparelho a jusante"); }
        else { var m = metodo(c, ctx, "trecho " + (e.trecho || e.acessorio)); if (m.ok) r.q = m.q; else r.pend.push("método de vazão"); r.passosQ = m.passos; }
        r.somaPesos = c.somaPesos; r.somaVazao = c.somaVazao;
        E[eid] = r;
      });
    });

    /* 6) DN: menor comercial com velocidade ≤ máxima (e ≥ DN mínimo do aparelho no sub-ramal) */
    var vmax = ctx.consulta("af.velocidade.maxima", null, "valor", NOME + " — velocidade");
    var vMax = vmax.ok ? num(vmax.valor, null) : null;
    /* ⚠ limite por DN (critério de projetista tabelado, ex.: 14·√D até 2,5 m/s)
       quando existe: vale o MENOR dos dois — decisão conservadora (DN maior) */
    function vLimite(material, dn, uso) {
      var c = NR().consulta("af.velocidade.maxima_por_dn", { material: material, dn: dn }, "v_max");
      var vd = c.ok ? num(ctx.consulta("af.velocidade.maxima_por_dn", { material: material, dn: dn }, "v_max", uso).valor, null) : null;
      if (vd != null && vMax != null) return { v: Math.min(vd, vMax), fonte: vd < vMax ? c.fonte : vmax.fonte };
      if (vd != null) return { v: vd, fonte: c.fonte };
      return { v: vMax, fonte: vmax.ok ? vmax.fonte : null };
    }
    function dns(material) { var M = B.MATERIAIS[material]; return M ? M.dns.slice().sort(function (x, y) { return x - y; }) : []; }
    function di(material, dn, uso) {
      if (perfil.di) return perfil.di(material, dn, uso, false);
      var c = NR().consulta("materiais.diametro_interno", { material: material, dn: dn }, "di_mm");
      if (!c.ok) return null;
      ctx.consulta("materiais.diametro_interno", { material: material, dn: dn }, "di_mm", uso);
      return num(c.valor, null) / MM;
    }
    /* ⚠ NBR 5626:2020, 6.14.3: "não há limitação para diâmetros nominais mínimos de sub-ramais" — a
       tabela de DN mínimo (1998) deixou de ser exigência. O DN do ponto do fabricante (conector da
       família) vira só RECOMENDAÇÃO, avisada depois (decisão do RT 17/10/2026). */
    /* 27/10/2026 (decisão do Rogério, prática RA): o barrilete e as colunas de descida (os trechos "bar-…" do js/hidbarrilete.js) saem DN 50 no
       mínimo — o dimensionamento pode AUMENTAR (60, 75…) mas nunca baixar disto. Os ramais e sub-ramais seguem a NBR, sem mínimo. */
    var HBRm = dep("HidBarrilete", "./hidbarrilete.js");
    function dnMinDe(e) { var m = HBRm && HBRm.dnMinimoDe && e && e.trecho != null ? HBRm.dnMinimoDe(e.trecho) : null; return m != null ? m : 0; }
    Object.keys(E).forEach(function (eid) {
      var r = E[eid], e = r.e;
      if (e.tipo !== "tubo" || r.travado || r.q == null) return;
      var lista = dns(e.material).filter(function (d) { return d >= dnMinDe(e); }), comDi = [], escolhido = null;
      lista.forEach(function (d) { var x = di(e.material, d, "trecho " + e.trecho); if (x) comDi.push({ dn: d, di: x }); });
      if (!comDi.length) {
        if (perfil.di) perfil.di(e.material, lista[0], "trecho " + e.trecho, true);
        else ctx.consulta("materiais.diametro_interno", { material: e.material, dn: lista[0] }, "di_mm", "trecho " + e.trecho);
        r.pend.push("diâmetro interno de " + e.material); return;
      }
      for (var i = 0; i < comDi.length && !escolhido; i++) {
        var v = r.q / LS / H.area(comDi[i].di);
        var lim = vLimite(e.material, comDi[i].dn, "trecho " + e.trecho).v;
        if (lim == null || v <= lim) escolhido = comDi[i].dn;
      }
      r.dn = escolhido || comDi[comDi.length - 1].dn;
      r.dnsPossiveis = comDi.map(function (x) { return x.dn; });
    });
    /* ⚠ o DN não aumenta no sentido do escoamento (opção, padrão sim): o trecho
       a montante fica com pelo menos o maior DN dos que ele alimenta */
    function propagarMontante() {
      if (opc.dnNaoAumentaAJusante === false) return;
      for (var k2 = ordem.length - 1; k2 >= 0; k2--) {
        var nid2 = ordem[k2], pe = pai[nid2]; if (!pe || !E[pe]) continue;
        var rp = E[pe]; if (rp.travado) continue;
        filhos[nid2].forEach(function (eid) {
          var rf = E[eid]; if (!rf || rf.dn == null) return;
          var d = rf.dn;
          /* acessório entre dois tubos: só passa adiante a exigência do tubo de baixo */
          if (rp.e.tipo === "acessorio") { if (rp.dn == null || d > rp.dn) rp.dn = d; return; }
          if (d > rp.dn && (rp.dnsPossiveis || []).indexOf(d) >= 0) rp.dn = d;
        });
      }
    }
    propagarMontante();

    /* 7) hidráulica: perdas e pressões (refeita a cada aumento de DN) */
    var pmRede = ctx.consulta("af.pressao.dinamica_minima_rede", null, "valor", NOME + " — rede");
    var pmEst = ctx.consulta("af.pressao.estatica_maxima", null, "valor", NOME + " — estática");
    /* perdas de carga (fórmula por material, Leq/K, premissas): js/hidperda.js,
       o mesmo motor do recalque (hidbombas) — uma regra só para as duas contas */
    var PD = HP().criar(ctx, fluido, formula, premissa);
    function formulaMat(m) { return PD.formulaMat(m); }
    function perdaDistribuida(q, d, L, material, uso) { return PD.distribuida(q, d, L, material, uso); }
    function perdaLocal(conexao, material, dn, J, v, uso, variante, extra) { return PD.local(conexao, material, dn, J, v, uso, variante, extra); }
    /* as conexões que a aresta "e" atravessa ao sair do nó de montante */
    function conexoesNaSaida(e) {
      var n = e.de, pe = pai[n], lista = [];
      lista.extra = [];   /* contexto de topologia por conexão (DN de montante, tê de redução central) — só o K do fabricante (PPR) o lê; a Leq ignora */
      if (n === src) { if (!rede) lista.push("entrada_normal"); return lista; }
      if (!pe) return lista;
      var ep = G.arestas[pe];
      if (e.tipo === "acessorio" || ep.tipo === "acessorio" || e.tipo === "bomba" || ep.tipo === "bomba") return lista;   /* a perda do acessório (e da bomba/união) é a dele */
      var outs = filhos[n], dIn = Gr.dirSaindo(ep, n), dnIn = (E[pe] && E[pe].dn) || ep.dn, dnE = E[e.id].dn;
      if (outs.length === 1) {
        var avs = [], cx = B.decidir([{ dir: dIn, dn: dnIn, material: ep.material, aplicacao: ep.aplicacao, vertical: ep.vertical },
                                      { dir: Gr.dirSaindo(e, n), dn: dnE, material: e.material, aplicacao: e.aplicacao, vertical: e.vertical }], SIS, null, avs);
        cx.forEach(function (c) { lista.push(c.tipo === "te_reducao" ? "reducao" : c.tipo); lista.extra.push({ dnMont: dnIn }); });
        return lista;
      }
      if (outs.length === 2) {
        var o1 = G.arestas[outs[0]], o2 = G.arestas[outs[1]], d1 = Gr.dirSaindo(o1, n), d2 = Gr.dirSaindo(o2, n);
        var a1 = Gr.desvio(dIn, d1), a2 = Gr.desvio(dIn, d2), a12 = Gr.desvio(d1, d2);
        var dnO1 = E[o1.id].dn, dnO2 = E[o2.id].dn, bilat = a12 < a1 && a12 < a2, redCentral;
        /* tê de REDUÇÃO CENTRAL (tabela do fabricante): a derivação é menor que a corrida — na saída bilateral a derivação é a ENTRADA */
        redCentral = bilat ? dnIn < Math.max(dnO1, dnO2) : Math.min(dnO1, dnO2) < dnIn;
        if (bilat) lista.push("te_saida_bilateral");                           /* a entrada é a derivação */
        else lista.push((e.id === o1.id ? a1 <= a2 : a2 < a1) ? "te_passagem_direta" : "te_saida_lateral");
        lista.extra.push({ dnMont: dnIn, reducaoCentral: redCentral });
        if (Math.abs(dnE - dnIn) > 0) { lista.push("reducao"); lista.extra.push({ dnMont: dnIn, jaNoTe: redCentral }); }
        return lista;
      } else { lista.push("te_saida_lateral"); lista.extra.push({ dnMont: dnIn }); }               /* 4+ ramos: cruzeta (aviso abaixo) */
      if (Math.abs(dnE - dnIn) > 0) { lista.push("reducao"); lista.extra.push({ dnMont: dnIn }); }
      return lista;
    }
    var Hn, pendNo;
    function avaliar() {
      Hn = {}; pendNo = {};
      Hn[src] = Hsrc; pendNo[src] = false;
      ordem.forEach(function (nid) {
        filhos[nid].forEach(function (eid) {
          var r = E[eid], e = r.e, uso = "trecho " + (e.trecho || e.acessorio);
          r.hf = null; r.conexoes = []; r.passosH = []; r.pendH = [];
          /* PRESSURIZADOR: a aresta da bomba SOMA a altura da curva na vazão do trecho (hf negativo); a união é passagem
             (perda de luva — sem valor tabelado, desprezada como a luva). Bomba percorrida ao contrário (a reserva vista
             pelo recalque) não conduz: a retenção fecha — ganho zero. */
          if (e.tipo === "bomba") {
            var eqp = e.equipamento || {};
            /* união (passagem): comprimento equivalente da união de PVC da tabela do fabricante, no J do tubo que chega */
            var Jp = pai[nid] && E[pai[nid]] ? E[pai[nid]].J : null, lu = eqp.papel === "passagem" && HPZ && HPZ.leqExtra && Jp != null ? HPZ.leqExtra("uniao", "pvc_soldavel", E[pai[nid]].dn) : null;
            if (lu) { r.hf = lu.leq_m * Jp; r.ganho = 0; r.conexoes.push({ tipo: "uniao", leq_m: lu.leq_m, perda_m: r.hf, fonteFicha: lu.fonte }); r.passosH.push("união: Leq " + f2(lu.leq_m) + " m × J " + f3(Jp) + " = " + f3(r.hf) + " m (" + lu.fonte.doc.split(" — ")[0] + ", p. " + lu.fonte.pagina + ")"); }
            else if (eqp.papel !== "bomba" || e.de !== eqp.entrada) { r.hf = 0; r.ganho = 0; if (eqp.papel === "bomba") r.passosH.push("bomba percorrida do recalque para a sucção (reserva/retenção): sem ganho, sem vazão"); }
            else if (r.q == null) r.pendH.push("vazão");
            else { var gb = HPZ ? HPZ.ganho(eqp.famId, r.q) : null; if (!gb || gb.H == null) { r.pendH.push("vazão fora da curva do pressurizador"); r.passosH = gb ? gb.passos.slice() : []; } else { r.hf = -gb.H; r.ganho = gb.H; r.Qbomba = gb.Q; r.passosH = gb.passos.slice(); } }
            var pendB = pendNo[nid] || r.pendH.length > 0; pendNo[e.para] = pendB;
            Hn[e.para] = Hn[nid] == null || r.hf == null ? null : Hn[nid] - r.hf; r.Hmont = Hn[nid]; r.Hjus = Hn[e.para];
            return;
          }
          if (e.tipo === "acessorio") { var dPai = pai[nid] && E[pai[nid]] ? E[pai[nid]].dn : null, fJ = filhos[e.para][0] && E[filhos[e.para][0]] ? E[filhos[e.para][0]].dn : null; r.dn = dPai != null ? dPai : (fJ != null ? fJ : e.dn); }
          var d = r.dn != null ? di(e.material, r.dn, uso) : null;
          r.di = d;
          if (r.q == null || d == null) { r.pendH.push(d == null ? "diâmetro interno" : "vazão"); }
          else {
            var dist = e.tipo === "tubo" ? perdaDistribuida(r.q, d, e.comprimento, e.material, uso) : perdaDistribuida(r.q, d, 0, e.material, uso);
            if (!dist) r.pendH.push("parâmetro da fórmula " + formulaMat(e.material));
            else {
              r.v = dist.v; r.J = dist.J; r.hfDist = e.tipo === "tubo" ? dist.hf : 0; r.passosH = dist.passos.slice(); r.Re = dist.Re;
              var cxs = e.tipo === "acessorio" ? [e.conexao] : conexoesNaSaida(e), exsCx = cxs.extra || [], loc = 0, okL = true;
              /* M2 (frente 1c, revisão adversarial): a peça do PONTO DE ÁGUA (joelho 90° com bucha, luva com bucha — js/biminst.js pontoAguaDe → ligacao.pontoAgua) está no FIM da última aresta, e
                 conexoesNaSaida só olha a conexão no INÍCIO de cada aresta: a perda do joelho do ponto nunca entrava na pressão. Agora a aresta que termina num ponto com a peça soma a perda dela
                 (joelho = Leq do joelho 90° do DN do sub-ramal; luva = sem valor tabelado, premissa declarada). Só PVC soldável (Leq) e o material com K próprio do joelho com bucha na tabela (PPR: joelho com inserto metálico, Amanco); CPVC não tem linha. */
              var paF = e.tipo === "tubo" && G.nos[e.para] && G.nos[e.para].aparelho ? G.nos[e.para].aparelho.pontoAgua : null;
              if (paF && (paF.material === "pvc_soldavel" || (paF.tipo === "joelho_bucha" && NR().consulta("af.perda.localizada.k", { material: paF.material, conexao: paF.tipo }, "k").ok)) && (paF.tipo === "joelho_bucha" || paF.tipo === "luva_bucha") && !(filhos[e.para] && filhos[e.para].length)) cxs = cxs.concat([paF.tipo]);
              cxs.forEach(function (cx, ixCx) {
                /* PRESSURIZAÇÃO: registro de ESFERA de PVC sem linha na tabela principal → a linha "registro de gaveta ou esfera
                   aberto" da tabela do fabricante (js/hidpressao.js, fonte com página); a tabela principal, quando tem, ganha */
                var ex = e.tipo === "acessorio" && HPZ && HPZ.leqExtra && !NR().consulta("af.perda.localizada.leq", { material: e.material, conexao: cx, dn: r.dn }, "leq_m").ok ? HPZ.leqExtra(cx, e.material, r.dn) : null;
                /* N23 (revisão, 26/10/2026): a tabela do fabricante do registro de esfera só vai até DN 60 (2"); o DN 75 do tronco do barrilete
                   de 2 banheiros ficava SEM perda localizada → trecho "pendente" → o ponto inteiro virava "pendente" (sem reprovar) e o laço não
                   subia o DN (bchu a 6,4 kPa). Fora dessa tabela, o registro de esfera aberto usa a linha do registro de GAVETA da tabela principal
                   (Tigre, por DE) — a própria fonte do fabricante diz seguir a tabela do Tigre para PVC e os valores coincidem de 3/4" a 1 1/2" —
                   como PREMISSA visível. */
                var cxL = cx;
                if (!ex && e.tipo === "acessorio" && cx === "registro_esfera" && !NR().consulta("af.perda.localizada.leq", { material: e.material, conexao: cx, dn: r.dn }, "leq_m").ok
                    && NR().consulta("af.perda.localizada.leq", { material: e.material, conexao: "registro_gaveta", dn: r.dn }, "leq_m").ok) {
                  cxL = "registro_gaveta"; premissa("registro de esfera DN " + r.dn + ": comprimento equivalente", "Leq do registro de gaveta da tabela do Tigre adotado — a linha de registro de esfera do fabricante (Schneider/Franklin 2026-09, p. 88) só vai até DN 60");
                }
                var pl = ex ? { tipo: cx, leq_m: ex.leq_m, perda_m: ex.leq_m * dist.J, fonteFicha: ex.fonte } : perdaLocal(cxL, e.material, r.dn, dist.J, dist.v, uso, e.tipo === "acessorio" ? e.variante : null, exsCx[ixCx]);
                if (pl && cxL !== cx) pl.tipo = cx;
                if (pl) { r.conexoes.push(pl); loc += pl.perda_m; if (ex && ex.premissa) premissa(ex.premissa.item, ex.premissa.valor); } else okL = false;
              });
              if (!okL) r.pendH.push("perda localizada");
              r.hfLoc = loc; r.hf = r.hfDist + loc;
              if (r.conexoes.length) r.passosH.push("perdas localizadas: " + r.conexoes.map(function (c) { return c.tipo + (c.leq_m != null ? " (Leq " + f2(c.leq_m) + " m)" : " (K " + f2(c.k) + ")") + " = " + f3(c.perda_m) + " m"; }).join(" + ") + " = " + f3(loc) + " m");
            }
          }
          var pend = pendNo[nid] || r.pendH.length > 0;
          pendNo[e.para] = pend;
          Hn[e.para] = (Hn[nid] != null && r.hf != null) ? Hn[nid] - r.hf : null;
          r.Hmont = Hn[nid]; r.Hjus = Hn[e.para];
        });
      });
    }
    function pressaoKpa(nid) { return Hn[nid] == null ? null : H.mParaKpa(Hn[nid] - G.nos[nid].y, fluido.rho); }
    /* estática (verificação e VRP): nível MÁXIMO; null se não há dado */
    function pressaoEstKpa(nid) { return Hmax == null ? null : H.mParaKpa(Hmax + (gmax[nid] || 0) - G.nos[nid].y, fluido.rho); }
    /* carga sem escoamento com o nível MÍNIMO: só para saber se aumentar DN resolve a dinâmica */
    function cargaMinKpa(nid) { return H.mParaKpa(Hsrc + (gmax[nid] || 0) - G.nos[nid].y, fluido.rho); }
    /* pressão mínima do ponto com o DN ATUAL do sub-ramal: a maior entre a geral da norma e a da
       peça (tabela do fabricante por DN). registrar = grava pendência/uso no contexto (só na
       verificação final — no laço o DN ainda muda). */
    function pminPonto(pt, registrar) {
      if (!pt) return { v: null, fonte: null };
      var base = { v: pt.pminGeral == null ? null : pt.pminGeral, fonte: pt.fonteGeral || null };
      if (!pt.temPminPeca) return base;
      var pe = pai[pt.no], dnSub = pe && E[pe] ? E[pe].dn : null, f = { aparelho: pt.aparelho, dn: dnSub };
      /* ⚠ DE sem linha própria: vale a linha do MAIOR DE tabelado que não passa do atual (peça maior
         pede menos pressão — usar a menor é o lado seguro); abaixo de todas, a mais exigente. Nunca
         cair no limite geral só porque o laço aumentou o DN (seria aprovar por fuga da tabela). */
      var ls = NR().linhas("af.aparelhos.pressao_min", { aparelho: pt.aparelho }).filter(function (x) { return typeof x.pressao_min_mca === "number"; });
      if (!ls.length) { base.semLinhaPeca = "sem pressão de serviço numérica da peça: limite geral da norma"; return base; }
      var abaixo = ls.filter(function (x) { return num(x.dn, 0) <= num(dnSub, 0); }).sort(function (x, y) { return y.dn - x.dn; });
      var lin = abaixo.length ? abaixo[0] : ls.slice().sort(function (x, y) { return x.dn - y.dn; })[0];
      f = { aparelho: pt.aparelho, dn: lin.dn };
      var c = NR().consulta("af.aparelhos.pressao_min", f, "pressao_min_mca");
      if (registrar) ctx.consulta("af.aparelhos.pressao_min", f, "pressao_min_mca", "ponto " + pt.famInst);
      if (lin.dn !== dnSub) base.semLinhaPeca = "linha da peça para DE " + lin.dn + " (o sub-ramal é DE " + dnSub + "; a tabela não tem esse DE)";
      var kpa = H.mParaKpa(num(c.valor, 0), fluido.rho);
      return base.v != null && base.v >= kpa ? base : { v: kpa, fonte: c.fonte, peca: true, mca: num(c.valor, 0), dnSub: dnSub, dnLinha: lin.dn, semLinhaPeca: base.semLinhaPeca };
    }
    /* ⚠ NBR 5626:2020, 6.9.3: os 5 kPa "em qualquer ponto" NÃO valem no trecho VERTICAL de tomada d'água
       na saída do reservatório elevado até o barrilete — ali a pressão é o desnível até o nível d'água mais
       baixo menos a perda (só não pode ser negativa). Fecha a decisão 5 da F3 (antes: aviso sem fonte). */
    /* ⚠ N23 (24/10/2026): a TOMADA d'água da caixa com saída LATERAL — o toco na cota da saída (adaptador, registro de gaveta da
       6.5.12.4 a, o tê da ventilação do barrilete) até a DESCIDA vertical — é a mesma tomada: antes a cadeia só começava se o 1º trecho
       já descesse, e o toco (que toda saída lateral tem) reprovava por "5 kPa já na carga estática". Regras, todas para não isentar o
       barrilete: (1) segue só o ramo COM consumo a jusante (a ventilação do barrilete, sem aparelho, não interrompe a tomada); (2) o
       trecho deitado só conta ANTES da descida, na cota da saída e até TOMADA_TOCO_MAX somados; (3) sem descida nenhuma, o toco NÃO é
       tomada (o barrilete na cota da saída continua precisando dos 5 kPa); (4) o nó de baixo da descida, onde o barrilete começa, NÃO é
       tomada. Na tomada vale a pressão pelo desnível menos a perda, que só não pode ser negativa. */
    var tomada = {};
    (function () {
      if (rede) return;
      function comConsumo(nid) { return (filhos[nid] || []).filter(function (eid) { return acc[G.arestas[eid].para] && acc[G.arestas[eid].para].nPontos > 0; }); }
      /* N23 (26/10/2026): a caixa com 2ª SAÍDA (coluna exclusiva da válvula de descarga, js/hidbarrilete.js) tem DOIS ramos com consumo
         saindo da fonte — cada saída é a sua tomada (antes a cadeia parava na fonte e nenhuma das duas era isenta). Com uma saída, igual. */
      comConsumo(src).forEach(function (eid0) {
      var n0 = src, toco = 0, desceu = false, cand = [], guarda = 0, prox = eid0;
      while (guarda++ <= G.ordemA.length) {
        var fs = prox != null ? [prox] : comConsumo(n0); prox = null; if (fs.length !== 1) break;
        var e1 = G.arestas[fs[0]], dy = G.nos[e1.para].y - G.nos[e1.de].y;
        if (e1.tipo === "acessorio") { /* o registro na tomada: passa */ }
        else if (e1.vertical && dy < 0) desceu = true;
        else if (!desceu && !e1.vertical && Math.abs(G.nos[e1.para].y - nS.y) <= TOMADA_TOCO_DY && (toco += num(e1.comprimento, 0)) <= TOMADA_TOCO_MAX) { /* o toco da saída lateral */ }
        else break;
        cand.push({ no: n0, desceu: desceu });
        n0 = e1.para;
      }
      /* n0 = o 1º nó FORA da tomada (o início do barrilete): os de antes dele são tomada — desde que a cadeia tenha descido */
      if (desceu) cand.forEach(function (c) { if (c.no !== src) tomada[c.no] = 1; });
      });
    })();
    /* F5 (Casa 487, 27/10/2026): a FONTE IRMÃ (a outra caixa do barrilete comum) tem a tomada dela: o toco na cota da saída, o tê da ventilação e o
       COLETOR vertical até o barrilete — a mesma isenção da tomada da fonte principal, andando do nó da irmã para a raiz (o nó de baixo do coletor, onde
       ele chega ao barrilete, NÃO é tomada). Sem isto o toco da 2ª caixa reprovava "5 kPa já na carga estática". */
    (function () {
      if (rede) return;
      G.ordemN.forEach(function (id) {
        if (id === src) return;
        var a2 = G.nos[id].aparelho;
        if (!(a2 && CONECTOR_ALIMENTACAO[a2.famId] && CONECTOR_ALIMENTACAO[a2.famId][a2.cid] === "alimentacao" && fontesInterligadas(G, [src, id]))) return;
        var n = id, desceu = false, toco = 0, guarda = 0, cand = [];
        while (guarda++ < G.ordemA.length && pai[n] != null) {
          var e1 = G.arestas[pai[n]], par = e1.de, dy = G.nos[par].y - G.nos[n].y;
          cand.push(n);
          if (e1.tipo === "acessorio") { /* o registro do toco: passa */ }
          else if (e1.vertical && dy < 0) desceu = true;
          else if (!desceu && !e1.vertical && Math.abs(G.nos[par].y - G.nos[id].y) <= TOMADA_TOCO_DY && (toco += num(e1.comprimento, 0)) <= TOMADA_TOCO_MAX) { /* o toco da saída lateral */ }
          else break;
          n = par;
        }
        if (desceu) cand.forEach(function (q) { tomada[q] = 1; });
      });
    })();
    /* ⚠ SEM o nível d'água informado, o nível adotado é a própria cota da saída (o mais desfavorável): no toco DEITADO nessa cota a
       "pressão" sai menos a perda de entrada (alguns milímetros) — artefato da premissa (com o nível na saída a saída nem trabalha
       cheia), não sucção de verdade. Ali o "não negativa" da tomada não é julgado (premissa declarada) e o laço não engorda o toco
       à toa (já foi DN 110 no teste); com o nível INFORMADO, o toco é conferido como o resto da tomada. */
    var tocoNaSaida = {};
    if (alAviso) Object.keys(tomada).forEach(function (nid) { if (Math.abs(G.nos[nid].y - nS.y) <= TOMADA_TOCO_DY) tocoNaSaida[nid] = 1; });
    function pmRedeNo(nid) { return tocoNaSaida[nid] ? null : (tomada[nid] ? 0 : (pmRede.ok ? num(pmRede.valor, 0) : null)); }
    function deficit(nid) {   /* kPa que faltam no nó (0 = atende) */
      var p = pressaoKpa(nid); if (p == null) return 0;
      var lp = pontoDe[nid] ? pminPonto(pontoDe[nid], false).v : null;
      var lim = lp != null ? lp : pmRedeNo(nid);
      if (lim == null) return 0;
      var dp = lim - p;
      if (pmRede.ok && lp != null) dp = Math.max(dp, pmRedeNo(nid) - p);
      return dp > 0 ? dp : 0;
    }
    function caminho(nid) { var l = []; while (pai[nid]) { l.unshift(pai[nid]); nid = G.arestas[pai[nid]].de; } return l; }

    /* 8) laço: aumenta o DN no caminho do pior ponto até atender (ou acabar) */
    var limite = opc.maxIteracoes != null ? num(opc.maxIteracoes, 0) : Object.keys(E).reduce(function (s, eid) { return s + (E[eid].dnsPossiveis || []).length; }, 0);
    var iter = 0, semSaida = [], impossivel = {};
    function limiteNo(nid) {
      var lp = pontoDe[nid] ? pminPonto(pontoDe[nid], false).v : null, lr = pmRedeNo(nid);
      return lp == null ? lr : (lr == null ? lp : Math.max(lp, lr));
    }
    /* ⚠ nó em que nem SEM perda nenhuma a pressão atende (a carga estática já é
       menor que o mínimo): aumentar DN não resolve — só subir o nível d'água.
       Sem esta guarda o laço engordava o barrilete até o maior DN à toa
       (visto no primeiro teste: DN 110 num barrilete de 1,3 m colado na caixa). */
    ordem.forEach(function (nid) { var l = limiteNo(nid); if (nid !== src && l != null && cargaMinKpa(nid) < l) { impossivel[nid] = 1; semSaida.push({ no: nid, deficit: l - cargaMinKpa(nid), estatica: true }); } });
    /* --- NBR 5626:2020, 6.14.5: queda de pressão na ducha ao abrir outro ponto (usada no laço e na verificação) */
    function hfAresta(eid, q) {
      var r = E[eid];
      /* bomba no caminho da ducha: a queda de pressão ao abrir outro ponto segue a CURVA (mais vazão → menos altura) */
      if (r && r.e.tipo === "bomba") { var eq0 = r.e.equipamento || {}; if (eq0.papel !== "bomba" || r.e.de !== eq0.entrada) return 0; var g0 = HPZ ? HPZ.ganho(eq0.famId, q) : null; return g0 && g0.H != null ? -g0.H : null; }
      if (!r || r.di == null) return null;
      if (!(q > 0)) return 0;
      var e0 = r.e, ds = PD.distribuida(q, r.di, e0.tipo === "tubo" ? e0.comprimento : 0, e0.material, "ducha 6.14.5"); if (!ds) return null;
      var loc = arr(r.conexoes).reduce(function (s0, c) { return s0 + (c.leq_m != null ? c.leq_m * ds.J : (c.k != null ? H.perdaK(c.k, ds.v) : 0)); }, 0);
      return (e0.tipo === "tubo" ? ds.hf : 0) + loc;
    }
    function ehDucha(pt) { return pt.aparelho === "chuveiro" || pt.aparelho === "chuveiro_eletrico" || pt.aparelho === "ducha"; }
    function duchaQueda(pd, soPj) {   /* { p1, pior: { q (%), pj, p2 } } ou null; soPj = só o ponto pj (o limite otimista dele) */
      if (pd.vazao_ls == null) return null;
      var camD = caminho(pd.no);
      function pDucha(extra) {
        var Ht = Hsrc;
        for (var i = 0; i < camD.length; i++) {
          var eid = camD[i], q = pd.vazao_ls;
          if (extra && extra.cam.indexOf(eid) >= 0) q += extra.q;
          var h = hfAresta(eid, q); if (h == null) return null; Ht -= h;
        }
        return H.mParaKpa(Ht - pd.cota, fluido.rho);
      }
      var p1 = pDucha(null); if (p1 == null || !(p1 > 0)) return null;
      var pior = null;
      out.pontos.forEach(function (pj) {
        if (pj === pd || pj.vazao_ls == null || (soPj && pj !== soPj)) return;
        var cj = caminho(pj.no), p2 = pDucha({ cam: cj, q: pj.vazao_ls }); if (p2 == null) return;
        var qd = (p1 - p2) / p1 * 100; if (!pior || qd > pior.q) pior = { q: qd, pj: pj, p2: p2, comum: camD.filter(function (eid) { return cj.indexOf(eid) >= 0; }) };   // hid:ok 100 = porcentagem
      });
      return pior ? { p1: p1, pior: pior } : null;
    }
    var limDucha = SIS === "agua_fria" ? NR().consulta("af.ducha.queda_max_pct", null, "valor") : { ok: false }, duchaSemSaida = {};
    function duchaViolada() {
      if (!limDucha.ok) return null;
      var lim = num(limDucha.valor, 0), pior = null;
      out.pontos.forEach(function (pd) { if (!ehDucha(pd) || duchaSemSaida[pd.no] || pendNo[pd.no]) return; var dq = duchaQueda(pd); if (dq && dq.pior.q > lim && (!pior || dq.pior.q > pior.dq.pior.q)) pior = { pd: pd, dq: dq }; });
      return pior;
    }
    avaliar();
    while (iter < limite) {
      var pior = null, dpPior = 0;
      ordem.forEach(function (nid) { if (nid === src || pendNo[nid] || impossivel[nid]) return; var dp = deficit(nid); if (dp > dpPior) { dpPior = dp; pior = nid; } });
      if (!pior) {
        /* pressão atendida em todo ponto: a regra da ducha (6.14.5) também aumenta DN — no trecho COMUM à
           ducha e ao ponto que mais derruba, o de maior perda (é o que o projetista faria) */
        var dv = duchaViolada(); if (!dv) break;
        var candD = dv.dq.pior.comum.filter(function (eid) { var r = E[eid]; return r && r.e.tipo === "tubo" && !r.travado && r.dnsPossiveis && r.dnsPossiveis.indexOf(r.dn) < r.dnsPossiveis.length - 1; });
        /* teto do travado (como na pressão) e limite OTIMISTA: com todos os candidatos no maior DN, a
           regra passaria? Se não, aumentar DN é desperdício (o mesmo cuidado do barrilete de DN 110) */
        var camDv = caminho(dv.pd.no);
        candD = candD.filter(function (eid) { var k3 = camDv.indexOf(eid), teto = Infinity; for (var j = 0; j < k3; j++) if (E[camDv[j]].travado && opc.dnNaoAumentaAJusante !== false) teto = Math.min(teto, E[camDv[j]].dn); return E[eid].dnsPossiveis[E[eid].dnsPossiveis.indexOf(E[eid].dn) + 1] <= teto; });
        var guardaDi = {};
        candD.forEach(function (eid) { var r = E[eid], dMax = r.dnsPossiveis[r.dnsPossiveis.length - 1]; guardaDi[eid] = r.di; r.di = di(r.e.material, dMax, "ducha 6.14.5") || r.di; });
        /* ⚠ N23 (24/10/2026): o limite otimista é do PAR (ducha, o ponto que mais derruba) — só o trecho comum aos dois muda o quanto
           ESSE ponto derruba. Antes ele perguntava pelo pior de TODOS os pontos com o comum no máximo: o pior passava a ser outro (o
           lavatório do mesmo banheiro, com o ramal fora do comum) e a regra era abandonada ("sem saída"); a queda informada ficava
           com o DN que o laço da pressão tivesse deixado — 15,36 % sem o nível d'água e 28,86 % com ele, na casa do livro. Agora o
           par impossível sai; o possível aumenta o DN do comum, e o próximo par (o lavatório) é conferido na volta seguinte. */
        var otim = duchaQueda(dv.pd, dv.dq.pior.pj);
        candD.forEach(function (eid) { E[eid].di = guardaDi[eid]; });
        if (!candD.length || !otim || otim.pior.q > num(limDucha.valor, 0)) { duchaSemSaida[dv.pd.no] = 1; continue; }
        candD.sort(function (x, y) { return (hfAresta(y, E[y].q) || 0) - (hfAresta(x, E[x].q) || 0); });
        var rd = E[candD[0]]; rd.dn = rd.dnsPossiveis[rd.dnsPossiveis.indexOf(rd.dn) + 1]; rd.aumentado = (rd.aumentado || 0) + 1;
        propagarMontante(); avaliar(); iter++;
        continue;
      }
      var cam = caminho(pior), temTravado = false;
      var cand = cam.filter(function (eid) {
        var r = E[eid]; if (r.travado) temTravado = true;
        if (r.e.tipo !== "tubo" || r.travado || !r.dnsPossiveis) return false;
        var i0 = r.dnsPossiveis.indexOf(r.dn);
        return i0 < r.dnsPossiveis.length - 1;
      }).filter(function (eid) {
        /* ⚠ abaixo de um trecho TRAVADO o DN não passa o dele (senão o motor
           punha DN 110 pendurado num DN 20 que o usuário travou) */
        var r = E[eid], k3 = cam.indexOf(eid), teto = Infinity;
        for (var j = 0; j < k3; j++) if (E[cam[j]].travado && opc.dnNaoAumentaAJusante !== false) teto = Math.min(teto, E[cam[j]].dn);
        return r.dnsPossiveis[r.dnsPossiveis.indexOf(r.dn) + 1] <= teto;
      });
      /* limite otimista: só as perdas que NÃO podem mudar (travados, acessórios,
         trechos já no teto) — se nem assim atende, aumentar DN é desperdício */
      var fixa = cam.reduce(function (sm, eid) { return sm + (cand.indexOf(eid) < 0 ? (E[eid].hf || 0) : 0); }, 0);
      if (!cand.length || H.mParaKpa(Hsrc - fixa - G.nos[pior].y, fluido.rho) < limiteNo(pior)) {
        semSaida.push({ no: pior, deficit: dpPior, travado: temTravado }); impossivel[pior] = 1; continue;
      }
      cand.sort(function (x, y) { return (E[y].hf || 0) - (E[x].hf || 0); });
      var rr = E[cand[0]]; rr.dn = rr.dnsPossiveis[rr.dnsPossiveis.indexOf(rr.dn) + 1];
      rr.aumentado = (rr.aumentado || 0) + 1;
      propagarMontante();
      avaliar(); iter++;
    }
    out.iteracoes = iter;

    /* 9) resultado por trecho, verificações */
    function verif(alvo, nome, valor, limite, unidade, eta, ok, passos, fonte, status) {
      var v = { id: "af-v" + out.verificacoes.length, sistema: SIS, alvo: alvo, nome: nome, valor: valor, limite: limite, unidade: unidade, eta: eta, ok: ok,
                status: status || (ok === null ? "pendente" : (ok ? "ok" : "reprovado")), passos: passos || [], fonte: fonte || null };
      out.verificacoes.push(v); return v;
    }
    out.bombas = [];
    G.ordemA.forEach(function (eid) {
      var r = E[eid]; if (!r) return;
      var e = r.e, pend = r.pend.concat(r.pendH);
      if (e.tipo === "bomba") {
        var eqb = e.equipamento || {};
        if (eqb.papel === "bomba") {
          var rev = e.de !== eqb.entrada, okB = !pend.length;
          out.bombas.push({ famInst: eqb.famInst, famId: eqb.famId, aresta: eid, Q_m3h: r.Qbomba != null ? r.Qbomba : (r.q != null ? r.q * 3600 / LS : null), H_m: r.ganho != null ? r.ganho : null, reserva: rev,
                            pressaoSucao_kpa: pressaoKpa(e.de), pressaoRecalque_kpa: pressaoKpa(e.para), status: rev ? "reserva" : (okB ? "ok" : "pendente"), passos: r.passosQ.concat(r.passosH || []), pendencias: pend });
          if (!rev) verif(eqb.famInst, "pressurizador: ponto de operação na rede", r.ganho != null ? r.ganho : null, null, "m", null, okB ? true : null, r.passosQ.concat(r.passosH || []), null, okB ? "ok" : "pendente");
          if (!rev && pend.length) aviso(out.avisos, SIS, "erro", "pressurizador " + eqb.famInst + ": " + pend.join("; "), [eqb.famInst], { texto: "trocar o modelo por um de vazão maior (Corrigir do aviso de pressão) ou dividir a rede" });
        } else out.trechos.push({ id: eqb.famInst, aresta: eid, tipo: "uniao", conexao: "uniao", de: e.de, para: e.para, pDe: e.de === e.a ? e.pa : e.pb, pPara: e.de === e.a ? e.pb : e.pa,
                                  vazao_ls: r.q, perda_m: r.hf, conexoes: r.conexoes || [], pressaoMontante_kpa: pressaoKpa(e.de), pressaoJusante_kpa: pressaoKpa(e.para), status: pend.length ? "pendente" : "ok", passos: r.passosQ.concat(r.passosH || []), pendencias: pend });
        return;
      }
      var t = { id: e.trecho != null ? e.trecho : e.acessorio, aresta: eid, parte: e.parte, tipo: e.tipo, conexao: e.conexao || null, de: e.de, para: e.para,
                pDe: e.de === e.a ? e.pa : e.pb, pPara: e.de === e.a ? e.pb : e.pa,
                material: e.material, dnModelo: e.dn, dn: r.dn, di_mm: r.di != null ? r.di * MM : null, travado: r.travado,
                comprimento_m: e.comprimento, desnivel_m: e.desnivel, somaPesos: r.somaPesos, vazao_ls: r.q, velocidade_ms: r.v != null ? r.v : null,
                J_m_m: r.J != null ? r.J : null, perdaDistribuida_m: r.hfDist != null ? r.hfDist : null, conexoes: r.conexoes || [], perdaLocalizada_m: r.hfLoc != null ? r.hfLoc : null,
                perda_m: r.hf, pressaoMontante_kpa: pressaoKpa(e.de), pressaoJusante_kpa: pressaoKpa(e.para),
                status: pend.length ? "pendente" : "ok", passos: r.passosQ.concat(r.passosH || []), pendencias: pend };
      if (r.aumentado) t.passos.push("DN aumentado " + r.aumentado + " vez(es) para atender a pressão a jusante");
      if (e.tipo === "tubo" && r.v != null) {
        var VL = vLimite(e.material, r.dn, "trecho " + t.id);
        if (VL.v == null) verif(t.id, "velocidade", r.v, null, "m/s", null, null, ["pendente: " + vmax.motivo], null);
        else {
          var vv = verif(t.id, "velocidade", r.v, VL.v, "m/s", r.v / VL.v, r.v <= VL.v, ["v = " + f3(r.v) + " m/s ≤ " + f2(VL.v) + " m/s — critério do projetista contra ruído (o menor entre 3 m/s, nota 6.8.3 da NBR 5626:2020, e o limite por DN da prática de 1998); a 2020 não fixa limite de velocidade"], VL.fonte);
          if (!vv.ok) { t.status = "reprovado"; aviso(out.avisos, SIS, "erro", "trecho " + t.id + ": velocidade " + f2(r.v) + " m/s acima de " + f2(VL.v) + " m/s" + (r.travado ? " (trecho travado)" : " mesmo no maior DN com diâmetro interno tabelado"), [t.id], { texto: r.travado ? "destravar o trecho para o motor aumentar o DN" : "dividir a vazão (outra coluna/ramal) ou usar material com DN maior" }); }
        }
      }
      if (e.tipo === "acessorio" && r.dn != null && r.dn !== e.dn) aviso(out.avisos, SIS, "aviso", (e.conexao || "acessório") + " " + e.acessorio + " é DN " + e.dn + " e o tubo ficou DN " + r.dn + ": troque o acessório", [e.acessorio], { texto: "trocar o acessório para DN " + r.dn });
      out.trechos.push(t);
    });
    /* pontos de consumo */
    var critico = null;
    out.pontos.forEach(function (pt) {
      pt.pressaoDinamica_kpa = pressaoKpa(pt.no); pt.pressaoEstatica_kpa = pressaoEstKpa(pt.no);
      var pm = pminPonto(pt, true);
      pt.pressaoMinima_kpa = pm.v; pt.fontePmin = pm.fonte;
      if (pm.peca) pt.pminPeca = { mca: pm.mca, dnSubRamal: pm.dnSub };
      if (pendNo[pt.no] || pt.pressaoDinamica_kpa == null) { pt.status = "pendente"; verif(pt.famInst, "pressão dinâmica no ponto", null, pt.pressaoMinima_kpa, "kPa", null, null, ["pendente: perda de carga a montante não calculada"], pt.fontePmin); return; }
      if (pt.pressaoMinima_kpa == null) { pt.status = "pendente"; verif(pt.famInst, "pressão dinâmica no ponto", pt.pressaoDinamica_kpa, null, "kPa", null, null, ["pendente: " + (pm.pendente ? "pressão de serviço da peça para o DN do sub-ramal — " + pm.pendente : "pressão mínima do aparelho sem tabela")], null); return; }
      var p = pt.pressaoDinamica_kpa, ok = p >= pt.pressaoMinima_kpa;
      pt.ok = ok; pt.eta = p > 0 ? pt.pressaoMinima_kpa / p : null; pt.status = ok ? "ok" : "reprovado";
      verif(pt.famInst, "pressão dinâmica no ponto (" + (pt.aparelho || "?") + ")", p, pt.pressaoMinima_kpa, "kPa", pt.eta, ok,
            ["p = (H − z)·ρg = (" + f3(Hn[pt.no]) + " − " + f3(pt.cota) + ") m × ρg = " + f2(p) + " kPa ≥ " + f2(pt.pressaoMinima_kpa) + " kPa" +
             (pm.peca ? " (pressão de serviço da peça com sub-ramal DE " + pm.dnSub + ": " + f2(pm.mca) + " mca, tabela do fabricante — maior que a geral da norma" + (pm.dnLinha !== pm.dnSub ? "; " + pm.semLinhaPeca : "") + ")" : " (mínima geral da norma" + (pm.semLinhaPeca ? "; " + pm.semLinhaPeca : "") + ")")], pt.fontePmin);
      var folga = p - pt.pressaoMinima_kpa;
      if (!critico || folga < critico.folga_kpa) critico = { no: pt.no, famInst: pt.famInst, aparelho: pt.aparelho, folga_kpa: folga, caminho: caminho(pt.no).map(function (eid) { return G.arestas[eid].trecho || G.arestas[eid].acessorio; }) };
    });
    out.pontoCritico = critico;
    var golpesKpa = [];   /* sobrepressões de golpe calculadas (6.9.7) → pressão de serviço do tubo (NBR 5648) */
    if (SIS === "agua_fria") regras2020();
    /* ponto sem registro no sub-ramal (revisão F7 M3): a perda do registro de pressão/gaveta do
       ponto (a maior da linha) não entra se ele não estiver modelado — avisa, com a correção */
    out.pontos.forEach(function (pt) {
      var nid = pt.no, achou = false, guarda = 0;
      while (pai[nid] && guarda++ <= G.ordemA.length) {
        var e0 = G.arestas[pai[nid]]; if (e0.tipo === "acessorio") { achou = true; break; }
        nid = e0.de; if (nid === src || filhos[nid].length > 1) break;
      }
      if (!achou) aviso(out.avisos, SIS, "aviso", "ponto " + pt.famInst + " (" + (pt.aparelho || "?") + ") sem registro modelado no sub-ramal: a perda localizada do registro não entra na pressão calculada", [pt.famInst],
                        { texto: "inserir o registro (acessório) no sub-ramal do ponto " + pt.famInst });
    });
    /* rede: o nó de menor pressão dinâmica (inclusive pressão negativa, que é física: entra ar) */
    var minNo = null, minP = null, maxEst = null, maxNo = null, minT = null, minTNo = null;
    ordem.forEach(function (nid) {
      if (nid === src) return;
      if (!pendNo[nid] && !tomada[nid]) { var p = pressaoKpa(nid); if (p != null && (minP == null || p < minP)) { minP = p; minNo = nid; } }
      if (!pendNo[nid] && tomada[nid] && tocoNaSaida[nid]) { var pS0 = pressaoKpa(nid); if (pS0 != null && pS0 < 0) premissa("toco da saída do reservatório (tomada d'água)", (al.nivelMinimoNaSaida ? "nível d'água mínimo na cota da saída: no toco deitado nessa cota a pressão é só a perda de entrada (" + f2(pS0) + " kPa) — não julgada neste trecho (tomada d'água; NBR 5626:2020, 6.9.3)" : "nível d'água mínimo não informado: no toco deitado na cota da saída a pressão calculada é só a perda de entrada (" + f2(pS0) + " kPa) — não julgada; informe o nível d'água mínimo para conferir a tomada (NBR 5626:2020, 6.9.3)")); }
      else if (!pendNo[nid] && tomada[nid]) { var pt0 = pressaoKpa(nid); if (pt0 != null && (minT == null || pt0 < minT)) { minT = pt0; minTNo = nid; } }
      var pe = pressaoEstKpa(nid); if (pe != null && (maxEst == null || pe > maxEst)) { maxEst = pe; maxNo = nid; }
    });
    function elemDoNo(nid) { var pe = pai[nid]; return pe ? [G.arestas[pe].trecho || G.arestas[pe].acessorio] : []; }
    if (minNo != null) {
      if (pmRede.ok) verif(elemDoNo(minNo)[0] || minNo, "pressão dinâmica mínima na rede", minP, num(pmRede.valor, 0), "kPa", minP > 0 ? num(pmRede.valor, 0) / minP : null, minP >= num(pmRede.valor, 0), ["menor pressão dinâmica da rede: " + f2(minP) + " kPa (nó " + minNo + ")"], pmRede.fonte);
      else verif(elemDoNo(minNo)[0] || minNo, "pressão dinâmica mínima na rede", minP, null, "kPa", null, null, ["pendente: " + pmRede.motivo], null);
      if (minP < 0) aviso(out.avisos, SIS, "erro", "pressão NEGATIVA (" + f2(minP) + " kPa) na rede de " + NOME + ": o tubo trabalha em sucção e entra ar", elemDoNo(minNo), { texto: "elevar o reservatório em " + f2(H.kpaParaM(-minP, fluido.rho)) + " m ou rebaixar o trecho" });
    }
    if (minTNo != null) {
      verif(elemDoNo(minTNo)[0] || minTNo, "pressão na tomada vertical do reservatório (6.9.3)", minT, 0, "kPa", null, minT >= 0,
            ["trecho vertical de tomada na saída do reservatório elevado até o barrilete: a pressão é o desnível até o nível d'água mais baixo menos a perda = " + f2(minT) + " kPa (sem o mínimo de 5 kPa; NBR 5626:2020, 6.9.3)"], pmRede.ok ? pmRede.fonte : null);
      if (minT < 0) aviso(out.avisos, SIS, "erro", "pressão negativa na tomada vertical do reservatório (" + f2(minT) + " kPa)", elemDoNo(minTNo), { texto: "aumentar o DN da tomada ou elevar o nível d'água mínimo" });
    }
    if (Hmax == null && ordem.length > 1) {
      ctx.pendencia("entrada.alimentacao.nivelAguaMax", "nível d'água MÁXIMO do reservatório (extravasor) não informado e sem altura na família: a pressão estática máxima não foi verificada", NOME + " — estática");
      verif(elemDoNo(ordem[ordem.length - 1])[0] || SIS, "pressão estática máxima", null, pmEst.ok ? num(pmEst.valor, 0) : null, "kPa", null, null, ["pendente: nível d'água máximo não informado (nunca se usa o mínimo para a estática)"], pmEst.ok ? pmEst.fonte : null);
    }
    if (maxNo != null) {
      if (pmEst.ok) {
        var lim = num(pmEst.valor, 0), okE = maxEst <= lim;
        verif(elemDoNo(maxNo)[0] || maxNo, "pressão estática máxima", maxEst, lim, "kPa", maxEst / lim, okE, ["maior pressão estática: " + f2(maxEst) + " kPa (nó " + maxNo + ", cota " + f2(G.nos[maxNo].y) + " m; " + origemMax + ")"], pmEst.fonte);
        if (!okE) aviso(out.avisos, SIS, "erro", "pressão estática de " + f2(maxEst) + " kPa passa do limite de " + f2(lim) + " kPa: precisa de válvula redutora de pressão", elemDoNo(maxNo), { texto: "instalar VRP no ramal antes da cota " + f2(Hmax - H.kpaParaM(lim, fluido.rho)) + " m (abaixo dela a estática passa do limite)" });
      } else verif(elemDoNo(maxNo)[0] || maxNo, "pressão estática máxima", maxEst, null, "kPa", null, null, ["pendente: " + pmEst.motivo], null);
    }
    semSaida.forEach(function (ss) {
      var pn = pontoDe[ss.no], quem = pn ? pn.famInst + " (" + pn.aparelho + ")" : "nó " + ss.no + " (cota " + f2(G.nos[ss.no].y) + " m)";
      aviso(out.avisos, SIS, "erro", "pressão insuficiente em " + quem + ": faltam " + f2(ss.deficit) + " kPa " + (ss.estatica ? "já na carga estática — nenhum DN resolve" : (ss.travado ? "e os trechos travados não deixam aumentar o DN o bastante" : "mesmo com os maiores DN possíveis")),
            pn ? [pn.famInst] : elemDoNo(ss.no), { texto: (ss.travado ? "destravar os trechos do caminho (o DN travado limita), ou " : "") + "elevar o nível d'água mínimo em " + f2(H.kpaParaM(ss.deficit, fluido.rho)) + " m, ou pressurizar o ramal" });
    });
    G.ordemN.forEach(function (nid) { if (visto[nid] && filhos[nid] && filhos[nid].length > 2) aviso(out.avisos, SIS, "aviso", "nó com " + (filhos[nid].length + 1) + " trechos (cruzeta): perda localizada assumida como saída lateral de tê", elemDoNo(nid), { texto: "desdobrar em dois tês" }); });

    /* ================= NBR 5626:2020 — regras novas (decisões do RT, 17/10/2026; CONTRATO §1.2) */
    function regras2020() {
      function comp(nid) { return caminho(nid).reduce(function (s, eid) { return s + G.arestas[eid].comprimento; }, 0); }
      function subRamal(pt) { var pe = pai[pt.no]; return pe && E[pe] ? E[pe] : null; }
      /* --- 6.14.3: DN do ponto do fabricante maior que o sub-ramal → RECOMENDAÇÃO (não reprova) */
      var conDn = {}; arr(R.conectores).forEach(function (k) { conDn[k.id] = num(k.dn, null); });
      out.pontos.forEach(function (pt) {
        var sr = subRamal(pt), dc = conDn[pt.conector];
        if (sr && sr.dn != null && dc != null && dc > sr.dn) aviso(out.avisos, SIS, "aviso", "recomendação do fabricante: o ponto " + pt.famInst + " tem conexão DN " + dc + " e o sub-ramal ficou DN " + sr.dn + " (a NBR 5626:2020, 6.14.3, não fixa DN mínimo de sub-ramal)", [pt.famInst],
                                                       { texto: "usar DN " + dc + " no sub-ramal do ponto " + pt.famInst, ops: sr.e.trecho != null ? [{ op: "instAlterar", id: sr.e.trecho, dn: dc }] : [] });
      });
      /* --- 6.9.7: sobrepressão de golpe ≤ limite no fechamento da válvula de descarga (Joukowsky/Michaud) */
      var limG = NR().consulta("af.golpe.sobrepressao_max", null, "valor"), golpeOpc = opc.golpe || {};
      out.pontos.filter(function (pt) { return /_valvula$/.test(pt.aparelho || ""); }).forEach(function (pt) {
        var sr = subRamal(pt), nomeV = "sobrepressão de golpe no fechamento (" + pt.aparelho + ")", faltas = [];
        if (!limG.ok) { ctx.consulta("af.golpe.sobrepressao_max", null, "valor", "golpe " + pt.famInst); verif(pt.famInst, nomeV, null, null, "kPa", null, null, ["pendente: " + limG.motivo], null); return; }
        var lim = num(ctx.consulta("af.golpe.sobrepressao_max", null, "valor", "golpe " + pt.famInst).valor, 0);
        var tc = num((golpeOpc[pt.aparelho] || {}).tempoFechamento_s, null);
        if (tc == null) faltas.push("tempo de fechamento da válvula (catálogo do fabricante: opcoes.golpe." + pt.aparelho + ".tempoFechamento_s)");
        var mat = sr ? sr.e.material : null, Ec = mat ? NR().consulta("ind.material.elasticidade", { material: mat }, "E_GPa") : { ok: false };
        if (!Ec.ok) faltas.push("módulo de elasticidade de " + (mat || "?") + " (ind.material.elasticidade)");
        if (!sr || sr.di == null || sr.v == null) faltas.push("velocidade/diâmetro do sub-ramal");
        if (faltas.length) {
          ctx.pendencia("af.golpe[" + pt.famInst + "]", "falta " + faltas.join("; "), "golpe de aríete " + pt.famInst);
          verif(pt.famInst, nomeV, null, lim, "kPa", null, null, ["pendente: falta " + faltas.join("; ")], limG.fonte);
          return;
        }
        ctx.consulta("ind.material.elasticidade", { material: mat }, "E_GPa", "golpe " + pt.famInst);
        var Epa = num(Ec.valor, 0) * GPA, e = (sr.dn / MM - sr.di) / 2, a = H.celeridade(H.moduloAgua(), fluido.rho, sr.di, Epa, e), L = comp(pt.no), gp = H.golpe(fluido.rho, a, sr.v, L, tc), dp = gp.dp_Pa / PA_KPA, okG = dp <= lim; golpesKpa.push(dp);
        verif(pt.famInst, nomeV, dp, lim, "kPa", dp / lim, okG, ["a = √((K/ρ)/(1 + K·D/(E·e))) = " + f2(a) + " m/s; L = " + f2(L) + " m; tc = " + tc + " s " + (gp.rapido ? "≤" : ">") + " 2L/a = " + f3(gp.tCritico) + " s",
                                                               (gp.rapido ? "Joukowsky: Δp = ρ·a·v" : "Michaud: Δp = 2·ρ·L·v/tc") + " = " + f2(dp) + " kPa ≤ " + f2(lim) + " kPa (NBR 5626:2020, 6.9.7)"], limG.fonte);
        if (!okG) aviso(out.avisos, SIS, "erro", "golpe de aríete no fechamento da válvula de " + pt.famInst + ": " + f2(dp) + " kPa > " + f2(lim) + " kPa", [pt.famInst], { texto: "válvula de fechamento mais lento, DN maior no sub-ramal (v menor) ou dispositivo antigolpe" });
      });
      /* --- 6.14.5: com a ducha na vazão de projeto, abrir outro ponto não reduz a pressão nela > X % */
      out.pontos.filter(ehDucha).forEach(function (pd) {
        if (pd.vazao_ls == null || pd.status === "pendente") return;
        if (!limDucha.ok) { ctx.consulta("af.ducha.queda_max_pct", null, "valor", "ducha " + pd.famInst); verif(pd.famInst, "queda de pressão na ducha ao abrir outro ponto (6.14.5)", null, null, "%", null, null, ["pendente: " + limDucha.motivo], null); return; }
        var limD = num(ctx.consulta("af.ducha.queda_max_pct", null, "valor", "ducha " + pd.famInst).valor, 0), dq = duchaQueda(pd);
        if (!dq) return;
        var pior = dq.pior, okD = pior.q <= limD;
        verif(pd.famInst, "queda de pressão na ducha ao abrir outro ponto (6.14.5)", pior.q, limD, "%", pior.q / limD, okD,
              ["ducha " + pd.famInst + " sozinha na vazão de projeto: " + f2(dq.p1) + " kPa; com " + pior.pj.famInst + " aberto (o que mais derruba): " + f2(pior.p2) + " kPa → queda " + f2(pior.q) + " % ≤ " + f2(limD) + " % (NBR 5626:2020, 6.14.5)"], limDucha.fonte);
        if (!okD) aviso(out.avisos, SIS, "erro", "ducha " + pd.famInst + ": abrir " + pior.pj.famInst + " derruba a pressão em " + f2(pior.q) + " % (máximo " + f2(limD) + " %)", [pd.famInst, pior.pj.famInst],
                        { texto: "aumentar o DN do trecho comum (" + pior.comum.map(function (eid) { return E[eid] && E[eid].e.trecho; }).filter(function (v, i, a0) { return v != null && a0.indexOf(v) === i; }).join(", ") + ") ou dar à ducha um ramal próprio" });
      });
      /* --- 6.5.12.4: registros de setorização (barrilete e coluna) */
      if (!rede) {
        var n1 = src, temReg = false, g1 = 0;
        while (filhos[n1] && filhos[n1].length === 1 && g1++ <= G.ordemA.length) { var e2 = G.arestas[filhos[n1][0]]; if (e2.tipo === "acessorio") temReg = true; n1 = e2.para; }
        if (!temReg && filhos[src] && filhos[src].length) aviso(out.avisos, SIS, "aviso", "sem registro de setorização entre o reservatório e o barrilete/1ª derivação (NBR 5626:2020, 6.5.12.4)", [G.arestas[filhos[src][0]].trecho].filter(Boolean),
                                                                { texto: "inserir registro de gaveta no trecho reservatório → barrilete" });
        ordem.forEach(function (nid) {
          if (!filhos[nid] || filhos[nid].length < 2) return;
          filhos[nid].forEach(function (eid) {
            var e3 = G.arestas[eid]; if (!(e3.vertical && G.nos[e3.para].y < G.nos[e3.de].y)) return;   /* coluna que desce de uma derivação */
            var n2 = nid, achouR = false, g2 = 0, eAt = e3;
            while (eAt && g2++ <= G.ordemA.length) { if (eAt.tipo === "acessorio") { achouR = true; break; } n2 = eAt.para; if (!filhos[n2] || filhos[n2].length !== 1) break; eAt = G.arestas[filhos[n2][0]]; }
            if (!achouR) aviso(out.avisos, SIS, "aviso", "coluna " + (e3.trecho || e3.acessorio) + " sem registro a montante do 1º ramal (NBR 5626:2020, 6.5.12.4)", [e3.trecho].filter(Boolean),
                               { texto: "inserir registro de gaveta no topo da coluna " + (e3.trecho || e3.acessorio) });
          });
        });
      }
      /* --- 6.5.12.8: ducha higiênica / torneira de gatilho com válvula de retenção */
      out.pontos.forEach(function (pt) {
        var f = familiaHid(pt.famId), eDucha = pt.aparelho === "ducha_higienica" || (f && f.aparelhoPrograma === "ducha_higienica");
        if (!eDucha) return;
        var nid = pt.no, temRet = false, g3 = 0;
        while (pai[nid] && g3++ <= G.ordemA.length) { var e4 = G.arestas[pai[nid]]; if (e4.tipo === "acessorio" && e4.conexao === "valvula_retencao") { temRet = true; break; } nid = e4.de; if (nid === src || filhos[nid].length > 1) break; }
        if (!temRet) aviso(out.avisos, SIS, "aviso", "ducha higiênica " + pt.famInst + " sem válvula de retenção no aparelho ou no ponto (NBR 5626:2020, 6.5.12.8)", [pt.famInst], { texto: "inserir válvula de retenção no sub-ramal de " + pt.famInst });
      });
    }

    /* ================= NBR 5648:2018 — pressão de serviço do PVC soldável (PN 750 kPa com 250 kPa de sobrepressão;
       PS = PN × ft(T)) e temperatura máxima (45 °C). Verificação: estática máxima + golpe ≤ PS (decisão do gerente 17/10/2026).
       Golpe: o maior calculado (6.9.7); sem golpe calculado, o limite da NBR 5626 (af.golpe.sobrepressao_max) como envoltória. */
    (function pressaoServicoTubo() {
      var tids = [], vis = {};
      Object.keys(E).forEach(function (eid) { var e = E[eid].e; if (e.tipo === "tubo" && e.material === "pvc_soldavel" && e.trecho != null && !vis[e.trecho]) { vis[e.trecho] = 1; tids.push(e.trecho); } });
      if (!tids.length) return;
      var usoPS = NOME + " — pressão de serviço do tubo (NBR 5648)", nomePS = "pressão de serviço do PVC soldável (NBR 5648)";
      if (!Tdeclarada) premissa("temperatura da água no PVC soldável (" + NOME + ")", f2(Tagua) + " °C (padrão do motor; informe opcoes.temperatura_C se for outra)");
      var ps = HP().pressaoServico("pvc_soldavel", Tagua, ctx, usoPS);
      if (!ps) return;
      if (ps.status === "reprovado") {
        verif(tids[0], "temperatura máxima do PVC soldável (NBR 5648, 4.1)", Tagua, ps.tMax, "°C", Tagua / ps.tMax, false, ps.passos, ps.fonte);
        aviso(out.avisos, SIS, "erro", "PVC soldável com água a " + f2(Tagua) + " °C (máximo " + f2(ps.tMax) + " °C, NBR 5648): trocar o material", tids,
              { texto: "usar CPVC, PPR ou cobre nos trechos " + tids.join(", "), ops: tids.map(function (t0) { return { op: "instAlterar", id: t0, material: "cpvc" }; }) });
        return;
      }
      if (ps.ok === null) { verif(tids[0], nomePS, null, null, "kPa", null, null, ps.passos, null); return; }
      if (maxEst == null) { verif(tids[0], nomePS, null, ps.ps_kpa, "kPa", null, null, ps.passos.concat(["pendente: a pressão estática máxima não foi calculada (nível d'água máximo)"]), ps.fonte); return; }
      var dg, origemG;
      if (golpesKpa.length) { dg = Math.max.apply(null, golpesKpa); origemG = "maior sobrepressão de golpe calculada (6.9.7)"; }
      else {
        var lg = ctx.consulta("af.golpe.sobrepressao_max", null, "valor", usoPS);
        if (!lg.ok) { verif(tids[0], nomePS, null, ps.ps_kpa, "kPa", null, null, ps.passos.concat(["pendente: sem golpe calculado e sem o limite da NBR 5626 (" + lg.motivo + ")"]), ps.fonte); return; }
        dg = num(lg.valor, 0); origemG = "sem golpe calculado: limite da NBR 5626 (6.9.7) como envoltória";
      }
      var pt = maxEst + dg, okPS = pt <= ps.ps_kpa;
      verif(elemDoNo(maxNo)[0] || tids[0], nomePS, pt, ps.ps_kpa, "kPa", pt / ps.ps_kpa, okPS,
            ps.passos.concat(["estática máxima " + f2(maxEst) + " kPa + golpe " + f2(dg) + " kPa (" + origemG + ") = " + f2(pt) + " kPa " + (okPS ? "≤" : ">") + " PS " + f2(ps.ps_kpa) + " kPa"]), ps.fonte);
      if (!okPS) aviso(out.avisos, SIS, "erro", "PVC soldável acima da pressão de serviço: " + f2(pt) + " kPa > " + f2(ps.ps_kpa) + " kPa (NBR 5648)", elemDoNo(maxNo),
                       { texto: "válvula redutora de pressão, dispositivo antigolpe ou tubo de classe de pressão maior (PPR/CPVC/cobre)" });
    })();

    /* 10) ops: o DN calculado vai ao modelo (o maior das partes do trecho) */
    Object.keys(G.partes).forEach(function (tid) {
      var ps = G.partes[tid].map(function (eid) { return E[eid]; }).filter(Boolean);
      if (!ps.length || ps.some(function (r) { return r.dn == null || r.pend.length || (r.pendH && r.pendH.length); }) || ps[0].travado) return;   /* op só de trecho CALCULADO (revisão F7 B8) */
      var dnF = Math.max.apply(null, ps.map(function (r) { return r.dn; })), dn0 = ps[0].e.dn;
      if (ps.length > 1 && ps.some(function (r) { return r.dn !== dnF; })) aviso(out.avisos, SIS, "info", "trecho " + tid + " é atravessado por derivação: fica com o maior DN das partes (" + dnF + ")", [tid], null);
      if (dnF !== dn0) { out.ops.push({ op: "instAlterar", id: tid, dn: dnF }); out.opsDesfazer.push({ op: "instAlterar", id: tid, dn: dn0 }); }
    });

    /* 10b) o DN calculado também vai ao ACESSÓRIO do tubo (registro de pressão/gaveta): a peça especificada tem de ser a que o cálculo usou (Casa 487, F9:
       cálculo com registro de 3/4" e lista com 1/2" = a reprovação escondida atrás do aviso "troque o acessório"). Só acessório CALCULADO (o tubo e a peça têm o mesmo DN). */
    Object.keys(E).forEach(function (eid) {
      var r = E[eid]; if (!r || !r.e || r.e.tipo !== "acessorio" || r.dn == null || r.pend.length || (r.pendH && r.pendH.length) || r.travado) return;
      if (r.dn !== r.e.dn) { out.ops.push({ op: "instAlterar", id: r.e.acessorio, dn: r.dn }); out.opsDesfazer.push({ op: "instAlterar", id: r.e.acessorio, dn: r.e.dn }); }
    });

    if (formula === "auto") out.formulaPerda = PD.formulasUsadas() || "auto";
    /* ids próprios do perfil (a água quente não repete "af-v0" da água fria no memorial) */
    if (perfil.prefixo) { out.avisos.forEach(function (a) { a.id = String(a.id).replace(/^af-/, perfil.prefixo + "-"); a.sistema = SIS; }); out.verificacoes.forEach(function (v) { v.id = String(v.id).replace(/^af-/, perfil.prefixo + "-"); }); }
    var sts = out.trechos.map(function (t) { return t.status; }).concat(out.pontos.map(function (p) { return p.status; })).concat(out.verificacoes.map(function (v) { return v.status; }));
    out.status = sts.indexOf("reprovado") >= 0 ? "reprovado" : (sts.indexOf("pendente") >= 0 ? "pendente" : "ok");
    if (out.avisos.some(function (a) { return a.gravidade === "erro"; }) && out.status === "ok") out.status = "reprovado";
    return out;
  }

  /* ================================================ ALIMENTADOR PREDIAL (NBR 5626:2020, 6.7.2)
   * A vazão do alimentador repõe o consumo diário em até 6 h (3 h na residência unifamiliar). Dimensiona o
   * MENOR DN do material que, com a pressão mínima da rede pública, chega ao reservatório com a pressão
   * mínima da rede (af.pressao.dinamica_minima_rede). Sem a pressão da rede pública: PENDENTE (decisão do RT).
   *   ent = entrada.alimentador = { pressao_kpa, material?, comprimento_m, desnivel_m (chegada − rede), conexoes[], dn? } */
  function alimentador(ent, consumoL, uso, ctx) {
    var H = HH(), B = BI(), fl = H.agua(H.T_PADRAO_C), out = { status: "pendente", vazao_ls: null, horas: null, dn: null, verificacoes: [], avisos: [], passos: [] };
    var nomeV = "alimentador predial: reposição do consumo diário (6.7.2)";
    function v(valor, limite, ok, passos, fonte) { out.verificacoes.push({ sistema: "agua_fria", alvo: "alimentador", nome: nomeV, valor: valor, limite: limite, unidade: "kPa", eta: valor && limite ? limite / valor : null, ok: ok, status: ok === null ? "pendente" : (ok ? "ok" : "reprovado"), passos: passos, fonte: fonte || null }); }
    var cH = ctx.consulta("af.alimentador.reposicao_h", { uso: uso || "" }, "horas_max", "alimentador predial");
    if (!cH.ok) { v(null, null, null, ["pendente: " + cH.motivo], null); return out; }
    out.horas = num(cH.valor, null);
    /* Casa 487 (F9): a reposição é dimensionada pelo VOLUME INSTALADO quando ele passa do consumo diário (lado seguro: o reservatório todo volta a encher no mesmo prazo); um só valor no documento inteiro */
    var volRep = ent ? num(ent.volumeReposicao_L, null) : null;
    if (volRep != null && volRep > consumoL) { out.passos.push("volume a repor adotado = reservação instalada (" + f2(volRep) + " L), maior que o consumo diário (" + f2(consumoL) + " L): lado seguro"); consumoL = volRep; }
    out.vazao_ls = consumoL / (out.horas * HORA_S);
    out.passos.push("Q = volume a repor ÷ (" + out.horas + " h × 3600) = " + f2(consumoL) + " L ÷ " + f2(out.horas * HORA_S) + " s = " + f3(out.vazao_ls) + " L/s");
    if (!ent || num(ent.pressao_kpa, null) == null || num(ent.comprimento_m, null) == null) {
      ctx.pendencia("entrada.alimentador", "pressão mínima da rede pública e/ou traçado do alimentador (comprimento, desnível) não informados: o alimentador predial (" + f3(out.vazao_ls) + " L/s em ≤ " + out.horas + " h) não foi dimensionado", "alimentador predial");
      v(null, null, null, out.passos.concat(["pendente: informe entrada.alimentador.pressao_kpa (pressão MÍNIMA da rede pública), comprimento_m e desnivel_m"]), cH.fonte);
      return out;
    }
    var pm = ctx.consulta("af.pressao.dinamica_minima_rede", null, "valor", "alimentador predial");
    if (!pm.ok) { v(null, null, null, out.passos.concat(["pendente: " + pm.motivo]), null); return out; }
    var mat = ent.material || "pvc_soldavel", M = B.MATERIAIS[mat], L = num(ent.comprimento_m, 0), dz = num(ent.desnivel_m, 0), pRede = num(ent.pressao_kpa, 0), lim = num(pm.valor, 0);
    var PD0 = HP().criar(ctx, fl, "auto", function () {}), achado = null, ultimo = null;
    (M ? M.dns.slice().sort(function (a, b) { return a - b; }) : []).forEach(function (dn) {
      if (achado) return;
      var dI = PD0.di(mat, dn, "alimentador predial"); if (dI == null) return;
      var ds = PD0.distribuida(out.vazao_ls, dI, L, mat, "alimentador predial"); if (!ds) return;
      var loc = arr(ent.conexoes).reduce(function (s0, c) { var pl = PD0.local(c, mat, dn, ds.J, ds.v, "alimentador predial"); return s0 + (pl ? pl.perda_m : 0); }, 0);
      var resid = pRede - H.mParaKpa(dz + ds.hf + loc, fl.rho);
      ultimo = { dn: dn, resid: resid, hf: ds.hf + loc, v: ds.v };
      if (resid >= lim) achado = ultimo;
    });
    var r = achado || ultimo;
    if (!r) { v(null, lim, null, out.passos.concat(["pendente: material " + mat + " sem diâmetro interno tabelado"]), pm.fonte); return out; }
    out.dn = achado ? achado.dn : null;
    var passos = out.passos.concat(["DN " + r.dn + ": v = " + f2(r.v) + " m/s; perda = " + f3(r.hf) + " m; pressão na chegada = " + f2(pRede) + " kPa − ρg·(desnível " + f2(dz) + " m + perda) = " + f2(r.resid) + " kPa ≥ " + f2(lim) + " kPa"]);
    v(r.resid, lim, !!achado, passos, cH.fonte);
    out.status = achado ? "ok" : "reprovado";
    if (!achado) out.avisos.push({ gravidade: "erro", texto: "a pressão mínima da rede pública (" + f2(pRede) + " kPa) não repõe o consumo diário em " + out.horas + " h com nenhum DN de " + (M ? M.nome : mat), corrigir: { texto: "cisterna com recalque, ou confirmar com a concessionária uma pressão maior" } });
    else if (num(ent.dn, null) != null && num(ent.dn, 0) < achado.dn) out.avisos.push({ gravidade: "erro", texto: "alimentador predial desenhado em DN " + ent.dn + ": precisa de DN " + achado.dn + " para repor o consumo em " + out.horas + " h", corrigir: { texto: "trocar o alimentador para DN " + achado.dn } });
    return out;
  }
  var HORA_S = 3600;

  var HidAF = { VERSAO: 1, alimentador: alimentador, METODOS: METODOS, APARELHO_DA_FAMILIA: APARELHO_DA_FAMILIA, aparelhoDaFamilia: aparelhoDaFamilia, grupoDaFamilia: grupoDaFamilia, CONECTOR_ALIMENTACAO: CONECTOR_ALIMENTACAO, calcular: calcular };
  global.HidAF = HidAF;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAF;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
