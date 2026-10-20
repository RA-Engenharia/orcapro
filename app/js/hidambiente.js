/* =====================================================================
 * hidambiente.js — PROJETO INTELIGENTE: "LIGAR AMBIENTE" (frente 17/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério: "Se tiver ralo sifonado, ele pega da pia, do chuveiro, conecta tudo nessa caixa sifonada, cria a
 * coluna de ventilação e manda tudo para a rede primária no tubo de 100".
 *
 *   HidAmbiente.ligar({ estado, avaliarFam, ops, famInst | ambiente, parametros? })
 *     → { ok, ambiente{ id, aparelhos[], piso, terreo, origemPiso }, ops[] (o LOTE: tira as esperas provisórias dos kits e o
 *         ambiente anterior; põe caixa sifonada, traçado e ventilação), avisos[], pendencias[], decisoes[], rota{…},
 *         caixaSifonada{…}, ventilacao{…}, normas[] }
 *
 * COMO LIGA (um ambiente = os aparelhos do mesmo cômodo):
 *  1. o cômodo: o AMBIENTE do BIM que contém o aparelho; sem ambiente, os aparelhos do mesmo piso a até raioAmbiente;
 *  2. CAIXA SIFONADA no melhor ponto (se o ambiente não tem): grade no piso, fora das louças, da porta e do ralo do box,
 *     afastada das paredes; custo = soma dos ramais que chegam (lavatório, ralo, tanque) + o caminho até o ramal da bacia;
 *     penalidade se ela fica mais longe da bacia que a distância máxima do desconector ao ponto ventilado (NBR 8160,
 *     es.ventilacao.distancia_maxima) — é ali, no ramal da bacia, que a ventilação entra. Corpo pela es.caixa_sifonada.dn;
 *  3. o TRAÇADO (água fria + esgoto) é o do HidRota (o mesmo motor testado do "Traçar automaticamente"): bacia direto ao
 *     destino, lavatório/ralo na caixa, caixa no ramal, junções a 45°, declividade da tabela; a válvula de descarga tem
 *     ramal exclusivo (kit) e fica fora do ramal do banheiro; o chuveiro entra pela espera lateral do kit;
 *  4. DESTINO do esgoto: o tubo de queda que existe perto; no térreo sem TQ, um PONTO DE ESPERA do ramal DN 100 fora do
 *     ambiente, do lado do limite da obra mais perto (a "linha da rede" liga depois). Água fria: a coluna que existe ou
 *     uma espera que desce do forro/laje (ponto do barrilete);
 *  5. VENTILAÇÃO: o tubo ventilador nasce NO ramal da bacia (NBR 8160, 4.3.11: no térreo, DN 100 ligado ao ramal de
 *     descarga da bacia), no ponto que deixa cada desconector (bacia e caixa sifonada) dentro da distância máxima
 *     (es.ventilacao.distancia_maxima pelo DN do ramal dele), e sobe embutido na parede mais perto até acima da
 *     cobertura (es8160.terminal_ventilacao). Sem cobertura no modelo: para no teto, com pendência.
 *
 * Tudo vai num LOTE (um Ctrl+Z desfaz); as ops levam `amb` (o ambiente) e `ambParte`, para o "religar" trocar só o que é
 * dele. ⚠ Nenhum número de norma aqui (test-hid-sem-numero-magico): distâncias, DN, declividade, terminal e o DN 100
 * do térreo vêm do HidNormas; os "hid:ok" são geometria de desenho/busca, trocáveis em parametros.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function BE() { return dep("BimEdit", "./bimedit.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HI() { return dep("HidImplantacao", "./hidimplantacao.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function chao4(v) { return Math.floor(v * CASAS + 1e-6) / CASAS; }   // hid:ok arredondamento de 4 casas
  function teto4(v) { return Math.ceil(v * CASAS - 1e-6) / CASAS; }   // hid:ok arredondamento de 4 casas
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;   // hid:ok
  var INF = Infinity;
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function raio(dn) { return dn / 1000 / 2; }   /* DN em mm → raio em m */
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

  /* ⚠ GEOMETRIA DE BUSCA/DESENHO (não é norma) — trocável em parametros, declarada quando assumida */
  var GEO_AMB = {
    raioAmbiente: 4.0,       // hid:ok aparelhos a até 4 m e no mesmo piso = o mesmo cômodo (sem ambiente do BIM)
    frenteAparelho: 0.15,    // hid:ok o ponto que "olha" o cômodo: 15 cm à frente da origem do aparelho (a do chuveiro fica na face da parede)
    passoCaixa: 0.05,        // hid:ok grade da busca da caixa sifonada
    afastParede: 0.10,       // hid:ok borda da caixa sifonada até a face da parede (rodapé + argamassa)
    raioPorta: 0.60,         // hid:ok zona da porta (abertura da folha) sem caixa
    pesoBacia: 0.5,          // hid:ok peso do caminho caixa → ramal da bacia na escolha do ponto da caixa
    lateralEntradaAF: 0.20,  // hid:ok espera de água do ambiente ao lado da prumada da válvula (m)
    recuoEspera: 0.30,       // hid:ok ponto de espera do esgoto fora da obra: recuo da face externa (m) — perto da parede: a descida até a caixa da rede fica longe da tampa dela
    folgaTampaCaixa: 0.10,   // hid:ok o tubo entra na caixa de inspeção com o topo da bolsa a isto abaixo da laje da tampa (o mesmo do js/hidrede.js)
    afastQuedaCaixa: 0.30,   // hid:ok a descida do ramal que chega alto fica a isto fora da parede da caixa (nunca em cima dela)
    degrauMinimoCaixa: 0.02, // hid:ok menor degrau que se faz antes da caixa: o ramal já nasce na cota de controle (js/hidrota.js, topoEntrada); sobra menor que isto (a peça rasa da rede manda) não vira joelho
    paredeAtrasMax: 0.60,    // hid:ok procura da parede atrás de um ponto de parede (raio pela normal do conector), a partir da face da louça
    margemVent: 0.10,        // hid:ok o ponto da ventilação fica a esta folga ANTES da distância máxima (m)
    caixasAvaliadas: 3,      // hid:ok quantos pontos de caixa sifonada são TRAÇADOS de verdade para escolher (o melhor custo do HidRota vence)
    distCandidatos: 0.30,    // hid:ok entre dois pontos avaliados (senão seriam o mesmo traçado)
    passoParede: 0.05,       // hid:ok deslize do ponto de subida ao longo da parede (m)
    deslizeParede: 0.60,     // hid:ok até quanto a subida desliza na parede para fugir de outro tubo (m)
    pesoCurva: 0.30,         // hid:ok uma curva a mais "vale" 30 cm de tubo na escolha da subida
    raioDuplicado: 0.10,     // hid:ok dois aparelhos do mesmo tipo a menos de 10 cm = o mesmo aparelho posto duas vezes
    raioCaixaGordura: 15.0,  // hid:ok a caixa de gordura que o usuário pôs (dentro ou fora da casa) a até 15 m do aparelho serve a pia
    esperaGordura: 0.30,     // hid:ok o toco de espera na saída da caixa de gordura (a linha da rede pega dali)
    alturaSaidaVentilacao: 3.50   // hid:ok projeto (Rogério, 18/10/2026): a ventilação sobe até +3,50 m do piso e ali vai o terminal; editável no painel do kit — o prolongamento acima da cobertura (NBR 8160 4.3.5/4.3.6) é pendência do RT
  };
  /* ---------------------------------------------------------- O QUE O USUÁRIO JÁ PÔS (18/10/2026, caso do Rogério)
     A caixa sifonada, o ralo, a caixa de gordura e a de inspeção podem estar no modelo como PEÇA do traçado (biminst), como
     FAMÍLIA do OrçaPRO (hid-caixa-sifonada, hid-ralo, hid-caixa-gordura, hid-caixa-inspecao, colocadas pelo "Aparelho") ou como
     família da BIBLIOTECA DO ESCRITÓRIO (Tigre/Amanco, reconhecida pelo js/biminstbiblioteca.js). ⚠ Antes só a peça contava:
     a caixa posta como família era ignorada e o "ligar" punha OUTRA por cima. */
  var FAM_DISP = { "hid-caixa-sifonada": "caixa_sifonada", "hid-ralo": "ralo_seco", "hid-caixa-gordura": "caixa_gordura", "hid-caixa-inspecao": "caixa_inspecao" };
  var DISP_OK = { caixa_sifonada: 1, ralo_sifonado: 1, ralo_seco: 1, caixa_gordura: 1, caixa_inspecao: 1 };
  function tipoDisp(f) {
    if (!f) return null;
    if (FAM_DISP[f.famId]) {
      if (f.famId === "hid-ralo") { var HF = dep("HidFamilias", "./hidfamilias.js"), fm = HF && HF.porId ? HF.porId(f.famId) : null, t = fm ? arr(fm.tipos).filter(function (x) { return x.id === f.tipoId; })[0] : null; return t && /sifon/i.test(txt(t.nome)) ? "ralo_sifonado" : "ralo_seco"; }
      return FAM_DISP[f.famId];
    }
    var HB = dep("HidBiblioteca", "./biminstbiblioteca.js"), m = null;
    try { m = HB && HB.motorDe ? HB.motorDe(f.famId, f.tipoId) : null; } catch (e) { m = null; }
    return m && DISP_OK[m] ? m : null;
  }
  /* as linhas da rede que o USUÁRIO desenhou: a "rede-auto" é a PROPOSTA do Traçar automaticamente (js/hidimplantacao.js) e fica
     no modelo depois do Aplicar — ao vivo (18/10/2026) uma proposta velha (de uma pia já apagada, 0,51 m) mandava o esgoto do
     banheiro para uma "espera" e a caixa de inspeção Tigre que o Rogério pôs ficava de fora. A linha dele manda; a proposta não. */
  function redesDoUsuario(est) { return arr(est && est.hidRedes).filter(function (r) { return !/^rede-auto/.test(String(r && r.id)); }); }
  /* as famílias-dispositivo do modelo: [{ id, tipo, f }] */
  function dispositivosFamilia(estado) {
    return arr(estado && estado.familias).map(function (f) { var t = tipoDisp(f); return t ? { id: String(f.id), tipo: t, f: f } : null; }).filter(Boolean);
  }
  /* o DN da peça do biminst equivalente à família (o corpo pelo nome do tipo: "150x185x75", "100X100XDN50") */
  function dnPecaDe(f, tipo) {
    if (tipo !== "caixa_sifonada") return BI().PECAS[tipo] ? BI().PECAS[tipo].dn : null;
    var HF = dep("HidFamilias", "./hidfamilias.js"), HB = dep("HidBiblioteca", "./biminstbiblioteca.js"), nome = "";
    var fm = HF && HF.porId ? HF.porId(f.famId) : null, t = fm ? arr(fm.tipos).filter(function (x) { return x.id === f.tipoId; })[0] : null;
    if (t) nome = txt(t.nome);
    var dm = null; try { dm = HB && HB.dim ? HB.dim(f.famId, f.tipoId) : null; } catch (e) { dm = null; }
    var mm = /(\d{2,3})\s*x\s*(\d{2,3})/i.exec(nome), corpo = dm && dm.corpo ? dm.corpo : (mm ? num(mm[1], 0) : 0);   // hid:ok o padrão do nome do catálogo ("150x185")
    return pecaCaixa(corpo || null).dn;
  }
  /* aparelhos postos DUAS vezes no mesmo lugar (o print do Rogério: duas bacias sobrepostas) — o 2º sai do traçado */
  function duplicados(fams) {
    var K = HK(), out = [];
    fams.forEach(function (f, i) {
      var tf = K.tipoDaFamilia(f.famId, f.tipoId); if (!tf) return;
      var d = fams.slice(0, i).filter(function (g) { return K.tipoDaFamilia(g.famId, g.tipoId) === tf && d2(g, f) <= GEO_AMB.raioDuplicado && Math.abs(num(g.y, 0) - num(f.y, 0)) <= GEO_AMB.raioDuplicado && !out.some(function (o) { return o.id === String(g.id); }); })[0];
      if (d) out.push({ id: String(f.id), de: String(d.id), tipo: tf });
    });
    return out;
  }
  var INF_AMB = 1e9, EPS_AMB = 1e-9;   // hid:ok infinito numérico e tolerância de ponto flutuante
  function fcmAmb(v) { return String(Math.round(v * 100)); }   // hid:ok metro → centímetro (texto)
  function geo(par, k) {
    if (par && par[k] != null && isFinite(Number(par[k]))) return Number(par[k]);
    if (GEO_AMB[k] != null) return GEO_AMB[k];
    var G = (HR() && HR().GEO) || {};
    return G[k];
  }

  /* ---------------------------------------------------------- O PAVIMENTO */
  /* os obstáculos DESTE pavimento (prédio): a parede que contém a meia altura do pé-direito, a abertura que nasce nele, o pilar
     que o atravessa, a viga entre o piso e o teto, a louça na faixa dele. ⚠ Sem isto o traçado do 2º andar batia nas paredes do
     1º (o enchimento sob o piso fica DENTRO da parede de baixo) e nas louças dos andares de cima, na mesma planta. */
  function noPavimento(obst, piso, par) {
    if (piso == null || !obst) return obst;
    var pd = geo(par, "peDireito"), meio = piso + pd / 2, o = {};
    Object.keys(obst).forEach(function (k) { o[k] = obst[k]; });
    o.paredes = arr(obst.paredes).filter(function (w) { var b = num(w.base, -INF), t = b + num(w.altura, INF); return b <= meio + EPS && t >= meio - EPS; });
    o.aberturas = arr(obst.aberturas).filter(function (a) { return num(a.y0, piso) >= piso - pd / 2 && num(a.y0, piso) < piso + pd - EPS; });
    o.pilares = arr(obst.pilares).filter(function (c) { var b = num(c.base, -INF), t = b + num(c.altura, INF); return b <= meio + EPS && t >= meio - EPS; });
    o.vigas = arr(obst.vigas).filter(function (v) { var t = num(v.topo, piso), b = t - num(v.altura, 0); return t > piso - pd / 2 && b < piso + pd + EPS; });
    o.familias = arr(obst.familias).filter(function (v) { return num(v.y1, INF) > piso - pd / 2 && num(v.y0, -INF) < piso + pd - EPS; });
    return o;
  }

  /* ---------------------------------------------------------- O CÔMODO */
  var PARTES_DE_KIT = { valvula: 1, torneira: 1 };
  function membros(estado, avaliarFam, ops, seed, par) {
    var K = HK(), fams = arr(estado.familias), porId = {}, kitDe = {};
    fams.forEach(function (f) { porId[String(f.id)] = f; });
    K.achatar(ops).forEach(function (o) { if (o.op === "familia" && o.kit != null && PARTES_DE_KIT[o.kitParte]) kitDe[String(o.id)] = 1; });
    var cands = fams.filter(function (f) { return !kitDe[String(f.id)] && K.tipoDaFamilia(f.famId, f.tipoId); });
    var s = porId[String(seed)]; if (!s) return null;
    var amb = K._int.ambienteDe(estado, s), ps = K._int.pisoDe(estado, avaliarFam, s, null);
    /* sem ambiente do BIM: corrente de vizinhos no mesmo piso que se ENXERGAM (a reta entre eles não cruza parede) —
       sem isto a casa inteira virava um cômodo só (banheiro social, suíte e cozinha a menos de 4 m um do outro) */
    /* ⚠ PRÉDIO: só as paredes do pavimento do aparelho (as dos outros andares, na mesma planta ou não, não separam cômodo aqui) */
    var Hr = HR(), muros = Hr ? noPavimento(Hr.obstaculosDoBim(estado, null), ps.ok ? ps.y : null, par).paredes.map(function (w) { return Hr._int.retSeg(w.p1, w.p2, num(w.espessura, 0)); }).filter(Boolean) : [];
    var frente = function (f) { if (f.famId == null) return { x: num(f.x, 0), z: num(f.z, 0) }; var c = Math.cos(num(f.rotY, 0)), sn = Math.sin(num(f.rotY, 0)), o = geo(par, "frenteAparelho"); return { x: num(f.x, 0) + o * sn, z: num(f.z, 0) + o * c }; };
    var enxerga = function (a, b) { var pa = frente(a), pb = frente(b); return !muros.some(function (w) { return Hr._int.corta(w, pa, pb, 0); }); };
    var lista;
    if (amb) lista = cands.filter(function (f) { return K._int.ambienteDe(estado, f) === amb; });
    else {
      lista = [s]; var mudou = true, R = geo(par, "raioAmbiente");
      while (mudou) {
        mudou = false;
        cands.forEach(function (f) {
          if (lista.indexOf(f) >= 0) return;
          var pf = K._int.pisoDe(estado, avaliarFam, f, null);
          if (ps.ok && pf.ok && Math.abs(pf.y - ps.y) > geo(par, "margemNo")) return;
          if (lista.some(function (m) { return d2(m, f) <= R && enxerga(m, f); })) { lista.push(f); mudou = true; }
        });
      }
    }
    lista.sort(function (a, b) { return fams.indexOf(a) - fams.indexOf(b); });
    var dups = duplicados(lista), fora = {}; dups.forEach(function (d) { fora[d.id] = 1; });
    if (dups.length && !fora[String(s.id)]) lista = lista.filter(function (f) { return !fora[String(f.id)]; });
    return { id: amb ? "amb" + amb.id : "amb" + lista[0].id, bim: amb, fams: lista, piso: ps, enxerga: enxerga, duplicados: dups };
  }

  /* ---------------------------------------------------------- AS OPS DO MODELO */
  function opsAmbiente(ops, id) { return HK().achatar(ops).filter(function (o) { return o.amb === id && o.op !== "apagar" && o.op !== "desanotar"; }); }
  function apagadosDepois(ops) { var a = {}; HK().achatar(ops).forEach(function (o, i) { if ((o.op === "apagar" || o.op === "desanotar") && o.id != null) a[o.id] = i; }); return a; }
  /* o lote que limpa: as esperas provisórias dos kits dos membros e o que o "ligar" anterior pôs (acessórios primeiro) */
  function limpeza(ops, ids, ambId) {
    var lista = HK().achatar(ops), apag = apagadosDepois(ops), vivos = {}, ordem = { acessorio: 0, trecho: 1, peca: 2, familia: 3, anotar: 4 }, out = [];   // hid:ok ordem de remoção (anotar = a marca do furo na viga baldrame)
    lista.forEach(function (o, i) {
      if (o.op === "apagar" || o.op === "desanotar" || o.id == null) return;
      var meu = (o.amb === ambId && o.ambParte !== "reaproveitada") || (o.kit != null && ids.indexOf(String(o.kit)) >= 0 && o.kitParte === "espera");
      if (!meu || ordem[o.op] == null) return;
      if (apag[o.id] > i) return;
      vivos[o.id] = o.op;
    });
    /* JUNÇÃO 18/10/2026 (COLOCAÇÃO × PROJETO INTELIGENTE): o registro que o usuário INSERIU num tubo do ambiente dividiu o
       tubo (a 2ª metade nasce com outro id). Religar apagava só o tubo do ambiente: a metade e o registro ficavam soltos
       (ponta solta no Verificar). O acessório sai PRIMEIRO — o apagar dele emenda o tubo — e o tubo sai inteiro depois. */
    lista.forEach(function (o, i) {
      if (o.op !== "acessorio" || o.id == null || o.trecho == null || vivos[o.id] || apag[o.id] > i) return;
      if (vivos[String(o.trecho)] === "trecho") vivos[o.id] = "acessorio";
    });
    Object.keys(vivos).sort(function (a, b) { return ordem[vivos[a]] - ordem[vivos[b]]; }).forEach(function (id) { out.push({ op: vivos[id] === "anotar" ? "desanotar" : "apagar", id: id, amb: ambId, ambParte: "limpar" }); });
    return out;
  }
  /* as ops de instalação VIVAS (o que o replay deixa de pé): sem as apagadas depois. ⚠ Sem isto o traçado validava contra o
     ambiente ANTERIOR (o "apagar" não é op do biminst e caía no filtro) e o religar escolhia outra estratégia */
  /* as ops VIVAS (todas, não só as de instalação): a que foi apagada depois sai. ⚠ Ao refazer o kit (o aparelho mudou) as
     ops do kit ANTIGO continuam na lista com um "apagar" depois; sem este filtro o barrilete curto partia da prumada velha
     da válvula e ficava uma ponta solta */
  function vivas(ops) {
    var lista = HK().achatar(ops), apag = {};
    lista.forEach(function (o, i) { if (o && o.op === "apagar" && o.id != null) apag[o.id] = i; });
    return lista.filter(function (o, i) { return o && o.op !== "apagar" && !(o.id != null && apag[o.id] > i); });
  }
  function soInst(ops) {
    var B = BI(), lista = HK().achatar(ops), apag = {};
    lista.forEach(function (o, i) { if (o && o.op === "apagar" && o.id != null) apag[o.id] = i; });
    return lista.filter(function (o, i) {
      if (!o || !B.ehOp(o.op)) return false;
      var alvo = o.op === "instAlterar" || o.op === "instSistema" ? o.id : o.id;
      return !(apag[alvo] > i) && !(o.op === "instAlterar" && o.trecho != null && apag[o.trecho] > i);
    });
  }

  /* ---------------------------------------------------------- NORMA */
  function Norma(ctx) {
    return {
      distVent: function (dn, uso) { var c = ctx.consulta("es.ventilacao.distancia_maxima", { dn_ramal: dn }, "distancia_m", uso); return c.ok ? { v: num(c.valor, null), fonte: c.fonte } : null; },
      uhc: function (ap, uso) { var c = ctx.consulta("es.aparelhos", { aparelho: ap }, "uhc", uso); return c.ok ? num(c.valor, 0) : null; },
      uhcDn: function (dn, uso) { var c = ctx.consulta("es.uhc_por_dn", { dn: dn }, "uhc", uso); return c.ok ? num(c.valor, 0) : null; },
      corpoCaixa: function (uhc, uso) {
        var ls = ctx.linhas("es.caixa_sifonada.dn", null, uso); if (!ls) return null;
        var l = ls.filter(function (x) { return num(x.uhc_max, -1) >= uhc - EPS; }).sort(function (a, b) { return num(a.uhc_max, 0) - num(b.uhc_max, 0); })[0];
        return l ? num(l.dn_caixa, null) : null;
      },
      regraVent: function (p, uso) { var c = ctx.consulta("es8160.ventilacao_regras", { parametro: p }, "valor", uso); return c.ok ? num(c.valor, null) : null; },
      terminal: function (p, uso) { var c = ctx.consulta("es8160.terminal_ventilacao", { parametro: p }, "valor", uso); return c.ok ? num(c.valor, null) : null; },
      dnVentRamal: function (comBacia, uhc, uso) {
        var ls = ctx.linhas("es.ventilacao.ramal", null, uso); if (!ls) return null;
        var l = ls.filter(function (x) { return num(x.com_bacia, -1) === comBacia && num(x.uhc_max, -1) >= uhc - EPS; }).sort(function (a, b) { return num(a.dn, 0) - num(b.dn, 0); })[0];
        return l ? num(l.dn, null) : null;
      }
    };
  }

  /* ---------------------------------------------------------- CAIXA SIFONADA */
  /* as peças disponíveis no biminst ("100x100x50", "150x185x75"): o primeiro corpo ≥ o da tabela */
  function pecaCaixa(corpo) {
    var P = BI().PECAS.caixa_sifonada, ds = arr(P.dns).map(function (d) { var p = String(d).split("x"); return { dn: d, corpo: num(p[0], 0), saida: num(p[p.length - 1], 0) }; })
      .sort(function (a, b) { return a.corpo - b.corpo; });
    return ds.filter(function (d) { return corpo == null || d.corpo >= corpo - EPS; })[0] || ds[ds.length - 1];
  }
  function localCaixa(o) {
    /* o = { receptores:[{x,z,peso}], bacia:{x,z}|null, paredes, aberturas, volumes, ralos, piso, limite, area:{x0,x1,z0,z1}|poligono, rCaixa, par } */
    var par = o.par, passo = geo(par, "passoCaixa"), afast = geo(par, "afastParede") + o.rCaixa, folga = geo(par, "folga");
    var A = o.area, melhor = null, cands = 0, lista = [];
    for (var x = A.x0; x <= A.x1 + EPS; x += passo) for (var z = A.z0; z <= A.z1 + EPS; z += passo) {
      var p = { x: r4(x), z: r4(z) };
      if (o.poligono && !HK()._int.ambienteDe({ ambientes: [{ calc: { contorno: o.poligono } }] }, p)) continue;
      /* ⚠ sem ambiente do BIM a área é a caixa dos aparelhos + margem e passa da parede: o ponto precisa ENXERGAR um aparelho
         do cômodo (a reta não cruza parede) — a alternativa mais barata saía do outro lado da parede dos fundos (print etapa 2) */
      if (o.dentro && !o.dentro(p)) continue;
      if (o.paredes.some(function (w) { return distSeg(p, w.p1, w.p2) - num(w.espessura, 0) / 2 < afast - EPS; })) continue;
      if (o.volumes.some(function (v) { return dentroRet(v, p, o.rCaixa + folga); })) continue;
      if (o.aberturas.some(function (a) { return a.tipo === "porta" && distSeg(p, a.p1, a.p2) < geo(par, "raioPorta"); })) continue;
      if (o.ralos.some(function (r) { return d2(p, r) < o.rCaixa + r.r + folga * 2; })) continue;
      cands++;
      var c = 0; o.receptores.forEach(function (r) { c += r.peso * d2(p, r); });
      /* ⚠ o ramal da caixa corre ORTOGONAL até o ramal da bacia (junção a 45° no fim): a distância em linha reta
         enganava — a caixa a 1,06 m "em linha" ficava a 1,73 m pelo tubo e saía do alcance da ventilação */
      var db = o.bacia ? Math.abs(p.x - o.bacia.x) + Math.abs(p.z - o.bacia.z) : 0;
      c += geo(par, "pesoBacia") * db;
      var fora = o.limite != null && db > o.limite ? 1 : 0;
      var k0 = { x: p.x, z: p.z, custo: r4(c), fora: fora, dBacia: r4(db) };
      lista.push(k0);
      if (!melhor || fora < melhor.fora || (fora === melhor.fora && c < melhor.custo - EPS)) melhor = k0;
    }
    if (melhor) {
      melhor.candidatos = cands;
      /* os N melhores DISTANTES entre si (o traçado de cada um é avaliado de verdade e vence o mais barato) */
      lista.sort(function (a, b) { return a.fora - b.fora || a.custo - b.custo; });
      var top = [];
      lista.forEach(function (k) { if (top.length < geo(par, "caixasAvaliadas") && !top.some(function (t) { return d2(t, k) < geo(par, "distCandidatos"); })) top.push(k); });
      melhor.alternativas = top.slice(1);
    }
    return melhor;
  }
  function distSeg(p, a, b) { var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); var qx = a.x + dx * t, qz = a.z + dz * t; return Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz)); }
  function dentroRet(v, p, inf) { var dx = p.x - v.cx, dz = p.z - v.cz, u = dx * v.ux + dz * v.uz, w = -dx * v.uz + dz * v.ux; return Math.abs(u) <= v.hl + inf && Math.abs(w) <= v.hw + inf; }

  /* ---------------------------------------------------------- DESTINOS */
  /* prumadas que existem no modelo. ⚠ As peças geradas por kit/ambiente NÃO são prumada (a espera do tanque virava
     "tubo de queda" da cozinha e o tubo do chuveiro da suíte virava "coluna" da área de serviço) */
  function verticais(estado, sistema, gerados) {
    return arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema === sistema && t.vertical && !(gerados && gerados[String(t.id).replace(/b$/, "")]) && !(gerados && gerados[t.id]); })
      .map(function (t) { return { id: t.id, x: t.p1.x, z: t.p1.z, yBase: Math.min(t.p1.y, t.p2.y), yTopo: Math.max(t.p1.y, t.p2.y) }; });
  }
  /* o limite da obra (caixa envolvente das paredes) e o lado mais perto do ponto: a espera do esgoto sai por ali */
  function esperaFora(paredes, p, par, redes, estado) {
    if (!paredes.length) return null;
    /* ⚠ PADRÃO (docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md): com a LINHA DA REDE, a espera sai pela face externa que leva à linha
       pelo caminho mais curto sem passar por baixo de outro cômodo (inclusive a face do corredor entre blocos) — o lado da
       caixa envolvente obrigava o ramal da área de serviço a atravessar a suíte (correção de 18/10/2026) */
    var HIe = HI(), LRe = dep("HidRede", "./hidrede.js");
    if (HIe && LRe && estado && arr(redes).length) {
      var cs = HIe.posicaoExterna(estado, p, { afast: geo(par, "recuoEspera"), parametros: par, todos: true }) || [], melhor = null;
      cs.forEach(function (c) {
        var dIn = Math.abs(p.x - c.pe.x) + Math.abs(p.z - c.pe.z), dR = Infinity;
        redes.forEach(function (r) { var Lh = LRe._int.linha(r.pontos), q = LRe._int.projetar(Lh, c, function (a, b) { return !HIe._int.cruzaDentro(estado, a, b, {}); }); if (q && !HIe._int.cruzaDentro(estado, c, q, {})) dR = Math.min(dR, q.d); });
        var nota = dIn * 3 + dR;   // hid:ok o tubo sob o cômodo "vale" 3× o tubo na área externa
        if (dR < Infinity && (!melhor || nota < melhor.nota - EPS)) melhor = { x: c.x, z: c.z, nota: nota };
      });
      if (melhor) return { x: r4(melhor.x), z: r4(melhor.z) };
    }
    var xs = [], zs = [];
    paredes.forEach(function (w) { [w.p1, w.p2].forEach(function (q) { xs.push(q.x); zs.push(q.z); }); });
    var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Z0 = Math.min.apply(null, zs), Z1 = Math.max.apply(null, zs), e = Math.max.apply(null, paredes.map(function (w) { return num(w.espessura, 0); })) / 2, rc = geo(par, "recuoEspera") + e;
    var lados = [{ x: X0 - rc, z: p.z, d: p.x - X0 }, { x: X1 + rc, z: p.z, d: X1 - p.x }, { x: p.x, z: Z0 - rc, d: p.z - Z0 }, { x: p.x, z: Z1 + rc, d: Z1 - p.z }];
    /* com a LINHA DA REDE desenhada, a espera sai do lado que olha para ela (o ramal até a caixa fica curto) */
    var LR = dep("HidRede", "./hidrede.js");
    if (LR && arr(redes).length) lados.forEach(function (q) { q.dRede = Math.min.apply(null, redes.map(function (r) { var pj = LR._int.projetar(LR._int.linha(r.pontos), q); return pj ? pj.d : Infinity; })); });
    /* ⚠ empate na distância à linha (a rede proposta corre à mesma distância de todas as faces): vale o lado mais perto do
       ambiente — senão o ramal da suíte atravessava o banheiro vizinho por baixo até o outro lado (correção de 18/10/2026) */
    lados.sort(function (a, b) { return a.dRede != null && Math.abs(a.dRede - b.dRede) > 0.05 ? a.dRede - b.dRede : a.d - b.d; });   // hid:ok 5 cm = empate
    return { x: r4(lados[0].x), z: r4(lados[0].z) };
  }

  /* ---------------------------------------------------------- GRAFO DO ESGOTO TRAÇADO */
  function grafoEs(trechos) {
    var nos = [], TOL = BI().TOL;
    function no(p) { for (var i = 0; i < nos.length; i++) if (d3(nos[i], p) <= TOL) return i; nos.push({ x: p.x, y: p.y, z: p.z, sai: [], entra: [] }); return nos.length - 1; }
    var E = trechos.map(function (t, i) { var a = no(t.p1), b = no(t.p2); nos[a].sai.push(i); nos[b].entra.push(i); return { t: t, a: a, b: b, L: d3(t.p1, t.p2) }; });
    /* caminho a jusante a partir de um nó: [{ e, s0 (distância acumulada no início do trecho) }] */
    function jusante(n0) { var out = [], n = n0, s = 0, guarda = 0; while (nos[n].sai.length && guarda++ < E.length + 1) { var ei = nos[n].sai[0], e = E[ei]; out.push({ e: e, s0: s }); s += e.L; n = e.b; } return out; }
    function noPerto(p, r) { var m = null, dm = INF; nos.forEach(function (q, i) { var d = d3(q, p); if (d < dm) { dm = d; m = i; } }); return dm <= r ? m : null; }
    function noEmPlanta(p, r, yMax) { var m = null, dm = INF; nos.forEach(function (q, i) { var d = d2(q, p); if (q.y <= yMax + EPS && d < dm - EPS) { dm = d; m = i; } }); return dm <= r ? m : null; }
    /* o nó da PEÇA que leva a jusante (a saída dela): dentro da captura, com tubo saindo — sem o toco interno (o "laço" que a
       árvore do esgoto não aceita), o nó mais perto do centro podia ser a ponta de uma ENTRADA, sem caminho a jusante */
    function noSaidaEm(p, r, yMax) { var m = null, dm = INF; nos.forEach(function (q, i) { var d = d2(q, p); if (q.sai.length && q.y <= yMax + EPS && d <= r + EPS && d < dm - EPS) { dm = d; m = i; } }); return m; }
    return { nos: nos, E: E, jusante: jusante, noPerto: noPerto, noEmPlanta: noEmPlanta, noSaidaEm: noSaidaEm };
  }

  /* ======================================================= LIGAR */
  function ligar(e) {
    e = e || {};
    var estado0 = e.estado || {}, avaliarFam = e.avaliarFam, ops0 = arr(e.ops), par = e.parametros || {}, K = HK(), B = BI(), H = HR();
    var out = { ok: false, ambiente: null, ops: [], avisos: [], pendencias: [], decisoes: [], rota: null, caixaSifonada: null, ventilacao: null, normas: [], descartadas: [] };
    function pend(chave, motivo, els, acao) { out.pendencias.push({ chave: chave, motivo: motivo, texto: motivo, elementos: arr(els), acao: acao || null }); }
    function aviso(t, els, acao) { out.avisos.push({ texto: t, elementos: arr(els), acao: acao || null }); }
    /* a decisão com o mesmo id ganha o complemento (o texto-base aparece uma vez só) */
    function decide(id, extra) {
      var ja = out.decisoes.filter(function (d) { return d.id === id; })[0];
      if (ja) { if (extra) ja.texto += " " + extra; return; }
      var D = dep("HidKitDados", "./hidkitdados.js");
      out.decisoes.push({ id: id, texto: (((D && D.decisoes && D.decisoes[id]) || "") + (extra ? " " + extra : "")).replace(/^\s+/, "") });
    }
    if (!K || !B || !H || !BE()) { pend("amb.motores", "motores do traçado não carregados (HidKit, BimInst, HidRota, BimEdit)"); return out; }
    var M = membros(estado0, avaliarFam, ops0, e.famInst, par);
    if (!M || !M.fams.length) { pend("amb.aparelho", "aparelho " + e.famInst + " não está no modelo ou não é aparelho sanitário"); return out; }
    if (!M.piso.ok) { pend("amb.piso", M.piso.motivo); return out; }
    var ids = M.fams.map(function (f) { return String(f.id); }), ambId = M.id, piso = M.piso.y;
    out.ambiente = { id: ambId, aparelhos: ids, piso: piso, origemPiso: M.piso.origem, bim: M.bim ? M.bim.id : null };

    M.duplicados.forEach(function (d) { aviso("aparelho DUPLICADO: " + d.id + " está em cima de " + d.de + " (o mesmo " + d.tipo.replace(/_/g, " ") + " posto duas vezes) — ficou fora do traçado; remova a duplicada", [d.id, d.de], { tipo: "remover", ids: [d.id], texto: "Remover a duplicada (" + d.id + ")" }); });
    /* 1) o modelo LIMPO (sem as esperas dos kits nem o "ligar" anterior) */
    var limpar = limpeza(ops0, ids, ambId);
    /* 1b) REAPROVEITA a caixa sifonada / o ralo que o usuário pôs como FAMÍLIA no cômodo: vira a peça do traçado NO MESMO lugar e
       com o mesmo id (o traçado liga tubo em peça pelo cilindro de captura; a família só pelo ponto exato de cada conector).
       ⚠ ambParte "reaproveitada": o religar não a apaga (é do usuário) */
    var poli0 = M.bim && M.bim.calc ? M.bim.calc.contorno : null, reaproveitadas = [];
    dispositivosFamilia(estado0).forEach(function (q) {
      if (q.tipo !== "caixa_sifonada" && q.tipo !== "ralo_sifonado" && q.tipo !== "ralo_seco") return;
      var f = q.f, dentro = poli0 ? K._int.ambienteDe({ ambientes: [{ calc: { contorno: poli0 } }] }, f) : M.fams.some(function (a) { return d2(a, f) <= geo(par, "raioAmbiente") && M.enxerga(a, f); });
      if (!dentro || Math.abs(num(f.y, 0) - piso) > geo(par, "margemNo") * 2) return;
      limpar.push({ op: "apagar", id: q.id, amb: ambId, ambParte: "reaproveitada" });
      limpar.push({ op: "peca", id: q.id, peca: q.tipo, sistema: "esgoto", dn: dnPecaDe(f, q.tipo), x: r4(num(f.x, 0)), y: r4(num(f.y, 0)), z: r4(num(f.z, 0)), amb: ambId, ambParte: "reaproveitada", deFamilia: { famId: f.famId, tipoId: f.tipoId } });
      reaproveitadas.push({ id: q.id, tipo: q.tipo });
    });
    if (reaproveitadas.length) decide("amb.reaproveitada", "Aproveitou o que já estava no cômodo: " + reaproveitadas.map(function (r) { return r.tipo.replace(/_/g, " ") + " " + r.id; }).join(", ") + " (a família virou a peça do traçado no mesmo lugar, com o mesmo id).");
    out.reaproveitadas = reaproveitadas;
    var opsLimpo = ops0.concat(limpar), estado = BE().aplicar(opsLimpo);
    var ctx = NN().contexto(), NR = Norma(ctx), novas = [];
    var obstTodos = H.obstaculosDoBim(estado, avaliarFam), obst = noPavimento(obstTodos, piso, par), paredes = obst.paredes;
    /* ⚠ a pia/o tanque do kit têm a TORNEIRA (outra família) dentro do envelope deles (o envelope da pia inclui os metais):
       o tubo que chega no ponto da torneira "atravessava a pia" e a estratégia caía. O volume deles sai da busca (o esgoto
       corre no piso e a água na parede, atrás da face — nenhum dos dois passa por dentro da bancada) */
    var semVolume = {}; vivas(opsLimpo).forEach(function (o) { if (o.op === "familia" && o.kitParte === "torneira") semVolume[String(o.kit)] = 1; });
    /* o aparelho DUPLICADO (fora do traçado) também não é obstáculo: o tubo da bacia que fica atravessava a cópia dela */
    M.duplicados.forEach(function (d) { semVolume[d.id] = 1; });
    /* a peça de DESTINO posta como família (caixa sifonada, ralo, caixa de gordura, caixa de inspeção — do OrçaPRO ou da
       biblioteca do escritório) nunca é obstáculo da rota que vai até ela (ao vivo, 18/10/2026: todas as rotas "atravessavam"
       a família do escritório e o ambiente saía com 0 tubo) */
    dispositivosFamilia(estado).forEach(function (q) { semVolume[q.id] = 1; });
    obst.familias = arr(obst.familias).filter(function (v) { return !semVolume[String(v.id)]; });
    /* ⚠ a VIGA BALDRAME não entra como obstáculo do traçado em planta (no térreo a faixa do esgoto vai até o fundo e a viga
       barrava qualquer saída do ambiente): ela é tratada depois — por baixo (o traçado desce) ou atravessando (furo marcado) */
    var LRb = dep("HidRede", "./hidrede.js"), idsBald = {};
    if (LRb) LRb.baldrames(estado, par).lista.forEach(function (b) { idsBald[b.id] = 1; });
    obst.vigas = arr(obst.vigas).filter(function (v) { return !idsBald[v.id]; });
    var bases = obstTodos.paredes.map(function (w) { return num(w.base, 0); }), baseObra = bases.length ? Math.min.apply(null, bases) : piso;
    var terreo = par.terreo != null ? !!par.terreo : (piso - baseObra) < geo(par, "peDireito") / 2;
    out.ambiente.terreo = terreo;

    /* 2) aparelhos do HidRota: conectores reais, menos o que o kit resolve (válvula = ramal exclusivo; chuveiro = espera lateral) */
    var kitOps = vivas(opsLimpo).filter(function (o) { return o.kit != null && ids.indexOf(String(o.kit)) >= 0; });
    var aparelhos = [], tipos = {}, baciaEs = null, recept = [], esperaCh = {};
    /* ⚠ PONTO DE PAREDE LONGE DA PAREDE (20/10/2026, e2e-hid-tracar): a normal `parede` do conector supõe a louça ENCOSTADA (o
       fundo dela = a face da parede). A bacia posta a 30 cm da parede deixava o eixo "embutido" no ar, atrás dela: o ramal saía
       da parede a 1,81 m e chegava aparente por cima/atrás da louça (na planta, o ø20 sobre a bacia).
       FRENTE H1 (20/10/2026): com parede atrás (até paredeAtrasMax), o eixo embutido vai para a parede DE VERDADE — a distância
       do ponto até a face dela entra no `d` da normal, e o HidRota (normEntrada) põe a descida embutida na projeção do ponto;
       só o toco horizontal, na altura do ponto, sai da parede até ele. A espera e o registro do ambiente não mudam (o ponto
       continua o mesmo; só o eixo embutido deixa de ficar no ar). Sem parede atrás: o AVISO de antes (nunca aparente calado). */
    function pontoLonge(c, f) {
      var n = c.parede, nx = num(n.x, 0), nz = num(n.z, 0), Ln = Math.sqrt(nx * nx + nz * nz); if (!(Ln > EPS_AMB)) return null;
      nx /= Ln; nz /= Ln;
      var d0 = Math.max(0, num(n.d, 0)), melhor = null;
      arr(paredes).forEach(function (w) {
        var wx = w.p2.x - w.p1.x, wz = w.p2.z - w.p1.z, Lw = Math.sqrt(wx * wx + wz * wz); if (!(Lw > EPS_AMB)) return;
        var base = num(w.base, -INF_AMB), topo = base + num(w.altura, INF_AMB); if (c.y < base - B.TOL || c.y > topo + B.TOL) return;
        var den = nx * (-wz) + nz * wx; if (Math.abs(den) < EPS_AMB) return;   /* raio paralelo à parede */
        var qx = w.p1.x - c.x, qz = w.p1.z - c.z, t = (qx * (-wz) + qz * wx) / den, sL = (nx * qz - nz * qx) / den;
        if (sL < -EPS_AMB || sL > 1 + EPS_AMB || t < -B.TOL) return;   /* o raio passa fora do vão da parede, ou ela está à frente */
        var face = Math.max(0, t - num(w.espessura, 0) / 2 / (Math.abs(den) / Lw));
        if (melhor == null || face < melhor) melhor = face;
      });
      var gap = melhor == null ? null : melhor - d0;
      if (gap != null && gap <= B.FACE_TOL) return null;
      if (gap != null && gap <= geo(par, "paredeAtrasMax")) {
        decide("amb.ponto_longe", "O ponto de água de " + f.id + " está a " + fcmAmb(gap) + " cm da face da parede: o ramal desce EMBUTIDO na parede até a projeção do ponto e sai por um toco horizontal, na altura do ponto, até ele.");
        return { x: n.x, z: n.z, d: r4(melhor) };
      }
      aviso("o ponto de água de " + f.id + " não encosta em parede: o ramal sai da parede e chega aparente atrás/por cima da louça — encoste o aparelho na parede (ou embuta o ponto à mão) e trace de novo", [String(f.id)], { tipo: "mover", ids: [String(f.id)] });
      return null;
    }
    kitOps.forEach(function (o) { if (o.kitParte === "chuveiro" && /-ch-espera$/.test(txt(o.id))) esperaCh[o.kit] = o.continua === "p2" ? o.p2 : o.p1; });   /* a ponta aberta (p1 desde a FRENTE B, 19/10/2026: sentido da água) */
    M.fams.forEach(function (f) {
      var tipo = K.tipoDaFamilia(f.famId, f.tipoId); tipos[f.id] = tipo;
      var cs = K._int.conectores(avaliarFam, f).filter(function (c) { return c.sistema === "esgoto" || c.sistema === "agua_fria"; });
      var con = [];
      cs.forEach(function (c) {
        if (c.sistema === "agua_fria" && tipo === "bacia_valvula") return;   /* ramal exclusivo da válvula (kit) */
        if (c.sistema === "agua_fria" && tipo === "chuveiro" && esperaCh[f.id]) { var E = esperaCh[f.id]; con.push({ id: "af", sistema: "agua_fria", dn: c.dn, x: E.x, y: E.y, z: E.z }); return; }
        var parC = c.parede || null;
        if (c.sistema === "agua_fria" && c.parede) parC = pontoLonge(c, f) || c.parede;
        con.push({ id: c.cid || c.sistema, sistema: c.sistema, dn: c.dn, x: c.x, y: c.y, z: c.z, parede: parC });
        if (c.sistema === "esgoto" && (tipo === "bacia_valvula" || tipo === "bacia_caixa_acoplada") && !baciaEs) baciaEs = { x: c.x, y: c.y, z: c.z, id: f.id };
        /* quem descarrega na caixa sifonada: a regra do traçado (HidRota.PARA_CAIXA) — o tanque tem sifão próprio e vai ao ramal */
        if (c.sistema === "esgoto" && H.PARA_CAIXA[tipo]) recept.push({ x: c.x, z: c.z, peso: 1, ref: f.id, aparelho: tipo });
      });
      /* torneira do kit (pia, tanque, máquina) = o ponto de água do aparelho */
      kitOps.forEach(function (o) {
        if (String(o.kit) !== String(f.id) || o.op !== "familia" || o.kitParte !== "torneira") return;
        var fiT = arr(estado.familias).filter(function (x) { return String(x.id) === String(o.id); })[0];
        /* ⚠ a torneira entra como aparelho COM O ID DELA: a conferência "tubo dentro de louça" do HidRota libera o ponto só
           para a própria família — com o id da pia, o tubo que chega na torneira "atravessava" a torneira */
        var conT = fiT ? K._int.conectores(avaliarFam, fiT).filter(function (c) { return c.sistema === "agua_fria"; }).map(function (c) { return { id: "af", sistema: "agua_fria", dn: c.dn, x: c.x, y: c.y, z: c.z, parede: c.parede || null }; }) : [];
        if (conT.length) aparelhos.push({ id: String(fiT.id), aparelho: tipo, grupo: "1", conectores: conT });
      });
      if (con.length) aparelhos.push({ id: String(f.id), aparelho: tipo === "maquina_lavar_roupa" ? "maquina_lavar_roupa" : tipo, aparelhoEs: K.aparelhoEsDe ? K.aparelhoEsDe(tipo, f.inst) : null, grupo: "1", conectores: con });   /* mictório: a linha da Tabela 3 pelo Tipo_descarga */
    });
    /* peças de esgoto do ambiente (ralo do kit, caixas que já existem) */
    var poli = M.bim && M.bim.calc ? M.bim.calc.contorno : null;
    /* ⚠ o ralo do kit de um membro é do ambiente; peça solta só se está no cômodo (polígono do BIM, ou perto e À VISTA de
       um aparelho — o ralo do box da suíte, do outro lado da parede, entrava no banheiro social e travava o traçado) */
    var doKit = {}; kitOps.forEach(function (o) { if (o.op === "peca") doKit[o.id] = 1; });
    var noAmb = function (p) { return poli ? K._int.ambienteDe({ ambientes: [{ calc: { contorno: poli } }] }, p) : M.fams.some(function (f) { return d2(f, p) <= geo(par, "raioAmbiente") && M.enxerga(f, p); }); };
    var outrosKits = {}; vivas(opsLimpo).forEach(function (o) { if (o.op === "peca" && o.kit != null && ids.indexOf(String(o.kit)) < 0) outrosKits[o.id] = 1; });
    /* ⚠ a caixa de INSPEÇÃO nunca é peça do cômodo (é da rede externa; a que estava dentro vai para fora) — antes ela entrava
       no traçado como um ralo e saía um ramal DN 150 solto (print 21) */
    var pecas = arr(estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return k.sistema === "esgoto" && k.peca !== "caixa_inspecao" && (doKit[k.id] || (!outrosKits[k.id] && noAmb(k))) && Math.abs(k.y - piso) <= geo(par, "margemNo"); });
    pecas.forEach(function (k) { if (k.peca === "ralo_seco") recept.push({ x: k.x, z: k.z, peso: 1, ref: k.id, aparelho: "ralo_seco" }); });
    var caixa = pecas.filter(function (k) { return k.peca === "caixa_sifonada" || k.peca === "ralo_sifonado"; })[0] || null;

    /* 3) CAIXA SIFONADA no melhor ponto */
    if (!caixa && recept.length) {
      var uhc = 0; recept.forEach(function (r) { var u = r.aparelho === "ralo_seco" ? NR.uhcDn(num(String(B.PECAS.ralo_seco.dn).split("x").pop(), 0), "caixa sifonada") : NR.uhc(r.aparelho, "caixa sifonada"); uhc += u == null ? 0 : u; });
      var corpo = NR.corpoCaixa(uhc, "caixa sifonada"), pc = pecaCaixa(corpo), rC = B.PECAS.caixa_sifonada.r;
      var lim = NR.distVent(pc.saida, "caixa sifonada: distância ao ponto ventilado");
      var vols = (B.volumesFamilias(estado, avaliarFam) || []).filter(function (v) { return v.y0 < piso + geo(par, "peDireito") && v.y1 > piso; });
      var xs = [], zs = []; aparelhos.forEach(function (a) { a.conectores.forEach(function (c) { xs.push(c.x); zs.push(c.z); }); }); recept.forEach(function (r) { xs.push(r.x); zs.push(r.z); });
      var area = poli ? { x0: Math.min.apply(null, poli.map(function (q) { return q.x; })), x1: Math.max.apply(null, poli.map(function (q) { return q.x; })), z0: Math.min.apply(null, poli.map(function (q) { return q.z; })), z1: Math.max.apply(null, poli.map(function (q) { return q.z; })) }
        : { x0: Math.min.apply(null, xs) - geo(par, "margem"), x1: Math.max.apply(null, xs) + geo(par, "margem"), z0: Math.min.apply(null, zs) - geo(par, "margem"), z1: Math.max.apply(null, zs) + geo(par, "margem") };
      var ralos = pecas.filter(function (k) { return k.peca !== "caixa_sifonada"; }).map(function (k) { return { x: k.x, z: k.z, r: (B.PECAS[k.peca] || {}).r || 0 }; });
      var L = localCaixa({ receptores: recept, bacia: baciaEs, paredes: paredes, aberturas: obst.aberturas, volumes: vols, ralos: ralos, area: area, poligono: poli, dentro: noAmb, rCaixa: rC, limite: lim ? lim.v - geo(par, "margemVent") : null, par: par });
      if (!L) pend("amb.caixa_sifonada", "nenhum ponto livre no piso do ambiente para a caixa sifonada (paredes, louças, porta e ralo ocupam tudo)", ids, { tipo: "inserirPeca", peca: "caixa_sifonada" });
      else {
        /* NÍVEL AUTOMÁTICO (js/hidnivel.js): a grelha da caixa no piso ACABADO naquele ponto (o rebaixo do box leva a caixa junto) */
        var HNa = dep("HidNivel", "./hidnivel.js"), yCs = HNa ? HNa.em(estado, L, piso, par).y : r4(piso);
        var cop = { op: "peca", id: ambId + "-cs", peca: "caixa_sifonada", sistema: "esgoto", dn: pc.dn, x: L.x, y: yCs, z: L.z, amb: ambId, ambParte: "caixa_sifonada" };
        novas.push(cop); caixa = B.normPeca(cop);
        out.caixaSifonada = { id: cop.id, x: L.x, z: L.z, dn: pc.dn, corpo: corpo, uhc: uhc, dBacia: L.dBacia, limite: lim ? lim.v : null, candidatos: L.candidatos, receptores: recept.map(function (r) { return r.ref; }) };
        if (L.fora) aviso("caixa sifonada " + cop.id + " a " + f2(L.dBacia) + " m da bacia: mais que a distância máxima ao ponto ventilado (" + f2(lim.v) + " m, DN " + pc.saida + ") — a ventilação precisará de ramal próprio", [cop.id], { tipo: "ajustar", ids: [cop.id] });
        decide("amb.caixa_sifonada", "Caixa " + pc.dn + " em (" + f2(L.x) + "; " + f2(L.z) + "), " + f2(L.dBacia) + " m da saída da bacia" + (lim ? " (máximo ao ponto ventilado " + f2(lim.v) + " m, DN " + pc.saida + ")" : "") + "; recebe " + recept.map(function (r) { return r.ref; }).join(", ") + " (" + uhc + " UHC, corpo ≥ " + (corpo == null ? "pendente" : corpo) + ").");
      }
    }
    if (caixa) out.caixaSifonada = out.caixaSifonada || { id: caixa.id, x: caixa.x, z: caixa.z, dn: caixa.dn, existente: true };

    /* 4) DESTINOS */
    var tetoA = K._int.tetoDe(estado, baciaEs || M.fams[0], piso);
    var destinos = {}, ancora = baciaEs || (aparelhos[0] && aparelhos[0].conectores[0]) || M.fams[0];
    var gerados = {}; vivas(opsLimpo).forEach(function (o) { if (o && o.id != null && (o.kit != null || o.amb != null) && o.op !== "apagar") gerados[o.id] = 1; });
    /* ⚠ PRÉDIO: no TÉRREO, o tubo de queda que desce dos andares de cima NÃO recebe o térreo (a base do TQ é zona de
       sobrepressão — critério do projetista, declarado): o térreo sai pela espera própria até a rede */
    var tqPredio = false;
    var tqs = verticais(estado, "esgoto", gerados).filter(function (v) {
      if (!(d2(v, ancora) <= geo(par, "raioAmbiente") && v.yBase < piso - EPS && v.yTopo > piso + EPS)) return false;
      if (terreo && v.yTopo > tetoA.y + geo(par, "margemVent")) { tqPredio = true; return false; }
      return true;
    }).sort(function (a, b) { return d2(a, ancora) - d2(b, ancora); });
    if (tqPredio) decide("amb.terreo_espera", "Térreo: o esgoto sai pela espera própria até a rede, não pelo pé do tubo de queda dos andares de cima (zona de sobrepressão na base do TQ — critério do projetista).");
    var esperaEs = null, ciUser = null, movidas = [], ciMov = {};
    /* as caixas do modelo (peças e famílias), para a caixa movida para fora não cair em cima de outra */
    function caixasDoModelo(est, menos) {
      var o = [];
      arr(est.instalacoes && est.instalacoes.pecas).forEach(function (k) { if (/^caixa_|^ralo_/.test(k.peca) && String(k.id) !== String(menos)) o.push({ x: k.x, z: k.z, r: num((B.PECAS[k.peca] || {}).r, 0) }); });
      dispositivosFamilia(est).forEach(function (q) { if (String(q.id) !== String(menos)) o.push({ x: num(q.f.x, 0), z: num(q.f.z, 0), r: num((B.PECAS[q.tipo] || {}).r, 0.15) }); });   // hid:ok raio padrão de caixa sem peça equivalente
      return o;
    }
    /* ⚠ COTA DE CONTROLE do esgoto (19/10/2026): o tubo que entra na caixa de inspeção pela parede tem o topo a `folgaTampaCaixa`
       abaixo da laje da tampa (y da caixa − tampa − folga). O motor (js/hidrota.js, destino.entradaMax(dn)) parte DESSA cota e sobe
       com a declividade do DN: o ramal inteiro já nasce na profundidade da caixa — nada de degrau nem joelho perto dela. */
    function entradaMaxCaixa(y, tipoCaixa, tampa) {
      var CIt = dep("HidCI", "./hidcigeo.js"), et = CIt && CIt.escolher ? CIt.escolher(tipoCaixa || "alvenaria", 0, tampa || "concreto") : null;
      var topo = r4(num(y, 0) - num((et && et.desenho ? et.desenho : {}).tampa_m, 0) - geo(par, "folgaTampaCaixa"));
      var tab = {}; B.MATERIAIS.pvc_esgoto.dns.forEach(function (dn) { tab[dn] = r4(topo - raio(dn)); });
      return tab;
    }
    /* idem para a espera: a 1ª caixa que a rede (js/hidrede.js) põe lá — a entrada dela, por DN (o tipo e a tampa vêm dos parâmetros
       e da linha da rede mais perto, como no HidRede.gerar).
       ⚠ (revisão 19/10/2026) a TAMPA dessa caixa não fica no piso do ambiente: a rede a põe no nível do ponto (js/hidnivel.js —
       calçada, terreno; referência = HidRede.terrenoDe). Com a entrada calculada no piso, o terreno 5 cm abaixo dele já fazia a
       rede descer 4 cm na espera (o degrau que a cota de controle tira) — tools/test-hid-esgoto-cota.js [E] */
    function entradaMaxRede(pE, piso) {
      var LRx = dep("HidRede", "./hidrede.js"), HNx = dep("HidNivel", "./hidnivel.js"), tab = {}, L0 = null, dL = Infinity;
      if (!LRx || !LRx.yMaxEntrada) return null;
      if (LRx._int) arr(estado.hidRedes).forEach(function (r) { var q = LRx._int.projetar(LRx._int.linha(arr(r.pontos)), pE); if (q && q.d < dL) { dL = q.d; L0 = r; } });
      var parT = copia(par); if (L0 && L0.cotaTerreno != null) parT.cotaTerreno = L0.cotaTerreno;
      var Tr = LRx.terrenoDe ? LRx.terrenoDe(estado, parT) : null, yT = piso;
      if (Tr && HNx && HNx.em) { var Nv = HNx.em(estado, pE, Tr.y, par); if (Nv && isFinite(Nv.y)) yT = Nv.y; }
      B.MATERIAIS.pvc_esgoto.dns.forEach(function (dn) { var y = LRx.yMaxEntrada(par, dn, yT, L0 || {}); if (isFinite(y)) tab[dn] = r4(y); });
      return Object.keys(tab).length ? tab : null;
    }
    /* a caixa de inspeção do usuário (peça do traçado ou família: hid-caixa-inspecao, Tigre/Amanco do escritório) mais perto */
    function caixaInspecaoDoUsuario(est, p) {
      var Pci = B.PECAS.caixa_inspecao, R0 = geo(par, "raioCaixaGordura"), cands = [];
      arr(est.instalacoes && est.instalacoes.pecas).forEach(function (k) { if (k.peca === "caixa_inspecao" && d2(k, p) <= R0) cands.push({ id: String(k.id), x: k.x, y: k.y, z: k.z, prof: num(k.prof, Pci.prof), peca: k }); });
      dispositivosFamilia(est).forEach(function (q) {
        if (q.tipo !== "caixa_inspecao" || d2(q.f, p) > R0) return;
        var c = { id: q.id, x: r4(num(q.f.x, 0)), y: r4(num(q.f.y, 0)), z: r4(num(q.f.z, 0)), prof: Pci.prof };
        c.converter = [{ op: "apagar", id: q.id, amb: ambId, ambParte: "reaproveitada" }, { op: "peca", id: q.id, peca: "caixa_inspecao", sistema: "esgoto", dn: Pci.dn, x: c.x, y: c.y, z: c.z, prof: c.prof, amb: ambId, ambParte: "reaproveitada", deFamilia: { famId: q.f.famId, tipoId: q.f.tipoId } }];
        cands.push(c);
      });
      cands.sort(function (a, b) { return d2(a, p) - d2(b, p); });
      var c0 = cands[0] || null, I = HI();
      if (c0 && ciMov[c0.id]) { c0.x = ciMov[c0.id].x; c0.z = ciMov[c0.id].z; c0.movida = ciMov[c0.id]; if (c0.converter) { c0.converter[1].x = c0.x; c0.converter[1].z = c0.z; } return c0; }
      /* ⚠ PADRÃO (docs/hidro/PADRAO-IMPLANTACAO-ESGOTO.md, correção do Rogério 18/10/2026): caixa de inspeção é da ÁREA
         EXTERNA — a que está DENTRO de um ambiente (print 21: a CI 600 no banheiro) vai para fora, junto à parede externa
         mais perto do ambiente, no mesmo lote do traçado (Ctrl+Z desfaz) */
      if (c0 && I) {
        var dIn = I.dentro(est, c0, { parametros: par });
        if (dIn.dentro) {
          /* o lugar da caixa de GORDURA (fora da parede da cozinha, atrás da pia) fica reservado: ela é que precisa estar ali */
          var evC = caixasDoModelo(est, c0.id), cPia = null;
          aparelhos.forEach(function (a) { if (a.aparelho === "pia_cozinha" && !cPia) cPia = a.conectores.filter(function (c) { return c.sistema === "esgoto"; })[0] || null; });
          var resCG = cPia ? I.posicaoExterna(est, cPia, { raio: 0.15, afast: num(par.afastamentoCaixaGordura, I.GEO_IMP.afastamentoCaixaGordura), parametros: par, evitar: evC }) : null;   // hid:ok o raio da caixa de gordura padrão (DN300) e o recuo do HidRota
          if (resCG) evC.push({ x: resCG.x, z: resCG.z, r: 0.15 });   // hid:ok idem
          var pe = I.posicaoExterna(est, p, { raio: num(Pci.r, 0), parametros: par, evitar: evC });
          if (!pe) { pend("amb.caixa_inspecao.dentro", "a caixa de inspeção " + c0.id + " está dentro de ambiente (" + dIn.motivo + ") e não achei lugar do lado de fora: mova-a para a área externa", [c0.id], { tipo: "ajustar", ids: [c0.id] }); return c0; }
          if (c0.converter) c0.converter[1].x = pe.x, c0.converter[1].z = pe.z;
          else movidas.push({ op: "mover", id: c0.id, cx: pe.x, cz: pe.z, amb: ambId, ambParte: "reaproveitada" });
          aviso("caixa de inspeção " + c0.id + " estava DENTRO de ambiente (" + dIn.motivo + "): movida para fora, " + pe.motivo + " — caixas de inspeção ficam na área externa (padrão; NBR 8160 4.2.6)", [c0.id], { tipo: "ajustar", ids: [c0.id], texto: "Mover para fora" });
          decide("amb.caixa_inspecao", "A caixa de inspeção " + c0.id + " estava dentro de ambiente: foi para fora, " + pe.motivo + ".");
          c0.x = pe.x; c0.z = pe.z; c0.movida = pe; ciMov[c0.id] = pe;
        }
      }
      return c0;
    }
    if (tqs.length) {
      destinos.esgoto = { tipo: "tubo_queda", id: tqs[0].id, x: tqs[0].x, z: tqs[0].z, yBase: tqs[0].yBase, yTopo: tqs[0].yTopo, existente: true,
        ventilado: verticais(estado, "ventilacao", gerados).some(function (v) { return d2(v, tqs[0]) <= B.TOL && v.yBase <= tqs[0].yTopo + B.TOL; }) };
    } else if (terreo && !redesDoUsuario(estado).length && (ciUser = caixaInspecaoDoUsuario(estado, ancora))) {
      /* a CAIXA DE INSPEÇÃO que o usuário pôs lá fora (sem linha da rede desenhada): o ramal do ambiente vai até ELA. A família
         vira a peça do traçado (o cilindro de captura recebe tubo em qualquer cota) e a profundidade sai do traçado */
      if (ciUser.converter) { ciUser.converter.forEach(function (o) { novas.push(o); }); }
      movidas.forEach(function (o) { novas.push(o); }); movidas = [];
      obst.familias = arr(obst.familias).filter(function (v) { return String(v.id) !== ciUser.id; });   /* a família vai virar a peça: não é obstáculo */
      destinos.esgoto = { tipo: "ponto", id: ciUser.id, conector: { x: ciUser.x, y: piso, z: ciUser.z, dn: B.MATERIAIS.pvc_esgoto.dn }, cotaLivre: true, entradaMax: entradaMaxCaixa(ciUser.y, ciUser.tipoCaixa, ciUser.tampa),
        /* a profundidade da caixa dele: o motor avisa quando o tubo chega abaixo do fundo (caixa rasa) — js/hidrota.js, cota pelo fluxo */
        topo: ciUser.y, fundo: isFinite(num(ciUser.prof, NaN)) ? r4(num(ciUser.y, 0) - num(ciUser.prof, 0)) : null };
      decide("amb.caixa_inspecao", "O ramal do ambiente vai até a caixa de inspeção " + ciUser.id + " que já está no modelo.");
      out.caixaInspecaoUsuario = ciUser.id;
    } else if (terreo) {
      var pE = esperaFora(paredes, ancora, par, estado.hidRedes, estado);
      if (!pE) { pend("amb.espera_esgoto", "sem paredes no modelo para achar o lado de fora do ambiente: informe o destino do esgoto", ids, { tipo: "destino", sistema: "esgoto" }); }
      else { esperaEs = { x: pE.x, y: piso, z: pE.z }; destinos.esgoto = { tipo: "ponto", id: ambId + "-esp-es", conector: { x: pE.x, y: piso, z: pE.z, dn: B.MATERIAIS.pvc_esgoto.dn }, cotaLivre: true,
          /* a espera é onde a rede (js/hidrede.js) põe a 1ª caixa de inspeção: o ramal já chega na cota de entrada dela, sem a descida na espera */
          entradaMax: entradaMaxRede(pE, piso) }; }
    } else pend("amb.tubo_queda", "ambiente fora do térreo sem tubo de queda perto: ponha o TQ no shaft (ou use Replicar unidade, que alinha as prumadas)", ids, { tipo: "modelar", sistema: "esgoto", elemento: "tubo_queda" });
    /* a COLUNA DE VENTILAÇÃO do prédio (vertical de ventilação que passa pelo teto deste pavimento, fora do eixo de um TQ): o
       ventilador do ambiente vai até ela sob o teto, em vez de subir sozinho até a cobertura — inclusive no térreo do prédio */
    var eixosTQ = verticais(estado, "esgoto", gerados);
    var cvs = verticais(estado, "ventilacao", gerados).filter(function (v) { return d2(v, ancora) <= geo(par, "raioAmbiente") && v.yBase < tetoA.y && v.yTopo > tetoA.y && !eixosTQ.some(function (t) { return d2(t, v) <= B.TOL; }); }).sort(function (a, b) { return d2(a, ancora) - d2(b, ancora); });
    if (cvs.length && (tqs.length || tqPredio)) destinos.ventilacao = cvs[0];
    var cols = verticais(estado, "agua_fria", gerados).filter(function (v) { return d2(v, ancora) <= geo(par, "raioAmbiente"); }).sort(function (a, b) { return d2(a, ancora) - d2(b, ancora); });
    function destinoAF(E) { return { tipo: "ponto", id: ambId + "-esp-af", x: E.x, y: E.y, z: E.z, conector: { x: E.x, y: E.y, z: E.z, dn: B.MATERIAIS.pvc_soldavel.dn } }; }
    var esperaAlt = null;
    var juntar = null, temAF = aparelhos.some(function (a) { return a.conectores.some(function (c) { return c.sistema === "agua_fria"; }); }), aRG = K.altura("RG"), esperaAF = null;
    if (temAF) {
      /* o kit da válvula já sobe uma prumada própria: a espera do ambiente fica ao lado dela, na ponta da parede molhada
         oposta aos aparelhos (o ramal corre reto pela parede até todos) */
      var colKit = kitOps.filter(function (o) { return /-vd-ramal$/.test(txt(o.id)); })[0];
      if (cols.length && !(colKit && cols[0].id === colKit.id)) destinos.agua_fria = { tipo: "coluna", id: cols[0].id, x: cols[0].x, z: cols[0].z, yBase: cols[0].yBase, yTopo: cols[0].yTopo, existente: true };
      else {
        var base = colKit ? { x: colKit.p1.x, z: colKit.p1.z } : null, nW = null, baseEixo = null;
        if (!base) { var a0 = aparelhos.filter(function (a) { return a.conectores.some(function (c) { return c.sistema === "agua_fria" && c.parede; }); })[0]; var c0 = a0 ? a0.conectores.filter(function (c) { return c.sistema === "agua_fria" && c.parede; })[0] : null; if (c0) { nW = c0.parede; var eW = geo(par, "embutir") + Math.max(0, num(c0.parede.d, 0)); base = { x: r4(c0.x + c0.parede.x * eW), z: r4(c0.z + c0.parede.z * eW) };
          /* o EIXO da parede atrás do ponto (a alternativa da espera desce nele: FRENTE H1, ver abaixo) — a busca da parede pela FACE */
          var dF0 = Math.max(0, num(c0.parede.d, 0)), wF0 = K._int.paredeDe(estado, { x: c0.x + c0.parede.x * dF0, z: c0.z + c0.parede.z * dF0 }, null);
          if (wF0) { var eA0 = dF0 + wF0.esp / 2; baseEixo = { x: r4(c0.x + c0.parede.x * eA0), z: r4(c0.z + c0.parede.z * eA0) }; } } }   /* o mesmo eixo embutido do HidRota (normEntrada: embutir + d) — com a louça longe da parede, a parede DE VERDADE */
        else { var cb = K._int.conectores(avaliarFam, M.fams.filter(function (f) { return String(f.id) === String(colKit.kit); })[0] || M.fams[0]).filter(function (c) { return c.parede; })[0]; nW = cb ? cb.parede : null; }
        if (base && nW) {
          /* ⚠ a espera do ambiente fica na PONTA da fileira de pontos, nunca entre eles: entre dois pontos o 2º não acha
             derivação (o tronco perto do registro é proibido de receber derivação) e a estratégia "parede" caía — a área de
             serviço (tanque e máquina) ficava sem traçado. Afastamento = registro + folgas do traçado; do lado da válvula
             quando há (a prumada dela fica fora do ramal), e nunca em cima dela. */
          var tg = { x: -nW.z, z: nW.x }, ts = [], tV = colKit ? 0 : null;
          aparelhos.forEach(function (a) { a.conectores.forEach(function (c) { if (c.sistema === "agua_fria") ts.push((c.x - base.x) * tg.x + (c.z - base.z) * tg.z); }); });
          var gap = geo(par, "distanciaRegistro") + B.ACESSORIO_PADRAO / 2 + geo(par, "margemNo") * 2 + geo(par, "passo"), lat = geo(par, "lateralEntradaAF");
          var tMin = ts.length ? Math.min.apply(null, ts) : 0, tMax = ts.length ? Math.max.apply(null, ts) : 0;
          var cands = [{ t: tMin - gap, lado: -1 }, { t: tMax + gap, lado: 1 }].filter(function (c) {
            var ax = { x: base.x + tg.x * c.t, z: base.z + tg.z * c.t }, face = { x: ax.x - nW.x * geo(par, "embutir"), z: ax.z - nW.z * geo(par, "embutir") }, w = K._int.paredeDe(estado, face, null);
            if (!w) return false;
            var wu = { x: w.p2.x - w.p1.x, z: w.p2.z - w.p1.z }, Lw = Math.sqrt(wu.x * wu.x + wu.z * wu.z), tw = ((face.x - w.p1.x) * wu.x + (face.z - w.p1.z) * wu.z) / Lw;
            var mg = geo(par, "afastParede") + w.esp / 2 + (colKit ? lat : 0);   /* longe da ponta da parede (canto); com válvula, cabe o barrilete curto */
            if (tw < mg || tw > Lw - mg) return false;
            if (tV != null && Math.abs(c.t - tV) < geo(par, "afastamento") * 2) return false;   /* não em cima da prumada da válvula */
            return true;
          }).sort(function (a, b) { return tV != null ? Math.abs(a.t - tV) - Math.abs(b.t - tV) : Math.abs(a.t) - Math.abs(b.t); });
          var tE0, tAlt = null;
          if (cands.length) { tE0 = cands[0].t; if (cands[0].lado < 0) tg = { x: -tg.x, z: -tg.z }, tE0 = -tE0; }
          else {
            /* sem lugar na ponta: ao lado da referência, do lado dos aparelhos (o traçado avisa se não fechar) */
            var cm = ts.length ? ts.reduce(function (a, b) { return a + b; }, 0) / ts.length : 0;
            if (cm < 0) tg = { x: -tg.x, z: -tg.z };
            /* FRENTE H1 (20/10/2026): a ALTERNATIVA longe o bastante da referência para o REGISTRO e a faixa sem derivação depois
               dele caberem ANTES dela (o `gap` da ponta da fileira + um passo da grade + a distância entre nós). Com a `lat` o
               registro cai na projeção do ponto de referência: com o eixo embutido da bacia girada na parede de verdade, o ramal
               dela contornava o registro e CRUZAVA o tronco ("registro sem tubo" — a tentativa anterior, planta em L). A `lat`
               continua a 1ª (a CASA fecha com ela); o traçado (5) troca para a alternativa só se a da `lat` cruzar a si mesma. */
            tE0 = lat;
            var gq = gap + geo(par, "passo") + geo(par, "margemNo"), qG = { x: base.x + tg.x * gq - nW.x * geo(par, "embutir"), z: base.z + tg.z * gq - nW.z * geo(par, "embutir") }, wG = colKit ? null : K._int.paredeDe(estado, qG, null);
            if (wG) {
              var wgu = { x: wG.p2.x - wG.p1.x, z: wG.p2.z - wG.p1.z }, Lg = Math.sqrt(wgu.x * wgu.x + wgu.z * wgu.z), tG = ((qG.x - wG.p1.x) * wgu.x + (qG.z - wG.p1.z) * wgu.z) / Lg, mgG = geo(par, "afastParede") + wG.esp / 2;
              if (tG >= mgG && tG <= Lg - mgG) tAlt = gq;
            }
            aviso("a espera de água do ambiente não coube na ponta da fileira de pontos: ficou ao lado da referência — confira o traçado", ids, { tipo: "destino", sistema: "agua_fria" });
          }
          var pE0 = { x: r4(base.x + tg.x * tE0), z: r4(base.z + tg.z * tE0) }, tE = K._int.tetoDe(estado, { x: r4(pE0.x - nW.x * geo(par, "embutir")), z: r4(pE0.z - nW.z * geo(par, "embutir")) }, piso);
          esperaAF = { x: pE0.x, y: colKit ? r4(Math.max(colKit.p1.y, colKit.p2.y)) : r4(tE.y - geo(par, "folga")), z: pE0.z };
          /* a prumada exclusiva da válvula e a do ramal do banheiro se juntam sob a laje num ponto de espera ÚNICO do
             barrilete/coluna (um tê no topo da espera do banheiro): a válvula continua com ramal próprio (6.14.5) */
          if (colKit) juntar = { de: { x: colKit.p1.x, y: esperaAF.y, z: colKit.p1.z }, tg: tg, dn: Math.max(num(colKit.dn, 0), B.MATERIAIS.pvc_soldavel.dn) };
          tetoA = tE;
          destinos.agua_fria = destinoAF(esperaAF);
          if (tAlt != null) {
            var bA = baseEixo || base, pA = { x: r4(bA.x + tg.x * tAlt), z: r4(bA.z + tg.z * tAlt) }, tEA = K._int.tetoDe(estado, { x: r4(pA.x - nW.x * geo(par, "embutir")), z: r4(pA.z - nW.z * geo(par, "embutir")) }, piso);
            if (Math.abs(tEA.y - tE.y) < EPS) esperaAlt = { x: pA.x, y: esperaAF.y, z: pA.z };   /* o mesmo teto: a mesma altura de espera */
          }
          decide("amb.agua", "Espera do ambiente em " + f2(esperaAF.y) + " m (" + tetoA.origem + "), ramal a " + (aRG.ok ? f2(aRG.valor) : "?") + " m do piso.");
        } else pend("amb.agua", "sem parede atrás dos pontos de água para embutir a entrada do ramal: indique a coluna de água fria", ids, { tipo: "destino", sistema: "agua_fria" });
      }
    }

    /* 5) TRAÇADO (HidRota) */
    var parR = { terreo: terreo, prefixo: ambId + "-", peDireito: r4(tetoA.y - piso), estrategias: terreo ? ["parede", "piso"] : ["parede", "piso", "forro"] };
    if (aRG.ok) parR.alturaRamalAF = aRG.valor;
    Object.keys(par).forEach(function (k) { if (HR().GEO[k] != null && par[k] != null) parR[k] = par[k]; });
    /* o traçado do ambiente com uma caixa sifonada (a escolhida ou uma alternativa) e destinos dados */
    function rotearCom(cxP, dest) {
      var opsModelo = soInst(opsLimpo).concat(novas.filter(function (o) { return o.op === "peca" && o.ambParte !== "caixa_sifonada"; })).concat(cxP && cxP._op ? [cxP._op] : []);
      var pecasRota = pecas.map(function (k) { return { id: k.id, peca: k.peca, sistema: "esgoto", dn: k.dn, x: k.x, y: k.y, z: k.z, grupo: "1" }; });
      if (cxP && !pecas.some(function (k) { return k.id === cxP.id; })) pecasRota.push({ id: cxP.id, peca: cxP.peca, sistema: "esgoto", dn: cxP.dn, x: cxP.x, y: cxP.y, z: cxP.z, grupo: "1" });
      var en = { aparelhos: aparelhos, pecas: pecasRota, caixasGordura: cgsRota, obstaculos: obst, destinos: dest, grupos: [{ id: "1", piso: piso }], piso: piso, parametros: parR, opsModelo: opsModelo };
      try { return H.propor(en); } catch (eR) { pend("amb.rota", "o traçado falhou: " + (eR && eR.message ? eR.message : eR), ids); return null; }
    }
    /* FRENTE H1 (20/10/2026): a ÁGUA do traçado cruza a si mesma? Dois trechos horizontais de água na mesma cota (a soma dos
       raios) que se atravessam em planta pelo MEIO dos dois (fora das pontas: ali é tê/joelho) — tubo atravessando tubo, sem
       conexão. 0 = ok, 1 = cruza, 2 = sem opção. */
    function autoCruzaAF(ops) {
      var ts = arr(ops).filter(function (o) { return o.op === "trecho" && o.sistema === "agua_fria" && o.p1 && o.p2 && Math.abs(o.p1.y - o.p2.y) < EPS; });
      for (var i = 0; i < ts.length; i++) for (var j = i + 1; j < ts.length; j++) {
        var a = ts[i], b = ts[j], rr = raio(a.dn) + raio(b.dn); if (Math.abs(a.p1.y - b.p1.y) >= rr) continue;
        var ux = a.p2.x - a.p1.x, uz = a.p2.z - a.p1.z, vx = b.p2.x - b.p1.x, vz = b.p2.z - b.p1.z, den = ux * vz - uz * vx, La = Math.sqrt(ux * ux + uz * uz), Lb = Math.sqrt(vx * vx + vz * vz);
        if (Math.abs(den) < EPS || !(La > B.TOL) || !(Lb > B.TOL)) continue;   /* paralelos (encostar é a regra do afastamento) */
        var wx = b.p1.x - a.p1.x, wz = b.p1.z - a.p1.z, t = (wx * vz - wz * vx) / den, u = (wx * uz - wz * ux) / den;
        if (t * La > B.TOL && (1 - t) * La > B.TOL && u * Lb > B.TOL && (1 - u) * Lb > B.TOL) return true;
      }
      return false;
    }
    /* a água desta opção × o esgoto que já está no modelo (e o esgoto dela × a água que já está): o HidCriterios só com esses tubos,
       no escopo dos da opção (o cruzamento entre dois tubos existentes não é desta rota) */
    function aguaSobEsgotoExistente(opsO) {
      var Hc = dep("HidCriterios", "./hidcriterios.js"); if (!Hc || !Hc.auditar) return [];
      var LIQ_E = { esgoto: 1, pluvial: 1, dreno: 1 }, AG_E = { agua_fria: 1, agua_quente: 1 };
      var novosT = arr(opsO).filter(function (o) { return o.op === "trecho" && (LIQ_E[o.sistema] || AG_E[o.sistema]); });
      var exist = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return (LIQ_E[t.sistema] || AG_E[t.sistema]) && String(t.id).indexOf(ambId + "-") !== 0; });
      if (!novosT.length || !exist.length) return [];
      var temA = novosT.some(function (t) { return AG_E[t.sistema]; }) || exist.some(function (t) { return AG_E[t.sistema]; });
      if (!temA) return [];
      function tt(t) { return { id: String(t.id), sistema: t.sistema, dn: t.dn, material: t.material, p1: t.p1, p2: t.p2 }; }
      var A = null;
      try { A = Hc.auditar({ trechos: novosT.map(tt).concat(exist.map(tt)), escopo: novosT.map(function (t) { return String(t.id); }), piso: piso, obstaculos: { lajes: arr(obstTodos && obstTodos.lajes) } }); }   /* todas as lajes do modelo (não só as do pavimento): a isenção "laje entre os dois" (revisão 20/10) */ catch (eC) { return []; }
      return arr(A && A.apontamentos).filter(function (a) { return a.regra === "interferencia.aguaSobEsgoto"; });
    }
    function notaAF(Rx) { return !Rx || !Rx.opcoes.length ? 2 : (autoCruzaAF(Rx.opcoes[0].ops) ? 1 : 0); }
    var csOp = novas.filter(function (o) { return o.ambParte === "caixa_sifonada"; })[0] || null;
    if (caixa && csOp) caixa._op = csOp;
    /* a CAIXA DE GORDURA que o usuário pôs (família do OrçaPRO ou do escritório; dentro ou fora da casa — fora é o normal): a pia
       liga NELA (o HidRota não propõe outra). A entrada é o conector dela mais perto da pia. */
    var pias = aparelhos.filter(function (a) { return a.aparelho === "pia_cozinha"; }), cgsRota = [], cgUsadas = {};
    if (pias.length) {
      var pE = null; pias.forEach(function (pa) { pa.conectores.forEach(function (c) { if (c.sistema === "esgoto" && !pE) pE = c; }); });
      if (pE) dispositivosFamilia(estado).filter(function (q) { return q.tipo === "caixa_gordura" && d2(q.f, pE) <= geo(par, "raioCaixaGordura"); })
        .sort(function (a, b) { return d2(a.f, pE) - d2(b.f, pE); }).slice(0, 1).forEach(function (q) {
          var Ig = HI(), dCg = Ig ? Ig.dentro(estado, q.f, { parametros: par }) : { dentro: false };
          if (dCg.dentro) {
            /* ⚠ PADRÃO: a caixa de gordura fica do LADO DE FORA da parede da cozinha, perto da pia (print 21: ao lado da pia,
               dentro da cozinha). Vai para fora e GIRA: a ENTRADA (câmara receptora) para a pia, a SAÍDA (depois do septo)
               do lado oposto, para a rede */
            var avG = BI().volumesFamilias({ familias: [q.f] }, avaliarFam)[0], rG = avG ? Math.max(avG.hl, avG.hw) : 0.15;   // hid:ok raio padrão se a família não tiver volume
            var evG = caixasDoModelo(estado, q.id); Object.keys(ciMov).forEach(function (k) { evG.push({ x: ciMov[k].x, z: ciMov[k].z, r: num(B.PECAS.caixa_inspecao.r, 0) }); });
            var peG = Ig.posicaoExterna(estado, pE, { raio: rG, afast: Math.max(rG + 0.1, num(par.afastamentoCaixaGordura, Ig.GEO_IMP.afastamentoCaixaGordura)), parametros: par, evitar: evG });   // hid:ok o recuo da caixa de gordura do HidRota
            if (!peG) { pend("amb.caixa_gordura.dentro", "a caixa de gordura " + q.id + " está dentro de ambiente (" + dCg.motivo + ") e não achei lugar do lado de fora da parede da cozinha: mova-a", [q.id], { tipo: "ajustar", ids: [q.id] }); return; }
            var fM = copia(q.f); fM.x = peG.x; fM.z = peG.z;
            var melhorR = null;
            [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(function (rt) { fM.rotY = rt; var e1 = K._int.conectores(avaliarFam, fM).filter(function (c) { return c.sistema === "esgoto" && c.cid === "entrada"; })[0]; if (e1 && (!melhorR || d2(e1, peG.pe) < melhorR.d - EPS)) melhorR = { rt: rt, d: d2(e1, peG.pe) }; });
            fM.rotY = r4(melhorR ? melhorR.rt : num(q.f.rotY, 0));
            novas.push({ op: "mover", id: q.id, cx: peG.x, cz: peG.z, amb: ambId, ambParte: "reaproveitada" });
            if (Math.abs(fM.rotY - num(q.f.rotY, 0)) > EPS) novas.push({ op: "instancia", id: q.id, rotY: fM.rotY, amb: ambId, ambParte: "reaproveitada" });
            obst.familias = arr(obst.familias).filter(function (v) { return String(v.id) !== String(q.id); });
            aviso("caixa de gordura " + q.id + " estava DENTRO de ambiente (" + dCg.motivo + "): movida para fora da parede da cozinha, " + peG.motivo + ", com a entrada virada para a pia e a saída do lado oposto (padrão; NBR 8160 5.1.5)", [q.id], { tipo: "ajustar", ids: [q.id], texto: "Mover para fora" });
            q.f = fM;
          }
          var cs = K._int.conectores(avaliarFam, q.f).filter(function (c) { return c.sistema === "esgoto"; });
          var ent = cs.filter(function (c) { return c.cid === "entrada"; })[0] || cs.slice().sort(function (a, b) { return d2(a, pE) - d2(b, pE); })[0];
          if (!ent) { aviso("a caixa de gordura " + q.id + " não tem ponto de entrada de esgoto na família: a pia não liga nela", [q.id], { tipo: "ajustar", ids: [q.id] }); return; }
          cgsRota.push({ id: q.id, grupo: "1", cotaLivre: true, conectores: [{ id: "entrada", sistema: "esgoto", dn: ent.dn, x: ent.x, y: ent.y, z: ent.z }] });
          cgUsadas[q.id] = { f: q.f, entrada: ent, cs: cs };
          decide("amb.caixa_gordura", "A pia liga na caixa de gordura " + q.id + " que já está no modelo" + (poli && !K._int.ambienteDe({ ambientes: [{ calc: { contorno: poli } }] }, q.f) ? " (fora do cômodo, como deve ser)" : "") + ".");
        });
    }
    /* sem caixa de gordura no modelo: a proposta do HidRota vai ao LUGAR DO PADRÃO — fora da parede da cozinha, perto da pia
       (antes: o lado da caixa envolvente da obra, que podia cair longe da cozinha) */
    if (pias.length && !cgsRota.length && HI() && !(par.areaTecnica)) {
      var pP = null; pias.forEach(function (pa) { pa.conectores.forEach(function (c) { if (c.sistema === "esgoto" && !pP) pP = c; }); });
      var peP = pP ? HI().posicaoExterna(estado, pP, { raio: 0.15, afast: num(par.afastamentoCaixaGordura, HI().GEO_IMP.afastamentoCaixaGordura), parametros: par }) : null;   // hid:ok o raio da caixa de gordura padrão (DN300) e o recuo do HidRota
      if (peP) { parR.areaTecnica = { x: peP.x, z: peP.z }; decide("amb.caixa_gordura", "Caixa de gordura proposta do lado de fora da parede da cozinha, " + peP.motivo + "."); }
    }
    var R = null, esperaCG = false;
    if (destinos.esgoto || destinos.agua_fria) {
      R = rotearCom(caixa, destinos);
      /* FRENTE H1 (20/10/2026): a espera "ao lado da referência" cuja água CRUZA a si mesma (dois tubos do ramal na mesma cota se
         atravessando, sem conexão: o ramal da bacia girada contornando o registro) vai para a alternativa longe da referência —
         só se ela fechar melhor (com opção e sem cruzar) */
      if (esperaAlt && notaAF(R) > 0) {
        var dAlt = copia(destinos); dAlt.agua_fria = destinoAF(esperaAlt);
        var RA = rotearCom(caixa, dAlt);
        if (notaAF(RA) < notaAF(R)) { R = RA; destinos = dAlt; esperaAF = esperaAlt; decide("amb.agua", "Espera afastada da referência, em (" + f2(esperaAlt.x) + "; " + f2(esperaAlt.z) + "), para o registro caber antes do 1º ponto (ao lado dela o ramal cruzava o próprio tronco)."); }
      }
      /* ⚠ a caixa sifonada nasce no ponto de MENOR TRAÇADO REAL entre os melhores candidatos: a soma das distâncias
         enganava — o ralo do box dava a volta pela frente da caixa (print do banheiro da etapa 1) */
      var alts = csOp && R && R.opcoes.length && typeof L !== "undefined" && L && L.alternativas ? L.alternativas : [];
      /* o caminho da caixa pelo tubo até o ramal da bacia (onde a ventilação entra): dentro do limite da 8160 vale mais que
         qualquer economia de tubo (senão a caixa ganha ramal de ventilação próprio) */
      var limCS = out.caixaSifonada && out.caixaSifonada.limite != null ? out.caixaSifonada.limite - geo(par, "margemVent") : null;
      function alcance(Rx, cxP) {
        if (!baciaEs || limCS == null || !Rx || !Rx.opcoes.length) return 0;
        var trs = Rx.opcoes[0].ops.filter(function (o) { return o.op === "trecho" && o.sistema === "esgoto"; }), G = grafoEs(trs);
        var nb = G.noEmPlanta(baciaEs, B.TOL_CONECTOR, baciaEs.y), nc = G.noSaidaEm(cxP, B.PECAS[cxP.peca].captura, cxP.y); if (nb == null || nc == null) return 1;
        var caminhoB = {}; G.jusante(nb).forEach(function (c) { caminhoB[c.e.a] = 1; caminhoB[c.e.b] = 1; });
        var Lc = 0, ok = false; G.jusante(nc).some(function (c) { if (caminhoB[c.e.a]) { ok = true; return true; } Lc += c.e.L; return false; });
        return ok && Lc <= limCS + EPS ? 0 : 1;
      }
      var foraR = alcance(R, caixa);
      alts.forEach(function (k) {
        var op2 = copia(csOp); op2.x = k.x; op2.z = k.z; if (HNa) op2.y = HNa.em(estado, k, piso, par).y;
        var cx2 = B.normPeca(op2); cx2._op = op2;
        var R2 = rotearCom(cx2, destinos), fora2 = alcance(R2, cx2);
        if (R2 && R2.opcoes.length && (fora2 < foraR || (fora2 === foraR && R2.opcoes[0].custo < R.opcoes[0].custo - EPS))) {
          foraR = fora2;
          R = R2; caixa = cx2; csOp.x = k.x; csOp.z = k.z;
          out.caixaSifonada.x = k.x; out.caixaSifonada.z = k.z; out.caixaSifonada.dBacia = k.dBacia;
          out.decisoes.forEach(function (d) { if (d.id === "amb.caixa_sifonada") d.texto = d.texto.replace(/em \([^)]*\), [0-9,]+ m da saída/, "em (" + f2(k.x) + "; " + f2(k.z) + "), " + f2(k.dBacia) + " m da saída"); });   // hid:ok texto (regex de reescrita da decisão)
        }
      });
      if (csOp) out.caixaSifonada.avaliadas = 1 + alts.length;
      /* VIGA BALDRAME no caminho do ramal que sai do ambiente (térreo): por baixo = o ambiente inteiro desce a diferença
         (a raiz do traçado fica mais funda e as descidas dos aparelhos crescem); atravessar = furo marcado */
      var LR = dep("HidRede", "./hidrede.js"), modoB = par.baldrameModo || (arr(estado.hidRedes)[0] || {}).baldrame || "por_baixo";
      if (LR && R && R.opcoes.length && esperaEs) {
        var BL = LR.baldrames(estado, par), cruz = [];
        R.opcoes[0].ops.forEach(function (o) { if (o.op === "trecho" && o.sistema === "esgoto") LR.cruzamentos(o.p1, o.p2, raio(o.dn), BL.lista).forEach(function (q) { q.trecho = o; cruz.push(q); }); });
        /* só o que ATRAVESSA a viga se resolve descendo; o que corre dentro da faixa dela (a descida embutida na parede, o
           trecho sob a parede) vai como aviso para o estrutural, abaixo do topo da viga */
        var dentroF = cruz.filter(function (q) { return !q.atravessa && Math.min(q.trecho.p1.y, q.trecho.p2.y) - raio(q.trecho.dn) < q.b.yTopo - EPS; });
        cruz = cruz.filter(function (q) { return q.atravessa; });
        if (dentroF.length) aviso("tubo de esgoto dentro da faixa da viga baldrame " + uniqB(dentroF) + " (" + dentroF.map(function (q) { return q.trecho.id; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length + " trecho(s): descida embutida ou trecho sob a parede abaixo do topo da viga) — verificar com o projeto estrutural", dentroF.map(function (q) { return q.b.id; }), { tipo: "ajustar" });
        out.baldrame = { origem: BL.origem, modo: modoB, cruzamentos: cruz.length, dentroDaFaixa: dentroF.length };
        if (cruz.length && modoB === "por_baixo") {
          var folgaB = LR.GEO_REDE.folgaBaldrame, falta = Math.max.apply(null, cruz.map(function (q) { return q.y + raio(q.trecho.dn) + folgaB - q.b.yBase; }));
          if (falta > EPS) {
            var raiz = null; R.opcoes[0].ops.forEach(function (o) { if (o.op === "trecho" && o.sistema === "esgoto") ["p1", "p2"].forEach(function (kk) { if (d2(o[kk], esperaEs) <= B.TOL) raiz = o[kk].y; }); });
            if (raiz != null) {
              var dest2 = copia(destinos); dest2.esgoto = { tipo: "ponto", id: destinos.esgoto.id, conector: { x: esperaEs.x, y: chao4(raiz - falta), z: esperaEs.z, dn: destinos.esgoto.conector.dn } };
              var R3 = rotearCom(caixa, dest2);
              if (R3 && R3.opcoes.length) { R = R3; destinos = dest2; decide("amb.baldrame", "O ramal que sai do ambiente cruza a viga baldrame " + uniqB(cruz) + ": o traçado desceu " + f2(falta) + " m para passar POR BAIXO com " + f2(folgaB) + " m de folga (padrão)."); }
              else pend("amb.baldrame", "o ramal cruza a viga baldrame " + uniqB(cruz) + " e não coube descer " + f2(falta) + " m — use 'atravessar com tubo-camisa' ou mova a espera", ids, { tipo: "parametro", campo: "baldrameModo", valor: "atravessar" });
            }
          }
        } else if (cruz.length && modoB === "atravessar") {
          var nF = 0;
          cruz.forEach(function (q) {
            novas.push({ op: "anotar", id: ambId + "-furo" + (++nF), x: q.ponto.x, y: r4(q.b.yTopo + LR.GEO_REDE.folgaBaldrame), z: q.ponto.z, texto: "Furo em viga baldrame " + q.b.id + ": tubo DN " + q.trecho.dn + " com tubo-camisa — verificar com o projeto estrutural", amb: ambId, ambParte: "furo" });
            aviso("furo em viga: verificar com o projeto estrutural — o ramal DN " + q.trecho.dn + " atravessa a viga " + q.b.id + " com tubo-camisa", [q.b.id], { tipo: "parametro", campo: "baldrameModo", valor: "por_baixo" });
          });
          decide("amb.baldrame", "O ramal ATRAVESSA a viga baldrame " + uniqB(cruz) + " com tubo-camisa; furo marcado para o projeto estrutural.");
        }
      }
    }
    if (R) {
      out.normas = R.normas || [];
      out.descartadas = R.descartadas || [];
      if (!R.opcoes.length) {
        R.descartadas.forEach(function (d) { pend("amb.rota." + d.estrategia, d.nome + ": " + d.motivo, d.elementos, d.acao); });
        if (!R.descartadas.length) R.pendencias.forEach(function (p) { pend(p.chave, p.motivo || p.texto, p.elementos, p.acao); });
      } else {
        /* "Traçar automaticamente" (18/10/2026): o Tab da prévia troca a opção do traçado (parametros.opcaoRota; a 1ª = a mais barata) */
        var iOp = Math.max(0, Math.min(R.opcoes.length - 1, Math.floor(num(par.opcaoRota, 0)))), op = R.opcoes[iOp];
        /* FRENTE H1 (20/10/2026, R-C7/A14 do PADROES-PROJETO-RA): a ÁGUA ACIMA DO ESGOTO também contra o que JÁ está no modelo (o
           ramal do cômodo vizinho, a rede): o HidRota só confere a própria rota. A opção cuja água passa por baixo de um esgoto
           existente (ou cujo esgoto passa por cima de uma água existente) dá lugar à próxima que não passa (o desvio é outra
           estratégia); sem nenhuma, a escolhida fica com o AVISO de onde cruza e por quanto. A regra e a folga são as do
           HidCriterios (interferencia.aguaSobEsgoto, af2020.cruzamento_esgoto). */
        var cruzEx = function (o) { return aguaSobEsgotoExistente(o.ops); };
        var cx0 = cruzEx(op);
        if (cx0.length && par.opcaoRota == null) {
          for (var iO = 0; iO < R.opcoes.length; iO++) if (iO !== iOp && !cruzEx(R.opcoes[iO]).length) { decide("amb.cruzamento", "A opção " + op.nome + " passava a água por baixo do esgoto que já está no modelo (" + cx0.length + " cruzamento(s)): ficou a " + R.opcoes[iO].nome + "."); iOp = iO; op = R.opcoes[iO]; cx0 = []; break; }
        }
        cx0.forEach(function (a) { aviso("água por baixo do esgoto existente: " + a.texto + " Nenhuma opção do traçado evita — passe a água por cima (parede ou forro) ou aprofunde o esgoto", a.ids, { tipo: "ajustar", ids: a.ids.slice() }); });
        out.rota = { estrategia: op.estrategia, nome: op.nome, comprimento: op.comprimento, conexoes: op.conexoes, justificativa: op.justificativa, custo: op.custo, opcoes: R.opcoes.length, indice: iOp, nomes: R.opcoes.map(function (o) { return o.nome; }) };
        /* ⚠ ESGOTO É ÁRVORE: o toco que o traçado deixa com as DUAS pontas dentro da captura da mesma peça (ralo, caixa sifonada)
           é a própria saída da peça — no grafo as duas pontas viram o MESMO nó (laço): o esgoto "se dividia" ali e fechava um ciclo
           (casa demo: o ralo do box da suíte, a caixa da área de serviço — revisão da frente das pranchas, 18/10/2026). O toco sai;
           o trecho seguinte começa dentro da captura e continua ligado à peça. */
        var hubs = arr(estado.instalacoes && estado.instalacoes.pecas).map(function (k) { return k.hub; }).filter(Boolean);
        op.ops.concat(novas).forEach(function (o) { if (o.op === "peca") { var kk = B.normPeca(o); if (kk && kk.hub) hubs.push(kk.hub); } });
        var noHub = function (p, h) { return d2(p, h) <= h.r + EPS && p.y <= h.yTop + EPS && p.y >= h.yBot - EPS; };
        var tocoNaPeca = function (o) { return o.op === "trecho" && o.sistema === "esgoto" && hubs.some(function (h) { return noHub(o.p1, h) && noHub(o.p2, h); }); };
        op.ops.forEach(function (o) { if (tocoNaPeca(o)) return; var c = copia(o); c.amb = ambId; c.ambParte = "rota"; novas.push(c); });
        /* a SAÍDA da caixa de gordura (a do usuário ou a proposta pelo traçado): um toco de espera com declividade, que a linha
           da rede pega ("continua"). Sem ele a saída ficava solta e a pia não chegava à rede */
        /* a caixa de gordura do usuário DESCE até a cota que o traçado deu na entrada dela (instancia y): ele marcou o lugar */
        Object.keys(cgUsadas).forEach(function (id) {
          var cg = cgUsadas[id], yT = null;
          op.ops.forEach(function (o) { if (o.op === "trecho" && o.sistema === "esgoto") ["p1", "p2"].forEach(function (k) { if (d2(o[k], cg.entrada) <= B.TOL && (yT == null || o[k].y < yT)) yT = o[k].y; }); });
          if (yT == null) return;
          var dy = r4(yT - cg.entrada.y);
          if (Math.abs(dy) > EPS) {
            novas.push({ op: "instancia", id: id, y: r4(num(cg.f.y, 0) + dy), amb: ambId, ambParte: "reaproveitada" });
            cg.cs = cg.cs.map(function (c) { var c2 = copia(c); c2.y = r4(c.y + dy); return c2; }); cg.entrada = { x: cg.entrada.x, y: r4(cg.entrada.y + dy), z: cg.entrada.z, cid: cg.entrada.cid, dn: cg.entrada.dn };
            decide("amb.caixa_gordura", "A caixa " + id + " foi enterrada " + f2(-dy) + " m para a entrada ficar na cota do ramal da pia.");
          }
        });
        var cgsAqui = Object.keys(cgUsadas).map(function (id) { return cgUsadas[id]; });
        op.ops.forEach(function (o) { if (o.op === "familia" && o.famId === "hid-caixa-gordura") cgsAqui.push({ f: o, cs: K._int.conectores(avaliarFam, o).filter(function (c) { return c.sistema === "esgoto"; }) }); });
        cgsAqui.forEach(function (cg, ic) {
          var sai = cg.cs.filter(function (c) { return c.cid === "saida"; })[0] || cg.cs.filter(function (c) { return !(cg.entrada && c.cid === cg.entrada.cid); }).sort(function (a, b) { return num(b.dn, 0) - num(a.dn, 0) || a.y - b.y; })[0];
          if (!sai) return;
          var vx = sai.x - num(cg.f.x, 0), vz = sai.z - num(cg.f.z, 0), Lv = Math.sqrt(vx * vx + vz * vz) || 1, Le = geo(par, "esperaGordura"), dnS = num(sai.dn, 0) || 100;   // hid:ok DN 100 só se a família não disser
          /* ⚠ o toco de espera não entra na parede do bloco vizinho (corredor estreito entre blocos): encurta até a ponta ficar
             na área externa, com a folga da parede */
          var HIg = HI(), wsG = HIg ? HIg._int.paredes(estado) : [];
          while (HIg && Le > geo(par, "margemNo") && wsG.some(function (w) { var pp = { x: sai.x + vx / Lv * Le, z: sai.z + vz / Lv * Le }; return distSeg(pp, w.p1, w.p2) < w.esp / 2 + raio(dnS) + geo(par, "folga") - EPS; })) Le = r4(Le - 0.05);   // hid:ok passo de 5 cm
          /* com a LINHA DA REDE: o toco para antes da caixa de inspeção que a rede põe no pé dele (a ponta fora da caixa, com
             folga) — senão entrava na caixa e voltava (ciclo) */
          var LRg = dep("HidRede", "./hidrede.js");
          if (LRg && arr(estado.hidRedes).length) {
            var dLin = Infinity; arr(estado.hidRedes).forEach(function (r) { var q = LRg._int.projetar(LRg._int.linha(r.pontos), sai); if (q) dLin = Math.min(dLin, q.d); });
            /* a ponta fora da PAREDE da caixa de 0,60 m (o corpo + a parede de alvenaria/concreto da composição) */
            var CIt = dep("HidCI", "./hidcigeo.js"), eT = CIt && CIt.escolher ? CIt.escolher(par.tipoCaixa || "alvenaria", 0, par.tampa || "concreto") : null;
            var meioT = eT ? (eT.forma === "prismatica" ? Math.max(eT.lado, eT.lado2 || eT.lado) / 2 : eT.diam / 2) + num((eT.desenho || {}).parede_m, 0) : num(B.PECAS.caixa_inspecao.r, 0);
            if (dLin < Infinity) Le = r4(Math.max(geo(par, "margemNo"), Math.min(Le, dLin - meioT - geo(par, "folga"))));
          }
          var iS = B.declMinDn("esgoto", dnS) / 100, p2 = { x: r4(sai.x + vx / Lv * Le), y: chao4(sai.y - Le * iS), z: r4(sai.z + vz / Lv * Le) };
          var ciG = !redesDoUsuario(estado).length ? caixaInspecaoDoUsuario(estado, sai) : null;
          if (ciG) {
            /* SAÍDA → a caixa de inspeção do usuário: em L (primeiro no eixo mais longo), com a declividade mínima do DN */
            if (ciG.converter && !novas.some(function (o) { return o.op === "peca" && o.id === ciG.id; })) ciG.converter.forEach(function (o) { novas.push(o); });
            var a0 = { x: r4(sai.x), y: r4(sai.y), z: r4(sai.z) };
            /* ⚠ PADRÃO: da saída da caixa de gordura até a caixa de inspeção PELA ÁREA EXTERNA (reto, em L com o canto do lado
               de fora, ou contornando pelo corredor) — antes era um L qualquer, que podia atravessar a casa (print 21) */
            /* as direções em que os tubos do ambiente já chegam na caixa (o ramal do banheiro): a gordura entra por outro lado */
            var ocup = []; op.ops.concat(novas).concat(arr(estado.instalacoes && estado.instalacoes.trechos).map(function (t) { return { op: "trecho", sistema: t.sistema, p1: t.p1, p2: t.p2 }; })).forEach(function (o) { if (o.op === "trecho" && o.sistema === "esgoto" && d2(o.p2, ciG) <= B.PECAS.caixa_inspecao.captura + EPS) { var ux = o.p2.x - o.p1.x, uz = o.p2.z - o.p1.z, Lu = Math.sqrt(ux * ux + uz * uz); if (Lu > EPS) ocup.push({ x: ux / Lu, z: uz / Lu }); } });
            var cam = HI() ? HI().caminhoExterno(estado, a0, ciG, { parametros: par, ocupadas: ocup }) : null;
            if (!cam) { var dxg = ciG.x - a0.x, dzg = ciG.z - a0.z; cam = [a0, Math.abs(dxg) >= Math.abs(dzg) ? { x: ciG.x, z: a0.z } : { x: a0.x, z: ciG.z }, ciG]; }
            var yC = a0.y, prev = a0, nS = 0;
            for (var kc = 1; kc < cam.length; kc++) {
              var Lc = d2(prev, cam[kc]); if (!(Lc > geo(par, "margemNo"))) continue;
              yC = chao4(yC - Lc * iS);
              var qn = { x: r4(cam[kc].x), y: yC, z: r4(cam[kc].z) };
              novas.push({ op: "trecho", id: ambId + "-cgs" + (ic + 1) + (nS ? String.fromCharCode(97 + nS) : ""), sistema: "esgoto", material: "pvc_esgoto", dn: dnS, p1: { x: r4(prev.x), y: r4(prev.y != null ? prev.y : yC), z: r4(prev.z) }, p2: qn, amb: ambId, ambParte: "gordura_saida" });   // hid:ok letras dos trechos seguintes (b, c, ...)
              prev = qn; nS++;
            }
            decide("amb.caixa_gordura", "Saída da caixa de gordura até a caixa de inspeção " + ciG.id + " (DN " + dnS + ").");
          } else {
            novas.push({ op: "trecho", id: ambId + "-cgs" + (ic + 1), sistema: "esgoto", material: "pvc_esgoto", dn: dnS, p1: { x: r4(sai.x), y: r4(sai.y), z: r4(sai.z) }, p2: p2, continua: "p2", amb: ambId, ambParte: "gordura_saida" });
            decide("amb.caixa_gordura", "Saída da caixa de gordura em espera DN " + dnS + " para a linha da rede.");
            esperaCG = true;
          }
        });
        /* as pontas que são ESPERA (fora do ambiente / no teto): "continua" — não são desconexão */
        [esperaEs ? { p: destinos.esgoto.conector, s: "esgoto" } : null, esperaAF ? { p: esperaAF, s: "agua_fria" } : null].forEach(function (w) {
          if (!w) return;
          novas.forEach(function (o) { if (o.op !== "trecho" || o.sistema !== w.s) return; ["p1", "p2"].forEach(function (k) { if (d2(o[k], w.p) <= B.TOL && (w.s !== "agua_fria" || Math.abs(o[k].y - w.p.y) <= B.TOL)) o.continua = o.continua && o.continua !== k ? "ambos" : k; }); });
        });
        op.pendencias.forEach(function (p) { if (p.chave !== "rota.coluna_ventilacao") pend(p.chave, p.motivo || p.texto, p.elementos, p.acao); });
        /* (revisão frente A, 20/10/2026) os avisos da COTA PELO FLUXO do traçado (a partida abaixo do cobrimento mínimo; a queda antes
           da caixa) chegam ao usuário — antes só as pendências passavam e o "avisa quantos cm" ficava calado no Traçar automaticamente */
        arr(op.problemas).forEach(function (a) { if (a && a.chave === "rota.cota_fluxo") aviso(a.texto, a.elementos, a.acao); });
        if (juntar && esperaAF) {
          /* o topo da espera do banheiro deixa de ser a ponta (vira tê no meio do barrilete curto) */
          novas.forEach(function (o) { if (o.op === "trecho" && o.sistema === "agua_fria" && o.continua) ["p1", "p2"].forEach(function (k) { if (d3(o[k], esperaAF) <= B.TOL) { o.continua = o.continua === "ambos" ? (k === "p1" ? "p2" : "p1") : (o.continua === k ? "" : o.continua); if (!o.continua) delete o.continua; } }); });
          /* da prumada da válvula, PASSANDO pelo topo da espera do banheiro (tê), até a espera única logo depois */
          var dj = d2(juntar.de, esperaAF) || 1, uj = { x: (esperaAF.x - juntar.de.x) / dj, z: (esperaAF.z - juntar.de.z) / dj };
          var fimB = { x: r4(esperaAF.x + uj.x * geo(par, "lateralEntradaAF")), y: esperaAF.y, z: r4(esperaAF.z + uj.z * geo(par, "lateralEntradaAF")) };
          /* FRENTE B (19/10/2026, D-04): no sentido da água — da espera única (p1, a ponta aberta) para a prumada da válvula (p2) */
          novas.push({ op: "trecho", id: ambId + "-afb", sistema: "agua_fria", material: "pvc_soldavel", dn: juntar.dn, p1: fimB, p2: juntar.de, continua: "p1", amb: ambId, ambParte: "espera_agua" });
          decide("amb.agua", "A prumada da válvula e a do banheiro se juntam sob a laje num ponto de espera único em (" + f2(fimB.x) + "; " + f2(fimB.z) + ").");
        }
        /* a PROFUNDIDADE da caixa de inspeção do usuário: o tubo mais fundo que chega nela + folga (a peça é refeita no lote) */
        var ciIds = {}; novas.concat(op.ops).forEach(function (o) { if (o.op === "peca" && o.peca === "caixa_inspecao" && o.ambParte === "reaproveitada") ciIds[o.id] = o; });
        if (ciUser && ciUser.peca && !ciIds[ciUser.id]) ciIds[ciUser.id] = { op: "peca", id: ciUser.id, peca: "caixa_inspecao", sistema: "esgoto", dn: ciUser.peca.dn, x: ciUser.x, y: ciUser.y, z: ciUser.z, prof: ciUser.prof, existente: true };
        Object.keys(ciIds).forEach(function (id) {
          var ci = ciIds[id], yMin = null;
          /* ⚠ o tubo ENTRA PELA PAREDE da caixa, abaixo da laje da tampa com folga (impl-07: o ramal do banheiro chegava rente à
             tampa, com a bolsa na borda de cima): o que chega alto desce ANTES da caixa — curva no terreno, fora da parede — e
             entra deitado, com a declividade, até o centro */
          var CIa = dep("HidCI", "./hidcigeo.js"), escA = CIa && CIa.escolher ? CIa.escolher(ci.tipoCaixa || "alvenaria", 0, ci.tampa || "concreto") : null, dsA = escA && escA.desenho ? escA.desenho : {};
          var lajeA = num(dsA.tampa_m, 0), meioA = escA ? (escA.forma === "prismatica" ? Math.max(escA.lado, escA.lado2 || escA.lado) / 2 : escA.diam / 2) + num(dsA.parede_m, 0) : num(B.PECAS.caixa_inspecao.r, 0);
          novas.slice().forEach(function (o) {
            if (o.op !== "trecho" || o.sistema !== "esgoto" || d2(o.p2, ci) > B.PECAS.caixa_inspecao.captura) return;
            var rO = raio(num(o.dn, 0)), yMaxE = r4(num(ci.y, 0) - lajeA - geo(par, "folgaTampaCaixa") - rO), Lh = d2(o.p1, o.p2);
            if (o.p2.y <= yMaxE + geo(par, "degrauMinimoCaixa") || !(Lh > EPS) || Math.abs(o.p2.y - o.p1.y) > Lh) return;
            var u = { x: (o.p2.x - o.p1.x) / Lh, z: (o.p2.z - o.p1.z) / Lh }, dQ = Math.min(Lh, meioA + geo(par, "afastQuedaCaixa")), iQ = B.declMinDn("esgoto", num(o.dn, 0)) / 100;
            var Q = { x: r4(o.p2.x - u.x * dQ), z: r4(o.p2.z - u.z * dQ) }, yQ = r4(o.p1.y + (o.p2.y - o.p1.y) * (Lh - dQ) / Lh), yQ2 = chao4(Math.min(yQ, yMaxE + iQ * dQ)), fim = { x: o.p2.x, y: chao4(yQ2 - iQ * dQ), z: o.p2.z }, cont = o.continua;
            if (dQ < Lh - geo(par, "margemNo")) { o.p2 = { x: Q.x, y: yQ, z: Q.z }; delete o.continua; novas.push({ op: "trecho", id: o.id + "-q", sistema: "esgoto", material: o.material, dn: o.dn, p1: { x: Q.x, y: yQ, z: Q.z }, p2: { x: Q.x, y: yQ2, z: Q.z }, amb: ambId, ambParte: o.ambParte }); }
            else { Q = { x: o.p1.x, z: o.p1.z }; yQ2 = chao4(Math.min(o.p1.y, yMaxE + iQ * Lh)); fim.y = chao4(yQ2 - iQ * Lh); o.op = "nada"; novas.push({ op: "trecho", id: o.id + "-q", sistema: "esgoto", material: o.material, dn: o.dn, p1: { x: o.p1.x, y: o.p1.y, z: o.p1.z }, p2: { x: Q.x, y: yQ2, z: Q.z }, amb: ambId, ambParte: o.ambParte }); }
            var tH = { op: "trecho", id: o.id + "-e", sistema: "esgoto", material: o.material, dn: o.dn, p1: { x: Q.x, y: yQ2, z: Q.z }, p2: fim, amb: ambId, ambParte: o.ambParte }; if (cont) tH.continua = cont; novas.push(tH);
            decide("amb.caixa_inspecao", "O ramal " + o.id + " desce " + f2(yQ - yQ2) + " m antes da caixa " + id + " e entra pela parede dela, abaixo da tampa.");
          });
          for (var iN = novas.length - 1; iN >= 0; iN--) if (novas[iN].op === "nada") novas.splice(iN, 1);
          novas.concat(op.ops).forEach(function (o) { if (o.op === "trecho" && o.sistema === "esgoto") ["p1", "p2"].forEach(function (k) { if (d2(o[k], ci) <= B.PECAS.caixa_inspecao.captura && (yMin == null || o[k].y < yMin)) yMin = o[k].y; }); });
          if (yMin == null) return;
          var pf = teto4(Math.max(num(ci.prof, B.PECAS.caixa_inspecao.prof), ci.y - yMin + geo(par, "folga") * 2));
          if (Math.abs(pf - num(ci.prof, 0)) <= EPS) return;
          if (ci.existente) { novas.push({ op: "apagar", id: id, amb: ambId, ambParte: "reaproveitada" }); var nv = copia(ci); delete nv.existente; nv.prof = pf; nv.amb = ambId; nv.ambParte = "reaproveitada"; novas.push(nv); }
          else ci.prof = pf;
          decide("amb.caixa_inspecao", "Caixa de inspeção " + id + " com " + f2(pf) + " m de profundidade (o tubo mais fundo que chega nela).");
        });
        if (esperaEs) decide("amb.espera_esgoto", "Espera em (" + f2(esperaEs.x) + "; " + f2(esperaEs.z) + ").");
        else if (esperaCG) decide("amb.espera_esgoto", "Espera na saída da caixa de gordura.");
        var dnR = Math.max.apply(null, [0].concat(op.ops.filter(function (o) { return o.op === "trecho" && o.sistema === "esgoto"; }).map(function (o) { return o.dn; })));
        decide("amb.ramal_esgoto", "Traçado: " + op.nome + " (" + R.opcoes.length + " opção(ões) avaliadas); ramal de esgoto até DN " + dnR + ".");
        /* 6) VENTILAÇÃO */
        if (!(destinos.esgoto && destinos.esgoto.ventilado) || destinos.ventilacao) ventilar();   /* prédio: TQ com ventilador primário E coluna de ventilação — o ramal da unidade vai à coluna (ventilação secundária) */
      }
    }
    ctx.pendencias().forEach(function (p) { pend(p.chave, p.motivo, ids); });
    ctx.normas().forEach(function (f) { if (!out.normas.some(function (g) { return g.chave === f.chave; })) out.normas.push(f); });
    out.ops = limpar.concat(novas);
    /* ⚠ os avisos são os do MODELO REAL depois do lote (o que o modelador acusa e antes não acusava) — a validação
       interna do HidRota usa famílias sintéticas e acusava "ponto sem tubo" em ponto que no modelo está ligado */
    if (novas.length) {
      try {
        var antes = {}, V0 = B.verificar(estado0, avaliarFam), V1 = B.verificar(BE().aplicar(ops0.concat(out.ops)), avaliarFam);
        V0.itens.forEach(function (i) { antes[i.texto] = (antes[i.texto] || 0) + 1; });
        V1.itens.forEach(function (i) { if (antes[i.texto]) { antes[i.texto]--; return; } aviso("[" + i.rotuloTipo + "] " + i.texto, arr(i.ids), arr(i.ids).length ? { tipo: "ajustar", ids: arr(i.ids).slice() } : null); });
        out.verificacao = { antes: V0.itens.length, depois: V1.itens.length };
      } catch (eV) { aviso("verificação do modelo depois do lote falhou: " + (eV && eV.message ? eV.message : eV), ids, null); }
    }
    out.ok = !!novas.length && !out.pendencias.some(function (p) { return /^amb\.rota/.test(p.chave); });
    return out;

    /* ---------------- VENTILAÇÃO (correção do Rogério, 18/10/2026 — prints 18/19: o "Traçar automaticamente" punha um DN 100
       solto no cômodo, fora da parede). Agora:
         · DN pela norma: ramal de ventilação pela Tabela 8 (grupo com/sem bacia × UHC) e coluna pela Tabela 2 (DN do ramal
           de esgoto × UHC × comprimento) — banheiro residencial = DN 50; nunca o DN 100 fixo;
         · TOMADA no ramal de esgoto que sai da CAIXA SIFONADA, ANTES da junção com o DN 100 da bacia, a no máximo a distância
           da Tabela 1 e no mínimo 2 × DN do desconector (4.3.16 b 4), ligada ACIMA do eixo por tê 90° (4.3.16 b 1), com o
           trecho inicial em aclive (4.3.13 / 4.3.16 b 2);
         · entra na parede mais perto e sobe EMBUTIDA NO EIXO DA PAREDE até a altura de saída (parâmetro, padrão +3,50 m do
           piso), onde vai o TERMINAL DE VENTILAÇÃO do produto; viga no caminho = rasgo marcado + aviso; o prolongamento
           acima da cobertura (4.3.5/4.3.6) fica como pendência para o RT. */
    function ventilar() {
      var trs = novas.filter(function (o) { return o.op === "trecho" && o.sistema === "esgoto"; });
      if (!trs.length) return;
      var G = grafoEs(trs), desc = [], dCx = null, dBa = null;
      /* DESCONECTORES (NBR 8160: todo desconector ventilado): a caixa/ralo sifonado; a bacia; o aparelho com sifão próprio
         que NÃO descarrega na caixa (pia → caixa de gordura, tanque, mictório) — o que descarrega na caixa é protegido por ela */
      if (caixa) { var noC = G.noSaidaEm(caixa, B.PECAS[caixa.peca].captura, caixa.y); if (noC != null) dCx = { ref: caixa.id, no: noC, dn: null, saida: num(String(caixa.dn).split("x").pop(), null), caixa: true }; }
      if (baciaEs) { var noB = G.noEmPlanta(baciaEs, B.TOL_CONECTOR, baciaEs.y); if (noB != null) dBa = { ref: baciaEs.id, no: noB, dn: null, bacia: true }; else pend("amb.ventilacao", "o ramal da bacia não foi achado no traçado (ventilação não posta)", [baciaEs.id]); }
      /* ⚠ a tomada sai do ramal da CAIXA SIFONADA (o 1º da lista); sem caixa, do ramal da bacia */
      if (dCx) desc.push(dCx);
      if (dBa) desc.push(dBa);
      var SIFAO = { pia_cozinha: 1, tanque: 1, mictorio: 1 };
      aparelhos.forEach(function (a) { if (!SIFAO[a.aparelho]) return; a.conectores.forEach(function (c) { if (c.sistema !== "esgoto") return; var n0 = G.noPerto({ x: c.x, y: c.y, z: c.z }, B.TOL_CONECTOR); if (n0 != null) desc.push({ ref: a.id, no: n0, dn: null }); }); });
      if (!desc.length) return;
      /* ⚠ a distância máxima vale pelo DN do ramal de descarga do desconector; o da caixa é a SAÍDA dela (o traçado pode
         sair maior e o dimensionamento reduzir — vale o menor, o lado seguro) */
      desc.forEach(function (q) {
        var j = G.jusante(q.no); q.cam = j; q.dn = j.length ? j[0].e.t.dn : null; if (q.saida) q.dn = q.dn ? Math.min(q.dn, q.saida) : q.saida;
        q.sNo = {}; j.forEach(function (c) { q.sNo[c.e.a] = c.s0; }); if (j.length) q.sNo[j[j.length - 1].e.b] = j[j.length - 1].s0 + j[j.length - 1].e.L;
        var lv = q.dn ? NR.distVent(q.dn, "ventilação de " + q.ref) : null; q.limite = lv ? lv.v : null; q.fonte = lv ? lv.fonte : null;
        if (q.limite == null) pend("es.ventilacao.distancia_maxima", "distância máxima de " + q.ref + " ao ponto ventilado sem tabela (DN " + q.dn + ")", [q.ref]);
      });
      var fatorDn = NR.regraVent("desconector_dist_min_fator_dn", "ventilação: distância mínima da ligação ao desconector (4.3.16 b 4)");
      if (fatorDn == null) pend("es8160.ventilacao_regras", "distância mínima da ligação da ventilação ao desconector (2 × DN, 4.3.16 b 4) sem tabela: não verificada", ids);
      var w0 = geo(par, "margemVent"), passo = geo(par, "passo"), hubsV = pecas.concat(caixa ? [caixa] : []);
      /* pontos candidatos no HORIZONTAL do caminho de q0 (o vertical da bacia não serve), com as distâncias de todos. Com a
         caixa sifonada E a bacia: só no ramal da caixa ANTES da junção (o trecho comum já é o DN 100 da bacia) */
      function candidatos(q0) {
        var cs = [], comum = {};
        if (q0.caixa && dBa) dBa.cam.forEach(function (cq) { comum[cq.e.a + ">" + cq.e.b] = 1; });
        var sMin = fatorDn != null && q0.dn ? fatorDn * q0.dn / 1000 : 0;
        q0.cam.forEach(function (c, ic) {
          var t = c.e.t, Lh = d2(t.p1, t.p2); if (!(Lh > passo * 2) || Math.abs(t.p1.y - t.p2.y) > Lh) return;
          if (comum[c.e.a + ">" + c.e.b]) return;
          for (var s = passo; s < c.e.L - passo + EPS; s += passo) {
            if (c.s0 + s < sMin - EPS) continue;   /* 4.3.16 b 4: no mínimo 2 × DN do desconector */
            var f = s / c.e.L, P = { x: r4(t.p1.x + (t.p2.x - t.p1.x) * f), y: r4(t.p1.y + (t.p2.y - t.p1.y) * f), z: r4(t.p1.z + (t.p2.z - t.p1.z) * f) }, viol = 0, dists = [];
            /* ⚠ o ponto da ventilação nunca DENTRO do cilindro de captura de uma peça (o ralo sifonado posto à mão perto do ramal):
               a ponta do ventilador "terminava no ralo" e o Verificar acusava sistemas misturados (caso do Rogério, 18/10/2026) */
            if (hubsV.some(function (k) { return d2(P, k) <= num((B.PECAS[k.peca] || {}).captura, 0) + raio(num(t.dn, 0)) + geo(par, "folga"); })) continue;
            var sP = c.s0 + s;
            /* a tomada longe das conexões do ramal (a junção com o DN 100 da bacia, as curvas): o tê precisa do tubo reto */
            if (trs.some(function (u) {
              if (u === t) return false;
              var liga = d3(u.p1, t.p1) <= B.TOL || d3(u.p1, t.p2) <= B.TOL || d3(u.p2, t.p1) <= B.TOL || d3(u.p2, t.p2) <= B.TOL;   /* a conexão do nó: encosta, sem folga */
              return H._int.segSeg3(P, P, u.p1, u.p2) < raio(num(u.dn, 0)) + raio(num(t.dn, 0)) + (liga ? 0 : geo(par, "folga")) - EPS;
            })) continue;
            desc.forEach(function (q) {
              var ach = null; q.cam.forEach(function (cq) { if (cq.e === c.e) ach = cq.s0 + s; });
              /* o desconector de OUTRO ramo (a bacia): desce até a junção e sobe o ramo da caixa até a tomada */
              if (ach == null) for (var k = ic; k < q0.cam.length; k++) { var nb = q0.cam[k].e.b; if (q.sNo[nb] != null) { ach = q.sNo[nb] + (q0.cam[k].s0 + q0.cam[k].e.L - sP); break; } }
              var ok = ach != null && (q.limite == null || ach <= q.limite - w0 + EPS);
              if (!ok) viol++;
              dists.push({ ref: q.ref, L: ach == null ? null : r4(ach), limite: q.limite, dn: q.dn, ok: ok });
            });
            var dq = dists.filter(function (d) { return d.ref === q0.ref; })[0];
            /* o sentido do escoamento no ramal (p1 → p2) em planta: a junção 45° da ventilação sai para MONTANTE (a favor do fluxo) */
            var fxL = d2(t.p1, t.p2) || 1;
            if (dq && dq.ok) cs.push({ P: P, viol: viol, dists: dists, s: sP, dnEs: num(t.dn, 0), trecho: t.id, fluxo: { x: (t.p2.x - t.p1.x) / fxL, z: (t.p2.z - t.p1.z) / fxL } });
          }
        });
        return cs;
      }
      var cands = candidatos(desc[0]);
      if (!cands.length) { pend("amb.ventilacao", "nenhum ponto horizontal do ramal de " + desc[0].ref + (desc[0].caixa && dBa ? " (antes da junção com o ramal da bacia)" : "") + " dentro da distância máxima da NBR 8160 (e a pelo menos 2 × DN do desconector) para ligar a ventilação", [desc[0].ref]); return; }
      /* DN do RAMAL DE VENTILAÇÃO: Tabela 8 pelo grupo ventilado (com bacia = o banheiro tem bacia) e a soma das UHC */
      var temBacia = !!dBa, uT = 0;
      aparelhos.forEach(function (a) { var u = NR.uhc(a.aparelho, "ventilação"); uT += u == null ? 0 : u; });
      if (out.caixaSifonada && out.caixaSifonada.uhc) uT = Math.max(uT, out.caixaSifonada.uhc);
      var dnV = NR.dnVentRamal(temBacia ? 1 : 0, uT, "ventilação: ramal " + (temBacia ? "com" : "sem") + " bacia (Tabela 8)");
      if (dnV == null) { pend("es.ventilacao.ramal", "DN do ramal de ventilação sem linha na Tabela 8 (" + (temBacia ? "com" : "sem") + " bacia, " + uT + " UHC)", ids); return; }
      dnV = HRcomercial("ventilacao", dnV);
      var acl = NR.regraVent("aclive_min_pct", "ventilação: aclive");
      if (acl == null) pend("es8160.ventilacao_regras", "aclive mínimo da ventilação horizontal sem tabela: o trecho deitado saiu sem aclive", ids);
      var ac = acl == null ? 0 : acl / 100;
      /* FRENTE H1 (20/10/2026, R-B5/B6 do PADROES-PROJETO-RA): sem espaço vertical sob o piso para a derivação inteira acima do
         ramal (o tê sobe menos que o ideal), a ventilação liga em ÂNGULO MENOR — só por junção 45° — e o TRECHO INICIAL (o deitado
         até a parede) vai com o aclive da tabela (NBR 8160 4.3.16 b-2); o restante (desvio, sob o teto) segue o aclive mínimo */
      var acl2 = NR.regraVent("aclive_inicial_angulo_menor_pct", "ventilação: aclive do trecho inicial ligado em ângulo menor (4.3.16 b 2)");
      if (acl2 == null) pend("es8160.ventilacao_regras", "aclive do trecho inicial da ventilação ligada em ângulo menor (4.3.16 b 2) sem tabela: o trecho inicial saiu com o aclive mínimo", ids);
      var acIni = acl2 == null ? ac : Math.max(ac, acl2 / 100), angMenor = false;
      var outros = novas.filter(function (o) { return o.op === "trecho" && o.sistema !== "esgoto"; }).concat(arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema !== "esgoto"; }));
      var mat = "pvc_esgoto", pr = ambId + "-ve-", nV = 0;
      /* a ALTURA DE SAÍDA da ventilação (projeto, editável no painel do kit): onde fica o terminal */
      var hSaida = geo(par, "alturaSaidaVentilacao"), ySaida = r4(piso + hSaida);
      function bateEm(segs, r, exceto, tomada) {
        return outros.concat(novas.filter(function (o) { return o.op === "trecho" && o.sistema === "ventilacao"; })).some(function (t) {
          if (exceto && exceto.some(function (x) { return x === t || (x && x.id != null && x.id === t.id); })) return false;
          return segs.some(function (sg) { return H._int.segSeg3(sg.a, sg.b, t.p1, t.p2) - r - raio(num(t.dn, 0)) < (t.sistema === "agua_fria" ? geo(par, "afastamento") : geo(par, "folga")) - EPS; });
        }) || trs.some(function (t) {
          if (tomada && t.id === tomada.trecho) return false;
          return (tomada ? segs : segs.slice(1)).some(function (sg) {
            /* a ZONA DO TÊ: o começo do trecho que sai de cima da tomada fica sobre as conexões do ramal — conta a partir dali */
            var a = sg.a;
            if (tomada && d2(sg.a, tomada.P) <= EPS) { var Ls = d3(sg.a, sg.b); if (Ls <= tomada.zona + EPS) return false; var f = tomada.zona / Ls; a = { x: sg.a.x + (sg.b.x - sg.a.x) * f, y: sg.a.y + (sg.b.y - sg.a.y) * f, z: sg.a.z + (sg.b.z - sg.a.z) * f }; }
            return H._int.segSeg3(a, sg.b, t.p1, t.p2) - r - raio(num(t.dn, 0)) < geo(par, "folga") - EPS;
          });
        });
      }
      /* a subida: do ponto no ramal (sob o piso) sobe o tê ACIMA DO EIXO, corre com aclive até o EIXO da parede mais perto e
         sobe embutida. ⚠ Antes ia à face da parede (embutir 5 cm) e, sem parede perto, o DN 100 ficava solto no cômodo */
      function subida(c, r, yAte, alvo) {
        var best = null, passoP = geo(par, "passoParede"), nP = Math.round(geo(par, "deslizeParede") / passoP);
        /* ⚠ o tê fica ACIMA DO EIXO do ramal (4.3.16 b 1): a derivação sobe o que o enchimento sob o piso deixa — o ideal é o
           tubo da ventilação inteiro acima do ramal; o mínimo, o eixo dela na geratriz de cima do ramal */
        var hIdeal = raio(c.dnEs) + r + geo(par, "folga"), hMin = raio(c.dnEs);
        function cortaAbertura(sg, rr) {
          var Hc = dep("HidCriterios", "./hidcriterios.js"); if (!Hc || !Hc.caixasAbertura) return false;
          return arr(obst.aberturas).some(function (a) { return Hc.caixasAbertura(a, par).some(function (z) { return sg.some(function (s) { return !!Hc._int.recorte(z.caixa, s.a, s.b, rr, rr); }); }); });
        }
        paredes.forEach(function (w) {
          if (num(w.espessura, 0) < 2 * r + EPS) return;   /* o tubo não cabe dentro da parede */
          var q0 = projParede(c.P, w, num(w.espessura, 0) / 2); if (!q0) return;   /* embutir = meia espessura → o EIXO da parede */
          /* a tomada já está SOB a parede (o ramal corre por baixo dela): sobe ali mesmo, sem trecho deitado */
          if (d2(c.P, q0) < geo(par, "margemNo")) q0 = { x: c.P.x, z: c.P.z };
          var dx = w.p2.x - w.p1.x, dz = w.p2.z - w.p1.z, Lw = Math.sqrt(dx * dx + dz * dz), u = { x: dx / Lw, z: dz / Lw };
          /* ⚠ o ponto na parede DESLIZA ao longo dela (em L): o ramal da bacia corre perpendicular à parede e a subida no
             mesmo eixo batia na prumada da válvula */
          for (var k = -nP; k <= nP; k++) {
            var q = { x: r4(q0.x + u.x * k * passoP), z: r4(q0.z + u.z * k * passoP) }, tq = (q.x - w.p1.x) * u.x + (q.z - w.p1.z) * u.z;
            if (tq < geo(par, "afastParede") || tq > Lw - geo(par, "afastParede")) continue;
            var canto = k === 0 ? null : { x: r4(c.P.x + (q.x - q0.x)), z: r4(c.P.z + (q.z - q0.z)) };
            var L1 = canto ? d2(c.P, canto) : 0, L2 = d2(canto || c.P, q), Lh = L1 + L2;
            /* subindo direto (a tomada já sob a parede) não há trecho deitado: o tê sobe dentro da parede */
            var hTe = Lh <= EPS ? hIdeal : Math.min(hIdeal, piso - geo(par, "cobrimento") - r - Lh * ac - c.P.y), acT = ac;
            /* o tê não sobe o ideal: ligação em ângulo menor (junção 45°) e o trecho inicial no aclive dela (4.3.16 b 2) */
            var semIni = false;
            if (Lh > EPS && hTe < hIdeal - EPS) {
              var hTe2 = Math.min(hIdeal, piso - geo(par, "cobrimento") - r - Lh * acIni - c.P.y);
              /* ⚠ não coube com o aclive da 4.3.16 b 2 (o rebaixo do andar, test-hid-predio): fica o aclive mínimo, com AVISO — melhor
                 que o ambiente sem ventilação; a escolha prefere a posição em que o aclive da tabela cabe */
              if (hTe2 >= hMin - EPS) { acT = acIni; hTe = hTe2; } else semIni = acIni > ac + EPS;
            }
            if (hTe < hMin - EPS) continue;   /* o trecho deitado sob o piso precisa caber no enchimento, com o tê acima do eixo */
            var T = { x: c.P.x, y: chao4(c.P.y + hTe), z: c.P.z }, j45 = false;
            /* FRENTE H1 (20/10/2026, revisão): em ÂNGULO MENOR a peça é a JUNÇÃO 45° — a derivação sai a 45° ao longo do ramal, para
               montante (o braço da junção a favor do fluxo), subindo o hTe; o deitado começa no fim dela. Antes a tomada dizia
               "juncao45" e o modelo desenhava a subida vertical (o 3D e o orçamento contavam o tê): memorial × modelo divergiam */
            if (Lh > EPS && hTe < hIdeal - EPS && c.fluxo) {
              for (var it45 = 0; it45 < 2; it45++) {   /* o deitado depende do fim da junção, que depende do hTe: duas passadas bastam */
                var Tp = { x: c.P.x - c.fluxo.x * hTe, z: c.P.z - c.fluxo.z * hTe }, sU = (q.x - Tp.x) * u.x + (q.z - Tp.z) * u.z;
                var c2 = { x: r4(Tp.x + u.x * sU), z: r4(Tp.z + u.z * sU) }, L1j = d2(Tp, c2), L2j = d2(c2, q);
                var hJ = Math.min(hIdeal, piso - geo(par, "cobrimento") - r - (L1j + L2j) * acT - c.P.y);
                if (hJ < hMin - EPS) { hTe = -1; break; }
                hTe = hJ; canto = L1j > EPS && L2j > EPS ? c2 : null; L1 = canto ? L1j : 0; L2 = canto ? L2j : L1j + L2j; Lh = L1j + L2j;
              }
              if (hTe < hMin - EPS) continue;
              T = { x: r4(c.P.x - c.fluxo.x * hTe), y: chao4(c.P.y + hTe), z: r4(c.P.z - c.fluxo.z * hTe) }; j45 = true;
            }
            var yC = canto ? teto4(T.y + L1 * acT) : T.y, yW = Lh > geo(par, "margemNo") ? teto4(T.y + Lh * acT) : T.y;
            if (Lh > EPS && yW > piso - geo(par, "cobrimento") - r + EPS) continue;
            if (obst.aberturas.some(function (a) { return a.tipo === "porta" && distSeg(q, a.p1, a.p2) < geo(par, "raioPorta"); })) continue;
            var top = { x: q.x, y: yAte(q), z: q.z }, segs = [{ a: c.P, b: T }];
            if (Lh <= EPS) { segs = [{ a: c.P, b: top }]; yW = c.P.y; }   /* o tê sobe direto: a derivação É a coluna */
            else {
              if (canto) segs.push({ a: T, b: { x: canto.x, y: yC, z: canto.z } });
              if (d2(canto || T, q) > EPS) segs.push({ a: canto ? { x: canto.x, y: yC, z: canto.z } : T, b: { x: q.x, y: yW, z: q.z } });
              segs.push({ a: { x: q.x, y: canto && d2(canto, q) <= EPS ? yC : yW, z: q.z }, b: top });
            }
            var extra = alvo ? alvo(top) : null; if (alvo && !extra) continue;
            /* CRITÉRIO DE PROJETISTA (js/hidcriterios.js, 18/10/2026): a subida não passa no vão, na verga nem na contraverga de
               porta ou janela (o e2e do critério achou a ventilação subindo no meio da janela da parede hidráulica) */
            if (cortaAbertura(segs.concat(extra ? extra.segs : []), r)) continue;
            var tomada = { trecho: c.trecho, P: c.P, zona: raio(c.dnEs) + 2 * r + geo(par, "folga") };
            var todas = segs.concat(extra ? extra.segs : []), bate = bateEm(todas, r, extra ? extra.exceto : null, tomada), desvio = 0;
            /* ⚠ a subida no eixo da parede MOLHADA cruza o barrilete/as prumadas de água da mesma parede (o banheiro do teste:
               a ventilação atravessava o barrilete sob a laje): DESVIO dentro da parede — sobe, corre no eixo (com aclive) por
               baixo do tubo que cruzaria e volta a subir onde a parede está livre */
            if (bate) {
              var vert = segs[segs.length - 1], niveis = [], nD = Math.ceil(Lw / passoP);   /* o desvio corre a parede inteira, se preciso */
              outros.forEach(function (t) {
                var fx = t.sistema === "agua_fria" ? geo(par, "afastamento") : geo(par, "folga");
                if (distSeg(t.p1, w.p1, w.p2) > num(w.espessura, 0) + fx && distSeg(t.p2, w.p1, w.p2) > num(w.espessura, 0) + fx) return;
                var yl = chao4(Math.min(t.p1.y, t.p2.y) - r - raio(num(t.dn, 0)) - fx - nD * passoP * ac);   /* o aclive do desvio sobe até isto */
                if (yl > vert.a.y + geo(par, "margemNo") * 2 && yl < vert.b.y && niveis.indexOf(yl) < 0) niveis.push(yl);
              });
              niveis.sort(function (x1, x2) { return x2 - x1; });
              var achou = null;
              niveis.some(function (yD) {
                for (var jd = 1; jd <= nD && !achou; jd++) for (var sd = -1; sd <= 1 && !achou; sd += 2) {
                  var dxD = sd * jd * passoP, q2 = { x: r4(q.x + u.x * dxD), z: r4(q.z + u.z * dxD) }, t2 = (q2.x - w.p1.x) * u.x + (q2.z - w.p1.z) * u.z;
                  if (t2 < geo(par, "afastParede") || t2 > Lw - geo(par, "afastParede")) continue;
                  var yD2 = teto4(yD + Math.abs(dxD) * ac), pD = { x: q.x, y: yD, z: q.z }, pD2 = { x: q2.x, y: yD2, z: q2.z };
                  var top2 = { x: q2.x, y: yAte(q2), z: q2.z }, segsD = segs.slice(0, -1).concat([{ a: vert.a, b: pD }, { a: pD, b: pD2 }, { a: pD2, b: top2 }]);
                  var extra2 = alvo ? alvo(top2) : null; if (alvo && !extra2) continue;
                  if (top2.y > yD2 + geo(par, "margemNo") && !bateEm(segsD.concat(extra2 ? extra2.segs : []), r, extra2 ? extra2.exceto : null, tomada) && !cortaAbertura(segsD.concat(extra2 ? extra2.segs : []), r)) achou = { segs: segsD, L: Math.abs(dxD), top: top2, extra: extra2 };
                }
                return !!achou;
              });
              if (achou) { segs = achou.segs; top = achou.top; extra = achou.extra; bate = false; desvio = achou.L; }
            }
            var nota = c.viol * 1000 + (bate ? 100 : 0) + Lh + (canto ? geo(par, "pesoCurva") : 0) + (desvio ? desvio + geo(par, "pesoCurva") * 2 : 0) + (extra ? extra.L : 0) + c.s * 0.01 + (semIni ? 100 : 0);   // hid:ok pesos da escolha: norma, colisão, comprimento (sem o aclive inicial da tabela pesa como a colisão)
            if (!best || nota < best.nota - EPS) best = { c: c, q: q, canto: canto, yC: yC, yW: yW, Lh: Lh, top: top, bate: bate, nota: nota, extra: extra, segs: segs, w: w, hTe: r4(T.y - c.P.y), desvio: desvio, angMenor: j45, aclive: acT, semIni: semIni };
          }
        });
        return best;
      }
      var melhor = null, CV = destinos.ventilacao || null, coluna = null;
      /* rota do topo de uma subida até a coluna: em L sob o teto, subindo o aclive na direção dela (o ramal de ventilação) */
      function ateColuna(col) {
        return function (top) {
          var C = { x: col.p1.x, z: col.p1.z }, L1 = Math.abs(C.x - top.x), L2 = Math.abs(C.z - top.z);
          var mid = { x: C.x, y: r4(top.y + L1 * ac), z: top.z }, fim = { x: C.x, y: r4(mid.y + L2 * ac), z: C.z };
          if (fim.y > col.p2.y - geo(par, "margemNo") || fim.y < col.p1.y + geo(par, "margemNo")) return null;
          var segs = []; if (L1 > EPS) segs.push({ a: top, b: mid }); if (L2 > EPS) segs.push({ a: L1 > EPS ? mid : top, b: fim });
          return { segs: segs, L: L1 + L2, fim: fim, exceto: [col] };
        };
      }
      var yJunta = null, minTransb = null;
      if (CV) {
        /* PRÉDIO: o ventilador do ambiente sobe embutido e corre sob o teto até a COLUNA DE VENTILAÇÃO (junção = tê), acima do
           nível de transbordamento do aparelho mais alto + o mínimo da tabela (fonte secundária) */
        coluna = { id: CV.id, p1: { x: CV.x, y: CV.yBase, z: CV.z }, p2: { x: CV.x, y: CV.yTopo, z: CV.z } };
        var yTopoV = r4(tetoA.y - geo(par, "margemNo") * 2 - raio(dnV));
        cands.forEach(function (c) { var b = subida(c, raio(dnV), function (qq) { return r4(yTopoV - (Math.abs(qq.x - CV.x) + Math.abs(qq.z - CV.z)) * ac); }, ateColuna(coluna)); if (b && (!melhor || b.nota < melhor.nota - EPS)) melhor = b; });
        if (!melhor) { pend("amb.ventilacao", "sem caminho livre do ramal de " + desc[0].ref + " até a coluna de ventilação " + CV.id + " — ponha à mão", ids, { tipo: "ajustar", ids: [CV.id] }); return; }
        yJunta = melhor.extra.fim.y;
      } else {
        cands.forEach(function (c) { var b = subida(c, raio(dnV), function () { return ySaida; }); if (b && (!melhor || b.nota < melhor.nota - EPS)) melhor = b; });
        if (!melhor) { pend("amb.ventilacao", "nenhuma parede perto do ramal de " + desc[0].ref + " para subir a ventilação embutida no eixo", ids); return; }
        /* sem coluna de ventilação (o térreo com terminal próprio): o ponto em que este ramal deixa de ser ramal é o topo dele */
        yJunta = melhor.top.y;
      }
      /* ⚠ TRANSBORDAMENTO (NBR 8160 4.3.14 c e 4.3.16 b; R-B6 do PADROES-PROJETO-RA — frente A, 19/10/2026, D-07): antes de se ligar a
         outro ventilador (a coluna) — ou, sem coluna, antes de virar o tubo que vai ao terminal — o ramal eleva-se acima do topo do
         aparelho mais alto + o mínimo da tabela. Antes a conferência só rodava com a coluna existente: no térreo ficava sem conferir */
      var cT = ctx.consulta("es.declividades_minimas", { regra: "Ramal de ventilação liga-se à coluna acima do nível de transbordamento dos aparelhos" }, "valor", "ventilação: ligação à coluna acima do transbordamento");
      var RECEP = { bacia_valvula: 1, bacia_caixa_acoplada: 1, lavatorio: 1, pia_cozinha: 1, tanque: 1, mictorio: 1, bebedouro: 1 }, idsR = {};
      M.fams.forEach(function (f) { if (RECEP[tipos[f.id]]) idsR[String(f.id)] = 1; });
      var topoAp = null; arr(B.volumesFamilias(estado, avaliarFam)).forEach(function (v) { if (idsR[String(v.id)] && (topoAp == null || v.y1 > topoAp)) topoAp = v.y1; });
      if (!cT.ok) pend("es.declividades_minimas", "altura mínima da ligação do ramal de ventilação acima do transbordamento sem tabela", ids);
      else if (topoAp != null) { minTransb = r4(topoAp + num(cT.valor, 0)); if (yJunta < minTransb - EPS) pend("amb.ventilacao.transbordamento", (CV ? "a ligação na coluna de ventilação" : "o topo da ventilação (sem coluna, até o terminal)") + " ficou a " + f2(yJunta) + " m, abaixo do topo do aparelho mais alto + " + f2(num(cT.valor, 0)) + " m (" + f2(minTransb) + " m)", ids, CV ? { tipo: "ajustar", ids: [CV.id] } : { tipo: "parametro", campo: "alturaSaidaVentilacao", sugerido: r4(minTransb - piso) }); }
      /* a TOMADA: tê 90° (a derivação sobe do eixo) — a ponta que entra no ramal de esgoto é a junção esgoto × ventilação:
         "continua" diz que ela segue na peça de junção (o tê entra no nó do esgoto: js/biminst.js) */
      function emitir(b, dn, parte, dnUlt) {
        var vt = null, ini = null;
        b.segs.forEach(function (sg, i) {
          var a = ini || sg.a;
          if (i > 0 && d3(a, sg.b) <= geo(par, "margemNo") / 2 && i < b.segs.length - 1) { ini = a; return; }
          ini = null;
          vt = { op: "trecho", id: pr + (++nV), sistema: "ventilacao", material: mat, dn: i === b.segs.length - 1 && dnUlt ? dnUlt : dn, p1: { x: r4(a.x), y: r4(a.y), z: r4(a.z) }, p2: { x: r4(sg.b.x), y: r4(sg.b.y), z: r4(sg.b.z) }, amb: ambId, ambParte: parte };
          /* a tomada diz EM QUAL tubo de esgoto ela liga (js/biminst.js só faz o tê nele — D-07: antes qualquer esgoto que
             encostasse na ponta "continua" virava tê) */
          if (i === 0) { vt.continua = "p1"; if (b.c && b.c.trecho != null) vt.tomada = String(b.c.trecho); }
          novas.push(vt);
        });
        return vt;
      }
      /* as VIGAS que a subida atravessa: rasgo/escarificação marcado no modelo + aviso (o estrutural decide) */
      function rasgos(b, dn) {
        var out0 = [], x0 = b.q, y0 = Math.min(b.yW, b.top.y), y1 = Math.max(b.yW, b.top.y);
        arr(obstTodos.vigas).filter(function (v) { return !idsBald[v.id]; }).forEach(function (v) {
          var vt = num(v.topo, NaN), vb = vt - num(v.altura, 0); if (!isFinite(vt)) return;
          if (vt < y0 + EPS || vb > y1 - EPS) return;
          if (distSeg(x0, v.p1, v.p2) > num(v.largura, 0) / 2 + raio(dn) + EPS) return;
          var nR = out0.length + 1, id = pr + "rasgo" + nR;
          novas.push({ op: "anotar", id: id, x: r4(x0.x), y: r4((vt + vb) / 2), z: r4(x0.z), texto: "Escarificar/rasgo na viga " + v.id + " para o DN " + dn + " da ventilação — verificar com o projeto estrutural", amb: ambId, ambParte: "ventilacao" });
          out0.push({ viga: v.id, id: id, y: r4((vt + vb) / 2) });
        });
        return out0;
      }
      var Ltot = 0, dnCol = dnV, tab2 = null, dnEsgG = 0, rasg = [], subiuTerm = false;
      if (CV) {
        /* a subida + o trecho sob o teto até a coluna; a ponta na coluna é uma junção (tê) — "continua" na peça de junção */
        var subV = emitir(melhor, dnV, "ventilacao"), ultV = null;
        melhor.extra.segs.forEach(function (sg) { ultV = { op: "trecho", id: pr + (++nV), sistema: "ventilacao", material: mat, dn: dnV, p1: { x: r4(sg.a.x), y: r4(sg.a.y), z: r4(sg.a.z) }, p2: { x: r4(sg.b.x), y: r4(sg.b.y), z: r4(sg.b.z) }, amb: ambId, ambParte: "ventilacao" }; novas.push(ultV); });
        (ultV || subV).continua = (ultV || subV).continua === "p1" ? "ambos" : "p2";
        if (melhor.bate) aviso("a ventilação do ambiente até a coluna " + CV.id + " passa perto de outro tubo: confira", [subV.id], { tipo: "ajustar", ids: [subV.id] });
        rasg = rasgos(melhor, dnV);
        out.ventilacao = { dn: dnV, dnRamal: dnV, dnColuna: dnV, contato: melhor.c.P, tomada: { x: melhor.c.P.x, y: melhor.c.P.y, z: melhor.c.P.z, trecho: melhor.c.trecho, s: r4(melhor.c.s), ligacao: melhor.angMenor ? "juncao45" : "te90", acliveInicialPct: r4(melhor.aclive * 100) }, coluna: CV.id, colunaExistente: true, juncao: r4(yJunta), minTransbordamento: minTransb, topo: r4(yJunta), topoOrigem: "coluna de ventilação " + CV.id, desconectores: melhor.c.dists, ramais: [], rasgos: rasg };
      } else {
        /* COLUNA (o vertical até o terminal): Tabela 2 — DN do ramal de esgoto ventilado (o do grupo: o maior entre a
           tomada e a bacia, lado seguro), UHC do grupo e o comprimento da tomada ao terminal */
        melhor.segs.forEach(function (sg) { Ltot += d3(sg.a, sg.b); });
        dnEsgG = Math.max(num(melhor.c.dnEs, 0), dBa ? num(dBa.dn, 0) : 0);
        var tbCv = ctx.linhas("es.coluna_ventilacao", null, "ventilação: coluna (Tabela 2)");
        var linV = arr(tbCv).filter(function (l) { return num(l.dn_tubo_queda_ou_ramal_esgoto_mm, 0) === dnEsgG && num(l.uhc, -1) >= uT; }).sort(function (a, b) { return a.uhc - b.uhc; })[0];
        if (linV) [40, 50, 75, 100, 150, 200, 250, 300].some(function (d) { var v = linV["ventilador_dn" + d + "_m"]; if (v != null && num(v, -1) >= Ltot) { tab2 = { dn: d, Lmax: num(v, 0), uhc: num(linV.uhc, 0) }; return true; } return false; });   // hid:ok colunas da Tabela 2 (DN do ventilador)
        if (!tab2) pend("es.coluna_ventilacao", "DN da coluna de ventilação sem linha na Tabela 2 (ramal de esgoto DN " + dnEsgG + ", " + uT + " UHC, " + f2(Ltot) + " m): ficou o DN do ramal de ventilação", ids);
        else dnCol = HRcomercial("ventilacao", Math.max(dnV, tab2.dn));
        /* o TERMINAL do catálogo começa no DN 50 (ficha de esgoto série normal): a coluna DN 40 sobe no menor DN que tem
           terminal (lado seguro, com a redução no pé) — nunca um terminal inventado */
        var dnsT = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }), dnTerm = dnsT.filter(function (d) { return d >= dnCol - EPS; })[0];
        if (dnTerm != null && dnTerm > dnCol + EPS) { dnCol = dnTerm; subiuTerm = true; }
        coluna = emitir(melhor, dnV, "ventilacao", dnCol);
        if (melhor.bate) aviso("a subida da ventilação " + coluna.id + " passa perto de outro tubo: confira", [coluna.id], { tipo: "ajustar", ids: [coluna.id] });
        rasg = rasgos(melhor, dnCol);
        if (rasg.length) aviso("a ventilação " + coluna.id + " sobe embutida e atravessa a(s) viga(s) " + rasg.map(function (x) { return x.viga; }).join(", ") + ": escarificar/rasgo para o DN " + dnCol + " — verificar com o projeto estrutural", [coluna.id].concat(rasg.map(function (x) { return x.id; })), { tipo: "ajustar", ids: [coluna.id] });
        /* o TERMINAL DE VENTILAÇÃO no topo (a peça do produto: js/hidventgeo.js) */
        var idTerm = pr + "terminal";
        if (B.PECAS.terminal_ventilacao && arr(B.PECAS.terminal_ventilacao.dns).indexOf(String(dnCol)) >= 0) novas.push({ op: "peca", id: idTerm, peca: "terminal_ventilacao", sistema: "ventilacao", dn: String(dnCol), x: r4(coluna.p2.x), y: r4(coluna.p2.y), z: r4(coluna.p2.z), amb: ambId, ambParte: "ventilacao" });
        else { idTerm = null; coluna.continua = coluna.continua ? "ambos" : "p2"; pend("amb.ventilacao.terminal", "terminal de ventilação DN " + dnCol + " sem peça no catálogo: a ponta ficou aberta", [coluna.id]); }
        /* o prolongamento acima da cobertura é do RT (4.3.5 / 4.3.6): a altura de saída é de projeto */
        var tCob = NR.terminal("acima_cobertura_min", "ventilação: terminal acima do telhado (4.3.6)"), tLaje = NR.terminal("acima_laje_uso_min", "ventilação: terminal acima de laje utilizada (4.3.6)"), tJan = NR.terminal("afastamento_janela_min", "ventilação: afastamento de janelas (4.3.5)"), tVer = NR.terminal("acima_verga_alternativa", "ventilação: acima da verga (4.3.5)");
        if (tCob == null || tLaje == null || tJan == null) pend("es8160.terminal_ventilacao", "alturas do terminal acima da cobertura (NBR 8160 4.3.5/4.3.6) sem tabela", [coluna.id]);
        else pend("amb.ventilacao.terminal", "Terminal da ventilação a " + f2(hSaida) + " m do piso (altura de saída do projeto, editável): prolongar acima da cobertura conforme NBR 8160 4.3.5/4.3.6 — " + f2(tCob) + " m acima do telhado, " + f2(tLaje) + " m acima de laje utilizada, " + f2(tJan) + " m de janelas e portas" + (tVer != null ? " (ou " + f2(tVer) + " m acima da verga)" : "") + " — o RT confere na obra", [coluna.id].concat(idTerm ? [idTerm] : []), { tipo: "parametro", campo: "alturaSaidaVentilacao" });
        var tpC = topoVentilacao(estado, piso, tetoA, NR);
        if (!tpC.pend && tpC.y > coluna.p2.y + EPS) aviso("a cobertura do modelo pede o terminal a " + f2(tpC.y) + " m (" + tpC.origem + "): a altura de saída da ventilação (" + f2(hSaida) + " m do piso) fica abaixo — aumente-a", [coluna.id], { tipo: "parametro", campo: "alturaSaidaVentilacao" });
        /* 4.3.11 / 4.3.12: a edificação precisa de UM ventilador primário DN 100 — não é a ventilação deste banheiro */
        var dn100 = NR.regraVent("ventilador_predio_terreo_dn", "ventilação: ventilador primário da edificação (4.3.11/4.3.12)");
        var temV100 = dn100 != null && novas.concat(arr(estado.instalacoes && estado.instalacoes.trechos)).some(function (t) { return (t.op == null || t.op === "trecho") && t.sistema === "ventilacao" && num(t.dn, 0) >= dn100; });
        if (dn100 != null && !temV100) pend("es8160.ventilador_primario", "NBR 8160 4.3.11/4.3.12: a edificação precisa de pelo menos um tubo ventilador primário DN " + dn100 + " (ligado à caixa de inspeção, ao coletor, ao subcoletor ou ao ramal de uma bacia e prolongado acima da cobertura) — a ventilação deste ambiente é o ramal DN " + dnV + " da Tabela 8 e não o substitui: definir com o RT", ids);
        out.ventilacao = { dn: dnV, dnRamal: dnV, dnColuna: dnCol, tabela2: tab2, comprimento: r4(Ltot), minTransbordamento: minTransb, contato: melhor.c.P, tomada: { x: melhor.c.P.x, y: melhor.c.P.y, z: melhor.c.P.z, trecho: melhor.c.trecho, s: r4(melhor.c.s), ligacao: melhor.angMenor ? "juncao45" : "te90", acliveInicialPct: r4(melhor.aclive * 100), sMin: fatorDn != null && desc[0].dn ? r4(fatorDn * desc[0].dn / 1000) : null, limite: desc[0].limite, desconector: desc[0].ref },
                           coluna: coluna.id, parede: melhor.w ? melhor.w.id : null, topo: r4(coluna.p2.y), alturaSaida: hSaida, topoOrigem: "altura de saída da ventilação (" + f2(hSaida) + " m do piso, parâmetro)", terminal: idTerm, desconectores: melhor.c.dists, ramais: [], rasgos: rasg };
      }
      /* RAMAL DE VENTILAÇÃO para o desconector que ficou longe do ponto ventilado: sobe na parede perto dele e corre
         sob o teto, com aclive, até a coluna (junção no meio dela = tê) */
      melhor.c.dists.filter(function (d) { return !d.ok; }).forEach(function (d) {
        var q = desc.filter(function (x) { return x.ref === d.ref; })[0], cs = q ? candidatos(q) : [];
        var uq = out.caixaSifonada && out.caixaSifonada.id === d.ref ? num(out.caixaSifonada.uhc, 0) : 0, dnR = NR.dnVentRamal(0, uq, "ventilação: ramal de " + d.ref);
        if (dnR == null || !cs.length) { pend("amb.ventilacao." + d.ref, d.ref + (d.L == null ? " não passa pelo ponto da ventilação" : " a " + f2(d.L) + " m do ponto ventilado (máximo " + f2(d.limite) + " m, DN " + d.dn + ")") + " e não coube um ramal de ventilação próprio: ponha à mão", [d.ref], { tipo: "ajustar", ids: [d.ref] }); return; }
        dnR = HRcomercial("ventilacao", dnR);
        /* o ramal corre sob o teto e entra na coluna ABAIXO do topo dela (a junção precisa de coluna dos dois lados) */
        var yTopoR = r4(Math.min(tetoA.y, coluna.p2.y) - geo(par, "margemNo") * 2 - raio(dnCol)), bR = null;
        cs.forEach(function (c) {
          var b = subida(c, raio(dnR), function (qq) { return r4(yTopoR - (Math.abs(qq.x - coluna.p1.x) + Math.abs(qq.z - coluna.p1.z)) * ac); }, ateColuna(coluna));
          if (b && (!bR || b.nota < bR.nota - EPS)) bR = b;
        });
        if (!bR) { pend("amb.ventilacao." + d.ref, "ramal de ventilação de " + d.ref + ": sem caminho livre até a coluna — ponha à mão", [d.ref], { tipo: "ajustar", ids: [d.ref] }); return; }
        var sub = emitir(bR, dnR, "ventilacao_ramal"), ult = sub.p2;
        bR.extra.segs.forEach(function (sg) { novas.push({ op: "trecho", id: pr + (++nV), sistema: "ventilacao", material: mat, dn: dnR, p1: { x: r4(sg.a.x), y: r4(sg.a.y), z: r4(sg.a.z) }, p2: { x: r4(sg.b.x), y: r4(sg.b.y), z: r4(sg.b.z) }, amb: ambId, ambParte: "ventilacao_ramal" }); ult = sg.b; });
        var dR = bR.c.dists.filter(function (x) { return x.ref === d.ref; })[0];
        out.ventilacao.ramais.push({ desconector: d.ref, dn: dnR, L: dR.L, limite: dR.limite, juncao: { x: r4(ult.x), y: r4(ult.y), z: r4(ult.z) } });
        d.ramal = { dn: dnR, L: dR.L };
        if (bR.bate) aviso("o ramal de ventilação de " + d.ref + " passa perto de outro tubo: confira", [d.ref], { tipo: "ajustar", ids: [d.ref] });
      });
      if (melhor.semIni) aviso("ventilação ligada em ângulo menor (junção 45°) com o trecho inicial no aclive mínimo de " + f2(ac * 100) + " %: o enchimento sob o piso não deixa o aclive de " + f2(acIni * 100) + " % da NBR 8160 4.3.16 b 2 — aumente o rebaixo/enchimento ou leve a tomada para perto da parede", ids, { tipo: "parametro", campo: "alturaEnchimento" });
      var cx0 = melhor.c, sMin0 = fatorDn != null && desc[0].dn ? fatorDn * desc[0].dn / 1000 : null;
      decide("amb.ventilacao", "Ventilação DN " + dnV + " pela Tabela 8 da NBR 8160 (ramal de ventilação, grupo " + (temBacia ? "com" : "sem") + " bacia, " + uT + " UHC)" +
        (CV ? "" : "; coluna DN " + dnCol + (tab2 ? " pela Tabela 2 (ramal de esgoto DN " + dnEsgG + ", " + uT + " UHC ≤ " + tab2.uhc + ", " + f2(Ltot) + " m ≤ " + f2(tab2.Lmax) + " m para DN " + tab2.dn + ")" : " (Tabela 2 sem linha: pendente)") + (subiuTerm ? ", no menor DN que tem terminal de ventilação no catálogo" : "")) +
        ". Tomada no ramal de " + desc[0].ref + (desc[0].caixa && dBa ? " (caixa sifonada), antes da junção com o ramal da bacia," : "") + " a " + f2(cx0.s) + " m do desconector" + (sMin0 != null ? " (mínimo 2 × DN = " + f2(sMin0) + " m, 4.3.16 b 4" : " (") + (desc[0].limite != null ? "; máximo " + f2(desc[0].limite) + " m pela Tabela 1, DN " + desc[0].dn + ")" : ")") +
        (melhor.angMenor ? ", por junção 45° (sem espaço vertical sob o piso para a derivação a 90° com o tubo acima do ramal: ângulo menor, 4.3.16 b 2) e trecho inicial em aclive de " + f2(melhor.aclive * 100) + " %" + (acl2 == null ? " (o da 4.3.16 b 2 pendente)" : (melhor.semIni ? " (o de " + f2(acIni * 100) + " % da 4.3.16 b 2 não coube no enchimento: aviso)" : "")) + ", o restante a " + (acl == null ? "— (pendente)" : f2(acl) + " %")
                         : ", por tê 90° acima do eixo e trecho inicial em aclive de " + (acl == null ? "— (pendente)" : f2(acl) + " %")) +
        (CV ? ", subindo embutida no eixo da parede e correndo sob o teto até a coluna de ventilação " + CV.id + " (junção a " + f2(yJunta) + " m" + (minTransb != null ? "; mínimo " + f2(minTransb) + " m = topo do aparelho mais alto + a altura da tabela, fonte secundária" : "") + ")"
            : ", subindo embutida no eixo da parede até " + f2(hSaida) + " m do piso (altura de saída do projeto) com o terminal de ventilação DN " + dnCol + (rasg.length ? "; rasgo na(s) viga(s) " + rasg.map(function (x) { return x.viga; }).join(", ") + " a verificar com o projeto estrutural" : "")) + "; " +
        melhor.c.dists.map(function (d) { return d.ok ? d.ref + " a " + f2(d.L) + " m do ponto ventilado (máx. " + f2(d.limite) + " m, DN " + d.dn + ")" : d.ref + (d.ramal ? " com ramal de ventilação DN " + d.ramal.dn + " a " + f2(d.ramal.L) + " m dele" : " SEM ventilação (pendente)"); }).join("; ") + ".");
    }
  }
  function uniqB(cruz) { var o = []; cruz.forEach(function (q) { if (o.indexOf(q.b.id) < 0) o.push(q.b.id); }); return o.join(", "); }
  function HRcomercial(sis, dn) { var ds = (BI().MATERIAIS[BI().SISTEMAS[sis].material] || {}).dns || []; var ok = ds.filter(function (d) { return d >= dn - EPS; }); return ok.length ? ok[0] : dn; }
  /* ponto no eixo embutido da parede mais perto: projeção na face do lado do ponto + embutir para dentro */
  function projParede(p, w, emb) {
    var a = w.p1, b = w.p2, dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > EPS)) return null;
    var ux = dx / L, uz = dz / L, t = (p.x - a.x) * ux + (p.z - a.z) * uz; if (t < 0 || t > L) return null;
    var nx = -uz, nz = ux, lado = (p.x - a.x) * nx + (p.z - a.z) * nz, s = lado >= 0 ? 1 : -1, off = num(w.espessura, 0) / 2 - emb;
    /* o ponto está dentro da parede: só serve para o EIXO (a ventilação que sai do ramal que corre sob a parede sobe ali mesmo) */
    if (Math.abs(lado) < num(w.espessura, 0) / 2 && emb < num(w.espessura, 0) / 2 - EPS) return null;
    return { x: r4(a.x + ux * t + nx * s * off), z: r4(a.z + uz * t + nz * s * off) };
  }
  /* até onde sobe o ventilador: cobertura do modelo + terminal da 8160; sem cobertura, para no teto e pende */
  function topoVentilacao(estado, piso, teto, NR) {
    var cobs = arr(estado.coberturas), tels = arr(estado.telhados), y = null, origem = "";
    cobs.forEach(function (cb) { arr(cb.planos).forEach(function (p) { var yt = num(p.cy, NaN) + num(p.espessura, 0) / 2; if (isFinite(yt) && (y == null || yt > y)) { y = yt; origem = "cobertura " + cb.id; } }); });
    tels.forEach(function (t) { var yt = num(t.cumeeira, num(t.topo, NaN)); if (isFinite(yt) && (y == null || yt > y)) { y = yt; origem = "telhado " + t.id; } });
    if (y != null && y > piso) {
      var ac = NR.terminal("acima_cobertura_min", "ventilação: terminal acima da cobertura");
      if (ac == null) return { y: y, origem: origem + " (terminal pendente)", pend: { chave: "es8160.terminal_ventilacao", motivo: "altura do terminal acima da cobertura sem tabela" } };
      return { y: y + ac, origem: origem + " + " + f2(ac) + " m (NBR 8160, 4.3.6)" };
    }
    /* sem cobertura/telhado no modelo: o terminal fica o mínimo da 8160 acima do TOPO MAIS ALTO da obra (parede ou laje) — a
       pendência continua: o telhado real pode passar disso */
    var topos = arr(estado.caixas).filter(function (c) { return c && (c.tipo === "parede" || c.tipo === "laje"); }).map(function (c) { return c.cy + num(c.altura, 0) / 2; });
    var ac2 = NR.terminal("acima_cobertura_min", "ventilação: terminal acima da cobertura");
    if (topos.length && ac2 != null) {
      var yMax = Math.max.apply(null, topos);
      return { y: r4(yMax + ac2), origem: "topo da parede/laje mais alta (" + f2(yMax) + " m) + " + f2(ac2) + " m (NBR 8160, 4.3.6)", pend: { chave: "amb.cobertura", motivo: "o modelo não tem cobertura/telhado: o terminal da ventilação ficou " + f2(ac2) + " m acima do topo da parede/laje mais alta (" + f2(yMax) + " m) — confira com o telhado real (NBR 8160, 4.3.6)" } };
    }
    return { y: teto.y, origem: teto.origem, continua: true, pend: { chave: "amb.cobertura", motivo: "o modelo não tem cobertura/telhado sobre o ambiente: o ventilador parou no teto (" + f2(teto.y) + " m) — prolongue até acima da cobertura (NBR 8160, 4.3.6)" } };
  }

  var HidAmbiente = { VERSAO: 1, GEO_AMB: GEO_AMB, ligar: ligar, membros: membros, duplicados: duplicados, tipoDisp: tipoDisp, dispositivosFamilia: dispositivosFamilia, _int: { vivas: vivas, localCaixa: localCaixa, pecaCaixa: pecaCaixa, esperaFora: esperaFora, grafoEs: grafoEs, projParede: projParede, limpeza: limpeza, noPavimento: noPavimento, topoVentilacao: topoVentilacao, verticais: verticais } };
  global.HidAmbiente = HidAmbiente;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAmbiente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
