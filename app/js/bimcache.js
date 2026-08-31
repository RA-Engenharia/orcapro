/* =====================================================================
 * bimcache.js — O MODELO CONVERTIDO, GUARDADO (o NWC do OrçaPRO)
 *
 * O QUE ESTE ARQUIVO RESOLVE (D4)
 * Toda abertura reparseia o IFC inteiro pelo WASM. Reabrir a obra na segunda
 * ora custa o mesmo que na primeira — e num IFC de obra isso é minuto, com a
 * interface congelada. É exatamente o problema que o Navisworks resolveu com o
 * NWC: converter uma vez, abrir do convertido depois.
 *
 * Aqui o convertido vai para o IndexedDB e a reabertura monta a cena direto,
 * SEM tocar no WASM.
 *
 * ⚠ POR QUE ESTE ARQUIVO É PURO
 * Ele decide FORMATO e POLÍTICA — o que entra, quando o guardado deixa de
 * valer, e o que é descartado quando falta espaço. Decisão dessas não pode
 * morar em `js/bim.js`, que é módulo ES, não entra no gate e não tem teste. O
 * I/O (IndexedDB) fica lá; a decisão fica aqui, com teste em Node.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TRÊS ESCOLHAS QUE O RESTO DO ARQUIVO SÓ FAZ CUMPRIR
 *
 * 1. ⚠ O CACHE NÃO GUARDA NADA DA OBRA. Ele é chaveado pelo CONTEÚDO do
 *    arquivo (`arquivoId`), e o mesmo arquivo pode estar em duas obras. Se a
 *    transparência, a visibilidade ou a disciplina escolhida pelo usuário
 *    entrassem aqui, abrir o modelo na obra B herdaria o que foi ajustado na
 *    obra A. Isso mora em `bim_modelos` (js/bimfed.js), que é por obra.
 *
 * 2. ⚠ A GEOMETRIA É DEDUPLICADA NO DISCO, E SÓ NO DISCO. O mesmo
 *    `geometryExpressID` se repete muito (pilar, porta, tê de PVC — a maior
 *    parte do MEP), e guardar uma vez só é uma economia grande. Mas na hora de
 *    montar, cada peça vira uma malha própria com a matriz já assada dentro,
 *    IGUAL ao que a abertura normal faz hoje. Compartilhar a geometria entre
 *    malhas (InstancedMesh) é o B2, e mexe em trena, encaixe e corte técnico —
 *    que são justamente os recursos que diferenciam o produto. O cache não é
 *    lugar de mudar o que a cena É; ele só evita reconverter.
 *
 * 3. ⚠ O QUE DÁ PARA RECALCULAR NÃO É GUARDADO. Caixa envolvente por peça e a
 *    altura real do pavimento saem de `THREE.Box3` sobre as malhas — não
 *    precisam de WASM, e as malhas restauradas são as mesmas. Guardar seria
 *    criar uma segunda verdade que envelhece: no dia em que o cálculo mudar,
 *    o modelo do cache continuaria com o número velho e ninguém veria.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ SUBIR ESTE NÚMERO INVALIDA TODO CACHE GRAVADO — e é para isso que ele
   * serve. Mudou o que entra no registro, mudou a forma de um campo, mudou a
   * versão do web-ifc ou do three: sobe. O custo é uma reconversão por arquivo,
   * uma vez. O custo de NÃO subir é montar uma cena com dado de formato antigo
   * e descobrir pelo defeito. */
  var V = 3;

  var PREFIXO = "bimcache:";
  var MARCA_INDICE = "_indice";

  function txt(s) { return String(s == null ? "" : s).trim(); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }

  /* ---------------------------------------------------------------
   * AS CHAVES DO BANCO — e por que elas levam a EMPRESA
   *
   * ⚠ O IndexedDB é por ORIGEM, não por conta. Tudo no localStorage é
   * separado por empresa (`orcapro:<empresaId>:<entidade>`); o cache do BIM
   * nasceu sem isso, e o mesmo navegador atende mais de um tenant — duas
   * licenças no computador do escritório é situação suportada. Sem o
   * empresaId na chave, o descarte por falta de espaço varria o índice
   * INTEIRO e a mensagem dizia ao cliente B o nome do arquivo de projeto do
   * cliente A ("liberei o modelo guardado de RESIDENCIAL-VILA-MARIA-EST.ifc").
   * Nome de projeto de cliente não atravessa tenant.
   * ------------------------------------------------------------- */
  function prefixoDe(empresaId) {
    var e = txt(empresaId) || "default";
    return PREFIXO + e + ":";
  }
  function chave(empresaId, arquivoId) {
    var a = txt(arquivoId);
    return a ? (prefixoDe(empresaId) + a) : "";
  }
  function chaveIndice(empresaId) { return prefixoDe(empresaId) + MARCA_INDICE; }
  function ehChaveDeModelo(k, empresaId) {
    var s = txt(k), p = prefixoDe(empresaId);
    return s.indexOf(p) === 0 && s !== (p + MARCA_INDICE);
  }
  function arquivoIdDaChave(k, empresaId) {
    return ehChaveDeModelo(k, empresaId) ? txt(k).slice(prefixoDe(empresaId).length) : "";
  }
  /* ⚠ O QUE FICOU DA VERSÃO SEM TENANT. As chaves antigas (`bimcache:<id>`,
   * sem empresa) viraram invisíveis para tudo acima — e invisível não é
   * inofensivo: ocupariam a cota do navegador para sempre, sem ninguém
   * conseguir listá-las nem descartá-las. Esta função as devolve para a casca
   * apagar uma vez. */
  function ehChaveLegado(k) {
    var s = txt(k);
    if (s.indexOf(PREFIXO) !== 0) return false;
    var resto = s.slice(PREFIXO.length);
    return resto.indexOf(":") < 0;          /* sem o segmento da empresa */
  }

  /* ---------------------------------------------------------------
   * tipagem — o registro tem de sobreviver ao structured clone
   *
   * O IndexedDB do produto grava o objeto cru (js/idb.js). Isso é o que
   * permite guardar `Float32Array` sem virar `{"0":1.5,"1":…}`. Mas o mesmo
   * caminho REJEITA o que não é clonável — e a cena viva está cheia disso:
   * `THREE.Group`, `THREE.Mesh`, `MeshStandardMaterial`. Um desses dentro do
   * registro faz a gravação estourar `DataCloneError`, dentro de um `catch`,
   * e o cache simplesmente nunca funciona — sem nada na tela.
   *
   * Por isso `montar` não recebe um objeto e o repassa: ele CONSTRÓI o
   * registro campo a campo, a partir de uma lista fechada. O que não está na
   * lista não entra, e não há como um material entrar por descuido.
   * ------------------------------------------------------------- */
  function f32(a) {
    if (a instanceof Float32Array) return a;
    if (a && a.length != null) return new Float32Array(a);
    return new Float32Array(0);
  }
  function u32(a) {
    if (a instanceof Uint32Array) return a;
    if (a instanceof Uint16Array) return new Uint32Array(a);   /* índice pequeno vem 16 bits */
    if (a && a.length != null) return new Uint32Array(a);
    return new Uint32Array(0);
  }
  /* ⚠ A MATRIZ DA PEÇA É DUPLA PRECISÃO, E ISSO NÃO É PRECIOSISMO. Os
   * vértices já saem do web-ifc em float32 (é a HEAPF32), mas a
   * `flatTransformation` vem em double — é ela que carrega a POSIÇÃO da peça
   * no mundo. Guardar em float32 foi medido no navegador: o mesmo modelo,
   * restaurado, saía 1 a 3 micrômetros fora num arquivo de ~100 m. Parece
   * nada, e é nada nessa escala — mas float32 tem ~7 dígitos significativos, e
   * num IFC georreferenciado (UTM, ~7.000.000 m) esses 7 dígitos acabam no
   * METRO. É o D8 da especificação: trena mentindo em centímetros, tremida de
   * câmera e z-fighting. O cache não pode ser onde a precisão se perde. */
  function f64(a) {
    if (a instanceof Float64Array) return a;
    if (a && a.length != null) return new Float64Array(a);
    return new Float64Array(0);
  }
  /* mapa simples (expressID → objeto), copiado sem referência a nada vivo */
  function mapaSimples(m) {
    var out = {};
    if (!m || typeof m !== "object") return out;
    for (var k in m) { if (Object.prototype.hasOwnProperty.call(m, k)) out[k] = planificar(m[k]); }
    return out;
  }
  /* ⚠ a poda que impede objeto vivo de entrar: função, DOM e instância de
     classe do three viram `null` em vez de estourar na gravação */
  function planificar(v, prof) {
    prof = prof || 0;
    if (v == null) return null;
    var t = typeof v;
    if (t === "number") return isFinite(v) ? v : null;
    if (t === "string" || t === "boolean") return v;
    if (t === "function") return null;
    if (prof > 8) return null;                       /* ciclo/profundidade demais */
    if (v instanceof Float32Array || v instanceof Uint32Array || v instanceof Float64Array) return v;
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(planificar(v[i], prof + 1)); return a; }
    if (t === "object") {
      /* qualquer coisa com protótipo próprio (THREE.*, DOM, Promise) sai */
      var proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return null;
      var o = {};
      for (var k in v) { if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = planificar(v[k], prof + 1); }
      return o;
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * ELEMENTO — a lista fechada
   *
   * ⚠ `mid`, `uid`, `chave` e `disciplina` NÃO entram, de propósito:
   *   `mid`/`uid` são da SESSÃO (o `mid` é a ordem de abertura no WASM);
   *   `chave` depende da OBRA corrente (B0) e é re-carimbada ao montar;
   *   `disciplina` o usuário pode trocar, e a escolha dele é da obra.
   * Guardar qualquer um deles seria gravar como durável algo que não é — o
   * mesmo defeito que o B0 existe para consertar.
   * ------------------------------------------------------------- */
  /* ⚠ `nomeIfc` é o `Name` da linha IFC — "Parede básica:ALV 14 CHAPISCO:987654",
   * o nome pelo qual o engenheiro acha a peça no Revit e conversa com o
   * projetista. `nome` é o rótulo da disciplina ("Parede"), que é o que o
   * elemento carrega hoje. Sem guardar os dois, o modelo restaurado passava a
   * chamar TODAS as paredes de "Parede" e todos os tubos de "Tubo" — a peça
   * continuava certa, e o único jeito de identificá-la sumia. */
  var CAMPOS_ELEMENTO = ["id", "globalId", "tipo", "nome", "nomeIfc", "familia", "sistemaIfc",
                         "etapa", "codOrc", "fase", "tag"];

  function elementoLimpo(e) {
    var o = {};
    for (var i = 0; i < CAMPOS_ELEMENTO.length; i++) {
      var c = CAMPOS_ELEMENTO[i];
      var v = e ? e[c] : null;
      o[c] = (c === "id") ? num(v) : planificar(v == null ? "" : v);
    }
    return o;
  }

  /* ---------------------------------------------------------------
   * TOPOLOGIA DA REDE — e o defeito que ela quase levou ao disco
   *
   * `lerTopologiaRede` indexa as portas por `uid = mid + ':' + expressID`, e
   * `mid` é o handle do WASM DAQUELA sessão. Guardar isso cru e devolver num
   * modelo restaurado (que tem `mid` = 'cache1') produzia o pior tipo de
   * defeito: a topologia voltava POVOADA, então o aviso honesto do produto
   * ("este IFC não publica a ligação entre as peças") não disparava, e nenhuma
   * chave casava com peça nenhuma. Resultado na tela: zero ramais e todos os
   * tubos na lista de avulsos com o motivo "sem ligação publicada no IFC" — o
   * IFC do cliente publicava; quem trocou o namespace foi o cache. E, na
   * requisição de compra, joelho, luva e tê saíam sem bitola, sobre uma base
   * onde a mesma luva vai de 40 a 150 mm com dez vezes de diferença de preço.
   *
   * Aqui a topologia é guardada por expressID puro — o cache é de UM arquivo,
   * não precisa de prefixo — e recarimbada com o mid corrente ao montar. É o
   * mesmo tratamento que os elementos já recebiam.
   * ------------------------------------------------------------- */
  function semPrefixo(uid) {
    var s = txt(uid), i = s.lastIndexOf(":");
    return i < 0 ? s : s.slice(i + 1);
  }
  function topologiaParaDisco(topo) {
    if (!topo || typeof topo !== "object") return null;
    var out = { portaDe: {}, ligacao: planificar(topo.ligacao) || {}, portasDe: {},
                dirPorta: planificar(topo.dirPorta) || {}, nPortas: num(topo.nPortas), nLigacoes: num(topo.nLigacoes) };
    var k;
    for (k in (topo.portaDe || {})) {
      if (Object.prototype.hasOwnProperty.call(topo.portaDe, k)) out.portaDe[k] = semPrefixo(topo.portaDe[k]);
    }
    for (k in (topo.portasDe || {})) {
      if (!Object.prototype.hasOwnProperty.call(topo.portasDe, k)) continue;
      var v = topo.portasDe[k];
      out.portasDe[semPrefixo(k)] = Array.isArray(v) ? v.slice() : [];
    }
    return out;
  }
  function topologiaParaCena(topo, mid) {
    if (!topo || typeof topo !== "object") return null;
    var m = txt(mid);
    var out = { portaDe: {}, ligacao: topo.ligacao || {}, portasDe: {},
                dirPorta: topo.dirPorta || {}, nPortas: num(topo.nPortas), nLigacoes: num(topo.nLigacoes) };
    var k;
    for (k in (topo.portaDe || {})) {
      if (Object.prototype.hasOwnProperty.call(topo.portaDe, k)) out.portaDe[k] = m + ":" + semPrefixo(topo.portaDe[k]);
    }
    for (k in (topo.portasDe || {})) {
      if (Object.prototype.hasOwnProperty.call(topo.portasDe, k)) out.portasDe[m + ":" + semPrefixo(k)] = topo.portasDe[k];
    }
    return out;
  }

  /* ---------------------------------------------------------------
   * montar — do que o parse produziu para o que vai ao disco
   * ------------------------------------------------------------- */
  function montar(d) {
    d = d || {};
    var arquivoId = txt(d.arquivoId);
    if (!arquivoId) return { ok: false, erro: "sem arquivoId — o cache seria impossível de achar" };

    var geos = [], vistos = {};
    var listaG = d.geometrias || [];
    for (var i = 0; i < listaG.length; i++) {
      var g = listaG[i]; if (!g) continue;
      var gid = txt(g.gid !== undefined ? g.gid : g.g);
      if (!gid || vistos[gid]) continue;             /* dedup: a mesma geometria uma vez só */
      vistos[gid] = 1;
      geos.push({ g: gid, pos: f32(g.pos), nor: f32(g.nor), idx: u32(g.idx) });
    }
    if (!geos.length) return { ok: false, erro: "nenhuma geometria — não há o que guardar" };

    var inst = [], listaI = d.instancias || [];
    for (var j = 0; j < listaI.length; j++) {
      var it = listaI[j]; if (!it) continue;
      var gI = txt(it.gid !== undefined ? it.gid : it.g);
      /* ⚠ instância apontando para geometria que não está no registro montaria
         uma peça INVISÍVEL, sem erro. Melhor não guardar do que guardar torto. */
      if (!vistos[gI]) continue;
      inst.push({ e: num(it.e), g: gI, m: f64(it.m), cor: f32(it.cor) });
    }
    if (!inst.length) return { ok: false, erro: "nenhuma instância — a cena sairia vazia" };

    var els = [], listaE = d.elementos || [];
    for (var k = 0; k < listaE.length; k++) els.push(elementoLimpo(listaE[k]));

    var reg = {
      v: V,
      arquivoId: arquivoId,
      nome: txt(d.nome),
      /* ⚠ NUNCA os bytes do IFC (D6): só o tamanho, que é número e serve para
         diagnóstico. Guardar o arquivo aqui repetiria dentro do disco o mesmo
         inchaço que ele já causa na memória. */
      bytesArquivo: num(d.bytesArquivo),
      criadoEm: txt(d.criadoEm),
      webIfc: txt(d.webIfc),
      three: txt(d.three),
      /* deslocamento de origem: o B2 preenche (D8). Nasce zerado e declarado,
         para o formato não precisar de outra versão quando ele chegar. */
      /* dupla precisão pelo mesmo motivo da matriz: este campo vai carregar
         o deslocamento de origem do B2, que existe justamente para tirar as
         coordenadas georreferenciadas do alcance do float32 */
      origem: f64(d.origem && d.origem.length === 3 ? d.origem : [0, 0, 0]),
      geometrias: geos,
      instancias: inst,
      elementos: els,
      /* os mapas que SÓ o WASM sabe produzir — é por eles que o modelo
         restaurado continua tendo etapa, quantitativo, família e pavimento */
      tipos: planificar(d.tipos) || {},
      carimbos: mapaSimples(d.carimbos),
      qto: mapaSimples(d.qto),
      familias: mapaSimples(d.familias),
      sistemas: mapaSimples(d.sistemas),
      pavimentos: planificar(d.pavimentos) || [],
      /* rede hidrossanitária: topologia e bitola também são leitura de WASM.
         Sem elas o modelo restaurado perderia a cota de rede e a relação de
         tubos — recursos que o produto já vende. */
      topologia: topologiaParaDisco(d.topologia),
      bitolas: mapaSimples(d.bitolas),
      fatorLen: num(d.fatorLen) || 1,
      nEl: num(d.nEl) || els.length,
      nTri: num(d.nTri)
    };
    return { ok: true, reg: reg };
  }

  /* ---------------------------------------------------------------
   * conferir — o guardado ainda vale?
   *
   * ⚠ NA DÚVIDA, NÃO VALE. Servir uma cena a partir de registro estranho é o
   * modo silencioso de errar: o usuário vê um modelo, não vê erro nenhum, e o
   * modelo é outro (ou está pela metade). Reconverter custa segundos; mostrar
   * o modelo errado custa a confiança no módulo inteiro.
   * ------------------------------------------------------------- */
  function conferir(reg, arquivoId) {
    if (!reg || typeof reg !== "object") return { ok: false, motivo: "não há nada guardado para este arquivo" };
    if (num(reg.v) !== V) return { ok: false, motivo: "o formato do cache mudou (v" + num(reg.v) + " → v" + V + ") — vou converter de novo" };
    var a = txt(arquivoId);
    if (a && txt(reg.arquivoId) !== a) return { ok: false, motivo: "o arquivo mudou desde que foi convertido" };
    if (!reg.geometrias || !reg.geometrias.length) return { ok: false, motivo: "o cache está sem geometria" };
    if (!reg.instancias || !reg.instancias.length) return { ok: false, motivo: "o cache está sem as peças" };
    /* ⚠ a conferência que pega o registro meio-gravado: instância órfã monta
       peça invisível, e o usuário conta elemento faltando sem saber por quê */
    var temG = {};
    for (var i = 0; i < reg.geometrias.length; i++) temG[txt(reg.geometrias[i].g)] = 1;
    for (var j = 0; j < reg.instancias.length; j++) {
      if (!temG[txt(reg.instancias[j].g)]) return { ok: false, motivo: "o cache está incompleto (peça sem geometria)" };
    }
    return { ok: true, motivo: "" };
  }

  /* ---------------------------------------------------------------
   * paraCena — do disco para o que o viewer monta
   *
   * ⚠ E AQUI MORA UMA SUTILEZA QUE O structured clone DESFAZ. Na abertura
   * normal, `elemento.qto` é a MESMA referência de `modelo.qto[expressID]` —
   * mexer num muda o outro, e o painel de quantitativos conta com isso. Depois
   * de ir ao disco e voltar, seriam duas cópias: editar o quantitativo mudaria
   * um lado só, e o outro painel continuaria mostrando o número velho. Religar
   * a referência é o trabalho desta função.
   * ------------------------------------------------------------- */
  function paraCena(reg, mid) {
    var c = conferir(reg, "");
    if (!c.ok) return { ok: false, erro: c.motivo };
    var m = txt(mid);
    if (!m) return { ok: false, erro: "sem identificador de modelo para montar" };

    var porG = {};
    for (var i = 0; i < reg.geometrias.length; i++) porG[txt(reg.geometrias[i].g)] = reg.geometrias[i];

    var qto = reg.qto || {};
    var els = [];
    for (var k = 0; k < (reg.elementos || []).length; k++) {
      var e = reg.elementos[k], o = {};
      for (var p = 0; p < CAMPOS_ELEMENTO.length; p++) o[CAMPOS_ELEMENTO[p]] = e[CAMPOS_ELEMENTO[p]];
      o.mid = m;
      o.uid = m + ":" + o.id;
      o.arquivo = reg.nome;
      o.qto = qto[o.id] || null;               /* a MESMA referência do mapa */
      els.push(o);
    }
    return {
      ok: true,
      modelo: {
        arquivoId: reg.arquivoId, nome: reg.nome, mid: m,
        geometrias: porG,
        instancias: reg.instancias,
        elementos: els,
        tipos: reg.tipos || {}, carimbos: reg.carimbos || {}, qto: qto,
        familias: reg.familias || {}, sistemas: reg.sistemas || {},
        pavimentos: reg.pavimentos || [], topologia: topologiaParaCena(reg.topologia, m),
        bitolas: reg.bitolas || {}, fatorLen: num(reg.fatorLen) || 1,
        origem: reg.origem, nEl: num(reg.nEl), nTri: num(reg.nTri),
        bytesArquivo: num(reg.bytesArquivo), criadoEm: reg.criadoEm
      }
    };
  }

  /* ---------------------------------------------------------------
   * tamanho — quanto este registro ocupa, em bytes
   *
   * Aproximação declarada: os blocos de geometria são exatos (byteLength) e o
   * resto é estimado. Serve para a política de espaço, não para prometer
   * número ao usuário.
   * ------------------------------------------------------------- */
  function tamanho(reg) {
    if (!reg) return 0;
    var t = 0, i;
    for (i = 0; i < (reg.geometrias || []).length; i++) {
      var g = reg.geometrias[i];
      t += (g.pos ? g.pos.byteLength : 0) + (g.nor ? g.nor.byteLength : 0) + (g.idx ? g.idx.byteLength : 0);
    }
    for (i = 0; i < (reg.instancias || []).length; i++) t += 16 * 8 + 4 * 4 + 24;   /* matriz em double */
    /* o resto (elementos, mapas) estimado por contagem — medir com
       JSON.stringify custaria mais do que a decisão vale */
    t += (reg.elementos || []).length * 220;
    t += Object.keys(reg.qto || {}).length * 120;
    t += Object.keys(reg.carimbos || {}).length * 80;
    t += Object.keys(reg.familias || {}).length * 80;
    t += Object.keys(reg.sistemas || {}).length * 60;
    return t;
  }

  /* ---------------------------------------------------------------
   * ÍNDICE — o que está guardado, sem carregar o que está guardado
   *
   * Varrer os registros para saber o que existe carregaria centenas de MB de
   * geometria na memória só para contar. O índice é um registro pequeno à
   * parte: arquivoId, nome, tamanho, quando foi usado, e em que obras.
   *
   * ⚠ E ELE MENTE, MAIS CEDO OU MAIS TARDE. Gravação que falhou no meio,
   * navegador que despejou dado sozinho para liberar espaço, usuário que
   * limpou o site: o índice continua prometendo o que não existe. Por isso
   * `reparar` existe e roda contra a lista real de chaves.
   * ------------------------------------------------------------- */
  function indiceVazio() { return { v: V, entradas: {} }; }

  function indiceNormal(ix) {
    if (!ix || typeof ix !== "object" || !ix.entradas) return indiceVazio();
    if (num(ix.v) !== V) return indiceVazio();      /* formato velho: recomeça */
    var out = indiceVazio();
    for (var a in ix.entradas) {
      if (!Object.prototype.hasOwnProperty.call(ix.entradas, a)) continue;
      var e = ix.entradas[a] || {};
      out.entradas[a] = {
        arquivoId: a, nome: txt(e.nome), bytes: num(e.bytes),
        usadoEm: num(e.usadoEm), obras: (Array.isArray(e.obras) ? e.obras.map(txt).filter(Boolean) : [])
      };
    }
    return out;
  }

  function registrar(ix, dados) {
    var out = indiceNormal(ix);
    var a = txt(dados && dados.arquivoId);
    if (!a) return out;
    var ant = out.entradas[a] || { obras: [] };
    var obras = ant.obras.slice();
    var ob = txt(dados.obraId);
    if (ob && obras.indexOf(ob) < 0) obras.push(ob);
    out.entradas[a] = {
      arquivoId: a,
      nome: txt(dados.nome) || ant.nome || "",
      bytes: num(dados.bytes) || num(ant.bytes),
      usadoEm: num(dados.em) || num(ant.usadoEm),
      obras: obras
    };
    return out;
  }

  function marcarUso(ix, arquivoId, em, obraId) {
    var out = indiceNormal(ix);
    var a = txt(arquivoId);
    if (!a || !out.entradas[a]) return out;
    out.entradas[a].usadoEm = num(em) || out.entradas[a].usadoEm;
    var ob = txt(obraId);
    if (ob && out.entradas[a].obras.indexOf(ob) < 0) out.entradas[a].obras.push(ob);
    return out;
  }

  function remover(ix, arquivoIds) {
    var out = indiceNormal(ix);
    var lista = Array.isArray(arquivoIds) ? arquivoIds : [arquivoIds];
    for (var i = 0; i < lista.length; i++) delete out.entradas[txt(lista[i])];
    return out;
  }

  /* reconcilia o índice com as chaves que EXISTEM de verdade no banco */
  function reparar(ix, chavesReais, empresaId) {
    var out = indiceNormal(ix);
    var real = {};
    var lista = chavesReais || [];
    for (var i = 0; i < lista.length; i++) {
      /* ⚠ só as chaves DESTA empresa: adotar a de outro tenant poria o nome do
         arquivo de projeto dele na fila de descarte — e no aviso da tela */
      var a = arquivoIdDaChave(lista[i], empresaId);
      if (a) real[a] = 1;
    }
    var sumiram = [], orfaos = [];
    for (var k in out.entradas) {
      if (!Object.prototype.hasOwnProperty.call(out.entradas, k)) continue;
      if (!real[k]) { sumiram.push(k); delete out.entradas[k]; }
    }
    /* dado gravado que o índice não conhece: não some com ele em silêncio —
       ocuparia espaço para sempre e a política de descarte não o veria */
    for (var r in real) {
      if (!Object.prototype.hasOwnProperty.call(real, r)) continue;
      /* ⚠ nome vazio virava o texto do aviso de descarte ("liberei o modelo
         guardado de ") — a entrada orfa e justamente a que o indice nunca
         conheceu, e o produto genuinamente nao sabe o nome dela. Dizer isso e
         melhor do que mostrar um espaco em branco ou um hash. */
      if (!out.entradas[r]) { orfaos.push(r); out.entradas[r] = { arquivoId: r, nome: "um modelo guardado que o índice já não reconhecia", bytes: 0, usadoEm: 0, obras: [] }; }
    }
    return { indice: out, sumiram: sumiram, orfaos: orfaos };
  }

  /* ---------------------------------------------------------------
   * lru — quem sai quando falta espaço
   *
   * ⚠ NUNCA DESCARTA EM SILÊNCIO, e nunca descarta o que a obra aberta está
   * usando. Some o cache do modelo que está na tela e a próxima abertura
   * reconverte — o usuário veria o produto "ficando lento sozinho", sem causa
   * visível. Por isso `protegidos` entra e sai fora da conta.
   *
   * Devolve o que descartar, quanto isso libera, e se é SUFICIENTE. Quando não
   * é, quem chamou tem de avisar e desistir de guardar — não descartar tudo
   * para caber uma coisa que continua não cabendo.
   * ------------------------------------------------------------- */
  function lru(ix, opts) {
    opts = opts || {};
    var precisa = num(opts.precisa);
    var protegidas = {};
    var ps = opts.protegidos || [];
    for (var i = 0; i < ps.length; i++) protegidas[txt(ps[i])] = 1;
    var obraViva = txt(opts.obraId);

    var out = indiceNormal(ix);
    var cand = [];
    for (var a in out.entradas) {
      if (!Object.prototype.hasOwnProperty.call(out.entradas, a)) continue;
      if (protegidas[a]) continue;
      var e = out.entradas[a];
      /* política do B1: LRU POR OBRA — o que a obra aberta usa fica por último
         na fila, mesmo que esteja parado há mais tempo */
      var daObraViva = obraViva && e.obras.indexOf(obraViva) >= 0;
      if (daObraViva) continue;
      cand.push(e);
    }
    cand.sort(function (x, y) { return (x.usadoEm || 0) - (y.usadoEm || 0); });

    var descartar = [], liberado = 0;
    for (var j = 0; j < cand.length && liberado < precisa; j++) {
      descartar.push(cand[j].arquivoId);
      liberado += num(cand[j].bytes);
    }
    return {
      descartar: descartar,
      liberado: liberado,
      suficiente: liberado >= precisa,
      /* para a mensagem: descartar é decisão do usuário, não do produto */
      nomes: descartar.map(function (a) { return (out.entradas[a] && out.entradas[a].nome) || a; })
    };
  }

  function total(ix) {
    var out = indiceNormal(ix), t = 0;
    for (var a in out.entradas) { if (Object.prototype.hasOwnProperty.call(out.entradas, a)) t += num(out.entradas[a].bytes); }
    return t;
  }

  var BimCache = {
    V: V,
    PREFIXO: PREFIXO,
    MARCA_INDICE: MARCA_INDICE,
    prefixoDe: prefixoDe,
    chaveIndice: chaveIndice,
    ehChaveLegado: ehChaveLegado,
    CAMPOS_ELEMENTO: CAMPOS_ELEMENTO,
    chave: chave,
    ehChaveDeModelo: ehChaveDeModelo,
    arquivoIdDaChave: arquivoIdDaChave,
    montar: montar,
    conferir: conferir,
    paraCena: paraCena,
    tamanho: tamanho,
    indiceVazio: indiceVazio,
    indiceNormal: indiceNormal,
    registrar: registrar,
    marcarUso: marcarUso,
    remover: remover,
    reparar: reparar,
    lru: lru,
    total: total
  };

  global.BimCache = BimCache;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCache;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
