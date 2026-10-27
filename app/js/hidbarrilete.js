/* =====================================================================
 * hidbarrilete.js — BARRILETE E COLUNAS A PARTIR DA CAIXA D'ÁGUA (FRENTE H8, 21/10/2026) — motor PURO (ES5,
 * Node-testável): devolve as ops do lote; não grava nada.
 *
 * PEDIDO DO ROGÉRIO (21/10/2026, com print: a caixa d'água azul acima da casa e a água fria do banheiro parando numa
 * espera no forro, sem ligação à caixa): "colocar uma caixa d'água próximo de algum ambiente, ele monta o barrilete e
 * desce as tubulações para cada ambiente que precisa, alimentando a água fria e, se for boiler, a água quente."
 *
 * ANTES: o "Ligar ambiente" (js/hidambiente.js), o aquecedor (js/hidaqtraco.js) e o prédio (js/hidpredio.js) deixavam a
 * água fria numa ESPERA que desce do forro/laje ("ponto do barrilete"), e o barrilete ficava pendente (predio.barrilete).
 *
 * O QUE ESTE MOTOR FAZ (critério de projeto da RA — docs/hidro/PADROES-PROJETO-RA.md, seção C3; fontes em cada item):
 *  0. N23 (26/10/2026, docs/hidro/PADROES-PROJETO-RA.md R-B4a): registros de ESFERA de PVC (aparente); a VÁLVULA DE DESCARGA numa 2ª
 *     saída com coluna exclusiva; o extravasor entra na linha da limpeza depois do registro; os adaptadores no DN real (instância).
 *  1. SAÍDA DA CAIXA: do conector "saida" um toco na direção radial com o REGISTRO (NBR 5626:2020 6.5.12.4 a:
 *     no abastecimento indireto, em cada trecho que liga o barrilete ao reservatório) e, depois do registro, a
 *     VENTILAÇÃO DO BARRILETE subindo acima do topo da caixa (Tigre, Manual Técnico 2025 p.72-73: "ligado à coluna,
 *     após o registro de passagem; extremidade aberta; acima do nível máximo d'água; diâmetro ≥ ao da coluna" — fonte
 *     secundária; a Tigre a indica sempre, a NBR 5626 citada por ela, quando há válvula de descarga).
 *  2. BARRILETE: árvore ortogonal no ático/sobre a laje (cada espera liga no tubo mais perto já traçado, sem cruzeta —
 *     tê no máximo), saindo à altura da saída e DESCENDO a partir da caixa (R-C10: "não haverá inflexões"; a declividade
 *     de 0,5 % é PRÁTICA de memorial, P-C5/P-C9 — a NBR 5626:2020 só pede evitar bolsa de ar, 6.6.2). Sem altura para os
 *     0,5 %: a declividade possível (aviso). Sem altura nenhuma (a caixa abaixo do forro/das esperas): nada é traçado e o
 *     achado diz quanto subir a caixa (Corrigir).
 *  3. COLUNAS: do nó do barrilete sobre cada espera, a coluna desce na vertical até a ponta da espera (a espera deixa de
 *     ser pendente: fica ligada) com o REGISTRO no início da coluna, acima do forro (6.5.12.4 b; Tigre p.71: "na parte
 *     superior da coluna, ou no ramal do barrilete próximo à descida da coluna, recomenda-se um registro"). A espera do
 *     PRÉDIO (js/hidpredio.js, af_barrilete) já tem o registro dela: só a coluna.
 *  4. EXTRAVASOR e LIMPEZA: DN ≥ o da entrada (Tigre p.74, Figura 63 e tabela); a limpeza no ponto mais baixo, com
 *     registro de fácil acesso perto da saída (NBR 5626:2020 6.5.9.1); o extravasor ABAIXO da entrada com a separação
 *     atmosférica da Tabela 1 (6.15, af2020.separacao_atmosferica) e saída LIVRE e VISÍVEL fora da edificação — "nunca em
 *     caixas de areia, ralos, calhas ou condutores pluviais" nem na rede de esgoto (Tigre p.74 e p.79). O destino não é
 *     modelado: pendência com o ponto.
 *  5. ALIMENTAÇÃO (boia): da entrada, o toco com o registro (6.5.8.2: a montante e próximo do reservatório) e a espera do
 *     alimentador predial (o hidrômetro/cavalete não é ligado sozinho nesta versão: pendência com o ponto).
 *  6. ÁGUA QUENTE: a espera de água fria do aquecedor (js/hidaqtraco.js) é uma espera como as outras — o barrilete a
 *     alimenta; o traçado da água quente continua o da H5/H6 (não é refeito aqui). No BOILER (acumulação) alimentado pela
 *     caixa, o RESPIRO sai do ponto mais alto da água quente e sobe acima do nível máximo da caixa a altura do manual do
 *     fabricante (Cumulus: 0,80 m — catálogo H6); sem o texto do modelo, o da Cumulus com pendência "conferir".
 *  7. PRESSÃO: o mesmo cálculo da NBR 5626 do dimensionamento (js/hidaf.js) sobre a prévia: ponto sem a pressão mínima →
 *     achado com o Corrigir "subir a caixa X m" (ou pressurizador); estática acima do limite → baixar a caixa (se ainda
 *     atende a mínima) ou VRP.
 *  8. ORÇAMENTO: tubos, conexões e registros pelo levantamento das instalações (BimInst.qto, aplicação "reservação" no
 *     barrilete e "prumada" na coluna); a caixa, a torneira de boia, os adaptadores com flange e os furos da caixa pelos
 *     serviços da INSTÂNCIA da caixa (op "orcar", o mesmo de Propriedades › Orçamento) com os códigos da SINAPI
 *     conferidos (tools/test-hid-barrilete.js confere cada código e a descrição na base). Os serviços da pessoa ficam.
 *  9. SEM CAIXA NO MODELO: a OFERTA (o Corrigir põe a caixa): volume pela reservação (HidPrograma: consumo per capita ×
 *     população × 1 dia — NBR 5626:2020 6.5.6.2), o menor tipo comercial do catálogo (Fortlev) que atende, com o preço da
 *     SINAPI; posição sobre o ambiente molhado mais perto do centro das esperas (o barrilete mais curto; ambiente "área
 *     técnica", se houver, vence); altura: a mínima para o barrilete com a declividade e a pressão do ponto mais
 *     desfavorável.
 * O que não fecha vira PENDÊNCIA com o ponto (nunca tubo meio traçado). Idempotente: anteriores() devolve as ops do
 * barrilete anterior para o Traçar de novo apagar no mesmo lote.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HAF() { return dep("HidAF", "./hidaf.js"); }
  function HPG() { return dep("HidPrograma", "./hidprograma.js"); }
  function HPC() { return dep("HidPecas", "./hidpecas.js"); }
  function HHi() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function HFm() { return dep("HidFamilias", "./hidfamilias.js"); }
  function HCt() { return dep("HidCatalogo", "./hidcatalogo.js"); }
  function BIC() { return dep("BimInstColocar", "./biminstcolocar.js"); }
  function BEd() { return dep("BimEdit", "./bimedit.js"); }
  function HBA() { return dep("HidBaseApoio", "./hidbaseapoio.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(num(v, 0) * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  var EPS = 1e-6;   // hid:ok tolerância numérica
  var FOLGA_LIMITE = 0.001;   // hid:ok 1 mm de sobra nas comparações de folga (o arredondamento a 4 casas — o mesmo do HidRota)
  var PASSO_COLUNA = 0.25;   // hid:ok passo da sonda da coluna embutida (m): menor que a espessura de laje e o pé-direito
  var APOIO = 0.001;   // hid:ok o tubo APOIADO na laje: a geratriz de baixo 1 mm acima do topo (nada de tubo dentro da laje)
  function raio(dn) { return num(dn, 0) / 1000 / 2; }   /* DN (DE) em mm → raio em m */
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function P3(x, y, z) { return { x: r4(x), y: r4(y), z: r4(z) }; }
  function segSeg(p1, q1, p2, q2) { var H = HR(); return H && H._int && H._int.segSeg3 ? H._int.segSeg3(p1, q1, p2, q2) : Infinity; }

  /* os reservatórios ELEVADOS que alimentam a rede (a cisterna é inferior: fica fora) — os mesmos do js/hidaf.js */
  var RESERVATORIOS = { "ra-caixa-dagua": 1, "hid-caixa-dagua": 1, "hid-reservatorio-tanque": 1 };
  /* GEOMETRIA (critério de projeto da RA, não é norma — cada número com o porquê) */
  var GEO_BAR = {
    declividade: 0.005,     // hid:ok R-C10: 0,5 % é PRÁTICA de memorial (P-C5/P-C9), não está na NBR 5626:2020 (6.6.2 só pede evitar bolsa de ar)
    tocoSaida: 0.30,        // hid:ok saída da caixa até o tê da ventilação: o registro no meio, à mão, fora do corpo
    ventAcima: 0.15,        // hid:ok a ventilação do barrilete termina acima do TOPO da caixa (acima do nível máximo — Tigre p.72-73)
    saidaLivre: 0.30,       // hid:ok extravasor/limpeza: a ponta livre além da face externa da edificação
    quedaLivre: 0.15,       // hid:ok a curva para baixo na ponta livre (a água cai à vista)
    tocoEntrada: 0.20,      // hid:ok a entrada (boia) sai da caixa até a descida do alimentador; o registro no meio
    descidaEntrada: 0.40,   // hid:ok a espera do alimentador desce isto abaixo da entrada (ou até a laje/forro)
    folgaCorpo: 0.15,       // hid:ok o registro da limpeza fica a isto do corpo da caixa (a mão alcança)
    passoSubir: 0.05,       // hid:ok o "subir a caixa X m" sai em múltiplo de 5 cm
    margemSubir: 0.05,      // hid:ok e com 5 cm de sobra sobre a conta (arredondamento das perdas)
    iteracoesOferta: 3,     // hid:ok tentativas de altura da caixa proposta (barrilete → pressão → barrilete)
    descidaMin: 0.05,       // hid:ok N23: o barrilete só desce pela tomada vertical se ganhar mais que isto (abaixo, já está no apoio)
    zDesvios: [2, 4, 6]     // hid:ok passos da grade dos desvios em "Z" (os do js/hidaqtraco.js)
  };
  /* a 2ª saída (coluna exclusiva da válvula de descarga): a espera com DN a partir deste é a da válvula (a de lavatório, pia, chuveiro e
     caixa acoplada é 20/25); os ângulos tentados a partir da saída principal, na ordem (o lado oposto é o da entrada da boia) */
  var ANG_SAIDA2 = [-Math.PI / 2, Math.PI / 2, -Math.PI / 3, Math.PI / 3, -2 * Math.PI / 3, 2 * Math.PI / 3];   // hid:ok 90°, 60° e 120° para cada lado
  /* a caixa com a saída girada de `ang` em torno do centro (mesma cota e DN do conector): o furo da 2ª saída */
  function saidaGirada(cx, ang) {
    var o = {}; Object.keys(cx).forEach(function (k) { o[k] = cx[k]; });
    var dx = cx.S.x - cx.c.x, dz = cx.S.z - cx.c.z, c = Math.cos(ang), s = Math.sin(ang), S2 = {};
    Object.keys(cx.S).forEach(function (k) { S2[k] = cx.S[k]; });
    S2.x = r4(cx.c.x + dx * c + dz * s); S2.z = r4(cx.c.z - dx * s + dz * c); S2.cid = "saida2";
    o.S = S2;
    return o;
  }
  /* SINAPI (MG 06/2026 — data/sinapi-MG-2026-06.json): os itens da CAIXA que o modelo não desenha. tools/test-hid-barrilete.js
     confere cada código e o começo da descrição na base. Chave = bitola de rosca (BimInst.BITOLA_REF) ou DN (mm) em texto. */
  var SINAPI_CAIXA = {
    boia: { re: "^TORNEIRA DE BOIA PARA CAIXA D'ÁGUA, ROSCÁVEL", cod: { "1/2": "94795", "3/4": "94796", "1": "94797", "1 1/4": "94798", "1 1/2": "94799", "2": "94800" } },
    adaptador: { re: "^ADAPTADOR COM FLANGE", cod: { "20": "94783", "25": "94703", "32": "94704", "40": "94705", "50": "94706", "60": "94707", "75": "94713", "85": "94714", "110": "94715" } },
    /* a espessura da parede da caixa não está na ficha do fabricante: a faixa MAIS CARA (6 a 8 mm) — regra RA, incerto = o mais alto */
    furo: { re: "^FURO EM CAIXA D'ÁGUA COM ESPESSURA DE 6 ATÉ 8 MM", cod: { "15": "102588", "20": "102590", "25": "102592", "32": "102594", "40": "102596", "50": "102598", "60": "102600", "75": "102602", "100": "102604" } }
  };
  var PREFIXO_ORC = "Barrilete · ";
  var PROD_NOME = 3, PROD_SINAPI = 4;   // hid:ok índices da forma curta do produto da ficha: [tipo, fabricante, código, nome, SINAPI]   /* o rótulo dos serviços que este motor põe na caixa (os outros são da pessoa e ficam) */

  function avaliar(avaliarFam, f) { try { return typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { return null; } }
  function achatar(ops) { var out = []; (function rec(L) { arr(L).forEach(function (o) { if (!o) return; if (o.op === "lote") rec(o.ops); else out.push(o); }); })(ops); return out; }
  function unit2(dx, dz) { var L = Math.sqrt(dx * dx + dz * dz); return L > EPS ? { x: dx / L, z: dz / L } : null; }

  /* ================================================ AS CAIXAS DO MODELO */
  function caixas(estado, avaliarFam) {
    var K = HK(), out = [];
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !RESERVATORIOS[f.famId]) return;
      var av = avaliar(avaliarFam, f), v = (av && av.valores) || {};
      var D = num(v.Diametro_corpo, 0) > 0 ? num(v.Diametro_corpo, 0) : num(v.Diametro, 0), H = num(v.Altura, 0);
      var cs = K && K._int ? K._int.conectores(avaliarFam, f) : [];
      var S = cs.filter(function (k) { return k.cid === "saida"; })[0] || null, E = cs.filter(function (k) { return k.cid === "entrada"; })[0] || null;
      var yb = num(f.inst && f.inst.y != null ? f.inst.y : f.y, 0);
      out.push({ f: f, id: String(f.id), famId: f.famId, tipoId: f.tipoId, av: av, R: D / 2, D: D, H: H, yb: yb, yt: r4(yb + H), c: { x: num(f.x, 0), z: num(f.z, 0) }, rot: num(f.rotY, 0),
                 S: S, E: E, volume: num(v.Volume_L, num(v.Capacidade_L, null)) });
    });
    return out;
  }

  /* ================================================ AS ESPERAS DE ÁGUA FRIA QUE O BARRILETE RECEBE
     a ponta "continua" de cima da rede de água fria (o forro/laje dos ambientes, a alimentação do aquecedor) e a espera da
     coluna do prédio (af_barrilete). N23 (26/10/2026): `valvula` = a espera EXCLUSIVA da válvula de descarga (o "-afb" do traçado novo, com o
     "-afc" do consumo do mesmo ambiente); `antiga` = "-afb" de um projeto da 1.2.184, em que ele era a espera do banheiro INTEIRO (sem
     "-afc"): vale como consumo. A espera de alimentação do KIT (a lateral do chuveiro, que o ramal do ambiente recebe),
     a da piscina e as saídas livres da própria caixa não entram. */
  function esperas(estado, avaliarFam, ops) {
    var B = BI(); if (!B || !B.conectividade) return [];
    var porOp = {}; achatar(ops).forEach(function (o) { if (o && o.op === "trecho" && o.id != null) porOp[String(o.id)] = o; });
    var trs = {}; arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) { trs[String(t.id)] = t; });
    var C = B.conectividade(estado, avaliarFam), out = [];
    arr(C.esperas).forEach(function (e) {
      if (e.sistema !== "agua_fria") return;
      var o = porOp[String(e.trecho)] || {}, t = trs[String(e.trecho)];
      if (!t || o.bar != null || o.saidaLivre) return;
      var predio = /prédio/.test(String(e.motivo)) && o.predioParte === "af_barrilete";
      if (!predio && !/^espera de alimentação \(barrilete\/coluna\)/.test(String(e.motivo))) return;
      out.push({ trecho: String(e.trecho), ponta: e.ponta, x: num(e.x, 0), y: num(e.y, 0), z: num(e.z, 0), dn: num(t.dn, 0), material: t.material, predio: predio ? String(o.predio || "") : null,
                 aq: o.aq != null ? String(o.aq) : null, kit: o.kit != null ? String(o.kit) : null, amb: o.amb != null ? String(o.amb) : null,
                 valvula: o.valvula === true || (/-afb$/.test(String(e.trecho)) && trs[String(o.amb) + "-afc"] != null),
                 antiga: /-afb$/.test(String(e.trecho)) && o.valvula !== true && trs[String(o.amb) + "-afc"] == null });
    });
    return out;
  }

  /* as ops de um barrilete ANTERIOR (todas as caixas, ou só a de `caixaId`): o Traçar de novo as apaga no mesmo lote */
  function anteriores(opsAchatadas, caixaId) {
    var vivos = {}, ordem = [];
    arr(opsAchatadas).forEach(function (o) {
      if (!o || o.id == null) return;
      if (o.op === "apagar") { delete vivos[String(o.id)]; return; }
      if (o.bar != null && /^bar-/.test(String(o.id)) && (caixaId == null || String(o.bar) === String(caixaId))) { if (!vivos[String(o.id)]) ordem.push(String(o.id)); vivos[String(o.id)] = o; }
    });
    var ids = [];
    ordem.forEach(function (id) { var o = vivos[id]; if (!o) return; ids.push(id); if (o.op === "acessorio" && o.novoId) ids.push(String(o.novoId)); });
    return ids;
  }

  /* ================================================ O APOIO (laje, parede, viga) sob um segmento, abaixo da cota `teto` */
  function apoios(estado) {
    var H = HR(), o = H && H.obstaculosDoBim ? H.obstaculosDoBim(estado, null) : { lajes: [], paredes: [], vigas: [] };
    return { lajes: arr(o.lajes), paredes: arr(o.paredes).map(function (w) { return { id: w.id, p1: w.p1, p2: w.p2, esp: num(w.espessura, 0), base: num(w.base, 0), topo: num(w.base, 0) + num(w.altura, 0) }; }), vigas: arr(o.vigas) };
  }
  function suporte(Ap, a, b, r, teto, comParapeito) {
    var s = -Infinity, x0 = Math.min(a.x, b.x) - r, x1 = Math.max(a.x, b.x) + r, z0 = Math.min(a.z, b.z) - r, z1 = Math.max(a.z, b.z) + r;
    Ap.lajes.forEach(function (L) { if (L.topo <= teto + EPS && x1 >= L.x0 && x0 <= L.x1 && z1 >= L.z0 && z0 <= L.z1) s = Math.max(s, L.topo); });
    var sLaje = s;
    /* ⚠ N23 (25/10/2026) — PLATIBANDA NÃO É APOIO. A parede que NASCE sobre a laje do trecho e sobe acima dela (platibanda, mureta, peitoril
       da área técnica) é atravessada com passante, como o barrilete já fazia quando a caixa ficava abaixo do topo dela. Antes, com a caixa
       ELEVADA acima da platibanda (o Corrigir da pressão baixa), o topo da platibanda virava o "apoio" do barrilete: ele corria em cima dela,
       sem carga estática (6.9.3), e o Traçar pedia subir a caixa DE NOVO — a base do projeto exemplo foi a 3,7 m. Parede do ático (sem laje
       por baixo do trecho, ou que desce além da laje) continua apoio, como antes. */
    var TOL_PAR = 0.05;   // hid:ok 5 cm: a base da parede "na" laje (geometria, não norma)
    Ap.paredes.forEach(function (w) { if (w.topo > teto + EPS) return; if (!comParapeito && sLaje > -Infinity && w.base >= sLaje - TOL_PAR && w.topo > sLaje + TOL_PAR) return;
      if (segSeg({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: w.p1.x, y: 0, z: w.p1.z }, { x: w.p2.x, y: 0, z: w.p2.z }) <= w.esp / 2 + r) s = Math.max(s, w.topo); });
    /* idem a peça ACIMA da laje (terça, pontalete, viga da estrutura do telhado, com a face de baixo acima do topo da laje): o barrilete
       passa POR BAIXO dela, apoiado na laje — antes ela virava o apoio quando a caixa elevada punha o teto acima dela */
    Ap.vigas.forEach(function (v) { if (v.topo > teto + EPS) return; if (!comParapeito && sLaje > -Infinity && num(v.altura, null) != null && v.topo - num(v.altura, 0) > sLaje + TOL_PAR) return; if (segSeg({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: v.p1.x, y: 0, z: v.p1.z }, { x: v.p2.x, y: 0, z: v.p2.z }) <= num(v.largura, 0) / 2 + r) s = Math.max(s, v.topo); });
    return s;
  }
  /* a caixa do prédio (paredes + lajes) em planta: para o lado de FORA do extravasor e da limpeza */
  function contornoObra(Ap) {
    var bb = null;
    function add(x, z) { if (!bb) bb = { x0: x, x1: x, z0: z, z1: z }; bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); }
    Ap.paredes.forEach(function (w) { var h = w.esp / 2; add(w.p1.x - h, w.p1.z - h); add(w.p1.x + h, w.p1.z + h); add(w.p2.x - h, w.p2.z - h); add(w.p2.x + h, w.p2.z + h); });
    Ap.lajes.forEach(function (L) { add(L.x0, L.z0); add(L.x1, L.z1); });
    return bb;
  }

  /* ================================================ A FONTE do respiro (texto do manual no catálogo do aquecedor, H6) */
  function respiroDoCatalogo(av) {
    var v = (av && av.valores) || {}, C = HCt(), it = null;
    try { if (C && C.porCodigo && v.Codigo) it = C.porCodigo(v.Fabricante, v.Codigo) || null; } catch (e) { it = null; }
    var t = txt(it && it.dados && it.dados.respiro), m = /(\d+(?:[.,]\d+)?)\s*m\s+acima do n[ií]vel m[aá]ximo/i.exec(t);
    return m ? { valor: Number(m[1].replace(",", ".")), texto: t, fabricante: txt(v.Fabricante) } : { valor: null, texto: t, fabricante: txt(v.Fabricante) };
  }
  /* o maior valor do respiro no catálogo inteiro (outro fabricante) — a reserva declarada quando o modelo não traz */
  function respiroReserva() {
    var C = HCt(), melhor = null;
    try {
      ["aquecedor_eletrico_acumulacao", "aquecedor_gas_acumulacao"].forEach(function (tp) {
        arr(C && C.porTipo ? C.porTipo(tp) : []).forEach(function (it) {
          var m = /(\d+(?:[.,]\d+)?)\s*m\s+acima do n[ií]vel m[aá]ximo/i.exec(txt(it && it.dados && it.dados.respiro));
          if (m) { var v = Number(m[1].replace(",", ".")); if (!melhor || v > melhor.valor) melhor = { valor: v, fabricante: txt(it.fabricante), texto: txt(it.dados.respiro) }; }
        });
      });
    } catch (e) { melhor = null; }
    return melhor;
  }

  /* ================================================ MONTAR — o barrilete de cada caixa do modelo
   * e = { estado, avaliarFam, ops (as do modelo + o lote da prévia), parametros, caixa (id, opcional: só ela),
   *       pressao (true = conferir a pressão pela NBR 5626), oferta (true = sem caixa, propor uma), programa (HidPrograma) }
   * → { ops, avisos[], pendencias[], decisoes[], ligadas, caixas[], esperasLigadas[], respiros[], oferta, pressao } */
  function montar(e) {
    e = e || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, B = BI(), K = HK(), H = HR();
    var out = { ops: [], avisos: [], pendencias: [], decisoes: [], ligadas: 0, caixas: [], esperasLigadas: [], respiros: [], oferta: null, pressao: [], barInfo: [] };
    function pend(chave, texto, els, acao) { out.pendencias.push({ chave: chave, texto: texto, motivo: texto, elementos: arr(els).map(String), acao: acao || null }); }
    function aviso(texto, els, acao) { out.avisos.push({ texto: texto, elementos: arr(els).map(String), acao: acao || null }); }
    if (!B || !K || !H) { pend("bar.motores", "Barrilete: motores não carregados (BimInst, HidKit, HidRota)", []); return out; }
    var opsAch = achatar(e.ops);
    var CX = caixas(estado, avaliarFam).filter(function (c) { return e.caixa == null || c.id === String(e.caixa); });
    var ESP = esperas(estado, avaliarFam, e.ops);
    if (!ESP.length) {
      if (CX.length && e.caixa != null) aviso("Barrilete da caixa " + CX[0].id + ": nenhuma espera de água fria no modelo para ligar — trace os ambientes antes (Traçar automaticamente) e monte de novo.", [CX[0].id]);
      return out;
    }
    if (!caixas(estado, avaliarFam).length) {
      if (e.oferta) { var Of = ofertar(e, ESP); out.oferta = Of; if (Of && Of.acao) out.avisos.push(Of.aviso); else if (Of && Of.pendencia) out.pendencias.push(Of.pendencia); }
      return out;
    }
    if (!CX.length) return out;
    /* cada espera vai à caixa mais perto em planta (várias caixas = um barrilete por caixa) */
    var todas = caixas(estado, avaliarFam), porCx = {};
    ESP.forEach(function (s) { var best = null; todas.forEach(function (c) { if (!best || d2(s, c.c) < d2(s, best.c) - EPS) best = c; }); if (best) (porCx[best.id] = porCx[best.id] || []).push(s); });
    CX.forEach(function (cx) {
      var lista = porCx[cx.id] || []; if (!lista.length) return;
      /* N23 (26/10/2026, "o nosso barrilete está saindo com 50 ou 60 mm"): a espera da VÁLVULA DE DESCARGA é DN 40/50 (1 1/4"–1 1/2") e
         o barrilete pegava o maior DN a jusante — um banheiro com válvula engordava a saída e o tronco inteiros. Como se executa: a
         válvula tem SAÍDA e COLUNA EXCLUSIVAS na caixa (Tigre/Deca) e o consumo dos outros aparelhos sai em 25/32. Critério da espera da
         válvula: a MARCADA pelo traçado do ambiente (`valvula`, o "-afb" — js/hidambiente.js), não o DN. Defeito de 26/10/2026 (1.2.184):
         o critério era DN ≥ 40 por AMBIENTE e o ambiente deixava UMA espera só (o tronco do banheiro inteiro, DN 50 porque tem válvula),
         então bacia, lavatório e chuveiro desciam pela "coluna exclusiva" da válvula. Agora o banheiro deixa DUAS esperas (consumo e
         válvula) e só a da válvula vai à 2ª saída. Sem lugar para a 2ª saída: uma saída só, como antes (aviso).
         A regra é COLUNA exclusiva da válvula (não necessariamente saída exclusiva): a 2ª saída só vale se não piora a descida/pressão
         da principal (abaixo). NÃO vale para prédio: lá a válvula segue a coluna do prédio (`predio` != null fica fora de `lV`). */
      var lV = lista.filter(function (s) { return s.valvula && s.predio == null && !s.aq; }), lC = lista.filter(function (s) { return lV.indexOf(s) < 0; });
      var sec = null, ang2 = null, R = null, reserva = null;
      /* projeto da 1.2.184 (o "-afb" era a espera do banheiro inteiro): vale como consumo e o usuário é avisado */
      lista.forEach(function (s) { if (s.antiga) out.avisos.push({ texto: "Este banheiro foi traçado numa versão anterior: use Traçar automaticamente de novo para a válvula ter coluna exclusiva (a espera " + s.trecho + " é do banheiro inteiro e foi ligada como consumo).", elementos: [s.trecho], acao: null }); });
      /* o lado da 2ª saída: o 1º em que ela liga todas as válvulas E a principal fecha sem esbarrar nela (coluna, caminho, respiro do
         boiler) E a principal ainda DESCE (a tomada vertical); sem lado limpo, o 1º em que as duas fecham com a descida (com as
         pendências de esbarrar, que dizem o que lançar à mão). O lado em que a principal não desce NUNCA vale: o barrilete ficaria na
         cota da saída e a pressão faltaria (defeito de 26/10/2026, cenário de 2 banheiros) */
      function esbarra(Rx) { return Rx.pendencias.some(function (p) { return /^bar\.(respiro|coluna|caminho)$/.test(p.chave); }); }
      if (lV.length && lC.length && cx.S) {
        for (var ia = 0; ia < ANG_SAIDA2.length && !sec; ia++) {
          var Rv = montarCaixa(e, saidaGirada(cx, ANG_SAIDA2[ia]), lV, opsAch, { secundaria: true, nOp0: 500 });   // hid:ok ids da 2ª saída a partir de 500
          if (!(Rv.ok && Rv.ligadas === lV.length)) continue;
          var Rp = montarCaixa(e, cx, lC, opsAch, { obst: Rv.novos.map(function (o) { return { a: o.a, b: o.b, r: o.r, sistema: o.sistema, id: "2ª saída · " + o.id }; }), saida2: { dn: Rv.dnSaida, ang: ANG_SAIDA2[ia] } });
          if (!Rp.ok || Rp.semTomada) continue;
          if (!esbarra(Rp) && !esbarra(Rv)) { sec = Rv; ang2 = ANG_SAIDA2[ia]; R = Rp; }
          else if (!reserva) reserva = { sec: Rv, ang: ANG_SAIDA2[ia], R: Rp };
        }
        if (!sec && reserva) { sec = reserva.sec; ang2 = reserva.ang; R = reserva.R; }
      }
      /* N23 (revisão, 26/10/2026): a regra de projeto é COLUNA exclusiva da válvula, não necessariamente SAÍDA exclusiva da caixa. Monta-se
         também a configuração de UMA saída só (cada espera já tem a sua coluna desde o barrilete) e a 2ª saída só fica se não piora:
         a principal desce e a pressão não falta onde a de uma saída atende. Prédio (espera `predio`) não entra: a válvula segue a coluna
         do prédio. */
      var motivoUma = null;
      if (!sec && lV.length && lC.length && cx.S) motivoUma = "nenhum lado deixa a saída principal descer até a laje com a 2ª saída";
      if (sec) {
        var R1 = montarCaixa(e, cx, lista, opsAch);
        if (!R1.semTomada && !esbarra(R1) && (esbarra(R) || esbarra(sec))) motivoUma = "a 2ª saída só fechava com interferência a lançar à mão, e a de uma saída não";
        else if (e.pressao !== false && R1.ok) {
          var pA = pressaoDaConfig(e, out.ops.concat(sec.ops, R.ops), cx), p1 = pressaoDaConfig(e, out.ops.concat(R1.ops), cx);
          if (pA.baixa && (!p1.baixa || pA.subir > p1.subir + EPS)) motivoUma = "com a 2ª saída a pressão " + (p1.baixa ? "faltaria mais" : "faltaria") + " no ponto mais desfavorável (subir " + f2(pA.subir) + " m contra " + (p1.baixa ? f2(p1.subir) + " m" : "nada") + " com uma saída só)";
        }
        if (motivoUma) { sec = null; ang2 = null; R = R1; }
      }
      if (!R) R = montarCaixa(e, cx, lista, opsAch);
      if (!sec && lV.length && lC.length) out.avisos.push({ texto: "Caixa d'água " + cx.id + ": " + (motivoUma || "não houve lugar para a 2ª saída da caixa") + "; ficou UMA saída com a coluna exclusiva da válvula de descarga (a regra de projeto é a coluna exclusiva, que se mantém desde o barrilete). O barrilete ficou com o DN dela (" + lV.map(function (s) { return s.dn; }).join(", ") + "). Para a 2ª saída, gire a caixa ou libere o lado dela e trace de novo.", elementos: [cx.id], acao: null });
      if (sec) {
        sec.ops.forEach(function (o) { out.ops.push(o); });
        sec.avisos.forEach(function (a) { out.avisos.push(a); });
        sec.pendencias.forEach(function (p) { out.pendencias.push(p); });
        sec.decisoes.forEach(function (d) { out.decisoes.push(d); });
        out.ligadas += sec.ligadas; out.esperasLigadas = out.esperasLigadas.concat(sec.esperasLigadas);
      }
      R.ops.forEach(function (o) { out.ops.push(o); });
      R.avisos.forEach(function (a) { out.avisos.push(a); });
      R.pendencias.forEach(function (p) { out.pendencias.push(p); });
      R.decisoes.forEach(function (d) { out.decisoes.push(d); });
      R.respiros.forEach(function (x) { out.respiros.push(x); });
      out.ligadas += R.ligadas; out.esperasLigadas = out.esperasLigadas.concat(R.esperasLigadas);
      out.caixas.push({ id: cx.id, ok: R.ok, ligadas: R.ligadas, subir: R.subir || null });
      if (R.barInfo) out.barInfo.push(R.barInfo);
    });
    /* PRESSÃO no ponto mais desfavorável (o mesmo cálculo do dimensionamento) — sobre a prévia com o barrilete */
    if (e.pressao !== false && out.ligadas) {
      out.caixas.forEach(function (c) {
        if (!c.ok) return;
        var Pz = conferirPressao(e, out.ops, todas.filter(function (x) { return x.id === c.id; })[0]);
        if (!Pz) return;
        out.pressao.push(Pz);
        arr(Pz.achados).forEach(function (a) { out.pendencias.push(a); });
      });
    }
    return out;
  }

  /* a pressão de UMA configuração do barrilete (sem as bases de apoio: só o "falta/quanto subir"), para escolher entre 1 e 2 saídas */
  function pressaoDaConfig(e, ops, cx) {
    var e2 = {}; Object.keys(e).forEach(function (k) { e2[k] = e[k]; }); e2._semBase = true;
    var Pz = null; try { Pz = conferirPressao(e2, ops, cx); } catch (eP) { Pz = null; }
    var baixa = !!Pz && arr(Pz.achados).some(function (a) { return a.chave === "bar.pressao_baixa"; });
    return { baixa: baixa, subir: baixa ? num(Pz.subir, 0) : 0 };
  }

  /* ---------------------------------------------- o barrilete de UMA caixa */
  function montarCaixa(e, cx, lista, opsAch, opc) {
    opc = opc || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, B = BI(), K = HK(), H = HR(), G = H.GEO;
    var res = { ok: false, ops: [], avisos: [], pendencias: [], decisoes: [], ligadas: 0, esperasLigadas: [], respiros: [], subir: null, barInfo: null };
    function pend(chave, texto, els, acao) { res.pendencias.push({ chave: chave, texto: texto, motivo: texto, elementos: arr(els).map(String), acao: acao || null }); }
    function aviso(texto, els, acao) { res.avisos.push({ texto: texto, elementos: arr(els).map(String), acao: acao || null }); }
    var nome = "Caixa d'água " + cx.id + (opc.secundaria ? " (2ª saída: coluna exclusiva da válvula de descarga)" : "");
    if (!cx.S) { pend("bar.saida", nome + ": a família não tem o ponto de saída (consumo) — use a família hid-caixa-dagua do catálogo", [cx.id]); return res; }
    var folga = num(par.folga, G.folga), mNo = num(par.margemNo, G.margemNo), passo = G.passo, Lr = B.ACESSORIO_PADRAO, TOL = B.TOL;
    var decl0 = num(par.declividadeBarrilete, GEO_BAR.declividade);
    /* N23: a pressão dinâmica mínima "em qualquer ponto da rede" (NBR 5626:2020, 6.9.3 — pelo HidNormas) em metros de coluna d'água */
    var hRedeM = (function () { var Nn0 = NN(), Hh0 = HHi(); try { var c0 = Nn0 ? Nn0.consulta("af.pressao.dinamica_minima_rede", null, "valor") : null; return c0 && c0.ok && Hh0 ? Hh0.kpaParaM(num(c0.valor, 0)) : 0; } catch (eR) { return 0; } })();
    var matAF = B.SISTEMAS.agua_fria.material, dnsAF = arr((B.MATERIAIS[matAF] || {}).dns), dnPad = (B.MATERIAIS[matAF] || {}).dn;
    function comercial(dn) { var ok = dnsAF.filter(function (d) { return d >= dn - EPS; }); return ok.length ? ok[0] : (dnsAF.length ? dnsAF[dnsAF.length - 1] : dn); }
    /* N23 (26/10/2026, referências Fortlev/Tigre do Rogério): o registro APARENTE da caixa e do barrilete é o de ESFERA de PVC soldável — a
       regra do próprio catálogo (js/biminst.js ACESSORIOS: "APARENTE (barrilete, cavalete...) = registro de esfera"); antes saía o de
       gaveta de latão bruto, que é o do embutido */
    var RG_FAM = "ra-registro-esfera", tipoRg = B.varianteAuto ? B.varianteAuto("registro_esfera", { sistema: "agua_fria", material: matAF, aplicacao: "reservacao" }) : "soldavel";
    var Ap = apoios(estado), teto = cx.S.y;
    var obst = H.obstaculosDoBim(estado, avaliarFam), vols = arr(obst.familias);
    var existentes = arr(estado.instalacoes && estado.instalacoes.trechos).map(function (t) { return { a: t.p1, b: t.p2, r: raio(t.dn), sistema: t.sistema, id: String(t.id) }; }).concat(arr(opc.obst));
    var novos = [];
    var nOp = num(opc.nOp0, 0);   /* a 2ª saída começa em 500: os ids das duas não se cruzam */
    function novoId(parte) { nOp++; return "bar-" + cx.id + "-" + parte + "-" + nOp; }
    var marca = { bar: cx.id };
    function T(parte, sis, dn, p1, p2, extra) {
      var o = { op: "trecho", id: novoId(parte), sistema: sis || "agua_fria", material: matAF, dn: dn, p1: p1, p2: p2, bar: cx.id, barParte: parte };
      Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
      return o;
    }
    /* conflito: folga física com os tubos (as pontas que se ligam não contam) e os volumes das famílias */
    function conflito(a, b, r, ign) {
      var todos = existentes.concat(novos);
      for (var i = 0; i < todos.length; i++) {
        var Tq = todos[i]; if (ign && ign(Tq)) continue;
        /* ligado pela ponta (joelho, tê): não é interferência — salvo voltando por cima do outro (mesma direção a partir do nó = tubo
           dentro de tubo; o mesmo cuidado do js/hidaqtraco.js) */
        var qC = d3(a, Tq.a) <= TOL ? [a, b, Tq.b] : d3(a, Tq.b) <= TOL ? [a, b, Tq.a] : d3(b, Tq.a) <= TOL ? [b, a, Tq.b] : d3(b, Tq.b) <= TOL ? [b, a, Tq.a] : null;
        if (qC) {
          var uC = { x: qC[1].x - qC[0].x, y: qC[1].y - qC[0].y, z: qC[1].z - qC[0].z }, vC = { x: qC[2].x - qC[0].x, y: qC[2].y - qC[0].y, z: qC[2].z - qC[0].z };
          var Lu = Math.sqrt(uC.x * uC.x + uC.y * uC.y + uC.z * uC.z), Lv = Math.sqrt(vC.x * vC.x + vC.y * vC.y + vC.z * vC.z);
          if (Lu > EPS && Lv > EPS && (uC.x * vC.x + uC.y * vC.y + uC.z * vC.z) / (Lu * Lv) > Math.SQRT1_2) return { com: Tq.id, sistema: Tq.sistema };
          continue;
        }
        if (segSeg(a, a, Tq.a, Tq.b) <= TOL || segSeg(b, b, Tq.a, Tq.b) <= TOL || segSeg(Tq.a, Tq.a, a, b) <= TOL || segSeg(Tq.b, Tq.b, a, b) <= TOL) continue;
        var q = r + Tq.r + folga;
        if (Math.min(a.x, b.x) - q > Math.max(Tq.a.x, Tq.b.x) || Math.max(a.x, b.x) + q < Math.min(Tq.a.x, Tq.b.x) || Math.min(a.z, b.z) - q > Math.max(Tq.a.z, Tq.b.z) || Math.max(a.z, b.z) + q < Math.min(Tq.a.z, Tq.b.z) || Math.min(a.y, b.y) - q > Math.max(Tq.a.y, Tq.b.y) || Math.max(a.y, b.y) + q < Math.min(Tq.a.y, Tq.b.y)) continue;
        if (segSeg(a, b, Tq.a, Tq.b) - r - Tq.r < folga - FOLGA_LIMITE) return { com: Tq.id, sistema: Tq.sistema };
      }
      for (var j = 0; j < vols.length; j++) {
        var v = vols[j]; if (ign && ign({ id: String(v.id), volume: true })) continue;
        if (Math.max(a.y, b.y) + r < v.y0 || Math.min(a.y, b.y) - r > v.y1) continue;
        if (B.tuboEmVolume(v, a, b, r, [], FOLGA_LIMITE * 2)) return { com: String(v.id), familia: true };
      }
      return null;
    }
    function ignCaixa(Tq) { return Tq.volume && (Tq.id === cx.id || ehBaseDe(Tq.id, cx.id)); }

    /* ---------- DN: a coluna = a espera; o barrilete a montante = o maior a jusante; a saída = o maior de todos */
    lista.forEach(function (s) { s.dnCol = comercial(Math.max(num(s.dn, 0), 0) || dnPad); });
    var dnSaida = comercial(Math.max.apply(null, lista.map(function (s) { return s.dnCol; }).concat([dnPad])));
    var rS = raio(dnSaida);

    /* ---------- 1) SAÍDA: o toco radial, o registro, o tê da ventilação (A) */
    var u = unit2(cx.S.x - cx.c.x, cx.S.z - cx.c.z) || { x: Math.cos(cx.rot), z: -Math.sin(cx.rot) };
    var S0 = P3(cx.S.x, cx.S.y, cx.S.z), A = P3(S0.x + u.x * GEO_BAR.tocoSaida, S0.y, S0.z + u.z * GEO_BAR.tocoSaida);
    var cS = conflito(S0, A, rS, ignCaixa);
    if (cS) { pend("bar.saida", nome + ": a saída da caixa esbarra em " + cS.com + " logo ao sair (toco de " + f2(GEO_BAR.tocoSaida) + " m) — gire a caixa (a saída para o lado livre) e monte de novo", [cx.id, cS.com]); return res; }
    var yVent = r4(cx.yt + GEO_BAR.ventAcima), pV = P3(A.x, yVent, A.z);
    /* a ventilação entra nos obstáculos ANTES da árvore: o ramo que sai de A não pode correr colado nela */
    var cV = conflito(A, pV, rS, ignCaixa), comVent = !cV;
    var base0 = [{ a: S0, b: A, r: rS, sistema: "agua_fria", id: "toco" }].concat(comVent ? [{ a: A, b: pV, r: rS, sistema: "agua_fria", id: "vent" }] : []);
    novos = base0.slice();
    var PES = H.PESOS || {}, pesoCx = num(PES.conexao, 0);
    /* a distância do centro da caixa que contorna o corpo (com a tampa) por fora, com o tubo e a folga, arredondada à grade */
    var contorno = Math.ceil((Math.max(cx.R, num(cx.av && cx.av.valores && cx.av.valores.Diametro, 0) / 2) + rS + folga) / passo + 1) * passo;
    lista.forEach(function (s) { s.L = { x: s.x, z: s.z }; });
    lista.sort(function (s1, s2) { return d2(s1.L, A) - d2(s2.L, A); });

    /* ---------- 2..4) o PLANO: a árvore em planta (Prim ortogonal; tê no máximo; desvios em "Z"; perna curta demais fora), as
       cotas (descendo a partir da saída sobre o apoio) e a conferência das colunas na cota real. A coluna que esbarra tira a espera
       dela do plano (pendência) e o plano é refeito sem ela — nunca tubo meio traçado */
    function planejarArvore(ativas) {
      novos = base0.slice();
      var arvore = [{ a: { x: A.x, z: A.z }, b: { x: A.x, z: A.z } }], folhas = [], semCaminho = [];
      function grauNo(q) {
        var g0 = d2(q, A) <= EPS * 10 ? (comVent ? 2 : 1) : 0;   /* no A já chegam o toco da saída e a ventilação */   // hid:ok tolerância do nó
        arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) return; if (d2(sg.a, q) <= EPS * 10 || d2(sg.b, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó
        folhas.forEach(function (l) { if (d2(l.L, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó (a coluna que desce dele)
        return g0;
      }
      ativas.forEach(function (s) {
        var rL = raio(s.dnCol), melhor = null;
        arvore.forEach(function (sg, is) {
          var cand = [sg.a, sg.b], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz;
          if (LL > EPS) { var tt = ((s.L.x - sg.a.x) * ux + (s.L.z - sg.a.z) * uz) / LL, Ls = Math.sqrt(LL);
            [0, 1, -1, 2, -2, 3, -3].forEach(function (nP) { var t2 = tt + nP * passo / Ls; if (t2 > EPS && t2 < 1 - EPS) cand.push({ x: r4(sg.a.x + ux * t2), z: r4(sg.a.z + uz * t2) }); });   // hid:ok passos da grade ao redor do pé da perpendicular
          }
          cand.forEach(function (q) {
            if (grauNo(q) >= 3) return;   // hid:ok tê = 3 ligações (a 4ª seria cruzeta)
            var cams = Math.abs(q.x - s.L.x) < EPS || Math.abs(q.z - s.L.z) < EPS ? [[q, s.L]] : [[q, { x: s.L.x, z: q.z }, s.L], [q, { x: q.x, z: s.L.z }, s.L]];
            GEO_BAR.zDesvios.forEach(function (nP) { [1, -1].forEach(function (sgn) { var o2 = sgn * nP * passo;
              cams.push([q, { x: q.x + o2, z: q.z }, { x: q.x + o2, z: s.L.z }, s.L]); cams.push([q, { x: q.x, z: q.z + o2 }, { x: s.L.x, z: q.z + o2 }, s.L]); }); });
            /* a espera ATRÁS da caixa (o prédio: a coluna do outro lado do reservatório): o "U" que contorna o corpo dela por fora */
            [1, -1].forEach(function (sgn) { var zA = r4(cx.c.z + sgn * contorno), xA = r4(cx.c.x + sgn * contorno);
              cams.push([q, { x: q.x, z: zA }, { x: s.L.x, z: zA }, s.L]); cams.push([q, { x: xA, z: q.z }, { x: xA, z: s.L.z }, s.L]); });
            cams.forEach(function (cm) {
              var custo = 0, ok = true;
              for (var m = 1; m < cm.length && ok; m++) {
                var a = P3(cm[m - 1].x, teto, cm[m - 1].z), b = P3(cm[m].x, teto, cm[m].z), Lg = d2(a, b); if (Lg < EPS) continue;
                /* a perna mais curta que um nó (o joelho colado no tê) não é tubo que se monte */
                if (Lg < mNo - EPS) { ok = false; break; }
                if (conflito(a, b, Math.max(rL, rS), null)) { ok = false; break; }
                custo += Lg;
              }
              custo += (cm.length - 2) * pesoCx;
              if (ok && (!melhor || custo < melhor.custo - EPS)) melhor = { custo: custo, cam: cm, seg: is, q: q };
            });
          });
        });
        if (!melhor) { semCaminho.push(s); return; }
        var sg0 = arvore[melhor.seg], q0 = melhor.q;
        if (d2(q0, sg0.a) > EPS && d2(q0, sg0.b) > EPS) arvore.splice(melhor.seg, 1, { a: sg0.a, b: { x: q0.x, z: q0.z } }, { a: { x: q0.x, z: q0.z }, b: sg0.b });
        for (var m2 = 1; m2 < melhor.cam.length; m2++) {
          var a2 = melhor.cam[m2 - 1], b2 = melhor.cam[m2]; if (d2(a2, b2) < EPS) continue;
          arvore.push({ a: { x: a2.x, z: a2.z }, b: { x: b2.x, z: b2.z } });
          novos.push({ a: P3(a2.x, teto, a2.z), b: P3(b2.x, teto, b2.z), r: Math.max(rL, rS), sistema: "agua_fria", id: "barrilete" });
        }
        folhas.push(s);
      });
      var Pl = { semCaminho: semCaminho, folhas: folhas };
      if (!folhas.length) return Pl;
      /* a folha que caiu NO MEIO de um tubo da árvore (esperas alinhadas): o tubo se divide ali (tê) */
      folhas.forEach(function (l) {
        for (var is = 0; is < arvore.length; is++) {
          var sg = arvore[is], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz; if (!(LL > EPS)) continue;
          var tt = ((l.L.x - sg.a.x) * ux + (l.L.z - sg.a.z) * uz) / LL, q = { x: sg.a.x + ux * tt, z: sg.a.z + uz * tt };
          if (tt > EPS && tt < 1 - EPS && d2(q, l.L) <= EPS * 10) { arvore.splice(is, 1, { a: sg.a, b: { x: l.L.x, z: l.L.z } }, { a: { x: l.L.x, z: l.L.z }, b: sg.b }); break; }   // hid:ok tolerância do nó
        }
      });
      /* o grafo orientado a partir de A: distância ao longo do tubo, DN a jusante */
      var nos = [], arestas = [];
      function no(p) { for (var i = 0; i < nos.length; i++) if (d2(nos[i], p) <= EPS * 10) return i; nos.push({ x: p.x, z: p.z, e: [] }); return nos.length - 1; }   // hid:ok tolerância do nó
      arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) { no(sg.a); return; } var ia = no(sg.a), ib = no(sg.b); arestas.push({ a: ia, b: ib, L: d2(sg.a, sg.b) }); nos[ia].e.push(arestas.length - 1); nos[ib].e.push(arestas.length - 1); });
      var iR = no(A), folhaDe = {};
      folhas.forEach(function (l) { l.n = no(l.L); folhaDe[l.n] = l; });
      var pai = {}, ordem = [iR], vis = {}, dist = {}; vis[iR] = 1; dist[iR] = 0;
      for (var qi = 0; qi < ordem.length; qi++) nos[ordem[qi]].e.forEach(function (ei) { var Ed = arestas[ei], mm = Ed.a === ordem[qi] ? Ed.b : Ed.a; if (vis[mm]) return; vis[mm] = 1; pai[mm] = { de: ordem[qi], e: ei }; dist[mm] = dist[ordem[qi]] + Ed.L; ordem.push(mm); });
      function filhos(ni) { return nos[ni].e.map(function (ei) { var Ed = arestas[ei]; return Ed.a === ni ? Ed.b : Ed.a; }).filter(function (mm) { return pai[mm] && pai[mm].de === ni; }); }
      var dnNo = {};
      for (var oi = ordem.length - 1; oi >= 0; oi--) { var ni = ordem[oi], dm = folhaDe[ni] ? folhaDe[ni].dnCol : 0; filhos(ni).forEach(function (mm) { dm = Math.max(dm, dnNo[mm] || 0); }); dnNo[ni] = dm; }
      /* as COTAS: desce a partir da saída; a mínima de cada nó = o apoio sob o tubo (laje, parede, viga) + o raio; sobre a espera,
         ainda a queda mínima da coluna (um nó de margem) */
      var yMin = {};
      ordem.forEach(function (n) { yMin[n] = -Infinity; });
      arestas.forEach(function (Ed) { var a = nos[Ed.a], b = nos[Ed.b], r = raio(Math.max(dnNo[Ed.a] || 0, dnNo[Ed.b] || 0) || dnSaida), s = suporte(Ap, a, b, r, teto); if (s > -Infinity) { yMin[Ed.a] = Math.max(yMin[Ed.a], s + r + APOIO); yMin[Ed.b] = Math.max(yMin[Ed.b], s + r + APOIO); } });
      var sA = suporte(Ap, { x: S0.x, z: S0.z }, { x: A.x, z: A.z }, rS, teto); if (sA > -Infinity) yMin[iR] = Math.max(yMin[iR], sA + rS + APOIO);
      folhas.forEach(function (l) { yMin[l.n] = Math.max(yMin[l.n], l.y + mNo); });
      /* N23: no barrilete BAIXO (apoiado, pela tomada vertical) a coluna é curta — sobre a espera fica ainda a altura do REGISTRO no início
         da coluna, acima do apoio (6.5.12.4 b; a mesma conta do registro mais abaixo), senão a coluna não tinha onde pôr o registro */
      if (regColuna) folhas.forEach(function (l) {
        if (l.predio) return;
        var rLr = raio(l.dnCol), spR = suporte(Ap, l.L, l.L, rLr, teto), yB0 = spR > -Infinity ? spR + rLr : l.y;
        yMin[l.n] = Math.max(yMin[l.n], Math.max(yB0 + folga, l.y + TOL) + Lr + mNo + TOL + APOIO);
      });
      var y0 = teto, faltaMax = -Infinity, declMax = Infinity;   /* N23: teto = a cota da saída (1º plano) ou a do pé da tomada vertical */
      ordem.forEach(function (n) {
        if (!(yMin[n] > -Infinity)) return;
        faltaMax = Math.max(faltaMax, yMin[n] + decl0 * dist[n] - y0);
        if (dist[n] > EPS) declMax = Math.min(declMax, (y0 - yMin[n]) / dist[n]); else if (yMin[n] > y0 + EPS) declMax = -Infinity;
      });
      Pl.nos = nos; Pl.arestas = arestas; Pl.iR = iR; Pl.folhaDe = folhaDe; Pl.pai = pai; Pl.ordem = ordem; Pl.dist = dist; Pl.filhos = filhos; Pl.dnNo = dnNo;
      Pl.y0 = y0; Pl.faltaMax = faltaMax; Pl.declMax = declMax;
      if (declMax < 0) { Pl.baixa = true; return Pl; }
      var decl = Math.min(decl0, declMax); Pl.decl = decl;
      Pl.yDe = function (n) { return r4(y0 - decl * dist[n]); };
      /* as CADEIAS (retas seguidas viram um trecho) na cota real — e a conferência das colunas contra elas */
      var cadeias = [], pilha = [iR];
      function reto(a, b, c) { var ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z; return Math.abs(ux * vz - uz * vx) < EPS * 10 && ux * vx + uz * vz > 0; }   // hid:ok tolerância de alinhamento
      while (pilha.length) {
        var ini = pilha.pop();
        filhos(ini).forEach(function (mm) {
          var cur = mm, prev = ini;
          while (!folhaDe[cur] && filhos(cur).length === 1 && reto(nos[prev], nos[cur], nos[filhos(cur)[0]])) { prev = cur; cur = filhos(cur)[0]; }
          cadeias.push({ ini: ini, fim: cur, prim: mm, p1: P3(nos[ini].x, Pl.yDe(ini), nos[ini].z), p2: P3(nos[cur].x, Pl.yDe(cur), nos[cur].z), dn: comercial(Math.max(dnNo[mm] || dnSaida, dnPad)) });   /* ⚠ nunca abaixo do DN padrão: a redução 50 × 20 no tê não existe na SINAPI (a 25 × 20 na descida, sim) */
          pilha.push(cur);
        });
      }
      Pl.cadeias = cadeias;
      novos = base0.slice().concat(cadeias.map(function (cd) { return { a: cd.p1, b: cd.p2, r: raio(cd.dn), sistema: "agua_fria", id: "barrilete" }; }));
      for (var il = 0; il < folhas.length; il++) {
        var l = folhas[il], yT = Pl.yDe(l.n), p1 = P3(l.x, yT, l.z), p2 = P3(l.x, l.y, l.z), rL = raio(l.dnCol);
        var cC = conflito(p1, p2, rL, function (Tq) { return Tq.id === l.trecho; });
        if (cC) { Pl.colunaFalha = { l: l, com: cC.com }; return Pl; }
        /* ⚠ abaixo do apoio do barrilete a coluna só desce DENTRO de parede ou laje (embutida, como a espera): no sobrado a espera do
           térreo sob um cômodo do pavimento de cima sem parede em cima dela faria a coluna atravessar o cômodo no meio */
        var yApoio = suporte(Ap, l.L, l.L, rL, yT), fora = null;
        if (yApoio > -Infinity) for (var ys = l.y + PASSO_COLUNA / 2; ys < yApoio - EPS && !fora; ys += PASSO_COLUNA) {
          var naLaje = Ap.lajes.some(function (L) { return l.x >= L.x0 - EPS && l.x <= L.x1 + EPS && l.z >= L.z0 - EPS && l.z <= L.z1 + EPS && ys <= L.topo + EPS && ys >= L.topo - num(L.espessura, 0) - EPS; });
          if (!naLaje && !K._int.paredeDe(estado, { x: l.x, z: l.z }, ys)) fora = ys;
        }
        if (fora != null) { Pl.colunaFalha = { l: l, com: "um cômodo (a " + f2(fora) + " m a coluna sai da parede: o pavimento de cima não tem parede sobre a espera — use um shaft ou desloque a espera)" }; return Pl; }
        l.p1 = p1; l.p2 = p2;
        novos.push({ a: p1, b: p2, r: rL, sistema: "agua_fria", id: "coluna-" + l.trecho });
      }
      return Pl;
    }
    var regColuna = false;
    function planejarCom(yP, base, reg) {
      teto = yP; base0 = base; regColuna = !!reg;
      var at = lista.slice(), P = null, pc = [];
      for (var tent = 0; tent <= lista.length; tent++) {
        P = planejarArvore(at);
        if (!P.colunaFalha) break;
        pc.push({ l: P.colunaFalha.l, com: P.colunaFalha.com });
        at = at.filter(function (s) { return s !== P.colunaFalha.l; });
      }
      P.colunasFora = pc;
      return P;
    }
    var baseTopo = base0.slice(), Pl = planejarCom(cx.S.y, baseTopo), tomada = null;
    /* ⚠ N23 (24/10/2026) — O BARRILETE DESCE ATÉ O APOIO PELA TOMADA VERTICAL. Antes ele corria na cota da SAÍDA da caixa: os nós dele
       ficavam a poucos centímetros abaixo do nível d'água mínimo e a NBR 5626:2020, 6.9.3, pede 5 kPa "em qualquer ponto da rede"
       (só o trecho VERTICAL de tomada d'água na saída do reservatório elevado até o barrilete fica fora) — o Dimensionar reprovava 19
       nós por carga estática ("nenhum DN resolve") e subir a caixa não resolvia NUNCA, porque o barrilete subia junto com ela. Agora
       a saída faz o toco com o registro e o tê da ventilação, DESCE na vertical (a tomada) e o barrilete corre APOIADO na laje/forro, na
       cota mais baixa que as colunas permitem (um nó de margem sobre cada espera): a carga estática do barrilete passa a ser a altura
       da caixa (com a base de apoio) acima da laje, e elevar a caixa resolve. A descida não pode esbarrar na BASE de apoio nem em nada:
       esbarrou → o barrilete fica na cota da saída, como antes (e a pressão diz quanto falta). */
    /* a cota mais baixa possível COM o registro no início de cada coluna (o plano na cota da saída, com essa folga sobre as esperas) */
    var PlR = !Pl.baixa && !Pl.colunaFalha && Pl.folhas.length ? planejarCom(cx.S.y, baseTopo, true) : null;
    if (PlR && !PlR.baixa && !PlR.colunaFalha && PlR.folhas.length === Pl.folhas.length && PlR.faltaMax < -GEO_BAR.descidaMin) {
      var yAlvo = r4(PlR.y0 + PlR.faltaMax), At = P3(A.x, cx.S.y, A.z), Ab = P3(A.x, yAlvo, A.z);
      var cT = conflito(At, Ab, rS, function (Tq) { return Tq.volume && Tq.id === cx.id; });
      if (!cT) {
        var nF = Pl.folhas.length, nSC = Pl.semCaminho.length, nCF = Pl.colunasFora.length;
        var Pl2 = planejarCom(yAlvo, baseTopo.concat([{ a: At, b: Ab, r: rS, sistema: "agua_fria", id: "tomada" }]), true);
        /* o plano baixo só vale se liga as MESMAS esperas, sem caminho perdido e na declividade cheia */
        if (!Pl2.baixa && !Pl2.colunaFalha && Pl2.folhas.length === nF && Pl2.semCaminho.length <= nSC && Pl2.colunasFora.length <= nCF && !(Pl2.faltaMax > 1 / CASAS)) { Pl = Pl2; tomada = { a: At, b: Ab }; }   /* N23: a falta medida em cotas arredondadas a 0,1 mm (r4): 0,000005 m não é falta */
      } else aviso(nome + ": a descida do barrilete até a laje (tomada vertical na saída) esbarra em " + cT.com + " — o barrilete ficou na cota da saída (sem os 5 kPa da NBR 5626:2020 6.9.3); gire a caixa (a saída para o lado livre) e trace de novo", [cx.id, cT.com],
        { tipo: "ops", ops: [{ op: "instancia", id: cx.id, rotY: r4(cx.rot + Math.PI / 2) }], texto: "girar a caixa 90° (a saída para outro lado)" });   // hid:ok um quarto de volta
    }
    /* a descida era possível (o plano baixo existe) e não coube: o barrilete ficou na cota da saída — quem escolhe o lado da 2ª saída
       (montar) usa isto para tentar outro, em vez de aceitar um lado em que a coluna do consumo cruza a da válvula (N23, 26/10/2026) */
    res.semTomada = !!(PlR && !tomada);
    if (PlR && !tomada) Pl = planejarCom(cx.S.y, baseTopo);   /* sem a descida: o plano da cota da saída, como antes (o estado das folhas volta) */
    Pl.colunasFora.forEach(function (cf) { pend("bar.coluna", nome + ": a coluna até a espera " + cf.l.trecho + " esbarra em " + cf.com + " — essa espera ficou fora do barrilete; desça à mão", [cf.l.trecho, cf.com]); });
    Pl.semCaminho.forEach(function (s) { pend("bar.caminho", nome + ": o barrilete não acha caminho livre até a espera " + s.trecho + " (" + f2(s.x) + "; " + f2(s.y) + "; " + f2(s.z) + ") — tubo, caixa ou equipamento no caminho no ático; ligue à mão", [s.trecho, cx.id]); });
    if (!Pl.folhas.length || Pl.colunaFalha) return res;
    var y0 = Pl.y0, faltaMax = Pl.faltaMax;
    if (Pl.baixa) {
      /* ⚠ a caixa está BAIXA DEMAIS para o barrilete: a saída abaixo do forro/laje ou das esperas — nada de tubo subindo (bolsa de
         ar, R-C10): o achado diz quanto subir a caixa, com o Corrigir. N23: e mais a carga da rede (6.9.3) — depois de subir, o
         barrilete desce até o apoio pela tomada e precisa dos 5 kPa abaixo do nível d'água mínimo (a saída, sem o nível informado) */
      var sub = Math.ceil((faltaMax + hRedeM + GEO_BAR.margemSubir) / GEO_BAR.passoSubir - EPS) * GEO_BAR.passoSubir;
      res.subir = r4(sub);
      pend("bar.caixa_baixa", nome + ": a saída (" + f2(y0) + " m) está abaixo do que o barrilete precisa para descer até as esperas sem subir no caminho (falta " + f2(faltaMax) + " m, com a declividade de " + f2(decl0 * 100) + " %; R-C10 — sem inflexão). Suba a caixa " + f2(sub) + " m (base a " + f2(cx.yb + sub) + " m) e trace de novo",
        [cx.id], { tipo: "ops", ops: [{ op: "instancia", id: cx.id, y: r4(cx.yb + sub) }], texto: "subir a caixa " + f2(sub) + " m (base a " + f2(cx.yb + sub) + " m)" });
      /* N23: o calço/base sob a caixa (a caixa não sobe no ar) — as duas opções, dimensionadas com a caixa cheia */
      var bsB = basesPara(e, cx, sub, "A caixa está baixa para o barrilete descer até as esperas.", "");
      var bsBok = bsB.filter(function (b) { return b.acao; });
      if (bsBok.length) { var pB = res.pendencias[res.pendencias.length - 1]; pB.acao = bsBok[0].acao; }
      bsB.forEach(function (b) { res.pendencias.push(b); });
      return res;
    }
    var decl = Pl.decl, folhas = Pl.folhas, iR = Pl.iR, yDe = Pl.yDe, filhos = Pl.filhos;
    if (decl < decl0 - EPS) { var subD = Math.ceil((faltaMax + GEO_BAR.margemSubir) / GEO_BAR.passoSubir - EPS) * GEO_BAR.passoSubir;
      aviso(nome + ": sem altura para a declividade de " + f2(decl0 * 100) + " % do barrilete (prática de memorial, R-C10): saiu com " + f2(decl * 100) + " % — a NBR 5626:2020 só pede evitar bolsa de ar (6.6.2): sem inflexão, o ar sai pela ventilação. Para os " + f2(decl0 * 100) + " %, suba a caixa " + f2(subD) + " m.",
        [cx.id], { tipo: "ops", ops: [{ op: "instancia", id: cx.id, y: r4(cx.yb + subD) }], texto: "subir a caixa " + f2(subD) + " m (declividade de " + f2(decl0 * 100) + " %)" }); }

    /* ---------- 5) as OPS: o toco com o registro, a ventilação, o barrilete, as colunas */
    var ops = res.ops;
    /* N23: com a tomada vertical, o toco e a ventilação ficam na cota da saída e a descida liga no início do barrilete (yDe(iR)) */
    var yA = tomada ? cx.S.y : yDe(iR);
    var tS = T("saida", "agua_fria", dnSaida, S0, P3(A.x, yA, A.z), { aplicacao: "reservacao" });
    ops.push(tS);
    var gUp = BIC() && BIC().giroPara ? BIC().giroPara({ x: u.x, y: 0, z: u.z }, { x: 0, y: 1, z: 0 }) : 0;
    var rgS = { op: "acessorio", id: novoId("rg-saida"), famId: RG_FAM, tipoId: tipoRg, trecho: tS.id, novoId: tS.id + "b", x: r4(S0.x + u.x * GEO_BAR.tocoSaida / 2), y: r4((S0.y + yA) / 2), z: r4(S0.z + u.z * GEO_BAR.tocoSaida / 2), comprimento: Lr, bar: cx.id, barParte: "registro_saida" };
    if (gUp) rgS.giro = gUp;
    ops.push(rgS);
    if (tomada) ops.push(T("tomada", "agua_fria", dnSaida, P3(A.x, yA, A.z), P3(A.x, yDe(iR), A.z), { aplicacao: "reservacao" }));
    if (comVent) ops.push(T("ventilacao", "agua_fria", dnSaida, P3(A.x, yA, A.z), pV, { aplicacao: "reservacao", continua: "p2", saidaLivre: "ventilação do barrilete da caixa " + cx.id }));
    else aviso(nome + ": a ventilação do barrilete (Tigre p.72-73) esbarra em " + cV.com + " — lance à mão logo depois do registro de saída, subindo acima do nível máximo da caixa", [cx.id, cV.com]);
    var porNoBar = {};
    Pl.cadeias.forEach(function (cd) { var t = T("barrilete", "agua_fria", cd.dn, cd.p1, cd.p2, { aplicacao: "reservacao" }); ops.push(t); porNoBar[cd.fim] = t; });
    /* as colunas, com o registro no início (acima do apoio: no ático, à mão) */
    folhas.forEach(function (l) {
      var n = l.n, yT = yDe(n), p1 = l.p1, p2 = l.p2, rL = raio(l.dnCol);
      var tc = T("coluna", "agua_fria", l.dnCol, p1, p2, { aplicacao: "prumada", barEspera: l.trecho });
      ops.push(tc);
      res.ligadas++; res.esperasLigadas.push(l.trecho);
      /* a coluna que atravessa uma VIGA: o passante é do estrutural (o tubo não fura viga sem o projeto dele) */
      arr(obst.vigas).forEach(function (v) {
        if (v.topo < l.y || v.topo - v.altura > yT) return;
        if (segSeg({ x: l.x, y: 0, z: l.z }, { x: l.x, y: 0, z: l.z }, { x: v.p1.x, y: 0, z: v.p1.z }, { x: v.p2.x, y: 0, z: v.p2.z }) <= num(v.largura, 0) / 2 + rL) aviso(nome + ": a coluna " + tc.id + " atravessa a viga " + v.id + " — preveja o passante com o projeto estrutural (ou desloque a espera)", [tc.id, v.id]);
      });
      if (l.predio) return;   /* a espera do prédio já tem o registro da coluna (js/hidpredio.js) */
      var sup = suporte(Ap, l.L, l.L, rL, yT), yBaixo = sup > -Infinity ? sup + rL : l.y, uA = unit2(A.x - l.x, A.z - l.z) || { x: 1, z: 0 };
      var gV = BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: -1, z: 0 }, { x: uA.x, y: 0, z: uA.z }) : 0;
      var yc = r4(yT - mNo - Lr / 2);
      if (yc - Lr / 2 - TOL >= Math.max(yBaixo + folga, l.y + TOL)) {
        var rgc = { op: "acessorio", id: novoId("rg-coluna"), famId: RG_FAM, tipoId: tipoRg, trecho: tc.id, novoId: tc.id + "b", x: l.x, y: yc, z: l.z, comprimento: Lr, bar: cx.id, barParte: "registro_coluna" };
        if (gV) rgc.giro = gV;
        ops.push(rgc); return;
      }
      /* sem altura na coluna: no ramal do barrilete logo antes da descida (Tigre p.71) */
      /* ⚠ só no trecho que serve SÓ esta coluna (a folha sem ramo a jusante): no meio da linha o registro fecharia as outras */
      var tb = filhos(n).length ? null : porNoBar[n];
      if (tb && d3(tb.p1, tb.p2) >= Lr + 2 * TOL + mNo) {
        var ub = { x: (tb.p1.x - tb.p2.x) / d3(tb.p1, tb.p2), y: (tb.p1.y - tb.p2.y) / d3(tb.p1, tb.p2), z: (tb.p1.z - tb.p2.z) / d3(tb.p1, tb.p2) }, k = mNo + Lr / 2;
        var rgb = { op: "acessorio", id: novoId("rg-coluna"), famId: RG_FAM, tipoId: tipoRg, trecho: tb.id, novoId: tb.id + "b", x: r4(tb.p2.x + ub.x * k), y: r4(tb.p2.y + ub.y * k), z: r4(tb.p2.z + ub.z * k), comprimento: Lr, bar: cx.id, barParte: "registro_coluna" };
        var gH = BIC() && BIC().giroPara ? BIC().giroPara({ x: -ub.x, y: 0, z: -ub.z }, { x: 0, y: 1, z: 0 }) : 0; if (gH) rgb.giro = gH;
        porNoBar[n] = null;   /* o trecho já foi dividido por este registro */
        ops.push(rgb); return;
      }
      pend("bar.registro_coluna", nome + ": sem espaço para o registro no início da coluna da espera " + l.trecho + " (NBR 5626:2020 6.5.12.4 b) — ponha o registro à mão", [tc.id]);
    });
    if (!res.ligadas) return res;
    res.ok = true;
    /* a 2ª SAÍDA (coluna exclusiva da válvula de descarga) só tem o toco, o registro, a ventilação e a coluna dela: extravasor, limpeza,
       boia, respiro e o orçamento da caixa são da saída principal (que recebe o DN e o ângulo desta para o adaptador e o furo) */
    if (opc.secundaria) {
      res.dnSaida = dnSaida; res.novos = novos;
      res.decisoes.unshift({ id: "bar.saida2", texto: nome + ": saída DN " + dnSaida + " só para a(s) válvula(s) de descarga (" + res.ligadas + " coluna(s)), com registro de esfera e ventilação logo depois dele — a válvula pede DN grande e vazão alta de uma vez; na mesma saída do consumo ela engordava o barrilete inteiro (prática Tigre/Deca: coluna exclusiva da válvula). O consumo dos outros aparelhos sai pela saída principal." });
      return res;
    }

    /* ---------- 6) EXTRAVASOR e LIMPEZA (saídas livres) e a ALIMENTAÇÃO (boia) */
    var dnE = cx.E && num(cx.E.dn, 0) > 0 ? comercial(num(cx.E.dn, 0)) : dnPad;
    var dnX = dnE, dnL = dnE;   /* Tigre p.74: extravasor = DN da entrada; limpeza ≥ DN da entrada */
    var rE = raio(dnE), rX = raio(dnX), rL2 = raio(dnL);
    var sep = null, Nn = NN();
    if (Nn) { try { var lin = (Nn.linhas("af2020.separacao_atmosferica") || []).filter(function (x) { return x.d_max_mm === "*" || num(x.d_max_mm, -1) >= dnE; }).sort(function (a, b) { return (a.d_max_mm === "*" ? Infinity : a.d_max_mm) - (b.d_max_mm === "*" ? Infinity : b.d_max_mm); })[0];
      if (lin) sep = lin.s_min_mm != null ? num(lin.s_min_mm, 0) / 1000 : num(lin.s_fator_d, 0) * dnE / 1000; } catch (eS) { sep = null; } }
    var ue = cx.E ? unit2(cx.E.x - cx.c.x, cx.E.z - cx.c.z) : null;
    var bb = contornoObra(Ap), dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
    function longeDe(d, w) { return !w || d.x * w.x + d.z * w.z < Math.SQRT1_2; }
    function distFace(d) { if (!bb) return 0; return d.x > 0 ? bb.x1 - cx.c.x : (d.x < 0 ? cx.c.x - bb.x0 : (d.z > 0 ? bb.z1 - cx.c.z : cx.c.z - bb.z0)); }
    var u2 = opc.saida2 ? { x: u.x * Math.cos(opc.saida2.ang) + u.z * Math.sin(opc.saida2.ang), z: -u.x * Math.sin(opc.saida2.ang) + u.z * Math.cos(opc.saida2.ang) } : null;
    var cand = dirs.filter(function (d) { return longeDe(d, u) && longeDe(d, ue) && longeDe(d, u2); }).sort(function (d1, d2b) { return distFace(d1) - distFace(d2b); });
    if (!cand.length) cand = dirs.filter(function (d) { return longeDe(d, u); });
    /* o tubo nasce na FACE do volume da família (o corpo com a tampa): o furo e o adaptador ficam no corpo, o tubo não passa por dentro */
    var Rface = Math.max(cx.R, num(cx.av && cx.av.valores && cx.av.valores.Diametro, 0) / 2) + FOLGA_LIMITE * 3;   // hid:ok 3 mm além da face
    function saidaLivre(parte, y0s, r, dn, rotulo, decl1) {
      for (var ic = 0; ic < cand.length; ic++) {
        /* o tubo inteiro (com o raio) fora do volume: o critério de projetista (interferencia.louca) mede o tubo, não o eixo */
        var d = cand[ic], Rf = Rface + r, Pc = P3(cx.c.x + d.x * Rf, y0s, cx.c.z + d.z * Rf), Lh = Math.max(GEO_BAR.saidaLivre, distFace(d) - Rf + GEO_BAR.saidaLivre);
        var P1 = P3(Pc.x + d.x * Lh, y0s - decl1 * Lh, Pc.z + d.z * Lh), P2 = P3(P1.x, P1.y - GEO_BAR.quedaLivre, P1.z);
        if (conflito(Pc, P1, r, ignCaixa) || conflito(P1, P2, r, null)) continue;
        var t1 = T(parte, "agua_fria", dn, Pc, P1, { aplicacao: "reservacao", continua: "p1", saidaLivre: rotulo }), t2 = T(parte, "agua_fria", dn, P1, P2, { aplicacao: "reservacao", continua: "p2", saidaLivre: rotulo });
        novos.push({ a: Pc, b: P1, r: r, sistema: "agua_fria", id: t1.id }); novos.push({ a: P1, b: P2, r: r, sistema: "agua_fria", id: t2.id });
        return { t1: t1, t2: t2, d: d, fim: P2 };
      }
      return null;
    }
    var yX = cx.E && sep != null ? r4(cx.E.y - sep - rE - rX) : r4(cx.yb + cx.H * 0.8);   // hid:ok sem a entrada/a tabela: 80 % da altura (com a pendência abaixo)
    if (!cx.E || sep == null) pend("bar.extravasor_cota", nome + ": a cota do extravasor saiu de 80 % da altura (sem o ponto de entrada da família ou sem a Tabela 1 da separação atmosférica, NBR 5626:2020 6.15) — confira com o fabricante", [cx.id]);
    /* N23 (26/10/2026, referências Fortlev/Tigre do Rogério): o EXTRAVASOR (ladrão) sai pelo mesmo lado da limpeza, desce e entra num tê
       da linha da limpeza DEPOIS do registro dela — uma saída livre só, como se executa. Depois do registro: fechar a limpeza nunca
       bloqueia o ladrão. Sem lugar para o tê (limpeza curta, tubo no caminho): o extravasor sai sozinho, como antes. */
    var yL = r4(cx.yb + rL2 + APOIO), Lp = saidaLivre("limpeza", yL, rL2, dnL, "limpeza da caixa " + cx.id, 0);
    var kRegL = Lp ? Math.min(GEO_BAR.folgaCorpo + Lr / 2, d3(Lp.t1.p1, Lp.t1.p2) / 2) : 0;
    function ladraoNaLimpeza() {
      if (!Lp || Lp.d == null) return null;
      var d = Lp.d, kJ = kRegL + Lr / 2 + mNo + rX + GEO_BAR.folgaCorpo, Lt = d3(Lp.t1.p1, Lp.t1.p2);
      if (kJ > Lt - mNo - rL2) return null;
      var Q = P3(Lp.t1.p1.x + d.x * kJ, Lp.t1.p1.y, Lp.t1.p1.z + d.z * kJ), Rf = Rface + rX;
      var X0 = P3(cx.c.x + d.x * Rf, yX, cx.c.z + d.z * Rf), Lh = d2(X0, Q), X1 = P3(Q.x, r4(yX - decl * Lh), Q.z);
      if (X1.y - Q.y < mNo + rX + rL2 || Lh < mNo) return null;
      if (conflito(X0, X1, rX, ignCaixa) || conflito(X1, Q, rX, function (Tq) { return Tq.id === Lp.t1.id; })) return null;
      /* o tê: a linha da limpeza vira dois trechos no ponto Q (o registro fica no primeiro) */
      var p2v = Lp.t1.p2, t1b = T("limpeza", "agua_fria", dnL, Q, p2v, { aplicacao: "reservacao" });
      Lp.t1.p2 = Q; Lp.t1b = t1b;
      novos.forEach(function (nv) { if (nv.id === Lp.t1.id) nv.b = Q; });
      novos.push({ a: Q, b: p2v, r: rL2, sistema: "agua_fria", id: t1b.id });
      var x1 = T("extravasor", "agua_fria", dnX, X0, X1, { aplicacao: "reservacao", continua: "p1", saidaLivre: "extravasor da caixa " + cx.id + " (entra na limpeza)" }), x2 = T("extravasor", "agua_fria", dnX, X1, Q, { aplicacao: "reservacao" });
      novos.push({ a: X0, b: X1, r: rX, sistema: "agua_fria", id: x1.id }); novos.push({ a: X1, b: Q, r: rX, sistema: "agua_fria", id: x2.id });
      Lp.t2.saidaLivre = "limpeza e extravasor da caixa " + cx.id;
      return { t1: x1, t2: x2, d: d, fim: Lp.fim, junto: true };
    }
    var X = ladraoNaLimpeza() || saidaLivre("extravasor", yX, rX, dnX, "extravasor da caixa " + cx.id, decl);
    if (X) { ops.push(X.t1); ops.push(X.t2); }
    else pend("bar.extravasor", nome + ": o extravasor não acha saída livre para fora da edificação (tubo ou equipamento no caminho) — lance à mão (DN ≥ " + dnE + ", saída visível; Tigre p.74/79)", [cx.id]);
    if (Lp) {
      ops.push(Lp.t1); if (Lp.t1b) ops.push(Lp.t1b); ops.push(Lp.t2);
      var kL = kRegL, dL = Lp.d;   /* medido antes do tê do extravasor (a linha inteira da limpeza) */
      var rgL = { op: "acessorio", id: novoId("rg-limpeza"), famId: RG_FAM, tipoId: tipoRg, trecho: Lp.t1.id, novoId: Lp.t1.id + "b", x: r4(Lp.t1.p1.x + dL.x * kL), y: Lp.t1.p1.y, z: r4(Lp.t1.p1.z + dL.z * kL), comprimento: Lr, bar: cx.id, barParte: "registro_limpeza" };
      var gL = BIC() && BIC().giroPara ? BIC().giroPara({ x: dL.x, y: 0, z: dL.z }, { x: 0, y: 1, z: 0 }) : 0; if (gL) rgL.giro = gL;
      ops.push(rgL);
    } else pend("bar.limpeza", nome + ": a limpeza não acha saída livre (tubo ou equipamento no caminho junto da base) — lance à mão com registro perto da saída (NBR 5626:2020 6.5.9.1)", [cx.id]);
    if (X || Lp) pend("bar.descarga", nome + ": extravasor e limpeza terminam em saída LIVRE e VISÍVEL fora da edificação" + (X && X.junto ? " (o extravasor entra na linha da limpeza depois do registro dela)" : "") + (X && !X.junto ? " (extravasor em " + f2(X.fim.x) + "; " + f2(X.fim.y) + "; " + f2(X.fim.z) + ")" : "") + (Lp ? " (limpeza em " + f2(Lp.fim.x) + "; " + f2(Lp.fim.y) + "; " + f2(Lp.fim.z) + ")" : "") + " — o destino não está no modelo: confira a passagem pelo telhado/oitão e que a água caia à vista, nunca em calha, ralo, caixa de areia, condutor pluvial ou rede de esgoto (Tigre, Manual Técnico 2025, p.74 e p.79)",
      [X && !X.junto ? X.t2.id : null, Lp ? Lp.t2.id : null].filter(Boolean));
    /* ALIMENTAÇÃO: o toco da entrada (registro) e a espera do alimentador predial */
    var opsAl = [];
    if (cx.E) {
      var E0 = P3(cx.E.x, cx.E.y, cx.E.z), ve = ue || { x: -u.x, z: -u.z }, E1 = P3(E0.x + ve.x * GEO_BAR.tocoEntrada, E0.y, E0.z + ve.z * GEO_BAR.tocoEntrada);
      var supE = suporte(Ap, E1, E1, rE, E0.y), yE2 = r4(Math.max(E0.y - GEO_BAR.descidaEntrada, supE > -Infinity ? supE + rE + APOIO : -Infinity));
      var E2 = P3(E1.x, yE2, E1.z);
      if (!conflito(E1, E0, rE, ignCaixa) && (E1.y - E2.y < TOL || !conflito(E2, E1, rE, null))) {
        if (E1.y - E2.y >= TOL) { opsAl.push(T("alimentacao", "agua_fria", dnE, E2, E1, { aplicacao: "reservacao", continua: "p1", saidaLivre: "alimentação da caixa " + cx.id + " (o alimentador predial chega aqui)" })); }
        var tE = T("alimentacao", "agua_fria", dnE, E1, E0, { aplicacao: "reservacao" });
        if (E1.y - E2.y < TOL) { tE.continua = "p1"; tE.saidaLivre = "alimentação da caixa " + cx.id + " (o alimentador predial chega aqui)"; }
        opsAl.push(tE);
        var gE = BIC() && BIC().giroPara ? BIC().giroPara({ x: -ve.x, y: 0, z: -ve.z }, { x: 0, y: 1, z: 0 }) : 0;
        var rgE = { op: "acessorio", id: novoId("rg-alimentacao"), famId: RG_FAM, tipoId: tipoRg, trecho: tE.id, novoId: tE.id + "b", x: r4((E0.x + E1.x) / 2), y: E0.y, z: r4((E0.z + E1.z) / 2), comprimento: Lr, bar: cx.id, barParte: "registro_alimentacao" };
        if (gE) rgE.giro = gE;
        opsAl.push(rgE);
        opsAl.forEach(function (o) { ops.push(o); });
        var hidros = arr(estado.familias).filter(function (f) { return /hidrometro|cavalete/i.test(String(f.famId)); });
        pend("bar.alimentacao", nome + ": o alimentador predial " + (hidros.length ? "do " + hidros.map(function (f) { return f.id; }).join(", ") + " " : "") + "até a espera da boia (" + f2(E2.x) + "; " + f2(E2.y) + "; " + f2(E2.z) + ") não é traçado sozinho nesta versão — ligue o ramal predial/hidrômetro à espera; DN " + dnE + " a conferir pela reposição do consumo diário (NBR 5626:2020 6.7.2)", [opsAl[0].id, cx.id].concat(hidros.map(function (f) { return f.id; })));
      } else pend("bar.alimentacao", nome + ": a entrada (boia) esbarra em outro tubo ao sair — ligue o alimentador à mão", [cx.id]);
    } else pend("bar.alimentacao", nome + ": a família não tem o ponto de entrada (boia) — use a família hid-caixa-dagua do catálogo", [cx.id]);

    /* ---------- 7) BOILER alimentado pela caixa: o RESPIRO (manual do fabricante) */
    var HAQ = dep("HidAQTraco", "./hidaqtraco.js"), aqs = [];
    try { aqs = HAQ && HAQ.aquecedores ? HAQ.aquecedores(estado, avaliarFam) : []; } catch (eA) { aqs = []; }
    var nivelMax = X ? X.t1.p1.y + rX : cx.yt;   /* o transbordamento: a geratriz de cima do extravasor (sem ele, o topo da caixa) */
    aqs.forEach(function (Aq) {
      var hid = String(Aq.f.id); if (!(Aq.acumulacao || /boiler|acumula/.test(String(Aq.f.famId)))) return;
      if (!folhas.some(function (l) { return l.aq === hid; })) return;   /* o boiler não é desta caixa (ou a espera dele não ligou) */
      var sai = opsAch.filter(function (o) { return o && o.op === "trecho" && String(o.aq) === hid && o.sistema === "agua_quente" && (o.aqParte === "saida" || o.aqParte === "distribuicao"); });
      if (!sai.length) { pend("bar.respiro", "Respiro do " + Aq.nome + " " + hid + ": a água quente dele não está traçada — trace (Traçar automaticamente) e monte de novo", [hid]); return; }
      var topo = null; sai.forEach(function (o) { [o.p1, o.p2].forEach(function (p) { if (!topo || p.y > topo.p.y + EPS) topo = { p: p, o: o }; }); });
      var R0 = respiroDoCatalogo(Aq.valores ? { valores: Aq.valores } : avaliar(avaliarFam, Aq.f)), acima = R0.valor, fonteR = R0.valor != null ? "manual do " + (R0.fabricante || "fabricante") + " (catálogo): " + R0.texto : null;
      if (acima == null) { var Rr = respiroReserva(); if (Rr) { acima = Rr.valor; fonteR = "o manual do modelo não dá a altura: usada a do " + Rr.fabricante + " (" + Rr.texto + ") — conferir"; pend("bar.respiro_fonte", "Respiro do " + Aq.nome + " " + hid + ": a altura acima do nível máximo da caixa não está no manual do modelo — usada a de outro fabricante (" + Rr.fabricante + ", " + f2(Rr.valor) + " m): confira", [hid]); } }
      if (acima == null) { pend("bar.respiro", "Respiro do " + Aq.nome + " " + hid + ": sem a altura do manual do fabricante (nenhum catálogo traz) — lance à mão acima do nível máximo da caixa", [hid]); return; }
      var pR1 = P3(topo.p.x, topo.p.y, topo.p.z), pR2 = P3(topo.p.x, nivelMax + acima, topo.p.z), rR = raio(topo.o.dn);
      if (pR2.y <= pR1.y + mNo) { aviso("Respiro do " + Aq.nome + " " + hid + ": o ponto mais alto da água quente já está acima do nível máximo da caixa + " + f2(acima) + " m — o respiro não é necessário pela regra do manual", [hid]); return; }
      var cR = conflito(pR1, pR2, rR, function (Tq) { return Tq.id === String(topo.o.id); });
      /* N23 (26/10/2026): a subida esbarrou — tenta os OUTROS nós na mesma cota mais alta da água quente (o respiro sai de qualquer
         um deles; com a 2ª saída da válvula o barrilete principal pode passar por cima do primeiro) */
      if (cR) sai.forEach(function (o) { [o.p1, o.p2].forEach(function (p) { if (!cR || Math.abs(p.y - topo.p.y) > EPS || (Math.abs(p.x - pR1.x) < EPS && Math.abs(p.z - pR1.z) < EPS)) return;
        var q1 = P3(p.x, p.y, p.z), q2 = P3(p.x, pR2.y, p.z), c2 = conflito(q1, q2, raio(o.dn), function (Tq) { return Tq.id === String(o.id); });
        if (!c2) { cR = null; pR1 = q1; pR2 = q2; rR = raio(o.dn); topo = { p: p, o: o }; } }); });
      if (cR) { pend("bar.respiro", "Respiro do " + Aq.nome + " " + hid + ": a subida esbarra em " + cR.com + " — lance à mão do ponto mais alto da água quente até " + f2(pR2.y) + " m", [hid, cR.com]); return; }
      var tr = T("respiro", "agua_quente", topo.o.dn, pR1, pR2, { material: topo.o.material, aplicacao: "reservacao", continua: "p2", isolamento: true, saidaLivre: "respiro do " + Aq.nome + " " + hid });
      ops.push(tr); novos.push({ a: pR1, b: pR2, r: rR, sistema: "agua_quente", id: tr.id });
      res.respiros.push(hid);
      res.decisoes.push({ id: "bar.respiro", texto: "Respiro do " + Aq.nome + " " + hid + " (instalação de baixa pressão, alimentada pela caixa " + cx.id + "): do ponto mais alto da água quente (" + f2(pR1.y) + " m) subindo até " + f2(pR2.y) + " m = nível máximo da caixa (" + f2(nivelMax) + " m, o extravasor) + " + f2(acima) + " m — " + fonteR + ". A válvula de segurança na entrada de água fria é da família do aquecedor." });
    });

    /* ---------- 8) ORÇAMENTO da caixa (serviços da instância; os da pessoa ficam) */
    var orc = orcamentoCaixa(cx, { dnSaida: dnSaida, dnX: X ? dnX : null, dnL: Lp ? dnL : null, dnE: cx.E ? dnE : null, dnSaida2: opc.saida2 ? opc.saida2.dn : null });
    if (orc.op) ops.push(orc.op);
    /* N23: os ADAPTADORES COM FLANGE desenhados no DN real (js/hidlouca.js geoReservatorio; antes Ø 52 mm fixo): a instância da caixa
       guarda DN, ângulo (a partir da saída, no eixo da família) e cota de cada furo. Traçar de novo regrava tudo (o que sumiu volta a 0). */
    function angLocal(d) { if (!d) return 0; var a = Math.atan2(-d.z, d.x) - cx.rot; while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return r4(a); }
    ops.push({ op: "instancia", id: cx.id, inst: { Ad_entrada: cx.E ? dnE : 0, Ad_saida: dnSaida, Ad_saida2: opc.saida2 ? opc.saida2.dn : 0, Ang_saida2: opc.saida2 ? r4(opc.saida2.ang) : 0,
      Ad_extravasor: X ? dnX : 0, Ang_extravasor: X ? angLocal(X.d) : 0, Y_extravasor: X ? r4(X.t1.p1.y - cx.yb) : 0,
      Ad_limpeza: Lp ? dnL : 0, Ang_limpeza: Lp ? angLocal(Lp.d) : 0, Y_limpeza: Lp ? r4(Lp.t1.p1.y - cx.yb) : 0 }, bar: cx.id, barParte: "adaptadores" });
    orc.pendencias.forEach(function (p) { pend(p.chave, p.texto, [cx.id]); });

    var nCol = folhas.filter(function (l) { return res.esperasLigadas.indexOf(l.trecho) >= 0; }).length;
    res.decisoes.unshift({ id: "bar.barrilete", texto: nome + " (" + (cx.volume ? f2(cx.volume).replace(",00", "") + " L, " : "") + "base a " + f2(cx.yb) + " m): saída DN " + dnSaida + " com registro de gaveta (NBR 5626:2020 6.5.12.4 a) e ventilação do barrilete logo depois dele, subindo a " + f2(yVent) + " m (Tigre p.72-73); barrilete " + (B.MATERIAIS[matAF] || {}).nome + " no ático/sobre a laje, " + (tomada ? "descendo da saída (" + f2(cx.S.y) + " m) pela tomada vertical até " + f2(y0) + " m, apoiado (NBR 5626:2020 6.9.3: os 5 kPa valem em todo ponto da rede, fora a tomada vertical — " + f2(cx.S.y - y0) + " m de carga estática a mais no barrilete)," : "saindo a " + f2(y0) + " m") + " e descendo " + f2(decl * 100) + " % (R-C10, sem inflexão), em árvore (tê, nunca cruzeta); " + nCol + " coluna(s) descendo até as esperas, com registro no início de cada uma (6.5.12.4 b; Tigre p.71)" + (lista.some(function (l) { return l.predio; }) ? " — as colunas do prédio já têm o registro delas" : "") + ". Extravasor e limpeza DN " + dnE + " (≥ a entrada, Tigre p.74) com saída livre e visível; limpeza com registro junto da caixa (6.5.9.1); o extravasor a " + f2(yX) + " m, abaixo da entrada com a separação atmosférica" + (sep != null ? " de " + f2(sep * 1000).replace(",00", "") + " mm (Tabela 1, 6.15)" : "") + ". Alimentação pela boia com registro (6.5.8.2)." });
    res.barInfo = { id: cx.id, caixa: cx.id, colunas: nCol, esperas: res.esperasLigadas.slice(), predios: lista.filter(function (l) { return l.predio && res.esperasLigadas.indexOf(l.trecho) >= 0; }).map(function (l) { return l.predio; }), decisoes: res.decisoes.slice(), pendencias: res.pendencias.map(function (p) { return { chave: p.chave, motivo: p.texto }; }) };
    var o1 = ops.filter(function (o) { return o.op === "trecho"; })[0]; if (o1) o1.barInfo = res.barInfo;
    return res;
  }

  /* ================================================ ORÇAMENTO DA CAIXA: os serviços da instância (op "orcar")
     a caixa (a composição do TIPO, da ficha do fabricante), a torneira de boia, os adaptadores com flange (saída, extravasor,
     limpeza) e os furos da caixa (os quatro). Os serviços que a PESSOA pôs (rótulo sem o prefixo) ficam como estão. */
  function orcamentoCaixa(cx, d) {
    var out = { op: null, pendencias: [], itens: [] }, B = BI(), bit = ((B && B.BITOLA_REF) || {}).pvc_soldavel || {};
    var itens = [];
    function add(cod, rot, n) { var j = itens.filter(function (x) { return x.codigo === cod; })[0]; if (j) { j.fator += n; return; } itens.push({ codigo: cod, medida: "quantidade", fator: n, rotulo: PREFIXO_ORC + rot }); }
    var PC = HPC(), fc = PC && PC.familia ? PC.familia(cx.famId) : null, prod = fc ? arr((fc.comercial || {}).produtos).filter(function (p) { return p[0] === cx.tipoId; })[0] : null;
    if (prod && prod[PROD_SINAPI]) add(String(prod[PROD_SINAPI]), txt(prod[PROD_NOME]) || "caixa d'água", 1);   // hid:ok índice do código SINAPI na forma curta do produto
    else out.pendencias.push({ chave: "bar.orc_caixa", texto: "Caixa d'água " + cx.id + ": sem a composição SINAPI do tipo (família sem ficha do fabricante) — use a hid-caixa-dagua do catálogo ou escolha a composição em Propriedades › Orçamento" });
    function adaptador(dn, onde) { if (dn == null) return; var c = SINAPI_CAIXA.adaptador.cod[String(dn)]; if (c) add(c, "adaptador com flange DN " + dn + " (" + onde + ")", 1); else out.pendencias.push({ chave: "bar.orc_adaptador", texto: "Caixa d'água " + cx.id + ": adaptador com flange DN " + dn + " (" + onde + ") sem composição SINAPI conferida" }); }
    function furo(dn, onde) { if (dn == null) return; var ks = Object.keys(SINAPI_CAIXA.furo.cod).map(Number).sort(function (a, b) { return a - b; }).filter(function (k) { return k >= dn; }); if (ks.length) add(SINAPI_CAIXA.furo.cod[String(ks[0])], "furo Ø " + ks[0] + " mm na caixa (" + onde + ")", 1); else out.pendencias.push({ chave: "bar.orc_furo", texto: "Caixa d'água " + cx.id + ": furo para DN " + dn + " (" + onde + ") sem composição SINAPI" }); }
    adaptador(d.dnSaida, "saída"); adaptador(d.dnSaida2, "2ª saída, válvula de descarga"); adaptador(d.dnX, "extravasor"); adaptador(d.dnL, "limpeza");
    furo(d.dnSaida, "saída"); furo(d.dnSaida2, "2ª saída, válvula de descarga"); furo(d.dnX, "extravasor"); furo(d.dnL, "limpeza"); furo(d.dnE, "entrada da boia");
    if (d.dnE != null) { var bE = bit[String(d.dnE)], cb = bE ? SINAPI_CAIXA.boia.cod[bE] : null; if (cb) add(cb, "torneira de boia " + bE + "\"", 1); else out.pendencias.push({ chave: "bar.orc_boia", texto: "Caixa d'água " + cx.id + ": torneira de boia para DN " + d.dnE + " sem composição SINAPI conferida" }); }
    var deles = arr(cx.f && cx.f.servicos).filter(function (s) { return txt(s.rotulo).indexOf(PREFIXO_ORC) !== 0; });
    out.itens = itens;
    if (itens.length) out.op = { op: "orcar", id: cx.id, servicos: deles.map(function (s) { var o = { codigo: s.codigo, medida: s.medida, fator: s.fator }; if (s.rotulo) o.rotulo = s.rotulo; return o; }).concat(itens), bar: cx.id, barParte: "orcamento" };
    return out;
  }

  /* ================================================ PRESSÃO no ponto mais desfavorável (js/hidaf.js sobre a prévia) */
  function conferirPressao(e, opsBar, cx) {
    var AF = HAF(), K = HK(), BE = BEd(), B = BI(), Hh = HHi(), N = NN(); if (!AF || !K || !BE || !B || !cx || !N) return null;
    var todos = arr(e.ops).concat([{ op: "lote", id: "previa-barrilete", ops: opsBar }]), est = BE.aplicar(todos), estC = K.paraCalculo ? K.paraCalculo(est, todos) : est;
    var r = null;
    /* a entrada como a do dimensionamento (js/hidcalcui.js): a válvula e a torneira do kit são o PONTO do aparelho; trechos travados */
    var en = { modelo: { estado: estC, avaliarFam: e.avaliarFam }, alimentacao: { tipo: "reservatorio", conector: cx.id + ":saida" }, opcoes: {} };
    try { var fz = K.aparelhosForcados ? K.aparelhosForcados(todos) : {}; if (Object.keys(fz).length) en.aparelhos = fz; var tv = K.travados ? K.travados(todos) : []; if (tv.length) en.opcoes.travados = tv; } catch (eF) {}
    try { r = AF.calcular(en, N.contexto(), null); } catch (eP) { return { caixa: cx.id, erro: String(eP && eP.message || eP), achados: [{ chave: "bar.pressao", texto: "Caixa d'água " + cx.id + ": a conferência de pressão falhou (" + (eP && eP.message ? eP.message : eP) + ") — rode o dimensionamento", elementos: [cx.id] }] }; }
    var out = { caixa: cx.id, status: r.status, pontos: arr(r.pontos).map(function (p) { return { famInst: p.famInst, aparelho: p.aparelho, pdin: p.pressaoDinamica_kpa, pest: p.pressaoEstatica_kpa, pmin: p.pressaoMinima_kpa, ok: p.ok, status: p.status }; }), critico: r.pontoCritico, achados: [] };
    var rho = r.fluido && r.fluido.rho, mDe = function (kpa) { return Hh && Hh.kpaParaM ? Hh.kpaParaM(kpa, rho) : kpa / 9.80665; };   // hid:ok reserva: kPa → mca (g padrão), só sem o HidHidraulica
    var baixos = arr(r.pontos).filter(function (p) { return p.status === "reprovado" && num(p.pressaoDinamica_kpa, null) != null && num(p.pressaoMinima_kpa, null) != null && p.pressaoDinamica_kpa < p.pressaoMinima_kpa; });
    /* N23: a REDE também (barrilete, colunas, ramais): a NBR 5626:2020 6.9.3 pede a pressão dinâmica mínima em QUALQUER ponto dela (fora a
       tomada vertical, que só não pode ficar negativa). Antes só os pontos de utilização entravam aqui: o cartão não via o barrilete sem
       pressão e o Dimensionar reprovava depois. A rede entra como um "ponto" a mais, com o trecho do nó mais desfavorável */
    function vrf(re) { return arr(r.verificacoes).filter(function (v) { return re.test(String(v.nome)) && v.ok === false && num(v.valor, null) != null && num(v.limite, null) != null; })[0]; }
    var vRd = vrf(/pressão dinâmica mínima na rede/), vTm = vrf(/pressão na tomada vertical/);
    out.rede = vRd ? { alvo: String(vRd.alvo), pdin: num(vRd.valor, 0), pmin: num(vRd.limite, 0) } : null;
    out.tomada = vTm ? { alvo: String(vTm.alvo), pdin: num(vTm.valor, 0), pmin: num(vTm.limite, 0) } : null;
    [[vRd, "rede", "rede de distribuição, NBR 5626:2020 6.9.3"], [vTm, "tomada", "tomada vertical, não pode ser negativa"]].forEach(function (q) { if (q[0]) baixos.push({ famInst: String(q[0].alvo), aparelho: q[2], pressaoDinamica_kpa: num(q[0].valor, 0), pressaoMinima_kpa: num(q[0].limite, 0), rede: q[1] }); });
    if (baixos.length) {
      var falta = Math.max.apply(null, baixos.map(function (p) { return p.pressaoMinima_kpa - p.pressaoDinamica_kpa; })), pc = baixos.filter(function (p) { return p.pressaoMinima_kpa - p.pressaoDinamica_kpa === falta; })[0];
      var sub = Math.ceil((mDe(falta) + GEO_BAR.margemSubir) / GEO_BAR.passoSubir - EPS) * GEO_BAR.passoSubir;
      out.subir = r4(sub);
      /* a pressão DEPOIS: o barrilete refeito com a caixa elevada e a mesma conferência (NBR 5626) no ponto mais desfavorável */
      var depoisTxt = "";
      if (!e._semBase && HBA()) {
        try {
          var opsUp = arr(e.ops).concat([{ op: "lote", id: "previa-elevar", ops: [{ op: "instancia", id: cx.id, y: r4(cx.yb + sub) }] }]);
          var R2 = montar({ estado: BE.aplicar(opsUp), avaliarFam: e.avaliarFam, ops: opsUp, parametros: e.parametros, caixa: cx.id, pressao: true, oferta: false, _semBase: true });
          var P2 = arr(R2.pressao)[0], q2 = P2 ? (pc.rede ? (P2[pc.rede] || { pdin: pc.pressaoMinima_kpa, pmin: pc.pressaoMinima_kpa, semReprovacao: true }) : arr(P2.pontos).filter(function (x) { return x.famInst === pc.famInst; })[0]) : null;
          out.depois = q2 ? { famInst: pc.famInst, pdin: q2.pdin, pmin: q2.pmin, ok: q2.pdin >= q2.pmin - EPS } : null;
          if (q2 && q2.semReprovacao) depoisTxt = "na " + (pc.rede === "rede" ? "rede" : "tomada") + " (" + pc.famInst + ") nenhum nó fica abaixo do mínimo (ATENDE)";
          else if (q2) depoisTxt = "no " + pc.famInst + " a pressão dinâmica passa de " + f2(pc.pressaoDinamica_kpa) + " para " + f2(q2.pdin) + " kPa (mínimo " + f2(q2.pmin) + " kPa" + (q2.pdin >= q2.pmin - EPS ? ", ATENDE" : ", ainda não atende") + ")";
        } catch (eD) { depoisTxt = ""; }
      }
      out.achados.push({ chave: "bar.pressao_baixa", texto: "Pressão: a caixa " + cx.id + " está BAIXA para " + baixos.map(function (p) { return p.famInst + " (" + (p.aparelho || "ponto") + ": " + f2(p.pressaoDinamica_kpa) + " kPa < " + f2(p.pressaoMinima_kpa) + " kPa)"; }).slice(0, 4).join(", ") + " — NBR 5626:2020 6.9.2 / pressão do fabricante, com os DN do dimensionamento e o nível d'água na saída (o mais desfavorável). Suba a caixa " + f2(sub) + " m (base a " + f2(cx.yb + sub) + " m) ou ponha um pressurizador na saída (Instalações › Pressurização).",   // hid:ok até 4 pontos no texto
        elementos: [cx.id, pc.famInst], acao: { tipo: "ops", ops: [{ op: "instancia", id: cx.id, y: r4(cx.yb + sub) }], texto: "subir a caixa " + f2(sub) + " m" } });
      var bs = basesPara(e, cx, sub, "Pressão baixa no ponto mais desfavorável (" + pc.famInst + "):", depoisTxt);
      /* com as bases, a caixa NUNCA sobe no ar: o Corrigir do achado é a base de madeira; a metálica vem logo abaixo */
      var bsOk = bs.filter(function (b) { return b.acao; });
      if (bsOk.length) { var ach = out.achados[out.achados.length - 1]; ach.acao = bsOk[0].acao; ach.texto = ach.motivo = ach.texto + " Opções: elevar " + f2(sub) + " m sobre base de madeira ou metálica (abaixo)."; }
      bs.forEach(function (b) { out.achados.push(b); });
    }
    var vE = arr(r.verificacoes).filter(function (v) { return /pressão estática máxima/.test(String(v.nome)) && v.ok === false; })[0];
    if (vE) {
      var sobra = num(vE.valor, 0) - num(vE.limite, 0), desce = Math.ceil((mDe(sobra) + GEO_BAR.margemSubir) / GEO_BAR.passoSubir - EPS) * GEO_BAR.passoSubir;
      var folgaMin = arr(r.pontos).filter(function (p) { return num(p.pressaoDinamica_kpa, null) != null && num(p.pressaoMinima_kpa, null) != null; }).reduce(function (m, p) { return Math.min(m, p.pressaoDinamica_kpa - p.pressaoMinima_kpa); }, Infinity);
      var podeBaixar = folgaMin < Infinity && mDe(folgaMin) >= desce;
      out.achados.push({ chave: "bar.pressao_alta", texto: "Pressão: a estática passa do limite (" + f2(vE.valor) + " kPa > " + f2(vE.limite) + " kPa, NBR 5626:2020 6.9.5) — " + (podeBaixar ? "baixe a caixa " + f2(desce) + " m (a mínima ainda atende)" : "a caixa não pode baixar sem faltar pressão em cima: válvula redutora de pressão (VRP) no ramal dos pavimentos de baixo (o catálogo de acessórios ainda não tem a VRP: lance à mão)"),
        elementos: [cx.id].concat(arr(vE.alvo ? [vE.alvo] : [])), acao: podeBaixar ? { tipo: "ops", ops: [{ op: "instancia", id: cx.id, y: r4(cx.yb - desce) }], texto: "baixar a caixa " + f2(desce) + " m" } : null });
    }
    return out;
  }

  /* ================================================ N23: ELEVAR A CAIXA SOBRE UMA BASE DE APOIO (js/hidbaseapoio.js)
     ⚠ Antes o Corrigir da pressão baixa / da caixa baixa só mudava a cota da caixa: ela ficava no AR, sem nada embaixo, e nada ia ao
     orçamento. Agora as duas opções (madeira e metálica) vêm dimensionadas com o peso da caixa CHEIA, a base entra no modelo e no
     orçamento, e o texto diz o ganho de pressão (e a pressão depois, refeita pela NBR 5626 com a caixa elevada). */
  function ehBaseDe(id, cxId) { var b = "base-" + cxId; return String(id) === b || String(id).indexOf(b + "-") === 0; }
  function baseAtual(estado, cx) { var HB = HBA(); return arr(estado && estado.familias).filter(function (f) { return HB && f.famId === HB.FAM && ehBaseDe(f.id, cx.id); })[0] || null; }
  function basesPara(e, cx, dh, motivo, depois) {
    var HB = HBA(); if (!HB || e._semBase || !(dh > 0)) return [];
    var bA = baseAtual(e.estado, cx), apoio = bA ? num(bA.y, cx.yb) : cx.yb, total = r4((bA ? Math.max(0, cx.yb - apoio) : 0) + dh), nId = "base-" + cx.id + (bA ? "-" + (Number(String(bA.id).split("-").pop()) + 1 || 2) : "");   // hid:ok o 2º id da base
    var out = [];
    HB.opcoes({ caixa: cx, elevar: total, apoio: apoio, id: nId }).forEach(function (P) {
      if (!P || !P.ok) return;
      var mat = P.material === "metalica" ? "METÁLICA" : "DE MADEIRA";
      /* REVISÃO N23: a base que não fecha vai como pendência para o RT, SEM Corrigir (antes entrava no modelo e no orçamento) */
      if (!P.fecha) { out.push({ chave: "bar.base_" + P.material + "_nao_fecha", texto: motivo + " Base " + mat + " sob a caixa " + cx.id + ": " + P.status + " (" + P.verificacoes.filter(function (v) { return !v.ok; }).map(function (v) { return v.nome + " η = " + f2(v.eta); }).join("; ") + ") — a base é estrutura de projeto: o RT dimensiona.", elementos: [cx.id], base: P, acao: null }); return; }
      var ops = (bA ? [{ op: "apagar", id: String(bA.id) }] : []).concat(P.ops), dhP = r4(num(P.elevar, total) - (total - dh));
      var preco = P.precoRef ? " — R$ " + f2(P.precoRef.valor) + " (" + (P.precoRef.provisorio ? "PROVISÓRIO: " : "") + "SETOP-MG/kg)" : " — orçada pelas composições SINAPI " + P.servicos.map(function (x) { return x.codigo; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).join(", ");
      var ganho = " Ganho: +" + f2(HB._int.ganhoKpa(dhP)) + " kPa (" + f2(dhP) + " mca" + (dhP > dh + EPS ? ": a base pede subir " + f2(dhP) + " m, mais que os " + f2(dh) + " m da pressão" : "") + ")" + (depois ? " — " + depois : "") + ".";
      out.push({ chave: "bar.base_" + P.material, texto: motivo + " Base " + mat + " sob a caixa " + cx.id + ": " + f2(P.L) + " × " + f2(P.L) + " m, " + f2(total) + " m de altura (" + P.status + "); caixa cheia " + f2(P.cargas.caixa_kN) + " kN + estrutura " + f2(P.cargas.estrutura_kN) + " kN = " + f2(P.cargas.porPilar_kN) + " kN por pilar" + preco + "." + ganho,
        motivo: "", elementos: [cx.id], base: P, acao: { tipo: "ops", ops: ops, texto: "elevar a caixa " + f2(dhP) + " m sobre base " + (P.material === "metalica" ? "metálica" : "de madeira") } });
    });
    out.forEach(function (a) { a.motivo = a.texto; });
    return out;
  }

  /* ================================================ SEM CAIXA: a OFERTA (o Corrigir põe a caixa proposta) */
  function ofertar(e, ESP) {
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, K = HK(), F = HFm(), PG = HPG(), N = NN(), PC = HPC(), BE = BEd();
    var fam = F && F.porId ? F.porId("hid-caixa-dagua") : null;
    if (!fam || !PG || !N || !BE) return { pendencia: { chave: "bar.sem_caixa", texto: "Sem caixa d'água no modelo: as " + ESP.length + " espera(s) de água fria ficam abertas — ponha a caixa (biblioteca hid-caixa-dagua) e trace de novo", elementos: ESP.map(function (s) { return s.trecho; }), acao: null } };
    /* VOLUME: a reservação do programa (1 dia de consumo, NBR 5626:2020 6.5.6.2) */
    var prog = e.programa && e.programa.uso ? JSON.parse(JSON.stringify(e.programa)) : null, premissas = [];
    if (prog) premissas.push("pelo programa de necessidades (Instalações › cálculo: uso " + String(prog.uso).replace(/_/g, " ") + (prog.populacao != null ? ", " + prog.populacao + " pessoa(s)" : (prog.dormitorios != null ? ", " + prog.dormitorios + " dormitório(s)" : "")) + " — confira o porte)");
    if (!prog) {
      var dorms = arr(estado.ambientes).filter(function (a) { return /dormit|quarto|su[ií]te/i.test(txt(a && a.nome)); }).length;
      var nChu = arr(estado.familias).filter(function (f) { return K.tipoDaFamilia && /^chuveiro/.test(String(K.tipoDaFamilia(f.famId, f.tipoId) || "")); }).length;
      if (!dorms) { dorms = 2 * Math.max(1, nChu); premissas.push("sem o programa e sem dormitório no modelo: " + dorms + " dormitório(s) = 2 por banheiro (" + Math.max(1, nChu) + " chuveiro(s)) — premissa CONSERVADORA do motor, sem fonte: informe o programa de necessidades (uso e dormitórios) para o volume certo"); }   // hid:ok 2 dormitórios por banheiro: premissa declarada
      else premissas.push("dormitórios contados pelos ambientes do modelo: " + dorms);
      prog = { uso: "residencial_unifamiliar", dormitorios: dorms };
      premissas.push("uso residencial unifamiliar (premissa: informe o uso no programa)");
    }
    var ctx = N.contexto(), Pr = PG.calcular(prog, ctx), V = Pr && Pr.reservacao ? Pr.reservacao.total_min_L : null;
    if (V == null) return { pendencia: { chave: "bar.sem_caixa", texto: "Sem caixa d'água no modelo e sem a reservação do programa (" + arr(Pr && Pr.reservacao && Pr.reservacao.passos).join("; ") + ") — ponha a caixa e trace de novo", elementos: ESP.map(function (s) { return s.trecho; }), acao: null } };
    /* o menor tipo comercial do catálogo que atende */
    var tipos = arr(fam.tipos).map(function (t) { var av = avaliarFam ? avaliarFam("hid-caixa-dagua", t.id, {}) : null; return { t: t, v: av && av.valores ? num(av.valores.Volume_L, null) : null, av: av }; }).filter(function (x) { return x.v != null; }).sort(function (a, b) { return a.v - b.v; });
    var esc = tipos.filter(function (x) { return x.v >= V - EPS; })[0];
    if (!esc) return { pendencia: { chave: "bar.sem_caixa", texto: "Sem caixa d'água no modelo: a reservação de " + f2(V) + " L passa da maior caixa do catálogo — use mais de uma caixa ou reservatório (tanque)", elementos: ESP.map(function (s) { return s.trecho; }), acao: null } };
    var fc = PC && PC.familia ? PC.familia("hid-caixa-dagua") : null, prod = fc ? arr((fc.comercial || {}).produtos).filter(function (p) { return p[0] === esc.t.id; })[0] : null;
    var sin = prod && prod[PROD_SINAPI] && PC.sinapi ? PC.sinapi(prod[PROD_SINAPI]) : null;   // hid:ok índice do código SINAPI na forma curta do produto
    /* POSIÇÃO: o ambiente molhado (com aparelho) mais perto do centro das esperas; "área técnica" vence */
    var cg = { x: 0, z: 0 }; ESP.forEach(function (s) { cg.x += s.x / ESP.length; cg.z += s.z / ESP.length; });
    var H = HR(), obst = H.obstaculosDoBim(estado, null), ambs = arr(obst.ambientes);
    function centro(a) { var c = { x: 0, z: 0 }; a.contorno.forEach(function (q) { c.x += q.x / a.contorno.length; c.z += q.z / a.contorno.length; }); return c; }
    function dentro(p, pol) { var c = false; for (var i = 0, j = pol.length - 1; i < pol.length; j = i++) { var a = pol[i], b = pol[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
    var molhados = ambs.filter(function (a) { return arr(estado.familias).some(function (f) { return K.tipoDaFamilia && K.tipoDaFamilia(f.famId, f.tipoId) && dentro({ x: num(f.x, 0), z: num(f.z, 0) }, a.contorno); }); });
    var tecnicos = ambs.filter(function (a) { return /t[eé]cnic|reservat|caixa d/i.test(txt(a.nome)); });
    var alvo = null, regra;
    if (tecnicos.length) { alvo = tecnicos.sort(function (a, b) { return d2(centro(a), cg) - d2(centro(b), cg); })[0]; regra = "sobre a área técnica " + alvo.nome; }
    else if (molhados.length) { alvo = molhados.sort(function (a, b) { return d2(centro(a), cg) - d2(centro(b), cg); })[0]; regra = "sobre o ambiente molhado " + alvo.nome + " — o mais perto do centro das esperas de água fria (o barrilete mais curto)"; }
    else regra = "sobre o centro das esperas de água fria (o barrilete mais curto; sem ambiente delimitado no modelo)";
    var pos = alvo ? centro(alvo) : cg;
    /* a SAÍDA virada para o centro das esperas (o local +x da família é a saída) */
    var ux = cg.x - pos.x, uz = cg.z - pos.z, rot = Math.abs(ux) + Math.abs(uz) > EPS ? Math.atan2(-uz, ux) : 0;
    /* ALTURA: apoiada no que estiver embaixo (laje/forro, topo das paredes), subindo o que o barrilete e a pressão pedirem */
    var Ap = apoios(estado), R0 = num(esc.av.valores.Diametro, 0) / 2, sup = suporte(Ap, { x: pos.x - R0, z: pos.z }, { x: pos.x + R0, z: pos.z }, R0, Infinity, true);   /* N23: a CAIXA apoia em tudo o que está embaixo dela (a platibanda/terça pulada vale só para o tubo do barrilete) */
    var yTopEsp = Math.max.apply(null, ESP.map(function (s) { return s.y; }));
    var yb = r4(sup > -Infinity ? sup : yTopEsp), id = "caixa1", nId = 1;
    while (arr(estado.familias).some(function (f) { return String(f.id) === id; })) { nId++; id = "caixa" + nId; }
    var opF = { op: "familia", id: id, famId: "hid-caixa-dagua", tipoId: esc.t.id, x: r4(pos.x), y: yb, z: r4(pos.z), rotY: r4(rot), inst: {} };
    var subiu = 0;
    for (var it = 0; it < GEO_BAR.iteracoesOferta; it++) {
      var todos = arr(e.ops).concat([{ op: "lote", id: "previa-oferta", ops: [opF] }]), est1 = BE.aplicar(todos);
      var R = montar({ estado: est1, avaliarFam: avaliarFam, ops: todos, parametros: e.parametros, caixa: id, pressao: true, oferta: false });
      var cxR = R.caixas.filter(function (c) { return c.id === id; })[0], d = 0;
      if (cxR && cxR.subir) d = cxR.subir;
      else if (R.pressao.length && R.pressao[0].subir) d = R.pressao[0].subir;
      if (!d) break;
      opF.y = r4(opF.y + d); subiu = r4(subiu + d);
    }
    var nomeT = prod ? txt(prod[PROD_NOME]) : esc.t.nome;
    var preco = sin ? " — SINAPI " + prod[PROD_SINAPI] + ": R$ " + f2(sin.preco) + " (" + txt(sin.data) + ", fornecimento e instalação)" : " — sem preço SINAPI na ficha (pendência)";
    var texto = "Sem caixa d'água no modelo: proponho a " + nomeT + preco + ", " + regra + ", com a saída virada para as esperas; base a " + f2(opF.y) + " m" + (subiu ? " (" + f2(subiu) + " m acima do apoio: a altura para o barrilete descer até as esperas e a pressão mínima no ponto mais desfavorável — apoio/estrado a confirmar com o estrutural)" : " (apoiada na laje/forro)") +
      ". Volume: reservação mínima de " + f2(V) + " L = " + arr(Pr.consumoDiario && Pr.consumoDiario.passos).join("; ") + " × 1 dia (NBR 5626:2020 6.5.6.2)" + (premissas.length ? "; " + premissas.join("; ") : "") + ". O Corrigir põe a caixa; o Traçar monta o barrilete.";
    return { aviso: { texto: texto, elementos: ESP.map(function (s) { return s.trecho; }).concat(alvo ? [String(alvo.id)] : []), acao: { tipo: "ops", ops: [opF], texto: "pôr a caixa d'água de " + f2(esc.v).replace(",00", "") + " L" } },
             acao: true, op: opF, volume: V, tipo: esc.t.id, nomeTipo: nomeT, capacidade: esc.v, sinapi: sin ? { codigo: prod[PROD_SINAPI], preco: sin.preco, data: sin.data } : null, regra: regra, premissas: premissas, subiu: subiu, ambiente: alvo ? String(alvo.id) : null };
  }

  var HidBarrilete = { VERSAO: 1, GEO_BAR: GEO_BAR, SINAPI_CAIXA: SINAPI_CAIXA, RESERVATORIOS: RESERVATORIOS, PREFIXO_ORC: PREFIXO_ORC,
    montar: montar, caixas: caixas, esperas: esperas, anteriores: anteriores, ofertar: ofertar, conferirPressao: conferirPressao, orcamentoCaixa: orcamentoCaixa,
    _int: { suporte: suporte, apoios: apoios, respiroDoCatalogo: respiroDoCatalogo, respiroReserva: respiroReserva } };
  global.HidBarrilete = HidBarrilete;
  if (typeof module !== "undefined" && module.exports) module.exports = HidBarrilete;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
