/* =====================================================================
 * climdimensionar.js — ORQUESTRADOR da climatização (frente C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md:
 *   ClimDimensionar.calcular(entrada) → resultado
 *   ClimDimensionar.lerModelo(estado, avaliarFam, opcoes) → AmbienteClim[]
 *
 * Passos: normas (contexto do HidNormas) → modelo (ambientes, paredes
 * externas e orientação, janelas, forro e plenum, cobertura exposta) →
 * carga por ambiente → soluções (≤ 3 por ambiente + centrais) → equipamento
 * do catálogo → posição da evaporadora e da condensadora → rede frigorígena,
 * dreno, dutos e terminais → ops para o BIM, com as inversas.
 *
 * ⚠ ok só é true sem verificação reprovada, sem aviso de erro e SEM
 *   pendência. Hoje (17/10/2026) os coeficientes do método de componentes
 *   não existem em dados-fonte: o resultado sai PENDENTE e diz por quê.
 * ⚠ aplicavel = false enquanto o biminst não tiver os sistemas
 *   "frigorigeno"/"dreno" (docs/hidro/PATCH-BIMINST-CLIMA.md) e as famílias
 *   ra-clim-* não existirem; opsJaAceitas traz o que já entra hoje (dutos
 *   do sistema "ar" e pontos de força) — a porta do "Aplicar".
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = Number(v); return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 10000) / 10000; }   /* clim:ok arredondamento a 4 casas */
  function fmt(v, c) { return v == null || !isFinite(v) ? "—" : v.toFixed(c == null ? 1 : c).replace(".", ","); }
  var EPS = 1e-6;   /* clim:ok tolerância geométrica (m) */

  /* ---------------------------------------------------- GEOMETRIA */
  function dentroPoligono(p, poli) {
    var dentro = false, n = arr(poli).length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var a = poli[i], b = poli[j];
      if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) dentro = !dentro;
    }
    return dentro;
  }
  function centroide(poli) {
    var A = 0, cx = 0, cz = 0, n = arr(poli).length;
    for (var i = 0, j = n - 1; i < n; j = i++) { var f = poli[j].x * poli[i].z - poli[i].x * poli[j].z; A += f; cx += (poli[j].x + poli[i].x) * f; cz += (poli[j].z + poli[i].z) * f; }
    if (Math.abs(A) < EPS) { var sx = 0, sz = 0; poli.forEach(function (p) { sx += p.x; sz += p.z; }); return { x: sx / (n || 1), z: sz / (n || 1) }; }
    return { x: cx / (3 * A), z: cz / (3 * A) };   /* clim:ok centroide de polígono (1/(6A) com A = área/2·2) */
  }
  /* laje que cobre o ponto (contorno, ou retângulo girado de rotY) */
  function lajeCobre(c, p) {
    if (arr(c.contorno).length >= 3) return dentroPoligono(p, c.contorno);   /* clim:ok polígono = 3 vértices ou mais */
    var dx = p.x - num(c.cx), dz = p.z - num(c.cz), t = num(c.rotY) || 0;
    var lx = dx * Math.cos(t) - dz * Math.sin(t), lz = dx * Math.sin(t) + dz * Math.cos(t);
    return Math.abs(lx) <= (num(c.comprimento) || 0) / 2 && Math.abs(lz) <= (num(c.espessura) || 0) / 2;
  }

  /* uso pelo nome do ambiente (o usuário corrige em entrada.ambientes) */
  var USOS_RE = [["banheiro", /banh|wc|lavabo|sanit/i], ["dormitorio", /quarto|dormit|su[ií]te/i], ["cozinha", /cozinha|copa/i],
                 ["servico", /servi[cç]o|lavand|[áa]rea t[ée]c/i], ["circulacao", /circula|corredor|hall|escada/i], ["reuniao", /reuni[ãa]o/i],
                 ["escritorio", /escrit|office|consult|est[uú]dio/i], ["loja", /loja|venda/i], ["garagem", /garag/i], ["sala", /sala|estar|jantar|living|tv/i]];
  /* ⚠ decisão do RT (17/10/2026), não valor de norma: componentes abaixo de 50 % da regra de fabricante pedem confirmação */
  /* ⚠ EXCEDENTE do equipamento (decisão do gerente 17/10/2026): o modelo comercial imediatamente acima da carga é
     INEVITÁVEL e nunca reprova. O que a 16401-1 7.1.1 / 16655-3 Seção 5 proíbem é o FATOR DE SEGURANÇA sobre a carga
     (preferencias.folga_pct > 0 → reprovado). O excedente sai informado (%); acima deste limite — CRITÉRIO DO
     PROJETISTA, não da norma; preferencias.limiteExcedente_pct troca — vira AVISO (sugerir modelo menor/inverter). */
  var LIMITE_EXCEDENTE_PCT = 30;   /* clim:ok critério do projetista declarado (decisão do gerente 17/10/2026), não é valor de norma */
  var LIMIAR_DIVERGENCIA_PCT = 50;   /* clim:ok decisão do RT 17/10/2026 (limiar de divergência componentes × regra) */
  var ITEM_DIVERGENCIA = "divergencia_carga:";
  function usoDoNome(nome) { for (var i = 0; i < USOS_RE.length; i++) if (USOS_RE[i][1].test(nome || "")) return USOS_RE[i][0]; return "outro"; }

  /* ------------------------------------------------- LER O MODELO */
  function lerModelo(estado, avaliarFam, opcoes) {
    estado = estado || {}; opcoes = opcoes || {};
    var CC = dep("ClimCarga", "./climcarga.js"), FR = dep("FamiliasRA", "./familiasra.js");
    var ambs = arr(estado.ambientes).filter(function (a) { return a.calc && num(a.calc.area) > 0 && arr(a.calc.contorno).length >= 3; });   /* clim:ok polígono = 3 vértices ou mais */
    var caixas = {}, lajes = [];
    arr(estado.caixas).forEach(function (c) { if (c.tipo === "parede") caixas[c.id] = c; else if (c.tipo === "laje") lajes.push(c); });
    var anguloNorte = num(opcoes.anguloNorte) != null ? num(opcoes.anguloNorte) : num(estado.terreno && estado.terreno.implantacao && estado.terreno.implantacao.anguloNorte) || 0;
    /* parede EXTERNA = delimita um só ambiente (o outro lado é o exterior) */
    var usoParede = {};
    ambs.forEach(function (a) { arr(a.calc.lados).forEach(function (l) { if (l.fonte && l.fonte.tipo === "parede") { (usoParede[l.fonte.id] = usoParede[l.fonte.id] || {})[a.id] = 1; } }); });
    var janelasPorParede = {};
    arr(estado.familias).forEach(function (f) {
      if (!f.host || f.host.id == null) return;
      var av = null; try { av = typeof avaliarFam === "function" ? avaliarFam(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { av = null; }
      var cat = (av && av.categoria) || (FR && FR.obter && (FR.obter(f.famId) || {}).categoria) || (/janela/i.test(f.famId || "") ? "janela" : "");
      if (cat !== "janela" || !av || !av.abertura) return;
      (janelasPorParede[f.host.id] = janelasPorParede[f.host.id] || []).push({ id: f.id, largura: num(av.abertura.largura), altura: num(av.abertura.altura), vidro: (f.inst || {}).Material_vidro || "" });
    });
    return ambs.map(function (a) {
      var c = a.calc, cen = centroide(c.contorno), H = num(c.altura), base = num(c.base) || 0;
      var porParede = {};
      arr(c.lados).forEach(function (l) {
        if (!l.fonte || l.fonte.tipo !== "parede") return;
        var dx = l.x1 - l.x0, dz = l.z1 - l.z0, L = Math.sqrt(dx * dx + dz * dz); if (L < EPS) return;
        var pp = porParede[l.fonte.id] = porParede[l.fonte.id] || { id: l.fonte.id, comprimento_m: 0, maior: null };
        pp.comprimento_m += L; if (!pp.maior || L > pp.maior.L) pp.maior = { L: L, l: l };
      });
      var paredes = [], vidros = [];
      Object.keys(porParede).forEach(function (pid) {
        var pp = porParede[pid], l = pp.maior.l, dx = l.x1 - l.x0, dz = l.z1 - l.z0, L = pp.maior.L;
        var n = { x: dz / L, z: -dx / L }, mx = (l.x0 + l.x1) / 2, mz = (l.z0 + l.z1) / 2;
        if (n.x * (mx - cen.x) + n.z * (mz - cen.z) < 0) n = { x: -n.x, z: -n.z };
        var az = CC.azimute(n.x, n.z, anguloNorte), ext = Object.keys(usoParede[pid] || {}).length === 1, cx = caixas[pid] || {};
        var bruta = H != null ? pp.comprimento_m * H : null, aV = 0;
        if (ext) arr(janelasPorParede[pid]).forEach(function (j) {
          if (j.largura == null || j.altura == null) return;
          var A = j.largura * j.altura; aV += A;
          vidros.push({ id: j.id, parede: pid, orientacao: CC.setor(az), azimute: r4(az), area_m2: r4(A), altura_m: r4(j.altura), tipo: null, fatorSolar: null, U: null });
        });
        paredes.push({ id: pid, externa: ext, azimute: r4(az), orientacao: CC.setor(az), comprimento_m: r4(pp.comprimento_m), area_m2: bruta == null ? null : r4(bruta),
                       areaLiquida_m2: bruta == null ? null : r4(Math.max(0, bruta - aV)), espessura_m: num(cx.espessura), tipo: null, U: null,
                       p0: { x: l.x0, z: l.z0 }, p1: { x: l.x1, z: l.z1 }, normal: { x: r4(n.x), z: r4(n.z) } });
      });
      /* forro e plenum (até a face de baixo da laje acima) */
      var fo = arr(estado.forros).filter(function (f) { return f.ambienteId === a.id; })[0], forro = { existe: false, cota_m: null, plenum_m: null };
      if (fo) {
        var topoF = num(fo.cota) + (num(fo.espessura) || 0), sob = null;
        lajes.forEach(function (lj) { var fundo = num(lj.cy) - (num(lj.altura) || 0) / 2; if (fundo > topoF + EPS && lajeCobre(lj, cen) && (sob == null || fundo < sob)) sob = fundo; });
        forro = { existe: true, id: fo.id, cota_m: num(fo.cota), espessura_m: num(fo.espessura), plenum_m: sob == null ? null : r4(sob - topoF) };
      }
      /* cobertura exposta: nenhum ambiente acima cobrindo o centro */
      var topo = num(c.topo), acima = ambs.some(function (b) { return b !== a && num(b.calc.base) >= (topo == null ? base : topo) - EPS && dentroPoligono(cen, b.calc.contorno); });
      var lajeAcima = lajes.some(function (lj) { return num(lj.cy) - (num(lj.altura) || 0) / 2 >= (topo == null ? base : topo) - EPS && lajeCobre(lj, cen); });
      return { id: a.id, nome: a.nome || ("Ambiente " + a.id), uso: usoDoNome(a.nome || a.ocupacao), pavimento: a.nivelId || c.nivelNome || "", cota_m: base, peDireito_m: H,
               area_m2: r4(num(c.area)), volume_m3: num(c.volume), centro: { x: r4(cen.x), y: base, z: r4(cen.z) }, contorno: c.contorno,
               paredes: paredes, vidros: vidros, cobertura: acima ? null : { area_m2: r4(num(c.area)), tipo: lajeAcima ? "laje" : "telhado" }, forro: forro,
               pessoas: null, atividade: null, aparelhos: null, iluminacao_W: null, equipamentos_W: null, climatizar: null, solForte: null, camas: [], sofas: [] };
    });
  }

  /* aplica entrada.ambientes {id: {...}} sobre o lido do modelo */
  function aplicarDados(ambs, dados) {
    if (!dados) return ambs;
    return ambs.map(function (a) {
      var d = dados[a.id]; if (!d) return a;
      var o = copia(a);
      ["uso", "pessoas", "atividade", "aparelhos", "iluminacao_W", "equipamentos_W", "climatizar", "solForte", "camas", "sofas", "nome"].forEach(function (k) { if (d[k] !== undefined) o[k] = d[k]; });
      /* superficie/alfa/eps/amortecimento (sol-ar) e beiral (sombra do vidro): frente carga térmica solar */
      if (d.paredes) o.paredes.forEach(function (p) { var x = d.paredes[p.id]; if (x) ["tipo", "U", "superficie", "alfa", "eps", "amortecimento"].forEach(function (k) { if (x[k] !== undefined) p[k] = x[k]; }); });
      if (d.vidros) o.vidros.forEach(function (v) { var x = d.vidros[v.id]; if (x) ["tipo", "fatorSolar", "U", "beiral", "altura_m"].forEach(function (k) { if (x[k] !== undefined) v[k] = x[k]; }); });
      if (d.cobertura && o.cobertura) ["tipo", "U", "superficie", "alfa", "eps", "amortecimento", "inclinacao_graus", "azimute"].forEach(function (k) { if (d.cobertura[k] !== undefined) o.cobertura[k] = d.cobertura[k]; });
      return o;
    });
  }

  /* destinos de dreno: os do usuário, senão ralos/caixas de esgoto e pluvial do biminst */
  function destinosDoModelo(estado) {
    return arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (p) { return p.sistema === "esgoto" || p.sistema === "pluvial"; })
      .map(function (p) { return { id: p.id, tipo: p.sistema, x: num(p.x), y: num(p.y), z: num(p.z) }; });
  }

  /* --------------------------------------------------------- OPS */
  var FAMILIAS = { hiwall: "ra-clim-evap-hiwall", pisoteto: "ra-clim-evap-pisoteto", cassete: "ra-clim-evap-cassete", duto: "ra-clim-evap-duto", janela: "ra-clim-janela",
                   condensadora: "ra-clim-condensadora", condensadora_multi: "ra-clim-condensadora-multi", suporte: "ra-clim-suporte-condensadora",
                   bomba: "ra-clim-bomba-dreno", sifao: "ra-clim-sifao-dreno" };
  function p3(p) { return { x: r4(p.x), y: r4(p.y), z: r4(p.z) }; }

  function calcular(entrada) {
    var NR = dep("HidNormas", "./hidnormas.js"), CC = dep("ClimCarga", "./climcarga.js"), SI = dep("ClimSistema", "./climsistema.js");
    var EQ = dep("ClimEquip", "./climequip.js"), LO = dep("ClimLocal", "./climlocal.js"), RD = dep("ClimRede", "./climrede.js"), BI = dep("BimInst", "./biminst.js"), FR = dep("FamiliasRA", "./familiasra.js"), CF = dep("ClimFamilias", "./climfamilias.js");
    entrada = entrada || {};
    var mod = entrada.modelo || {}, est = mod.estado || {}, pref = entrada.preferencias || {}, opc = entrada.opcoes || {};
    var ctx = NR.contexto();
    var res = { versao: 1, ok: false, fixture: !!ctx.fixture, aplicavel: false, normas: [], premissas: [], condicoes: null, ambientes: [], centrais: [],
                verificacoes: [], avisos: [], pendencias: [], ops: [], opsDesfazer: [], opsJaAceitas: [], requisitos: [], resumo: null };
    function aviso(grav, texto, elementos, corrigir) { res.avisos.push({ id: "cl-" + res.avisos.length, sistema: "clim", gravidade: grav, texto: texto, elementos: elementos || [], corrigir: corrigir || null }); }
    function verif(v) { v.id = "clv-" + res.verificacoes.length; v.sistema = "clim"; res.verificacoes.push(v); }
    /* confirmação do RT — a mesma forma do incêndio (hidinc): {item, justificativa, responsavel}, os dois NÃO vazios; vira premissa
       de origem "confirmacao_rt" (o memorial mostra em seção própria). Incompleta não confirma (aviso). */
    function confirmacaoRT(cod) {
      var c = arr(entrada.confirmacoesRT).filter(function (x) { return x && String(x.item || "").split(/\s+/)[0] === cod; })[0];
      if (!c) return null;
      var j = String(c.justificativa == null ? "" : c.justificativa).trim(), r = String(c.responsavel == null ? "" : c.responsavel).trim();
      if (!j || !r) { aviso("aviso", "confirmação " + cod + " incompleta (" + (!r ? "sem responsável" : "sem justificativa") + "): continua pendente", [], { texto: "preencher justificativa e responsável (nome / CREA) em confirmacoesRT" }); return null; }
      var it = cod + " confirmado pelo RT " + r;
      if (!res.premissas.some(function (p) { return p.item === it; })) res.premissas.push({ item: it, valor: it + ": " + j, origem: "confirmacao_rt" });
      return { justificativa: j, responsavel: r };
    }

    /* 1) modelo */
    var ambs = Array.isArray(entrada.ambientes) ? copia(entrada.ambientes) : lerModelo(est, mod.avaliarFam, { anguloNorte: entrada.local && entrada.local.anguloNorte });
    if (!Array.isArray(entrada.ambientes)) ambs = aplicarDados(ambs, entrada.ambientes);
    if (!ambs.length) aviso("erro", "nenhum ambiente delimitado no modelo: a climatização é calculada por ambiente", [], { texto: "criar os ambientes (Arquitetura › Ambiente) e conferir que estão delimitados" });

    /* 2) condições */
    var cond = CC.condicoes(entrada.local, entrada.interno, ctx, { edificacao: entrada.edificacao });
    res.condicoes = { externa: cond.externa, interna: cond.interna };
    cond.premissas.forEach(function (p) { res.premissas.push(p); });
    arr(cond.verificacoes).forEach(function (v) { verif(copia(v)); if (v.status === "reprovado") aviso("erro", v.nome + ": " + v.passos.join("; "), [], { texto: "usar o percentil 0,4 % (entrada.local.percentil = \"04\") ou desmarcar 'projeto crítico'" }); });
    if (cond.externa) res.premissas.push({ item: "condições externas", valor: cond.externa.declaracao + " — " + (cond.externa.cidade || cond.externa.estacao) + ": TBS " + fmt(cond.externa.tbs_C) + " °C / TBU " + fmt(cond.externa.tbu_C) + " °C (" + cond.externa.percentil + " %)", origem: "norma", fonte: cond.externa.fonte });
    else aviso("aviso", "cidade/estação climática não informada ou fora da tabela: a carga por componentes fica pendente", [], { texto: "escolher a estação mais próxima em Clima › Local (" + ((NR.tabela("cl.condicoes_externas_mg_ashrae_tmyx") || { linhas: [] }).linhas.map(function (l) { return l.estacao; }).join(", ")) + ")" });
    res.premissas.push({ item: "paredes internas", valor: "sem troca de calor entre ambientes (mesma temperatura); parede externa = parede que delimita um só ambiente", origem: "padrao_motor" });
    res.premissas.push({ item: "janelas", valor: "área de vidro = vão inteiro (largura × altura), sem descontar caixilho; portas tratadas como parede", origem: "padrao_motor" });

    /* 3) catálogo */
    var cat = EQ.catalogo(entrada.catalogo), conjs = EQ.conjuntos(cat);
    if (!conjs.length) { aviso("aviso", "catálogo de climatização não carregado: nenhum equipamento a escolher", [], { texto: "gerar o catálogo com tools/gerar-hid-catalogo.js --clima (ou passar entrada.catalogo)" }); ctx.pendencia("catalogo.clim", "catálogo de climatização não carregado", "equipamentos"); }

    /* 4) carga e soluções por ambiente */
    var cargas = {}, porId = {}, naoUsadas = {};
    var optsCarga = { arExterno: opc.arExterno === true ? true : (opc.arExterno === false ? false : "auto"), edificacao: entrada.edificacao, tipoResidencia: opc.tipoResidencia,
                      repetitivo: opc.repetitivo, metodoResidencial: opc.metodoResidencial, renovacao_m3h_m2: opc.renovacao_m3h_m2 };
    ambs.forEach(function (a) {
      var item = { id: a.id, nome: a.nome, uso: a.uso, area_m2: a.area_m2, climatizar: SI.climatiza(a), carga: null, solucoes: [], escolha: null };
      if (item.climatizar) {
        var cg = CC.calcular(a, cond, ctx, optsCarga); cargas[a.id] = cg; item.carga = cg;
        arr(cg.rapida.naoUsadas).forEach(function (n) { naoUsadas[n.chave] = n; });
        arr(cg.premissas).forEach(function (p) { if (!res.premissas.some(function (q) { return q.item === p.item; })) res.premissas.push(p); });
        arr(cg.alertas).forEach(function (al) { aviso("aviso", a.nome + ": " + al.texto, [a.id], { texto: "informar a fonte do amortecimento (cálculo pela NBR 15220-2 ou ficha do sistema construtivo) em ambientes." + a.id + ".paredes/cobertura.amortecimento.fonte" }); });
        /* ⚠ DIVERGÊNCIA ALTA (decisão do RT, 17/10/2026): componentes COMPLETOS abaixo de LIMIAR_DIVERGENCIA_PCT da maior regra de
           fabricante → aviso + verificação "pendente de confirmação do RT" até confirmacoesRT[{item, justificativa, responsavel}]
           (mesma forma do incêndio). Motivo: a física pode estar certa (ambiente sem cobertura nem vidro), mas ocupação,
           equipamentos ou cargas internas esquecidos dão o mesmo número baixo — e o equipamento sai subdimensionado. O equipamento
           proposto SEGUE o cálculo por componentes; a trava é a do "ok" do dimensionamento. */
        /* o MÉTODO QUE MANDA (16655-3 no residencial, componentes no resto) é o que se compara com a regra */
        var baseN = cg.metodo === "nbr16655_3", valBase = baseN ? cg.nbr16655.total_BTUh : cg.total_BTUh, stBase = baseN ? cg.nbr16655.status : cg.status;
        var divAlta = stBase === "ok" && cg.rapida.maior_BTUh > 0 && valBase < cg.rapida.maior_BTUh * LIMIAR_DIVERGENCIA_PCT / 100;
        var confDiv = divAlta ? confirmacaoRT(ITEM_DIVERGENCIA + a.id) : null;
        var stCarga = divAlta && !confDiv && !baseN ? "pendente" : cg.status, st16 = baseN && divAlta && !confDiv ? "pendente" : (cg.nbr16655 ? cg.nbr16655.status : null);
        if (cg.nbr16655) {
          var r16 = cg.nbr16655;
          verif({ alvo: a.id, nome: "carga térmica pela NBR 16655-3 (" + a.nome + ")" + (cg.metodo === "nbr16655_3" ? "" : " — conferência"), valor: r16.total_BTUh, limite: null, unidade: "BTU/h", eta: null,
                  ok: st16 === "ok" ? true : null, status: st16, motivo: baseN && divAlta ? (confDiv ? "divergência alta confirmada pelo RT " + confDiv.responsavel : "pendente de confirmação do RT (divergência alta × regra de fabricante)") : null, passos: r16.componentes.map(function (c) { return c.tipo + ": " + c.passos.join("; "); }).concat(r16.premissas), fonte: null });
          arr(r16.alertas).forEach(function (t) { aviso("aviso", a.nome + ": " + t, [a.id], { texto: "confirmar a cidade de referência com o RT (entrada.local.cidade)" }); });
          if (r16.status !== "ok") aviso("aviso", a.nome + ": método da NBR 16655-3 PENDENTE (" + r16.componentes.filter(function (c) { return c.status !== "ok"; }).map(function (c) { return c.pendencias.join(", "); }).join("; ") + ") — capacidade pelo método de conferência", [a.id],
                                         { texto: "informar no ambiente o que falta (pessoas, iluminacao_W, equipamentos16655 ou equipamentos_W)" });
        }
        verif({ alvo: a.id, nome: "carga térmica por componentes (" + a.nome + ")" + (cg.metodo === "nbr16655_3" ? " — conferência" : ""), valor: cg.total_BTUh, limite: null, unidade: "BTU/h", eta: null,
                ok: stCarga === "ok" ? true : null, status: stCarga, motivo: divAlta && !baseN ? (confDiv ? "divergência alta confirmada pelo RT " + confDiv.responsavel : "pendente de confirmação do RT (divergência alta × regra de fabricante)") : null,
                passos: cg.componentes.map(function (c) { return c.tipo + ": " + c.passos.join("; "); }), fonte: null });
        if (divAlta) aviso(confDiv ? "info" : "aviso", a.nome + ": divergência alta: " + (baseN ? "NBR 16655-3 " : "componentes ") + valBase + " BTU/h × regra " + cg.rapida.maior_BTUh + " BTU/h (" + fmt(valBase / cg.rapida.maior_BTUh * 100, 0) + " % da regra) — conferir ocupação (" + (cg.pessoas == null ? "não informada" : cg.pessoas + " pessoa(s)" + (cg.pessoasOrigem === "fonte" ? ", estimada" : "")) + "), equipamentos e cargas internas" + (confDiv ? " — confirmada pelo RT " + confDiv.responsavel : ""), [a.id],
                           confDiv ? null : { texto: "revisar a entrada do ambiente (pessoas, equipamentos_W, iluminacao_W) ou, se a carga está certa, confirmar em confirmacoesRT { item: \"" + ITEM_DIVERGENCIA + a.id + "\", justificativa, responsavel }" });
        else if (cg.status === "ok" && cg.rapida.divergencia_pct != null) aviso("info", a.nome + ": componentes " + cg.total_BTUh + " BTU/h × regra de fabricante " + cg.rapida.maior_BTUh + " BTU/h (" + (cg.rapida.divergencia_pct > 0 ? "+" : "") + fmt(cg.rapida.divergencia_pct) + " %)", [a.id], null);
        if (cg.parcial) aviso("aviso", a.nome + ": carga por componentes PENDENTE (" + cg.pendencias.join(", ") + "); capacidade pela " + (cg.base === "nbr16655_3" ? "NBR 16655-3" : (cg.base === "regra_fabricante" ? "regra de fabricante" : "maior das duas")) + ": " + (cg.requerida_BTUh == null ? "—" : cg.requerida_BTUh + " BTU/h"), [a.id],
                              { texto: cg.metodoEnvoltoria === "dte" && cg.pendencias.some(function (k) { return k === "cl.componentes.dte" || k === "cl.vidro.ganho_solar"; })
                                  ? "escolher em Clima › Local uma cidade com dado climático (" + ((dep("ClimClima", "./climclima.js") || { estacoes: function () { return []; } }).estacoes().join(", ")) + ") — paredes, cobertura e vidros saem pela sol-ar; ou informar os U/fatores do RT"
                                  : "informar ocupação/cargas do ambiente e completar os coeficientes (dados-fonte/hidro/normas — NBR 16655-3) ou os U/fatores do RT" });
        /* a hora e o mês de pico da envoltória (sol-ar) — vai ao memorial e à tela */
        if (cg.solar) aviso("info", a.nome + ": pico da envoltória às " + cg.solar.pico.hora + " h de " + cg.solar.dia + "/" + cg.solar.pico.mes + " (" + fmt(cg.solar.pico.envoltoria_W, 0) + " W em paredes, cobertura e vidros, céu claro, " + cg.solar.estacao + ")", [a.id], null);
      }
      var s = SI.porAmbiente(a, cargas[a.id], conjs, { prioridade: pref.prioridade, edificacao: entrada.edificacao }, ctx);
      item.solucoes = s.solucoes; item.todas = s.todas;
      if (item.climatizar && !s.solucoes.length) aviso("erro", a.nome + ": nenhuma solução viável (" + s.todas.map(function (t) { return t.nome + ": " + t.impedimentos.join("; "); }).join(" | ") + ")", [a.id],
                                                        { texto: "solução central (multi-split/VRF) ou dividir a carga em duas evaporadoras" });
      res.ambientes.push(item); porId[a.id] = { amb: a, item: item };
    });
    Object.keys(naoUsadas).forEach(function (k) { aviso("info", "fonte existente não usada na verificação rápida: " + naoUsadas[k].motivo, [], { texto: "gerente: gravar a tabela Daikin como chave própria ou expor sub-tabela no leitor (CONTRATO-CLIMA §1.1)" }); });

    /* 5) centrais */
    res.centrais = SI.centrais(ambs, cargas, pref, ctx, { simultaneidade: opc.simultaneidade, edificacao: entrada.edificacao });
    var modoCentral = (pref.central === "sim" || pref.reduzirFachada === true) && res.centrais.length > 0;

    /* 6) equipamento, posição, rede, ops */
    var destinos = arr(entrada.destinosDreno).length ? entrada.destinosDreno : destinosDoModelo(est);
    var cotas = ambs.map(function (a) { return num(a.cota_m) || 0; }), cotaTerreo = cotas.length ? Math.min.apply(null, cotas) : 0;
    var candUser = arr(entrada.locaisCondensadora);
    var ops = res.ops, criados = [];
    function op(o) { ops.push(o); if (o.id != null) criados.push(o.id); }
    function trechos(prefixo, segs, sistema, material, dn, extra) {
      segs.forEach(function (s, i) { var o = { op: "trecho", id: prefixo + "-" + i, sistema: sistema, material: material, p1: p3(s.p1), p2: p3(s.p2), aplicacao: s.aplicacao }; if (dn != null) o.dn = dn; else o.dnPendente = true;   /* dn null NÃO vai no op: o biminst leria 0 e recusaria o trecho calado; sem dn ele usa o padrão do material e AVISA */
        Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); op(o); });
    }
    function deslocar(segs, d) { return segs.map(function (s) { return { p1: { x: s.p1.x + d.x, y: s.p1.y, z: s.p1.z + d.z }, p2: { x: s.p2.x + d.x, y: s.p2.y, z: s.p2.z + d.z }, aplicacao: s.aplicacao }; }); }

    /* ⚠ folga sobre a carga: a NBR 16655-3 (4.1 e Seção 5) e a NBR 16401-1 (7.1.1) proíbem fator de segurança e
       escolha com folga — folga declarada vira verificação REPROVADA com a fonte (a pessoa vê e decide) */
    if (num(pref.folga_pct) > 0) {
      var cSF = ctx.consulta(entrada.edificacao === "comercial" ? "cl.nbr16401_1.regras" : "cl.nbr16655_3.regras", { parametro: "sem_fator_seguranca" }, "texto", "folga sobre a carga");
      verif({ alvo: "preferencias", nome: "folga sobre a carga térmica", valor: num(pref.folga_pct), limite: 0, unidade: "%", eta: null, ok: false, status: "reprovado",
              passos: ["folga declarada de " + pref.folga_pct + " %" + (cSF.ok ? " — " + cSF.valor + " (" + cSF.linha.item + ")" : "")], fonte: cSF.ok ? cSF.fonte : null });
      aviso("erro", "folga de " + pref.folga_pct + " % sobre a carga: a norma manda escolher sem fator de segurança nem folga", [], { texto: "zerar preferencias.folga_pct" });
    }
    var esc16655 = ctx.consulta("cl.nbr16655_1.requisitos", { parametro: "escopo_capacidade_max" }, "valor", "escopo da NBR 16655");
    var afast = ctx.consulta("cl.nbr16655_1.requisitos", { parametro: "afastamento_parede_min" }, "valor", "afastamento da condensadora"), afast_m = afast.ok ? num(afast.valor) / 1000 : null;
    var evaps = [];
    res.ambientes.forEach(function (item) {
      if (!item.climatizar || !item.solucoes.length) return;
      var a = porId[item.id].amb, cg = cargas[a.id];
      /* C1b: entrada.escolhas = { idDoAmbiente: tipo } — a tela aplica a solução que a pessoa escolheu (a 2ª ou 3ª), desde que seja uma das sugeridas; senão a 1ª */
      var pedido = entrada.escolhas && entrada.escolhas[item.id], tipo = item.solucoes.some(function (x) { return x.tipo === pedido; }) ? pedido : item.solucoes[0].tipo;
      var eq = EQ.escolher(tipo, cg.requerida_BTUh, null, pref, ctx, conjs), conj = eq.conjunto, conjDim = conj;
      /* central: a evaporadora é da linha multi-split/VRF (sem catálogo) — o split avulso só empresta as
         DIMENSÕES para posicionar; capacidade e limites ficam pendentes (nunca os do split avulso) */
      if (modoCentral) {
        if (conj) eq = { status: "pendente", conjunto: null, necessaria_BTUh: eq.necessaria_BTUh, passos: eq.passos.concat(["evaporadora de " + res.centrais[0].nome + ": catálogo não extraído — dimensões de referência do " + conj.id]) };
        conj = null;
        ctx.pendencia("catalogo.clim.evaporadora_" + res.centrais[0].tipo, "evaporadoras de " + res.centrais[0].nome + " sem catálogo extraído", "equipamento de " + a.nome);
      }
      verif({ alvo: a.id, nome: "capacidade do equipamento (" + a.nome + ")", valor: conj ? conj.capacidade_BTUh : null, limite: eq.necessaria_BTUh, unidade: "BTU/h",
              eta: conj && eq.necessaria_BTUh ? eq.necessaria_BTUh / conj.capacidade_BTUh : null, ok: eq.status === "ok" ? (cg.status === "ok" ? true : null) : (eq.status === "reprovado" ? false : null),
              status: eq.status === "ok" ? (cg.status === "ok" ? "ok" : "pendente") : eq.status, passos: eq.passos, fonte: null });
      if (eq.status === "reprovado") aviso("erro", a.nome + ": carga de " + cg.requerida_BTUh + " BTU/h acima do maior " + tipo + " do catálogo (" + eq.maiorDoCatalogo_BTUh + " BTU/h)", [a.id],
                                           { texto: "usar a 2ª solução (" + (item.solucoes[1] ? item.solucoes[1].nome : "piso-teto/cassete") + ") ou duas evaporadoras" });
      if (conj && esc16655.ok && conj.capacidade_W > num(esc16655.valor) * 1000) aviso("info", a.nome + ": " + conj.id + " (" + fmt(conj.capacidade_W / 1000, 1) + " kW) acima do escopo da NBR 16655 (até " + esc16655.valor + " kW): instalação pela NBR 16401-1", [a.id], null);
      var pos = LO.evaporadora(a, tipo, conjDim, null);
      if (!pos.ok) { aviso("erro", a.nome + ": " + pos.motivo, [a.id], { texto: "escolher outra solução do ambiente" }); return; }
      item.escolha = { tipo: tipo, equipamento: conj ? { id: conj.id, fabricante: conj.fabricante, capacidade_BTUh: conj.capacidade_BTUh, evaporadora: conj.evaporadora.codigo, condensadora: conj.condensadora.codigo } : null,
                       equipamentoStatus: eq.status, evaporadora: pos, condensadora: null, rede: null, dreno: null, duto: null, eletrica: conj ? conj.eletrica : null, suporte: null };
      if (conj && cg.requerida_BTUh > 0) {
        var limExc = num(pref.limiteExcedente_pct) != null ? num(pref.limiteExcedente_pct) : LIMITE_EXCEDENTE_PCT;
        var exc = (conj.capacidade_BTUh - cg.requerida_BTUh) / cg.requerida_BTUh * 100;
        item.escolha.excedente_pct = Math.round(exc * 10) / 10;   /* clim:ok arredondamento a 1 casa */
        item.escolha.excedente = { pct: item.escolha.excedente_pct, limiteAviso_pct: limExc, criterio: num(pref.limiteExcedente_pct) != null ? "entrada" : "critério do projetista (padrão do motor)",
                                   texto: conj.capacidade_BTUh + " BTU/h para " + cg.requerida_BTUh + " BTU/h: +" + fmt(exc) + " % (menor modelo do catálogo que atende — não é fator de segurança)" };
        if (exc > limExc) aviso("aviso", a.nome + ": equipamento " + conj.id + " " + fmt(exc) + " % acima da carga (limite de aviso " + limExc + " %, critério do projetista)", [a.id],
                                { texto: "conferir um modelo menor de outro fabricante/linha ou um inverter (modula a capacidade) — não é reprovação" });
      }
      if (!pos.jatoLivre) aviso("aviso", a.nome + ": o jato da evaporadora atinge a cama/sofá em todas as paredes possíveis", [a.id], { texto: "mudar a cama/sofá de lugar ou escolher cassete/duto" });
      evaps.push({ id: a.id, amb: a, item: item, pos: pos, conj: conj, conjDim: conjDim, forro: a.forro && a.forro.existe, tipo: tipo });
    });

    function fechaRede(e, condPos, condTipo, condId, linha) {
      var a = e.amb, item = e.item, id = "clim-" + a.id, rotaL = linha.rota;
      item.escolha.condensadora = { id: condId, x: condPos.x, y: condPos.y, z: condPos.z, tipo: condTipo };
      if (e.conj) {
        var fr = RD.frigorigena(e.conj, rotaL, ctx); item.escolha.rede = fr;
        fr.verificacoes.forEach(function (v) { var w = copia(v); w.alvo = a.id; verif(w); });
        var fora = fr.verificacoes.filter(function (v) { return v.status === "reprovado"; });
        if (fora.length) {
          /* "Corrigir": outro modelo do mesmo tipo, que atende à carga, aceita ESTA linha */
          var alt = conjs.filter(function (c) { return c.tipo === e.tipo && c.capacidade_BTUh >= (e.item.carga.requerida_BTUh || 0) && c.id !== e.conj.id && EQ.verificarLinha(c, rotaL, a.id).ok; })
                         .sort(function (x, y) { return x.capacidade_BTUh - y.capacidade_BTUh; })[0];
          aviso("erro", a.nome + ": " + fora.map(function (v) { return v.nome + " " + fmt(v.valor, 2) + " > " + fmt(v.limite, 1) + " " + v.unidade; }).join("; ") + " (" + e.conj.id + ")", [id + "-evap", condId],
                { texto: alt ? "trocar para " + alt.fabricante + " " + alt.id + " (limite " + alt.limites.comprimentoMax_m + " m " + alt.limites.tipoComprimento + ", desnível " + alt.limites.desnivelMax_m + " m) ou aproximar a condensadora" :
                               "aproximar a condensadora (área técnica/fachada mais perto) — nenhum modelo do catálogo aceita esta linha" });
        }
        trechos(id + "-fl", rotaL.segmentos, "frigorigeno", "cobre_frigorigeno", fr.liquido_mm, { iso: "com", linha: "liquido" });
        var off = ((fr.liquido_mm || 0) + (fr.succao_mm || 0)) / 1000;   /* as duas linhas lado a lado, encostadas */
        trechos(id + "-fs", deslocar(rotaL.segmentos, { x: off, z: off }), "frigorigeno", "cobre_frigorigeno", fr.succao_mm, { iso: "com", linha: "succao" });
        if (fr.extras && fr.extras.cargaAdicional_pendente) ctx.pendencia("catalogo.clim.carga_adicional[" + e.conj.fabricante + "]", fr.extras.cargaAdicional_pendente, "carga de gás de " + a.nome);
      } else ctx.pendencia("equipamento." + e.tipo, "sem equipamento escolhido: diâmetros e limites da linha pendentes", "rede de " + a.nome);
      /* dreno */
      var dests = destinos.length ? destinos : [{ id: condId + "-ext", tipo: "externo", x: condPos.x, y: num(a.cota_m) || 0, z: condPos.z }];
      if (!destinos.length) aviso("aviso", a.nome + ": nenhum ralo/caixa de esgoto ou pluvial no modelo — dreno levado ao pé da condensadora (externo)", [id + "-dr-0"], { texto: "ligar o dreno a um ponto de pluvial/esgoto (com sifão) — gotejar na fachada não" });
      var dr = RD.dreno(e.pos, e.conj, dests, ctx, e.forro); item.escolha.dreno = dr;
      verif({ alvo: a.id, nome: "dreno por gravidade (" + a.nome + ")", valor: dr.inclinacaoDisp_pct, limite: dr.inclinacaoMin_pct, unidade: "%", eta: null,
              ok: dr.status === "ok" ? true : null, status: dr.status, passos: dr.passos, fonte: null });
      if (dr.dn != null || dr.segmentos.length) trechos(id + "-dr", dr.segmentos, "dreno", "pvc_soldavel", dr.dn, {});
      if (dr.bomba) op({ op: "familia", id: id + "-bomba", famId: FAMILIAS.bomba, tipoId: null, x: r4(e.pos.x), y: r4(e.pos.y), z: r4(e.pos.z), rotY: 0, inst: {} });
      if (dr.sifao && dr.destino) op({ op: "familia", id: id + "-sifao", famId: FAMILIAS.sifao, tipoId: null, x: r4(dr.destino.x), y: r4(dr.destino.y), z: r4(dr.destino.z), rotY: 0, inst: {} });
      /* duto (unidade dutada): da unidade ao insuflamento + terminais */
      if (e.tipo === "duto" && e.pos.insuflamento) {
        var Q = e.conj && e.conj.evaporadora.vazaoAr_m3h != null ? e.conj.evaporadora.vazaoAr_m3h : RD.vazaoPelaCarga(item.carga.sensivel_W, opc.duto, ctx);
        var ins = e.pos.insuflamento, Lr = Math.abs(ins.x - e.pos.x) + Math.abs(ins.z - e.pos.z), du = RD.duto(Q, Lr, opc.duto, ctx, a.uso);
        du.terminais = RD.terminais(Q, 1, ctx, a.nome); item.escolha.duto = du;
        verif({ alvo: a.id, nome: "velocidade no duto (" + a.nome + ")", valor: du.velocidade_ms || null, limite: du.verificacaoVelocidade ? du.verificacaoVelocidade.limite : null, unidade: "m/s", eta: null,
                ok: du.status === "ok" ? true : (du.status === "reprovado" ? false : null), status: du.status, passos: du.passos, fonte: null });
        if (du.a_mm && Lr > EPS) op({ op: "trecho", id: id + "-du-0", sistema: "ar", material: "duto_chapa", larg: du.a_mm / 1000, alt: du.b_mm / 1000, p1: p3(e.pos), p2: p3({ x: ins.x, y: e.pos.y, z: ins.z }) });
      }
      /* ponto de força junto à evaporadora (caixa 4×2 do biminst) */
      op({ op: "peca", id: id + "-pf", peca: "caixa_4x2", sistema: "eletrica", x: r4(e.pos.x), y: r4(e.pos.y), z: r4(e.pos.z), alturaPiso: r4(e.pos.y - (num(a.cota_m) || 0)) });
      if (e.conj && e.conj.eletrica && e.conj.eletrica.disjuntor_A == null) ctx.pendencia("catalogo.clim.disjuntor[" + e.conj.fabricante + "]", "disjuntor recomendado não consta do catálogo", "ponto de força de " + a.nome);
    }

    var condCriadas = 0;
    if (modoCentral) {
      var cands = candUser.concat(LO.candidatosFachada(ambs, null, cotaTerreo, afast_m));
      var esc = LO.condensadora(evaps.map(function (e) { return { id: e.id, pos: e.pos, conj: null, forro: e.forro }; }), cands, ctx).escolhido;
      var central = res.centrais[0];
      aviso("aviso", "solução central (" + central.nome + "): capacidade da condensadora, nº de evaporadoras e limites de tubulação pendentes de catálogo", [], { texto: "extrair o catálogo de multi-split/VRF do fabricante escolhido" });
      if (esc) {
        var cid = "clim-central-cond";
        op({ op: "familia", id: cid, famId: FAMILIAS.condensadora_multi, tipoId: null, x: esc.candidato.x, y: esc.candidato.y, z: esc.candidato.z, rotY: esc.candidato.rotY || 0, inst: { Capacidade_BTUh: central.carga_BTUh } });
        condCriadas = 1;
        evaps.forEach(function (e, i) {
          op({ op: "familia", id: "clim-" + e.id + "-evap", famId: FAMILIAS[e.tipo], tipoId: e.conj ? e.conj.evaporadora.codigo : null, x: e.pos.x, y: e.pos.y, z: e.pos.z, rotY: r4(e.pos.rotY || 0), inst: {} });
          fechaRede(e, esc.candidato, esc.candidato.tipo, cid, esc.linhas[i]);
        });
      }
    } else {
      evaps.forEach(function (e) {
        var a = e.amb, temExt = arr(a.paredes).some(function (p) { return p.externa; });
        var fach = LO.candidatosFachada(temExt ? [a] : ambs.filter(function (b) { return b.pavimento === a.pavimento; }), e.conj, cotaTerreo, afast_m);
        var r = LO.condensadora([{ id: a.id, pos: e.pos, conj: e.conj, forro: e.forro }], candUser.concat(fach), ctx);
        if (!r.escolhido) { aviso("erro", a.nome + ": nenhum lugar para a condensadora (sem fachada nem área técnica informada)", [a.id], { texto: "informar a área técnica/cobertura em Clima › Locais da condensadora" }); return; }
        /* a evaporadora vai para a parede mais perto da condensadora escolhida (linha curta), mantendo o jato livre */
        var pos2 = LO.evaporadora(a, e.tipo, e.conjDim, r.escolhido.candidato);
        if (pos2.ok && (pos2.jatoLivre || !e.pos.jatoLivre)) { e.pos = pos2; e.item.escolha.evaporadora = pos2; r = LO.condensadora([{ id: a.id, pos: e.pos, conj: e.conj, forro: e.forro }], [r.escolhido.candidato], ctx); }
        var c = r.escolhido.candidato, cid = "clim-" + a.id + "-cond";
        op({ op: "familia", id: "clim-" + a.id + "-evap", famId: FAMILIAS[e.tipo], tipoId: e.conj ? e.conj.evaporadora.codigo : null, x: e.pos.x, y: e.pos.y, z: e.pos.z, rotY: r4(e.pos.rotY || 0),
             inst: e.conj ? { Fabricante: e.conj.fabricante, Capacidade_BTUh: e.conj.capacidade_BTUh } : {} });
        op({ op: "familia", id: cid, famId: FAMILIAS.condensadora, tipoId: e.conj ? e.conj.condensadora.codigo : null, x: c.x, y: c.y, z: c.z, rotY: r4(c.rotY || 0), inst: {} });
        condCriadas++;
        if (c.tipo === "fachada") {
          var sp = LO.suporte(e.conj, ctx); e.item.escolha.suporte = sp;
          /* afastamento da face da condensadora à parede: 16655-1 4.4.7.2 (200 mm na falta do fabricante) — posição gerada já com ele */
          verif({ alvo: a.id, nome: "afastamento da condensadora à parede (" + a.nome + ")", valor: c.afastamento_m != null ? c.afastamento_m * 1000 : null, limite: afast_m != null ? afast_m * 1000 : null, unidade: "mm", eta: null,
                  ok: c.gerado && afast_m != null && c.afastamento_m >= afast_m ? true : null, status: c.gerado && afast_m != null && c.afastamento_m >= afast_m ? "ok" : "pendente",
                  passos: [c.gerado ? "posição gerada a " + fmt((c.afastamento_m || 0) * 1000, 0) + " mm da parede (NBR 16655-1 4.4.7.2, na falta de dado do fabricante)" : "local informado pelo usuário: conferir o afastamento no local"], fonte: afast.ok ? afast.fonte : null });
          verif({ alvo: a.id, nome: "suporte da condensadora (" + a.nome + ")", valor: sp.cargaPorMaoFrancesa_kg || null, limite: null, unidade: "kg por mão-francesa", eta: null, ok: sp.status === "ok" ? true : null, status: sp.status, passos: sp.passos, fonte: sp.fonte || null });
          op({ op: "familia", id: cid + "-sup", famId: FAMILIAS.suporte, tipoId: null, x: c.x, y: r4(c.y - (num(e.conj && e.conj.condensadora.dim.altura_mm) || 0) / 1000 / 2), z: c.z, rotY: r4(c.rotY || 0), inst: { CargaPorMaoFrancesa_kg: sp.cargaPorMaoFrancesa_kg || null } });
        }
        fechaRede(e, c, c.tipo, cid, r.escolhido.linhas[0]);
      });
      if (res.centrais.length && evaps.length > 1) aviso("info", "alternativa: " + res.centrais[0].nome + " — " + res.centrais[0].fachadaEvitada + " condensadora(s) a menos na fachada", [], { texto: "preferências › uma condensadora para todos" });
    }

    /* 6b) manual de instalação (NBR 16655-2 procedimento; NBR 16655-1 inspeção, partida, elétrica, isolamento).
       ⚠ não é dimensionamento: a pendência daqui (valor ambíguo ou que depende do fluido) vai em
       manualInstalacao.pendencias com a página, e NÃO derruba o ok do cálculo. Quem consome: climmemorial/hidmanual. */
    var NRm = NR, proc = NRm.tabela("cl.nbr16655_2.procedimento"), reqs = NRm.tabela("cl.nbr16655_1.requisitos");
    res.manualInstalacao = { estanqueidade: [], instalacao: [], pendencias: [], fontes: [] };
    if (proc) { res.manualInstalacao.fontes.push(NRm.fonte("cl.nbr16655_2.procedimento")); proc.linhas.forEach(function (l) { var o = copia(l); res.manualInstalacao.estanqueidade.push(o); if (l.status === "pendente") res.manualInstalacao.pendencias.push({ chave: "cl.nbr16655_2.procedimento[" + l.etapa + "]", motivo: l.criterio, item: l.item, pagina_pdf: l.pagina_pdf }); }); }
    if (reqs) { res.manualInstalacao.fontes.push(NRm.fonte("cl.nbr16655_1.requisitos")); reqs.linhas.filter(function (l) { return /^(suporte_|partida_|eletrica_|isolamento_|corrosao_)/.test(l.parametro); }).forEach(function (l) { res.manualInstalacao.instalacao.push(copia(l)); }); }
    NRm.pendentesDaFonte().filter(function (p) { return /^cl\.nbr16655_(1|2)\./.test(p.chave); }).forEach(function (p) { res.manualInstalacao.pendencias.push(p); });

    /* 7) RT (RE 9/2003): capacidade total */
    var tot = res.ambientes.reduce(function (s, it) { return s + (it.escolha && it.escolha.equipamento ? it.escolha.equipamento.capacidade_BTUh : (it.carga && it.carga.requerida_BTUh) || 0); }, 0);
    var lrt = CC.linhaPorRotulo(ctx, "cl.ar_exterior_re9_2003", null, "parametro", /Responsável técnico/i, "responsável técnico (capacidade total)");
    var lim = lrt ? CC.numeroAntesDe(lrt.valor, /BTU\/h/) : null;
    if (lim != null && tot >= lim) aviso("info", "capacidade total " + Math.round(tot) + " BTU/h ≥ " + lim + " BTU/h: a RE 9/2003 pede responsável técnico pela qualidade do ar (vigência da RE 9 a confirmar)", [], null);

    /* 8) ops inversas e requisitos */
    for (var k = criados.length - 1; k >= 0; k--) res.opsDesfazer.push({ op: "apagar", id: criados[k] });
    var faltaSis = {}, faltaFam = {};
    ops.forEach(function (o) {
      if (o.op === "trecho" && !(BI && BI.SISTEMAS && BI.SISTEMAS[o.sistema])) faltaSis[o.sistema] = 1;
      if (o.op === "familia" && !((FR && FR.obter && FR.obter(o.famId)) || (CF && CF.obter && CF.obter(o.famId)))) faltaFam[o.famId] = 1;
    });
    Object.keys(faltaSis).forEach(function (s) { res.requisitos.push({ item: "sistema " + s + " no biminst", motivo: "o biminst recusa trecho de sistema desconhecido", onde: "docs/hidro/PATCH-BIMINST-CLIMA.md" }); });
    Object.keys(faltaFam).forEach(function (f) { res.requisitos.push({ item: "família " + f, motivo: "família de climatização não existe (js/climfamilias.js não carregou ou o id mudou)", onde: "js/climfamilias.js" }); });
    res.aplicavel = res.requisitos.length === 0;
    res.opsJaAceitas = ops.filter(function (o) { return (o.op === "trecho" && !faltaSis[o.sistema]) || o.op === "peca" || (o.op === "familia" && !faltaFam[o.famId]); });
    if (!res.aplicavel) aviso("aviso", "o modelo ainda não aceita tudo o que foi dimensionado: " + res.requisitos.map(function (r) { return r.item; }).join(", "), [],
                              { texto: "aplicar o patch do biminst e criar as famílias ra-clim-*; até lá dá para aplicar só " + res.opsJaAceitas.length + " op(s) já aceitas (dutos e pontos de força)", ops: res.opsJaAceitas });

    /* 9) normas, fonte, pendências, ok */
    res.normas = ctx.normas();
    res.pendencias = ctx.pendencias();
    var sec = res.normas.filter(function (n) { return n.tipo === "secundaria"; });
    if (sec.length) aviso("aviso", sec.length + " de " + res.normas.length + " tabela(s) usadas vêm de FONTE SECUNDÁRIA (fabricante, apresentação, arquivo climático): conferir antes de assinar", [], { texto: "consultar a NBR 16401/16655 (convênio Confea) e trocar a fonte para primária" });
    if (res.fixture) aviso("erro", "TABELAS DE TESTE — NÃO É NORMA: este resultado foi calculado com a fixture de teste e não pode ir a memorial", [], null);
    if (res.pendencias.length) aviso("aviso", res.pendencias.length + " valor(es) de norma, catálogo ou entrada pendente(s): o dimensionamento não está completo (ver pendências)", [], { texto: "completar dados-fonte/hidro (normas e catálogos) ou a entrada" });
    var reprov = res.verificacoes.filter(function (v) { return v.status === "reprovado"; }).length, pend = res.verificacoes.filter(function (v) { return v.status === "pendente"; }).length;
    var erros = res.avisos.filter(function (a) { return a.gravidade === "erro"; }).length;
    res.ok = !reprov && !erros && !res.pendencias.length && !pend;
    res.resumo = { ambientes: ambs.length, climatizados: res.ambientes.filter(function (i) { return i.climatizar; }).length, carga_BTUh: Math.round(tot), condensadoras: condCriadas,
                   central: modoCentral ? res.centrais[0].tipo : null, ops: ops.length, opsJaAceitas: res.opsJaAceitas.length, pendentes: pend + res.pendencias.length, reprovadas: reprov, erros: erros };
    return res;
  }

  var ClimDimensionar = { VERSAO: 1, FAMILIAS: FAMILIAS, calcular: calcular, lerModelo: lerModelo, aplicarDados: aplicarDados, usoDoNome: usoDoNome, destinosDoModelo: destinosDoModelo,
                          geo: { dentroPoligono: dentroPoligono, centroide: centroide, lajeCobre: lajeCobre } };
  global.ClimDimensionar = ClimDimensionar;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimDimensionar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
