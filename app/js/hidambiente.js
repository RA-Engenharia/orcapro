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
  /* FRENTE H4 (21/10/2026) — 2+ APARELHOS IGUAIS indo ao MESMO destino pelo ramal (2 cubas/pias → caixa de gordura; 2 tanques
     → espera da área de serviço). Com o destino logo atrás do 1º ponto, o ramal do outro chegava ao destino por baixo do 1º e o
     1º, sem trecho reto para a junção de 45°, dava a volta (ia 30 cm para o lado errado e voltava com duas curvas) ou ficava
     SEM TUBO (o 2º não entra no destino: uma entrada por ambiente). O ponto de referência do destino vai para ALÉM do ponto da
     ponta, do lado de p0, à distância de uma junção de 45° do HidRota dos dois lados (2 × (perna do desvio + 2 × distância
     mínima entre nós)): o ramal do mais a montante passa sob os outros, que entram nele com junção de 45° antes do destino.
     cs = os pontos de esgoto; p0 = a referência de antes (o 1º ponto). Um ponto só: p0 sem mudança. */
  function alemDaPonta(cs, p0, par) {
    if (!p0 || arr(cs).length < 2 || !HR() || !HR().GEO) return p0;
    var Gr = HR().GEO, cF = cs.slice().sort(function (a, b) { return d2(b, p0) - d2(a, p0); })[0], Lp = d2(cF, p0);
    if (!(Lp > EPS)) return p0;
    var u = { x: (p0.x - cF.x) / Lp, z: (p0.z - cF.z) / Lp };
    var ponta = cs.slice().sort(function (a, b) { return ((a.x - cF.x) * u.x + (a.z - cF.z) * u.z) - ((b.x - cF.x) * u.x + (b.z - cF.z) * u.z); }).pop();
    var dJ = 2 * (num(par && par.chanfro, Gr.chanfro) + 2 * num(par && par.margemNo, Gr.margemNo));
    return { x: r4(ponta.x + u.x * dJ), y: ponta.y, z: r4(ponta.z + u.z * dJ), dn: ponta.dn, alemDaPonta: true };
  }
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
  var CAMADA_PAREDE = 0.0375, CAMADA_FUNDA = 0.05, COBRE_CAMADA = 0.005;   // hid:ok 3,75 cm do eixo: a camada atrás do tubo de água na parede de 15 cm (o tubo de água corre a 5 cm da face); 5 cm: a mais funda, com 5 mm até a face
  var PESO_PROFUNDIDADE = 40;   // hid:ok pesa mais que passar perto da água (30)
  var PESO_SOLTO = 40;   // hid:ok pesa mais que passar perto da água (30): trecho de ventilação correndo fora de parede, acima do piso
  /* ⚠ 21/10/2026: o ENCAIXE das conexões da subida pesa 95 na nota da escolha — abaixo da colisão com outro tubo (100, agora também a
     subida cruzando ela mesma e a que passa na caixa sifonada/ralo: o auditor achou as duas quando o encaixe passou a pesar) e da violação
     de norma (1000). O tê vertical sobe o que as peças medidas pedem quando o enchimento deixa; o que não encaixa vira PENDÊNCIA com os mm */
  var PESO_BATE_DURO = 100, PESO_BATE_AFAST = 30;   // hid:ok N23: pesos da escolha da subida — colisão física (100 + 100) > encaixe (95) > só o afastamento da água (30)
  var EPS_ENCAIXE = 0.001, MARGEM_ENCAIXE = 0.003, PESO_ENCAIXE = 95;   // hid:ok 1 mm de tolerância no encaixe e 3 mm de sobra na escolha (a tangência real da peça difere um nada da conta); os pesos da escolha (ordem acima)
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
    corredorDesconector: 0.60, // hid:ok N23 (23/10/2026): até esta distância em planta do ponto de esgoto de OUTRO desconector do ambiente, o deitado/desvio de uma ventilação passa por cima de onde ele vai subir (a 2ª pia)
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
  /* ⚠ PRIORIDADE de 21/10/2026 (print do Rogério, a ventilação no tê): quando o tê do ramal + o joelho da ventilação não cabem sob o
     piso (o ramal raso: no projeto real 8 cm para 15 cm), o traçado APROFUNDA o esgoto do ambiente só o que falta — a faixa do esgoto
     no enchimento desce (HidRota reservaVentilacao, agora também no térreo), a declividade fica e o corpo da caixa sifonada desce com o
     prolongador (js/biminstgeo.js corpoPeca). Refaz o ambiente uma vez com a faixa nova; só fica com o refeito se ele ENCAIXA e a faixa
     se manteve (no andar, o rebaixo/a laje: o esgoto descido não pode entrar na laje — aí fica o de antes, com a pendência e o Corrigir). */
  function clonePar(e, par, reserva) {
    var par2 = {}; Object.keys(par).forEach(function (k) { par2[k] = par[k]; }); par2.reservaVentilacao = reserva; par2._reservaEncaixe = true;
    var e2 = {}; Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); e2.parametros = par2;
    return e2;
  }
  function pendEncaixe(r) { return arr(r && r.pendencias).filter(function (p) { return p.chave === "amb.ventilacao_encaixe"; })[0] || null; }
  function batidasVent(r) { return arr(r && r.avisos).filter(function (a) { return /ventila[çc][ãa]o.*passa perto de outro tubo/.test(String(a && a.texto || "")); }).length; }
  /* o refazer do ENCAIXE (a pendência com o que falta no 1º trecho): devolve { r2 } quando o refeito encaixa, ou { reserva, r2 } */
  function aprofundarEncaixe(e, r, par) {
    var pe = arr(r && r.pendencias).filter(function (p) { return p.chave === "amb.ventilacao_encaixe" && p.acao && num(p.acao.falta0Mm, 0) > EPS_ENCAIXE * 1000 && p.acao.yTomada != null; })[0];
    if (!pe) return null;
    var a = pe.acao, falta = num(a.falta0Mm, 0) / 1000 + MARGEM_ENCAIXE;   /* o que falta no trecho do tê (o 1º da subida) */
    /* o topo do ramal na tomada desce o que falta: a faixa do esgoto termina ali (o resto do ramal sobe a montante pela declividade) */
    var reserva = r4(Math.max(num(a.reserva, 0), num(a.piso, 0) - num(a.cobrimento, 0) - (num(a.yTomada, 0) - falta + raio(num(a.dnEs, 0)))));
    if (!(reserva > num(a.reserva, 0) + EPS)) return { pe: pe, reserva: reserva, base: num(a.reserva, 0), r2: null, ok: false };
    var r2 = null; try { r2 = ligar0(clonePar(e, par, reserva)); } catch (eR) { r2 = null; }
    var ok = !!(r2 && r2.ok && r2.reservaEncaixe > EPS && !pendEncaixe(r2));
    return { pe: pe, reserva: reserva, base: num(a.reserva, 0), r2: r2, ok: ok };
  }
  /* ENCAIXE DAS PEÇAS (07/11/2026, prints do Rogério na 1.2.262 — js/hidencaixe.js): DEPOIS da opção escolhida (a escolha não muda), o tubo que
     chega na caixa sifonada / no ralo aponta para o centro e o desvio curto que não comporta as peças é folgado (chanfro, perna que some,
     deslizar, canto). Vale para o "Ligar ambiente", o Traçar automaticamente e o prédio (todos passam por aqui). O que não tem solução fica para o
     auditor de encaixe 3D. par._semEncaixe = o traçado de antes (controle negativo) */
  function ligarBase(e) {
    var r = ligarSemEncaixe(e), par = (e && e.parametros) || {};
    var semEnc = par._semEncaixe || (typeof process !== "undefined" && process.env && process.env.HID_SEM_ENCAIXE === "1");   /* controle negativo do test-hid-encaixe */
    if (!r || !r.ok || !arr(r.ops).length || semEnc || par._reservaEncaixe) return r;
    var HEn = dep("HidEncaixe", "./hidencaixe.js"), B = BI(), E = BE(), HG = dep("HidGeo", "./biminstgeo.js");
    if (!HEn || !B || !E || !HG) return r;
    try {
      var plano = [], ids = {}; (function ach(L) { arr(L).forEach(function (o) { if (!o) return; if (o.op === "lote") ach(o.ops); else { plano.push(o); if (o.op === "trecho") ids[String(o.id)] = 1; } }); })(r.ops);
      var est = E.aplicar(arr(e.ops).concat([{ op: "lote", id: "amb-encaixe", ops: r.ops }])), ins = est.instalacoes || {};
      var fixos = arr(ins.trechos).filter(function (t) { return !ids[String(t.id)]; }).map(function (t) { var o = {}; Object.keys(t).forEach(function (k) { o[k] = t[k]; }); o.op = "trecho"; return o; });
      var pontos = arr(B.rede(est, e.avaliarFam).conectores).map(function (k) { return { x: k.x, y: k.y, z: k.z }; });
      var rad = HEn.radial(plano, arr(ins.pecas), { fixos: fixos, pontos: pontos });
      /* o toco da borda ao centro da caixa/ralo que o radial juntou ao trecho que chega: sai do plano (um tubo só) */
      if (arr(rad.apagar).length) { var apR = {}; rad.apagar.forEach(function (id) { apR[id] = 1; }); plano = plano.filter(function (o) { return !(o.op === "trecho" && apR[String(o.id)]); }); (function tiraR(L) { for (var i = L.length - 1; i >= 0; i--) { var o = L[i]; if (!o) continue; if (o.op === "lote") tiraR(o.ops); else if (o.op === "trecho" && apR[String(o.id)]) L.splice(i, 1); } })(r.ops); }
      var fo = HEn.folgar(plano, { fixos: fixos, pontos: pontos, pecas: arr(ins.pecas), familias: arr(est.familias), avaliarFam: e.avaliarFam, BimInst: B, HidGeo: HG });
      arr(fo.novos).forEach(function (o) { r.ops.push(o); });
      if (fo.apagar.length) { var ap = {}; fo.apagar.forEach(function (id) { ap[id] = 1; }); (function tira(L) { for (var i = L.length - 1; i >= 0; i--) { var o = L[i]; if (!o) continue; if (o.op === "lote") tira(o.ops); else if (o.op === "trecho" && ap[String(o.id)]) L.splice(i, 1); } })(r.ops); }
      if (rad.ajustes.length || fo.ajustes.length) r.encaixe = { radial: rad.ajustes, folgas: fo.ajustes };
      /* o que não coube: pendência com o que é, por quê e o que fazer (afastar o tubo de queda/a peça), e o Mostrar no 3D */
      arr(fo.pendentes).forEach(function (pe) {
        var tx = pe.texto ? pe.texto : "Encaixe: o trecho " + pe.trecho + " (" + pe.sistema + ", DN " + pe.dn + ") não comporta as duas conexões — faltam " + pe.mm + " mm. Afaste o tubo de queda (ou a peça) dessa distância e trace de novo; nunca um joelho de 90° no horizontal do esgoto (NBR 8160)";
        (r.pendencias = r.pendencias || []).push({ chave: "amb.encaixe", motivo: tx, texto: tx, elementos: [pe.trecho].concat(pe.outro ? [pe.outro] : []), acao: { tipo: "ajustar", ids: [pe.trecho].concat(pe.outro ? [pe.outro] : []) } });
      });
    } catch (eEn) {
      /* a falha do ajuste nunca fica calada (revisão 08/11/2026): o traçado sai como estava, com a pendência e o motivo */
      r.encaixeErro = String(eEn && eEn.message || eEn);
      (r.pendencias = r.pendencias || []).push({ chave: "amb.encaixe", motivo: "Ajuste de encaixe não rodou (" + r.encaixeErro + "): o traçado ficou sem o ajuste das peças — confira o encaixe no 3D", texto: "Ajuste de encaixe não rodou (" + r.encaixeErro + "): o traçado ficou sem o ajuste das peças — confira o encaixe no 3D", elementos: arr(r.ops).filter(function (o) { return o && o.op === "trecho"; }).map(function (o) { return String(o.id); }) });
    }
    return r;
  }
  /* LAVATÓRIO DIRETO AO RAMAL (08/11/2026 — ESGOTO_VOLTA do lavatório na CASA-COMPLETA e das cubas da bancada de 2 cubas): o lavatório tem sifão próprio
     (NBR 8160) e pode ir direto ao ramal por junção de 45°; a caixa sifonada só vale quando o caminho por ela não dá a volta. A MESMA régua do auditor
     (tools/hid-auditar-encaixe.js, ESGOTO_VOLTA "longe"): o caminho do ponto de esgoto do lavatório até onde o tubo encontra a rede (o pé da linha, onde o
     HidRede.gerar põe a 1ª caixa de inspeção) anda mais de 2 × a distância em linha reta e mais de 1,5 m além dela. Medido no traçado FINAL, depois do ajuste de
     encaixe (a medida antes do ajuste saía 0,2 m menor, e na caixa do 1º candidato — antes da troca por uma alternativa —: 1,24 m contra os 4,5 m do auditor).
     Refaz o ambiente UMA vez com par._lavDireto = os lavatórios que voltam; fica o refeito se ele liga, não ganha pendência e não deixa lavatório voltando */
  function ligar(e) {
    var r = ligarBase(e), par = (e && e.parametros) || {};
    var m = r && r.ok ? r.medidaLavatorio : null;
    if (!m || arr(par._lavDireto).length || par._reservaEncaixe) return r;
    var volta = [];
    m.lavs.forEach(function (c) {
      var Lc = caminhoPlantaEs(r.ops, c, m.Pd, m.caixa, true), Lr = Lc + d2(m.Pd, m.q), Dr = d2(c, m.q);
      if (Lc > 0 && Lr > 2 * Dr && Lr - Dr > 1.5) volta.push({ id: c.id, ate: r4(Lr), reta: r4(Dr) });   // hid:ok a régua do ESGOTO_VOLTA
    });
    if (!volta.length) return r;
    var ids = []; volta.forEach(function (v) { if (ids.indexOf(v.id) < 0) ids.push(v.id); });
    var tx = volta.map(function (v) { return v.id + ": " + f2(v.ate) + " m contra " + f2(v.reta) + " m em linha reta"; }).join("; ");
    /* a volta que fica nunca é calada (revisão 09/11/2026, A4): o lavatório continua indo à caixa, com o motivo */
    var ficaVolta = function (motivo) { (r.avisos = r.avisos || []).push({ texto: "lavatório " + ids.join(", ") + ": o esgoto vai até a caixa sifonada e volta (" + tx + "). Tentei ligar direto ao ramal e não fechou: " + motivo, elementos: ids.slice(), acao: { tipo: "ajustar", ids: ids.slice() } }); return r; };
    /* LAVABO COM RALO (pendência 4 da 1.2.283, decisão 13/11/2026 — antes era a guarda A3, que deixava o lavatório voltando): a caixa sifonada posta no
       modelo é o ponto de lavagem do piso que o projeto quer — ela FICA, ligada ao ramal, e o lavatório vai direto (sifão próprio, NBR 8160). Sem caixa
       nem ralo no modelo, o lavabo não ganha ralo inventado (a NBR 8160 não exige ralo no lavabo): o aviso M7 diz como pôr. */
    var caixaFica = m.caixaUsuario && m.recept.every(function (q) { return ids.indexOf(String(q)) >= 0; }) ? m.caixaUsuario : null;
    var par2 = {}; Object.keys(par).forEach(function (k) { par2[k] = par[k]; }); par2._lavDireto = ids;
    var e2 = {}; Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); e2.parametros = par2;
    var r2 = null; try { r2 = ligarBase(e2); } catch (eL) { r2 = null; }
    if (!r2 || !r2.ok) return ficaVolta("sem caminho para o ramal" + (r2 && arr(r2.pendencias)[0] ? " (" + String(r2.pendencias[0].motivo || r2.pendencias[0].texto).slice(0, 120) + ")" : ""));
    if (pendenciaBarraDireto(r, r2)) return ficaVolta("ligado direto, ganharia pendência nova (" + String((arr(r2.pendencias).filter(function (p) { return !arr(r.pendencias).some(function (q) { return q.chave === p.chave; }); })[0] || arr(r2.pendencias)[0] || {}).motivo || "").slice(0, 120) + ")");
    /* e o refeito não pode continuar voltando: a conta é no traçado novo, como a do auditor */
    var aindaVolta = m.lavs.some(function (c) { if (ids.indexOf(c.id) < 0) return false; var Lc = caminhoPlantaEs(r2.ops, c, m.Pd, null, true), Lr = Lc + d2(m.Pd, m.q), Dr = d2(c, m.q); return Lc > 0 && Lr > 2 * Dr && Lr - Dr > 1.5; });   // hid:ok a régua do ESGOTO_VOLTA
    if (aindaVolta) return ficaVolta("ligado direto, o caminho ainda dá a volta");
    /* M7: sem nenhuma caixa no ambiente, o aviso diz que o piso ficou sem ponto de lavagem */
    var semCx = !r2.caixaSifonada && !arr(r2.ops).some(function x(o) { return o && (o.op === "lote" ? arr(o.ops).some(x) : (o.op === "peca" && /^(caixa_sifonada|ralo_)/.test(String(o.peca)))); });
    /* a descida perto do fim do ramal: a junção de 45° a favor do fluxo não cabe ali e o tubo anda para trás antes de entrar. É melhor que a volta de antes, e fica dito */
    var giroD = m.lavs.filter(function (c) { if (ids.indexOf(c.id) < 0) return false; var oG = {}; caminhoPlantaEs(r2.ops, c, m.Pd, null, true, oG); return oG.giro > GIRO_VOLTA; }).map(function (c) { return c.id; });
    /* N1 da revisão 09/11/2026 (volta 2): a derivação andando para trás entra no ramal contra o fluxo (NBR 8160 4.2.5.5). Fica a volta de antes, com o motivo */
    if (giroD.length) return ficaVolta("a descida do lavatório fica perto demais do fim do ramal para a junção de 45° a favor do fluxo; ligado direto, o esgoto andaria para trás e entraria contra o fluxo. Afaste o lavatório do fim do ramal e trace de novo");
    r2.avisos.push({ texto: "lavatório " + ids.join(", ") + " ligado direto ao ramal: o esgoto dele ia até a caixa sifonada e voltava (" + tx + ") — o lavatório tem sifão próprio (NBR 8160) e entra no ramal por junção de 45°" + (semCx ? ". O ambiente ficou sem caixa sifonada e, com ela, sem ponto de lavagem de piso (grelha): se o piso precisa de ralo, ponha-o e trace de novo" : ""), elementos: ids.slice(), acao: null });
    r2.decisoes.push({ id: "amb.lavatorio_direto", texto: "Lavatório " + ids.join(", ") + " direto ao ramal (o esgoto ia até a caixa sifonada e voltava: " + tx + ")." });
    if (caixaFica) {
      var cxLig = arr(r2.ops).some(function x(o) { return o && (o.op === "lote" ? arr(o.ops).some(x) : (o.op === "trecho" && o.sistema === "esgoto" && [o.p1, o.p2].some(function (p) { return p && Math.hypot(p.x - m.caixa.x, p.z - m.caixa.z) < 0.2; }))); });   // hid:ok 20 cm: o tubo que sai da caixa (raio do corpo)
      if (!cxLig) return ficaVolta("a caixa sifonada " + caixaFica + ", posta no modelo como ralo do lavabo, ficaria sem ligação ao ramal");
      r2.avisos.push({ texto: "lavabo com ralo: a caixa sifonada " + caixaFica + " fica como ponto de lavagem do piso, ligada ao ramal; o lavatório " + ids.join(", ") + " vai direto (sifão próprio). O fecho hídrico dela é mantido pela lavagem do piso", elementos: [caixaFica], acao: null });
      r2.decisoes.push({ id: "amb.lavabo_ralo", texto: "Lavabo com ralo: caixa sifonada " + caixaFica + " mantida como ponto de lavagem do piso; lavatório " + ids.join(", ") + " direto ao ramal." });
    }
    return r2;
  }
  function ligarSemEncaixe(e) {
    var r = ligar0(e), par = (e && e.parametros) || {};
    if (par._reservaEncaixe) return r;
    var A = aprofundarEncaixe(e, r, par);
    if (A && A.ok && !batidasVent(A.r2)) return A.r2;
    /* ⚠ N23 (23/10/2026, auditor COZ-2PIAS): a ventilação que só achou caminho BATENDO em outro tubo (o aviso "passa perto de outro
       tubo") num ramal raso — na cozinha de 2 pias a junção 45° da tomada corria rente ao próprio ramal até a descida da pia e a
       subida direta atravessava a descida dela. Aprofundar o esgoto do ambiente uns centímetros dá altura para o tê 90° e a subida
       vai para o lado livre da parede. Degraus de RELIGAR_DEGRAU (até RELIGAR_PASSOS); em cada um, se faltar só o encaixe do tê,
       aprofunda o que falta. Fica com o 1º que liga sem bater e sem pendência de encaixe; senão, o de antes. */
    var r1 = A && A.ok ? A.r2 : r;
    if (r1 && r1.ok && batidasVent(r1)) {
      var base = num(par.reservaVentilacao, 0);
      for (var k = 1; k <= RELIGAR_PASSOS; k++) {
        var e2 = clonePar(e, par, r4(base + k * RELIGAR_DEGRAU)), r2 = null; try { r2 = ligar0(e2); } catch (eR) { r2 = null; }
        if (!r2 || !r2.ok || batidasVent(r2)) continue;
        if (!pendEncaixe(r2)) return r2;
        var A2 = aprofundarEncaixe(e2, r2, e2.parametros);
        if (A2 && A2.ok && !batidasVent(A2.r2)) return A2.r2;
      }
    }
    if (A && A.ok) return A.r2;
    /* não coube (o rebaixo/a laje, ou ainda falta): fica o traçado de antes, com a pendência dizendo por quê e o Corrigir */
    if (A && A.pe) A.pe.motivo = A.pe.texto = A.pe.texto + " — o esgoto não pôde descer " + fcmAmb(A.reserva - A.base) + " cm no enchimento (" + (A.r2 && A.r2.reservaEncaixe > EPS ? "ainda não encaixa" : "o rebaixo/a laje não deixa") + ")";
    return r;
  }
  /* a pendência nova que barra é a de verdade; a de encaixe de poucos mm o projetista resolve: conta só quando passa de ENCAIXE_ACEITO_MM */
  function pendenciaBarraDireto(r, r2) {
    var novas = arr(r2.pendencias).filter(function (p) { var mm = /faltam (\d+) mm/.exec(String(p.motivo || p.texto || "")); return !(mm && Number(mm[1]) <= ENCAIXE_ACEITO_MM); }).length;
    return novas > arr(r.pendencias).length;
  }
  var GIRO_VOLTA = 140;   // hid:ok a meia-volta do auditor (ESGOTO_VOLTA, graus)
  /* o direto só é aceito com o encaixe completo (volta 2 da revisão de 09/11/2026): a peça sobreposta não troca a volta. Com 0 os 27 cenários do auditor saem iguais aos de 30 mm */
  var ENCAIXE_ACEITO_MM = 0;   // hid:ok nenhum milímetro de encaixe faltando no direto
  var RELIGAR_DEGRAU = 0.03, RELIGAR_PASSOS = 3;   // hid:ok degraus do aprofundamento do esgoto do ambiente (m) — a folga de montagem
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
      /* 27/10/2026 (Casa 487): o registro cujo tubo (ou a metade nova dele) foi apagado depois não é mais do modelo */
      return !(apag[alvo] > i) && !(o.op === "instAlterar" && o.trecho != null && apag[o.trecho] > i) && !(o.op === "acessorio" && o.trecho != null && (apag[o.trecho] > i || (o.novoId != null && apag[o.novoId] > i)));
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
    /* B2b (06/11/2026, Casa 487) — a linha da PASSAGEM LATERAL (js/hidimplantacao.js passagemLateral: a casa ocupa o lote e o coletor corre
       sob o piso até a frente). Ordem do Rogério (28/10/2026): "o banheiro do fundo NUNCA sai para o fundo". Sem face externa que chegue à
       linha sem passar sob outro cômodo, a regra de cima caía na face externa mais perto — a do quintal. Aqui o ambiente liga NA linha, no pé
       da perpendicular (onde a rede põe a caixa de inspeção da junção), deslizado ao longo dela para a caixa não encostar em parede. */
    var lat = LRe && LRe._int ? arr(redes).filter(function (r) { return r && r.lateral && arr(r.pontos).length >= 2; }) : [];
    if (lat.length) {
      var BIl = BI(), rCl = num(BIl && BIl.PECAS && BIl.PECAS.caixa_inspecao ? BIl.PECAS.caixa_inspecao.r : 0, 0), fpl = HIe && HIe.GEO_IMP ? HIe.GEO_IMP.folgaParede : 0;
      var livreP = function (q) { return !paredes.some(function (w) { return distSeg(q, w.p1, w.p2) < num(w.espessura, 0) / 2 + rCl + fpl - EPS; }); };
      var bq = null;
      lat.forEach(function (r) { var Lh = LRe._int.linha(r.pontos), q = LRe._int.projetar(Lh, p); if (q && (!bq || q.d < bq.q.d - EPS)) bq = { q: q, Lh: Lh }; });
      if (bq) {
        var q0 = bq.q, achou = livreP(q0) ? q0 : null;
        for (var k = 1; !achou && k <= 30; k++) {   // hid:ok até 1,50 m de cada lado, passo de 5 cm
          [1, -1].some(function (sg) { var sv = q0.s + sg * 0.05 * k; if (sv < 0 || sv > bq.Lh.L) return false; var qq = LRe._int.noPonto(bq.Lh, sv); if (livreP(qq)) { achou = qq; return true; } return false; });   // hid:ok passo de 5 cm
        }
        var qf = achou || q0;
        return { x: r4(qf.x), z: r4(qf.z), lateral: true };
      }
    }
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
    /* B2 (05/11/2026, Casa 487) — SEM linha da rede: a espera ia para a caixa envolvente de TODAS as paredes, inclusive os muros das divisas;
       na casa que ocupa o lote de ponta a ponta ela caía FORA DO LOTE (-0,15; 0,15) e o critério implantacao.foraDoLote descartava as duas
       estratégias do banho social. Critério RA ("nada fora do lote", 28/10/2026; PADRAO-IMPLANTACAO-ESGOTO.md: a espera fica na área externa):
       com o lote no modelo, a espera vai para a face externa mais perto DENTRO do lote (HidImplantacao.posicaoExterna, que já recua para caber);
       sem face externa que caiba, a caixa envolvente recuada é trazida para dentro da divisa (nunca fora). */
    var Ld = HIe && HIe.lote ? HIe.lote(estado) : null;
    if (HIe && Ld) {
      var BIe = BI(), rCI = num(BIe && BIe.PECAS && BIe.PECAS.caixa_inspecao ? BIe.PECAS.caixa_inspecao.r : 0, 0);   /* a espera é onde a rede põe a 1ª caixa: ela tem de caber ali */
      var cs0 = HIe.posicaoExterna(estado, p, { afast: geo(par, "recuoEspera"), raio: rCI, parametros: par, todos: true }) || [];
      var m0 = cs0.slice().sort(function (a, b) { return (Math.abs(p.x - a.pe.x) + Math.abs(p.z - a.pe.z)) - (Math.abs(p.x - b.pe.x) + Math.abs(p.z - b.pe.z)); })[0];
      if (m0) return { x: r4(m0.x), z: r4(m0.z) };
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
    if (Ld) {   /* B2: a espera NUNCA fora do lote — trazida para dentro da caixa da divisa, com o mesmo recuo */
      var lx = Ld.contorno.map(function (q) { return q.x; }), lz = Ld.contorno.map(function (q) { return q.z; }), mg = geo(par, "recuoEspera");
      var cx = Math.max(Math.min.apply(null, lx) + mg, Math.min(Math.max.apply(null, lx) - mg, lados[0].x)), cz = Math.max(Math.min.apply(null, lz) + mg, Math.min(Math.max.apply(null, lz) - mg, lados[0].z));
      return { x: r4(cx), z: r4(cz) };
    }
    return { x: r4(lados[0].x), z: r4(lados[0].z) };
  }

  /* ESPERA DEPOIS DOS APARELHOS (08/11/2026 — ESGOTO_VOLTA do tanque na CASA, CASA-AQ, CASA-CAIXA e CASA-COMPLETA): sem bacia, a espera nasce no pé da
     perpendicular do ponto de água; o tanque fica na MESMA linha dela (ou depois, no sentido da rede). O ramal do tanque só entra no tronco por junção de
     45° a favor do fluxo, a uma folga da raiz (HidRota folgaJuncao = chanfro + 2 × margemNo): sem essa folga a junção ia para o outro lado da raiz e o
     tubo do tanque andava 26 cm para trás e voltava (gancho). Aqui a espera anda ao longo da parede, no sentido em que o ramal dela segue até a linha da
     rede, até ficar uma folga DEPOIS do último tanque. `tanques` = os pontos de esgoto dos tanques; `p` = o ponto de água de onde a espera saiu (dá a
     normal da parede). Só age no caso do gancho (o tanque na linha da espera ou até 2 × folga depois dela) e só para um lugar livre (fora de ambiente, sem parede por
     dentro do caminho nem encostada, com a linha da rede ao alcance e dentro do lote). Devolve o novo ponto ou null (nada a mudar / não há lugar seguro: fica a espera de antes). */
  function esperaDepoisDosAparelhos(pE, p, tanques, redes, paredes, par, estado) {
    var HIe = HI(), LRe = dep("HidRede", "./hidrede.js"), Gr = HR() && HR().GEO;
    if (!HIe || !HIe._int || !LRe || !LRe._int || !Gr || !arr(tanques).length || !arr(redes).length) return null;
    var q = null;
    arr(redes).forEach(function (r) {
      if (!r || arr(r.pontos).length < 2) return;
      var pj = LRe._int.projetar(LRe._int.linha(r.pontos), pE, function (a, b) { return !HIe._int.cruzaDentro(estado, a, b, {}); });
      if (pj && (!q || pj.d < q.d - EPS)) q = pj;
    });
    var L = q ? d2(q, pE) : 0, Ln = d2(pE, p);
    if (!(L > EPS) || !(Ln > EPS)) return null;
    var u = { x: (q.x - pE.x) / L, z: (q.z - pE.z) / L }, n = { x: (pE.x - p.x) / Ln, z: (pE.z - p.z) / Ln };
    var un = u.x * n.x + u.z * n.z, tx = u.x - un * n.x, tz = u.z - un * n.z, Lt = Math.sqrt(tx * tx + tz * tz);
    if (Lt < 0.5) return null;   // hid:ok o ramal da espera até a rede sai perpendicular à parede: não há "depois" ao longo dela
    tx /= Lt; tz /= Lt;
    var folga = num(par && par.chanfro, Gr.chanfro) + 2 * num(par && par.margemNo, Gr.margemNo), falta = 0;
    arr(tanques).forEach(function (c) { falta = Math.max(falta, (c.x - pE.x) * tx + (c.z - pE.z) * tz + folga); });
    if (!(falta > EPS)) return null;
    /* ⚠ SÓ O CASO DO GANCHO: ele existe com o tanque na linha da espera ou logo depois dela (falta ≤ 2 × folga). Tanque mais longe ao longo da parede já
       entra no tronco por junção a favor do fluxo, sem gancho — e mover a espera até ele a levava longe (sala de 6 m, tanque em x = 4,2, rede em x = 4,8:
       a espera andava 4,11 m e criava volta de 265°). Nesse caso fica a espera de antes. */
    if (falta > 2 * folga + EPS) return null;
    var nova = { x: r4(pE.x + tx * falta), z: r4(pE.z + tz * falta) };
    /* o novo lugar tem de ser tão bom quanto o de esperaFora: fora de qualquer cômodo, sem parede por dentro do caminho e com a linha da rede ao alcance
       (o ramal da nova espera até a projeção dela na rede não cruza a edificação). Sem lugar livre: fica a espera de antes. */
    if (HIe.dentro(estado, nova, { parametros: par }).dentro) return null;
    if (HIe._int.cruzaDentro(estado, pE, nova, {})) return null;
    var q2 = null;
    arr(redes).forEach(function (r) {
      if (!r || arr(r.pontos).length < 2) return;
      var pj = LRe._int.projetar(LRe._int.linha(r.pontos), nova, function (a, b) { return !HIe._int.cruzaDentro(estado, a, b, {}); });
      if (pj && (!q2 || pj.d < q2.d - EPS)) q2 = pj;
    });
    if (!q2 || HIe._int.cruzaDentro(estado, nova, q2, {})) return null;
    /* folga das paredes: a espera nova fica a meia espessura + o raio da caixa de inspeção (no máximo 0,15 m) + folgaParede do eixo de qualquer parede.
       (Conta de antes desta revisão, mantida: a espera de esperaFora com a rede recua só recuoEspera da face e não tem o raio inteiro da caixa, 0,30 m.) */
    var rCI = num(BI() && BI().PECAS && BI().PECAS.caixa_inspecao ? BI().PECAS.caixa_inspecao.r : 0, 0), fp = HIe.GEO_IMP ? num(HIe.GEO_IMP.folgaParede, 0) : 0;
    if (paredes.some(function (w) { return distSeg(nova, w.p1, w.p2) < num(w.espessura, 0) / 2 + Math.min(rCI, 0.15) + fp - EPS; })) return null;   // hid:ok o raio da caixa limitado a 0,15 m: a conta de antes
    /* com o lote no modelo, a mesma regra final de posicaoExterna chamada como esperaFora a chama com a rede (sem raio): dentro da divisa e a folgaParede da borda */
    var Ld = HIe.lote ? HIe.lote(estado) : null;
    if (Ld) {
      var cL = Ld.contorno, dB = Infinity;
      for (var i = 0; i < cL.length; i++) dB = Math.min(dB, distSeg(nova, cL[i], cL[(i + 1) % cL.length]));
      if (!HIe._int.dentroPoli(nova, cL) || dB < fp - EPS) return null;
    }
    return nova;
  }

  /* o caminho em planta do esgoto que nasce em q, seguindo os tubos da opção (p1 → p2), passando pelas caixas, até o destino Pd (HidAmbiente.ligar: o ralo seco do box e o lavatório que voltam — a régua do ESGOTO_VOLTA do auditor) */
  function caminhoPlantaEs(ops, q, Pd, caixa, maisPerto, saida) {
    var ts = vivas(ops).filter(function (o) { return o.op === "trecho" && o.sistema === "esgoto" && o.p1 && o.p2; }), L = 0, P = { x: q.x, z: q.z }, guard = 0, vistos = {};
    var perto = function (a, b, r) { return Math.hypot(a.x - b.x, a.z - b.z) <= r; };
    /* a caixa do outro lado: o tubo passa a 15 cm do destino a caminho dela e continua (a caixa posta à mão, revisão 09/11/2026). Só chegou depois de passar pela caixa; se ele nunca vai à caixa, vale a primeira passagem */
    var passouCx = false, L0 = null, chegou = function () { if (!caixa || passouCx) return true; if (L0 == null) L0 = L; return false; };
    /* o giro acumulado em planta: a régua de meia-volta do auditor (ESGOTO_VOLTA) */
    var hd = null, giro = 0, gMax = 0, passo = function (a, b) { if (Math.hypot(b.x - a.x, b.z - a.z) < 0.01) return; var h = Math.atan2(b.z - a.z, b.x - a.x); if (hd != null) { var dg = h - hd; while (dg > Math.PI) dg -= 2 * Math.PI; while (dg < -Math.PI) dg += 2 * Math.PI; giro += dg; gMax = Math.max(gMax, Math.abs(giro)); } hd = h; };   // hid:ok 1 cm: o toco não tem direção
    while (guard++ < 200) {   // hid:ok anti-laço
      var t = ts.filter(function (u) { return !vistos[u.id] && perto(u.p1, P, 0.15); }).sort(function (a, b) { return maisPerto ? d2(a.p1, P) - d2(b.p1, P) : 0; })[0];   // hid:ok 15 cm: a saída do ralo/da caixa (raio de captura); maisPerto (a medida do lavatório, igual à do auditor): o trecho que COMEÇA mais perto (o do mictório a 12 cm não vale mais que a continuação a 7 cm). A troca do ralo do box segue com a medida dela
      if (!t) break; vistos[t.id] = 1; L += Math.hypot(t.p2.x - t.p1.x, t.p2.z - t.p1.z); passo(t.p1, t.p2); P = { x: t.p2.x, z: t.p2.z };
      var naCx = caixa && perto(P, caixa, 0.15);   // hid:ok captura da caixa
      if (perto(P, Pd, 0.35) && !naCx && chegou()) break;   // hid:ok o destino (a caixa de inspeção / o ponto)
      if (naCx) { passouCx = true; P = { x: caixa.x, z: caixa.z }; continue; }
      var seg = ts.filter(function (u) { if (vistos[u.id]) return false; var ax = u.p2.x - u.p1.x, az = u.p2.z - u.p1.z, L2 = ax * ax + az * az; if (!(L2 > 0)) return false; var k = ((P.x - u.p1.x) * ax + (P.z - u.p1.z) * az) / L2; return k > 0 && k < 1 && Math.hypot(u.p1.x + ax * k - P.x, u.p1.z + az * k - P.z) <= 0.02; })[0];   // hid:ok 2 cm
      if (seg) { vistos[seg.id] = 1; L += Math.hypot(seg.p2.x - P.x, seg.p2.z - P.z); passo(P, seg.p2); P = { x: seg.p2.x, z: seg.p2.z }; if (perto(P, Pd, 0.35) && chegou()) break; }   // hid:ok o destino
    }
    if (saida) saida.giro = gMax * 180 / Math.PI;
    return caixa && !passouCx && L0 != null ? L0 : L;
  }

  /* o pé da linha da rede para um ponto (onde o HidRede.gerar põe a caixa de inspeção da espera): o mesmo projetar, com a preferência pela área externa.
     Sem linha da rede desenhada: null */
  function pePeDaRede(estado, P) {
    var HIe = HI(), LRe = dep("HidRede", "./hidrede.js"), q = null;
    if (!LRe || !LRe._int) return null;
    arr(estado && estado.hidRedes).forEach(function (r) {
      if (!r || arr(r.pontos).length < 2) return;
      var aceita = HIe && HIe._int && !r.lateral ? function (a, b) { return !HIe._int.cruzaDentro(estado, a, b, {}); } : null;
      var pj = LRe._int.projetar(LRe._int.linha(r.pontos), P, aceita);
      if (pj && (!q || pj.d < q.d - EPS)) q = pj;
    });
    return q ? { x: q.x, z: q.z } : null;
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
  function ligar0(e) {
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
    var aparelhos = [], tipos = {}, baciaEs = null, recept = [], esperaCh = {}, aparentes = [];
    /* LAVATÓRIO DIRETO AO RAMAL (08/11/2026): o ligar0 acha que o esgoto do lavatório ia à caixa sifonada e dali ao destino dando a volta (out.lavVolta) e o
       ligar refaz o ambiente com par._lavDireto = os ids — o lavatório (sifão próprio, NBR 8160) entra no ramal por junção de 45°, como o tanque */
    var lavDiretos = {}; arr(par._lavDireto).forEach(function (id) { lavDiretos[String(id)] = 1; });
    function direto(id, tipo) { return !!lavDiretos[String(id)] && !!H.SIFAO_PROPRIO && !!H.SIFAO_PROPRIO[tipo] && tipo === "lavatorio"; }
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
      var gap = melhor == null ? null : melhor - d0, qual = c.sistema === "esgoto" ? "esgoto" : "água";
      if (gap != null && gap <= B.FACE_TOL) return null;
      if (gap != null && gap <= geo(par, "paredeAtrasMax")) {
        decide("amb.ponto_longe", "O ponto de " + qual + " de " + f.id + " está a " + fcmAmb(gap) + " cm da face da parede: o " + (c.sistema === "esgoto" ? "ramal de descarga sai do sifão por um toco horizontal, na altura do ponto, e desce EMBUTIDO na parede" : "ramal desce EMBUTIDO na parede até a projeção do ponto e sai por um toco horizontal, na altura do ponto, até ele") + ".");
        return { x: n.x, z: n.z, d: r4(melhor) };
      }
      aviso("o ponto de " + qual + " de " + f.id + " não encosta em parede: o " + (c.sistema === "esgoto" ? "esgoto desceria aparente atrás da louça" : "ramal sai da parede e chega aparente atrás/por cima da louça") + " — encoste o aparelho na parede (ou embuta o ponto à mão) e trace de novo", [String(f.id)], { tipo: "mover", ids: [String(f.id)] });
      return null;
    }
    /* N23 EMBUTIDO (26/10/2026 — print do Rogério: o esgoto da cuba descia APARENTE do sifão até o piso). O ponto de esgoto FORA da face
       de trás (a cuba de apoio: a saída da válvula no eixo da cuba; família do catálogo com o sifão no meio) de um aparelho de PAREDE
       (kit com saída de parede: lavatório, cuba, pia, tanque, bancada, mictório) procura a parede atrás dele pela normal da pose: o
       ramal sai do sifão na altura do ponto (a da ficha da louça), entra na parede e desce embutido. Sem parede atrás a até
       paredeAtrasMax (ilha, peça no meio do cômodo): o aviso com o Mover — nunca aparente calado. */
    var HEm = dep("HidEmbutido", "./biminstembutido.js");
    function esgotoDeParede(f, tipo) { var Kt = K.kits()[K.tipoDaFamilia(f.famId, f.tipoId)] || K.kits()[tipo]; return !!(Kt && Kt.esgoto && Kt.esgoto.tipo === "saida_parede"); }
    function pontoForaDaFace(c, f) {
      if (!HEm || !HEm.paredeAtras) return null;
      var rot = num(f.rotY, 0), n = { x: -Math.sin(rot), z: -Math.cos(rot) }, P = HEm.paredeAtras(estado, c, n, { alcance: geo(par, "paredeAtrasMax") });
      var es = c.sistema === "esgoto";
      if (!P) { aviso("o " + (es ? "esgoto" : "ponto de água") + " de " + f.id + (es ? " sai do sifão" : " fica") + " longe de parede (nenhuma a até " + fcmAmb(geo(par, "paredeAtrasMax")) + " cm atrás): " + (es ? "desceria" : "o ramal chegaria") + " aparente — encoste o aparelho na parede, faça um shaft ou marque Instalação aparente", [String(f.id)], { tipo: "mover", ids: [String(f.id)] }); return null; }
      if (es) decide("amb.esgoto_parede", "O esgoto de " + f.id + " sai do sifão a " + f2(c.y - piso) + " m do piso (ponto da ficha da louça) e entra na parede " + P.w.id + " a " + fcmAmb(P.face) + " cm atrás; desce EMBUTIDO até o ramal sob o piso.");
      else decide("amb.agua_parede", "O ponto de água de " + f.id + " (a " + f2(c.y - piso) + " m do piso) fica a " + fcmAmb(P.face) + " cm da parede " + P.w.id + ": o ramal desce EMBUTIDO nela e sai por um toco horizontal, na altura do ponto (o engate da louça).");
      return { x: P.n.x, z: P.n.z, d: P.face };
    }
    /* a parede que recebe o ponto: o tubo CABE nela (DE + cobrimento dos dois lados, a régua do alerta "Parede fina")? O eixo embutido
       fica onde cabe (prof = do ponto até o eixo); não cabe: o eixo no meio da parede + o cartão com o ENCHIMENTO/SHAFT (Corrigir) */
    function dnDoPonto(c, tipo) {
      if (num(c.dn, 0) > 0) return num(c.dn, 0);
      /* o ponto sem DN na família (pia genérica): o DN mínimo da norma para o aparelho (NBR 8160 Tabela 3 / NBR 5626) — o mesmo do traçado */
      var Nn = dep("HidNormas", "./hidnormas.js"), cx = Nn && Nn.contexto ? Nn.contexto() : null, q = null;
      try { q = cx ? (c.sistema === "esgoto" ? cx.consulta("es.aparelhos", { aparelho: tipo }, "dn_min", "embutido: " + tipo) : cx.consulta("af.aparelhos.dn_min", { aparelho: tipo }, "dn_min", "embutido: " + tipo)) : null; } catch (eN) { q = null; }
      return q && q.ok ? num(q.valor, 0) : 0;
    }
    var enchFeitos = {};
    function encaixar(c, parC, f, tipo) {
      if (!HEm || !parC) return parC;
      var P = HEm.paredeAtras(estado, c, parC, { alcance: num(parC.d, 0) + geo(par, "paredeAtrasMax") }); if (!P) return parC;
      var GBi = dep("HidGeo", "./biminstgeo.js"), cot = null; try { cot = GBi && GBi.cotasTubo ? GBi.cotasTubo(c.sistema === "esgoto" ? "pvc_esgoto" : "pvc_soldavel", dnDoPonto(c, tipo)) : null; } catch (eG) { cot = null; }
      var de = cot && cot.de > 0 ? cot.de / 1000 : dnDoPonto(c, tipo) / 1000, E = HEm.encaixe(P.esp, de), emb = geo(par, "embutir");
      var o = { x: parC.x, z: parC.z, d: parC.d };
      if (Math.abs(E.profundidade - emb) > EPS_AMB * 10) o.prof = r4(P.face + E.profundidade);   /* o eixo onde cabe (parede de 15 cm: o de sempre) */   // hid:ok 10 × a tolerância numérica
      if (!E.cabe && !enchFeitos[f.id + "|" + P.w.id]) {
        enchFeitos[f.id + "|" + P.w.id] = 1;
        /* um enchimento por aparelho e parede, pelo MAIOR DE dos pontos dele nessa parede (o esgoto e a água não pedem dois) */
        K._int.conectores(avaliarFam, f).forEach(function (k2) { if (k2.sistema !== "esgoto" && k2.sistema !== "agua_fria") return; var c2 = null; try { c2 = GBi && GBi.cotasTubo ? GBi.cotasTubo(k2.sistema === "esgoto" ? "pvc_esgoto" : "pvc_soldavel", dnDoPonto(k2, tipo)) : null; } catch (eG2) { c2 = null; } var d2e = c2 && c2.de > 0 ? c2.de / 1000 : dnDoPonto(k2, tipo) / 1000; if (d2e > de) de = d2e; });
        E = HEm.encaixe(P.esp, de);
        var sol = HEm.enchimento({ id: P.w.id, esp: P.esp }, de), av = avaliarFam(f.famId, f.tipoId, f.inst), cx = av && av.caixa, larg = cx ? num(cx.x1, 0) - num(cx.x0, 0) : 0.5;   // hid:ok 50 cm de reserva sem caixa
        var u = { x: -P.n.z, z: P.n.x }, fc = { x: c.x + P.n.x * P.face, z: c.z + P.n.z * P.face }, meia = larg / 2 + HEm.GEO.folgaEnchimento;
        var opsE = HEm.opsEnchimento("ench-" + f.id + "-" + c.cid, P.w, { x: fc.x - u.x * meia, z: fc.z - u.z * meia }, { x: fc.x + u.x * meia, z: fc.z + u.z * meia }, P.n, piso, r4(Math.max(c.y, piso) + HEm.GEO.folgaEnchimento), sol);
        /* a louça avança a espessura do enchimento (ela encosta nele, não na parede) — o próximo Traçar embute o ponto no enchimento */
        opsE.push({ op: "mover", id: String(f.id), cx: r4(num(f.x, 0) - P.n.x * sol.espessura), cz: r4(num(f.z, 0) - P.n.z * sol.espessura) });
        aviso("o tubo de " + (c.sistema === "esgoto" ? "esgoto" : "água") + " de " + f.id + " (DE " + Math.round(de * 1000) + " mm) não cabe na parede " + P.w.id + " de " + fcmAmb(P.esp) + " cm (pede " + fcmAmb(E.precisa) + " cm: o DE + " + Math.round(E.cobrimento * 1000) + " mm de argamassa de cada lado) — " +
              (sol.solucao === "shaft" ? "shaft de drywall de " + fcmAmb(sol.espessura) + " cm" : "enchimento de " + fcmAmb(sol.falta) + " cm (feito com o bloco cerâmico de " + fcmAmb(sol.espessura) + " cm)") + " na face da parede, orçado (SINAPI " + sol.sinapi.codigo + "); a louça avança " + fcmAmb(sol.espessura) + " cm. Corrigir lança e Traçar de novo embute.",
              [String(f.id), P.w.id], { tipo: "ops", ops: opsE, texto: "Lançar o " + (sol.solucao === "shaft" ? "shaft" : "enchimento") + " de " + fcmAmb(sol.espessura) + " cm (SINAPI " + sol.sinapi.codigo + ") e avançar o aparelho" });
      }
      return o;
    }
    kitOps.forEach(function (o) { if (o.kitParte === "chuveiro" && /-ch-espera$/.test(txt(o.id))) esperaCh[o.kit] = o.continua === "p2" ? o.p2 : o.p1; });   /* a ponta aberta (p1 desde a FRENTE B, 19/10/2026: sentido da água) */
    M.fams.forEach(function (f) {
      var tipo = K.tipoDaFamilia(f.famId, f.tipoId); if (K.aparelhoNorma) tipo = K.aparelhoNorma(tipo); tipos[f.id] = tipo;   /* bancada de pedra = pia de cozinha / lavatório da norma (js/hidkit.js aparelhoNorma) */
      var cs = K._int.conectores(avaliarFam, f).filter(function (c) { return c.sistema === "esgoto" || c.sistema === "agua_fria"; });
      var con = [], apar = HEm && HEm.aparente ? HEm.aparente(f) : false;
      if (apar) decide("amb.aparente", "O " + f.id + " está com Instalação aparente (área técnica/reforma): os tubos dele não se embutem e não entram no achado \"tubo aparente sem motivo\".");
      cs.forEach(function (c) {
        if (c.sistema === "agua_fria" && tipo === "bacia_valvula") return;   /* ramal exclusivo da válvula (kit) */
        if (c.sistema === "agua_fria" && tipo === "chuveiro" && esperaCh[f.id]) { var E = esperaCh[f.id]; con.push({ id: "af", sistema: "agua_fria", dn: c.dn, x: E.x, y: E.y, z: E.z }); return; }
        var parC = c.parede || null;
        /* N23 EMBUTIDO: a água fria E o esgoto vão à parede de verdade (antes só a água — o esgoto da louça longe da parede descia no ar) */
        /* APARENTE (escolha do usuário): o tubo corre na FACE da parede — o eixo à frente dela um raio + 1 cm (sobreposto, com braçadeira) */
        if (apar) { var GBa = dep("HidGeo", "./biminstgeo.js"), cta = null; try { cta = GBa && GBa.cotasTubo ? GBa.cotasTubo(c.sistema === "esgoto" ? "pvc_esgoto" : "pvc_soldavel", c.dn) : null; } catch (eA) { cta = null; }
          parC = c.parede ? { x: c.parede.x, z: c.parede.z, d: 0, prof: -r4((cta && cta.de > 0 ? cta.de / 2000 : num(c.dn, 0) / 2000) + 0.01) } : null; }   // hid:ok 1 cm de afastamento da face (braçadeira)
        else if (c.parede && (c.sistema === "agua_fria" || c.sistema === "esgoto")) parC = pontoLonge(c, f) || c.parede;
        else if (!c.parede && (c.sistema === "esgoto" || c.sistema === "agua_fria") && esgotoDeParede(f, tipo)) parC = pontoForaDaFace(c, f);
        if (parC && !apar) parC = encaixar(c, parC, f, tipo);
        if (apar) aparentes.push({ x: c.x, y: c.y, z: c.z });
        con.push({ id: c.cid || c.sistema, sistema: c.sistema, dn: c.dn, x: c.x, y: c.y, z: c.z, parede: parC });
        if (c.sistema === "esgoto" && (tipo === "bacia_valvula" || tipo === "bacia_caixa_acoplada") && !baciaEs) baciaEs = { x: c.x, y: c.y, z: c.z, id: f.id };
        /* quem descarrega na caixa sifonada: a regra do traçado (HidRota.PARA_CAIXA) — o tanque tem sifão próprio e vai ao ramal */
        if (c.sistema === "esgoto" && H.PARA_CAIXA[tipo] && !direto(f.id, tipo)) recept.push({ x: c.x, z: c.z, peso: 1, ref: f.id, aparelho: tipo });
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
      if (con.length) aparelhos.push({ id: String(f.id), aparelho: tipo === "maquina_lavar_roupa" ? "maquina_lavar_roupa" : tipo, aparelhoEs: K.aparelhoEsDe ? K.aparelhoEsDe(tipo, f.inst) : null, saidaEsgoto: H.saidaEsgoto ? H.saidaEsgoto(f.inst) : "curva", grupo: "1", direto: direto(f.id, tipo), conectores: con });   /* mictório: a linha da Tabela 3 pelo Tipo_descarga */
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
    /* FRENTE H4: sem bacia, 2+ tanques (ou outro aparelho de sifão próprio que vai ao destino pelo ramal) — a espera além do ponto
       da ponta (alemDaPonta). A pia não conta: ela vai à caixa de gordura, não à espera */
    if (!baciaEs) { var csRaiz = []; aparelhos.forEach(function (a) { if (a.aparelho !== "tanque") return; a.conectores.forEach(function (c) { if (c.sistema === "esgoto") csRaiz.push(c); }); });
      if (csRaiz.length > 1) ancora = alemDaPonta(csRaiz, csRaiz[0], par); }
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
      if (c0 && I && !par.caixaInspecaoDentroOk) {   /* par.caixaInspecaoDentroOk: lote sem faixa externa — o projetista autoriza a CI dentro da edificação (tampa reforçada; premissa declarada no projeto) */
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
      if (pE && !pE.lateral && !baciaEs) {
        var tnqs = []; aparelhos.forEach(function (a) { if (a.aparelho !== "tanque") return; a.conectores.forEach(function (c) { if (c.sistema === "esgoto") tnqs.push(c); }); });
        var pE2 = tnqs.length ? esperaDepoisDosAparelhos(pE, ancora, tnqs, estado.hidRedes, paredes, par, estado) : null;
        if (pE2) { decide("amb.espera_depois", "A espera do esgoto andou " + f2(d2(pE, pE2)) + " m ao longo da parede, até uma folga depois do tanque no sentido da rede: a junção de 45° do ramal do tanque no tronco precisa dessa folga a favor do fluxo."); pE = pE2; }
      }
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
    /* v3-água (06/11/2026): aquecedor no modelo = a água FRIA corre uma camada (um passo) mais funda que a quente — a espera do ambiente, os
       pontos de parede e o ramal no mesmo plano (a conta do js/hidkit.js extraAF e do reservaAQ abaixo): o ramal passa por trás das descidas
       da água quente sem o Z de 5 cm (joelho + toco + joelho) na espera e em cada ponto */
    var xAF = (function () {
      var HFa = dep("HidFamilias", "./hidfamilias.js");
      if (!HFa || !HFa.porId) return 0;
      return arr(estado.familias).some(function (f) { var F = HFa.porId(f.famId); return !!F && F.categoria === "equipamento" && arr(F.sistemas).indexOf("agua_quente") >= 0; }) ? geo(par, "passo") : 0;
    })();
    var juntar = null, temAF = aparelhos.some(function (a) { return a.conectores.some(function (c) { return c.sistema === "agua_fria"; }); }), aRG = K.altura("RG"), esperaAF = null;
    if (temAF) {
      /* o kit da válvula já sobe uma prumada própria: a espera do ambiente fica ao lado dela, na ponta da parede molhada
         oposta aos aparelhos (o ramal corre reto pela parede até todos) */
      var colKit = kitOps.filter(function (o) { return /-vd-ramal$/.test(txt(o.id)); })[0];
      if (cols.length && !(colKit && cols[0].id === colKit.id)) destinos.agua_fria = { tipo: "coluna", id: cols[0].id, x: cols[0].x, z: cols[0].z, yBase: cols[0].yBase, yTopo: cols[0].yTopo, existente: true };
      else {
        var base = colKit ? { x: colKit.p1.x, z: colKit.p1.z } : null, nW = null, baseEixo = null;
        if (!base) { var a0 = aparelhos.filter(function (a) { return a.conectores.some(function (c) { return c.sistema === "agua_fria" && c.parede; }); })[0]; var c0 = a0 ? a0.conectores.filter(function (c) { return c.sistema === "agua_fria" && c.parede; })[0] : null; if (c0) { nW = c0.parede; var eW = geo(par, "embutir") + xAF + Math.max(0, num(c0.parede.d, 0)); base = { x: r4(c0.x + c0.parede.x * eW), z: r4(c0.z + c0.parede.z * eW) };
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
          /* v3-água (06/11/2026): sem a prumada da válvula, a espera ao lado da referência faz tê + toco + tê — o toco com no mínimo 30 cm (o auditor reprova < 30 cm entre conexões; TRACAR-E2E, referência no meio da fileira) */
          if (!colKit) lat = Math.max(lat, 0.31);   // hid:ok 31 cm: acima do limite de 30 cm do toco entre conexões
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
            /* B3 (06/11/2026, R-C9: o registro vai na descida da entrada, o pé dela é o tê — js/hidrota.js regDesc): a referência na PONTA
               da fileira e abaixo do ramal — a espera desce NO EIXO dela e segue reta até o ponto (o tê do pé tem a descida como passagem
               e o ramal como derivação). Antes ficava a lateralEntradaAF (20 cm) ao lado: tê + toco de 20 cm + joelho (TE_TOCO_JOELHO). */
            var naPonta = !colKit && c0 && ts.length > 1 && (Math.abs(tMin) < 1e-3 || Math.abs(tMax) < 1e-3) && aRG.ok && num(c0.y, 0) < piso + aRG.valor - geo(par, "margemNo");   // hid:ok 1 mm: a referência é a ponta
            if (naPonta) tE0 = 0;
            var gq = gap + geo(par, "passo") + geo(par, "margemNo"), qG = { x: base.x + tg.x * gq - nW.x * geo(par, "embutir"), z: base.z + tg.z * gq - nW.z * geo(par, "embutir") }, wG = colKit ? null : K._int.paredeDe(estado, qG, null);
            if (wG) {
              var wgu = { x: wG.p2.x - wG.p1.x, z: wG.p2.z - wG.p1.z }, Lg = Math.sqrt(wgu.x * wgu.x + wgu.z * wgu.z), tG = ((qG.x - wG.p1.x) * wgu.x + (qG.z - wG.p1.z) * wgu.z) / Lg, mgG = geo(par, "afastParede") + wG.esp / 2;
              if (tG >= mgG && tG <= Lg - mgG) tAlt = gq;
            }
            if (!naPonta) aviso("a espera de água do ambiente não coube na ponta da fileira de pontos: ficou ao lado da referência — confira o traçado", ids, { tipo: "destino", sistema: "agua_fria" });
          }
          var pE0 = { x: r4(base.x + tg.x * tE0), z: r4(base.z + tg.z * tE0) }, tE = K._int.tetoDe(estado, { x: r4(pE0.x - nW.x * geo(par, "embutir")), z: r4(pE0.z - nW.z * geo(par, "embutir")) }, piso);
          esperaAF = { x: pE0.x, y: colKit ? r4(Math.max(colKit.p1.y, colKit.p2.y)) : r4(tE.y - geo(par, "folga")), z: pE0.z };
          /* a prumada exclusiva da válvula (6.14.5) termina em espera PRÓPRIA, separada da do consumo do banheiro
             (N23, 26/10/2026: antes se juntavam num tê — ver o "-afb" mais abaixo) */
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
    if (xAF > 0) parR.embutirExtraAF = xAF;   /* os pontos de parede de água fria no mesmo plano fundo (js/hidrota.js, normEntrada) */
    /* B3 (06/11/2026, R-AQ4): aquecedor no modelo (equipamento com água quente; a mesma conta do js/hidkitui.js temFonteAQ) = a água quente
       vai ser traçada DEPOIS pelo eixo embutido dos pontos de parede (a 1ª camada do js/hidaqtraco.js): o ramal de água fria deixa esse
       prumo livre (js/hidrota.js, entrada.reservaAQ) */
    var reservaAQ = [];
    (function () {
      var HFq = dep("HidFamilias", "./hidfamilias.js"), emb = geo(par, "embutir");
      if (!HFq || !HFq.porId || !arr(estado.familias).some(function (f) { var F = HFq.porId(f.famId); return !!F && F.categoria === "equipamento" && arr(F.sistemas).indexOf("agua_quente") >= 0; })) return;
      M.fams.forEach(function (f) { K._int.conectores(avaliarFam, f).forEach(function (c) {
        if (c.sistema !== "agua_quente" || !c.parede) return;
        var nx = num(c.parede.x, 0), nz = num(c.parede.z, 0), L = Math.sqrt(nx * nx + nz * nz); if (!(L > EPS)) return;
        var e = emb + Math.max(0, num(c.parede.d, 0));
        reservaAQ.push({ x: r4(c.x + nx / L * e), y: c.y, z: r4(c.z + nz / L * e), dn: c.dn });
      }); });
    })();
    Object.keys(par).forEach(function (k) { if (HR().GEO[k] != null && par[k] != null) parR[k] = par[k]; });
    /* o traçado do ambiente com uma caixa sifonada (a escolhida ou uma alternativa) e destinos dados */
    function rotearCom(cxP, dest) {
      var opsModelo = soInst(opsLimpo).concat(novas.filter(function (o) { return o.op === "peca" && o.ambParte !== "caixa_sifonada"; })).concat(cxP && cxP._op ? [cxP._op] : []);
      var pecasRota = pecas.map(function (k) { return { id: k.id, peca: k.peca, sistema: "esgoto", dn: k.dn, x: k.x, y: k.y, z: k.z, grupo: "1" }; });
      if (cxP && !pecas.some(function (k) { return k.id === cxP.id; })) pecasRota.push({ id: cxP.id, peca: cxP.peca, sistema: "esgoto", dn: cxP.dn, x: cxP.x, y: cxP.y, z: cxP.z, grupo: "1" });
      var en = { aparelhos: aparelhos, pecas: pecasRota, caixasGordura: cgsRota, obstaculos: obst, destinos: dest, grupos: [{ id: "1", piso: piso }], piso: piso, parametros: parR, opsModelo: opsModelo, reservaAQ: reservaAQ };
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
    /* FRENTE H3: os tubos de água da opção que ATRAVESSAM (folga entre geratrizes < 0) um tubo de água que já está no modelo sem se
       ligar a ele (nenhuma ponta de um no outro) — [id novo, id existente] */
    function atravessaAgua(opsO) {
      var AG = { agua_fria: 1, agua_quente: 1 }, out0 = [];
      var exist = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return AG[t.sistema] && String(t.id).indexOf(ambId + "-") !== 0; });
      function liga(a, b) { return [a.p1, a.p2].some(function (p) { return H._int.segSeg3(p, p, b.p1, b.p2) <= B.TOL; }) || [b.p1, b.p2].some(function (p) { return H._int.segSeg3(p, p, a.p1, a.p2) <= B.TOL; }); }
      arr(opsO).forEach(function (n) {
        if (n.op !== "trecho" || !AG[n.sistema] || !n.p1 || !n.p2) return;
        exist.forEach(function (e) { if (e.sistema === n.sistema && !liga(n, e) && H._int.segSeg3(n.p1, n.p2, e.p1, e.p2) - raio(num(n.dn, 0)) - raio(num(e.dn, 0)) < -EPS) out0.push([String(n.id), String(e.id)]); });
      });
      return out0;
    }
    /* v3-água (06/11/2026): o ramal de água do ambiente que passa POR TRÁS da subida do registro do chuveiro (o desvio no fundo da parede, a 5 cm
       dela, que a atravessaAgua não acusa): vira o Z de 5 cm (joelho + toco + joelho) na espera. `pe` = o pé da subida; o ramal horizontal acima
       dele, passando a menos de 7,5 cm (planta) pelo MEIO do trecho. O mesmo remédio do H3 abaixo: a espera vira para o lado de onde vem a água. */
    function passaPorTras(opsO, pe) {
      var achou = false;
      arr(opsO).forEach(function (n) {
        if (achou || n.op !== "trecho" || n.sistema !== "agua_fria" || !n.p1 || !n.p2 || Math.abs(n.p1.y - n.p2.y) > EPS_AMB || n.p1.y < pe.y - 0.05) return;   // hid:ok tolerância geométrica (5 cm) da cota do trecho em relação ao piso do ambiente
        var ux = n.p2.x - n.p1.x, uz = n.p2.z - n.p1.z, L = Math.sqrt(ux * ux + uz * uz); if (!(L > EPS_AMB)) return;
        var t = ((pe.x - n.p1.x) * ux + (pe.z - n.p1.z) * uz) / L;   /* distância do começo até o pé da perpendicular */
        if (t <= 0.02 || L - t <= 0.02) return;   // hid:ok tolerância geométrica (2 cm) para o ponto de derivação não cair na ponta do trecho
        if (Math.sqrt(Math.pow(pe.x - (n.p1.x + ux / L * t), 2) + Math.pow(pe.z - (n.p1.z + uz / L * t), 2)) <= 0.075) achou = true;   // hid:ok 7,5 cm: metade do passo da grade + folga
      });
      return achou;
    }
    /* FRENTE H3 (20/10/2026, decidido pela coordenação — BACKLOG #79): o ramal de água do ambiente que cruza, na MESMA parede, um tubo
       de água que já está no modelo (o ramal exclusivo da válvula de descarga que desce da coluna do prédio) com menos que a folga
       entre tubos (HidRota.GEO.folga, critério de projeto) entre as geratrizes EXTERNAS: no trecho do cruzamento o ramal vai MAIS
       FUNDO na parede (desvio por trás: duas curvas de 45° para entrar e duas para voltar), o que falta para a folga. Só se couber: o cobrimento
       (HidRota.GEO.cobrimento) até a outra face da parede. Não cabe ou há registro no trecho: fica como está (o auditor acusa). */
    /* REVISOR H3: os trechos DEITADOS de esgoto da opção cujo fundo externo fica abaixo do topo da laje estrutural que está sob eles
       (a laje do rebaixo: topo entre piso − alturaEnchimento e o piso) — [{ id, cm }] */
    function esgotoNaLaje(opsO) {
      var Ls = arr(obstTodos && obstTodos.lajes).filter(function (l) { var tp = num(l.topo, NaN); return num(l.espessura, 0) > H._int.LAJE_MIN && tp <= piso + EPS && tp > piso - geo(par, "alturaEnchimento") - EPS; }), out0 = [];
      if (!Ls.length) return out0;
      arr(opsO).forEach(function (o) {
        if (o.op !== "trecho" || o.sistema !== "esgoto" || !o.p1 || !o.p2) return;
        var Lh = d2(o.p1, o.p2); if (!(Lh > EPS) || Math.abs(o.p1.y - o.p2.y) >= Lh) return;   /* só o deitado (a descida no shaft não) */
        var rr = deExt(o) / 2, pior = 0;
        [o.p1, o.p2, { x: (o.p1.x + o.p2.x) / 2, y: (o.p1.y + o.p2.y) / 2, z: (o.p1.z + o.p2.z) / 2 }].forEach(function (p) {
          Ls.forEach(function (l) { if (p.x >= Math.min(l.x0, l.x1) - EPS && p.x <= Math.max(l.x0, l.x1) + EPS && p.z >= Math.min(l.z0, l.z1) - EPS && p.z <= Math.max(l.z0, l.z1) + EPS) pior = Math.max(pior, num(l.topo, 0) - (p.y - rr)); });
        });
        if (pior > EPS) out0.push({ id: String(o.id), cm: r4(pior * 100) });
      });
      return out0;
    }
    function deExt(t) { var Gm = dep("BimInstGeo", "./biminstgeo.js"); try { var c = Gm && Gm.cotasTubo ? Gm.cotasTubo(t.material, t.dn) : null; if (c && c.de > 0) return c.de / 1000; } catch (e0) {} return num(t.dn, 0) / 1000; }
    /* B3 (06/11/2026): o HidRota já vê a água fria do modelo como obstáculo (js/hidrota.js tubosAgua) e passa POR TRÁS do ramal da
       válvula na própria rota — o desvioAtras (abaixo) não acha mais cruzamento. A DECISÃO continua declarada: o ramal do ambiente que
       corre na parede, no eixo mais fundo que o da descida existente que ele cruza em planta (a menos da folga + raios + 2 cm dela). */
    function desvioAtrasDoMotor() {
      if (out.decisoes.some(function (d) { return d.id === "amb.desvio_atras"; })) return;
      var folga = geo(par, "folga"), exist = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema === "agua_fria" && String(t.id).indexOf(ambId + "-") !== 0 && d2(t.p1, t.p2) <= EPS; });
      novas.some(function (n) {
        if (n.op !== "trecho" || n.sistema !== "agua_fria" || n.amb !== ambId || Math.abs(n.p1.y - n.p2.y) > EPS) return false;
        var e = exist.filter(function (t) { var y0 = Math.min(t.p1.y, t.p2.y), y1 = Math.max(t.p1.y, t.p2.y); if (n.p1.y < y0 - B.ACESSORIO_PADRAO || n.p1.y > y1 + B.ACESSORIO_PADRAO) return false;   /* o registro da válvula divide a descida (ramal / ramalb) */ var dd = distSeg(t.p1, n.p1, n.p2) - deExt(t) / 2 - deExt(n) / 2; return dd >= folga - EPS && dd < folga + 0.02; })[0];   // hid:ok 2 cm: o desvio justo da folga
        if (!e) return false;
        var w = paredes.filter(function (pw) { return distSeg(n.p1, pw.p1, pw.p2) <= num(pw.espessura, 0) / 2 + EPS && distSeg(e.p1, pw.p1, pw.p2) <= num(pw.espessura, 0) / 2 + EPS; })[0];
        if (!w) return false;
        decide("amb.desvio_atras", "O ramal " + n.id + " passa mais fundo na parede " + (w.id || "") + " no cruzamento com " + e.id + ", a " + fcmAmb(folga) + " cm dele entre geratrizes (folga entre tubos, critério de projeto), com o cobrimento até a outra face (o traçado contorna o tubo que já está na parede).");
        return true;
      });
    }
    function desvioAtras() {
      var folga = geo(par, "folga"), cob = geo(par, "cobrimento"), MN = geo(par, "margemNo");
      var exist = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema === "agua_fria" && String(t.id).indexOf(ambId + "-") !== 0 && d2(t.p1, t.p2) <= EPS; });   /* verticais */
      if (!exist.length) return;
      var comAc = {}; novas.forEach(function (o) { if (o.op === "acessorio" && o.trecho != null) comAc[String(o.trecho)] = 1; });
      for (var i = 0; i < novas.length; i++) {
        var n = novas[i];
        if (n.op !== "trecho" || n.sistema !== "agua_fria" || n.amb !== ambId || comAc[String(n.id)] || Math.abs(n.p1.y - n.p2.y) > EPS) continue;
        var L = d2(n.p1, n.p2); if (!(L > EPS)) continue;
        var u = { x: (n.p2.x - n.p1.x) / L, z: (n.p2.z - n.p1.z) / L }, nn = { x: -u.z, z: u.x };
        var e = exist.filter(function (t) {
          if ([n.p1, n.p2].some(function (p) { return d2(p, t.p1) <= B.TOL; })) return false;   /* ligado */
          var s = (t.p1.x - n.p1.x) * u.x + (t.p1.z - n.p1.z) * u.z; if (s <= MN || s >= L - MN) return false;
          var dd = H._int.segSeg3(n.p1, n.p2, t.p1, t.p2) - deExt(t) / 2 - deExt(n) / 2;   /* a folga em 3D (a ponta do tubo existente perto do ramal também conta) */
          return dd < folga - EPS;
        })[0];
        if (!e) continue;
        var s0 = (e.p1.x - n.p1.x) * u.x + (e.p1.z - n.p1.z) * u.z, off = (e.p1.x - n.p1.x) * nn.x + (e.p1.z - n.p1.z) * nn.z;
        var need = deExt(e) / 2 + deExt(n) / 2 + folga, delta = r4(need - Math.abs(off)), sg = off >= 0 ? -1 : 1;   /* afasta para o lado oposto ao do tubo existente */
        var w = paredes.filter(function (pw) { return distSeg(n.p1, pw.p1, pw.p2) <= num(pw.espessura, 0) / 2 + EPS && distSeg(n.p2, pw.p1, pw.p2) <= num(pw.espessura, 0) / 2 + EPS; })[0];
        if (!w) continue;
        var Pd = { x: n.p1.x + nn.x * sg * delta, z: n.p1.z + nn.z * sg * delta };
        if (distSeg(Pd, w.p1, w.p2) + deExt(n) / 2 + cob > num(w.espessura, 0) / 2 + EPS) { aviso("o ramal " + n.id + " cruza " + e.id + " a menos da folga e não cabe mais fundo na parede " + (w.id || "") + ": ajuste à mão", [n.id, e.id], { tipo: "ajustar", ids: [n.id, e.id] }); continue; }
        var a1 = s0 - need - delta, b1 = s0 + need + delta;   /* as curvas de 45° andam delta ao longo do ramal */
        if (!(delta > EPS)) continue;
        if (a1 <= MN || b1 >= L - MN) continue;
        var pt = function (s, k) { return { x: r4(n.p1.x + u.x * s + nn.x * sg * k), y: n.p1.y, z: r4(n.p1.z + u.z * s + nn.z * sg * k) }; };
        var A = pt(a1, 0), A2 = pt(a1 + delta, delta), B2 = pt(b1 - delta, delta), B0 = pt(b1, 0), P2 = n.p2;
        var base = copia(n); delete base.continua;
        var pecas = [[n.p1, A, ""], [A, A2, "-d1"], [A2, B2, "-d"], [B2, B0, "-d2"], [B0, P2, "-dc"]].map(function (q) { var o = copia(base); o.id = n.id + q[2]; o.p1 = { x: q[0].x, y: q[0].y, z: q[0].z }; o.p2 = { x: q[1].x, y: q[1].y, z: q[1].z }; return o; });
        if (n.continua === "p1") pecas[0].continua = "p1"; else if (n.continua === "p2") pecas[pecas.length - 1].continua = "p2"; else if (n.continua === "ambos") { pecas[0].continua = "p1"; pecas[pecas.length - 1].continua = "p2"; }
        novas.splice.apply(novas, [i, 1].concat(pecas)); i += pecas.length - 1;
        decide("amb.desvio_atras", "O ramal " + n.id + " passa " + fcmAmb(delta) + " cm mais fundo na parede " + (w.id || "") + " no cruzamento com " + e.id + " (quatro curvas de 45°: duas para entrar, duas para voltar), para ficar a " + fcmAmb(folga) + " cm dele entre geratrizes (folga entre tubos, critério de projeto), com o cobrimento até a outra face.");
      }
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
      /* FRENTE H4: 2+ pontos de pia (2 cubas da bancada, 2 pias lado a lado) — a caixa além do ponto da ponta (alemDaPonta) */
      var csPia = []; pias.forEach(function (pa) { pa.conectores.forEach(function (c) { if (c.sistema === "esgoto") csPia.push(c); }); });
      pP = alemDaPonta(csPia, pP, par);
      var peP = pP ? HI().posicaoExterna(estado, pP, { raio: 0.15, afast: num(par.afastamentoCaixaGordura, HI().GEO_IMP.afastamentoCaixaGordura), parametros: par }) : null;   // hid:ok o raio da caixa de gordura padrão (DN300) e o recuo do HidRota
      if (peP) { parR.areaTecnica = { x: peP.x, z: peP.z }; decide("amb.caixa_gordura", "Caixa de gordura proposta do lado de fora da parede da cozinha, " + peP.motivo + "."); }
    } else if (pias.length && !cgsRota.length && par.areaTecnica && isFinite(num(par.areaTecnica.x, NaN)) && isFinite(num(par.areaTecnica.z, NaN))) {   /* F6 (Casa 487): o projetista MANDA onde fica a caixa de gordura (parametros.areaTecnica {x,z}) — lote sem faixa externa; antes o parâmetro era ignorado e a caixa caía fora da divisa */
      parR.areaTecnica = { x: num(par.areaTecnica.x, 0), z: num(par.areaTecnica.z, 0) }; decide("amb.caixa_gordura", "Caixa de gordura no ponto indicado pelo projetista (parametros.areaTecnica).");
    }
    var R = null, esperaCG = false;
    /* FRENTE H3 (20/10/2026): no ANDAR do prédio (rebaixo; a ventilação vai à coluna do shaft) o esgoto corria colado ao piso e a
       ventilação da caixa sifonada atravessava o ramal DN 100 da bacia por DENTRO (folga −4,6 cm entre geratrizes): não há como
       passar por cima dele sob o piso. O esgoto do ambiente desce no rebaixo a faixa da ventilação (o diâmetro externo do ramal
       de ventilação da Tabela 8 + a folga entre tubos + o cobrimento), e o deitado da ventilação passa por cima do ramal, sempre
       subindo. Não coube (rebaixo raso): o traçado de antes, e a interferência aparece no Verificar/auditor. */
    var reservaV = 0;
    if (par._reservaEncaixe && num(parR.reservaVentilacao, 0) > 0) reservaV = parR.reservaVentilacao;   /* o refazer do encaixe (ligar): a faixa vem pronta */
    if (!terreo && destinos.ventilacao && destinos.esgoto && parR.reservaVentilacao == null) {
      var uV = 0; aparelhos.forEach(function (a) { var u = NR.uhc(a.aparelho, "ventilação"); uV += u == null ? 0 : u; });
      if (out.caixaSifonada && out.caixaSifonada.uhc) uV = Math.max(uV, out.caixaSifonada.uhc);
      var dnV0 = NR.dnVentRamal(baciaEs ? 1 : 0, uV, "ventilação: ramal " + (baciaEs ? "com" : "sem") + " bacia (Tabela 8)");
      if (dnV0 != null) { reservaV = r4(2 * raio(HRcomercial("ventilacao", dnV0)) + geo(par, "folga") + geo(par, "cobrimento")); parR.reservaVentilacao = reservaV; }
    }
    if (destinos.esgoto || destinos.agua_fria) {
      R = rotearCom(caixa, destinos);
      if (reservaV && !(R && R.opcoes && R.opcoes.length)) { delete parR.reservaVentilacao; reservaV = 0; R = rotearCom(caixa, destinos); }
      /* RALO QUE VOLTA (rodadas 7 e 8 — o "U" do print 6): o ralo seco do box que vai à caixa sifonada e dali o esgoto VOLTA para trás até o destino
         (o caminho de verdade, nos tubos da opção: ralo → caixa → ramal → destino, mais de 2 × a linha reta e 1,5 m além dela — a régua do auditor,
         ESGOTO_VOLTA). O ralo do KIT vira RALO SIFONADO (desconector próprio, NBR 8160) e vai direto ao ramal por junção de 45°. A troca vale
         sempre que o traçado refeito com o ralo sifonado fecha (sem opção, fica o ralo seco de antes); o custo dos dois traçados NÃO decide nada —
         só entra no texto da decisão (amb.ralo_sifonado), para o projetista ver o que mudou */
      (function () {
        var dE = destinos.esgoto; if (!caixa || !dE || !(R && R.opcoes && R.opcoes.length)) return;
        var Pd = dE.conector || dE; if (!isFinite(num(Pd.x, NaN))) return;
        /* o caminho em planta do esgoto que nasce em q, seguindo os tubos da opção (p1 → p2), passando pelas caixas, até o destino */
        function caminho(ops, q) { return caminhoPlantaEs(ops, q, Pd, caixa); }
        var volta = function (Rr) { return pecas.filter(function (k) { if (k.peca !== "ralo_seco" || !doKit[k.id]) return false; var D = d2(k, Pd), Lc = caminho(Rr.opcoes[0].ops, k); return Lc > 2 * D && Lc - D > 1.5; }); };   // hid:ok a régua do ESGOTO_VOLTA
        var vR = volta(R); if (!vR.length) return;
        var Lantes = vR.map(function (k) { return caminho(R.opcoes[0].ops, k); });
        var antes = pecas.slice();
        pecas = pecas.map(function (k) { if (vR.indexOf(k) < 0) return k; var c = {}; Object.keys(k).forEach(function (q) { c[q] = k[q]; }); c.peca = "ralo_sifonado"; c.dn = B.PECAS.ralo_sifonado.dn; return c; });
        var Rs = rotearCom(caixa, destinos);
        if (!(Rs && Rs.opcoes && Rs.opcoes.length)) { pecas = antes; return; }
        var c0 = R.opcoes[0].custo; R = Rs;
        vR.forEach(function (k, ik) {
          var o0 = kitOps.filter(function (o) { return o.op === "peca" && String(o.id) === String(k.id); })[0]; if (!o0) return;
          var oN = {}; Object.keys(o0).forEach(function (q) { oN[q] = o0[q]; }); oN.peca = "ralo_sifonado"; oN.dn = B.PECAS.ralo_sifonado.dn; novas.push(oN);
          aviso("ralo seco do box " + k.id + " trocado por RALO SIFONADO: evita o caminho de " + f2(Lantes[ik]) + " m até a caixa sifonada e de volta ao destino (a " + f2(d2(k, Pd)) + " m) — o ralo sifonado tem fecho hídrico próprio (NBR 8160) e entra direto no ramal", [k.id], null);
        });
        decide("amb.ralo_sifonado", "Ralo " + vR.map(function (k) { return k.id; }).join(", ") + " vira RALO SIFONADO e vai direto ao ramal (o esgoto ia até a caixa sifonada e voltava: " + vR.map(function (k, ik) { return f2(Lantes[ik]) + " m contra " + f2(d2(k, Pd)) + " m em linha reta"; }).join("; ") + "); custo do traçado " + f2(Rs.opcoes[0].custo) + " contra " + f2(c0) + " m equivalentes.");
      })();
      /* REVISOR H3 (20/10/2026): a faixa do esgoto no enchimento vai até piso − alturaEnchimento (HidRota.GEO, 0,30 m) sem olhar a
         LAJE do rebaixo — com a reserva, num rebaixo de 20 cm o ramal DN 100 entrava 3,5 cm na laje e, num de 15 cm, 8,5 cm (furo
         de laje sem aviso; sem a reserva o mesmo esgoto cabia). Opção com esgoto deitado abaixo do topo da laje que o apoia: a
         reserva sai (o traçado de antes) com AVISO — a ventilação volta a cruzar o ramal e o Verificar/auditor acusa. */
      var naLaje = [];
      if (reservaV && R && R.opcoes && R.opcoes.length) R.opcoes = R.opcoes.filter(function (o) { var q = esgotoNaLaje(o.ops); if (q.length && !naLaje.length) naLaje = q; return !q.length; });
      if (reservaV && R && R.opcoes && !R.opcoes.length && naLaje.length) {
        delete parR.reservaVentilacao; reservaV = 0; R = rotearCom(caixa, destinos);
        aviso("rebaixo raso: o esgoto descido para a ventilação passar por cima do ramal da bacia entraria na laje (" + naLaje.map(function (x) { return x.id + " " + fcmAmb(x.cm / 100) + " cm"; }).join(", ") + ") — ficou o traçado sem a faixa da ventilação; aumente o rebaixo da laje do banheiro ou leve a ventilação pela parede", naLaje.map(function (x) { return x.id; }), { tipo: "ajustar", ids: naLaje.map(function (x) { return x.id; }) });
      }
      /* FRENTE H3 (20/10/2026, decidido pela coordenação — BACKLOG #78): a espera do kit do CHUVEIRO sai para um lado da subida do
         registro; o ramal que chega do OUTRO lado passava por dentro da subida (e2e-hid-tracar, −2 cm). A espera VIRA para o lado de
         onde vem a água (o espelho pela subida) e o ramal segue na parede, chegando ao registro sem atravessar a subida. A troca é
         op do KIT (as marcas kit/kitParte dele, sem a do ambiente: refazer o ambiente não apaga o tubo do kit) */
      if (R && R.opcoes && R.opcoes.length) {
        var virados = [], atrav0 = atravessaAgua(R.opcoes[0].ops);
        M.fams.forEach(function (f) {
          if (tipos[f.id] !== "chuveiro" || !esperaCh[f.id]) return;
          var opE = kitOps.filter(function (o) { return o.op === "trecho" && String(o.kit) === String(f.id) && /-ch-espera$/.test(txt(o.id)); })[0];
          if (!opE) return;
          var pref = txt(opE.id).replace(/-espera$/, "-");   /* os tubos do kit do chuveiro: <kit>-ch-* */
          var aberta = opE.continua === "p2" ? "p2" : "p1", pe = aberta === "p1" ? opE.p2 : opE.p1, E0 = opE[aberta];
          if (!atrav0.some(function (x) { return String(x[1]).indexOf(pref) === 0; }) && !passaPorTras(R.opcoes[0].ops, pe)) return;
          var E1 = { x: r4(2 * pe.x - E0.x), y: E0.y, z: r4(2 * pe.z - E0.z) };
          var ap = aparelhos.filter(function (a) { return String(a.id) === String(f.id); })[0], cAF = ap ? ap.conectores.filter(function (c) { return c.sistema === "agua_fria"; })[0] : null;
          if (!cAF) return;
          var guarda = { x: cAF.x, z: cAF.z };
          cAF.x = E1.x; cAF.z = E1.z;
          virados.push({ f: f, opE: opE, aberta: aberta, E1: E1, cAF: cAF, guarda: guarda, pe: pe });
        });
        if (virados.length) {
          var Rv = rotearCom(caixa, destinos);
          if (Rv && Rv.opcoes && Rv.opcoes.length && !atravessaAgua(Rv.opcoes[0].ops).length && !virados.some(function (v) { return passaPorTras(Rv.opcoes[0].ops, v.pe); })) {
            R = Rv;
            virados.forEach(function (v) {
              var nv = copia(v.opE); nv[v.aberta] = { x: v.E1.x, y: v.E1.y, z: v.E1.z }; delete nv.amb; delete nv.ambParte; nv.kitVirado = true;
              novas.push(nv); esperaCh[v.f.id] = v.E1;
              decide("amb.espera_chuveiro", "A espera do kit do chuveiro " + v.f.id + " virou para o lado de onde vem a água: o ramal chega ao registro pela parede sem atravessar a subida dele.");
            });
          } else virados.forEach(function (v) { v.cAF.x = v.guarda.x; v.cAF.z = v.guarda.z; });   /* não resolveu: volta como estava (o aviso abaixo) */
        }
      }
      out.reservaEncaixe = par._reservaEncaixe ? reservaV : 0;
      if (reservaV && par._reservaEncaixe) aviso("o esgoto do ambiente desceu " + fcmAmb(reservaV) + " cm no enchimento para o tê do ramal + o joelho da ventilação encaixarem: a rede e a caixa de inspeção ficam mais fundas. Levar a subida da ventilação para outra parede pode evitar", ids, { tipo: "ajustar", ids: ids });
      if (reservaV && par._reservaEncaixe) decide("amb.ventilacao.encaixe_ramal", "O esgoto do ambiente corre " + fcmAmb(reservaV) + " cm abaixo do topo do enchimento para o tê do ramal + o joelho da ventilação encaixarem (as peças medidas), com a mesma declividade; o corpo da caixa sifonada desce com o prolongador até a cota do tubo.");
      else if (reservaV) decide("amb.reserva_ventilacao", "Andar com rebaixo: o esgoto do ambiente corre " + fcmAmb(reservaV) + " cm mais baixo no enchimento (o diâmetro do ramal de ventilação + a folga entre tubos + o cobrimento), para a ventilação passar POR CIMA do ramal da bacia, sempre subindo, sem atravessá-lo.");
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
        /* FRENTE H3 (20/10/2026): a água desta opção ATRAVESSANDO a água que já está no modelo (o sub-ramal do kit do aparelho: o
           ramal do chuveiro corria na cota do ramal e passava por dentro da subida do registro — e2e-hid-tracar, −2 cm) — tubo dentro
           de tubo, sem conexão: o AVISO com os ids. ⚠ A troca automática de opção (a única livre era o ramal pelo PISO, nota 85) muda o
           desenho do cliente: fica para decisão do projetista (espera do kit do lado da água, ou o ramal por trás do registro) */
        /* LAVATÓRIO QUE VOLTA (08/11/2026): guarda o que o ligar precisa para medir o traçado FINAL (depois do ajuste de encaixe, como o auditor) —
           os pontos de esgoto dos lavatórios que descarregam na caixa sifonada, a caixa, o destino e o pé da linha da rede (onde o HidRede.gerar
           põe a caixa de inspeção da espera). Não enumerável: não sai no JSON do resultado */
        if (!arr(par._lavDireto).length && caixa && destinos.esgoto) {
          var dEl = destinos.esgoto, Pdl = dEl.conector || dEl, lavs = [];
          /* o destino que é a própria caixa de inspeção (ou de gordura) já é o fim da régua (o auditor para nela); a ESPERA segue até o pé da linha da rede */
          /* M6: no "Ligar ambiente" sem linha da rede desenhada, a régua vai até a espera */
          var qRede = !isFinite(num(Pdl.x, NaN)) ? null : ((esperaEs && pePeDaRede(estado, Pdl)) || { x: Pdl.x, z: Pdl.z });
          if (qRede) aparelhos.forEach(function (a) { if (a.aparelho === "lavatorio") a.conectores.filter(function (c) { return c.sistema === "esgoto"; }).forEach(function (c) { lavs.push({ id: String(a.id), x: c.x, z: c.z }); }); });
          var doModelo = pecas.some(function (k) { return String(k.id) === String(caixa.id) && !doKit[k.id]; });
          if (lavs.length) Object.defineProperty(out, "medidaLavatorio", { value: { lavs: lavs, Pd: { x: Pdl.x, z: Pdl.z }, caixa: { x: caixa.x, z: caixa.z }, q: qRede, caixaUsuario: doModelo ? caixa.id : null, recept: recept.map(function (q) { return q.ref; }) }, enumerable: false, configurable: true });
        }
        var atrav0 = atravessaAgua(op.ops);
        atrav0.forEach(function (x) { aviso("a água do traçado atravessa o tubo " + x[1] + " (" + x[0] + "): passe o ramal por trás do registro (mais fundo na parede), vire a espera do kit para o lado da água ou use a opção pelo piso", x.slice(), { tipo: "ajustar", ids: x.slice() }); });
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
        /* N23 EMBUTIDO: a INSTALAÇÃO APARENTE escolhida no aparelho — os tubos que saem do ponto dele, e os que seguem ligados acima do
           piso (a descida até o piso), levam a marca `aparente` (o auditor não acusa: foi escolha do usuário) */
        if (aparentes.length) {
          var tolA = 0.02, marcadas = [], perto = function (p, q) { return Math.abs(p.x - q.x) <= tolA && Math.abs(p.y - q.y) <= tolA && Math.abs(p.z - q.z) <= tolA; };   // hid:ok 2 cm
          var trs = novas.filter(function (o) { return o.op === "trecho" && o.ambParte === "rota"; }), mudou = true;
          trs.forEach(function (o) { if (aparentes.some(function (q) { return perto(o.p1, q) || perto(o.p2, q); })) { o.aparente = true; marcadas.push(o); } });
          while (mudou) { mudou = false; trs.forEach(function (o) { if (o.aparente || Math.max(o.p1.y, o.p2.y) < piso - EPS || !(Math.abs(o.p2.y - o.p1.y) >= 0.95 * Math.sqrt(Math.pow(o.p2.x - o.p1.x, 2) + Math.pow(o.p2.y - o.p1.y, 2) + Math.pow(o.p2.z - o.p1.z, 2)) || Math.sqrt(Math.pow(o.p2.x - o.p1.x, 2) + Math.pow(o.p2.y - o.p1.y, 2) + Math.pow(o.p2.z - o.p1.z, 2)) <= 0.30)) return; if (marcadas.some(function (m) { return m.sistema === o.sistema && (perto(m.p1, o.p1) || perto(m.p1, o.p2) || perto(m.p2, o.p1) || perto(m.p2, o.p2)); })) { o.aparente = true; marcadas.push(o); mudou = true; } }); }   // hid:ok |Δy| ≥ 0,95 L = vertical   // hid:ok o vertical ou o toco de até 30 cm que liga na descida aparente
        }
        desvioAtras();
        desvioAtrasDoMotor();
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
          /* N23 (defeito de 26/10/2026, 1.2.184): a válvula de descarga tem alimentação EXCLUSIVA desde a caixa (NBR 5626; prática
             Fortlev/Tigre) — a descarga não pode derrubar a pressão do chuveiro. Antes a prumada dela e o tronco do banheiro se
             juntavam num tê sob a laje (uma espera única, DN 50): o barrilete mandava o banheiro inteiro pela coluna "exclusiva".
             Agora são DUAS esperas, cada uma com o seu ramal: a do consumo (o tronco do banheiro, que termina no toco "-afc") e a da válvula
             (este "-afb", marcado `valvula`, que o barrilete leva à 2ª saída). Ficam afastadas: a da válvula só sai até a lateral da
             prumada (no máximo meia distância do vão), sem passar pelo topo do tronco do consumo. */
          var dj = d2(juntar.de, esperaAF) || 1, uj = { x: (esperaAF.x - juntar.de.x) / dj, z: (esperaAF.z - juntar.de.z) / dj };
          /* a espera do CONSUMO continua onde sempre ficou (a lateral além do topo do tronco: as outras esperas do pavimento foram
             afastadas dela) — um toco com o DN do tronco; a da VÁLVULA fica do lado da prumada dela, no sentido da água */
          var troncoC = novas.filter(function (o) { return o.op === "trecho" && o.sistema === "agua_fria" && o.continua && ["p1", "p2"].some(function (k) { return d3(o[k], esperaAF) <= B.TOL; }); })[0];
          if (troncoC) {
            ["p1", "p2"].forEach(function (k) { if (d3(troncoC[k], esperaAF) <= B.TOL) { troncoC.continua = troncoC.continua === "ambos" ? (k === "p1" ? "p2" : "p1") : (troncoC.continua === k ? "" : troncoC.continua); if (!troncoC.continua) delete troncoC.continua; } });
            var fimC = { x: r4(esperaAF.x + uj.x * geo(par, "lateralEntradaAF")), y: esperaAF.y, z: r4(esperaAF.z + uj.z * geo(par, "lateralEntradaAF")) };
            novas.push({ op: "trecho", id: ambId + "-afc", sistema: "agua_fria", material: troncoC.material, dn: troncoC.dn, p1: fimC, p2: { x: esperaAF.x, y: esperaAF.y, z: esperaAF.z }, continua: "p1", amb: ambId, ambParte: "espera_agua" });
          }
          var fimCx = troncoC ? fimC : esperaAF;
          var lj = Math.min(geo(par, "lateralEntradaAF") / 2, dj / 2);
          /* ⚠ B4 (06/11/2026, R-E2 / BimInst.esperaPermitida, CONTINUA_ESCONDE_PONTA no lavabo da CASA-COMPLETA): a espera da válvula saía
             da prumada na direção da do consumo e terminava a 14 cm dela, no prolongamento — para o verificador é um tubo que devia encostar
             e não encostou (BimInst.PERTO_ESPERA), ponta solta escondida. Ela fica além dessa distância (mais curta, no mesmo sentido: o
             barrilete chega como antes); se não sobrar perna (prumadas coladas), sai para o lado oposto. */
          var pertoE = num(B.PERTO_ESPERA, 0), sentidoV = 1;
          if (pertoE > 0 && dj - lj < pertoE + geo(par, "margemNo") / 2) { lj = r4(dj - pertoE - geo(par, "margemNo") / 2); if (lj < geo(par, "margemNo") / 2) { lj = r4(geo(par, "lateralEntradaAF") / 2); sentidoV = -1; } }
          /* ENCAIXE (07/11/2026, auditor de encaixe 3D): a espera da válvula é o trecho entre o joelho do topo da prumada e o joelho da coluna do
             barrilete — tem de comportar os dois joelhos com as bolsas (DN 50: 10 cm não cabiam, as peças se sobrepunham). Mínimo = 2 × o
             avanço do joelho + uma bolsa + 5 mm de corte (js/biminstgeo.js cotasConexao) */
          var HGa = dep("HidGeo", "./biminstgeo.js"), cja = null; try { cja = HGa && HGa.cotasConexao ? HGa.cotasConexao("pvc_soldavel", "joelho90", juntar.dn) : null; } catch (eJa) { cja = null; }
          var minAF = cja && cja.z > 0 ? r4((2 * cja.z + num(cja.pb, 0)) / 1000 + 0.005) : 0;   // hid:ok mm → m; 5 mm de corte
          if (lj < minAF) { lj = minAF; if (sentidoV === 1 && pertoE > 0 && dj - lj < pertoE + geo(par, "margemNo") / 2) sentidoV = -1; }
          var fimV = { x: r4(juntar.de.x + sentidoV * uj.x * lj), y: esperaAF.y, z: r4(juntar.de.z + sentidoV * uj.z * lj) };
          /* no sentido da água — da espera da válvula (p1, a ponta aberta) para a prumada dela (p2) */
          novas.push({ op: "trecho", id: ambId + "-afb", sistema: "agua_fria", material: "pvc_soldavel", dn: juntar.dn, p1: fimV, p2: juntar.de, continua: "p1", valvula: true, amb: ambId, ambParte: "espera_agua" });
          decide("amb.agua", "Duas esperas de água fria sob a laje: a do consumo em (" + f2(fimCx.x) + "; " + f2(fimCx.z) + ") e a EXCLUSIVA da válvula de descarga em (" + f2(fimV.x) + "; " + f2(fimV.z) + ") — cada uma com o seu ramal até a caixa.");
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
      /* ⚠ FRENTE H4 (21/10/2026): a BANCADA DE 2 CUBAS é UM aparelho com DOIS pontos de esgoto (um sifão por cuba): com a mesma
         ref para os dois, o ramal de ventilação da 2ª cuba procurava a tomada no caminho da 1ª (desc.filter(ref)[0]) e nascia em
         cima da ventilação dela (dois tubos no mesmo eixo, colados na descida da cuba). Cada sifão é um desconector: ref própria
         (aparelho:ponto) e `el` = o aparelho, para os ids dos avisos. */
      aparelhos.forEach(function (a) {
        if (!SIFAO[a.aparelho] && !(a.direto && a.aparelho === "lavatorio")) return;   /* o lavatório mandado direto ao ramal (par._lavDireto) é desconector próprio: a ventilação confere a distância dele */
        var csE = a.conectores.filter(function (c) { return c.sistema === "esgoto"; });
        csE.forEach(function (c) { var n0 = G.noPerto({ x: c.x, y: c.y, z: c.z }, B.TOL_CONECTOR); if (n0 != null) desc.push({ ref: csE.length > 1 ? a.id + ":" + c.id : a.id, el: a.id, no: n0, dn: null, pt: { x: c.x, z: c.z }, direto: !!a.direto }); });
      });
      if (!desc.length) return;
      /* sem a caixa sifonada (o lavatório foi direto e ninguém mais ia a ela), a tomada principal sai do ramal do outro desconector de sifão próprio (o mictório): o ponto serve a ele e à
         bacia. Saindo do ramal da bacia, o DN 100 pedia o esgoto mais fundo para o tê encaixar e o outro ainda ganhava um ramal próprio */
      if (!dCx && dBa && arr(par._lavDireto).length) { var iS = -1; desc.forEach(function (q, iq) { if (iS < 0 && q !== dBa && !q.direto) iS = iq; }); if (iS > 0) { var qS = desc.splice(iS, 1)[0]; desc.unshift(qS); } }
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
      function candidatos(q0, comCamadas) {
        var cs = [], comum = {};
        if (q0.caixa && dBa) dBa.cam.forEach(function (cq) { comum[cq.e.a + ">" + cq.e.b] = 1; });
        var sMin = fatorDn != null && q0.dn ? fatorDn * q0.dn / 1000 : 0;
        q0.cam.forEach(function (c, ic) {
          var t = c.e.t, Lh = d2(t.p1, t.p2); if (!(Lh > passo * 2) || Math.abs(t.p1.y - t.p2.y) > Lh) return;
          if (comum[c.e.a + ">" + c.e.b]) return;
          /* além da grade, os pontos em que o ramal passa sob uma parede com o tubo da ventilação inteiro na espessura: as camadas ao lado do eixo (atrás do tubo de água) e o próprio eixo */
          var ss = [], dnV0c = 40;   // hid:ok o menor ramal de ventilação (DN 40): a conta da camada na espessura
          for (var s0g = passo; s0g < c.e.L - passo + EPS; s0g += passo) ss.push(s0g);
          if (comCamadas && !arr(reservaAQ).length) paredes.forEach(function (pw) {
            var dxw = pw.p2.x - pw.p1.x, dzw = pw.p2.z - pw.p1.z, Lw = Math.sqrt(dxw * dxw + dzw * dzw); if (!(Lw > EPS)) return;
            var nx = -dzw / Lw, nz = dxw / Lw, d1 = (t.p1.x - pw.p1.x) * nx + (t.p1.z - pw.p1.z) * nz, d2n = (t.p2.x - pw.p1.x) * nx + (t.p2.z - pw.p1.z) * nz; if (Math.abs(d1 - d2n) < EPS) return;
            var cam = num(pw.espessura, 0) / 2 - raio(dnV0c) - COBRE_CAMADA;
            [0, CAMADA_PAREDE, -CAMADA_PAREDE, CAMADA_FUNDA, -CAMADA_FUNDA].forEach(function (of) {
              if (Math.abs(of) > cam + EPS) return;
              var f0 = (of - d1) / (d2n - d1); if (f0 <= 0 || f0 >= 1) return;
              var sw = r4(f0 * c.e.L), Xw = t.p1.x + (t.p2.x - t.p1.x) * f0, Zw = t.p1.z + (t.p2.z - t.p1.z) * f0, tw = (Xw - pw.p1.x) * dxw / Lw + (Zw - pw.p1.z) * dzw / Lw;
              if (tw < 0 || tw > Lw || sw < passo - EPS || sw > c.e.L - passo + EPS) return;
              if (ss.every(function (x) { return Math.abs(x - sw) > 0.005; })) ss.push(sw);   // hid:ok 5 mm: o mesmo ponto
            });
          });
          ss.sort(function (a, b) { return a - b; });
          ss.forEach(function (s) {
            if (c.s0 + s < sMin - EPS) return;   /* 4.3.16 b 4: no mínimo 2 × DN do desconector */
            var f = s / c.e.L, P = { x: r4(t.p1.x + (t.p2.x - t.p1.x) * f), y: r4(t.p1.y + (t.p2.y - t.p1.y) * f), z: r4(t.p1.z + (t.p2.z - t.p1.z) * f) }, viol = 0, dists = [];
            /* ⚠ o ponto da ventilação nunca DENTRO do cilindro de captura de uma peça (o ralo sifonado posto à mão perto do ramal):
               a ponta do ventilador "terminava no ralo" e o Verificar acusava sistemas misturados (caso do Rogério, 18/10/2026) */
            if (hubsV.some(function (k) { return d2(P, k) <= num((B.PECAS[k.peca] || {}).captura, 0) + raio(num(t.dn, 0)) + geo(par, "folga"); })) return;
            var sP = c.s0 + s;
            /* a tomada longe das conexões do ramal (a junção com o DN 100 da bacia, as curvas): o tê precisa do tubo reto */
            if (trs.some(function (u) {
              if (u === t) return false;
              var liga = d3(u.p1, t.p1) <= B.TOL || d3(u.p1, t.p2) <= B.TOL || d3(u.p2, t.p1) <= B.TOL || d3(u.p2, t.p2) <= B.TOL;   /* a conexão do nó: encosta, sem folga */
              return H._int.segSeg3(P, P, u.p1, u.p2) < raio(num(u.dn, 0)) + raio(num(t.dn, 0)) + (liga ? 0 : geo(par, "folga")) - EPS;
            })) return;
            desc.forEach(function (q) {
              var ach = null; q.cam.forEach(function (cq) { if (cq.e === c.e) ach = cq.s0 + s; });
              /* o desconector de OUTRO ramo (a bacia): desce até a junção e sobe o ramo da caixa até a tomada */
              if (ach == null) for (var k = ic; k < q0.cam.length; k++) { var nb = q0.cam[k].e.b; if (q.sNo[nb] != null) { ach = q.sNo[nb] + (q0.cam[k].s0 + q0.cam[k].e.L - sP); break; } }
              var ok = ach != null && (q.limite == null || ach <= q.limite - w0 + EPS);
              if (!ok) viol++;
              dists.push({ ref: q.ref, el: q.el || q.ref, L: ach == null ? null : r4(ach), limite: q.limite, dn: q.dn, ok: ok });
            });
            var dq = dists.filter(function (d) { return d.ref === q0.ref; })[0];
            /* o sentido do escoamento no ramal (p1 → p2) em planta: a junção 45° da ventilação sai para MONTANTE (a favor do fluxo) */
            var fxL = d2(t.p1, t.p2) || 1;
            if (dq && dq.ok) cs.push({ P: P, viol: viol, dists: dists, s: sP, dnEs: num(t.dn, 0), trecho: t.id, ref: q0.ref, fluxo: { x: (t.p2.x - t.p1.x) / fxL, z: (t.p2.z - t.p1.z) / fxL } });
          });
        });
        return cs;
      }
      /* as camadas da parede também na tomada principal: sem elas a coluna fazia um L sob o piso, os dois joelhos não cabiam e o esgoto do ambiente descia até 17 cm (revisão 09/11/2026: caixa de inspeção maior, +25 % no orçamento) */
      var cands = candidatos(desc[0], true);
      if (!cands.length) { pend("amb.ventilacao", "nenhum ponto horizontal do ramal de " + desc[0].ref + (desc[0].caixa && dBa ? " (antes da junção com o ramal da bacia)" : "") + " dentro da distância máxima da NBR 8160 (e a pelo menos 2 × DN do desconector) para ligar a ventilação", [desc[0].el || desc[0].ref]); return; }
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
      /* CASA-CAIXA (pendência 3 da 1.2.283, 13/11/2026): com caixa d'água no modelo, a COLUNA do barrilete (js/hidbarrilete.js) desce exatamente
         na prumada da ESPERA de água fria do ambiente, que ainda não existe quando a ventilação é traçada — a ventilação passava a 6–9 cm dela.
         O prolongamento vertical da espera até o teto entra como obstáculo de água (o mesmo afastamento de 10 cm), e a coluna depois desce livre */
      var temCaixaDagua = arr(estado.familias).some(function (f) { return /caixa-dagua/.test(String(f.famId)); });
      if (temCaixaDagua) outros = outros.concat(outros.filter(function (t) {
        return t.sistema === "agua_fria" && t.p1 && t.p2 && Math.abs(t.p1.x - t.p2.x) + Math.abs(t.p1.z - t.p2.z) < 1e-3 && !!t.continua;   // hid:ok tolerância de desenho / DN de reserva (geometria, não norma)
      }).map(function (t) {
        var top = t.p1.y >= t.p2.y ? t.p1 : t.p2, yTeto = piso + Math.max(geo(par, "peDireito"), geo(par, "alturaSaidaVentilacao"));   /* até onde a ventilação sobe: a coluna vem do barrilete, acima do forro */
        /* a coluna que vai descer ali tem o DN mínimo de coluna do barrilete (DN 50), não o DN 25 da espera: o obstáculo é do tamanho dela */
        var HBc = dep("HidBarrilete", "./hidbarrilete.js"), dnCol = Math.max(num(t.dn, 0), num(HBc && HBc.GEO_BAR && HBc.GEO_BAR.dnMinColuna, 0));
        return { op: "trecho", id: String(t.id) + ":prumada-coluna", sistema: "agua_fria", dn: dnCol, p1: { x: top.x, y: top.y, z: top.z }, p2: { x: top.x, y: yTeto, z: top.z }, virtual: true };
      }).filter(function (v) { return v.p2.y > v.p1.y + EPS; }));
      var mat = "pvc_esgoto", pr = ambId + "-ve-", nV = 0;
      /* a ALTURA DE SAÍDA da ventilação (projeto, editável no painel do kit): onde fica o terminal */
      var hSaida = geo(par, "alturaSaidaVentilacao"), ySaida = r4(piso + hSaida);
      /* FRENTE H3 (20/10/2026): o esgoto que JÁ está no modelo (o tubo de queda do shaft) também é obstáculo — o deitado passava a 0,3 cm
         do TQ entre ele e a coluna de ventilação. O esgoto do próprio ambiente (refeito agora) fica de fora */
      var esExist = arr(estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return t.sistema === "esgoto" && String(t.id).indexOf(ambId + "-") !== 0; });
      /* 21/10/2026: a subida que cruza ELA MESMA (dois trechos não vizinhos mais perto que o diâmetro + a folga) ou que passa pelo cilindro
         de captura de uma caixa sifonada/ralo (o tubo de ventilação "terminando" na caixa) também bate — sem isto a escolha que pondera o
         encaixe caía nessas posições (auditor: cozinha de 2 pias e a casa) */
      var cachePcs = { n: -1, v: null };   /* as caixas sifonadas/ralos do ambiente (só mudam quando entra peça nova) */
      function bateProprio(segs, r) {
        for (var i = 0; i < segs.length; i++) for (var j = i + 2; j < segs.length; j++) if (H._int.segSeg3(segs[i].a, segs[i].b, segs[j].a, segs[j].b) - 2 * r < geo(par, "folga") - EPS) return true;
        var pcs = cachePcs.n === novas.length && cachePcs.v ? cachePcs.v : (cachePcs.n = novas.length, cachePcs.v = novas.filter(function (o) { return o.op === "peca" && /^(caixa_sifonada|ralo_)/.test(String(o.peca)); }).concat(arr(estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return /^(caixa_sifonada|ralo_)/.test(String(k.peca)); })));
        return pcs.some(function (k) { var Pk = B.PECAS[k.peca] || {}, R0 = num(Pk.captura, 0) + r, y0 = num(k.y, 0) - num(Pk.prof, 0), y1 = num(k.y, 0); return segs.some(function (sg) { return H._int.segSeg3(sg.a, sg.b, { x: k.x, y: Math.min(Math.max(sg.a.y, y0), y1), z: k.z }, { x: k.x, y: Math.min(Math.max(sg.b.y, y0), y1), z: k.z }) < R0 && Math.min(sg.a.y, sg.b.y) <= y1 && Math.max(sg.a.y, sg.b.y) >= y0; }); });
      }
      /* ⚠ N23 (23/10/2026, auditor COZ-2PIAS): a ventilação de UM desconector não corre (deitado/desvio na parede) por cima do lugar
         onde OUTRO desconector do ambiente vai precisar subir o ramal de ventilação PRÓPRIO dele (o que está longe da tomada escolhida:
         c.dists com ok falso). Na cozinha de 2 pias, com o ramal aprofundado para o tê encaixar, o desvio da 1ª pia corria 1,35 m na
         parede por cima da 2ª; a subida da 2ª, depois, só tinha caminho ATRAVESSANDO esse deitado (−4 cm entre geratrizes) e colada
         na água fria. Conta como colisão na escolha e o desvio que cai em cima dele é recusado. */
      /* quanto a ventilação corre SOLTA, deitada acima do piso e fora da espessura de qualquer parede */
      function soltoNoAr(segsX) {
        return segsX.reduce(function (acum, sg) {
          var L = d2(sg.a, sg.b); if (!(L > EPS) || Math.min(sg.a.y, sg.b.y) <= piso + EPS) return acum;
          /* cinco pontos do trecho: o eixo dentro da espessura de uma parede */
          var fora = 0; [0.1, 0.3, 0.5, 0.7, 0.9].forEach(function (f) { var q = { x: sg.a.x + (sg.b.x - sg.a.x) * f, z: sg.a.z + (sg.b.z - sg.a.z) * f }; if (!paredes.some(function (w) { return distSeg(q, w.p1, w.p2) <= num(w.espessura, 0) / 2 + EPS; })) fora++; });
          return acum + L * fora / 5;
        }, 0);
      }
      function bloqueia(segsX, r, c) {
        var outrosD = desc.filter(function (q) { return q.pt && c && q.ref !== c.ref && arr(c.dists).some(function (d) { return d.ref === q.ref && !d.ok; }); });
        if (!outrosD.length) return false;
        var cor = geo(par, "corredorDesconector"), fo = geo(par, "folga");
        return segsX.some(function (sg) {
          var L = d2(sg.a, sg.b); if (!(L > EPS) || Math.abs(sg.a.y - sg.b.y) > L) return false;   /* só o que CORRE (o vertical sobe no lugar dele) */
          var ux = (sg.b.x - sg.a.x) / L, uz = (sg.b.z - sg.a.z) / L;
          return outrosD.some(function (q) {
            var dx = q.pt.x - sg.a.x, dz = q.pt.z - sg.a.z, tq = dx * ux + dz * uz, nq = Math.abs(-dx * uz + dz * ux), m = r * 2 + fo;
            return tq > -m && tq < L + m && nq <= cor;
          });
        });
      }
      /* N23 (23/10/2026): a colisão FÍSICA (geratrizes a menos da folga de montagem, qualquer sistema) pesa mais que a falta só do
         AFASTAMENTO de 10 cm da água fria (critério de projeto) e que o encaixe das peças: na cozinha de 2 pias a subida a 9,8 cm da
         prumada de água perdia para a que ATRAVESSAVA a descida da pia (as duas contavam "bate" igual e o encaixe desempatava) */
      /* colisão física com tubo de outro sistema (água, gás, piscina): a distância entre os eixos menor que a soma dos raios */
      function atravessaOutro(segs, r) { return outros.some(function (t2) { if (t2.sistema === "ventilacao" || t2.sistema === "esgoto" || !t2.p1 || !t2.p2) return false; return segs.some(function (sg) { return H._int.segSeg3(sg.a, sg.b, t2.p1, t2.p2) < r + raio(num(t2.dn, 0)) - EPS; }); }); }
      function bateDuro(segs, r, exceto, tomada) { var a0 = par.afastamento; par.afastamento = geo(par, "folga"); try { return bateEm(segs, r, exceto, tomada); } finally { if (a0 === undefined) delete par.afastamento; else par.afastamento = a0; } }
      function bateEm(segs, r, exceto, tomada) {
        return outros.concat(esExist).concat(novas.filter(function (o) { return o.op === "trecho" && o.sistema === "ventilacao"; })).some(function (t) {
          /* FRENTE H3 (20/10/2026): a COLUNA de destino só é isenta no trecho que CHEGA nela (a junção); antes era isenta em todos e o
             deitado sob o piso passava rente à coluna de ventilação (folga −2,1 cm), e o último trecho parava a 3 cm do eixo dela */
          var exc = exceto && exceto.some(function (x) { return x === t || (x && x.id != null && x.id === t.id); });
          return segs.some(function (sg) {
            /* o trecho que entra na coluna: a junção. ⚠ FRENTE H4 (21/10/2026): só o que CHEGA de fora dela — o vertical do desvio que
               subia NO EIXO da coluna (a ventilação da 2ª pia/tanque) também "terminava nela" em planta e corria 1,6 m dentro dela */
            if (exc && d2(sg.b, t.p1) <= B.TOL && d2(sg.a, t.p1) > raio(num(t.dn, 0)) + r - EPS) return false;
            return H._int.segSeg3(sg.a, sg.b, t.p1, t.p2) - r - raio(num(t.dn, 0)) < (t.sistema === "agua_fria" ? geo(par, "afastamento") : geo(par, "folga")) - EPS;
          });
        }) || trs.some(function (t) {
          if (tomada && (t.id === tomada.trecho || (tomada.col && tomada.col[t.id]))) return false;
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
      function pernaMinima(r, rCol) {
        var HGp = dep("HidGeo", "./biminstgeo.js"); if (!HGp || !HGp.facesNo) return null;
        var dn = Math.round(r * 2000), dnF = rCol ? Math.max(dn, Math.round(rCol * 2000)) : dn;   // hid:ok DN em mm
        var a = HGp.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dn }, [{ d: [0, -1, 0], chega: true, dn: dn }, { d: [1, 0, 0], chega: false, dn: dn }])[1], b = HGp.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnF }, [{ d: [-1, 0, 0], chega: true, dn: dnF }, { d: [0, 1, 0], chega: false, dn: dnF }])[0];
        if (a == null || b == null) return null;
        var cL = null; try { cL = HGp.cotasConexao("pvc_esgoto", "luva", dn); } catch (e) { cL = null; }
        return a + b + 2 * (cL ? (cL.pb2 || cL.pb || 0) / 1000 : 0);
      }
      function subida(c, r, yAte, alvo, rColuna) {
        var best = null, passoP = geo(par, "passoParede"), nP = Math.round(geo(par, "deslizeParede") / passoP), nPmax = nP * 2;
        /* ⚠ o tê fica ACIMA DO EIXO do ramal (4.3.16 b 1): a derivação sobe o que o enchimento sob o piso deixa — o ideal é o
           tubo da ventilação inteiro acima do ramal; o mínimo, o eixo dela na geratriz de cima do ramal */
        var hIdeal = raio(c.dnEs) + r + geo(par, "folga"), hMin = raio(c.dnEs);
        /* ⚠ 2ª PRIORIDADE de 21/10/2026 (print do Rogério): o JOELHO que vem depois do tê não pode ficar mais perto do centro do tê do que
           a face da derivação + a face do joelho (as peças MEDIDAS, js/biminstgeo.js alcanceDerivacao) — com 8 cm de subida o joelho
           entrava no tê e a ponta da ventilação não entrava em bolsa nenhuma. O tê sobe isso; na junção 45° o comprimento no eixo da
           derivação (subida × √2). Sem o perfil medido: como antes */
        var HGg = dep("HidGeo", "./biminstgeo.js"), dnV0 = r * 2 * 1000;
        var hGeoTe = HGg && HGg.facesNo ? (function () { var a = HGg.facesNo({ tipo: "te", material: "pvc_esgoto", dn: c.dnEs }, [{ d: [1, 0, 0], passante: true, dn: c.dnEs }, { d: [0, 1, 0], chega: false, dn: dnV0 }])[1], b = HGg.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnV0 }, [{ d: [0, -1, 0], chega: true, dn: dnV0 }, { d: [1, 0, 0], chega: false, dn: dnV0 }])[0]; return a != null && b != null ? a + b : null; })() : null;
        /* o ENCAIXE de cada trecho da subida entre as duas conexões dele (as peças medidas): face da peça do começo + face da do fim
           ≤ comprimento — o tê/junção do ramal (derivação), os joelhos (o tubo que chega entra na perna de bolsa; o que sai, na de luva;
           a tangência do ângulo real) e o tê da coluna de ventilação no fim. Devolve o quanto falta (m) no pior trecho (0 = encaixa) */
        var memoFaces = {}, ondeE = { i: 0 }, dnProxV = HRcomercial("ventilacao", dnV0 + 1);
        /* o passo mínimo do DESVIO na parede: o joelho do tubo + o do DN seguinte (a coluna pode subir maior) */
        var LJdes = HGg && HGg.facesNo && dnProxV ? (function () { var a = HGg.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnV0 }, [{ d: [0, -1, 0], chega: true, dn: dnV0 }, { d: [1, 0, 0], chega: false, dn: dnV0 }])[1], b = HGg.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnProxV }, [{ d: [-1, 0, 0], chega: true, dn: dnProxV }, { d: [0, 1, 0], chega: false, dn: dnProxV }])[0]; return a != null && b != null ? a + b + MARGEM_ENCAIXE : null; })() : null;
        /* a perna da JUNÇÃO 45° no plano dela: o joelho 45° que volta ao horizontal + o joelho 90° que vira para a parede */
        var LJ45 = HGg && HGg.facesNo ? (function () { var a = HGg.facesNo({ tipo: "joelho45", material: "pvc_esgoto", dn: dnV0 }, [{ d: [Math.SQRT1_2, -Math.SQRT1_2, 0], chega: true, dn: dnV0 }, { d: [-1, 0, 0], chega: false, dn: dnV0 }])[1], b = HGg.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnV0 }, [{ d: [1, 0, 0], chega: true, dn: dnV0 }, { d: [0, 0, 1], chega: false, dn: dnV0 }])[0]; return a != null && b != null ? a + b + MARGEM_ENCAIXE : null; })() : null;
        /* a subida mínima da JUNÇÃO 45° para a derivação + o joelho 45° encaixarem (m, na vertical: o comprimento no eixo ÷ √2) */
        var hJ45 = HGg && HGg.facesNo ? (function () { var s2 = Math.SQRT1_2, a = HGg.facesNo({ tipo: "juncao", material: "pvc_esgoto", dn: c.dnEs }, [{ d: [1, 0, 0], passante: true, dn: c.dnEs }, { d: [-s2, s2, 0], chega: false, dn: dnV0 }])[1], b = HGg.facesNo({ tipo: "joelho45", material: "pvc_esgoto", dn: dnV0 }, [{ d: [s2, -s2, 0], chega: true, dn: dnV0 }, { d: [-1, 0, 0], chega: false, dn: dnV0 }])[0]; return a != null && b != null ? (a + b) * s2 + MARGEM_ENCAIXE : null; })() : null;
        var LJ90 = HGg && HGg.facesNo ? (function () { var f = HGg.facesNo({ tipo: "joelho90", material: "pvc_esgoto", dn: dnV0 }, [{ d: [0, -1, 0], chega: true, dn: dnV0 }, { d: [1, 0, 0], chega: false, dn: dnV0 }]); return f[0] != null && f[1] != null ? f[0] + f[1] + MARGEM_ENCAIXE : null; })() : null;   /* a perna mínima entre dois joelhos (m) */   /* ondeE.i: o trecho da subida onde falta mais (0 = o do tê/junção do ramal) */
        function facesM(cx, ramos) { var k = JSON.stringify([cx, ramos.map(function (q) { return [Math.round(q.d[0] * 1e3), Math.round(q.d[1] * 1e3), Math.round(q.d[2] * 1e3), q.chega, q.passante, q.dn]; })]); if (!memoFaces[k]) memoFaces[k] = HGg.facesNo(cx, ramos); return memoFaces[k]; }   // hid:ok 1e3 = chave da direção com 3 casas
        function encaixeFalta(sg, j45, dnFim) {
          if (!HGg || !HGg.facesNo) return 0;
          var L = [], D = [];
          sg.forEach(function (q) { var dx = q.b.x - q.a.x, dy = q.b.y - q.a.y, dz = q.b.z - q.a.z, Lq = Math.sqrt(dx * dx + dy * dy + dz * dz); if (Lq > EPS) { L.push(Lq); D.push([dx / Lq, dy / Lq, dz / Lq]); } });
          if (!L.length) return 0;
          function ang(i) { var a = D[i], b = D[i + 1], cs = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])); return Math.acos(cs) * 180 / Math.PI; }   // hid:ok radianos → graus
          var ANG_MIN = 1, ANG_45 = 67.5, fIni = [], fFim = [];   // hid:ok abaixo de 1° os trechos seguem retos (sem conexão); até 67,5° o joelho de 45°
          /* a peça do ramal (a MESMA conta do 3D: HidGeo.facesNo) — o ramal na horizontal pelo fluxo, a derivação na direção do 1º trecho */
          var fl = c.fluxo ? [c.fluxo.x, 0, c.fluxo.z] : [1, 0, 0];
          fIni[0] = facesM({ tipo: j45 ? "juncao" : "te", material: "pvc_esgoto", dn: c.dnEs }, [{ d: fl, passante: true, dn: c.dnEs }, { d: D[0], chega: false, dn: dnV0 }])[1];
          for (var i = 0; i + 1 < L.length; i++) {
            var g = ang(i); if (g <= ANG_MIN) { fFim[i] = 0; fIni[i + 1] = 0; continue; }
            /* o joelho antes do ÚLTIMO trecho sem coluna de destino (o terminal): o último trecho é a coluna, de DN que pode ser maior
               (Tabela 2) — o joelho é o dela (conta pelo DN seguinte: a casa tinha 10 cm entre o joelho DN 40 e o DN 50, 110 mm de peças) */
            var dnJ = !dnFim && i + 1 === L.length - 1 && dnProxV ? dnProxV : dnV0, fj0 = dnJ !== dnV0 ? facesM({ tipo: g <= ANG_45 ? "joelho45" : "joelho90", material: "pvc_esgoto", dn: dnJ }, [{ d: [-D[i][0], -D[i][1], -D[i][2]], chega: true, dn: dnJ }, { d: D[i + 1], chega: false, dn: dnJ }]) : null;
            var fj = facesM({ tipo: g <= ANG_45 ? "joelho45" : "joelho90", material: "pvc_esgoto", dn: dnV0 }, [{ d: [-D[i][0], -D[i][1], -D[i][2]], chega: true, dn: dnV0 }, { d: D[i + 1], chega: false, dn: dnV0 }]);
            if (fj0) fj = [Math.max(num(fj[0], 0), num(fj0[0], 0)), Math.max(num(fj[1], 0), num(fj0[1], 0))];
            fFim[i] = fj[0]; fIni[i + 1] = fj[1];
          }
          var k = L.length - 1;
          fFim[k] = dnFim ? facesM({ tipo: "te", material: "pvc_esgoto", dn: dnFim }, [{ d: [0, 1, 0], passante: true, dn: dnFim }, { d: [-D[k][0], -D[k][1], -D[k][2]], chega: true, dn: dnV0 }])[1] : 0;
          var pior = 0; ondeE.i = 0; ondeE.f0 = 0;
          for (var m = 0; m < L.length; m++) { var fm = num(fIni[m], 0) + num(fFim[m], 0) - L[m]; if (m === 0) ondeE.f0 = fm; if (fm > pior) { pior = fm; ondeE.i = m; } }
          return pior;
        }
        function cortaAbertura(sg, rr) {
          var Hc = dep("HidCriterios", "./hidcriterios.js"); if (!Hc || !Hc.caixasAbertura) return false;
          return arr(obst.aberturas).some(function (a) { return Hc.caixasAbertura(a, par).some(function (z) { return sg.some(function (s) { return !!Hc._int.recorte(z.caixa, s.a, s.b, rr, rr); }); }); });
        }
        function varrer() { paredes.forEach(function (w) {
          if (num(w.espessura, 0) < 2 * r + EPS) return;   /* o tubo não cabe dentro da parede */
          var q0 = projParede(c.P, w, num(w.espessura, 0) / 2); if (!q0) return;   /* embutir = meia espessura → o EIXO da parede */
          /* a tomada já está SOB a parede (o ramal corre por baixo dela): sobe ali mesmo, sem trecho deitado. ⚠ Só com o tubo INTEIRO na espessura (08/11/2026, a ventilação do tanque da casa: a
             7,5 cm do eixo de uma parede de 15 cm ela subia na face, metade do tubo para fora, 4,3 m assim) */
          /* com aquecedor no modelo a água quente desce na camada funda (js/hidaqtraco.js R-AQ4), depois da ventilação: as camadas ficam para ela e a tomada segue a regra de antes, com pendência quando sobra fora da parede */
          var sobParede = arr(reservaAQ).length ? d2(c.P, q0) < geo(par, "margemNo") : d2(c.P, q0) + Math.max(r, num(rColuna, 0)) <= num(w.espessura, 0) / 2 + EPS;
          if (sobParede) q0 = { x: c.P.x, z: c.P.z };
          var dx = w.p2.x - w.p1.x, dz = w.p2.z - w.p1.z, Lw = Math.sqrt(dx * dx + dz * dz), u = { x: dx / Lw, z: dz / Lw };
          /* ⚠ o ponto na parede DESLIZA ao longo dela (em L): o ramal da bacia corre perpendicular à parede e a subida no
             mesmo eixo batia na prumada da válvula */
          for (var k = -nP; k <= nP; k++) {
            var q = { x: r4(q0.x + u.x * k * passoP), z: r4(q0.z + u.z * k * passoP) }, tq = (q.x - w.p1.x) * u.x + (q.z - w.p1.z) * u.z;
            if (tq < geo(par, "afastParede") || tq > Lw - geo(par, "afastParede")) continue;
            /* FRENTE H3 (20/10/2026): DUAS alturas do deitado sob o piso — a do tê no ideal (modoH 0) e a MAIS ALTA que o enchimento
               deixa (modoH 1, "por cima"): o deitado que cruza outro tubo de esgoto (o ramal DN 100 da bacia, no andar do prédio)
               passa por cima dele, sempre subindo; a escolha fica com a que não bate (a nota pesa a colisão) */
            for (var modoH = 0; modoH < 2; modoH++) {
            /* já sob a parede, deslizar é correr dentro dela, sem canto: afasta a subida do joelho do aparelho e da água fria */
            var canto = k === 0 || sobParede ? null : { x: r4(c.P.x + (q.x - q0.x)), z: r4(c.P.z + (q.z - q0.z)) };
            var L1 = canto ? d2(c.P, canto) : 0, L2 = d2(canto || c.P, q), Lh = L1 + L2;
            /* PRIORIDADE 21/10/2026 (encaixe): a perna do L mais curta que os dois joelhos dela (a luva de um + a bolsa do outro, as
               peças medidas) não se monta — no andar do prédio saíam 10 cm entre dois joelhos DN 50 (164 mm de peças). Essa posição sai
               da escolha (fica o deslize maior ou a subida sem canto; reto em diagonal passava rente ao esgoto do tanque) */
            if (canto && LJ90 != null && (L1 < LJ90 || L2 < LJ90)) continue;
            var hTopo = piso - geo(par, "cobrimento") - r - Lh * ac - c.P.y;   /* o mais alto que o deitado vai, com o aclive, sob o piso */
            /* só no ANDAR (rebaixo com o esgoto descido pela reserva): no térreo o desvio dentro da parede segue sendo a escolha */
            if (modoH === 1 && (terreo || !(Lh > EPS && hTopo > hIdeal + EPS))) continue;
            /* subindo direto (a tomada já sob a parede) não há trecho deitado: o tê sobe dentro da parede */
            var hTe = Lh <= EPS ? hIdeal : (modoH === 1 ? hTopo : Math.min(hIdeal, hTopo)), acT = ac;
            /* o tê vertical sobe o que as peças medidas pedem (a face da derivação + a do joelho), quando o enchimento sob o piso deixa;
               se não deixa, a escolha fica como antes e o encaixe pesa (e vira pendência quando nenhuma posição encaixa) */
            if (Lh > EPS && hGeoTe != null && hTe >= hIdeal - EPS && hTe < hGeoTe + MARGEM_ENCAIXE && hGeoTe + MARGEM_ENCAIXE <= hTopo + EPS) hTe = hGeoTe + MARGEM_ENCAIXE;
            /* o tê não sobe o ideal: ligação em ângulo menor (junção 45°) e o trecho inicial no aclive dela (4.3.16 b 2) */
            var semIni = false;
            if (Lh > EPS && hTe < hIdeal - EPS) {
              var hTe2 = Math.min(hIdeal, piso - geo(par, "cobrimento") - r - Lh * acIni - c.P.y);
              /* ⚠ não coube com o aclive da 4.3.16 b 2 (o rebaixo do andar, test-hid-predio): fica o aclive mínimo, com AVISO — melhor
                 que o ambiente sem ventilação; a escolha prefere a posição em que o aclive da tabela cabe */
              if (hTe2 >= hMin - EPS) { acT = acIni; hTe = hTe2; } else semIni = acIni > ac + EPS;
            }
            if (hTe < hMin - EPS) continue;   /* o trecho deitado sob o piso precisa caber no enchimento, com o tê acima do eixo */
            var T = { x: c.P.x, y: chao4(c.P.y + hTe), z: c.P.z }, j45 = false, T2 = null;
            /* 21/10/2026: na junção 45° o JOELHO 45° volta ao horizontal no MESMO plano da derivação (ao longo do ramal) e o deitado corre
               Lc até o próximo joelho — as faces medidas das duas peças; antes o deitado virava direto no fim da derivação (~90°) e o joelho
               entrava na junção */
            var Lc = 0;
            /* FRENTE H1 (20/10/2026, revisão): em ÂNGULO MENOR a peça é a JUNÇÃO 45° — a derivação sai a 45° ao longo do ramal, para
               montante (o braço da junção a favor do fluxo), subindo o hTe; o deitado começa no fim dela. Antes a tomada dizia
               "juncao45" e o modelo desenhava a subida vertical (o 3D e o orçamento contavam o tê): memorial × modelo divergiam */
            /* PRIORIDADE 21/10/2026 (encaixe): no ANDAR, o tê + o joelho que não cabem no rebaixo (o esgoto não pode descer: a laje) vão
               para a JUNÇÃO 45° + joelho 45° (4.3.16 b 2), subindo o que essas peças pedem — nunca peças sobrepostas no 3D. No térreo o
               ligar aprofunda o esgoto e o tê encaixa */
            var forca45 = !terreo && Lh > EPS && hGeoTe != null && hJ45 != null && hGeoTe + MARGEM_ENCAIXE > hTopo + EPS && hTe >= hIdeal - EPS;
            if (Lh > EPS && (hTe < hIdeal - EPS || forca45) && c.fluxo) {
              var alvoJ = forca45 ? Math.max(hIdeal, hJ45) : hIdeal;
              /* o joelho 45° volta ao horizontal NO PLANO da junção e o deitado corre Lc ao longo do ramal até o joelho que vira para a
                 parede (antes Lc = 0: o deitado virava direto no fim da derivação, ~90°, e o joelho entrava na junção) */
              Lc = LJ45 != null ? LJ45 : 0;
              for (var it45 = 0; it45 < 2; it45++) {   /* o deitado depende do fim da junção, que depende do hTe: duas passadas bastam */
                var Tp = { x: c.P.x - c.fluxo.x * (hTe + Lc), z: c.P.z - c.fluxo.z * (hTe + Lc) }, sU = (q.x - Tp.x) * u.x + (q.z - Tp.z) * u.z;
                var c2 = { x: r4(Tp.x + u.x * sU), z: r4(Tp.z + u.z * sU) }, L1j = d2(Tp, c2), L2j = d2(c2, q);
                var hJ = Math.min(alvoJ, piso - geo(par, "cobrimento") - r - (Lc + L1j + L2j) * acT - c.P.y);
                if (hJ < hMin - EPS) { hTe = -1; break; }
                hTe = hJ; canto = L1j > EPS && L2j > EPS ? c2 : null; L1 = canto ? L1j : 0; L2 = canto ? L2j : L1j + L2j; Lh = L1j + L2j;
              }
              if (hTe < hMin - EPS) continue;
              T = { x: r4(c.P.x - c.fluxo.x * hTe), y: chao4(c.P.y + hTe), z: r4(c.P.z - c.fluxo.z * hTe) }; j45 = true;
              if (Lc > EPS) T2 = { x: r4(T.x - c.fluxo.x * Lc), y: teto4(T.y + Lc * acT), z: r4(T.z - c.fluxo.z * Lc) };
              if (canto && LJ90 != null && (L1 < LJ90 || L2 < LJ90)) continue;   /* a perna curta do L (os joelhos não cabem): fora da escolha */
            }
            var T0 = T2 || T;   /* o começo do deitado */
            var yC = canto ? teto4(T0.y + L1 * acT) : T0.y, yW = Lh > geo(par, "margemNo") ? teto4(T0.y + Lh * acT) : T0.y;
            if (Lh > EPS && yW > piso - geo(par, "cobrimento") - r + EPS) continue;
            if (obst.aberturas.some(function (a) { return a.tipo === "porta" && distSeg(q, a.p1, a.p2) < geo(par, "raioPorta"); })) continue;
            /* A2 (revisão 09/11/2026): a perna deitada entre o joelho do tê e o da coluna comporta os dois joelhos (o da coluna no DN dela) e as bolsas: 10 cm de DN 50 não se monta */
            if (Lh > EPS && !canto && pernaMinima(r, rColuna) != null && d2(T0, q) < pernaMinima(r, rColuna) - EPS) continue;
            /* correndo dentro da parede, não passa colado na descida do próprio aparelho (a zona do tê não vale aqui: o tubo vai embora) */
            if (Lh > EPS && ((sobParede && k !== 0) || alvo || rColuna) && trs.some(function (u) { return u.id !== c.trecho && H._int.segSeg3(T0, canto ? { x: canto.x, y: yC, z: canto.z } : { x: q.x, y: yW, z: q.z }, u.p1, u.p2) - r - raio(num(u.dn, 0)) < geo(par, "folga") - EPS; })) continue;
            var top = { x: q.x, y: yAte(q), z: q.z }, segs = [{ a: c.P, b: T }];
            if (T2) segs.push({ a: T, b: T2 });
            if (Lh <= EPS) { segs = [{ a: c.P, b: top }]; yW = c.P.y; }   /* o tê sobe direto: a derivação É a coluna */
            else {
              if (canto) segs.push({ a: T0, b: { x: canto.x, y: yC, z: canto.z } });
              if (d2(canto || T0, q) > EPS) segs.push({ a: canto ? { x: canto.x, y: yC, z: canto.z } : T0, b: { x: q.x, y: yW, z: q.z } });
              segs.push({ a: { x: q.x, y: canto && d2(canto, q) <= EPS ? yC : yW, z: q.z }, b: top });
            }
            var extra = alvo ? alvo(top) : null; if (alvo && !extra) continue;
            /* CRITÉRIO DE PROJETISTA (js/hidcriterios.js, 18/10/2026): a subida não passa no vão, na verga nem na contraverga de
               porta ou janela (o e2e do critério achou a ventilação subindo no meio da janela da parede hidráulica) */
            if (cortaAbertura(segs.concat(extra ? extra.segs : []), r)) continue;
            var tomada = { trecho: c.trecho, P: c.P, zona: raio(c.dnEs) + 2 * r + geo(par, "folga") };
            var todas = segs.concat(extra ? extra.segs : []), bate = bateEm(todas, r, extra ? extra.exceto : null, tomada) || bateProprio(todas, r) || (!!rColuna && bateEm(segs.slice(-1), rColuna, null, tomada)), desvio = 0;
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
                  if (LJdes != null && jd * passoP < LJdes) continue;   /* o desvio mais curto que os dois joelhos dele não se monta */
                  var dxD = sd * jd * passoP, q2 = { x: r4(q.x + u.x * dxD), z: r4(q.z + u.z * dxD) }, t2 = (q2.x - w.p1.x) * u.x + (q2.z - w.p1.z) * u.z;
                  if (t2 < geo(par, "afastParede") || t2 > Lw - geo(par, "afastParede")) continue;
                  var yD2 = teto4(yD + Math.abs(dxD) * ac), pD = { x: q.x, y: yD, z: q.z }, pD2 = { x: q2.x, y: yD2, z: q2.z };
                  var top2 = { x: q2.x, y: yAte(q2), z: q2.z }, segsD = segs.slice(0, -1).concat([{ a: vert.a, b: pD }, { a: pD, b: pD2 }, { a: pD2, b: top2 }]);
                  var extra2 = alvo ? alvo(top2) : null; if (alvo && !extra2) continue;
                  if (top2.y > yD2 + geo(par, "margemNo") && !bateEm(segsD.concat(extra2 ? extra2.segs : []), r, extra2 ? extra2.exceto : null, tomada) && !(rColuna && bateEm(segsD.slice(-1), rColuna, null, tomada)) && !cortaAbertura(segsD.concat(extra2 ? extra2.segs : []), r) && !bloqueia(segsD.concat(extra2 ? extra2.segs : []), r, c)) achou = { segs: segsD, L: Math.abs(dxD), top: top2, extra: extra2 };
                }
                return !!achou;
              });
              if (achou) { segs = achou.segs; top = achou.top; extra = achou.extra; bate = false; desvio = achou.L; }
            }
            /* o encaixe só é medido quando a posição ainda pode ganhar (a nota sem ele já perde → pula: o prédio ficava 4× mais lento) */
            /* REVISÃO H6 (21/10/2026) + autor 0eeb5895: o encaixe e a subida cruzando ela mesma são medidos na rota FINAL — com o DESVIO na
               parede, os trechos dele (antes o caminho de antes do desvio: a área de serviço de 2 tanques declarava 5 mm e o 3D sobrepunha
               27 e 34 mm); o tê da chegada com o DN da COLUNA (ateColuna leva o dn) */
            var segsF = desvio ? segs.concat(extra ? extra.segs : []) : todas;   /* com o desvio na parede, a rota nova (o bateEm do desvio não confere a própria subida) */
            var duro = bate && bateDuro(segsF, r, extra ? extra.exceto : null, tomada);
            var nota = c.viol * 1000 + (duro ? PESO_BATE_DURO : 0) + (bate || (desvio && bateProprio(segsF, r)) || bloqueia(segsF, r, c) ? (bate && !duro ? PESO_BATE_AFAST : 100) : 0) + Lh + (canto ? geo(par, "pesoCurva") : 0) + (desvio ? desvio + geo(par, "pesoCurva") * 2 : 0) + (extra ? extra.L : 0) + c.s * 0.01 + (semIni ? 100 : 0) + (!CV && soltoNoAr(segsF) > geo(par, "margemNo") ? PESO_SOLTO : 0);   // hid:ok pesos da escolha: norma, colisão, comprimento (sem o aclive inicial da tabela pesa como a colisão)
            var faltaE = best && nota >= best.nota - EPS ? 0 : encaixeFalta(segsF, j45, alvo ? (extra && extra.dn > 0 ? extra.dn : (CV ? num(CV.dn, dnV0) : dnV0)) : null) + MARGEM_ENCAIXE;
            var faltaOnde = ondeE.i, falta0 = ondeE.f0;
            if (faltaE > EPS_ENCAIXE) nota += PESO_ENCAIXE;
            /* o que não encaixa no trecho do tê faz o esgoto do ambiente descer (aprofundarEncaixe): rede e caixa de inspeção mais fundas, +25 % no orçamento na revisão de 09/11/2026. Pesa mais que passar perto da água */
            if (falta0 > EPS_ENCAIXE) nota += PESO_PROFUNDIDADE;
            if (!best || nota < best.nota - EPS) best = { c: c, q: q, canto: canto, yC: yC, yW: yW, Lh: Lh, top: top, bate: bate, nota: nota, extra: extra, segs: segs, w: w, hTe: r4(T.y - c.P.y), desvio: desvio, angMenor: j45, faltaEncaixe: faltaE, faltaOnde: faltaOnde, falta0: falta0, aclive: acT, semIni: semIni, porCima: modoH === 1 };
            }
          }
        }); }
        varrer();
        /* N23 (23/10/2026, auditor COZ-2PIAS): nenhuma posição sem colisão no deslize normal (a 1ª pia entre a prumada da água e a
           descida da pia: a 60 cm a subida passava a 9,75 cm da água — o afastamento é 10 cm) → procura de novo até o DOBRO do deslize
           (o que fecha sem bater vence; o que ainda bate fica como antes, com o aviso) */
        if ((!best || best.bate) && nP < nPmax) { nP = nPmax; varrer(); }
        return best;
      }
      var melhor = null, CV = destinos.ventilacao || null, coluna = null;
      var cobertos = {}, RAIO_VERT = 0.01, CAMADA_VENT = CAMADA_PAREDE, PERNA_DESVIO_VENT = 0.13;   // hid:ok 1 cm em planta: o trecho é vertical; 13 cm: os dois joelhos e as bolsas do DN 40 (o trecho vertical do desvio)
      var DESLIZES_VENT = [0]; for (var iDz = 1; iDz <= 15; iDz++) { DESLIZES_VENT.push(iDz / 10); DESLIZES_VENT.push(-iDz / 10); }   // hid:ok de 10 em 10 cm, até 1,50 m
      var HGv = dep("HidGeo", "./biminstgeo.js");
      /* C1 (revisão 09/11/2026, cozinha da Casa 487, parede de 11,5 cm): sem nenhuma subida a partir do ramal, a tomada vai à DESCIDA de um aparelho de sifão próprio, por junção de 45° (NBR 8160 4.3.16 a), em vez de deixar o ambiente sem ventilação (4.3.11).
         Vale para a coluna do prédio (col) ou até a altura de saída. Os desconectores que essa tomada não atende seguem pelo caminho normal dos ramais */
      function cortarNoTeto(b) {
        if (!b.segs.length) return false;
        var ult = b.segs[b.segs.length - 1], yC = r4(tetoA.y); if (!(yC > ult.a.y + geo(par, "margemNo") && yC < ult.b.y - geo(par, "margemNo"))) return false;
        b.segs.pop(); var m = { x: ult.a.x, y: yC, z: ult.a.z }; b.segs.push({ a: ult.a, b: m }); b.segs.push({ a: m, b: ult.b });
        return true;
      }
      function ventDescidaReserva(col, yTopo) {
        var achou = null;
        desc.some(function (q) {
          if (q.caixa || q.bacia || !q.pt) return false;
          var dnTt = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }).filter(function (x) { return x >= dnV - EPS; })[0];
          var b = ventNaDescida(q, dnV, col ? yTopo : ySaida, col, col ? null : dnTt);
          if (!b) return false;
          desc.forEach(function (q2) { if (!b.c.dists.some(function (d) { return d.ref === q2.ref; })) b.c.dists.push({ ref: q2.ref, el: q2.el || q2.ref, L: null, limite: q2.limite, dn: q2.dn, ok: false }); });
          b.reserva = q.ref; achou = b; return true;
        });
        if (achou) decide("amb.ventilacao.na_descida", "Ventilação de " + achou.reserva + " na descida do aparelho, por junção de 45° (NBR 8160 4.3.16 a): o ramal não tem por onde subir dentro de uma parede.");
        return achou;
      }
      /* rota do topo de uma subida até a coluna: em L sob o teto, subindo o aclive na direção dela (o ramal de ventilação) */
      function ateColuna(col) {
        return function (top) {
          var C = { x: col.p1.x, z: col.p1.z }, L1 = Math.abs(C.x - top.x), L2 = Math.abs(C.z - top.z);
          var mid = { x: C.x, y: teto4(top.y + L1 * ac), z: top.z }, fim = { x: C.x, y: teto4(mid.y + L2 * ac), z: C.z };   /* F6: teto4 (para cima) — com r4 o aclive saía 0,9985 % (< 1 % mínimo) e reprovava o 4.3.9 */
          if (fim.y > col.p2.y - geo(par, "margemNo") || fim.y < col.p1.y + geo(par, "margemNo")) return null;
          var segs = []; if (L1 > EPS) segs.push({ a: top, b: mid }); if (L2 > EPS) segs.push({ a: L1 > EPS ? mid : top, b: fim });
          return { segs: segs, L: L1 + L2, fim: fim, exceto: [col], dn: col.dn != null ? num(col.dn, 0) : null };   /* o DN da coluna: o tê da chegada (o encaixe) */
        };
      }
      var yJunta = null, minTransb = null;
      /* nenhuma posição encaixou as conexões (o rebaixo/enchimento não tem altura para o tê + o joelho): a melhor fica, com a pendência */
      /* REVISÃO H6: onde falta diz o texto — no 1º trecho (o tê/junção do ramal + o joelho, sob o piso) ou mais adiante (os joelhos do
         desvio / do caminho até a coluna e o tê da coluna, perto do teto); antes o texto dizia "sob o piso" para os dois */
      function encaixePend(m) {
        if (!(m && m.faltaEncaixe - MARGEM_ENCAIXE > EPS_ENCAIXE)) return;
        var mmE = Math.round((m.faltaEncaixe - MARGEM_ENCAIXE) * 1000), noRamal = !m.faltaOnde;
        pend("amb.ventilacao_encaixe", "a ventilação de " + desc[0].ref + " (ambiente " + ambId + "): faltam " + mmE + " mm entre as conexões — " + (noRamal ? "sem altura sob o piso para o tê/junção do ramal + o joelho da ventilação" : "sem comprimento entre os joelhos do caminho até a coluna e o tê da coluna") + " (as peças se sobrepõem no 3D): " + (noRamal ? "aprofunde o ramal/rebaixo ou suba a ventilação direto na parede" : "afaste a subida da coluna (ou ligue direto nela) à mão"), ids, { tipo: "ajustar", ids: ids, ambiente: ambId, faltaMm: mmE, noRamal: noRamal, falta0Mm: Math.round(num(m.falta0, 0) * 1000), yTomada: m.c && m.c.P ? m.c.P.y : null, dnEs: m.c ? m.c.dnEs : null, piso: piso, cobrimento: geo(par, "cobrimento"), reserva: num(parR.reservaVentilacao, 0) });
      }
      /* o DESVIO na parede (a subida anda um passo ao lado para passar fora do tubo que cruza o eixo) vai à decisão do memorial */
      function desvioDec(m) { if (m && m.desvio > EPS) decide("amb.ventilacao.desvio", "A subida da ventilação de " + desc[0].ref + " anda " + fcmAmb(m.desvio) + " cm ao lado na parede para passar fora do tubo que cruza o eixo dela (sem atravessá-lo)."); }
      if (CV) {
        /* PRÉDIO: o ventilador do ambiente sobe embutido e corre sob o teto até a COLUNA DE VENTILAÇÃO (junção = tê), acima do
           nível de transbordamento do aparelho mais alto + o mínimo da tabela (fonte secundária) */
        coluna = { id: CV.id, p1: { x: CV.x, y: CV.yBase, z: CV.z }, p2: { x: CV.x, y: CV.yTopo, z: CV.z } };
        var yTopoV = r4(tetoA.y - geo(par, "margemNo") * 2 - raio(dnV));
        cands.forEach(function (c) { var b = subida(c, raio(dnV), function (qq) { return chao4(yTopoV - (Math.abs(qq.x - CV.x) + Math.abs(qq.z - CV.z)) * ac); }, ateColuna(coluna)); if (b && (!melhor || b.nota < melhor.nota - EPS)) melhor = b; });
        if (!melhor) melhor = ventDescidaReserva(coluna, yTopoV);
        if (!melhor) { pend("amb.ventilacao", "sem caminho livre do ramal de " + desc[0].ref + " até a coluna de ventilação " + CV.id + " — ponha à mão", ids, { tipo: "ajustar", ids: [CV.id] }); return; }
        yJunta = melhor.extra.fim.y;
        encaixePend(melhor); desvioDec(melhor);
      } else {
        /* PIA → CAIXA SIFONADA (pendência 1 da 1.2.283, decisão 13/11/2026): a pia sai em DN 40 até a caixa, a saída da caixa é DN 50 e a ventilação que
           sobe até o terminal próprio é DN 50 do começo ao fim — o terminal do catálogo começa no DN 50 e o dimensionamento (js/hides.js, Tabela 8 pelo grupo
           que chega à junção) também pede DN 50. Antes subia em DN 40 com a redução 50 × 40 acima do teto, sem motivo. A redução só fica onde há motivo: o
           DN 50 não cabe inteiro na parede (a busca abaixo não acha subida com o raio dele) e o DN do ramal volta, com a redução no teto (M2 da revisão 09/11). */
        var dnsT0 = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }), dnT0 = dnsT0.filter(function (d) { return d >= dnV - EPS; })[0], dnV0r = dnV;
        cands.forEach(function (c) { var b = subida(c, raio(dnV), function () { return ySaida; }); if (b && (!melhor || b.nota < melhor.nota - EPS)) melhor = b; });
        /* o MESMO caminho (escolhido com o DN da Tabela 8, que já desvia da água) vai inteiro no DN do terminal se o tubo maior não chega mais perto da água
           do que o afastamento da casa (10 cm livres) — ou, se o caminho já estava abaixo disso, não piora além da diferença de raio */
        /* serve50(b): o caminho b comporta o DN do terminal inteiro? */
        var serve50 = function (b) {
          if (!b || !b.segs || !b.segs.length) return false;
          var aguaV = outros.filter(function (t) { return /^agua/.test(String(t.sistema)) && t.p1 && t.p2; });
          var folgaAgua = function (r) { var m = Infinity; b.segs.forEach(function (sg) { aguaV.forEach(function (t) { m = Math.min(m, H._int.segSeg3(sg.a, sg.b, t.p1, t.p2) - r - raio(num(t.dn, 0))); }); }); return m; };
          var AFAST = 0.10, MONT_V = 0.03, f40 = folgaAgua(raio(dnV)), f50 = folgaAgua(raio(dnT0));   // hid:ok afastamento água × esgoto/ventilação (10 cm) e 3 cm livres de montagem (os do auditor)
          /* as peças do DN maior cabem (perna ≥ 20 cm entre duas conexões: as faces DN 50 medidas, 16,4 cm, + a ponta na bolsa) e não cola em outro esgoto */
          var pernasOk = b.segs.every(function (sg, k) { return k === b.segs.length - 1 || d3(sg.a, sg.b) >= 0.20 - EPS; });   // hid:ok 20 cm (catálogo DN 50; PERNA_DESVIO_VENT é do DN 40)
          var esgV = novas.filter(function (o) { return o.op === "trecho" && o.sistema === "esgoto" && String(o.id) !== String(b.c && b.c.trecho); }).concat(esExist);
          var folgaEs = Infinity; b.segs.forEach(function (sg, k) { esgV.forEach(function (t) { if (!t.p1 || !t.p2) return; if (k === 0 && (d3(sg.a, t.p1) < 0.01 || d3(sg.a, t.p2) < 0.01)) return; folgaEs = Math.min(folgaEs, H._int.segSeg3(sg.a, sg.b, t.p1, t.p2) - raio(dnT0) - raio(num(t.dn, 0))); }); });   // hid:ok 1 cm: o tubo onde a tomada encosta
          return pernasOk && folgaEs >= MONT_V - EPS && !b.bate && (f50 >= AFAST - EPS || (f40 < AFAST - EPS && f50 >= f40 - (raio(dnT0) - raio(dnV)) - EPS && f50 > 2 * EPS));
        };
        if (melhor && dnT0 != null && dnT0 > dnV + EPS) {
          var m50 = serve50(melhor) ? melhor : null;
          /* o caminho do DN da tabela não comporta o DN 50: procura um caminho próprio com o raio dele, que passe nas mesmas réguas */
          if (!m50) cands.forEach(function (c) { var b = subida(c, raio(dnT0), function () { return ySaida; }); if (b && serve50(b) && (!m50 || b.nota < m50.nota - EPS)) m50 = b; });
          if (!m50) aviso("a ventilação de " + desc[0].ref + " ficou em DN " + dnV0r + " na parede, com a redução " + dnT0 + " × " + dnV0r + " acima do teto: o DN " + dnT0 + " (o do terminal e o que o dimensionamento pede) não cabe nessa parede com 10 cm livres da água, 3 cm de outro esgoto e as pernas das conexões. Para DN " + dnT0 + " inteiro, afaste a descida da água/esgoto ou engrosse a parede", ids, { tipo: "ajustar", ids: ids });
          if (m50) { melhor = m50; dnV = dnT0; decide("amb.ventilacao.dn_terminal", "Ventilação de " + desc[0].ref + " em DN " + dnT0 + " da tomada ao terminal (o terminal começa no DN " + dnT0 + "; a Tabela 8 dava DN " + dnV0r + "): sem a redução " + dnT0 + " × " + dnV0r + " no teto."); }
        }
        if (!melhor) melhor = ventDescidaReserva(null);
        if (!melhor) { pend("amb.ventilacao", "a ventilação de " + desc[0].ref + " não achou subida: nenhuma parede comporta o tubo inteiro na espessura (a parede fina ou a água correndo nela) nem pelo ramal nem pela descida do aparelho — suba à mão, num shaft ou numa parede mais grossa", ids); return; }
        /* sem coluna de ventilação (o térreo com terminal próprio): o ponto em que este ramal deixa de ser ramal é o topo dele */
        yJunta = melhor.top.y;
        encaixePend(melhor); desvioDec(melhor);
      }
      /* a água quente tomou a camada funda: a subida ficou fora da espessura da parede. Fica à vista: é decisão do projeto (parede mais grossa ou shaft) */
      if (arr(reservaAQ).length && melhor && melhor.w && melhor.q && distSeg(melhor.q, melhor.w.p1, melhor.w.p2) + raio(dnV) > num(melhor.w.espessura, 0) / 2 + 0.005) aviso("a subida da ventilação fica na face da parede " + melhor.w.id + ", com parte do tubo para fora: com aquecedor no modelo a camada funda da parede é da água quente. Engrosse a parede ou leve a ventilação para um shaft", ids, { tipo: "ajustar", ids: [melhor.w.id] });
      /* ⚠ TRANS (NBR 8160 4.3.14 c e 4.3.16 b; R-B6 do PADROES-PROJETO-RA — frente A, 19/10/2026, D-07): antes de se ligar a
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
          /* CINTA não é bloqueio (decisão do Rogério, 06/11/2026): a ventilação até o DN-limite sobe EMBUTIDA na cinta, sem rasgo nem aviso */
          if (v.cinta && HR() && HR().cintaPassa && HR().cintaPassa(dn, par)) return;
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
        var achaTab2 = function (dnE) {
          var linV = arr(tbCv).filter(function (l) { return num(l.dn_tubo_queda_ou_ramal_esgoto_mm, 0) === dnE && num(l.uhc, -1) >= uT; }).sort(function (a, b) { return a.uhc - b.uhc; })[0];
          if (linV) [40, 50, 75, 100, 150, 200, 250, 300].some(function (d) { var v = linV["ventilador_dn" + d + "_m"]; if (v != null && num(v, -1) >= Ltot) { tab2 = { dn: d, Lmax: num(v, 0), uhc: num(linV.uhc, 0) }; return true; } return false; });   // hid:ok colunas da Tabela 2 (DN do ventilador)
        };
        achaTab2(dnEsgG);
        /* a tomada no braço de um aparelho (DN 40) com a UHC do grupo inteiro não tem linha: quem leva essa UHC é o ramal do grupo (M3 da revisão 09/11/2026, 2 tanques: 12 UHC) */
        if (!tab2) { var dnGrupo = 0; desc.forEach(function (qG) { arr(qG.cam).forEach(function (cG) { dnGrupo = Math.max(dnGrupo, num(cG.e.t.dn, 0)); }); }); if (dnGrupo > dnEsgG) { dnEsgG = dnGrupo; achaTab2(dnEsgG); } }
        if (!tab2) pend("es.coluna_ventilacao", "DN da coluna de ventilação sem linha na Tabela 2 (ramal de esgoto DN " + dnEsgG + ", " + uT + " UHC, " + f2(Ltot) + " m): ficou o DN do ramal de ventilação", ids);
        else dnCol = HRcomercial("ventilacao", Math.max(dnV, tab2.dn));
        /* o TERMINAL do catálogo começa no DN 50 (ficha de esgoto série normal): a coluna DN 40 sobe no menor DN que tem
           terminal (lado seguro, com a redução no pé) — nunca um terminal inventado */
        var dnsT = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }), dnTerm = dnsT.filter(function (d) { return d >= dnCol - EPS; })[0];
        if (dnTerm != null && dnTerm > dnCol + EPS) { dnCol = dnTerm; subiuTerm = true; }
        /* a coluna só sobe no DN do terminal porque o catálogo não tem terminal menor: dentro da parede ela segue no DN do ramal e a redução fica acima do teto. No DN 50 ela ficava rente à face, a 9,8 cm da água, e o dimensionamento já pedia DN 40 (revisão 09/11/2026) */
        var cortaCol = subiuTerm && cortarNoTeto(melhor);
        var colT = emitir(melhor, dnV, "ventilacao", dnCol), colB = null;
        if (cortaCol) novas.forEach(function (o) { if (o.op === "trecho" && o.sistema === "ventilacao" && o.ambParte === "ventilacao" && d3(o.p2, colT.p1) <= B.TOL) colB = o; });
        coluna = cortaCol && colB ? { id: colB.id, dn: colB.dn, op: "trecho", p1: colB.p1, p2: colT.p2 } : colT;
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
      /* O LAVATÓRIO DIRETO AO RAMAL (08/11/2026): o sifão fica a meio metro do piso e o ponto ventilado do ramal, longe (DN 40: 1,00 m pela descida inteira). A ventilação liga NA DESCIDA
         por junção de 45° (NBR 8160 4.3.16 a: em tubo vertical, junção a 45°), subindo inclinada e depois reta, embutida na mesma parede, até a coluna. A mais a jusante que atende vence:
         serve também à outra cuba do par (a união fica acima dela) */
      function hVert(dnEs, dnVt, u) {
        var s2 = Math.SQRT1_2, a = HGv && HGv.facesNo ? HGv.facesNo({ tipo: "juncao", material: "pvc_esgoto", dn: dnEs }, [{ d: [0, 1, 0], passante: true, dn: dnEs }, { d: [u.x * s2, s2, u.z * s2], chega: false, dn: dnVt }])[1] : null, b = HGv && HGv.facesNo ? HGv.facesNo({ tipo: "joelho45", material: "pvc_esgoto", dn: dnVt }, [{ d: [-u.x * s2, -s2, -u.z * s2], chega: true, dn: dnVt }, { d: [0, 1, 0], chega: false, dn: dnVt }])[0] : null;
        return a != null && b != null ? teto4((a + b + MARGEM_ENCAIXE) * s2) : null;
      }
      /* col = a coluna (o ramal entra nela); sem col, a ventilação individual: sobe até a altura de saída, com o terminal próprio */
      function ventNaDescida(q, dnR, yTopo, col, dnFimV) {
        var melhorV = null;
        q.cam.forEach(function (c) {
          var t = c.e.t, dh = d2(t.p1, t.p2); if (dh > RAIO_VERT || !(t.p1.y > t.p2.y)) return;
          var w = paredes.filter(function (pw) { return distSeg(t.p1, pw.p1, pw.p2) + raio(dnR) <= num(pw.espessura, 0) / 2 + EPS && num(pw.espessura, 0) >= 2 * raio(dnR); })[0]; if (!w) return;
          var Lw = d2(w.p1, w.p2), u0 = { x: (w.p2.x - w.p1.x) / Lw, z: (w.p2.z - w.p1.z) / Lw }, fundo = t.p2.y + geo(par, "chanfro");
          /* a subida pode correr no eixo da parede ou numa das camadas ao lado dele (passa atrás do tubo de água da parede): a derivação da junção gira em volta do tubo vertical */
          /* a descida do aparelho pode ter dois trechos no mesmo prumo (a união do par de cubas): a junção da ventilação sai dela, não bate nela */
          var mesmaDescida = {}; trs.forEach(function (u) { if (d2(u.p1, u.p2) <= RAIO_VERT && d2(u.p1, t.p1) <= RAIO_VERT) mesmaDescida[u.id] = 1; });
          var nW = { x: -u0.z, z: u0.x }, s0n = (t.p1.x - w.p1.x) * nW.x + (t.p1.z - w.p1.z) * nW.z, cam0 = num(w.espessura, 0) / 2 - raio(dnR) - COBRE_CAMADA, cams = [0];
          [CAMADA_VENT, -CAMADA_VENT, CAMADA_FUNDA, -CAMADA_FUNDA].forEach(function (cv) { if (Math.abs(cv) <= cam0 + EPS) cams.push(cv); });
          for (var ys = chao4(t.p1.y - passo); ys >= fundo - EPS; ys = chao4(ys - passo)) [1, -1].forEach(function (sd) { cams.forEach(function (cam) { [0, 0.03, 0.06, 0.09].forEach(function (aH) {   // hid:ok a derivação mais longa, até afastar a subida do toco do ponto (cm)
            var sq = c.s0 + (t.p1.y - ys), lim = q.limite == null ? null : q.limite - w0, sMin = fatorDn != null && q.dn ? fatorDn * q.dn / 1000 : 0;
            if (lim != null && sq > lim + EPS) return;
            if (sq < sMin - EPS) return;
            var h = hVert(num(t.dn, 0), Math.round(dnR), { x: u0.x * sd, z: u0.z * sd }); if (h == null || ys + h >= ySaida) return;
            h = r4(h + aH);
            var dN = cam - s0n; if (Math.abs(dN) >= h) return;
            var dT = sd * Math.sqrt(h * h - dN * dN), u = { x: (u0.x * dT + nW.x * dN) / h, z: (u0.z * dT + nW.z * dN) / h };
            var T = { x: t.p1.x, y: ys, z: t.p1.z }, Eb = { x: r4(T.x + u.x * h), y: teto4(ys + h), z: r4(T.z + u.z * h) }, tE = (Eb.x - w.p1.x) * u0.x + (Eb.z - w.p1.z) * u0.z;
            if (tE < geo(par, "afastParede") || tE > Lw - geo(par, "afastParede")) return;
            /* o deitado corre sob o tubo de água da parede, se couber: acima do transbordamento (4.3.14 c) e, na falta, até o teto */
            var alturas = [], yMinT = minTransb != null ? minTransb : yTopo;
            if (col) for (var yA = yMinT; yA < yTopo - EPS; yA = r4(yA + geo(par, "chanfro"))) alturas.push(yA);
            alturas.push(yTopo);
            /* e, para não passar atrás do tubo de água (a 3 cm, abaixo do afastamento de projeto), a subida pode andar dentro da parede, baixa, até onde a água não corre */
            alturas.forEach(function (yAlvo) { DESLIZES_VENT.forEach(function (off) {
              if (off && pernaMinima(raio(dnR)) != null && Math.abs(off) < pernaMinima(raio(dnR)) - EPS) return;   /* o desvio deitado comporta os dois joelhos e as bolsas */
              var Q = { x: r4(Eb.x + u0.x * off), z: r4(Eb.z + u0.z * off) };
              if (off) { var tQ = (Q.x - w.p1.x) * u0.x + (Q.z - w.p1.z) * u0.z; if (tQ < geo(par, "afastParede") || tQ > Lw - geo(par, "afastParede")) return; }
              var yD = off ? teto4(Eb.y + PERNA_DESVIO_VENT) : Eb.y, yD2 = off ? teto4(yD + Math.abs(off) * ac) : Eb.y;
              var top = { x: Q.x, y: teto4(yAlvo), z: Q.z }; if (top.y <= yD2 + geo(par, "margemNo")) return;
              var extra = col ? ateColuna(col)(top) : { segs: [], L: 0, exceto: [] }; if (!extra) return;
              /* a perna deitada até a coluna, entre o joelho e o tê: na camada ao lado da coluna (7,5 cm) as peças se sobrepunham (lavatório do lavabo a 30 cm) */
              var pMinV = col ? pernaMinima(raio(dnR), raio(num(col.dn, dnR))) : null;
              if (pMinV != null && extra.segs.some(function (sg) { return d2(sg.a, sg.b) < pMinV - EPS; })) return;
              var segs = off ? [{ a: T, b: Eb }, { a: Eb, b: { x: Eb.x, y: yD, z: Eb.z } }, { a: { x: Eb.x, y: yD, z: Eb.z }, b: { x: Q.x, y: yD2, z: Q.z } }, { a: { x: Q.x, y: yD2, z: Q.z }, b: top }] : [{ a: T, b: Eb }, { a: Eb, b: top }];
              /* individual: dentro da parede o tubo segue no DN do ramal; a redução para o DN do terminal fica acima do teto, fora da parede (rente à face ela não cabe: M2 da revisão 09/11/2026) */
              if (!col && dnFimV > dnR + EPS && tetoA.y > segs[segs.length - 1].a.y + geo(par, "margemNo") && tetoA.y < top.y - geo(par, "margemNo")) { var ult = segs.pop(), yCorte = r4(tetoA.y); segs.push({ a: ult.a, b: { x: ult.a.x, y: yCorte, z: ult.a.z } }); segs.push({ a: { x: ult.a.x, y: yCorte, z: ult.a.z }, b: ult.b }); }
              var todas = segs.concat(extra.segs), tom = { trecho: t.id, col: mesmaDescida, P: T, zona: raio(num(t.dn, 0)) + 2 * raio(dnR) + geo(par, "folga") };
              if (bateProprio(todas, raio(dnR)) || bateDuro(todas, raio(dnR), extra.exceto, tom)) return;
              var perto = bateEm(todas, raio(dnR), extra.exceto, tom) || (!col && dnFimV > 0 && bateEm(segs.slice(-1), raio(dnFimV), null, tom));
              /* quem mais esta tomada atende (a outra cuba do par): o limite da norma, sem a margem de projeto de quem escolhe a tomada; uma ventilação só vale mais que os centímetros da margem */
              var dists = [], atende = 0;
              desc.forEach(function (q2) { var cq = q2.cam.filter(function (x) { return x.e === c.e; })[0]; if (!cq) return; var L2 = cq.s0 + (t.p1.y - ys), ok2 = q2.limite == null || L2 <= q2.limite + EPS; if (ok2) atende++; dists.push({ ref: q2.ref, el: q2.el || q2.ref, L: r4(L2), limite: q2.limite, dn: q2.dn, ok: ok2 }); });
              /* sem saída (a parede de 15 cm com a água correndo nela), o mais longe da água que der */
              var fAgua = !perto ? 0 : outros.reduce(function (mn, t2) { if (t2.sistema !== "agua_fria") return mn; return todas.reduce(function (m2, sg) { return Math.min(m2, H._int.segSeg3(sg.a, sg.b, t2.p1, t2.p2) - raio(dnR) - raio(num(t2.dn, 0))); }, mn); }, geo(par, "afastamento"));
              var nota = -atende * 100 + (perto ? PESO_BATE_AFAST + (geo(par, "afastamento") - fAgua) * 100 : 0) + extra.L + Math.abs(off) + (off ? geo(par, "pesoCurva") * 2 : 0) + (top.y - Eb.y) * 0.01 + sq * 0.01;   // hid:ok pesos da escolha: atender os dois sifões, sem encostar na água, depois o comprimento
              if (!melhorV || nota < melhorV.nota - EPS) melhorV = { c: { P: T, trecho: t.id, dnEs: num(t.dn, 0), ref: q.ref, dists: dists, s: sq }, q: { x: Q.x, z: Q.z }, canto: null, yC: Eb.y, yW: Eb.y, Lh: 0, top: top, bate: perto, nota: nota, extra: extra, segs: segs, w: w, hTe: r4(Eb.y - ys), desvio: Math.abs(off), angMenor: true, faltaEncaixe: 0, faltaOnde: 0, falta0: 0, aclive: ac };
            }); });
          }); }); });
        });
        return melhorV;
      }
      melhor.c.dists.filter(function (d) { return !d.ok; }).forEach(function (d) {
        if (cobertos[d.ref]) { d.ramal = cobertos[d.ref]; return; }
        var q = desc.filter(function (x) { return x.ref === d.ref; })[0], cs = q ? candidatos(q, true) : [];
        if (q && q.direto) {
          var dnRv = NR.dnVentRamal(0, 0, "ventilação: ramal de " + d.ref); dnRv = dnRv == null ? null : HRcomercial("ventilacao", dnRv);
          var bV = dnRv != null && coluna ? ventNaDescida(q, dnRv, r4(Math.min(tetoA.y, coluna.p2.y) - geo(par, "margemNo") * 2 - raio(dnCol)), coluna) : null;
          /* o ramal até a coluna não passa dentro da parede (o tubo da válvula da bacia): ventilação individual, subindo reta (NBR 8160: todo desconector ventilado) */
          var dnsTv = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }), dnTv = dnRv == null ? null : dnsTv.filter(function (x) { return x >= dnRv - EPS; })[0];
          if ((!bV || bV.bate) && dnRv != null && dnTv != null && !CV) {
            var bVi = ventNaDescida(q, dnRv, ySaida, null, dnTv);
            /* com ramal possível só encostando na água, a individual vale se passa limpa */
            if (bVi && (!bV || !bVi.bate)) {
              var colVi = emitir(bVi, dnRv, "ventilacao_ramal", dnTv), idTv = pr + "terminal" + (out.ventilacao.ramais.length + 2);
              novas.push({ op: "peca", id: idTv, peca: "terminal_ventilacao", sistema: "ventilacao", dn: String(dnTv), x: r4(colVi.p2.x), y: r4(colVi.p2.y), z: r4(colVi.p2.z), amb: ambId, ambParte: "ventilacao_ramal" });
              var dVi = bVi.c.dists.filter(function (x) { return x.ref === d.ref; })[0];
              out.ventilacao.ramais.push({ desconector: d.ref, dn: dnRv, dnTerminal: dnTv, L: dVi.L, limite: dVi.limite, terminal: idTv, individual: true, naDescida: true });
              d.ramal = { dn: dnRv, L: dVi.L, individual: true };
              bVi.c.dists.forEach(function (x) { if (x.ok && x.ref !== d.ref) cobertos[x.ref] = { dn: dnRv, L: x.L, individual: true }; });
              if (bVi.bate) aviso("a ventilação individual de " + d.ref + " passa perto de outro tubo: confira", [d.el || d.ref], { tipo: "ajustar", ids: [d.el || d.ref] });
              decide("amb.ventilacao.individual", "Ventilação individual de " + bVi.c.dists.filter(function (x) { return x.ok; }).map(function (x) { return x.ref; }).join(", ") + " na descida do aparelho, por junção de 45° (NBR 8160 4.3.16 a), a " + f2(dVi.L) + " m do sifão (máximo " + f2(dVi.limite) + " m, DN " + dVi.dn + "): o ramal até a coluna não cabe na parede; sobe embutido até " + f2(hSaida) + " m do piso, com o terminal próprio.");
              return;
            }
          }
          if (bV) {
            var subV2 = emitir(bV, dnRv, "ventilacao_ramal"), ultV2 = subV2.p2; bV.extra.segs.forEach(function (sg) { novas.push({ op: "trecho", id: pr + (++nV), sistema: "ventilacao", material: mat, dn: dnRv, p1: { x: r4(sg.a.x), y: r4(sg.a.y), z: r4(sg.a.z) }, p2: { x: r4(sg.b.x), y: r4(sg.b.y), z: r4(sg.b.z) }, amb: ambId, ambParte: "ventilacao_ramal" }); ultV2 = sg.b; });
            var dV = bV.c.dists.filter(function (x) { return x.ref === d.ref; })[0];
            out.ventilacao.ramais.push({ desconector: d.ref, dn: dnRv, L: dV.L, limite: dV.limite, naDescida: true, juncao: { x: r4(ultV2.x), y: r4(ultV2.y), z: r4(ultV2.z) } });
            d.ramal = { dn: dnRv, L: dV.L };
            bV.c.dists.forEach(function (x) { if (x.ok && x.ref !== d.ref) cobertos[x.ref] = { dn: dnRv, L: x.L }; });
            if (bV.bate) aviso("o ramal de ventilação de " + d.ref + " passa perto de outro tubo: confira", [d.el || d.ref], { tipo: "ajustar", ids: [d.el || d.ref] });
            decide("amb.ventilacao.na_descida", "Ventilação de " + bV.c.dists.filter(function (x) { return x.ok; }).map(function (x) { return x.ref; }).join(", ") + " na descida do aparelho, por junção de 45° (NBR 8160 4.3.16 a), a " + f2(dV.L) + " m do sifão (máximo " + f2(dV.limite) + " m, DN " + dV.dn + "), embutida na parede até a coluna.");
            return;
          }
        }
        var uq = out.caixaSifonada && out.caixaSifonada.id === d.ref ? num(out.caixaSifonada.uhc, 0) : 0, dnR = NR.dnVentRamal(0, uq, "ventilação: ramal de " + d.ref);
        if (dnR == null || !cs.length) { pend("amb.ventilacao." + d.ref, d.ref + (d.L == null ? " não passa pelo ponto da ventilação" : " a " + f2(d.L) + " m do ponto ventilado (máximo " + f2(d.limite) + " m, DN " + d.dn + ")") + " e não coube um ramal de ventilação próprio: ponha à mão", [d.el || d.ref], { tipo: "ajustar", ids: [d.el || d.ref] }); return; }
        dnR = HRcomercial("ventilacao", dnR);
        /* o ramal corre sob o teto e entra na coluna ABAIXO do topo dela (a junção precisa de coluna dos dois lados) */
        var yTopoR = r4(Math.min(tetoA.y, coluna.p2.y) - geo(par, "margemNo") * 2 - raio(dnCol)), bR = null;
        cs.forEach(function (c) {
          var b = subida(c, raio(dnR), function (qq) { return chao4(yTopoR - (Math.abs(qq.x - coluna.p1.x) + Math.abs(qq.z - coluna.p1.z)) * ac); }, ateColuna(coluna));
          if (b && (!bR || b.nota < bR.nota - EPS)) bR = b;
        });
        /* ⚠ FRENTE H4 (21/10/2026): 2 pias/cubas na mesma parede — o ramal de água fria corre a parede inteira na altura do ramal e
           a descida da alimentação fica entre as pias e a coluna: o ramal de ventilação da pia de longe só chegava à coluna
           ATRAVESSANDO a água (a subida passava por dentro do ramal de água fria, "0 cm"; o deitado sob o teto cruzava a descida
           da alimentação). Sem coluna de ventilação do prédio (o térreo, com terminal próprio), o desconector que não chega na
           coluna sem bater ganha VENTILAÇÃO INDIVIDUAL: sobe (com o desvio dentro da parede, se preciso) até a altura de saída e
           termina no terminal de ventilação do catálogo (NBR 8160: todo desconector ventilado; o terminal fica acima da
           cobertura, conferido pelo RT como o da coluna). A ligação na coluna segue a preferida quando não bate. */
        /* … e o ramal que só chega correndo solto no ar (fora de parede, acima do piso) também não é o preferido: a individual sobe reta na parede */
        if ((!bR || bR.bate || soltoNoAr(bR.segs.concat(bR.extra ? bR.extra.segs : [])) > geo(par, "margemNo")) && !CV) {
          var bT = null;
          var dnsTr = arr(B.PECAS.terminal_ventilacao && B.PECAS.terminal_ventilacao.dns).map(Number).sort(function (a, b) { return a - b; }), dnTr = dnsTr.filter(function (x) { return x >= dnR - EPS; })[0];
          /* a coluna sobe no DN do terminal: a folga da água conta com o DN dela */
          cs.forEach(function (c) { var b = subida(c, raio(dnR), function () { return ySaida; }, null, dnTr != null ? raio(dnTr) : null); if (b && !b.bate && (!bT || b.nota < bT.nota - EPS)) bT = b; });
          if (bT && dnTr != null) {
            if (dnTr > dnR + EPS) cortarNoTeto(bT);
            var colR = emitir(bT, dnR, "ventilacao_ramal", dnTr), idTr = pr + "terminal" + (out.ventilacao.ramais.length + 2); encaixePend(bT);
            novas.push({ op: "peca", id: idTr, peca: "terminal_ventilacao", sistema: "ventilacao", dn: String(dnTr), x: r4(colR.p2.x), y: r4(colR.p2.y), z: r4(colR.p2.z), amb: ambId, ambParte: "ventilacao_ramal" });
            var dT = bT.c.dists.filter(function (x) { return x.ref === d.ref; })[0];
            out.ventilacao.ramais.push({ desconector: d.ref, dn: dnR, dnTerminal: dnTr, L: dT.L, limite: dT.limite, terminal: idTr, individual: true });
            d.ramal = { dn: dnR, L: dT.L, individual: true };
            decide("amb.ventilacao.individual", "Ventilação individual de " + d.ref + " (DN " + dnR + ", terminal DN " + dnTr + "): o ramal até a coluna atravessaria a água fria da parede; sobe embutido até " + f2(hSaida) + " m do piso com o terminal de ventilação próprio (NBR 8160, desconector ventilado a " + f2(dT.L) + " m).");
            return;
          }
        }
        /* N2 da revisão 09/11/2026 (volta 2): o "perto" que é colisão física com a água (o tubo da válvula da bacia, o ramal DN 20) não vale: sem caminho limpo, fica a pendência (e o lavatório direto volta para a caixa) */
        if (bR && bR.bate && atravessaOutro(bR.segs.concat(bR.extra ? bR.extra.segs : []), raio(dnR))) bR = null;
        if (!bR) { pend("amb.ventilacao." + d.ref, "ramal de ventilação de " + d.ref + ": sem caminho livre até a coluna — ponha à mão", [d.el || d.ref], { tipo: "ajustar", ids: [d.el || d.ref] }); return; }
        var sub = emitir(bR, dnR, "ventilacao_ramal"), ult = sub.p2; encaixePend(bR);
        bR.extra.segs.forEach(function (sg) { novas.push({ op: "trecho", id: pr + (++nV), sistema: "ventilacao", material: mat, dn: dnR, p1: { x: r4(sg.a.x), y: r4(sg.a.y), z: r4(sg.a.z) }, p2: { x: r4(sg.b.x), y: r4(sg.b.y), z: r4(sg.b.z) }, amb: ambId, ambParte: "ventilacao_ramal" }); ult = sg.b; });
        var dR = bR.c.dists.filter(function (x) { return x.ref === d.ref; })[0];
        out.ventilacao.ramais.push({ desconector: d.ref, dn: dnR, L: dR.L, limite: dR.limite, juncao: { x: r4(ult.x), y: r4(ult.y), z: r4(ult.z) } });
        d.ramal = { dn: dnR, L: dR.L };
        if (bR.bate) aviso("o ramal de ventilação de " + d.ref + " passa perto de outro tubo: confira", [d.el || d.ref], { tipo: "ajustar", ids: [d.el || d.ref] });
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

  var HidAmbiente = { VERSAO: 1, GEO_AMB: GEO_AMB, ligar: ligar, membros: membros, duplicados: duplicados, tipoDisp: tipoDisp, dispositivosFamilia: dispositivosFamilia, _int: { pendenciaBarraDireto: pendenciaBarraDireto, vivas: vivas, localCaixa: localCaixa, pecaCaixa: pecaCaixa, esperaFora: esperaFora, esperaDepoisDosAparelhos: esperaDepoisDosAparelhos, grafoEs: grafoEs, projParede: projParede, limpeza: limpeza, noPavimento: noPavimento, topoVentilacao: topoVentilacao, verticais: verticais } };
  global.HidAmbiente = HidAmbiente;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAmbiente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
