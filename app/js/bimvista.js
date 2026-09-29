/* =====================================================================
 * bimvista.js — PONTOS DE VISTA, MARCAÇÃO E COMENTÁRIO (o B4; D10)
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * Numa reunião de compatibilização, alguém acha o problema, todo mundo olha, e
 * a reunião acaba. Sem ponto de vista salvo, nada do que se achou sobrevive: na
 * semana seguinte é preciso reencontrar a mesma peça, no mesmo ângulo, para
 * explicar de novo. É a moeda da coordenação, e o produto não tinha.
 *
 * Um ponto de vista guarda ONDE a câmera estava, O QUE estava visível, o que
 * foi RABISCADO por cima e o que foi DITO — e é isso que vira o tópico BCF que
 * volta para quem projeta.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ A MARCAÇÃO É 2D SOBRE A VISTA, e isso é escolha, não limitação
 *
 * Coordenadas normalizadas 0..1 do canvas, como no Navisworks. Um risco 3D
 * ficaria correto no espaço e ilegível na imagem: gira a câmera um grau e a
 * seta que apontava para a viga aponta para o céu. A imagem que vai para o
 * relatório é 2D, e o rabisco tem de continuar em cima do que ele aponta.
 * (A anotação 3D pontual do editor serve a outro propósito e continua lá.)
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠ O QUE ESTÁ VISÍVEL É GUARDADO POR CHAVE (B0), NÃO POR `uid`
 *
 * Um ponto de vista tem de valer daqui a três meses, depois de o projetista
 * mandar duas versões do modelo. `uid` é a ordem de abertura da sessão: a vista
 * abriria escondendo peças aleatórias. A chave do B0 sobrevive, e a peça que
 * não existir mais volta como "não localizada" em vez de sumir calada.
 *
 * ⚠ POR QUE PURO
 * `js/bim.js` só APLICA a vista; quem decide o que ela É mora aqui, com teste.
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(s) { return String(s == null ? "" : s); }
  function num(x) { var n = +x; return isFinite(n) ? n : 0; }
  function v3(a, padrao) {
    if (Array.isArray(a) && a.length === 3) return [num(a[0]), num(a[1]), num(a[2])];
    return padrao ? padrao.slice() : [0, 0, 0];
  }
  function clamp01(x) { var n = +x; if (!isFinite(n)) return 0; return n < 0 ? 0 : (n > 1 ? 1 : n); }

  /* =====================================================================
   * ⚠ A CONVERSÃO DE EIXO — a linha de que depende o critério do bloco
   *
   * A cena do viewer é Y-up; o IFC (e portanto o BCF) é Z-up. Se a câmera for
   * exportada sem converter, o projetista abre o arquivo no Revit e a câmera
   * está em outro lugar — sem erro nenhum na tela, que é justamente o que o
   * "pronto quando" do B4 proíbe.
   *
   * MEDIDO, não suposto: no `bim/samples/exemplo.ifc` o IFC declara os
   * pavimentos em Z = 0 e Z = 3.139,99 mm; na cena, os membros do segundo
   * pavimento começam em Y = 3,0428 m (a diferença é a espessura da laje). E
   * `GetCoordinationMatrix` do web-ifc devolve a IDENTIDADE — ou seja, a troca
   * de eixo está na geração da geometria, não numa matriz que dê para ler.
   * Logo: cena.Y corresponde a IFC.Z.
   *
   * A convenção completa é a do web-ifc/IFC.js: cena = (X, Z, −Y).
   *
   * ⚠ E O SINAL DO TERCEIRO EIXO NÃO PÔDE SER MEDIDO AQUI — exigiria abrir o
   * arquivo exportado noutra ferramenta, que é exatamente a validação que a
   * especificação manda registrar como PENDENTE. Está isolado nestas duas
   * funções, com teste de ida e volta, para que corrigir seja trocar uma linha
   * e não caçar sinal espalhado pelo arquivo.
   * ===================================================================== */
  function cenaParaIfc(p) {
    var a = v3(p);
    return [a[0], -a[2], a[1]];
  }
  function ifcParaCena(p) {
    var a = v3(p);
    return [a[0], a[2], -a[1]];
  }

  function normalizado(a) {
    var v = v3(a), d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (d < 1e-12) return [0, 0, -1];
    return [v[0] / d, v[1] / d, v[2] / d];
  }

  var TIPOS_MARCA = ["linha", "seta", "nuvem", "texto", "retangulo"];
  var STATUS = ["aberto", "resolvido", "fechado"];

  /* ---------------------------------------------------------------
   * camera — o que a vista guarda, e o que o BCF consegue levar
   *
   * ⚠ O BCF NÃO TEM ONDE GUARDAR O ALVO DA ÓRBITA. Ele leva posição, direção,
   * cima e ângulo — e nada mais. O nosso registro guarda o `alvo` porque o
   * viewer orbita em torno dele; ao importar de fora, o alvo é reconstruído a
   * uma distância declarada na direção da câmera. Posição e direção saem
   * exatas (é o que "mesma câmera" quer dizer); só o pivô da órbita é
   * aproximado, e isso está dito aqui em vez de ficar parecendo perda.
   * ------------------------------------------------------------- */
  var DIST_ALVO_PADRAO = 10;

  function camera(d) {
    d = d || {};
    var pos = v3(d.pos);
    var alvo = Array.isArray(d.alvo) && d.alvo.length === 3 ? v3(d.alvo) : null;
    var dir = Array.isArray(d.dir) && d.dir.length === 3 ? normalizado(d.dir) : null;
    if (!alvo && dir) {
      var dist = num(d.dist) || DIST_ALVO_PADRAO;
      alvo = [pos[0] + dir[0] * dist, pos[1] + dir[1] * dist, pos[2] + dir[2] * dist];
    }
    if (!alvo) alvo = [pos[0], pos[1], pos[2] - DIST_ALVO_PADRAO];
    return {
      pos: pos,
      alvo: alvo,
      up: Array.isArray(d.up) && d.up.length === 3 ? normalizado(d.up) : [0, 1, 0],
      fov: num(d.fov) || 60,
      orto: !!d.orto
    };
  }
  function direcaoDe(cam) {
    return normalizado([cam.alvo[0] - cam.pos[0], cam.alvo[1] - cam.pos[1], cam.alvo[2] - cam.pos[2]]);
  }
  function distanciaDe(cam) {
    var d = [cam.alvo[0] - cam.pos[0], cam.alvo[1] - cam.pos[1], cam.alvo[2] - cam.pos[2]];
    return Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  }

  /* ---------------------------------------------------------------
   * marcacao — 2D, em 0..1 do canvas
   * ------------------------------------------------------------- */
  function marcacao(d) {
    d = d || {};
    var tipo = TIPOS_MARCA.indexOf(txt(d.tipo)) >= 0 ? txt(d.tipo) : "";
    if (!tipo) return null;
    var pts = [];
    var lista = Array.isArray(d.pts) ? d.pts : [];
    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      if (!Array.isArray(p) || p.length < 2) continue;
      /* ⚠ preso a 0..1 de propósito: ponto fora do quadro viraria risco
         invisível no relatório, e ninguém saberia que ele existe */
      pts.push([clamp01(p[0]), clamp01(p[1])]);
    }
    if (tipo === "texto") { if (!pts.length || !txt(d.texto).trim()) return null; }
    else if (pts.length < 2) return null;
    return {
      tipo: tipo, pts: pts,
      cor: /^#[0-9a-fA-F]{6}$/.test(txt(d.cor)) ? txt(d.cor).toLowerCase() : "#e11d48",
      texto: txt(d.texto)
    };
  }

  function comentario(d) {
    d = d || {};
    var t = txt(d.texto).trim();
    if (!t) return null;
    return {
      autor: txt(d.autor),
      em: txt(d.em),
      texto: t,
      status: STATUS.indexOf(txt(d.status)) >= 0 ? txt(d.status) : "aberto"
    };
  }

  /* =====================================================================
   * ⚠ A VISTA COMPLETA — o defeito que isto fecha
   *
   * Roteiro do defeito (relatado em obra, 29/09/2026): o engenheiro montou
   * cinco pontos de vista de detalhamento — ocultou peças, cortou o modelo,
   * mediu a ancoragem — e ao voltar a eles não tinha nada disso. Pior: o
   * corte feito para a "Corte transversal" aparecia aberto na "Armação da
   * sapata".
   *
   * Eram dois buracos juntos:
   *   1. SALVAR guardava só a câmera. A lista de ocultos era lida de um campo
   *      (`el.oculto`) que nenhum código escreve — a vista saía sempre com
   *      zero ocultos, e o teste passava porque o registro era válido.
   *   2. APLICAR somava por cima da cena atual. O que a vista não mandava
   *      desfazer (corte, raio-X, cor, cota) ficava do jeito que estava, e
   *      por isso uma vista "herdava" o estado da anterior.
   *
   * A regra agora: a vista é uma FOTOGRAFIA INTEIRA da cena. Aplicar uma
   * vista primeiro volta a cena ao neutro e depois põe exatamente o que ela
   * guardou — nada do que estava na tela antes sobrevive, e nada que se faça
   * depois muda a vista gravada (só "Regravar", pedido na cara, muda).
   *
   * `completa: true` separa as duas gerações. A vista antiga continua abrindo
   * (a câmera dela está certa), e a tela diz que ela guardou só a câmera —
   * em vez de fingir que o que aparece é o que foi salvo.
   * ===================================================================== */
  var MODOS_COTA = ["clicado", "iguais", "todas"];
  /* quantos pontos cada medida precisa para existir */
  var PONTOS_MEDIDA = { dist: 2, area: 3, ang: 3 };

  function chaves(a) {
    var out = [], visto = {};
    (Array.isArray(a) ? a : []).forEach(function (c) {
      var k = txt(c).trim();
      if (k && !visto[k]) { visto[k] = 1; out.push(k); }
    });
    return out;
  }
  function ponto3(p) {
    if (!Array.isArray(p) || p.length !== 3) return null;
    for (var i = 0; i < 3; i++) if (p[i] === null || p[i] === "" || !isFinite(+p[i])) return null;
    return [+p[0], +p[1], +p[2]];
  }
  /* ⚠ A MEDIDA É GUARDADA COMO PONTOS, NÃO COMO NÚMERO. O número é
     recalculado ao desenhar, e por isso nunca diverge do risco na tela. Um
     número guardado sozinho sobreviveria a um modelo corrigido e continuaria
     afirmando a medida velha em cima da peça nova. */
  function medida(d) {
    d = d || {};
    var tipo = txt(d.tipo);
    if (!PONTOS_MEDIDA[tipo]) return null;
    var pts = [];
    (Array.isArray(d.pts) ? d.pts : []).forEach(function (p) { var q = ponto3(p); if (q) pts.push(q); });
    if (tipo === "area" ? pts.length < 3 : pts.length !== PONTOS_MEDIDA[tipo]) return null;
    return { tipo: tipo, pts: pts, horizontal: !!d.horizontal };
  }

  /* ---------------------------------------------------------------
   * escolherVisibilidade — guardar a lista MENOR
   *
   * Um modelo de 4.000 peças com a fundação isolada tem 1.500 visíveis e
   * 2.500 ocultas. Guardar sempre os ocultos faria cada vista pesar o dobro
   * do necessário no armazenamento do aparelho (e na nuvem). Guarda-se o
   * lado menor: `isolados` (mostrar só estes) ou `ocultos` (esconder estes).
   *
   * ⚠ ZERO VISÍVEIS NÃO VIRA "ISOLAR NADA". Lista de isolados vazia quer
   * dizer "sem isolamento" para o resto do sistema (inclusive o BCF), então
   * a cena toda escondida é gravada como ocultos.
   * ------------------------------------------------------------- */
  function escolherVisibilidade(visiveis, ocultos) {
    var vis = chaves(visiveis), oc = chaves(ocultos);
    if (!oc.length) return { isolados: [], ocultos: [] };
    if (vis.length && vis.length < oc.length) return { isolados: vis, ocultos: [] };
    return { isolados: [], ocultos: oc };
  }

  /* ---------------------------------------------------------------
   * vista — o registro de `bim_vistas`
   * ------------------------------------------------------------- */
  function vista(d) {
    d = d || {};
    var nome = txt(d.nome).trim();
    if (!nome) return null;
    var marcas = [];
    (Array.isArray(d.marcacoes) ? d.marcacoes : []).forEach(function (m) {
      var mm = marcacao(m); if (mm) marcas.push(mm);
    });
    var coms = [];
    (Array.isArray(d.comentarios) ? d.comentarios : []).forEach(function (c) {
      var cc = comentario(c); if (cc) coms.push(cc);
    });
    var cp = (d.cortes && d.cortes.planta) || {}, cl = (d.cortes && d.cortes.livre) || {};
    var vis = d.visibilidade || {};
    var meds = [];
    (Array.isArray(d.medidas) ? d.medidas : []).forEach(function (m) { var mm = medida(m); if (mm) meds.push(mm); });
    var cr = d.cotaRede || {};
    return {
      id: txt(d.id),
      obraId: txt(d.obraId),
      nome: nome,
      criadoEm: txt(d.criadoEm),
      atualizadoEm: txt(d.atualizadoEm),
      autor: txt(d.autor),
      completa: d.completa === true,
      /* "bcf" = veio de fora: traz câmera e visibilidade, e nunca teve o resto */
      origem: txt(d.origem),
      camera: camera(d.camera),
      cortes: {
        /* `frac` é a altura do corte na faixa do modelo (0 = base, 1 = topo),
           que é o que o slider guarda. `y` fica pelo registro antigo e pelo
           BCF; a fração é o que sobrevive a um modelo que ganhou um andar. */
        planta: { on: !!cp.on, y: num(cp.y), frac: (cp.frac == null || cp.frac === "" || !isFinite(+cp.frac)) ? null : clamp01(cp.frac) },
        livre: { on: !!cl.on,
                 plano: (Array.isArray(cl.plano) && cl.plano.length === 4) ? cl.plano.map(num) : [0, 0, 0, 0],
                 az: ((Math.round(num(cl.az)) % 360) + 360) % 360,
                 inc: Math.max(0, Math.min(90, Math.round(num(cl.inc)))),
                 inv: !!cl.inv,
                 pos: (cl.pos == null || cl.pos === "" || !isFinite(+cl.pos)) ? 0.5 : clamp01(cl.pos) }
      },
      visibilidade: {
        ocultos: chaves(vis.ocultos),
        isolados: chaves(vis.isolados),
        raioX: !!vis.raioX,
        /* quem fica SÓLIDO no raio-X; o resto visível fica translúcido */
        raioXAlvo: vis.raioX ? chaves(vis.raioXAlvo) : []
      },
      aparencias: (Array.isArray(d.aparencias) ? d.aparencias : []).map(function (a) {
        return { chave: txt(a && a.chave), cor: v3(a && a.cor, [1, 1, 1]), alpha: (a && a.alpha != null) ? num(a.alpha) : 1 };
      }).filter(function (a) { return !!a.chave; }),
      /* ⚠ `modeloId` entra ao lado de `arquivoId`: a revisão nova do mesmo
         arquivo tem outro `arquivoId` (versão) e o mesmo `modeloId`
         (identidade). Sem ele, a vista gravada na R06 deixaria de saber que
         a topografia estava desligada quando a R07 fosse aberta. */
      modelos: (Array.isArray(d.modelos) ? d.modelos : []).map(function (m) {
        return { arquivoId: txt(m && m.arquivoId), modeloId: txt(m && m.modeloId), visivel: !(m && m.visivel === false), alpha: (m && m.alpha != null) ? num(m.alpha) : 1 };
      }).filter(function (m) { return !!(m.arquivoId || m.modeloId); }),
      estilo: { desenho: !!(d.estilo && d.estilo.desenho) },
      medidas: meds,
      cotaRede: {
        on: !!cr.on,
        modo: MODOS_COTA.indexOf(txt(cr.modo)) >= 0 ? txt(cr.modo) : "clicado",
        fixados: cr.on ? chaves(cr.fixados) : [],
        chave: cr.on ? txt(cr.chave) : ""
      },
      marcacoes: marcas,
      comentarios: coms,
      /* a miniatura é blob: mora no IndexedDB, e aqui fica só o endereço */
      miniatura: txt(d.miniatura)
    };
  }

  /* ---------------------------------------------------------------
   * regravar — a vista existente recebe o estado da tela, e SÓ ela
   *
   * O pedido é "ajustei esta vista, guarde". Muda o que é cena (câmera,
   * cortes, visibilidade, cores, cotas, modelos) e preserva o que é
   * identidade e conversa: id, obra, nome, autor, data de criação,
   * comentários e marcações. Comentário é o que o projetista respondeu — ele
   * não pode sumir porque alguém reenquadrou a câmera.
   * ------------------------------------------------------------- */
  function regravar(antiga, estado, quando) {
    if (!antiga) return null;
    var e = estado || {};
    return vista({
      id: antiga.id, obraId: antiga.obraId, nome: antiga.nome, autor: antiga.autor,
      criadoEm: antiga.criadoEm, atualizadoEm: txt(quando),
      comentarios: antiga.comentarios, marcacoes: antiga.marcacoes, miniatura: antiga.miniatura,
      completa: true,
      camera: e.camera, cortes: e.cortes, visibilidade: e.visibilidade,
      aparencias: e.aparencias, modelos: e.modelos, estilo: e.estilo,
      medidas: e.medidas, cotaRede: e.cotaRede
    });
  }

  /* ---------------------------------------------------------------
   * resumo — o que a vista guardou, em palavras, para a lista
   *
   * ⚠ A VISTA ANTIGA DIZ QUE GUARDOU SÓ A CÂMERA. Sem isso, o engenheiro
   * abre a "Corte transversal" gravada antes da correção, vê o modelo
   * inteiro sem corte e conclui que o sistema perdeu de novo.
   * ------------------------------------------------------------- */
  function resumo(v) {
    if (!v) return [];
    var out = [];
    if (v.completa !== true && v.origem !== "bcf") return ["só a câmera (gravada antes da correção) — ajuste e clique em Regravar"];
    if (v.completa !== true) out.push("importada do BCF");
    var c = v.cortes || {};
    if (c.planta && c.planta.on) out.push("planta (corte a " + Math.round((c.planta.frac == null ? 0.62 : c.planta.frac) * 100) + "% da altura)");
    else if (c.livre && c.livre.on) out.push("corte livre");
    var vis = v.visibilidade || {};
    var nIso = (vis.isolados || []).length, nOc = (vis.ocultos || []).length;
    if (nIso) out.push(nIso + (nIso === 1 ? " peça isolada" : " peças isoladas"));
    else if (nOc) out.push(nOc + (nOc === 1 ? " peça oculta" : " peças ocultas"));
    if (vis.raioX) out.push("raio-X");
    var nM = (v.medidas || []).length;
    if (nM) out.push(nM + (nM === 1 ? " cota" : " cotas"));
    if (v.cotaRede && v.cotaRede.on) out.push("cotas da rede");
    if ((v.aparencias || []).length) out.push("cores");
    if (v.estilo && v.estilo.desenho) out.push("estilo desenho");
    var nDesl = (v.modelos || []).filter(function (m) { return m.visivel === false; }).length;
    if (nDesl) out.push(nDesl + (nDesl === 1 ? " modelo desligado" : " modelos desligados"));
    if (!out.length || (out.length === 1 && v.completa !== true)) out.push("modelo inteiro, sem corte");
    return out;
  }

  /* ---------------------------------------------------------------
   * resolver — o que da vista ainda existe no modelo aberto
   *
   * ⚠ PEÇA QUE SUMIU VOLTA COMO "NÃO LOCALIZADA", NÃO SOME. Uma vista de três
   * meses atrás, aplicada sobre a versão nova do modelo, vai ter peças que não
   * existem mais. Aplicar o que restou e calar faria a vista mostrar menos do
   * que mostrava — e ninguém saberia que aquilo era o ponto do problema.
   * ------------------------------------------------------------- */
  function resolver(v, elementos) {
    var tem = {};
    (elementos || []).forEach(function (e) { if (e && e.chave) tem[e.chave] = 1; });
    function parte(lista) {
      var vivas = [], perdidas = [];
      (lista || []).forEach(function (k) { (tem[k] ? vivas : perdidas).push(k); });
      return { vivas: vivas, perdidas: perdidas };
    }
    var oc = parte(v && v.visibilidade && v.visibilidade.ocultos);
    var iso = parte(v && v.visibilidade && v.visibilidade.isolados);
    var ap = parte((v && v.aparencias || []).map(function (a) { return a.chave; }));
    var rx = parte(v && v.visibilidade && v.visibilidade.raioX ? v.visibilidade.raioXAlvo : []);
    var cf = parte(v && v.cotaRede && v.cotaRede.on ? v.cotaRede.fixados : []);
    return {
      ocultos: oc.vivas, isolados: iso.vivas,
      raioXAlvo: rx.vivas, cotaFixados: cf.vivas,
      aparencias: (v && v.aparencias || []).filter(function (a) { return tem[a.chave]; }),
      naoLocalizadas: oc.perdidas.concat(iso.perdidas, ap.perdidas, rx.perdidas, cf.perdidas).filter(function (k, i, arr) { return arr.indexOf(k) === i; })
    };
  }

  var BimVista = {
    TIPOS_MARCA: TIPOS_MARCA,
    STATUS: STATUS,
    DIST_ALVO_PADRAO: DIST_ALVO_PADRAO,
    cenaParaIfc: cenaParaIfc,
    ifcParaCena: ifcParaCena,
    normalizado: normalizado,
    camera: camera,
    direcaoDe: direcaoDe,
    distanciaDe: distanciaDe,
    marcacao: marcacao,
    comentario: comentario,
    medida: medida,
    escolherVisibilidade: escolherVisibilidade,
    vista: vista,
    regravar: regravar,
    resumo: resumo,
    resolver: resolver
  };

  global.BimVista = BimVista;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVista;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
