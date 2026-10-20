/* =====================================================================
 * hidrota.js — TRAÇADO INTELIGENTE do hidrossanitário, v1 (fase 1b do
 * docs/hidro/PLANO-HIDROSSANITARIO.md). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério (16/10/2026): "tubos parametrizados onde vai ser possível,
 * através de parâmetros, criar traçados inteligentes considerando o melhor
 * fluxo para aquele caso" — a pessoa dá poucos dados, o sistema entende o
 * cenário e devolve a melhor solução, aplicável com um clique.
 *
 *   HidRota.propor(entrada) → { opcoes: [ {estrategia, nome, ops, comprimento,
 *        conexoes, custo, custoRelativo, justificativa[], avisos[], pendencias[]} ],
 *        pendencias[], descartadas[] }
 *
 * As OPÇÕES são ESTRATÉGIAS diferentes (parede × piso × forro), não variações
 * piores da mesma: cada uma é o melhor traçado que aquela estratégia permite.
 * Ordenadas pelo custo (a 1ª nunca é mais cara que as outras). Estratégia que
 * não cabe (enchimento baixo demais para a declividade, viga no caminho,
 * ponto sem rota) NÃO vira opção: vai a `descartadas` com o motivo e o número.
 *
 * COMO TRAÇA (v1 = ambiente molhado → shaft):
 *  1. grade ortogonal em planta (passo + as coordenadas exatas dos pontos) e
 *     A* com custo = comprimento + conexão (curva/tê) + travessia de parede/
 *     laje; porta/abertura, pilar, peça e viga são PROIBIDOS (viga só vira
 *     penalidade com parametros.atravessarViga — furo em viga é decisão do
 *     estrutural, não do traçado). A cota vem depois, da declividade.
 *  2. ESGOTO em árvore: bacia direto ao TQ/ramal; caixa/ralo sifonado no
 *     ramal; lavatório, chuveiro, bidê, ralo seco NA CAIXA SIFONADA; o resto
 *     (pia, tanque…) no ramal. No horizontal, toda curva de 90° vira dois
 *     desvios de 45° e toda junção entra a 45° no sentido do escoamento — o
 *     biminst avisa joelho de 90° no horizontal (NBR 8160). Cotas do TQ para
 *     cima com a declividade mínima de cada DN = a MAIOR entre a tabela
 *     (HidNormas es.declividade_minima) e a regra do modelador
 *     (BimInst.inclinacaoMinima) — o traço nunca nasce com aviso.
 *     COTA DE CONTROLE (19/10/2026): quando o destino é uma caixa de inspeção (destino.entradaMax), a entrada dela manda na
 *     profundidade — a raiz parte dali e a rede sobe com a declividade; o aparelho desce logo na saída e o horizontal chega na
 *     caixa em linha reta, sem degrau (tools/test-hid-esgoto-cota.js). Degrau curto entre duas retas vira diagonal de 45°.
 *  3. VENTILAÇÃO: desconector mais longe do ponto ventilado que a distância
 *     da tabela (es.ventilacao.distancia_maxima) ganha um ramal de ventilação
 *     que sai do ramal dele, sobe e corre até a coluna.
 *  4. ÁGUA FRIA em árvore a partir da coluna/ponto, na cota da estratégia,
 *     descendo/subindo a cada ponto; registro de gaveta no início do ramal de
 *     cada ambiente; afastamento do esgoto (gate do nó + conferência 3D).
 *
 * ⚠ NENHUM valor de norma aqui (tools/test-hid-sem-numero-magico.js): DN
 *   mínimo, UHC, declividade e distância de ventilação vêm do HidNormas; os
 *   números deste arquivo são GEOMETRIA e PESOS da busca (marcados hid:ok),
 *   todos trocáveis em entrada.parametros e declarados na justificativa.
 * ⚠ Faltou tabela → pendência com a chave; o traço segue só onde há regra do
 *   próprio modelador (declividade do biminst) e diz isso no texto.
 * ⚠ As ops geradas são as do biminst (trecho / acessorio): o teste prova que
 *   o biminst aceita todas e que a verificação dele não acusa inclinação,
 *   joelho de 90° no horizontal nem sistemas misturados.
 *
 * Formato da entrada: docs no fim do arquivo (ENTRADA) e no
 * tools/test-hid-rota.js (cenários completos).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  /* CRITÉRIO DE PROJETISTA (18/10/2026, js/hidcriterios.js): as zonas de porta/janela (vão + verga + contraverga) e o
     AUDITOR que roda sobre cada estratégia — o que ele chama de PROIBIDO descarta a estratégia; o resto vira custo */
  function HC() { return dep("HidCriterios", "./hidcriterios.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  var EPS = 1e-6;              // hid:ok tolerância numérica
  var CASAS = 10000;           // hid:ok o biminst grava as cotas com 4 casas (0,1 mm)
  var INF = Infinity;
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  /* arredondar a cota de MONTANTE para cima (e a raiz para baixo) mantém a
     declividade ≥ a mínima depois das 4 casas — arredondar ao mais próximo
     tirava até 0,1% num trecho de 10 cm e o biminst acusava "abaixo da mínima" */
  function teto4(v) { return Math.ceil(v * CASAS - EPS) / CASAS; }
  function chao4(v) { return Math.floor(v * CASAS + EPS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  /* raio do tubo em metros a partir do DN em mm */
  function raio(dn) { return dn / 1000 / 2; }
  /* ⚠ "PROBLEMA SEMPRE COM SOLUÇÃO" (regra do produto, 15/10/2026): todo aviso, pendência e
     descarte leva o texto, ONDE (ids do modelo ou pontos {x,y,z}) e, quando existe, a AÇÃO que
     resolve — a tela liga "Mostrar no 3D" e "Corrigir" sem interpretar o texto */
  function prob(texto, elementos, acao) { var o = { texto: texto, elementos: arr(elementos).filter(function (e) { return e != null; }) }; if (acao) o.acao = acao; return o; }
  function falha(texto, elementos, acao) { var o = prob(texto, elementos, acao); o.erro = texto; return o; }
  /* aviso da COTA PELO FLUXO (a partida mais funda que o cobrimento mínimo; a queda antes da caixa): marcado para o
     js/hidambiente.js repassar ao usuário — os avisos do traçado não chegam ao Traçar automaticamente (revisão frente A, 20/10/2026) */
  function probFluxo(texto, elementos, acao) { var o = prob(texto, elementos, acao); o.chave = "rota.cota_fluxo"; return o; }
  function pend(chave, motivo, elementos, acao) { var o = prob(motivo, elementos, acao); o.chave = chave; o.motivo = motivo; return o; }
  var pend0 = pend;   /* o propor tem um "pend" local (a lista); este é o construtor */
  /* coordenada no TEXTO sempre no mundo: a busca roda em coordenadas locais (ver propor) */
  var ORIG = { x: 0, z: 0 };
  function fxz(x, z) { return "(" + f2(x + ORIG.x) + "; " + f2(z + ORIG.z) + ")"; }
  function pt3(x, y, z) { return { x: r4(x), y: y == null ? null : r4(y), z: r4(z) }; }
  function cmAcima(v) { return Math.ceil(v * 100 - EPS) / 100; }
  function fcm(v) { return String(Math.round(v * 100)); }

  /* ⚠ GEOMETRIA E PRÁTICA (não é norma). Cada um pode vir em
     entrada.parametros; o que não veio é listado na justificativa como
     "assumido" — recado que mente é pior que recado nenhum. */
  var GEO = {
    passo: 0.05,               // hid:ok grade da busca (m)
    margem: 0.6,               // hid:ok área de busca além dos pontos (m)
    chanfro: 0.15,             // hid:ok perna do desvio de 45° do esgoto (m)
    margemNo: 0.08,            // hid:ok distância mínima entre nós (folgada sobre os 2 cm do biminst)
    quedaMin: 0.05,            // hid:ok descida mínima do ponto do aparelho até o ramal (m)
    folga: 0.03,               // hid:ok folga do tubo até obstáculo e entre tubos do mesmo sistema (m)
    cobrimento: 0.02,          // hid:ok argamassa sobre o tubo / acima do forro (m)
    alturaEnchimento: 0.30,    // hid:ok enchimento do piso do ambiente molhado (m)
    alturaRamalAF: 1.20,       // hid:ok ramal de água fria na parede, acima do piso (m)
    peDireito: 2.50,           // hid:ok do piso ao forro do ambiente (m)
    alturaPlenoInferior: 0.40, // hid:ok da laje ao forro do pavimento de baixo (m)
    alturaVentForro: 0.25,     // hid:ok ramal de ventilação acima do forro do ambiente (m)
    espacamentoEntradas: 0.10, // hid:ok entre duas entradas no mesmo TQ/coluna (m)
    afastamento: 0.10,         // hid:ok água fria × esgoto/ventilação, livre (m)
    distanciaRegistro: 0.20,   // hid:ok do início do ramal ao registro (m)
    tolFace: 0.05,             // hid:ok ponto do aparelho até a face da parede (m)
    raioTerminal: 0.30,        // hid:ok em volta da coluna/TQ (dentro do shaft) a busca é livre (m)
    recuoCaixaGordura: 0.50,   // hid:ok caixa de gordura PROPOSTA: da face externa da obra até a borda da caixa (m)
    embutir: 0.05,             // hid:ok eixo do tubo EMBUTIDO atrás da face da parede, no ponto de parede do aparelho (m)
    maxEstados: 400000         // hid:ok guarda da busca
  };
  /* pesos da busca em METROS EQUIVALENTES: uma conexão "vale" meio metro de
     tubo, furar parede um metro, laje um metro e meio. Heurística de projeto
     (não de norma), trocável em parametros.pesos. */
  var PESOS = { conexao: 0.5, parede: 1.0, laje: 1.5, viga: 5.0, proximidade: 0.3, interferencia: 2.0, criterio: 1.0 };   // hid:ok

  var ESTRATEGIAS = {
    parede: { nome: "Embutido na parede", af: "parede", es: "enchimento",
              texto: "água fria embutida na parede na altura do ramal, descendo a cada ponto; esgoto no enchimento do piso" },
    piso:   { nome: "Pelo piso (enchimento)", af: "enchimento", es: "enchimento",
              texto: "água fria e esgoto no enchimento do piso; a água sobe a cada ponto" },
    forro:  { nome: "Pelo forro", af: "forro", es: "forroInferior",
              texto: "água fria no forro do ambiente, descendo a cada ponto; esgoto sob a laje, no forro do pavimento de baixo" }
  };
  var ORDEM = ["parede", "piso", "forro"];

  /* quem vai para onde no esgoto (regra qualitativa — NBR 8160, sem número) */
  var BACIA = { bacia_caixa_acoplada: 1, bacia_valvula: 1 };
  var RECEPTOR = { caixa_sifonada: 1, ralo_sifonado: 1 };
  /* ⚠ máquina de lavar não tem sifão: sem desconector o gás do esgoto volta pela mangueira (NBR 8160 —
     todo aparelho do esgoto primário tem desconector). Vai à caixa sifonada; sem caixa, pendência inserirPeca */
  var PARA_CAIXA = { lavatorio: 1, chuveiro: 1, chuveiro_eletrico: 1, bide: 1, banheira: 1, ralo_seco: 1, maquina_lavar_roupa: 1, maquina_lavar_louca: 1 };   // rota:paraCaixa
  /* ⚠ DECISÃO DO RT (17/10/2026): a pia de cozinha SEMPRE vai à caixa de gordura — nunca ao ramal
     do banheiro nem ao TQ de esgoto (a revisão achou a pia no ramal da bacia sem aviso). Tanque e
     máquina de louça entram quando o projeto pedir (parametros.paraCaixaGordura). */
  var PARA_GORDURA = ["pia_cozinha"];
  var FAM_GORDURA = "hid-caixa-gordura";
  var SIFAO_PROPRIO = { bacia_caixa_acoplada: 1, bacia_valvula: 1, lavatorio: 1, pia_cozinha: 1, tanque: 1, mictorio: 1, bide: 1 };
  var REGISTRO_FAM = "ra-registro-gaveta";

  /* =============================================== GEOMETRIA 2D (planta x,z) */
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function un2(a, b) { var L = d2(a, b) || 1; return { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; }
  function ptSeg2(p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var q = { x: a.x + dx * t, z: a.z + dz * t };
    return { d: d2(p, q), t: t };
  }
  function cruza2(a, b, c, d) {
    function o(p, q, r) { var v = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); return Math.abs(v) < EPS ? 0 : (v > 0 ? 1 : -1); }
    var o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  function segSeg2(a, b, c, d) {
    if (cruza2(a, b, c, d)) return 0;
    return Math.min(ptSeg2(a, c, d).d, ptSeg2(b, c, d).d, ptSeg2(c, a, b).d, ptSeg2(d, a, b).d);
  }
  /* distância 3D entre segmentos (pontos mais próximos, forma fechada) */
  function segSeg3(p1, q1, p2, q2) {
    function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
    function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    var d1 = sub(q1, p1), dd = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(dd, dd), f = dot(dd, r), s, t;
    if (a <= EPS && e <= EPS) return d3(p1, p2);
    if (a <= EPS) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else {
      var c = dot(d1, r);
      if (e <= EPS) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else {
        var b = dot(d1, dd), den = a * e - b * b;
        s = den > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
        else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }
    var c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s }, c2 = { x: p2.x + dd.x * t, y: p2.y + dd.y * t, z: p2.z + dd.z * t };
    return d3(c1, c2);
  }

  /* retângulo orientado em planta: centro, eixo u (comprimento), meia largura/comprimento */
  function retSeg(p1, p2, largura) {
    if (!p1 || !p2) return null;
    var a = { x: num(p1.x, NaN), z: num(p1.z, NaN) }, b = { x: num(p2.x, NaN), z: num(p2.z, NaN) };
    if (!isFinite(a.x) || !isFinite(a.z) || !isFinite(b.x) || !isFinite(b.z)) return null;
    var L = d2(a, b); if (!(L > EPS) || !(largura > 0)) return null;
    var u = un2(a, b);
    return { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, ux: u.x, uz: u.z, hl: L / 2, hw: largura / 2, p1: a, p2: b };
  }
  function retCentro(x, z, comp, larg, rotY) {
    var c = Math.cos(num(rotY, 0)), s = Math.sin(num(rotY, 0));
    return { cx: x, cz: z, ux: c, uz: -s, hl: comp / 2, hw: larg / 2 };
  }
  function local(o, x, z) { var dx = x - o.cx, dz = z - o.cz; return { u: dx * o.ux + dz * o.uz, v: -dx * o.uz + dz * o.ux }; }
  function dentro(o, x, z, inf) { var p = local(o, x, z); return Math.abs(p.u) <= o.hl + inf + EPS && Math.abs(p.v) <= o.hw + inf + EPS; }
  /* o segmento a-b entra no retângulo (inflado) com comprimento positivo? (Liang–Barsky) */
  function corta(o, a, b, inf) {
    var p = local(o, a.x, a.z), q = local(o, b.x, b.z), du = q.u - p.u, dv = q.v - p.v, H = o.hl + inf, W = o.hw + inf, t0 = 0, t1 = 1;
    function clip(pp, qq) {
      if (Math.abs(pp) < EPS) return qq >= -EPS;
      var r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    }
    if (!clip(-du, p.u + H) || !clip(du, H - p.u) || !clip(-dv, p.v + W) || !clip(dv, W - p.v)) return false;
    return t1 - t0 > EPS;
  }
  function faixaCruza(y0, y1, b0, b1) { return y0 < b1 - EPS && y1 > b0 + EPS; }

  /* ================================================== PARÂMETROS / ENTRADA */
  function parametros(e) {
    var src = (e && e.parametros) || {}, p = { assumidos: [] };
    Object.keys(GEO).forEach(function (k) {
      p[k] = num(src[k], GEO[k]);
      if (src[k] == null && k !== "maxEstados" && k !== "margem") p.assumidos.push(k);
    });
    p.pesos = {}; Object.keys(PESOS).forEach(function (k) { p.pesos[k] = num((src.pesos || {})[k], PESOS[k]); });
    p.estrategias = arr(src.estrategias).filter(function (s) { return ESTRATEGIAS[s]; });
    if (!p.estrategias.length) p.estrategias = ORDEM.slice();
    p.terreo = !!src.terreo;
    p.atravessarViga = !!src.atravessarViga;
    p.dn = src.dn || {};
    p.declividade = num(src.declividade, 0);
    p.prefixo = txt(src.prefixo) || "hr-";
    p.cotaForroInferior = num(src.cotaForroInferior, null);
    p.cotaVentilacao = num(src.cotaVentilacao, null);
    p.criterios = src;   /* os parâmetros do auditor (js/hidcriterios.js, mesmos nomes: folgaVao, transpasseVerga…) */
    p.paraCaixaGordura = arr(src.paraCaixaGordura).length ? arr(src.paraCaixaGordura).map(String) : PARA_GORDURA.slice();
    p.areaTecnica = src.areaTecnica && isFinite(num(src.areaTecnica.x, NaN)) && isFinite(num(src.areaTecnica.z, NaN)) ? { x: r4(num(src.areaTecnica.x, 0)), z: r4(num(src.areaTecnica.z, 0)) } : null;
    var B = BI(), mat = src.material || (e && e.material) || {};
    p.material = {};
    ["esgoto", "agua_fria", "ventilacao"].forEach(function (s) {
      var S = B.SISTEMAS[s]; p.material[s] = S.materiais.indexOf(mat[s]) >= 0 ? mat[s] : S.material;
    });
    return p;
  }
  var ROTULO_GEO = {
    passo: "grade da busca", chanfro: "perna do desvio de 45°", margemNo: "distância mínima entre nós", quedaMin: "descida mínima do ponto ao ramal",
    folga: "folga a obstáculos", cobrimento: "cobrimento do tubo", alturaEnchimento: "altura do enchimento", alturaRamalAF: "altura do ramal de água na parede",
    peDireito: "pé-direito", alturaPlenoInferior: "pleno do forro de baixo", alturaVentForro: "ventilação acima do forro",
    espacamentoEntradas: "espaçamento entre entradas no TQ/coluna", afastamento: "afastamento água × esgoto", distanciaRegistro: "posição do registro",
    tolFace: "tolerância ponto × face da parede", raioTerminal: "raio livre em volta da coluna/TQ", recuoCaixaGordura: "recuo da caixa de gordura proposta",
    embutir: "tubo embutido atrás da face (ponto de parede)"
  };

  function ponto3(p) { return p && isFinite(num(p.x, NaN)) && isFinite(num(p.y, NaN)) && isFinite(num(p.z, NaN)) ? { x: r4(num(p.x, 0)), y: r4(num(p.y, 0)), z: r4(num(p.z, 0)) } : null; }

  function normEntrada(e, P, pend) {
    var B = BI(), out = { aparelhos: [], pecas: [], grupos: [], destinos: e.destinos || {} };
    var defGrupos = {}; arr(e.grupos).forEach(function (g) { if (g && g.id != null) defGrupos[String(g.id)] = g; });
    arr(e.aparelhos).forEach(function (a) {
      if (!a || a.id == null) return;
      var cs = arr(a.conectores).map(function (c) {
        var p = ponto3(c); if (!p || !B.SISTEMAS[c.sistema]) return null;
        var o = { id: txt(c.id || c.sistema), sistema: c.sistema, dn: num(c.dn, 0), x: p.x, y: p.y, z: p.z };
        /* ⚠ PONTO DE PAREDE (QUALIDADE VISUAL 2, 17/10/2026): o tubo chega por DENTRO da parede — a
           descida/subida corre no eixo embutido (embutir atrás da face) e um toco perpendicular sai no
           ponto. Antes a vertical corria NA face e atravessava a coluna do lavatório e a caixa acoplada
           (print do Rogério). `ponta` = o ponto real; x/z passam a ser o eixo embutido. */
        var n = c.parede, nx = n ? num(n.x, NaN) : NaN, nz = n ? num(n.z, NaN) : NaN, L = Math.sqrt(nx * nx + nz * nz);
        var e = P.embutir + Math.max(0, num(n && n.d, 0));   /* medido da FACE da parede (o ponto pode estar uns mm à frente dela) */
        if (P.embutir > 0 && L > EPS) { o.ponta = { x: p.x, y: p.y, z: p.z }; o.x = r4(p.x + nx / L * e); o.z = r4(p.z + nz / L * e); }
        return o;
      }).filter(Boolean);
      out.aparelhos.push({ id: String(a.id), aparelho: txt(a.aparelho), aparelhoEs: a.aparelhoEs ? txt(a.aparelhoEs) : null, grupo: a.grupo != null ? String(a.grupo) : null, conectores: cs });
    });
    arr(e.pecas).forEach(function (k) {
      if (!k || k.id == null || !B.PECAS[k.peca]) return;
      var n = B.normPeca({ id: k.id, peca: k.peca, sistema: k.sistema || "esgoto", dn: k.dn, x: k.x, y: k.y, z: k.z });
      if (!n || n.sistema !== "esgoto") return;
      out.pecas.push({ id: String(k.id), peca: k.peca, dn: n.dn, grupo: k.grupo != null ? String(k.grupo) : null, x: r4(n.x), y: r4(n.y), z: r4(n.z), hub: n.hub, r: B.PECAS[k.peca].r || 0 });
    });
    /* grupo (ambiente): o informado; peça sem grupo vai ao do aparelho mais perto */
    var ids = [];
    out.aparelhos.forEach(function (a) { if (a.grupo == null) a.grupo = "1"; if (ids.indexOf(a.grupo) < 0) ids.push(a.grupo); });
    out.pecas.forEach(function (k) {
      if (k.grupo == null) {
        var melhor = null, dm = INF;
        out.aparelhos.forEach(function (a) { a.conectores.forEach(function (c) { var d = d2(c, k); if (d < dm - EPS) { dm = d; melhor = a.grupo; } }); });
        k.grupo = melhor || (ids[0] || "1");
      }
      if (ids.indexOf(k.grupo) < 0) ids.push(k.grupo);
    });
    out.grupos = ids.map(function (id) {
      var g = defGrupos[id] || {}, dest = {};
      Object.keys(out.destinos).forEach(function (k) { dest[k] = out.destinos[k]; });
      Object.keys(g.destinos || {}).forEach(function (k) { dest[k] = g.destinos[k]; });
      return { id: id, piso: num(g.piso, num(e.piso, 0)), destinos: dest };
    });
    /* caixas de gordura JÁ no modelo: { id, grupo?, conectores: [{ id: "entrada"|"saida", sistema, dn, x, y, z }] } */
    out.caixasGordura = arr(e.caixasGordura).map(function (cg) {
      if (!cg || cg.id == null) return null;
      var en = arr(cg.conectores).filter(function (c) { return c && (c.id === "entrada" || /entrada/.test(txt(c.id))); })[0] || arr(cg.conectores)[0], p = ponto3(en);
      return p ? { id: String(cg.id), grupo: cg.grupo != null ? String(cg.grupo) : null, entrada: { x: p.x, y: p.y, z: p.z, dn: num(en.dn, 0) }, cotaLivre: !!cg.cotaLivre } : null;
    }).filter(Boolean);
    if (!out.aparelhos.length) pend.push(pend0("rota.aparelhos", "nenhum aparelho com ponto de ligação na entrada", [], { tipo: "selecionar", texto: "selecione os aparelhos do ambiente" }));
    return out;
  }

  /* destino normalizado: {tipo, x, z, y (ponto), yBase, yTopo, existente, id, ventilado, conector} */
  function normDestino(d, sistema) {
    if (!d) return null;
    var tipo = txt(d.tipo) || "ponto", x = num(d.x, NaN), z = num(d.z, NaN), y = num(d.y, NaN);
    if (d.conector) { x = num(d.conector.x, x); y = num(d.conector.y, y); z = num(d.conector.z, z); }
    if (!isFinite(x) || !isFinite(z)) return null;
    var vertical = tipo === "tubo_queda" || tipo === "coluna" || tipo === "shaft";
    if (!vertical && !isFinite(y)) return null;
    return { tipo: tipo, vertical: vertical, x: r4(x), z: r4(z), y: isFinite(y) ? r4(y) : null,
             yBase: num(d.yBase, -INF), yTopo: num(d.yTopo, INF), existente: d.existente !== false, id: d.id != null ? String(d.id) : null,
             ventilado: d.ventilado != null ? !!d.ventilado : (sistema === "esgoto" && vertical), conector: !!d.conector, sistema: sistema, chave: sistema + "@" + r4(x) + "," + r4(z),
             cotaLivre: !!d.cotaLivre, entradaMax: d.entradaMax && typeof d.entradaMax === "object" ? d.entradaMax : null,
             /* a caixa com profundidade definida (a posta pelo usuário): topo (tampa) e fundo, para o aviso de caixa rasa */
             fundo: d.fundo != null && isFinite(Number(d.fundo)) ? Number(d.fundo) : null, topo: d.topo != null && isFinite(Number(d.topo)) ? Number(d.topo) : null };
  }

  /* ============================================= OBSTÁCULOS (formato da entrada)
   * paredes:   [{ id, p1:{x,z}, p2:{x,z}, espessura, base, altura }]
   * aberturas: [{ id, tipo:"porta"|"janela", p1, p2, espessura, y0, y1 }]   (p1-p2 = o vão em planta)
   * vigas:     [{ id, p1, p2, largura, altura, topo }]
   * pilares:   [{ id, x, z, largura, profundidade, rotY, base, altura }]
   * lajes:     [{ id, x0, z0, x1, z1, topo, espessura }]
   * A parede e a porta descem o enchimento: a parede apoia na laje (passar o
   * tubo por baixo dela é furar a base da alvenaria) e a soleira da porta não
   * se rasga (o tubo sob a porta vira o ponto fraco da impermeabilização). */
  function normObstaculos(o, P) {
    o = o || {};
    var out = [], lajes = [];
    /* ⚠ a parede e a soleira descem o ENCHIMENTO, nunca abaixo do topo da laje que as apoia: com laje rente
       ao piso, "piso − enchimento" caía no forro do pavimento de baixo e a porta de cima bloqueava o tubo lá */
    function descida(p1, p2, y0) {
      var mx = (num(p1.x, 0) + num(p2.x, 0)) / 2, mz = (num(p1.z, 0) + num(p2.z, 0)) / 2, fundo = y0 - P.alturaEnchimento;
      arr(o.lajes).forEach(function (l) {
        var x0 = Math.min(num(l.x0, INF), num(l.x1, INF)), x1 = Math.max(num(l.x0, -INF), num(l.x1, -INF)), z0 = Math.min(num(l.z0, INF), num(l.z1, INF)), z1 = Math.max(num(l.z0, -INF), num(l.z1, -INF)), tp = num(l.topo, NaN);
        if (!(num(l.espessura, 0) > LAJE_MIN)) return;   /* contrapiso/revestimento não apoia a parede */
        if (isFinite(tp) && mx >= x0 - EPS && mx <= x1 + EPS && mz >= z0 - EPS && mz <= z1 + EPS && tp <= y0 + EPS && tp > fundo) fundo = tp;
      });
      return fundo;
    }
    arr(o.paredes).forEach(function (w) {
      var b = retSeg(w.p1, w.p2, num(w.espessura, 0)); if (!b) return;
      var base = num(w.base, 0);
      b.tipo = "parede"; b.id = w.id; b.modo = "penalidade"; b.y0 = descida(w.p1, w.p2, base); b.y1 = base + num(w.altura, INF);
      out.push(b);
    });
    arr(o.aberturas).forEach(function (a) {
      var porta = txt(a.tipo) !== "janela";
      /* ⚠ CRITÉRIO DE PROJETISTA: o vão (com a folga do batente) + a VERGA acima + a CONTRAVERGA abaixo do peitoril, além do
         vão de cada lado — as MESMAS caixas do auditor (js/hidcriterios.js). Antes só o vão: o ramal a 1,20 m passava rente
         ao marco e a descida cortava a contraverga ("não vai subir um tubo na janela") */
      var zs = HC() ? HC().caixasAbertura(a, P.criterios) : null;
      if (zs && zs.length) {
        zs.forEach(function (z) {
          var bz = z.caixa; bz.tipo = porta ? "porta" : "janela"; bz.parte = z.parte; bz.id = a.id; bz.modo = "proibido";   // rota:zonaAbertura
          if (porta && z.parte === "vao") bz.y0 = descida(a.p1, a.p2, num(a.y0, 0));
          out.push(bz);
        });
        return;
      }
      var b = retSeg(a.p1, a.p2, num(a.espessura, 0)); if (!b) return;
      b.tipo = porta ? "porta" : "janela"; b.id = a.id; b.modo = "proibido";
      b.y0 = porta ? descida(a.p1, a.p2, num(a.y0, 0)) : num(a.y0, 0); b.y1 = num(a.y1, INF);
      out.push(b);
    });
    arr(o.vigas).forEach(function (v) {
      var b = retSeg(v.p1, v.p2, num(v.largura, 0)); if (!b) return;
      var topo = num(v.topo, 0);
      b.tipo = "viga"; b.id = v.id; b.modo = P.atravessarViga ? "penalidade" : "proibido"; b.y0 = topo - num(v.altura, 0); b.y1 = topo;   // rota:alturaViga
      out.push(b);
    });
    arr(o.pilares).forEach(function (c) {
      var x = num(c.x, NaN), z = num(c.z, NaN), lx = num(c.largura, 0), lz = num(c.profundidade, lx);
      if (!isFinite(x) || !isFinite(z) || !(lx > 0) || !(lz > 0)) return;
      var b = retCentro(x, z, lx, lz, c.rotY); b.tipo = "pilar"; b.id = c.id; b.modo = "proibido";
      b.y0 = num(c.base, -INF); b.y1 = num(c.base, 0) + num(c.altura, INF);
      out.push(b);
    });
    /* ⚠ VOLUME DAS FAMÍLIAS (louça, equipamento): PROIBIDO na faixa de cotas dele — o traço nunca atravessa
       uma louça (QUALIDADE VISUAL 2). Formato = BimInst.volumesFamilias (caixa girada + y0..y1). */
    var fams = [];
    arr(o.familias).forEach(function (v) {
      var cx = num(v.cx, NaN), cz = num(v.cz, NaN), hl = num(v.hl, 0), hw = num(v.hw, 0), ux = num(v.ux, 1), uz = num(v.uz, 0), L = Math.sqrt(ux * ux + uz * uz);
      if (!isFinite(cx) || !isFinite(cz) || !(hl > 0) || !(hw > 0) || !(L > EPS)) return;
      var b = { tipo: "familia", id: v.id, famId: v.famId, modo: "proibido", cx: cx, cz: cz, ux: ux / L, uz: uz / L, hl: hl, hw: hw, y0: num(v.y0, -INF), y1: num(v.y1, INF) };
      out.push(b); fams.push(b);
    });
    arr(o.lajes).forEach(function (l) {
      var x0 = num(l.x0, NaN), x1 = num(l.x1, NaN), z0 = num(l.z0, NaN), z1 = num(l.z1, NaN), topo = num(l.topo, NaN), e = num(l.espessura, 0);
      /* ⚠ placa FINA (contrapiso + revestimento do piso acabado) não é laje: não apoia parede nem tem forro embaixo —
         o tubo do enchimento passa sob ela (QUALIDADE VISUAL 2) */
      if (![x0, x1, z0, z1, topo].every(isFinite) || !(e > LAJE_MIN)) return;
      lajes.push({ id: l.id, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), topo: topo, fundo: topo - e });
    });
    return { lista: out, lajes: lajes, familias: fams };
  }
  var LAJE_MIN = 0.06;   // hid:ok placa até 6 cm = revestimento/contrapiso, não laje estrutural
  var JANELA_PERTO = 0.30;   // hid:ok janela a até 30 cm (em planta) dos pontos do ambiente conta para a cota do ramal na parede
  /* regras que o próprio motor já trata (louça → colisões; afastamento → interferências): o auditor não descarta por elas */
  var CRIT_DO_MOTOR = { "interferencia.louca": 1, "interferencia.afastamento": 1 };
  /* o que oferecer quando a estratégia sai por critério de projetista (a tela mostra; o RT decide o que é dele) */
  var OPCOES_CRIT = {
    abertura: ["usar outra estratégia (piso ou forro)", "mover o aparelho para fora da prumada da janela/porta", "subir o peitoril ou mudar a janela de parede"],
    estrutura: ["usar outra estratégia (passar por baixo da viga, no forro)", "levar ao estrutural: furo previsto/passante ou shaft (decisão do RT)", "mover o ponto para fora do pilar"],
    interferencia: ["usar outra estratégia", "afastar os pontos dos aparelhos"],
    outro: ["usar outra estratégia", "ajustar o modelo e traçar de novo"]
  };
  function lajeEm(lajes, x, z) { return lajes.filter(function (l) { return x >= l.x0 - EPS && x <= l.x1 + EPS && z >= l.z0 - EPS && z <= l.z1 + EPS; }); }

  /* ================================================ GRADE + A* (em planta) */
  /* ⚠ a grade nasce NO DESTINO (origem o), não no zero do mundo: com as linhas em múltiplos
     absolutos de 5 cm, a mesma cena deslocada para x = 40,37 caía noutra grade — o custo
     mudava até 6% e, no modelo real da tela, o ponto de água do lavatório (10 cm do esgoto)
     ficava sem nenhum vizinho livre: 0 opções. Ancorada, a busca não depende de onde a
     obra está (tools/test-hid-rota.js desloca a cena por 20 sementes). */
  function eixo(min, max, passo, chaves, o) {
    o = r4(num(o, 0));   // rota:ancora
    var a = Math.floor((min - o) / passo), b = Math.ceil((max - o) / passo), v = [], ch = {};
    for (var k = a; k <= b; k++) v.push(r4(o + k * passo));
    chaves.forEach(function (c) { var q = r4(c); ch[q] = 1; v.push(q); });
    v.sort(function (p, q) { return p - q; });
    var out = [];
    v.forEach(function (x) {
      var u = out.length ? out[out.length - 1] : null;
      if (u != null && x - u < CASAS_MIN) { if (ch[x] && !ch[u]) out[out.length - 1] = x; return; }
      out.push(x);
    });
    return out;
  }
  var EMPATE = 1e-3;      // hid:ok custos da busca a menos de 1 mm empatam
  var FOLGA_LIMITE = 1e-3; // hid:ok 1 mm de sobra nas folgas (acima dos 0,1 mm do arredondamento das cotas)
  var EPS_DENTRO = 1e-4;   // hid:ok "estritamente dentro" (0,1 mm além da face)
  var CASAS_MIN = 1e-3;   // hid:ok duas linhas da grade a menos de 1 mm são a mesma
  function achar(v, x) {
    var lo = 0, hi = v.length - 1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (Math.abs(v[m] - x) < CASAS_MIN) return m; if (v[m] < x) lo = m + 1; else hi = m - 1; }
    return -1;
  }
  function Grade(xs, zs) { this.xs = xs; this.zs = zs; this.nx = xs.length; this.nz = zs.length; }
  Grade.prototype.idx = function (x, z) { var i = achar(this.xs, x), j = achar(this.zs, z); return i < 0 || j < 0 ? -1 : i + j * this.nx; };
  Grade.prototype.pt = function (k) { return { x: this.xs[k % this.nx], z: this.zs[Math.floor(k / this.nx)] }; };
  var DI = [1, 0, -1, 0], DJ = [0, 1, 0, -1];
  // constantes do ALGORITMO (não são norma): as direções da grade ortogonal, o estado "sem direção"
  // do ponto de partida, as tentativas de encolher um desvio, os pontos mínimos para haver canto e
  // quantos pontos de junção se descartam antes de aceitar um tê de 90° (com aviso)
  var NDIR = 4, SEM_DIR = 4, TENTATIVAS = 3, PONTOS_CANTO = 3, PONTOS_DEGRAU = 4, MAX_DEGRAUS = 200, MAX_VOLTAS = 20;   // hid:ok
  Grade.prototype.viz = function (k, d) {
    var i = k % this.nx + DI[d], j = Math.floor(k / this.nx) + DJ[d];
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : i + j * this.nx;
  };

  /* fila de prioridade (heap binário) com desempate pela ordem de entrada → determinístico */
  function Fila() { this.h = []; this.seq = 0; }
  /* ⚠ empate = custos a menos de 1 mm: decide a ordem de entrada. Com EPS numérico, os 0,1 mm
     de arredondamento de uma cena deslocada trocavam a rota escolhida (custo variava 0,6%) */
  Fila.prototype.menor = function (a, b) { return a.f < b.f - EMPATE || (Math.abs(a.f - b.f) <= EMPATE && a.s < b.s); };
  Fila.prototype.por = function (f, k) {
    var h = this.h, n = { f: f, s: this.seq++, k: k }, i = h.length; h.push(n);
    while (i > 0) { var p = (i - 1) >> 1; if (!this.menor(h[i], h[p])) break; var t = h[i]; h[i] = h[p]; h[p] = t; i = p; }
  };
  Fila.prototype.tirar = function () {
    var h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; var i = 0;
      for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < h.length && this.menor(h[l], h[m])) m = l; if (r < h.length && this.menor(h[r], h[m])) m = r; if (m === i) break; var t = h[i]; h[i] = h[m]; h[m] = t; i = m; }
    }
    return top;
  };

  /* A*: estado = (nó, direção de chegada); curva custa `curva`. ctx = { livre(k),
     aresta(a,b) → null (bloqueada) | {c, cruz}, alvos {k: info}, curva, max } */
  function aEstrela(G, ini, ctx) {
    var ND = NDIR + 1, alvosK = Object.keys(ctx.alvos).map(Number), apts = alvosK.map(function (k) { return G.pt(k); });
    if (!alvosK.length || ini < 0) return null;
    function h(k) { var p = G.pt(k), m = INF; for (var i = 0; i < apts.length; i++) { var v = Math.abs(p.x - apts[i].x) + Math.abs(p.z - apts[i].z); if (v < m) m = v; } return m; }
    var g = {}, ant = {}, fechado = {}, F = new Fila(), s0 = ini * ND + SEM_DIR, n = 0;
    g[s0] = 0; F.por(h(ini), s0);
    while (F.h.length) {
      var top = F.tirar(), s = top.k; if (fechado[s]) continue; fechado[s] = 1;
      if (++n > ctx.max) return null;
      var k = Math.floor(s / ND), dch = s % ND;
      if (ctx.alvos[k] && k !== ini) {
        var cam = [k], cur = s; while (ant[cur] != null) { cur = ant[cur]; cam.push(Math.floor(cur / ND)); }
        cam.reverse();
        var lim = []; cam.forEach(function (q) { if (!lim.length || lim[lim.length - 1] !== q) lim.push(q); });
        return { nos: lim, custo: g[s], alvo: k };
      }
      for (var d = 0; d < NDIR; d++) {
        if (dch !== SEM_DIR && d === (dch + 2) % NDIR) continue;
        var v = G.viz(k, d); if (v < 0) continue;
        if (!ctx.alvos[v] && !ctx.livre(v)) continue;
        var ar = ctx.aresta(k, v); if (!ar) continue;
        if (dch !== SEM_DIR && d !== dch && ctx.semCurva && ctx.semCurva[k]) continue;
        var c = g[s] + ar.c + (dch !== SEM_DIR && d !== dch ? ctx.curva : 0), sv = v * ND + d;
        if (fechado[sv] || (g[sv] != null && g[sv] <= c + EMPATE)) continue;
        g[sv] = c; ant[sv] = s; F.por(c + h(v), sv);
      }
    }
    return null;
  }

  /* ================================================ NORMAS (só pelo HidNormas) */
  function Normas(ctx, pend) {
    var N = NN(), cacheDecl = {};
    function linhasDe(chave, uso) { return ctx.linhas(chave, null, uso); }
    return {
      /* ⚠ declividade usada = a MAIOR entre a tabela e a regra do modelador
         (biminst) e a pedida — o traço nunca nasce com aviso de inclinação */
      decl: function (dn, P) {
        if (cacheDecl[dn]) return cacheDecl[dn];
        var bi = BI().inclinacaoMinima("esgoto", dn), tab = null, ls = linhasDe("es.declividade_minima", "traçado: declividade do esgoto");
        if (ls) {
          var lin = ls.filter(function (x) { return x.dn_max === "*" || num(x.dn_max, 0) >= dn; })
                      .sort(function (a, b) { return (a.dn_max === "*" ? INF : a.dn_max) - (b.dn_max === "*" ? INF : b.dn_max); })[0];
          if (lin) tab = num(lin.declividade_pct, null);
          else ctx.pendencia("es.declividade_minima[dn=" + dn + "]", "sem linha de declividade para DN " + dn, "traçado");
        }
        var i = Math.max(bi, tab == null ? 0 : tab, P.declividade);   // rota:declividade
        return (cacheDecl[dn] = { i: i, tab: tab, bi: bi, fonte: N ? N.fonte("es.declividade_minima") : null });
      },
      /* a declividade MÁXIMA do esgoto (NBR 8160 4.2.5.2, es8160.declividade_maxima) — o teto do último trecho que ajusta a
         chegada na caixa (cota pelo fluxo, frente A 19/10/2026); sem a tabela = null (pendência, o traçado não ajusta) */
      declMax: function (uso) { var ls = linhasDe("es8160.declividade_maxima", uso); var v = ls && ls[0] ? num(ls[0].valor, null) : null; return v != null && v > 0 ? v : null; },
      esAparelho: function (ap, col, uso) { var c = ctx.consulta("es.aparelhos", { aparelho: ap }, col, uso); return c.ok ? num(c.valor, null) : null; },
      esAparelhoSemPend: function (ap, col) { var c = N ? N.consulta("es.aparelhos", { aparelho: ap }, col) : { ok: false }; return c.ok ? num(c.valor, null) : null; },
      uhcPorDn: function (dn, uso) { var c = ctx.consulta("es.uhc_por_dn", { dn: dn }, "uhc", uso); return c.ok ? num(c.valor, null) : null; },
      dnRamal: function (uhc, uso) {
        var ls = linhasDe("es.ramal_esgoto", uso); if (!ls) return null;
        var ok = ls.filter(function (x) { return num(x.uhc_max, -1) >= uhc - EPS; }).sort(function (a, b) { return num(a.dn, 0) - num(b.dn, 0); })[0];
        if (!ok) { ctx.pendencia("es.ramal_esgoto[uhc=" + uhc + "]", "nenhum DN de ramal comporta " + uhc + " UHC", uso); return null; }
        return num(ok.dn, null);
      },
      distVent: function (dn, uso) {
        var ls = linhasDe("es.ventilacao.distancia_maxima", uso); if (!ls) return null;
        var lin = ls.filter(function (x) { return num(x.dn_ramal, 0) === dn; })[0];
        if (!lin) { ctx.pendencia("es.ventilacao.distancia_maxima[dn_ramal=" + dn + "]", "sem linha para o ramal DN " + dn, uso); return null; }
        return num(lin.distancia_m, null);
      },
      dnVent: function (comBacia, uhc, uso) {
        var ls = linhasDe("es.ventilacao.ramal", uso); if (!ls) return null;
        var ok = ls.filter(function (x) { return num(x.com_bacia, -1) === comBacia && num(x.uhc_max, -1) >= uhc - EPS; }).sort(function (a, b) { return num(a.dn, 0) - num(b.dn, 0); })[0];
        if (!ok) { ctx.pendencia("es.ventilacao.ramal[com_bacia=" + comBacia + ", uhc=" + uhc + "]", "nenhum DN de ramal de ventilação comporta " + uhc + " UHC", uso); return null; }
        return num(ok.dn, null);
      },
      afDnMin: function (ap, uso) {
        var c = N ? N.consulta("af.aparelhos.dn_min", { aparelho: ap }, "dn_min") : { ok: false };
        if (c.ok) { ctx.consulta("af.aparelhos.dn_min", { aparelho: ap }, "dn_min", uso); return num(c.valor, null); }
        var c2 = ctx.consulta("af.aparelhos", { aparelho: ap }, "dn_min", uso);
        return c2.ok ? num(c2.valor, null) : null;
      }
    };
  }
  function comercial(material, dn) {
    var ds = (BI().MATERIAIS[material] || {}).dns || [];
    var ok = ds.filter(function (d) { return d >= dn - EPS; });
    return ok.length ? ok[0] : (ds.length ? ds[ds.length - 1] : dn);
  }

  /* ================================================== ÁRVORE (planta) */
  function Arvore(sistema, grupo) { this.sistema = sistema; this.grupo = grupo; this.nos = []; this.arestas = []; this.raiz = null; this.porRef = {}; }
  Arvore.prototype.no = function (x, z, tipo, ref) { var n = { id: this.nos.length, x: r4(x), z: r4(z), tipo: tipo, ref: ref || null, sai: null, entram: [] }; this.nos.push(n); if (ref) this.porRef[ref] = n.id; return n.id; };
  Arvore.prototype.aresta = function (de, para, info) {
    var a = { id: this.arestas.length, de: de, para: para, paraCaixa: !!(info && info.paraCaixa), vivo: true };
    this.arestas.push(a); this.nos[de].sai = a.id; this.nos[para].entram.push(a.id); return a.id;
  };
  /* parte a aresta no ponto (x,z): de→N e N→para; devolve N */
  Arvore.prototype.dividir = function (aid, x, z) {
    var a = this.arestas[aid], n = this.no(x, z, "juncao");
    var para = a.para; this.nos[para].entram = this.nos[para].entram.filter(function (e) { return e !== aid; });
    a.para = n; this.nos[n].entram.push(aid);
    this.aresta(n, para, { paraCaixa: a.paraCaixa });
    return n;
  };
  Arvore.prototype.segs = function () { var T = this; return this.arestas.map(function (a) { return { a: T.nos[a.de], b: T.nos[a.para], aresta: a }; }); };

  /* ====================================================== O MUNDO DA ESTRATÉGIA */
  function somarCruz(W, rota) {
    Object.keys(rota.cruz).forEach(function (k) { W.cruz[k] = (W.cruz[k] || 0) + rota.cruz[k]; });
    arr(rota.idsCruz).forEach(function (x) { var l = W.idsCruz[x.tipo] = W.idsCruz[x.tipo] || []; if (l.indexOf(x.id) < 0) l.push(x.id); });
  }
  function Mundo(E, P, O, NRM) {
    this.E = E; this.P = P; this.O = O; this.N = NRM;
    this.verticais = [];   /* {x, z, y0, y1, r, ref} */
    this.tubos = [];       /* {a:{x,y,z}, b, r, sistema, grupo} */
    this.entradas = {};    /* chave do destino → [cotas usadas] */
    this.cruz = { parede: 0, laje: 0, viga: 0 }; this.idsCruz = {};
  }

  /* contexto de UMA rota: livre(k) e aresta(a,b) para o A* */
  function contextoRota(W, G, o) {
    var P = W.P, cacheN = {}, r = o.r, obst = W.O.lista.filter(function (ob) { return faixaCruza(ob.y0, ob.y1, o.b0, o.b1); });
    var paredes = obst.filter(function (ob) { return ob.tipo === "parede"; });
    var verts = W.verticais.filter(function (v) { return !o.ignorar[v.ref] && faixaCruza(v.y0, v.y1, o.b0 - P.folga, o.b1 + P.folga); });
    var tubos = W.tubos.filter(function (t) { return !o.ignorar[t.ref]; });
    var segsArv = o.arvore ? o.arvore.segs() : [];
    /* ⚠ na estratégia parede o tubo fica DENTRO da parede; a tolerância da face só vale
       perto das pontas da rota (o ponto do aparelho fica na face ou um pouco fora) —
       com ela em todo lugar o ramal corria 5 cm dentro do ambiente, "na parede" só no nome */
    var pontas = [o.dePt].concat(Object.keys(o.alvos).map(function (k) { return G.pt(Number(k)); })).filter(Boolean);
    /* água × outro sistema: o afastamento; o resto, a folga */
    function folgaVert(v) { return v.sistema && v.sistema !== o.sistema && (v.sistema === "agua_fria" || o.sistema === "agua_fria") ? P.afastamento : P.folga; }
    /* ⚠ "na parede" = DENTRO dela, com o cobrimento até a face (QUALIDADE VISUAL 2): com a face contando,
       o ramal "embutido" corria colado na face, metade no ambiente; a tolerância das pontas continua */
    function naParede(x, z) {
      if (paredes.some(function (w) { return dentro(w, x, z, -Math.min(P.cobrimento, w.hw / 2)); })) return true;
      return pontas.some(function (q) { return Math.abs(q.x - x) + Math.abs(q.z - z) <= P.tolFace + P.passo + EPS; }) && paredes.some(function (w) { return dentro(w, x, z, P.tolFace); });
    }
    /* ⚠ folgas comparadas com 1 mm de sobra (o arredondamento a 4 casas mexe 0,1 mm): o nó EXATAMENTE no limite (bacia a 10 cm)
       virava livre ou bloqueado conforme o arredondamento da origem — a rota mudava com a obra deslocada */
    function livrePt(p, terminal, corredor) {
      for (var i = 0; i < obst.length; i++) if (obst[i].modo === "proibido" && !o.ignorar[obst[i].id] && dentro(obst[i], p.x, p.z, r + P.folga)) return false;
      if (terminal) return true;
      if (o.modo === "parede" && !naParede(p.x, p.z) && !(o.raiz && d2(p, o.raiz) <= P.raioTerminal + EPS)) return false;
      /* no corredor de saída/chegada vale só a folga física; o afastamento que faltar vira aviso na conferência 3D */
      for (var j = 0; j < verts.length; j++) if (d2(p, verts[j]) < r + verts[j].r + (corredor ? P.folga : folgaVert(verts[j])) - FOLGA_LIMITE) return false;
      /* ⚠ no corredor o AFASTAMENTO vira aviso, mas tubo dentro de tubo nunca: lá a folga é zero, não infinita
         (a revisão achou o corredor ignorando os tubos de outro sistema por até ~28 cm) */
      for (var t = 0; t < tubos.length; t++) {
        var T = tubos[t], pr = ptSeg2(p, T.a, T.b), c = corredor ? 0 : (T.sistema === o.sistema ? P.folga : P.afastamento);   // rota:colisaoCorredor
        /* ⚠ no corredor, a outra ENTRADA no mesmo TQ/coluna (o banheiro espelhado) termina no mesmo eixo: a
           separação dela é a cota (espaçamento das entradas, decidido depois), não a planta */
        if (corredor && o.raiz && (d2(T.a, o.raiz) < EPS || d2(T.b, o.raiz) < EPS)) continue;
        if (pr.d >= r + T.r + c - FOLGA_LIMITE) continue;
        /* tubo vertical: em planta é um ponto — vale a faixa inteira de cotas dele */
        var vert = d2(T.a, T.b) < EPS, yLo = vert ? Math.min(T.a.y, T.b.y) : T.a.y + (T.b.y - T.a.y) * pr.t, yHi = vert ? Math.max(T.a.y, T.b.y) : yLo;
        var gap = yHi < o.b0 ? o.b0 - yHi : (yLo > o.b1 ? yLo - o.b1 : 0);
        if (gap - r - T.r < c - FOLGA_LIMITE) return false;
      }
      /* ⚠ FRENTE B (19/10/2026, D-03): no corredor a rota passava POR CIMA da própria árvore — na suíte da CASA o ramal do
         lavatório correu pelo nó da espera de alimentação e a água chegava aos pontos sem passar pelo registro (ciclo).
         Tubo dentro de tubo da mesma árvore nunca: só se chega nela pelo alvo (a junção), que não passa por aqui. */
      if (corredor && o.sistema === "agua_fria" && !o.corredorSolto) {
        for (var s0 = 0; s0 < segsArv.length; s0++) if (ptSeg2(p, segsArv[s0].a, segsArv[s0].b).d < r + o.rArv - FOLGA_LIMITE) return false;
        if (o.raiz && o.arvore && o.arvore.raiz != null && d2(p, o.raiz) < r + o.rArv - FOLGA_LIMITE) return false;
        return true;
      }
      if (corredor) return true;
      for (var s = 0; s < segsArv.length; s++) if (ptSeg2(p, segsArv[s].a, segsArv[s].b).d < r + o.rArv + P.folga - FOLGA_LIMITE) return false;
      return true;
    }
    return {
      livre: function (k) { if (cacheN[k] == null) cacheN[k] = livrePt(G.pt(k), k === o.ini, !!(o.corredor && o.corredor[k])) ? 1 : 0; return cacheN[k] === 1; },
      livrePt: livrePt,
      aresta: function (a, b) {
        var A = G.pt(a), Bp = G.pt(b), c = d2(A, Bp), cruz = null, ids = null;
        for (var i = 0; i < obst.length; i++) {
          var ob = obst[i];
          if (o.ignorar[ob.id]) continue;
          if (ob.modo === "proibido") { if (corta(ob, A, Bp, r + P.folga) && !(a === o.ini && dentro(ob, A.x, A.z, r + P.folga) && !corta(ob, A, Bp, 0))) return null; continue; }
          if (o.modo === "parede" && ob.tipo === "parede") continue;
          /* ⚠ travessia = o MEIO da aresta dentro (estrito) e a origem fora: os nós da face da
             parede ficavam "dentro" e a travessia saía de graça (0 travessias com o tubo no shaft); e
             a face no MEIO da célula (viga de 15 cm) também — conta quem sai de fora e entra de verdade */
          var Mo = { x: (A.x + Bp.x) / 2, z: (A.z + Bp.z) / 2 };
          if (!dentro(ob, A.x, A.z, -EPS_DENTRO) && (dentro(ob, Mo.x, Mo.z, -EPS_DENTRO) || dentro(ob, Bp.x, Bp.z, -EPS_DENTRO))) { c += P.pesos[ob.tipo] || 0; (cruz = cruz || {})[ob.tipo] = (cruz[ob.tipo] || 0) + 1; if (ob.id != null) (ids = ids || []).push({ tipo: ob.tipo, id: ob.id }); }
        }
        if (o.modo === "parede") { var M = { x: (A.x + Bp.x) / 2, z: (A.z + Bp.z) / 2 }; if (!naParede(M.x, M.z) && !(o.raiz && d2(M, o.raiz) <= P.raioTerminal + EPS) && !o.alvos[b] && a !== o.ini) return null; }
        for (var s = 0; s < segsArv.length; s++) {
          var S = segsArv[s]; if (Math.abs(S.a.x - S.b.x) < EPS || Math.abs(S.a.z - S.b.z) < EPS) continue;   /* só as diagonais: as retas passam por nós */
          if (segSeg2(A, Bp, S.a, S.b) < r + o.rArv + P.folga && !o.alvos[b] && !(o.corredor && o.corredor[b])) return null;
        }
        /* proximidade (custo, não bloqueio) de tubos de outro sistema na faixa */
        if (o.sistema === "agua_fria") for (var t = 0; t < tubos.length; t++) { if (tubos[t].sistema !== o.sistema && ptSeg2(Bp, tubos[t].a, tubos[t].b).d < r + tubos[t].r + P.afastamento * 2) c += P.pesos.proximidade * d2(A, Bp); }
        return { c: c, cruz: cruz, ids: ids };
      },
      /* o segmento p-q (desvio de 45°, junção) está livre? */
      segLivre: function (p, q, excluirAresta) {
        for (var i = 0; i < obst.length; i++) { var ob = obst[i]; if (!o.ignorar[ob.id] && ob.modo === "proibido" && corta(ob, p, q, r + P.folga)) return false; }
        if (o.modo === "parede" && !(naParede(p.x, p.z) && naParede(q.x, q.z))) return false;
        for (var j = 0; j < verts.length; j++) if (ptSeg2(verts[j], p, q).d < r + verts[j].r + folgaVert(verts[j])) return false;
        for (var s = 0; s < segsArv.length; s++) { if (segsArv[s].aresta.id === excluirAresta) continue; if (segSeg2(p, q, segsArv[s].a, segsArv[s].b) < r + o.rArv + P.folga) return false; }
        return true;
      }
    };
  }

  function grade(pts, P, origem) {
    var xs = pts.map(function (p) { return p.x; }), zs = pts.map(function (p) { return p.z; });
    var x0 = Math.min.apply(null, xs) - P.margem, x1 = Math.max.apply(null, xs) + P.margem, z0 = Math.min.apply(null, zs) - P.margem, z1 = Math.max.apply(null, zs) + P.margem;
    return new Grade(eixo(x0, x1, P.passo, xs, origem.x), eixo(z0, z1, P.passo, zs, origem.z));
  }

  /* tira os pontos do meio de trechos retos */
  function simplificar(pts) {
    var out = [];
    pts.forEach(function (p) {
      if (out.length >= 2) {
        var a = out[out.length - 2], b = out[out.length - 1], u = un2(a, b), v = un2(b, p);
        if (Math.abs(u.x * v.z - u.z * v.x) < EPS && u.x * v.x + u.z * v.z > 0) out[out.length - 1] = p; else out.push(p);
      } else if (!out.length || d2(out[out.length - 1], p) > EPS) out.push(p);
    });
    return out;
  }
  /* ⚠ ESGOTO: cada canto de 90° no horizontal vira dois desvios de 45°
     (NBR 8160 pede, no horizontal, peças até 45°; o biminst acusa o joelho
     de 90°). Perna = parametros.chanfro, encolhida até caber; se nada cabe,
     o canto fica e a validação do biminst o mostra (nunca escondido). */
  /* ⚠ DEGRAU CURTO (19/10/2026): duas linhas da grade a poucos centímetros uma da outra (o ponto do aparelho e o da caixa
     sifonada, 8 cm fora de prumo) davam um degrau reto-lateral-reto com a perna do meio menor que o chanfro: nenhuma das duas
     curvas de 90° cabia em 45° e o joelho ficava. O degrau vira UMA diagonal de 45° (m × m) entre as duas retas, com duas curvas
     de 45° — o mesmo desvio, sem joelho de 90° no horizontal. A diagonal passa pela mesma conferência de folga (segLivre). */
  function degrausCurtos(pts, P, segLivre) {
    var i = 0, guard = 0, ult = PONTOS_DEGRAU - 1;
    while (i + ult < pts.length && guard++ < MAX_DEGRAUS) {
      var p0 = pts[i], p1 = pts[i + 1], p2 = pts[i + 2], p3 = pts[i + ult], u1 = un2(p0, p1), u2 = un2(p1, p2), u3 = un2(p2, p3);
      var m = d2(p1, p2), L1 = d2(p0, p1), L3 = d2(p2, p3);
      if (Math.abs(u1.x * u2.x + u1.z * u2.z) > EPS || Math.abs(u1.x * u3.x + u1.z * u3.z - 1) > EPS || !(m < 2 * P.chanfro - EPS) || m * Math.SQRT2 < P.margemNo - EPS) { i++; continue; }
      var cand = [m / 2, Math.min(m, L1), Math.max(0, m - L3)], feito = false;
      for (var k = 0; k < cand.length && !feito; k++) {
        var t = r4(cand[k]), r1 = L1 - t, r3 = L3 - (m - t);
        if (t < -EPS || t > m + EPS || r1 < -EPS || r3 < -EPS) continue;
        if ((r1 > EPS && r1 < P.margemNo / 2 - EPS) || (r3 > EPS && r3 < P.margemNo / 2 - EPS)) continue;
        var A = { x: r4(p1.x - u1.x * t), z: r4(p1.z - u1.z * t) }, B = { x: r4(p2.x + u1.x * (m - t)), z: r4(p2.z + u1.z * (m - t)) }, dg = un2(A, B);
        /* ⚠ (revisão 19/10/2026) a diagonal que COME a reta de fora (A em p0 ou B em p3) faz o canto com o trecho vizinho: só
           vale se esse canto também for de até 45°. Sem isto, o "calombo" (desce, anda 2 cm, volta) virava giro de 135° sem
           aviso, e a reta curta que leva à junção de 45° sumia — o ramal entrava no coletor a 90° (tê no horizontal) */
        if (i > 0 && d2(A, p0) <= EPS) { var u0 = un2(pts[i - 1], p0); if (u0.x * dg.x + u0.z * dg.z < Math.SQRT1_2 - EPS) continue; }
        if (i + ult < pts.length - 1 && d2(B, p3) <= EPS) { var u4 = un2(p3, pts[i + ult + 1]); if (dg.x * u4.x + dg.z * u4.z < Math.SQRT1_2 - EPS) continue; }
        if (!segLivre(A, B)) continue;
        var novo = [];
        if (d2(A, p0) > EPS) novo.push(A); else pts[i] = A;
        if (d2(B, p3) > EPS) novo.push(B); else pts[i + ult] = B;
        pts.splice.apply(pts, [i + 1, 2].concat(novo)); feito = true;
      }
      if (!feito) i++;
    }
    return pts;
  }
  function chanfrar(pts, P, segLivre, avisos, falhos) {
    if (pts.length < PONTOS_CANTO) return pts;
    pts = degrausCurtos(pts.slice(), P, segLivre);
    var out = [pts[0]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = out[out.length - 1], c = pts[i], b = pts[i + 1], u1 = un2(a, c), u2 = un2(c, b);
      if (Math.abs(u1.x * u2.x + u1.z * u2.z) > EPS) { out.push(c); continue; }        /* não é 90° (ex.: o desvio da junção) */
      /* nas pontas da rota o desvio pode comer o trecho inteiro (sai do pé da descida ou
         chega no TQ/caixa já em diagonal); no meio, divide o trecho com o canto vizinho */
      var ini = i === 1, fim = i + 1 === pts.length - 1;
      var L1 = ini ? d2(a, c) : d2(a, c) - P.margemNo, L2 = fim ? d2(c, b) : d2(c, b) / 2 - P.margemNo / 2;
      var d = r4(Math.min(P.chanfro, L1, L2)), feito = false;   // rota:chanfro
      for (var tent = 0; tent < TENTATIVAS && !feito && d >= P.margemNo / 2; tent++) {
        var p = { x: r4(c.x - u1.x * d), z: r4(c.z - u1.z * d) }, q = { x: r4(c.x + u2.x * d), z: r4(c.z + u2.z * d) };
        if (segLivre(p, q)) { if (d2(p, a) > EPS) out.push(p); if (d2(q, b) > EPS) out.push(q); feito = true; } else d = r4(d / 2);
      }
      if (!feito) { out.push(c); if (falhos) falhos.push(c); avisos.push(prob("curva de 90° no esgoto em " + fxz(c.x, c.z) + ": sem espaço para dois desvios de 45° — ajuste à mão ou refaça com a grade mais fina", [pt3(c.x, null, c.z)], { tipo: "parametro", campo: "passo", sugerido: r4(P.passo / 2) })); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* --------------------------------------------- uma rota até a árvore */
  function rotear(W, G, arv, o) {
    var P = W.P, ini = G.idx(o.de.x, o.de.z);
    if (ini < 0) return { erro: "ponto fora da grade" };
    var alvos = {}, ign = o.ignorar || {};
    if (o.alvoPeca != null) { var kp = G.idx(o.alvoPeca.x, o.alvoPeca.z); if (kp >= 0) alvos[kp] = { tipo: "peca", no: o.alvoPeca.no }; }
    else {
      if (o.raiz) { var kr = G.idx(o.raiz.x, o.raiz.z); if (kr >= 0) alvos[kr] = { tipo: "raiz" }; }
      /* ⚠ junção só no MEIO de uma aresta horizontal reta, longe das pontas — senão
         nasce nó de 4 trechos (cruzeta) ou trecho de centímetros */
      arv.arestas.forEach(function (a) {
        if (!a.vivo || (a.paraCaixa && !o.aceitaCaixa)) return;
        var A = arv.nos[a.de], B = arv.nos[a.para], horiz = Math.abs(A.z - B.z) < EPS, vert = Math.abs(A.x - B.x) < EPS;
        if (!horiz && !vert) return;
        var folga = o.folgaJuncao, linha = horiz ? G.xs : G.zs, fixo = horiz ? A.z : A.x, ini2 = horiz ? Math.min(A.x, B.x) : Math.min(A.z, B.z), fim = horiz ? Math.max(A.x, B.x) : Math.max(A.z, B.z);
        linha.forEach(function (v) {
          if (v < ini2 + folga - EPS || v > fim - folga + EPS) return;
          var p = horiz ? { x: v, z: fixo } : { x: fixo, z: v };
          if (d2(p, A) < folga - EPS || d2(p, B) < folga - EPS) return;
          if (o.proibirPerto && o.proibirPerto.some(function (q) { return d2(p, q) < q.raio; })) return;
          var k = G.idx(p.x, p.z); if (k >= 0 && !alvos[k]) alvos[k] = { tipo: "aresta", aresta: a.id };
        });
      });
    }
    delete alvos[ini];
    /* ⚠ CORREDOR de chegada: a folga da árvore bloqueia os nós em volta dela — e
       com isso o próprio ponto de junção ficava inalcançável. Em volta de cada alvo,
       os nós nas direções ORTOGONAIS livres (sem tubo saindo dali) podem ser usados
       só para chegar; nunca na direção de um tubo que já sai do alvo (sobreporia). */
    var corredor = {}, alc = o.r + o.rArv + P.folga + P.afastamento + P.passo;
    /* … e na SAÍDA: o ponto do aparelho a 10 cm do esgoto dele (lavatório real) tinha todos os
       vizinhos dentro do afastamento e a rota não saía do lugar. A interferência que sobrar
       aparece no fim, na conferência 3D (aviso com os dois ids) — nunca escondida. */
    Object.keys(alvos).concat([String(ini)]).forEach(function (ks) {   // rota:saida
      var k = Number(ks), p = G.pt(k), usadas = [];
      arv.segs().forEach(function (S) {
        if (d2(S.a, p) < EPS) usadas.push(un2(S.a, S.b)); else if (d2(S.b, p) < EPS) usadas.push(un2(S.b, S.a));
        else if (ptSeg2(p, S.a, S.b).d < EPS) { usadas.push(un2(S.a, S.b)); usadas.push(un2(S.b, S.a)); }
      });
      W.tubos.forEach(function (T) { if (d2(T.a, T.b) < EPS) return; if (d2(T.a, p) < EPS) usadas.push(un2(T.a, T.b)); else if (d2(T.b, p) < EPS) usadas.push(un2(T.b, T.a)); });
      for (var d = 0; d < NDIR; d++) {
        if (usadas.some(function (u) { return u.x * DI[d] + u.z * DJ[d] > Math.SQRT1_2; })) continue;
        var v = G.viz(k, d);
        while (v >= 0 && d2(G.pt(v), p) <= alc + EPS) { corredor[v] = 1; v = G.viz(v, d); }
      }
    });
    var ctxR = contextoRota(W, G, { b0: o.b0, b1: o.b1, r: o.r, rArv: o.rArv, modo: o.modo, sistema: arv.sistema, arvore: arv, ignorar: ign, ini: ini, alvos: alvos, raiz: o.raizPlanta, corredor: corredor, dePt: { x: o.de.x, z: o.de.z }, corredorSolto: !!o.corredorSolto });
    /* ⚠ ESGOTO: se a junção de 45° não cabe naquele ponto, o ponto sai da lista e a
       busca recomeça — antes ficava um tê de 90° no horizontal com um aviso, e o
       teste mostrou que quase sempre havia outro ponto da árvore onde a de 45° cabia.
       ⚠ O MESMO para a curva: rota colada no limite da folga (ex.: a 10 cm da descida da
       bacia) não tem espaço para os dois desvios de 45°; aquele nó fica proibido de virar
       e a busca recomeça. Só se nada fechar fica o joelho, com aviso e o ponto. */
    var semCurva = {}, melhor = null;
    for (var volta = 0; volta < MAX_VOLTAS; volta++) {
      var res = aEstrela(G, ini, { livre: ctxR.livre, aresta: ctxR.aresta, alvos: alvos, curva: o.curva, max: P.maxEstados, semCurva: semCurva });
      if (!res) break;
      var pts = simplificar(res.nos.map(function (k) { return G.pt(k); })), alvo = alvos[res.alvo], juncao = null, av = [];
      if (alvo.tipo === "aresta") {
        var a = arv.arestas[alvo.aresta], A = arv.nos[a.de], B = arv.nos[a.para], J = pts[pts.length - 1];
        juncao = { aresta: a.id, x: J.x, z: J.z };
        var tentarJ = o.juncao45 && pts.length >= 2;   // rota:tentaJuncao
        if (tentarJ) {
          /* a junção entra a 45° NO SENTIDO DO ESCOAMENTO — o último trecho chega
             perpendicular em J; vira P → J' (J' = J + d·u a jusante) */
          var u = un2(A, B), prev = pts[pts.length - 2], v = un2(prev, J), Lseg = d2(prev, J);
          var lim = pts.length >= PONTOS_CANTO ? Lseg / 2 - P.margemNo / 2 : Lseg - P.margemNo;
          var d = r4(Math.min(P.chanfro, lim, d2(J, B) - P.margemNo)), ok = false;   // rota:juncao45
          for (var tent = 0; tent < TENTATIVAS && !ok && d >= P.margemNo / 2; tent++) {
            var Pp = { x: r4(J.x - v.x * d), z: r4(J.z - v.z * d) }, Jl = { x: r4(J.x + u.x * d), z: r4(J.z + u.z * d) };
            if (ctxR.segLivre(Pp, Jl, a.id)) { pts[pts.length - 1] = Pp; pts.push(Jl); juncao.x = Jl.x; juncao.z = Jl.z; ok = true; } else d = r4(d / 2);
          }
          if (!ok) {
            delete alvos[res.alvo];
            if (Object.keys(alvos).length && volta < MAX_VOLTAS - 1) continue;
            av.push(prob("junção a 90° no esgoto em " + fxz(J.x, J.z) + ": sem espaço para a de 45° — ajuste à mão ou refaça com a grade mais fina", [pt3(J.x, null, J.z)], { tipo: "parametro", campo: "passo", sugerido: r4(P.passo / 2) }));
          }
        }
      }
      var falhos = [];
      if (o.chanfrar) pts = chanfrar(pts, P, function (p, q) { return ctxR.segLivre(p, q, juncao ? juncao.aresta : null); }, av, falhos);
      melhor = { res: res, pts: pts, alvo: alvo, juncao: juncao, avisos: av };
      if (!falhos.length) break;
      var novo = false;
      falhos.forEach(function (c) { var k = G.idx(c.x, c.z); if (k >= 0 && !semCurva[k]) { semCurva[k] = 1; novo = true; } });
      if (!novo) break;
    }
    if (!melhor) return { erro: "sem caminho livre" };
    var cruz = {}, idsCruz = [], rs = melhor.res;
    for (var i = 1; i < rs.nos.length; i++) { var ar = ctxR.aresta(rs.nos[i - 1], rs.nos[i]); if (ar && ar.cruz) Object.keys(ar.cruz).forEach(function (k) { cruz[k] = (cruz[k] || 0) + ar.cruz[k]; }); if (ar && ar.ids) idsCruz = idsCruz.concat(ar.ids); }
    return { pts: melhor.pts, alvo: melhor.alvo, juncao: melhor.juncao, cruz: cruz, idsCruz: idsCruz, avisos: melhor.avisos, custo: rs.custo };
  }

  /* põe a rota na árvore: devolve o nó da folha */
  function enxertar(arv, rota, folha, info) {
    var pts = rota.pts, ids = [];
    var noIni = folha.no != null ? folha.no : arv.no(pts[0].x, pts[0].z, folha.tipo, folha.ref);
    ids.push(noIni);
    for (var i = 1; i < pts.length - 1; i++) ids.push(arv.no(pts[i].x, pts[i].z, "curva"));
    var fim;
    if (rota.alvo.tipo === "raiz") { if (arv.raiz == null) arv.raiz = arv.no(pts[pts.length - 1].x, pts[pts.length - 1].z, "raiz"); fim = arv.raiz; }
    else if (rota.alvo.tipo === "peca") fim = rota.alvo.no;
    else fim = arv.dividir(rota.juncao.aresta, rota.juncao.x, rota.juncao.z);
    ids.push(fim);
    for (var j = 1; j < ids.length; j++) arv.aresta(ids[j - 1], ids[j], info);
    return noIni;
  }

  /* ===================================================== ESGOTO (um grupo) */
  function faixaEs(W, g, raizD) {
    var P = W.P, E = W.E;
    if (E.es === "enchimento") return { b0: P.terreo ? -INF : g.piso - P.alturaEnchimento, b1: g.piso - P.cobrimento, nome: "enchimento do piso" };
    /* forro do pavimento de baixo: entre o fundo da laje sob o ambiente e o forro */
    var cand = [];
    g._pontos.forEach(function (p) { lajeEm(W.O.lajes, p.x, p.z).forEach(function (l) { if (l.topo <= g.piso + EPS && cand.indexOf(l) < 0) cand.push(l); }); });
    if (!cand.length) return falha("nenhuma laje sob o ambiente (térreo, ou a laje não veio nos obstáculos): não há forro de baixo", g._pontos.slice(0, 1).map(function (p) { return pt3(p.x, p.y, p.z); }), { tipo: "obstaculos", falta: "laje", texto: "modele a laje sob o ambiente (ou use parede/piso)" });
    var fundo = Math.min.apply(null, cand.map(function (l) { return l.fundo; }));
    var forro = P.cotaForroInferior != null ? P.cotaForroInferior : fundo - P.alturaPlenoInferior;
    if (!(forro < fundo - EPS)) return falha("forro de baixo acima da laje", cand.map(function (l) { return l.id; }), { tipo: "parametro", campo: "cotaForroInferior", sugerido: r4(fundo - P.alturaPlenoInferior) });
    return { b0: forro + P.cobrimento, b1: fundo - P.cobrimento, nome: "forro do pavimento de baixo", lajes: cand };
  }

  function rotearEsgoto(W, g, grupoIdx, saida) {
    var P = W.P, NRM = W.N, B = BI(), mat = P.material.esgoto, raizD = normDestino(g.destinos.esgoto, "esgoto");
    var arv = new Arvore("esgoto", g.id), folhas = [], avisos = [];
    /* folhas: pontos de esgoto dos aparelhos e as peças do grupo (o que vai à caixa de gordura sai daqui) */
    g.aparelhos.forEach(function (a) {
      if (g.semEsgoto && g.semEsgoto[a.id]) return;   // rota:gordura
      a.conectores.filter(function (c) { return c.sistema === "esgoto"; }).forEach(function (c) {
        folhas.push({ tipo: "aparelho", ref: a.id + ":" + c.id, ap: a, aparelho: a.aparelho, aparelhoEs: a.aparelhoEs || null, x: c.x, y: c.y, z: c.z, dnCon: c.dn, ponta: c.ponta || null });
      });
    });
    /* a saída da peça é a do CATÁLOGO do biminst (PECAS.dn "100x40" → 40; caixa
       "150x185x75" → 75) — geometria da peça comprada, não valor de norma */
    g.pecas.forEach(function (k) {
      var ds = txt(k.dn || B.PECAS[k.peca].dn).split("x"), saidaDn = num(ds[ds.length - 1], 0);   /* PROJETO INTELIGENTE: o DN da PRÓPRIA peça (a caixa 100x100x50 saía como a padrão 150x185x75) */
      folhas.push({ tipo: "peca", ref: k.id, peca: k, aparelho: k.peca, x: k.x, y: k.y, z: k.z, dnCon: saidaDn });
    });
    if (!folhas.length) return { arv: null, ops: [], vazio: true };
    if (!raizD) return falha("esgoto: destino (tubo de queda, caixa de inspeção ou ponto) não informado para o ambiente " + g.id, [], { tipo: "destino", sistema: "esgoto", grupo: g.id });
    var F = faixaEs(W, g, raizD); if (F.erro) return F;
    /* DN e UHC de cada folha (sem tabela → pendência, nunca número inventado) */
    folhas.forEach(function (f) {
      var uso = "traçado: " + f.ref, forc = num(P.dn[f.ref], num(P.dn[f.ap ? f.ap.id : f.ref], null));
      /* caixa/ralo sifonado não tem UHC próprio: soma o que chega nele */
      if (RECEPTOR[f.aparelho]) { f.uhc = 0; f.dn = comercial(mat, forc != null ? forc : (f.dnCon || B.MATERIAIS[mat].dn)); return; }
      /* MICTÓRIO (19/10/2026): a linha da Tabela 3 da NBR 8160 sai do TIPO DE DESCARGA (f.aparelhoEs), não do nome genérico "mictorio" (sem linha: caía no DN 100 do material) */
      var apEs = f.aparelhoEs || f.aparelho, dmin = NRM.esAparelho(apEs, "dn_min", uso);
      f.dn = forc != null ? forc : (dmin != null ? dmin : (f.dnCon > 0 ? f.dnCon : null));
      f.uhc = NRM.esAparelho(apEs, "uhc", uso);
      if (f.uhc == null && f.dn != null) f.uhc = NRM.uhcPorDn(f.dn, uso);
      if (f.uhc == null) f.uhc = 0;
      if (f.dn == null && !RECEPTOR[f.aparelho]) { saida.pendencias.push(pend("es.aparelhos[" + f.aparelho + "].dn_min", "DN do ramal de descarga de " + f.ref + " sem tabela nem DN no ponto — usado o DN padrão do material; rode o dimensionamento", [f.ap ? f.ap.id : f.ref], { tipo: "dimensionar" })); f.dn = B.MATERIAIS[mat].dn; }
      if (f.dn != null) f.dn = comercial(mat, f.dn);
    });
    var receptores = folhas.filter(function (f) { return RECEPTOR[f.aparelho]; });
    var paraCaixa = folhas.filter(function (f) { return PARA_CAIXA[f.aparelho]; });
    var bacias = folhas.filter(function (f) { return BACIA[f.aparelho]; });
    var outros = folhas.filter(function (f) { return !RECEPTOR[f.aparelho] && !PARA_CAIXA[f.aparelho] && !BACIA[f.aparelho]; });
    function perto(f) { return d2(f, raizD); }
    function ord(l) { return l.slice().sort(function (a, b) { return perto(a) - perto(b) || (a.ref < b.ref ? -1 : 1); }); }
    var G = grade(folhas.concat([raizD]), P, raizD);
    var rMax = Math.max.apply(null, folhas.map(function (f) { return (f.dn || 0) / 1000 / 2; }));
    var usadaRaiz = false, caixaAlvo = {};
    if (!receptores.length && paraCaixa.length) saida.pendencias.push(pend("rota.caixa_sifonada", "ambiente " + g.id + " sem caixa sifonada: " + paraCaixa.map(function (f) { return f.ref; }).join(", ") + " ligados direto ao ramal (cada um precisa de sifão e ventilação) — ponha a caixa no modelo", paraCaixa.map(function (f) { return f.ap ? f.ap.id : f.ref; }), { tipo: "inserirPeca", peca: "caixa_sifonada", grupo: g.id }));
    var fila = ord(bacias).concat(ord(receptores), ord(outros), ord(paraCaixa));
    for (var i = 0; i < fila.length; i++) {
      var f = fila[i], ign = {};
      ign[f.ref] = 1; if (f.peca) ign[f.peca.id] = 1;
      var o = { de: f, b0: F.b0, b1: F.b1, r: (f.dn || 0) / 1000 / 2, rArv: rMax, modo: "livre", ignorar: ign, curva: P.pesos.conexao * 2,
                folgaJuncao: P.chanfro + P.margemNo * 2, juncao45: true, chanfrar: true, raizPlanta: raizD, aceitaCaixa: false };
      var vaiCaixa = PARA_CAIXA[f.aparelho] && receptores.length;
      if (vaiCaixa) {
        /* lavatório, chuveiro, bidê, ralo seco → a caixa (ou ralo) sifonada mais perto */
        var rc = receptores.slice().sort(function (a, b) { return (a.aparelho === "caixa_sifonada" ? 0 : 1) - (b.aparelho === "caixa_sifonada" ? 0 : 1) || d2(f, a) - d2(f, b) || (a.ref < b.ref ? -1 : 1); })[0];
        var noR = arv.porRef[rc.ref];
        if (noR == null) return falha("caixa sifonada " + rc.ref + " sem rota até o destino", [rc.ref], { tipo: "ajustar", ids: [rc.ref] });
        o.alvoPeca = { x: rc.x, z: rc.z, no: noR }; ign[rc.ref] = 1; ign[rc.peca.id] = 1; caixaAlvo[f.ref] = rc.ref;
      } else {
        /* ⚠ uma entrada por ambiente no TQ (a 2ª chega na árvore); caixa/ponto: idem */
        o.raiz = usadaRaiz ? null : raizD; ign[raizD.id || "destino-es"] = 1;
      }
      if (!o.raiz && !o.alvoPeca && !arv.arestas.length) return falha("sem destino para " + f.ref, [f.ap ? f.ap.id : f.ref], { tipo: "destino", sistema: "esgoto", grupo: g.id });
      var rota = rotear(W, G, arv, o);
      if (rota.erro) return falha("esgoto de " + f.ref + ": " + rota.erro + " até " + (vaiCaixa ? "a caixa sifonada" : "o destino") + " (" + F.nome + ")", [f.ap ? f.ap.id : f.ref, pt3(f.x, f.y, f.z)], { tipo: "parametro", campo: "passo", sugerido: r4(P.passo / 2) });
      if (rota.alvo.tipo === "raiz") usadaRaiz = true;
      somarCruz(W, rota);
      rota.avisos.forEach(function (a) { avisos.push(a); });
      var noF = enxertar(arv, rota, { tipo: f.tipo, ref: f.ref, no: arv.porRef[f.ref] }, { paraCaixa: !!vaiCaixa });
      arv.nos[noF].folha = f;
    }
    /* ---- DN e UHC a jusante (o DN nunca diminui: max dos de montante + tabela de ramal pela soma de UHC) */
    var porNo = {}; arv.nos.forEach(function (n) { porNo[n.id] = n; });
    function montante(nid, memo) {
      if (memo[nid]) return memo[nid];
      var n = arv.nos[nid], u = 0, dn = 0, refs = [];
      if (n.folha) { u += n.folha.uhc || 0; dn = Math.max(dn, n.folha.dn || 0); refs.push(n.folha.ref); }
      n.entram.forEach(function (aid) { var m = montante(arv.arestas[aid].de, memo); u += m.u; dn = Math.max(dn, m.dn); refs = refs.concat(m.refs); });
      return (memo[nid] = { u: u, dn: dn, refs: refs });
    }
    var memo = {};
    arv.arestas.forEach(function (a) {
      var m = montante(a.de, memo), dn = m.dn;
      if (m.refs.length > 1 || RECEPTOR[(arv.nos[a.de].folha || {}).aparelho]) { var dt = NRM.dnRamal(m.u, "traçado: ramal de esgoto"); if (dt != null) dn = Math.max(dn, dt); }
      a.dn = comercial(mat, dn || B.MATERIAIS[mat].dn); a.uhc = m.u; a.decl = NRM.decl(a.dn, P);
    });
    /* ---- COTAS: da raiz para cima, com a declividade de cada DN */
    var sobe = {}, ordem = [];
    (function visita(nid, s) { sobe[nid] = s; ordem.push(nid); arv.nos[nid].entram.forEach(function (aid) { var a = arv.arestas[aid], A = arv.nos[a.de], Bn = arv.nos[a.para]; visita(a.de, s + a.decl.i / 100 * d2(A, Bn)); }); })(arv.raiz, 0);
    var hi = INF, lo = -INF, motivoHi = "", motivoLo = "";
    var quemLo = null;
    function lim(nid, u, l, rUp, rLo, qLo) {
      if (u - sobe[nid] < hi) { hi = u - sobe[nid]; motivoHi = rUp; }
      if (l - sobe[nid] > lo) { lo = l - sobe[nid]; motivoLo = rLo; quemLo = qLo || null; }
    }
    arv.nos.forEach(function (n) {
      var rN = Math.max.apply(null, [0].concat(n.entram.map(function (aid) { return raio(arv.arestas[aid].dn); }), n.sai != null ? [raio(arv.arestas[n.sai].dn)] : []));
      lim(n.id, F.b1 - rN, F.b0 + rN, "topo da faixa (" + F.nome + ")", "fundo da faixa (" + F.nome + ")", { tipo: "faixa" });
      var f = n.folha;
      if (f && f.tipo === "aparelho") lim(n.id, f.y - P.quedaMin, -INF, "ponto de " + f.ref + " (descida mínima)", "");
      /* ⚠ peça que RECEBE (caixa sifonada) tem de ficar dentro da captura dela:
         os ramais que chegam e o que sai se ligam ali. Ralo seco pode sair por
         baixo da captura com um trecho vertical (descida da peça). */
      if (f && f.tipo === "peca") {
        var recebe = !!RECEPTOR[f.aparelho] || n.entram.length > 0;
        lim(n.id, Math.min(f.y, f.peca.hub.yTop) - EPS, recebe ? f.peca.hub.yBot + P.folga : -INF, "topo da " + f.ref, "fundo da " + f.ref, { tipo: "peca", id: f.peca.id });
      }
    });
    if (raizD.vertical) lim(arv.raiz, raizD.yTopo - P.margemNo, raizD.yBase + P.margemNo, "topo do " + (raizD.id || "TQ"), "base do " + (raizD.id || "TQ"), { tipo: "destino", id: raizD.id });
    var R;
    if (!raizD.vertical && !raizD.cotaLivre) {
      R = raizD.y;
      if (R > hi + EPS || R < lo - EPS) return falha("a cota do destino (" + f2(R) + " m) não fecha com a declividade mínima: " + (R > hi ? "o ponto mais alto pede a raiz até " + f2(hi) + " m (" + motivoHi + ")" : "falta altura: raiz no mínimo " + f2(lo) + " m (" + motivoLo + ")"), [raizD.id || pt3(raizD.x, raizD.y, raizD.z)], { tipo: "moverDestino", sistema: "esgoto", id: raizD.id, y: R > hi ? chao4(hi) : teto4(lo) });
    } else {
      R = chao4(hi);
      /* ⚠ COTA PELO FLUXO (frente A, 19/10/2026 — D-05; decisão do Rogério, que substitui a "cota de controle" da manhã):
         o aparelho/desconector MAIS A MONTANTE manda na cota de partida — R = chao4(hi) é a raiz mais alta em que nenhum nó passa
         do teto dele (o ponto do aparelho com a descida mínima, o topo da faixa sob o piso: o cobrimento mínimo), e cada trecho a
         jusante DESCE com a declividade mínima do DN (NBR 8160, es.declividade_minima). Na caixa de destino (entradaMax: a entrada
         pela parede, abaixo da tampa) o ÚLTIMO trecho ajusta a declividade dentro de [mínima, máxima] (es8160.declividade_maxima)
         para entrar na cota dela. Se o último trecho na máxima não basta, o resto da árvore desce o que falta (partida mais funda,
         declividade constante, sem degrau) COM AVISO de quanto a caixa teria de subir; se nem assim (o fundo da faixa ou da caixa
         sifonada não deixa), sobra a QUEDA antes da caixa (tubo de queda, R-A4 do PADROES-PROJETO-RA) também avisada. E a caixa
         rasa demais (fundo acima do tubo) é avisada com a profundidade necessária. Nunca degrau calado.
         Antes (manhã de 19/10) a árvore INTEIRA descia até a entrada da caixa: a partida dependia da caixa, não do fluxo. */
      var Rbase = null, ajusteFluxo = null;
      if (raizD.entradaMax) {
        var dnRz = Math.max.apply(null, [0].concat(arv.nos[arv.raiz].entram.map(function (aid) { return arv.arestas[aid].dn; })));
        /* entradaMax = { DN: cota MÁXIMA do eixo do tubo na entrada da caixa } (a caixa sabe a laje, a folga e a bolsa); o DN que não
           consta usa o MENOR DN da tabela acima dele (entrada mais funda) — o mais fundo é o mais seguro */
        var dnsT = Object.keys(raizD.entradaMax).map(Number).sort(function (x, y) { return x - y; }), dnT = dnsT.filter(function (d) { return d >= dnRz - EPS; })[0];
        if (dnT == null) dnT = dnsT[dnsT.length - 1];
        var capCI = dnT != null ? chao4(num(raizD.entradaMax[dnT], INF)) : INF;
        var iMax = capCI < R ? NRM.declMax("traçado: declividade máxima do esgoto (chegada na caixa)") : null;
        if (capCI < R && iMax == null) {
          /* sem a declividade máxima na tabela não há como ajustar o fim: a árvore desce inteira (o jeito antigo), com pendência */
          saida.pendencias.push(pend("es8160.declividade_maxima", "declividade máxima do esgoto sem tabela: o ramal desceu inteiro até a entrada da caixa " + (raizD.id || "") + " em vez de ajustar só o fim", [raizD.id || pt3(raizD.x, null, raizD.z)], { tipo: "dimensionar" }));
          R = capCI < lo - EPS && lo <= R + EPS ? teto4(lo) : capCI;
        } else if (capCI < R) {
          var Rnat = R, entR = arv.nos[arv.raiz].entram;
          function iUlt(a) { return Math.max(iMax, a.decl.i); }
          function Lde(a) { return d2(arv.nos[a.de], arv.nos[a.para]); }
          /* até onde a raiz desce com o último trecho na máxima, sem mexer no resto */
          var Rfim = -INF; entR.forEach(function (aid) { var a = arv.arestas[aid], yDe = teto4(Rnat + a.decl.i / 100 * Lde(a)); Rfim = Math.max(Rfim, teto4(yDe - iUlt(a) / 100 * Lde(a))); });
          var desce = Math.max(0, Rfim - capCI);
          Rbase = r4(Rnat - desce);
          if (Rbase < lo - EPS) Rbase = teto4(lo);   /* o fundo da faixa / da caixa sifonada não deixa a partida descer mais */
          var Rr = capCI; entR.forEach(function (aid) { var a = arv.arestas[aid], yDe = teto4(Rbase + a.decl.i / 100 * Lde(a)); Rr = Math.max(Rr, teto4(yDe - iUlt(a) / 100 * Lde(a))); });
          R = Rr; ajusteFluxo = { Rnat: Rnat, iMax: iMax };
          var onde = [raizD.id || pt3(raizD.x, null, raizD.z)], acaoCx = { tipo: "ajustar", ids: raizD.id ? [raizD.id] : [] };
          if (Rnat - Rbase > EPS) avisos.push(probFluxo("para entrar na caixa " + (raizD.id || "de destino") + " (entrada pela parede a " + f2(capCI) + " m) com o último trecho na declividade máxima (" + iMax + " %), o esgoto do " + F.nome + " partiu " + fcm(Rnat - Rbase) + " cm abaixo do cobrimento mínimo, em declividade constante: para partir no mínimo, a caixa teria de estar " + fcm(Rnat - Rbase) + " cm mais alta (ou mais longe)", onde, acaoCx));
          if (R > capCI + EPS) avisos.push(probFluxo("o esgoto do " + F.nome + " chega na caixa " + (raizD.id || "de destino") + " a " + f2(R) + " m e a entrada pela parede dela fica em " + f2(capCI) + " m: QUEDA de " + fcm(R - capCI) + " cm antes da caixa (tubo de queda) — o " + (motivoLo || "fundo do " + F.nome) + " não deixa a partida descer mais. Para chegar sem queda, a caixa teria de estar " + fcm(R - capCI) + " cm mais alta", onde, acaoCx));
        }
        /* a caixa RASA: o fundo dela acima do fundo do tubo que chega (R-A6: o tubo chega ao fundo, na canaleta) */
        if (raizD.fundo != null && R - raio(dnRz) < raizD.fundo - EPS) avisos.push(prob("a caixa " + (raizD.id || "de destino") + " é rasa para o esgoto do " + F.nome + ": o tubo chega com o fundo a " + f2(R - raio(dnRz)) + " m e o fundo da caixa está a " + f2(raizD.fundo) + " m — profundidade necessária de pelo menos " + f2(num(raizD.topo, 0) - (R - raio(dnRz))) + " m", [raizD.id || pt3(raizD.x, null, raizD.z)], { tipo: "ajustar", ids: raizD.id ? [raizD.id] : [], profundidade: r4(num(raizD.topo, 0) - (R - raio(dnRz))) }));
        if (capCI < INF) arv.cotaControle = { cota: R, caixa: raizD.id, partida: Rbase != null ? Rbase : R, natural: ajusteFluxo ? ajusteFluxo.Rnat : R };
      }
      /* ⚠ duas entradas no mesmo TQ e na mesma cota = nó de 4 trechos (cruzeta, sem SINAPI):
         a do ambiente seguinte desce o espaçamento */
      var usadas = W.entradas[raizD.chave] || [];
      for (var guard = 0; guard < usadas.length + 1; guard++) {
        var choque = usadas.filter(function (u) { return Math.abs(u - R) < P.espacamentoEntradas - EPS; });   // rota:espacamento
        if (!choque.length) break;
        var R0e = R; R = chao4(Math.min.apply(null, choque) - P.espacamentoEntradas);
        if (Rbase != null) Rbase = r4(Rbase - (R0e - R));   /* a árvore acompanha a entrada que desceu o espaçamento */
      }
      if ((Rbase != null ? Rbase : R) < lo - EPS) {
        /* a solução é o número: quanto a faixa precisa crescer para a declividade caber */
        /* ⚠ só sugere aumentar a faixa quando é o FUNDO da faixa que manda — quando quem manda
           é o fundo da caixa sifonada, mais forro não resolve (o teste reaplica a sugestão) */
        var falta = cmAcima(lo - R), txt0 = "falta " + fcm(lo - R) + " cm de altura no " + F.nome + " para a declividade mínima (" + motivoHi + " × " + motivoLo + ")";
        if (quemLo && quemLo.tipo === "faixa") {
          var campo = W.E.es === "enchimento" ? "alturaEnchimento" : (P.cotaForroInferior != null ? "cotaForroInferior" : "alturaPlenoInferior");
          var sug = campo === "cotaForroInferior" ? r4(P.cotaForroInferior - falta) : r4(P[campo] + falta);
          return falha(txt0, [raizD.id || pt3(raizD.x, null, raizD.z)], { tipo: "parametro", campo: campo, sugerido: sug, falta: falta });
        }
        if (quemLo && quemLo.tipo === "peca") return falha(txt0 + " — a peça " + quemLo.id + " é rasa para o ramal que chega nela: aproxime-a do destino ou dos aparelhos", [quemLo.id], { tipo: "ajustar", ids: [quemLo.id], falta: falta });
        return falha(txt0, [raizD.id || pt3(raizD.x, null, raizD.z)], { tipo: "moverDestino", sistema: "esgoto", id: raizD.id, yBase: r4(raizD.yBase - falta) });
      }
      (W.entradas[raizD.chave] = usadas).push(R);
    }
    /* cotas com arredondamento PARA CIMA a montante (declividade nunca abaixo da mínima) */
    var Y = {}; Y[arv.raiz] = Rbase != null ? Rbase : R;
    ordem.forEach(function (nid) { arv.nos[nid].entram.forEach(function (aid) { var a = arv.arestas[aid]; Y[a.de] = teto4(Y[a.para] + a.decl.i / 100 * d2(arv.nos[a.de], arv.nos[a.para])); }); });
    /* COTA PELO FLUXO: o resto da árvore na declividade mínima a partir da partida; o último trecho desce até a entrada da caixa */
    Y[arv.raiz] = R;
    if (ajusteFluxo) arv.ajusteFluxo = { natural: ajusteFluxo.Rnat, partida: Rbase, raiz: R, declMax: ajusteFluxo.iMax };
    arv.Y = Y; arv.faixa = F; arv.destino = raizD; arv.caixaAlvo = caixaAlvo;
    return { arv: arv, avisos: avisos };
  }

  /* ===================================================== VENTILAÇÃO (um grupo) */
  function rotearVentilacao(W, g, es, saida, gi) {
    var P = W.P, NRM = W.N, arv = es.arv, out = { trechos: [], avisos: [], contatos: [], descr: [] };
    if (!arv) return out;
    var colD = normDestino(g.destinos.ventilacao, "ventilacao");
    /* desconectores: caixa/ralo sifonado e aparelho com sifão próprio que NÃO
       descarrega numa caixa (o que descarrega nela é protegido por ela) */
    var desc = arv.nos.filter(function (n) { var f = n.folha; return f && (RECEPTOR[f.aparelho] || (SIFAO_PROPRIO[f.aparelho] && !arv.caixaAlvo[f.ref])); });
    var precisa = [];
    desc.forEach(function (n) {
      var f = n.folha, L = f.tipo === "aparelho" ? f.y - arv.Y[n.id] : 0, cam = [], id = n.id, guard = 0;
      while (arv.nos[id].sai != null && guard++ <= arv.arestas.length) { var a = arv.arestas[arv.nos[id].sai]; cam.push(a); L += d3(p3(arv, a.de), p3(arv, a.para)); id = a.para; }
      var dnR = cam.length ? cam[0].dn : f.dn, uso = "traçado: ventilação de " + f.ref;
      var limite = NRM.distVent(dnR, uso);
      if (limite == null) { out.descr.push(f.ref + ": distância até a ventilação não verificada (tabela pendente)"); return; }
      if (arv.destino.ventilado && L <= limite + EPS) { out.descr.push(f.ref + ": " + f2(L) + " m até o " + (arv.destino.id || "TQ") + " ventilado ≤ " + f2(limite) + " m (DN " + dnR + ") — sem ramal de ventilação"); return; }
      precisa.push({ no: n, f: f, cam: cam, L: L, limite: limite, dn: dnR, quedaIni: f.tipo === "aparelho" ? f.y - arv.Y[n.id] : 0 });
    });
    if (!precisa.length) return out;
    if (!colD) {
      precisa.forEach(function (q) { saida.pendencias.push(pend("rota.coluna_ventilacao", q.f.ref + " a " + f2(q.L) + " m do ponto ventilado (máximo " + f2(q.limite) + " m, DN " + q.dn + ") e nenhuma coluna de ventilação indicada — ramal de ventilação não traçado", [q.f.ap ? q.f.ap.id : q.f.ref], { tipo: "destino", sistema: "ventilacao", grupo: g.id })); });
      return out;
    }
    /* ⚠ entradas na MESMA coluna em cotas diferentes (como no TQ): o ramal do banheiro e o da pia chegavam
       na coluna na mesma cota por lados opostos = nó de 4 trechos (cruzeta, sem SINAPI) */
    var cota = r4(P.cotaVentilacao != null ? P.cotaVentilacao : g.piso + P.peDireito + P.alturaVentForro), usadasV = W.entradas[colD.chave] || [];
    for (var gV = 0; gV <= usadasV.length; gV++) {
      var chq = usadasV.filter(function (u) { return Math.abs(u - cota) < P.espacamentoEntradas - EPS; });   // rota:espacamentoVent
      if (!chq.length) break;
      cota = r4(Math.min.apply(null, chq) - P.espacamentoEntradas);
    }
    (W.entradas[colD.chave] = usadasV).push(cota);
    if (colD.vertical && (cota < colD.yBase + P.margemNo || cota > colD.yTopo - P.margemNo)) {
      saida.pendencias.push(pend("rota.coluna_ventilacao", "a coluna de ventilação " + (colD.id || "") + " não chega à cota do ramal de ventilação (" + f2(cota) + " m)", [colD.id || pt3(colD.x, null, colD.z)], { tipo: "parametro", campo: "cotaVentilacao", sugerido: r4(Math.min(colD.yTopo, cota) - P.margemNo * 2) }));
      return out;
    }
    var mat = P.material.ventilacao, vArv = new Arvore("ventilacao", g.id), usadaRaiz = false;
    var paredes = W.O.lista.filter(function (ob) { return ob.tipo === "parede"; });
    function distParede(c) {
      return paredes.reduce(function (m, w) { var lp = local(w, c.x, c.z), du = Math.max(0, Math.abs(lp.u) - w.hl), dv = Math.max(0, Math.abs(lp.v) - w.hw); return Math.min(m, Math.sqrt(du * du + dv * dv)); }, INF);
    }
    var prontos = [];
    precisa.forEach(function (q) {
      /* o ponto de contato: no MEIO de um trecho horizontal do ramal do
         desconector, a no máximo (limite − margem) dele; entre os candidatos,
         o mais perto de uma parede (o tubo que sobe vai embutido) */
      var cand = [], s0 = q.quedaIni;
      q.cam.forEach(function (a) {
        var A = p3(arv, a.de), Bq = p3(arv, a.para), L = d3(A, Bq), n = Math.floor(L / P.passo);
        for (var k = 1; k < n; k++) {
          var s = k * P.passo; if (s < P.margemNo || L - s < P.margemNo || s0 + s > q.limite - P.margemNo) continue;
          var t = s / L, c = { x: r4(A.x + (Bq.x - A.x) * t), z: r4(A.z + (Bq.z - A.z) * t), dist: s0 + s };
          var tp = d2(A, c) / (d2(A, Bq) || 1); c.y = r4(A.y + (Bq.y - A.y) * tp);
          c.parede = distParede(c);
          /* ⚠ fora da captura das peças: tubo de ventilação dentro do cilindro da caixa sifonada
             o modelador lê como "ventilação terminando em caixa de esgoto" (sistemas misturados) */
          if (g.pecas.some(function (k) { return d2(c, k) <= k.hub.r + P.folga + raio(q.dn); })) continue;
          var topoS = { x: c.x, y: cota, z: c.z };
          if (W.tubos.some(function (T) { return T.sistema === "agua_fria" && segSeg3(c, topoS, T.a, T.b) - T.r - raio(q.dn) < P.afastamento - FOLGA_LIMITE; })) continue;   // rota:subidaAgua
          cand.push(c);
        }
        s0 += L;
      });
      if (!cand.length) { saida.pendencias.push(pend("rota.ventilacao." + q.f.ref, "nenhum ponto do ramal de " + q.f.ref + " a menos de " + f2(q.limite) + " m dele para ligar a ventilação — ponha a ventilação à mão", [q.f.ap ? q.f.ap.id : q.f.ref], { tipo: "ajustar", ids: [q.f.ap ? q.f.ap.id : q.f.ref] })); return; }
      cand.sort(function (a, b) { return a.parede - b.parede || a.dist - b.dist; });
      q.c = cand[0];
      var uhc = q.cam.length ? q.cam[0].uhc : 0, dv = NRM.dnVent(BACIA[q.f.aparelho] ? 1 : 0, uhc, "traçado: ventilação de " + q.f.ref);
      if (dv == null) { saida.pendencias.push(pend("es.ventilacao.ramal", "DN do ramal de ventilação de " + q.f.ref + " sem tabela: usado o DN do ramal de esgoto (" + q.dn + ") — confira", [q.f.ap ? q.f.ap.id : q.f.ref], { tipo: "tabela", chave: "es.ventilacao.ramal" })); dv = q.dn; }
      q.dnV = comercial(mat, dv);
      prontos.push(q);
      W.verticais.push({ x: q.c.x, z: q.c.z, y0: q.c.y, y1: cota, r: raio(q.dnV), ref: "vent:" + q.f.ref, sistema: "ventilacao" });
    });
    if (!prontos.length) return out;
    var G = grade(prontos.map(function (q) { return q.c; }).concat([colD]), P, colD);
    prontos.forEach(function (q) {
      var c = q.c, topo = { x: c.x, y: cota, z: c.z }, rV = raio(q.dnV);
      if (c.parede > P.tolFace) out.avisos.push(prob("ventilação de " + q.f.ref + " sobe a " + f2(c.parede) + " m da parede mais perto em " + fxz(c.x, c.z) + ": leve o tubo para dentro da parede ou do shaft", [pt3(c.x, c.y, c.z)], { tipo: "ajustar", ids: ["vent:" + q.f.ref] }));
      var ign = {}; ign[colD.id || "destino-ve"] = 1; ign["vent:" + q.f.ref] = 1;
      var rota = rotear(W, G, vArv, { de: c, b0: cota - rV, b1: cota + rV, r: rV, rArv: rV, modo: "livre", ignorar: ign, curva: P.pesos.conexao,
                                      folgaJuncao: P.margemNo, juncao45: false, chanfrar: false, raiz: usadaRaiz ? null : colD, raizPlanta: colD, aceitaCaixa: true });
      if (rota.erro) { saida.pendencias.push(pend("rota.ventilacao." + q.f.ref, "ramal de ventilação de " + q.f.ref + ": " + rota.erro + " até a coluna", [q.f.ap ? q.f.ap.id : q.f.ref, colD.id], { tipo: "parametro", campo: "passo", sugerido: r4(P.passo / 2) })); return; }
      if (rota.alvo.tipo === "raiz") usadaRaiz = true;
      somarCruz(W, rota);
      out.trechos.push({ sistema: "ventilacao", material: mat, dn: q.dnV, p1: { x: c.x, y: c.y, z: c.z }, p2: topo, tipo: "subida", ref: q.f.ref });
      out.contatos.push({ x: c.x, y: c.y, z: c.z, ref: q.f.ref });
      out.descr.push(q.f.ref + ": " + f2(q.L) + " m até o ponto ventilado > " + f2(q.limite) + " m (DN " + q.dn + ") → ramal de ventilação DN " + q.dnV + " a " + f2(c.dist) + " m dele, até a coluna " + (colD.id || ""));
      var noF = enxertar(vArv, rota, { tipo: "contato", ref: "vent:" + q.f.ref }, {});
      vArv.nos[noF].dn = q.dnV;
      vArv.arestas.forEach(function (a) { if (a.dn == null) a.dn = q.dnV; });
    });
    trechosDaArvore(vArv).forEach(function (t) {
      var A = vArv.nos[t.de], Bv = vArv.nos[t.para];
      out.trechos.push({ sistema: "ventilacao", material: mat, dn: t.dn, p1: { x: A.x, y: cota, z: A.z }, p2: { x: Bv.x, y: cota, z: Bv.z }, tipo: "ramal" });
    });
    out.cota = cota; out.coluna = colD;
    return out;
  }
  function p3(arv, nid) { var n = arv.nos[nid]; return { x: n.x, y: arv.Y[nid], z: n.z }; }

  /* ===================================================== ÁGUA FRIA (um grupo) */
  function cotaAf(W, g, gi) {
    var P = W.P, E = W.E, dsl = gi * P.espacamentoEntradas;
    if (E.af === "parede") return { cota: g.piso + P.alturaRamalAF + dsl, modo: "parede", nome: "parede (" + f2(P.alturaRamalAF) + " m do piso)" };
    if (E.af === "forro") return { cota: g.piso + P.peDireito + P.cobrimento + dsl, modo: "livre", nome: "forro do ambiente" };
    return { cota: g.piso - P.cobrimento - dsl, modo: "livre", nome: "enchimento do piso", desce: true };
  }
  function rotearAgua(W, g, gi, saida) {
    var P = W.P, NRM = W.N, B = BI(), mat = P.material.agua_fria, raizD = normDestino(g.destinos.agua_fria, "agua_fria");
    var folhas = [];
    g.aparelhos.forEach(function (a) { a.conectores.filter(function (c) { return c.sistema === "agua_fria"; }).forEach(function (c) { folhas.push({ ref: a.id + ":" + c.id, ap: a, aparelho: a.aparelho, x: c.x, y: c.y, z: c.z, dnCon: c.dn, ponta: c.ponta || null }); }); });
    if (!folhas.length) return { vazio: true };
    if (!raizD) return falha("água fria: coluna ou ponto de alimentação não informado para o ambiente " + g.id, [], { tipo: "destino", sistema: "agua_fria", grupo: g.id });
    var C = cotaAf(W, g, gi);
    folhas.forEach(function (f) {
      var uso = "traçado: " + f.ref, forc = num(P.dn[f.ref], num(P.dn[f.ap.id], null)), dmin = NRM.afDnMin(f.aparelho, uso);
      f.dn = forc != null ? forc : (dmin != null ? dmin : (f.dnCon > 0 ? f.dnCon : null));
      if (f.dn == null) { saida.pendencias.push(pend("af.aparelhos.dn_min[" + f.aparelho + "]", "DN do sub-ramal de " + f.ref + " sem tabela nem DN no ponto — usado o DN padrão do material; rode o dimensionamento", [f.ap.id], { tipo: "dimensionar" })); f.dn = B.MATERIAIS[mat].dn; }
      f.dn = comercial(mat, f.dn);
    });
    var rMax = Math.max.apply(null, folhas.map(function (f) { return raio(f.dn); }));
    var cota = r4(C.cota + (C.desce ? -rMax : rMax));
    /* ⚠ JANELA NA PAREDE HIDRÁULICA: o ramal embutido não corre na faixa da janela (vão + contraverga + verga) — desce para
       ABAIXO da contraverga, nunca abaixo de registroMin do piso (aí a estratégia não serve e o descarte diz por quê) */
    if (C.modo === "parede") {
      var perto = function (ob) { return folhas.some(function (f) { var q = { x: f.x - ob.cx, z: f.z - ob.cz }, u = q.x * ob.ux + q.z * ob.uz, v = -q.x * ob.uz + q.z * ob.ux; return Math.abs(u) <= ob.hl + JANELA_PERTO && Math.abs(v) <= ob.hw + JANELA_PERTO; }); };
      var jan = W.O.lista.filter(function (ob) { return ob.tipo === "janela" && faixaCruza(cota - rMax - P.folga, cota + rMax + P.folga, ob.y0, ob.y1) && perto(ob); });
      if (jan.length) {
        /* a janela INTEIRA (vão + contraverga + verga): o ramal fica abaixo da contraverga, não só do vão */
        var idsJ = uniq(jan.map(function (ob) { return ob.id; })), partes = W.O.lista.filter(function (ob) { return ob.tipo === "janela" && idsJ.indexOf(ob.id) >= 0; });
        var baixo = r4(Math.min.apply(null, partes.map(function (ob) { return ob.y0; })) - rMax - P.folga - FOLGA_LIMITE);
        var hMin = num((HC() && HC().GEO || {}).registroMin, 0);
        if (baixo - rMax >= g.piso + hMin - EPS) { cota = baixo; C = { cota: C.cota, modo: C.modo, nome: "parede, abaixo da contraverga da janela " + uniq(jan.map(function (ob) { return ob.id; })).join(", ") + " (" + f2(baixo - g.piso) + " m do piso)" }; }
      }
    }
    if (C.desce && !W.P.terreo && cota - rMax < g.piso - P.alturaEnchimento - EPS) return falha("água fria no enchimento: não cabe (cota " + f2(cota) + " m abaixo do fundo do enchimento)", [], { tipo: "parametro", campo: "alturaEnchimento", sugerido: r4(P.alturaEnchimento + cmAcima(g.piso - P.alturaEnchimento - (cota - rMax))) });
    if (raizD.vertical && (cota < raizD.yBase + P.margemNo || cota > raizD.yTopo - P.margemNo)) return falha("a coluna de água fria " + (raizD.id || "") + " não chega à cota do ramal (" + f2(cota) + " m)", [raizD.id || pt3(raizD.x, null, raizD.z)], { tipo: "moverDestino", sistema: "agua_fria", id: raizD.id, yBase: r4(Math.min(raizD.yBase, cota - P.margemNo * 2)), yTopo: r4(Math.max(raizD.yTopo, cota + P.margemNo * 2)) });
    var arv = new Arvore("agua_fria", g.id), G = grade(folhas.concat([raizD]), P, raizD), usadaRaiz = false, avisos = [], primeira = null;
    /* o mais longe primeiro: ele abre o tronco e os outros derivam dele */
    var fila = folhas.slice().sort(function (a, b) { return (Math.abs(b.x - raizD.x) + Math.abs(b.z - raizD.z)) - (Math.abs(a.x - raizD.x) + Math.abs(a.z - raizD.z)) || (a.ref < b.ref ? -1 : 1); });
    var proibirPerto = [];
    for (var i = 0; i < fila.length; i++) {
      var f = fila[i], ign = {}; ign[f.ref] = 1; ign[raizD.id || "destino-af"] = 1;
      var oRota = { de: f, b0: cota - raio(f.dn), b1: cota + raio(f.dn), r: raio(f.dn), rArv: rMax, modo: C.modo, ignorar: ign, curva: P.pesos.conexao,
                    folgaJuncao: P.margemNo, juncao45: false, chanfrar: false, raiz: usadaRaiz ? null : raizD, raizPlanta: raizD, aceitaCaixa: true, proibirPerto: proibirPerto };
      var rota = rotear(W, G, arv, oRota);
      /* FRENTE B (19/10/2026, D-03): sem caminho que não encoste na própria rede, a rota antiga (corredor solto) com AVISO — um ponto
         que pode ficar fora do registro é melhor que o ambiente sem água; o aviso diz onde conferir */
      if (rota.erro && usadaRaiz) {
        oRota.corredorSolto = true; var rota2 = rotear(W, G, arv, oRota);
        if (!rota2.erro) { rota = rota2; saida.avisos.push(prob("água fria de " + f.ref + ": o único caminho encosta no próprio ramal — confira se o ponto passa pelo registro do ambiente", [f.ap.id, pt3(f.x, f.y, f.z)], { tipo: "parametro", campo: "passo", sugerido: r4(P.passo / 2) })); }
      }
      if (rota.erro) {
        /* parede sem parede: a estratégia não existe neste modelo — a saída é outra estratégia */
        var semParede = C.modo === "parede" && !W.O.lista.some(function (ob) { return ob.tipo === "parede"; });
        return falha("água fria de " + f.ref + ": " + (semParede ? "não há paredes no modelo para embutir o ramal" : rota.erro) + " (" + C.nome + ")", [f.ap.id, pt3(f.x, f.y, f.z)],
                     semParede ? { tipo: "obstaculos", falta: "parede", texto: "modele as paredes do ambiente (ou use piso/forro)" } : { tipo: "parametro", campo: "afastamento", sugerido: r4(P.afastamento / 2) });
      }
      if (rota.alvo.tipo === "raiz") {
        usadaRaiz = true; primeira = f.ref;
        /* ⚠ REGISTRO no tronco, a partir da coluna: o primeiro pedaço reto que caiba; e nenhuma
           derivação entre a coluna e ele (senão o ponto derivado fica fora do registro) */
        var cam = rota.pts.slice().reverse(), acc = 0, Lr = B.ACESSORIO_PADRAO;
        for (var s = 1; s < cam.length && !arv.registro; s++) {
          var A = cam[s - 1], Bc = cam[s], L = d2(A, Bc), s0 = Math.max(P.distanciaRegistro - acc, Lr / 2 + P.margemNo);
          if (s0 + Lr / 2 + P.margemNo <= L + EPS) { var u = un2(A, Bc); arv.registro = { x: r4(A.x + u.x * s0), z: r4(A.z + u.z * s0) }; }
          var ate = arv.registro ? s0 + Lr / 2 + P.margemNo * 2 : L;
          for (var t = 0; t <= ate + EPS; t += P.passo) { var uu = un2(A, Bc), tt = Math.min(t, L); proibirPerto.push({ x: A.x + uu.x * tt, z: A.z + uu.z * tt, raio: P.passo + P.margemNo }); }
          acc += L;
        }
      }
      somarCruz(W, rota);
      var noF = enxertar(arv, rota, { tipo: "aparelho", ref: f.ref }, {});
      arv.nos[noF].folha = f;
    }
    /* DN do trecho = o maior a jusante (premissa: o dimensionamento acerta depois) */
    function maxDn(nid) { var n = arv.nos[nid], m = n.folha ? n.folha.dn : 0; n.entram.forEach(function (aid) { m = Math.max(m, maxDn(arv.arestas[aid].de)); }); return m; }
    arv.arestas.forEach(function (a) { a.dn = comercial(mat, maxDn(a.de)); });
    arv.cota = cota; arv.destino = raizD; arv.faixa = C;
    return { arv: arv, avisos: avisos };
  }

  /* FRENTE B (19/10/2026, D-01): para onde o volante do registro do ambiente aponta — perpendicular à parede onde ele está
     embutido, para o LADO DO CÔMODO (o lado dos pontos do próprio ambiente: o ponto mais perto do registro manda). Critério
     de projeto da RA (PADROES-PROJETO-RA R-C9: nenhuma norma diz o lado; o pedido do Rogério é "para dentro do banheiro").
     null = sem parede (aparente) ou sem ponto: fica a frente padrão do 3D. */
  function frenteRegistro(W, g, p, y) {
    var ws = W.O.lista.filter(function (ob) { return ob.tipo === "parede" && dentro(ob, p.x, p.z, EPS) && (y == null || (y >= ob.y0 - EPS && y <= ob.y1 + EPS)); });
    if (!ws.length) return null;
    ws.sort(function (a, b) { return Math.abs(local(a, p.x, p.z).v) - Math.abs(local(b, p.x, p.z).v); });
    var w = ws[0], melhor = null;
    arr(g.aparelhos).forEach(function (a) { arr(a.conectores).forEach(function (c) {
      var q = c.ponta || c, v = local(w, q.x, q.z).v, d = d2(q, p);
      if (Math.abs(v) <= EPS) return;
      if (!melhor || d < melhor.d - EPS) melhor = { d: d, s: v > 0 ? 1 : -1 };
    }); });
    if (!melhor) return null;
    return { x: -w.uz * melhor.s, y: 0, z: w.ux * melhor.s };
  }

  /* ===================================================== OPS de uma estratégia */
  function Ids(P, est) { var n = {}; return function (sis) { n[sis] = (n[sis] || 0) + 1; return P.prefixo + est + "-" + BI().SISTEMAS[sis].abrev.toLowerCase() + "-" + n[sis]; }; }

  /* arestas → trechos, juntando as retas seguidas (nó de 2 trechos alinhados
     viraria LUVA — conexão que não existe na obra) */
  function trechosDaArvore(arv, Yf, sentidoDescida) {
    var out = [], usada = {};
    arv.arestas.forEach(function (a) {
      if (usada[a.id]) return;
      var de = arv.nos[a.de];
      /* começa onde a cadeia começa: o nó de montante não é um meio de reta */
      if (meioDeReta(arv, de)) return;
      var cur = a, ini = a.de, fim = a.para; usada[a.id] = 1;
      for (;;) {
        var n = arv.nos[fim];
        if (!meioDeReta(arv, n)) break;
        var prox = arv.arestas[n.sai]; usada[prox.id] = 1; fim = prox.para; cur = prox;
      }
      out.push({ de: ini, para: fim, dn: a.dn, aresta: a.id });
    });
    return out;
    function meioDeReta(T, n) {
      if (n.entram.length !== 1 || n.sai == null || n.folha || n.tipo === "raiz") return false;
      var e1 = T.arestas[n.entram[0]], e2 = T.arestas[n.sai]; if (e1.dn !== e2.dn) return false;
      var A = T.nos[e1.de], Bn = T.nos[e2.para], u = un2(A, n), v = un2(n, Bn);
      return Math.abs(u.x * v.z - u.z * v.x) < EPS && u.x * v.x + u.z * v.z > 0 && (!e1.decl || e1.decl.i === e2.decl.i);
    }
  }

  /* o trecho `t` é a ligação do PRÓPRIO aparelho dono do volume `v`? Nasce num conector dele (a ponta no ponto) e (a) segue na
     vertical do ponto (a descida do esgoto, a subida da água na parede, atrás da coluna/respaldo) ou (b) sai do volume por um toco
     de até STUB_PROPRIO. Comprimento DENTRO do volume medido pelo recorte por placas (o mesmo do BimInst.cortaVolume). */
  var STUB_PROPRIO = 0.10;     // hid:ok toco que sai do corpo da louça pelo ponto de ligação: até 10 cm dentro do volume
  var VERTICAL_TOL = 0.005;    // hid:ok até 5 mm de desvio em planta = vertical do ponto
  function comprimentoDentro(v, p, q, enc) {
    var t0 = 0, t1 = 1, dx0 = p.x - v.cx, dz0 = p.z - v.cz, dx1 = q.x - v.cx, dz1 = q.z - v.cz;
    var A = { u: dx0 * v.ux + dz0 * v.uz, w: -dx0 * v.uz + dz0 * v.ux, y: p.y }, Bq = { u: dx1 * v.ux + dz1 * v.uz, w: -dx1 * v.uz + dz1 * v.ux, y: q.y };
    var lim = [["u", -v.hl + enc, v.hl - enc], ["w", -v.hw + enc, v.hw - enc], ["y", v.y0 + enc, v.y1 - enc]];
    for (var i = 0; i < lim.length; i++) {
      var k = lim[i][0], lo = lim[i][1], hi = lim[i][2], a = A[k], d = Bq[k] - a;
      if (!(hi > lo)) return 0;
      if (Math.abs(d) < EPS) { if (a <= lo || a >= hi) return 0; continue; }
      var ta = (lo - a) / d, tb = (hi - a) / d; if (ta > tb) { var tt = ta; ta = tb; tb = tt; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 >= t1) return 0;
    }
    return (t1 - t0) * Math.sqrt(Math.pow(q.x - p.x, 2) + Math.pow(q.y - p.y, 2) + Math.pow(q.z - p.z, 2));
  }
  function ligacaoDoProprioAparelho(v, t, pts, r, casca) {
    var Bi = BI(), tol = (Bi && Bi.TOL_CONECTOR != null ? Bi.TOL_CONECTOR : 0.03);   // hid:ok o mesmo ponto de ligação do biminst
    var nasce = arr(pts).some(function (k) { return [t.p1, t.p2].some(function (e) { return Math.sqrt(Math.pow(k.x - e.x, 2) + Math.pow(k.y - e.y, 2) + Math.pow(k.z - e.z, 2)) <= tol; }); });
    if (!nasce) return false;
    var vertical = Math.abs(t.p1.x - t.p2.x) <= VERTICAL_TOL && Math.abs(t.p1.z - t.p2.z) <= VERTICAL_TOL;
    /* a vertical do ponto só é "dentro do corpo" (a descida escondida atrás da coluna) se o tubo INTEIRO cabe na pegada da louça:
       ponto a pelo menos um raio da face. Um ponto rente à face (tubo colado, metade para fora) é o tubo que atravessa a louça
       — ex.: "embutir 0" — e continua colisão. Idem para a ligação em outra louça: aqui só vale o aparelho dono do ponto. */
    if (vertical) {
      var dx = t.p1.x - v.cx, dz = t.p1.z - v.cz, u = dx * v.ux + dz * v.uz, w = -dx * v.uz + dz * v.ux, m = r + casca;
      return Math.abs(u) <= v.hl - m && Math.abs(w) <= v.hw - m;
    }
    return comprimentoDentro(v, t.p1, t.p2, casca - r) <= STUB_PROPRIO;
  }
  function estrategia(chave, entrada, EN, P, O, NRM) {
    var E = ESTRATEGIAS[chave], W = new Mundo(E, P, O, NRM), B = BI();
    var saida = { pendencias: [], avisos: [], justificativa: [], ops: [], trechos: [], colisoes: [], interferencias: 0, familias: [] }, novoId = Ids(P, chave);
    /* verticais conhecidas de início: as colunas/TQ e os pontos dos aparelhos */
    EN.grupos.forEach(function (g, gi) {
      g.aparelhos = EN.aparelhos.filter(function (a) { return a.grupo === g.id; });
      g.pecas = EN.pecas.filter(function (k) { return k.grupo === g.id; });
      g.gordura = g.aparelhos.filter(function (a) { return P.paraCaixaGordura.indexOf(a.aparelho) >= 0 && a.conectores.some(function (c) { return c.sistema === "esgoto"; }); });
      g.semEsgoto = {}; g.gordura.forEach(function (a) { g.semEsgoto[a.id] = 1; });
      g._pontos = []; g.aparelhos.forEach(function (a) { a.conectores.forEach(function (c) { g._pontos.push(c); }); }); g.pecas.forEach(function (k) { g._pontos.push(k); });
      var C = cotaAf(W, g, gi);
      g.aparelhos.forEach(function (a) { a.conectores.forEach(function (c) {
        if (c.sistema === "esgoto") W.verticais.push({ x: c.x, z: c.z, y0: -INF, y1: c.y, r: raio(c.dn || 0), ref: a.id + ":" + c.id, sistema: "esgoto" });
        if (c.sistema === "agua_fria") W.verticais.push({ x: c.x, z: c.z, y0: Math.min(c.y, C.cota), y1: Math.max(c.y, C.cota), r: raio(c.dn || 0), ref: a.id + ":" + c.id, sistema: "agua_fria" });
      }); });
      g.pecas.forEach(function (k) { W.O.lista.push({ tipo: "peca", id: k.id, modo: "proibido", cx: k.x, cz: k.z, ux: 1, uz: 0, hl: k.r, hw: k.r, y0: k.hub.yBot, y1: k.y }); });
      ["esgoto", "ventilacao", "agua_fria"].forEach(function (s) {
        var d = normDestino(g.destinos[s], s);
        if (d && d.vertical && !W.verticais.some(function (v) { return v.ref === (d.id || "destino-" + s.slice(0, 2)); })) W.verticais.push({ x: d.x, z: d.z, y0: d.yBase, y1: d.yTopo, r: P.folga, ref: d.id || "destino-" + s.slice(0, 2), sistema: s });
      });
    });
    var trechos = [], acessorios = [], furosLaje = 0, idsPorTipo = { contato: [] };
    function laje(x, z, y0, y1) { W.O.lajes.forEach(function (l) { if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1 && Math.min(y0, y1) < l.fundo + EPS && Math.max(y0, y1) > l.topo - EPS) furosLaje++; }); }
    var pendVent = [];
    function emitirVent(it) {
      var g = it.g, es = it.es, gi = it.gi;
      /* -------- ventilação */
      var V = rotearVentilacao(W, g, es, saida, gi);
      V.descr.forEach(function (d) { saida.justificativa.push("ventilação: " + d); });
      V.avisos.forEach(function (a) { saida.avisos.push(a); });
      V.trechos.forEach(function (t) { trechos.push(t); if (t.tipo === "subida") laje(t.p1.x, t.p1.z, t.p1.y, t.p2.y); W.tubos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: "ventilacao", grupo: g.id, ref: "ve" }); });
      V.contatos.forEach(function (c) { idsPorTipo.contato.push(c); });
    }
    /* esgoto de UM grupo (o ambiente, ou a pia até a caixa de gordura) */
    function emitirEsgoto(g, gi) {
      var es = rotearEsgoto(W, g, gi, saida);
      if (es.erro) return es;
      var iniGrupo = trechos.length;
      if (es.arv) {
        var arv = es.arv, Y = arv.Y;
        es.avisos.forEach(function (a) { saida.avisos.push(a); });
        trechosDaArvore(arv).forEach(function (t) {
          var A = arv.nos[t.de], Bn = arv.nos[t.para];
          trechos.push({ sistema: "esgoto", material: P.material.esgoto, dn: t.dn, p1: { x: A.x, y: Y[t.de], z: A.z }, p2: { x: Bn.x, y: Y[t.para], z: Bn.z } });
        });
        /* descidas: ponto do aparelho → início do ramal; peça com a cota fora da captura → do fundo dela */
        arv.nos.forEach(function (n) {
          var f = n.folha; if (!f) return;
          var dnS = arv.arestas[n.sai].dn;
          if (f.tipo === "aparelho") {
            /* ponto de parede: toco do ponto até o eixo embutido (com a declividade do DN), depois a descida embutida */
            var yD = f.y;
            if (f.ponta) { yD = chao4(f.ponta.y - arv.arestas[n.sai].decl.i / 100 * d2(f.ponta, f)); trechos.push({ sistema: "esgoto", material: P.material.esgoto, dn: dnS, p1: { x: f.ponta.x, y: f.ponta.y, z: f.ponta.z }, p2: { x: f.x, y: yD, z: f.z }, toco: true, ap: f.ap.id }); }
            trechos.push({ sistema: "esgoto", material: P.material.esgoto, dn: dnS, p1: { x: f.x, y: yD, z: f.z }, p2: { x: n.x, y: Y[n.id], z: n.z }, ap: f.ap.id }); laje(f.x, f.z, f.y, Y[n.id]);
          }
          else {
            var topoCap = r4(f.peca.hub.yBot + P.folga);
            if (Y[n.id] < topoCap - EPS) trechos.push({ sistema: "esgoto", material: P.material.esgoto, dn: dnS, p1: { x: f.x, y: topoCap, z: f.z }, p2: { x: n.x, y: Y[n.id], z: n.z } });
            laje(f.x, f.z, f.y, Y[n.id]);
          }
        });
        trechos.slice(iniGrupo).forEach(function (t) { W.tubos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: "esgoto", grupo: g.id, ref: "es" }); });
        var dRaiz = arv.destino;
        if (dRaiz.vertical && !dRaiz.existente) {
          var ys = W.entradas[dRaiz.chave] || [Y[arv.raiz]];
          trechos.push({ sistema: "esgoto", material: P.material.esgoto, dn: Math.max.apply(null, arv.arestas.map(function (a) { return a.dn; })),
                         p1: { x: dRaiz.x, y: r4(Math.max.apply(null, ys) + P.margemNo * 2), z: dRaiz.z }, p2: { x: dRaiz.x, y: r4(Math.min.apply(null, ys) - P.margemNo * 2), z: dRaiz.z }, tq: true });
          saida.avisos.push(prob("tubo de queda gerado entre as entradas do ambiente: prolongue até o subcoletor e acima da cobertura (ventilação primária)", [pt3(dRaiz.x, null, dRaiz.z)], { tipo: "modelar", sistema: "esgoto", elemento: "tubo_queda" }));
        }
        saida.justificativa.push("esgoto (" + arv.faixa.nome + "): " + arv.arestas.length + " trechos até " + (dRaiz.id || dRaiz.tipo) + " na cota " + f2(Y[arv.raiz]) + " m" + (arv.cotaControle ? " (cota de controle: entrada de " + (arv.cotaControle.caixa || "caixa") + ", " + fcm(g.piso - Y[arv.raiz]) + " cm abaixo do piso; os ramais já nascem nessa profundidade e sobem em declividade constante, sem degrau perto da caixa)" : "") + "; " +
          uniq(arv.arestas.map(function (a) { return "DN " + a.dn + " a " + f2(a.decl.i) + "%" + (a.decl.tab == null ? " (regra do modelador — tabela pendente)" : ""); })).join(", "));
        /* a ventilação sai DEPOIS da água fria do grupo: a subida desvia do ramal de água (antes ela
           nascia na parede onde o ramal tinha de passar e a água do chuveiro ficava sem caminho) */
        pendVent.push({ g: g, es: es, gi: gi });
      }
      return es;
    }
    /* ⚠ CAIXA DE GORDURA (decisão do RT, 17/10/2026 — ver PARA_GORDURA). A pia vai à caixa de
       gordura do modelo (a mais perto); sem caixa, a opção PROPÕE uma (op "familia" do BimEdit,
       família hid-caixa-gordura) fora da edificação, no lado mais perto, com a rota até ela. Não
       coube → pendência inserirPeca, e a pia fica SEM rota (nunca no ramal do banheiro). */
    function gordura(g, gi) {
      var aps = g.gordura, refs = aps.map(function (a) { return a.id; });
      function deEsgoto(c) { return c.sistema === "esgoto"; }
      var p0 = aps[0].conectores.filter(deEsgoto)[0];
      function subgrupo(dest) {
        var ap2 = aps.map(function (a) { return { id: a.id, aparelho: a.aparelho, grupo: a.grupo, conectores: a.conectores.filter(deEsgoto) }; }), pts = [];
        ap2.forEach(function (a) { a.conectores.forEach(function (c) { pts.push(c); }); });
        return { id: g.id + "-cg", piso: g.piso, destinos: { esgoto: dest, ventilacao: g.destinos.ventilacao }, aparelhos: ap2, pecas: [], _pontos: pts, semEsgoto: {}, gordura: [] };
      }
      /* tentativa que não fecha não deixa rastro (travessias, tubos, entradas, textos) */
      function salvar() { return { cruz: copia(W.cruz), ids: copia(W.idsCruz), nt: trechos.length, nTub: W.tubos.length, nVert: W.verticais.length, ent: copia(W.entradas), nAv: saida.avisos.length, nJ: saida.justificativa.length, nP: saida.pendencias.length, fl: furosLaje, nC: idsPorTipo.contato.length, nV: pendVent.length }; }
      function voltar(m) { W.cruz = m.cruz; W.idsCruz = m.ids; trechos.length = m.nt; W.tubos.length = m.nTub; W.verticais.length = m.nVert; W.entradas = m.ent; saida.avisos.length = m.nAv; saida.justificativa.length = m.nJ; saida.pendencias.length = m.nP; furosLaje = m.fl; idsPorTipo.contato.length = m.nC; pendVent.length = m.nV; }
      function saidaCG(id) { saida.avisos.push(prob("saída da caixa de gordura " + id + ": ligue ao coletor ou à caixa de inspeção (fora do traçado do ambiente)", [id], { tipo: "destino", sistema: "esgoto", de: id })); }
      /* 1) caixa de gordura que já está no modelo */
      var cgs = arr(EN.caixasGordura).filter(function (c) { return c.grupo == null || c.grupo === g.id; })
        .sort(function (a, b) { return d2(a.entrada, p0) - d2(b.entrada, p0) || (a.id < b.id ? -1 : 1); });
      if (cgs.length) {
        /* cotaLivre (18/10/2026): a caixa que o usuário pôs na superfície — a entrada fica na cota que o traçado pede e quem chama
           (js/hidambiente.js) leva a caixa até ela (a caixa é enterrada; o usuário só marca o lugar) */
        var cg = cgs[0], m0 = salvar(), r0 = emitirEsgoto(subgrupo(cg.cotaLivre ? { tipo: "ponto", id: cg.id, conector: { x: cg.entrada.x, y: g.piso, z: cg.entrada.z, dn: cg.entrada.dn }, cotaLivre: true } : { tipo: "ponto", id: cg.id, conector: cg.entrada }), gi);
        /* ⚠ a caixa existe e esta estratégia não chega nela: a ESTRATÉGIA não serve (antes a opção
           seguia sem a pia e saía a mais barata — o forro da cozinha térrea "ganhava" sem ligar a pia) */
        if (r0.erro) { voltar(m0); return falha("pia → caixa de gordura " + cg.id + ": " + r0.erro, refs.concat([cg.id]), r0.acao || { tipo: "ajustar", ids: [cg.id] }); }
        saida.justificativa.push("caixa de gordura: " + refs.join(", ") + " → " + cg.id + " (já no modelo); pia nunca no ramal do esgoto primário (decisão do RT)");
        saidaCG(cg.id); return null;
      }
      /* 2) propor a caixa */
      var HF = dep("HidFamilias", "./hidfamilias.js"), spec = HF && HF.porId ? HF.porId(FAM_GORDURA) : null, motivo = null, tent = [], erroRota = null;
      if (!spec) motivo = "família de caixa de gordura (" + FAM_GORDURA + ") não carregada";
      else if (!P.terreo) motivo = "o ambiente não está no térreo: a gordura desce por tubo próprio até a caixa no térreo — indique a caixa de gordura no modelo";
      var base = spec ? { op: "familia", famId: FAM_GORDURA, tipoId: spec.tipos[0].id, x: 0, y: 0, z: 0, rotY: 0, inst: {} } : null;
      var en0 = base ? conectoresFamilia(base).filter(function (c) { return c.id === "entrada"; })[0] : null;
      if (!motivo && !en0) motivo = "a família de caixa de gordura não tem o ponto de entrada";
      var rCx = en0 ? Math.sqrt(en0.x * en0.x + en0.z * en0.z) : 0;
      if (!motivo) {
        if (P.areaTecnica) tent.push({ x: P.areaTecnica.x, z: P.areaTecnica.z });
        else {
          /* fora da edificação = fora da caixa envolvente das paredes e lajes, no lado mais perto da pia */
          var xs = [], zs = [];
          W.O.lista.forEach(function (ob) { if (ob.tipo !== "parede") return; [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) { xs.push(ob.cx + q[0] * ob.hl * ob.ux - q[1] * ob.hw * ob.uz); zs.push(ob.cz + q[0] * ob.hl * ob.uz + q[1] * ob.hw * ob.ux); }); });
          W.O.lajes.forEach(function (l) { xs.push(l.x0, l.x1); zs.push(l.z0, l.z1); });
          if (!xs.length) motivo = "sem paredes nem lajes nos obstáculos para saber onde fica o lado de fora (informe parametros.areaTecnica)";
          else {
            var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Z0 = Math.min.apply(null, zs), Z1 = Math.max.apply(null, zs), rc = P.recuoCaixaGordura + rCx;
            var cx = Math.max(X0, Math.min(X1, p0.x)), cz = Math.max(Z0, Math.min(Z1, p0.z));
            tent = [{ x: X0 - rc, z: cz }, { x: X1 + rc, z: cz }, { x: cx, z: Z0 - rc }, { x: cx, z: Z1 + rc }]
              .map(function (q, i) { return { x: r4(q.x), z: r4(q.z), i: i }; })
              .filter(function (q) { return !W.O.lista.some(function (ob) { return dentro(ob, q.x, q.z, rCx); }); })
              .sort(function (a, b) { return (Math.abs(a.x - p0.x) + Math.abs(a.z - p0.z)) - (Math.abs(b.x - p0.x) + Math.abs(b.z - p0.z)) || a.i - b.i; });
          }
        }
      }
      for (var k = 0; !motivo && k < tent.length; k++) {
        var op = copia(base); op.id = P.prefixo + chave + "-cg-" + (saida.familias.length + 1); op.x = tent[k].x; op.z = tent[k].z;
        /* a ENTRADA da caixa virada para a pia (4 giros; vale o mais perto) */
        var giros = [0, Math.PI / 2, Math.PI, -Math.PI / 2], melhorG = null;
        giros.forEach(function (rt) { op.rotY = rt; var e1 = conectoresFamilia(op).filter(function (c) { return c.id === "entrada"; })[0]; if (e1 && (!melhorG || d2(e1, p0) < melhorG.d - EPS)) melhorG = { rt: rt, d: d2(e1, p0), e: e1 }; });
        op.rotY = r4(melhorG.rt);
        var en = melhorG.e, dy = en.y - op.y, m1 = salvar();
        var r1 = emitirEsgoto(subgrupo({ tipo: "ponto", id: op.id, conector: { x: en.x, y: g.piso, z: en.z, dn: en.dn }, cotaLivre: true }), gi);
        if (r1.erro) { voltar(m1); erroRota = r1; continue; }
        var R = r1.arv.Y[r1.arv.raiz]; op.y = r4(R - dy);
        saida.familias.push(op);
        saida.justificativa.push("caixa de gordura PROPOSTA " + op.id + " fora da edificação em " + fxz(op.x, op.z) + " (" + spec.nome + "), " + refs.join(", ") + " ligados nela; pia nunca no ramal do esgoto primário (decisão do RT)");
        saida.avisos.push(prob("caixa de gordura proposta " + op.id + ": a entrada ficou na cota " + f2(R) + " m (" + fcm(g.piso - R) + " cm abaixo do piso) — confira a tampa no terreno e a posição na área externa", [op.id, pt3(op.x, R, op.z)], { tipo: "ajustar", ids: [op.id] }));
        saidaCG(op.id); return null;
      }
      /* lugar havia, a ROTA desta estratégia é que não chega: a estratégia não serve */
      if (!motivo && erroRota) return falha("pia → caixa de gordura proposta: " + erroRota.erro, refs, erroRota.acao || { tipo: "inserirPeca", peca: "caixa_gordura", grupo: g.id });
      if (!motivo) motivo = "nenhum lugar fora da edificação livre de obstáculos";
      voltar(salvar());
      saida.pendencias.push(pend0("rota.caixa_gordura", refs.join(", ") + " sem caixa de gordura: " + motivo + " — a pia ficou SEM rota (não vai ao ramal do banheiro)", refs, { tipo: "inserirPeca", peca: "caixa_gordura", grupo: g.id, sugerido: tent[0] ? { x: tent[0].x, z: tent[0].z } : null }));
      return null;
    }
    for (var gi = 0; gi < EN.grupos.length; gi++) {
      var g = EN.grupos[gi], iniGrupo = trechos.length;
      /* -------- esgoto */
      var es = emitirEsgoto(g, gi);
      if (es.erro) return es;
      /* -------- pia (e o que o projeto mandar) → CAIXA DE GORDURA */
      if (g.gordura.length) { var eg = gordura(g, gi); if (eg) return eg; }
      iniGrupo = trechos.length;
      /* -------- água fria */
      var af = rotearAgua(W, g, gi, saida);
      if (af.erro) return af;
      if (af.arv) {
        var at = af.arv, cota = at.cota, primeiro = null;
        trechosDaArvore(at).forEach(function (t) {
          var A = at.nos[t.de], Bn = at.nos[t.para];
          var tr = { sistema: "agua_fria", material: P.material.agua_fria, dn: t.dn, p1: { x: A.x, y: cota, z: A.z }, p2: { x: Bn.x, y: cota, z: Bn.z }, raiz: at.nos[t.para].tipo === "raiz" };
          trechos.push(tr);
          if (tr.raiz) primeiro = tr;
        });
        /* AF corre do destino para o ponto: p1 = lado da coluna */
        trechos.slice(iniGrupo).forEach(function (t) { if (t.sistema === "agua_fria" && !t._inv) { var q = t.p1; t.p1 = t.p2; t.p2 = q; t._inv = true; } });
        at.nos.forEach(function (n) {
          var f = n.folha; if (!f) return;
          if (Math.abs(f.y - cota) > EPS) { trechos.push({ sistema: "agua_fria", material: P.material.agua_fria, dn: f.dn, p1: { x: n.x, y: cota, z: n.z }, p2: { x: f.x, y: f.y, z: f.z }, _inv: true, ap: f.ap.id }); laje(f.x, f.z, f.y, cota); }
          /* ponto de parede: a subida/descida corre embutida; o toco sai perpendicular no ponto */
          if (f.ponta) trechos.push({ sistema: "agua_fria", material: P.material.agua_fria, dn: f.dn, p1: { x: f.x, y: f.y, z: f.z }, p2: { x: f.ponta.x, y: f.ponta.y, z: f.ponta.z }, _inv: true, toco: true, ap: f.ap.id });
        });
        var dA = at.destino;
        if (!dA.vertical && Math.abs(dA.y - cota) > EPS) trechos.push({ sistema: "agua_fria", material: P.material.agua_fria, dn: Math.max.apply(null, at.arestas.map(function (a) { return a.dn; })), p1: { x: dA.x, y: dA.y, z: dA.z }, p2: { x: dA.x, y: cota, z: dA.z }, _inv: true });
        if (dA.vertical && !dA.existente) saida.avisos.push(prob("coluna de água fria " + (dA.id || "") + " não existe no modelo: o ramal sai dela — modele a coluna", [pt3(dA.x, null, dA.z)], { tipo: "modelar", sistema: "agua_fria", elemento: "coluna" }));
        /* ⚠ registro de gaveta no INÍCIO do ramal do ambiente (isola o banheiro sem fechar a coluna) */
        var regT = at.registro ? trechos.slice(iniGrupo).filter(function (t) { return t.sistema === "agua_fria" && Math.abs(t.p1.y - t.p2.y) < EPS && ptSeg2(at.registro, t.p1, t.p2).d < EPS; })[0] : null;
        if (regT) regT.registro = { x: at.registro.x, y: cota, z: at.registro.z, comprimento: B.ACESSORIO_PADRAO, frente: frenteRegistro(W, g, at.registro, cota) };
        else saida.avisos.push(prob("registro de gaveta do ambiente " + g.id + " não coube no tronco do ramal: ponha à mão", [pt3(dA.x, cota, dA.z)], { tipo: "parametro", campo: "distanciaRegistro", sugerido: r4(B.ACESSORIO_PADRAO / 2 + P.margemNo) }));
        saida.justificativa.push("água fria (" + at.faixa.nome + "): ramal na cota " + f2(cota) + " m a partir de " + (dA.id || dA.tipo) + ", " + at.arestas.length + " trechos, descida/subida a cada ponto; registro de gaveta no início do ramal; DN do trecho = maior sub-ramal a jusante (rode o dimensionamento e aplique)");
        trechos.slice(iniGrupo).filter(function (t) { return t.sistema === "agua_fria"; }).forEach(function (t) { W.tubos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: "agua_fria", grupo: g.id, ref: "af" }); });
      }
      pendVent.splice(0).forEach(emitirVent);
    }
    /* -------- ops (trecho → acessório) */
    trechos.forEach(function (t) {
      t.id = novoId(t.sistema);
      saida.ops.push({ op: "trecho", id: t.id, sistema: t.sistema, material: t.material, dn: t.dn, p1: { x: r4(t.p1.x), y: r4(t.p1.y), z: r4(t.p1.z) }, p2: { x: r4(t.p2.x), y: r4(t.p2.y), z: r4(t.p2.z) } });
    });
    saida.familias.forEach(function (op) { saida.ops.push(op); });
    trechos.forEach(function (t) {
      if (!t.registro) return;
      var id = P.prefixo + chave + "-rg-" + (acessorios.length + 1);
      acessorios.push(id);
      /* PENDÊNCIAS FINAIS (18/10/2026): o registro do RAMAL do ambiente é EMBUTIDO na parede — base de latão com acabamento
         cromado (a SINAPI do latão com acabamento; o 3D mostra a base + o acabamento), pela regra do BimInst.varianteAuto */
      var BIr = dep("BimInst", "./biminst.js"), tipoRg = BIr && BIr.varianteAuto ? BIr.varianteAuto("registro_gaveta", { sistema: t.sistema, material: t.material, aplicacao: "ramal" }) : "acabamento";
      var opRg = { op: "acessorio", id: id, famId: REGISTRO_FAM, tipoId: tipoRg, trecho: t.id, novoId: t.id + "b", x: t.registro.x, y: t.registro.y, z: t.registro.z, comprimento: t.registro.comprimento };
      /* FRENTE B (19/10/2026, D-01): o volante para DENTRO do ambiente que o registro isola (o eixo do acessório = p1→p2 do trecho) */
      var BIC = dep("BimInstColocar", "./biminstcolocar.js"), gRg = t.registro.frente && BIC && BIC.giroPara ? BIC.giroPara({ x: t.p2.x - t.p1.x, y: t.p2.y - t.p1.y, z: t.p2.z - t.p1.z }, t.registro.frente) : 0;
      if (gRg) opRg.giro = gRg;
      saida.ops.push(opRg);
    });
    /* -------- interferências 3D entre sistemas (água × esgoto/ventilação) */
    for (var i = 0; i < trechos.length; i++) for (var j = i + 1; j < trechos.length; j++) {
      var a = trechos[i], b = trechos[j]; if (a.sistema === b.sistema) continue;
      /* a subida da ventilação NASCE no ramal de esgoto (contato de propósito) */
      if ((a.tipo === "subida" && b.sistema === "esgoto") || (b.tipo === "subida" && a.sistema === "esgoto")) continue;
      /* ⚠ as descidas do MESMO aparelho (esgoto e água do lavatório, 10 cm entre os pontos pela regra do Deca) ficam
         onde a louça manda: o afastamento entre elas não é escolha do traçado — só a colisão física conta (QUALIDADE VISUAL 2) */
      var mesmoAp = a.ap != null && a.ap === b.ap;
      var lim = !mesmoAp && (a.sistema === "agua_fria" || b.sistema === "agua_fria") ? P.afastamento : 0, dd = segSeg3(a.p1, a.p2, b.p1, b.p2) - raio(a.dn) - raio(b.dn);
      if (dd <= EPS) { saida.colisoes.push({ a: a.id, b: b.id }); continue; }   // rota:colisao3d
      if (dd < lim - EPS) saida.interferencias = (saida.interferencias || 0) + 1;
      if (dd < lim - EPS) saida.avisos.push(prob("interferência: " + a.id + " × " + b.id + " a " + fcm(Math.max(0, dd)) + " cm (mínimo " + fcm(lim) + " cm) — confira", [a.id, b.id], { tipo: "ajustar", ids: [a.id, b.id] }));
    }
    /* -------- nenhum tubo DENTRO de uma louça/equipamento (conferência 3D pelo eixo; 2 mm de casca:
       o toco que ENCOSTA no ponto da face não é travessia). Achou → a estratégia não serve. */
    var CASCA = 0.002;   // hid:ok 2 mm de tolerância de encosto na face
    arr(O.familias).forEach(function (v) {
      var pts = []; EN.aparelhos.forEach(function (a) { if (String(a.id) === String(v.id)) a.conectores.forEach(function (c) { pts.push(c.ponta || c); }); });
      trechos.forEach(function (t) {
        /* ⚠ A LIGAÇÃO DO PRÓPRIO APARELHO não "atravessa" a louça dele (ao vivo, 18/10/2026, lavatório de coluna f29): o ponto de
           ligação mora DENTRO do volume (2,3 cm à frente da parede, na placa do respaldo) e a descida/subida na vertical do ponto
           passa pela coluna — a rota PLANEJA ignorando o volume do aparelho de origem (ign[f.ref]) e esta conferência não ignorava:
           toda estratégia caía e o ambiente inteiro saía com 0 tubo. O tubo que NASCE no conector do aparelho (a ponta no ponto)
           e desce/sobe na vertical do ponto, ou sai do volume por um toco curto, é a ligação dele; um tubo do aparelho que
           ATRAVESSA o corpo na horizontal, ou o tubo de OUTRO aparelho, continua travessia. */
        if (t.ap != null && String(t.ap) === String(v.id) && ligacaoDoProprioAparelho(v, t, pts, raio(t.dn), CASCA)) return;
        if (B.tuboEmVolume(v, t.p1, t.p2, raio(t.dn), pts, CASCA)) saida.colisoes.push({ a: t.id, b: v.id, familia: true });   // rota:conferenciaFamilia
      });
    });
    /* -------- CRITÉRIO DE PROJETISTA (js/hidcriterios.js): a estratégia inteira em 3D — vão de porta/janela, verga, pilar, viga,
       parede de quarto, registro, zigue-zague… PROIBIDO → a estratégia sai (r.violacoes, com o porquê e as opções); o resto vira
       custo (metros equivalentes) e a nota da opção. A louça e o afastamento água × esgoto já são do motor (acima). */
    var Hc = HC();
    saida.violacoes = [];
    if (Hc) {
      var apar = EN.aparelhos.map(function (a) { var pts = []; a.conectores.forEach(function (c) { pts.push({ sistema: c.sistema, x: c.x, y: c.y, z: c.z }); if (c.ponta) pts.push({ sistema: c.sistema, x: c.ponta.x, y: c.ponta.y, z: c.ponta.z }); }); return { id: a.id, aparelho: a.aparelho, pontos: pts }; });
      var acs = saida.ops.filter(function (o) { return o.op === "acessorio"; }).map(function (o) { return { id: o.id, acessorio: "registro_gaveta", trecho: o.trecho, centro: { x: o.x, y: o.y, z: o.z } }; });
      var cxs = saida.familias.map(function (o) { return { id: o.id, tipo: "caixa_gordura", x: o.x, y: o.y, z: o.z }; }).concat(arr(EN.caixasGordura).map(function (c) { return { id: c.id, tipo: "caixa_gordura", x: c.entrada.x, y: c.entrada.y, z: c.entrada.z }; }));
      var pcs = []; EN.grupos.forEach(function (g) { arr(g.pecas).forEach(function (k) { pcs.push({ id: k.id, peca: k.peca, x: k.x, y: k.y, z: k.z, r: k.r }); }); });
      var parC = {}; Object.keys(P.criterios || {}).forEach(function (k) { parC[k] = P.criterios[k]; });
      parC.atravessarViga = P.atravessarViga; if (parC.afastamento == null) parC.afastamento = P.afastamento;
      var Aud = Hc.auditar({ trechos: trechos.map(function (t) { return { id: t.id, sistema: t.sistema, dn: t.dn, material: t.material, p1: t.p1, p2: t.p2, ap: t.ap }; }),
                             acessorios: acs, pecas: pcs, caixas: cxs, aparelhos: apar, obstaculos: entrada.obstaculos || {}, ambientes: (entrada.obstaculos || {}).ambientes, parametros: parC, piso: EN.grupos.length ? EN.grupos[0].piso : null });
      saida.criterios = Aud;
      saida.violacoes = Aud.apontamentos.filter(function (a) { return a.gravidade === "dura" && !CRIT_DO_MOTOR[a.regra]; });   // rota:criterioDura
    }
    saida.trechos = trechos; saida.contatos = idsPorTipo.contato;
    saida.cruz = W.cruz; saida.idsCruz = W.idsCruz; saida.furosLaje = furosLaje;
    saida.comprimento = r4(trechos.reduce(function (s, t) { return s + d3(t.p1, t.p2); }, 0));
    return saida;
  }
  function uniq(l) { var o = []; l.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }

  /* ================================================ VALIDAÇÃO pelo biminst */
  /* o estado do modelo + as ops da opção, as famílias dos aparelhos (pontos em
     coordenadas do mundo) → BimInst.verificar. É o que a tela também usa para
     mostrar "o que o modelador acharia" antes do clique. */
  function modeloBase(entrada) {
    if (Array.isArray(entrada.opsModelo)) return entrada.opsModelo.slice();
    var ops = [];
    arr(entrada.pecas).forEach(function (k) { ops.push({ op: "peca", id: k.id, peca: k.peca, sistema: k.sistema || "esgoto", x: k.x, y: k.y, z: k.z }); });
    return ops;
  }
  /* os pontos de uma família proposta (op "familia" do BimEdit): avaliados pela própria família */
  function conectoresFamilia(op) {
    var Fm = dep("Familia", "./familia.js"), HF = dep("HidFamilias", "./hidfamilias.js"), spec = HF && HF.porId ? HF.porId(op.famId) : null;
    if (!Fm || !spec) return [];
    var av = null; try { av = Fm.avaliar(spec, op.tipoId, op.inst || {}); } catch (e) { av = null; }
    return av ? BI().conectoresDe(av, { id: op.id, x: op.x, y: op.y, z: op.z, rotY: op.rotY }).map(function (k) { return { id: String(k.id).split(":").slice(1).join(":"), sistema: k.sistema, dn: k.dn, x: k.x, y: k.y, z: k.z }; }) : [];
  }
  function familias(entrada, opsFam) {
    var fams = [], con = {};
    arr(entrada.aparelhos).forEach(function (a) { fams.push(a.id); con[a.id] = arr(a.conectores); });
    arr(entrada.caixasGordura).forEach(function (cg) { if (cg && cg.id != null && !con[cg.id]) { fams.push(String(cg.id)); con[cg.id] = arr(cg.conectores); } });
    arr(opsFam).forEach(function (op) { if (!con[op.id]) { fams.push(String(op.id)); con[op.id] = conectoresFamilia(op); } });
    var ds = entrada.destinos || {};
    Object.keys(ds).forEach(function (s) { var d = ds[s]; if (d && d.conector) { var id = String(d.id || "destino-" + s); fams.push(id); con[id] = [{ id: "entrada", sistema: s, dn: num(d.conector.dn, 0), x: d.conector.x, y: d.conector.y, z: d.conector.z }]; } });
    arr(entrada.grupos).forEach(function (g) { Object.keys((g && g.destinos) || {}).forEach(function (s) { var d = g.destinos[s]; if (d && d.conector) { var id = String(d.id || "destino-" + s + "-" + g.id); if (!con[id]) { fams.push(id); con[id] = [{ id: "entrada", sistema: s, dn: num(d.conector.dn, 0), x: d.conector.x, y: d.conector.y, z: d.conector.z }]; } } }); });
    return {
      estado: fams.map(function (id) { return { id: id, famId: "hidrota:aparelho", tipoId: "", inst: { id: id, x: 0, y: 0, z: 0, rotY: 0 }, x: 0, y: 0, z: 0, rotY: 0 }; }),
      avaliar: function (famId, tipoId, inst) { var cs = con[inst && inst.id]; return cs ? { conectores: cs.map(function (c) { return { id: c.id, sistema: c.sistema, dn: num(c.dn, 0), x: c.x, y: c.y, z: c.z, nome: c.id }; }) } : null; }
    };
  }
  function validar(entrada, ops) {
    var B = BI(), est = B.novoEstado(), recusadas = [];
    /* op "familia" é do BimEdit (a caixa de gordura proposta): vira família com os pontos dela */
    var opsFam = arr(ops).filter(function (o) { return o && o.op === "familia"; });
    modeloBase(entrada).concat(arr(ops).filter(function (o) { return !(o && o.op === "familia"); })).forEach(function (o) { if (!B.aplicarOp(est, o)) recusadas.push(o.id); });
    opsFam.forEach(function (o) { if (!conectoresFamilia(o).length) recusadas.push(o.id); });
    var F = familias(entrada, opsFam), estado = { instalacoes: B.fechar(est), familias: F.estado };
    return { recusadas: recusadas, verificacao: B.verificar(estado, F.avaliar), estado: estado, avaliarFam: F.avaliar };
  }

  /* ===================================================== PROPOR */
  /* ⚠ ORIGEM LOCAL: a busca roda com a obra transladada para o destino (0; 0) e o
     resultado volta ao mundo no fim. Com coordenadas do mundo (x = 40,37), empates de
     custo e nós no limite exato de uma folga decidiam por erro de ponto flutuante — a
     mesma cena deslocada dava outra rota, e no modelo da tela dava ZERO opções. */
  function origemDe(e) {
    var ds = (e && e.destinos) || {}, ordem = ["esgoto", "agua_fria", "ventilacao"];
    for (var i = 0; i < ordem.length; i++) { var d = normDestino(ds[ordem[i]], ordem[i]); if (d) return { x: d.x, z: d.z }; }
    var a = arr(e && e.aparelhos)[0], c = a ? arr(a.conectores)[0] : null;
    return c && isFinite(num(c.x, NaN)) && isFinite(num(c.z, NaN)) ? { x: r4(num(c.x, 0)), z: r4(num(c.z, 0)) } : { x: 0, z: 0 };
  }
  /* desloca em planta tudo o que tem coordenada: entrada (para) e resultado (volta) */
  function moverPt(p, dx, dz) { if (p && typeof p === "object") { if (isFinite(num(p.x, NaN))) p.x = r4(num(p.x, 0) + dx); if (isFinite(num(p.z, NaN))) p.z = r4(num(p.z, 0) + dz); } return p; }
  function moverEntrada(e, dx, dz) {
    e = copia(e);
    arr(e.aparelhos).forEach(function (a) { arr(a && a.conectores).forEach(function (c) { moverPt(c, dx, dz); }); });
    arr(e.pecas).forEach(function (k) { moverPt(k, dx, dz); });
    arr(e.caixasGordura).forEach(function (cg) { arr(cg && cg.conectores).forEach(function (c) { moverPt(c, dx, dz); }); });
    if (e.parametros && e.parametros.areaTecnica) moverPt(e.parametros.areaTecnica, dx, dz);
    function dests(ds) { Object.keys(ds || {}).forEach(function (k) { var d = ds[k]; if (d) { moverPt(d, dx, dz); if (d.conector) moverPt(d.conector, dx, dz); } }); }
    dests(e.destinos); arr(e.grupos).forEach(function (g) { if (g) dests(g.destinos); });
    var o = e.obstaculos || {};
    ["paredes", "aberturas", "vigas"].forEach(function (k) { arr(o[k]).forEach(function (w) { if (w) { moverPt(w.p1, dx, dz); moverPt(w.p2, dx, dz); } }); });
    arr(o.pilares).forEach(function (c) { moverPt(c, dx, dz); });
    arr(o.familias).forEach(function (v) { if (v) { if (isFinite(num(v.cx, NaN))) v.cx = r4(num(v.cx, 0) + dx); if (isFinite(num(v.cz, NaN))) v.cz = r4(num(v.cz, 0) + dz); } });
    /* critério de projetista: cômodos, divisa do lote, a dobradiça da porta, passantes/shafts */
    arr(o.ambientes).forEach(function (a) { arr(a && a.contorno).forEach(function (q) { moverPt(q, dx, dz); }); });
    arr(o.divisas).forEach(function (dv) { arr(dv && dv.contorno).forEach(function (q) { moverPt(q, dx, dz); }); });
    arr(o.aberturas).forEach(function (a) { if (a && a.dobradica) moverPt(a.dobradica, dx, dz); });
    function caixaXZ(q) { if (!q) return; ["x0", "x1"].forEach(function (k) { if (isFinite(num(q[k], NaN))) q[k] = r4(num(q[k], 0) + dx); }); ["z0", "z1"].forEach(function (k) { if (isFinite(num(q[k], NaN))) q[k] = r4(num(q[k], 0) + dz); }); }
    arr(o.shafts).forEach(caixaXZ); arr(o.lajes).forEach(function (l) { arr(l && l.passantes).forEach(caixaXZ); });
    arr(o.lajes).forEach(function (l) { if (!l) return; ["x0", "x1"].forEach(function (k) { if (isFinite(num(l[k], NaN))) l[k] = r4(num(l[k], 0) + dx); }); ["z0", "z1"].forEach(function (k) { if (isFinite(num(l[k], NaN))) l[k] = r4(num(l[k], 0) + dz); }); });
    arr(e.opsModelo).forEach(function (op) { if (!op) return; if (op.p1 || op.p2) { moverPt(op.p1, dx, dz); moverPt(op.p2, dx, dz); } else moverPt(op, dx, dz); });
    return e;
  }
  function moverResultado(r, dx, dz) {
    function els(l) { arr(l).forEach(function (x) { if (x && typeof x === "object") moverPt(x, dx, dz); }); }
    function probs(l) { arr(l).forEach(function (p) { if (p) els(p.elementos); }); }
    r.opcoes.forEach(function (o) {
      o.ops.forEach(function (op) { if (op.op === "trecho") { moverPt(op.p1, dx, dz); moverPt(op.p2, dx, dz); } else moverPt(op, dx, dz); });
      probs(o.problemas); probs(o.pendencias);
    });
    probs(r.descartadas); probs(r.pendencias);
    return r;
  }
  function propor(entrada) {
    entrada = entrada || {};
    var O0 = origemDe(entrada);   // rota:origem
    if (!(O0.x || O0.z)) return proporLocal(entrada);
    ORIG = O0;
    try { return moverResultado(proporLocal(moverEntrada(entrada, -O0.x, -O0.z)), O0.x, O0.z); } finally { ORIG = { x: 0, z: 0 }; }
  }
  function proporLocal(entrada) {
    var pend = [], P = parametros(entrada), ctx = NN().contexto(), NRM = Normas(ctx, pend);
    var EN = normEntrada(entrada, P, pend), opcoes = [], descartadas = [];
    var base = validar(entrada, []), textosBase = {};
    base.verificacao.itens.forEach(function (i) { textosBase[i.texto] = (textosBase[i.texto] || 0) + 1; });
    var nConBase = base.verificacao.rede.conexoes.length;
    function descarte(chave, r) {
      return { estrategia: chave, nome: ESTRATEGIAS[chave].nome, motivo: r.erro, texto: r.erro, elementos: arr(r.elementos), acao: r.acao || null };
    }
    if (EN.aparelhos.length) P.estrategias.forEach(function (chave) {
      var O = normObstaculos(entrada.obstaculos, P);
      var EN2 = { aparelhos: copia(EN.aparelhos), pecas: copia(EN.pecas), grupos: copia(EN.grupos), caixasGordura: copia(EN.caixasGordura) };
      var r = estrategia(chave, entrada, EN2, P, O, NRM);
      if (r.erro) {
        /* ⚠ viga no caminho: a viga é PROIBIDA por padrão (furo é decisão do estrutural).
           Se a estratégia fecha furando, o descarte diz QUAL viga e a ação que libera —
           a pessoa decide com o estrutural, o traçado não decide por ela */
        var d = descarte(chave, r);
        if (!P.atravessarViga && arr((entrada.obstaculos || {}).vigas).length) {
          var P2 = copia(P); P2.atravessarViga = true;
          var r2 = estrategia(chave, entrada, { aparelhos: copia(EN.aparelhos), pecas: copia(EN.pecas), grupos: copia(EN.grupos), caixasGordura: copia(EN.caixasGordura) }, P2, normObstaculos(entrada.obstaculos, P2), NRM);
          /* ⚠ só oferece o furo se, furando, nada mais fica proibido (o furo fora da zona da NBR 6118 também é proibido) */
          var vigas = !r2.erro && !arr(r2.violacoes).length && r2.idsCruz && r2.idsCruz.viga ? r2.idsCruz.viga : [];
          if (vigas.length) {
            d.texto = d.motivo = r.erro + " — fecha se furar a viga " + vigas.join(", ") + " (com o aval do estrutural)";
            d.elementos = vigas.slice(); d.acao = { tipo: "permitirFuroViga", ids: vigas.slice(), parametros: { atravessarViga: true } };
          }
        }
        descartadas.push(d); return;
      }
      /* ⚠ tubo dentro de tubo (água × esgoto) não vira opção "aplicável com aviso": descarta, com os ids */
      if (r.colisoes.length) {
        var ids0 = uniq([].concat.apply([], r.colisoes.map(function (c) { return [c.a, c.b]; }))), soFam = r.colisoes.every(function (c) { return c.familia; });
        descartadas.push(descarte(chave, falha((soFam ? "tubo atravessando louça/equipamento (" : "colisão física entre tubos de sistemas diferentes (") + r.colisoes.map(function (c) { return c.a + " × " + c.b; }).join("; ") + ")", ids0,
          soFam ? { tipo: "ajustar", ids: ids0.slice() } : { tipo: "parametro", campo: "afastamento", sugerido: r4(P.afastamento * 2) }))); return;
      }
      /* ⚠ CRITÉRIO DE PROJETISTA: o que um projetista não aceita (tubo no vão/verga da janela, pilar, viga sem aval…) não vira
         opção "aplicável com aviso" — sai com o motivo, a regra e o que fazer; sem nenhuma estratégia limpa, o sistema NÃO inventa */
      if (r.violacoes && r.violacoes.length) {
        var v0 = r.violacoes[0], idsV = uniq([].concat.apply([], r.violacoes.map(function (a) { return a.ids; })).concat(r.violacoes.map(function (a) { return a.obstaculo; }).filter(Boolean)));
        var dV = descarte(chave, falha("critério de projetista — " + r.violacoes.slice(0, 2).map(function (a) { return a.titulo + ": " + a.texto; }).join(" · ") + (r.violacoes.length > 2 ? " (+" + (r.violacoes.length - 2) + ")" : ""), idsV,
          { tipo: "criterio", regra: v0.regra, ids: idsV.slice(), texto: v0.corrigir && v0.corrigir.texto, opcoes: OPCOES_CRIT[v0.regra.split(".")[0]] || OPCOES_CRIT.outro }));
        dV.criterios = r.violacoes; descartadas.push(dV); return;
      }
      var V = validar(entrada, r.ops), avisos = r.avisos.slice(), vistos = {};
      if (V.recusadas.length) { descartadas.push(descarte(chave, falha("o modelador recusou " + V.recusadas.length + " operação(ões): " + V.recusadas.join(", "), V.recusadas, { tipo: "ajustar", ids: V.recusadas.slice() }))); return; }
      V.verificacao.itens.forEach(function (it) {
        if (textosBase[it.texto] && (vistos[it.texto] = (vistos[it.texto] || 0) + 1) <= textosBase[it.texto]) return;
        var onde = it.x == null ? [] : [pt3(it.x, it.y, it.z)];
        var contato = it.tipo === "ponta" && r.contatos.some(function (c) { return Math.abs(c.x - it.x) < CASAS_MIN * CASAS_MIN_F && Math.abs(c.z - it.z) < CASAS_MIN * CASAS_MIN_F; });
        if (contato) { avisos.push(prob("ligação da ventilação no ramal de esgoto em " + fxz(it.x, it.z) + ": o modelador não liga sistemas diferentes (aparece como ponta solta) — é a junção de ventilação", arr(it.ids).concat(onde), { tipo: "orcarAParte", item: "junção 45° esgoto × ventilação", ids: arr(it.ids).slice() })); return; }
        avisos.push(prob("[" + it.rotuloTipo + "] " + it.texto, arr(it.ids).concat(onde), arr(it.ids).length ? { tipo: "ajustar", ids: arr(it.ids).slice() } : null));
      });
      var nCon = V.verificacao.rede.conexoes.length - nConBase;
      var pz = P.pesos, cCrit = r.criterios ? r.criterios.custoMotor : 0, custo = r.comprimento + pz.conexao * nCon + pz.parede * r.cruz.parede + pz.laje * r.furosLaje + pz.viga * r.cruz.viga + pz.interferencia * r.interferencias + pz.criterio * cCrit;
      var just = [ESTRATEGIAS[chave].nome + ": " + ESTRATEGIAS[chave].texto + "."].concat(r.justificativa);
      just.push("custo " + f2(custo) + " m equivalentes = " + f2(r.comprimento) + " m de tubo + " + nCon + " conexões × " + f2(pz.conexao) +
                (r.cruz.parede ? " + " + r.cruz.parede + " travessias de parede × " + f2(pz.parede) : "") + (r.furosLaje ? " + " + r.furosLaje + " furos de laje × " + f2(pz.laje) : "") +
                (r.cruz.viga ? " + " + r.cruz.viga + " furos de viga × " + f2(pz.viga) : "") + (r.interferencias ? " + " + r.interferencias + " interferências × " + f2(pz.interferencia) : "") +
                (cCrit ? " + " + f2(cCrit) + " m de critério de projetista × " + f2(pz.criterio) : ""));
      if (r.criterios) just.push(HC().resumo(r.criterios) + (r.criterios.apontamentos.length ? " " + uniq(r.criterios.apontamentos.map(function (a) { return a.titulo; })).join("; ") + "." : ""));
      if (P.assumidos.length) just.push("assumido (informe o do projeto): " + P.assumidos.filter(function (k) { return ROTULO_GEO[k]; }).map(function (k) { return ROTULO_GEO[k] + " " + f2(P[k]) + (k === "maxEstados" ? "" : " m"); }).join("; "));
      /* avisos = os TEXTOS (a tela de hoje lê strings); problemas = os mesmos, na mesma ordem,
         com elementos e ação — a tela passa a ler estes quando ligar o "Corrigir" */
      opcoes.push({ estrategia: chave, nome: ESTRATEGIAS[chave].nome, ops: r.ops, comprimento: r.comprimento, conexoes: nCon,
                    travessias: { parede: r.cruz.parede, laje: r.furosLaje, viga: r.cruz.viga }, elementosTravessia: copia(r.idsCruz || {}),
                    custo: r4(custo), justificativa: just, avisos: avisos.map(function (a) { return a.texto; }), problemas: avisos, pendencias: r.pendencias,
                    criterios: r.criterios ? { nota: r.criterios.nota, conceito: r.criterios.conceito, contagem: r.criterios.contagem, custo: r.criterios.custoMotor, apontamentos: r.criterios.apontamentos } : null });
    });
    /* ⚠ ordem = custo (empate: a ordem das estratégias) — a 1ª nunca é pior */
    opcoes.sort(function (a, b) { return a.custo - b.custo || ORDEM.indexOf(a.estrategia) - ORDEM.indexOf(b.estrategia); });   // rota:ordem
    opcoes = opcoes.slice(0, ORDEM.length);
    var menor = opcoes.length ? opcoes[0].custo : 0;
    opcoes.forEach(function (o, i) { o.ordem = i + 1; o.custoRelativo = menor > 0 ? Math.round(o.custo / menor * 100) / 100 : 1; });
    /* pendência de tabela: a solução é carregar a tabela (a tela abre a fonte da norma pela chave) */
    var pendTudo = pend.concat(ctx.pendencias().map(function (p) { var q = pend0(p.chave, p.motivo, [], { tipo: "tabela", chave: p.chave }); q.usadoEm = p.usadoEm; return q; }));
    opcoes.forEach(function (o) { o.pendencias.forEach(function (p) { if (!pendTudo.some(function (q) { return q.chave === p.chave && q.motivo === p.motivo; })) pendTudo.push(p); }); });
    descartadas.forEach(function (d) { pendTudo.push(pend0("rota.estrategia." + d.estrategia, d.nome + " descartada: " + d.motivo, d.elementos, d.acao)); });
    if (!opcoes.length && EN.aparelhos.length) pendTudo.push(pend0("rota.sem_opcao", "nenhuma estratégia fechou: veja os motivos em descartadas", [], descartadas.filter(function (d) { return d.acao; }).map(function (d) { return d.acao; })[0] || null));
    return { versao: 1, fixture: !!ctx.fixture, opcoes: opcoes, descartadas: descartadas, pendencias: pendTudo, normas: ctx.normas() };
  }
  var CASAS_MIN_F = 10;   // hid:ok tolerância de 1 cm para casar a ponta solta com o contato da ventilação

  /* ===================================================== ADAPTADORES DO BIM */
  /* obstáculos a partir do estado do BimEdit (caixas parede/laje/viga/pilar e
     os vãos das famílias hospedadas). Parede CURVA entra pela corda (v1). */
  function obstaculosDoBim(estado, avaliarFam) {
    var out = { paredes: [], aberturas: [], vigas: [], pilares: [], lajes: [], familias: [], ambientes: [], divisas: [] }, porId = {}, famPorId = {};
    arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) famPorId[String(f.id)] = f; });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.id == null) return;
      var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2;
      var p1 = { x: c.cx - h * cs, z: c.cz + h * sn }, p2 = { x: c.cx + h * cs, z: c.cz - h * sn }, alt = num(c.altura, 0);
      if (c.tipo === "parede") { var w = { id: c.id, p1: p1, p2: p2, espessura: c.espessura, base: c.cy - alt / 2, altura: alt }; if (c.tipoParede) w.tipoParede = c.tipoParede; out.paredes.push(w); porId[c.id] = { c: c, cs: cs, sn: sn }; }
      else if (c.tipo === "viga") out.vigas.push({ id: c.id, p1: p1, p2: p2, largura: c.espessura, altura: alt, topo: c.cy + alt / 2 });
      else if (c.tipo === "pilar") out.pilares.push({ id: c.id, x: c.cx, z: c.cz, largura: c.comprimento, profundidade: c.espessura, rotY: c.rotY, base: c.cy - alt / 2, altura: alt });
      else if (c.tipo === "laje") {
        /* ⚠ laje girada: a projeção é a caixa ENVOLVENTE dos 4 cantos (antes cx ± comprimento/2 sem o giro) */
        var hw = num(c.espessura, 0) / 2, xs = [], zs = [];
        [[-h, -hw], [h, -hw], [h, hw], [-h, hw]].forEach(function (q) { xs.push(c.cx + q[0] * cs + q[1] * sn); zs.push(c.cz - q[0] * sn + q[1] * cs); });
        out.lajes.push({ id: c.id, x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs), topo: c.cy + alt / 2, espessura: alt });
      }
    });
    if (typeof avaliarFam === "function" && BI().volumesFamilias) out.familias = BI().volumesFamilias(estado, avaliarFam);
    /* CRITÉRIO DE PROJETISTA: os cômodos (nome → uso: molhado, permanência prolongada) e a divisa do lote */
    arr(estado && estado.ambientes).forEach(function (a) {
      var cl = a && a.calc, ct = arr(cl && cl.contorno); if (ct.length < PONTOS_CANTO) return;
      out.ambientes.push({ id: a.id, nome: txt(a.nome) || txt(cl.numeroAuto) || String(a.id), contorno: ct.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }), base: num(cl.base, 0), topo: num(cl.topo, INF) });
    });
    arr(estado && estado.terreno && estado.terreno.divisas).forEach(function (dv) { if (dv && dv.ok !== false && arr(dv.contorno).length >= PONTOS_CANTO) out.divisas.push({ id: dv.id, contorno: dv.contorno.map(function (q) { return { x: num(q.x, 0), z: num(q.z, 0) }; }) }); });
    var BE = dep("BimEdit", "./bimedit.js");
    if (BE && BE.vaosDasParedes && typeof avaliarFam === "function") {
      var vaos = BE.vaosDasParedes(estado, avaliarFam);
      Object.keys(vaos).forEach(function (pid) {
        var ref = porId[pid]; if (!ref) return;
        var c = ref.c, base = c.cy - num(c.altura, 0) / 2;
        arr(vaos[pid].aceitos).forEach(function (v) {
          var ab = { id: v.id, tipo: v.y0 <= EPS ? "porta" : "janela", espessura: c.espessura,
                     p1: { x: c.cx + v.x0 * ref.cs, z: c.cz - v.x0 * ref.sn }, p2: { x: c.cx + v.x1 * ref.cs, z: c.cz - v.x1 * ref.sn }, y0: base + v.y0, y1: base + v.y1 };
          /* CRITÉRIO DE PROJETISTA (registro atrás da porta): a dobradiça e o lado do giro, da própria família (a maçaneta fica
             em +x local → a dobradiça em −x; a folha abre para o lado Lado_folha do z local) */
          var fp = famPorId[String(v.id)];
          if (ab.tipo === "porta" && fp) {
            var av = null; try { av = avaliarFam(fp.famId, fp.tipoId, fp.inst || {}); } catch (eA) { av = null; }
            var vl = (av && av.valores) || {}, Lf = num(vl.Largura, NaN), bt = num(vl.Batente, 0), lado = num(vl.Lado_folha, NaN), rf = num(fp.rotY, 0);
            if (isFinite(Lf) && isFinite(lado)) {
              var lx = { x: Math.cos(rf), z: -Math.sin(rf) }, lz = { x: Math.sin(rf), z: Math.cos(rf) }, hx = -(Lf / 2 + bt);
              ab.largura = r4(Lf); ab.dobradica = { x: r4(num(fp.x, 0) + lx.x * hx), z: r4(num(fp.z, 0) + lx.z * hx) };
              ab.folha = { x: r4(-lx.x), z: r4(-lx.z) }; ab.lado = { x: r4(lz.x * lado), z: r4(lz.z * lado) };
            }
          }
          out.aberturas.push(ab);
        });
      });
    }
    return out;
  }
  /* a entrada a partir do modelo: aparelhos (famílias com pontos), peças de
     esgoto e obstáculos; destinos, grupos e parâmetros vêm da tela (extra) */
  function entradaDoModelo(estado, avaliarFam, extra) {
    extra = extra || {};
    var B = BI(), AF = dep("HidAF", "./hidaf.js"), porFam = {}, ordem = [];
    B.conectoresDoEstado(estado, avaliarFam).forEach(function (k) {
      if (!porFam[k.famInst]) { porFam[k.famInst] = []; ordem.push(k.famInst); }
      porFam[k.famInst].push({ id: String(k.id).split(":").slice(1).join(":") || k.sistema, sistema: k.sistema, dn: k.dn, x: k.x, y: k.y, z: k.z, parede: k.parede || null });
    });
    var famDe = {}, instDe = {}; arr(estado && estado.familias).forEach(function (f) { famDe[f.id] = f.famId; instDe[f.id] = f.inst; });
    var forcado = extra.aparelhos || {}, grupoDe = extra.grupoDe || {}, ESm = dep("HidES", "./hides.js");
    var caixasGordura = ordem.filter(function (id) { return famDe[id] === FAM_GORDURA; }).map(function (id) { return { id: String(id), grupo: grupoDe[id] != null ? grupoDe[id] : null, conectores: porFam[id] }; });
    ordem = ordem.filter(function (id) { return famDe[id] !== FAM_GORDURA; });
    var aparelhos = ordem.map(function (id) {
      var ap = forcado[id] || (AF && AF.aparelhoDaFamilia ? AF.aparelhoDaFamilia(famDe[id]) : null) || "";
      var apEs = ap === "mictorio" && ESm && ESm.mictorioDe ? ESm.mictorioDe(instDe[id]).aparelho : null;   /* mictório: linha da Tabela 3 pelo Tipo_descarga */
      return { id: String(id), aparelho: ap, aparelhoEs: apEs, grupo: grupoDe[id] != null ? grupoDe[id] : null, conectores: porFam[id] };
    }).filter(function (a) { return !extra.so || extra.so.indexOf(a.id) >= 0; });
    var pecas = arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (p) { return p.sistema === "esgoto" && RECEPTOR[p.peca] || p.peca === "ralo_seco"; })
      .map(function (p) { return { id: p.id, peca: p.peca, sistema: p.sistema, dn: p.dn, x: p.x, y: p.y, z: p.z, grupo: grupoDe[p.id] != null ? grupoDe[p.id] : null }; });
    return { aparelhos: aparelhos, pecas: pecas, caixasGordura: caixasGordura, obstaculos: obstaculosDoBim(estado, avaliarFam), destinos: extra.destinos || {}, grupos: extra.grupos || [],
             piso: extra.piso, parametros: extra.parametros || {}, opsModelo: extra.opsModelo };
  }

  /* ENTRADA (resumo — cenários completos no tools/test-hid-rota.js):
   * { aparelhos: [{ id, aparelho, grupo?, conectores: [{ id, sistema, dn, x, y, z }] }],   ← mundo, m
   *   pecas:     [{ id, peca: "caixa_sifonada"|"ralo_sifonado"|"ralo_seco", x, y, z, grupo? }],   ← já no modelo
   *   destinos:  { esgoto:     { tipo: "tubo_queda", id, x, z, yBase, yTopo, existente?, ventilado? }
   *                           | { tipo: "ponto", id, conector: { x, y, z, dn } }  (caixa de gordura/inspeção),
   *                agua_fria:  { tipo: "coluna", id, x, z, yBase, yTopo } | { tipo: "ponto", x, y, z },
   *                ventilacao: { tipo: "coluna", id, x, z, yBase, yTopo } },
   *   grupos:    [{ id, piso, destinos? }],  piso,
   *   obstaculos: (normObstaculos acima)  — ou HidRota.obstaculosDoBim(estado, avaliarFam),
   *   opsModelo: [ops do biminst já no modelo] (validação: TQ, colunas, peças),
   *   parametros: { estrategias, terreo, atravessarViga, dn: {"<aparelho>:<ponto>": dn}, declividade, material, prefixo, pesos, + GEO } } */

  var HidRota = {
    VERSAO: 1, GEO: GEO, PESOS: PESOS, ESTRATEGIAS: ESTRATEGIAS, ORDEM: ORDEM,
    BACIA: BACIA, RECEPTOR: RECEPTOR, PARA_CAIXA: PARA_CAIXA, SIFAO_PROPRIO: SIFAO_PROPRIO,
    propor: propor, validar: validar, obstaculosDoBim: obstaculosDoBim, entradaDoModelo: entradaDoModelo,
    ligacaoDoProprioAparelho: ligacaoDoProprioAparelho,   /* a mesma regra no auditor (js/hidcriterios.js): motor e auditor não discordam */
    _int: { aEstrela: aEstrela, Grade: Grade, eixo: eixo, corta: corta, retSeg: retSeg, segSeg3: segSeg3, chanfrar: chanfrar, normObstaculos: normObstaculos, parametros: parametros }
  };
  global.HidRota = HidRota;
  if (typeof module !== "undefined" && module.exports) module.exports = HidRota;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
