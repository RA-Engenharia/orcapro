/* =====================================================================
 * bimprojetos.js — PROJETOS BIM (motor puro, Node-testável)
 *
 * Pedido do Rogério (12/10/2026): "quando for criar projeto ele vai criar
 * com os parâmetros, onde a gente vai criar a obra disso ou pegar de uma
 * obra já existente, e ele vai ter o nome do arquivo (Projeto tal, referente
 * à obra tal). Quando o usuário quiser sair, ele vai salvar esse projeto.
 * Ele vai ficar salvo nos projetos recentes [...] dentro do sistema para
 * abrir mais rápido e salvo no computador. E sempre que eu abrir o BIM eu
 * não quero que ele já abra com a obra, com alguma volumetria lá dentro."
 *
 * O que mora AQUI (sem DOM, sem IndexedDB, sem rede — a tela e a gravação
 * estão em js/bimprojetosui.js; o arquivo é o .opbim de js/opformato.js):
 *   • o nome padrão do arquivo ("Projeto <nome> — <obra>") e o nome SEGURO
 *     para o disco — o MESMO que o servidor local aplica (server/static.js,
 *     `nomeArquivoProjeto`); tools/test-projetos-srv.js confere os dois;
 *   • o índice dos projetos deste aparelho (o catálogo do "Abrir projeto do
 *     sistema") e a lista dos RECENTES que sai dele;
 *   • a assinatura do conteúdo — é ela que diz se há alteração não salva;
 *   • o nome da cópia automática "Modelagem anterior — <obra> — <data hora>"
 *     que guarda a modelagem de uma obra antes de ela ser substituída (ver o
 *     ⚠ em `nomeAnterior`);
 *   • as paredes do contorno do "Novo projeto" como OPERAÇÕES do editor
 *     (ver o ⚠ em `paredesRetangulo`).
 * ===================================================================== */
(function (global) {
  "use strict";

  var PREFIXO = "bimproj:";
  var TETO_RECENTES = 12;
  var MARCA_INDICE = "_indice";

  function txt(v) { return v == null ? "" : String(v); }
  function limpa(s) { return txt(s).replace(/\s+/g, " ").trim(); }

  /* ---------------------------------------------------------------
   * NOME DO ARQUIVO NO DISCO
   * ⚠ O nome vem da tela (nome do projeto, nome da obra) e vira caminho
   * de arquivo no computador do cliente. Fica de fora tudo o que o Windows
   * recusa (\ / : * ? " < > | e controle), ponto ou espaço no fim (o
   * Explorer some com eles e o arquivo fica inalcançável) e os nomes
   * reservados do DOS (CON, NUL, COM1…) — "nul.opbim" grava no vazio.
   * O servidor aplica a MESMA regra por conta própria: nada que vem da
   * tela entra em caminho sem passar por ela lá também.
   * --------------------------------------------------------------- */
  function nomeArquivo(s) {
    var t = txt(s).replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/[<>:"\/\\|?*]+/g, "-")
      .replace(/\s+/g, " ").trim()
      .replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(t)) t = "_" + t;
    t = t.slice(0, 100).replace(/[.\s]+$/, "");
    return t;
  }

  /* "Projeto <nome> — <obra>": o nome que já começa com "Projeto" não
     ganha outro na frente ("Projeto novo" → "Projeto novo — Obra X") */
  function nomePadrao(nome, obraNome) {
    var n = limpa(nome), o = limpa(obraNome);
    var base = !n ? "Projeto" : (/^projeto(\s|$)/i.test(n) ? n : "Projeto " + n);
    return o ? base + " — " + o : base;
  }

  /* ---------------------------------------------------------------
   * ASSINATURA DO CONTEÚDO (FNV-1a de 32 bits sobre o JSON + tamanho)
   * Não é segurança, é comparação: "o que está na tela é o que foi
   * gravado?". O tamanho na frente tira a colisão boba de dois textos
   * diferentes com o mesmo hash curto.
   * --------------------------------------------------------------- */
  /* ⚠ CHAVES EM ORDEM: o estado das vistas 2D ganha os campos padrão quando é
     lido (js/bim2dui.js `estado`), e a MESMA coisa com as chaves noutra ordem
     não pode virar "alteração não salva" — a pergunta ao sair apareceria sem
     ninguém ter mexido em nada, e pergunta falsa ensina a clicar sem ler. */
  function ordenado(v) {
    if (Array.isArray(v)) return v.map(ordenado);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { if (v[k] !== undefined) o[k] = ordenado(v[k]); });
      return o;
    }
    return v;
  }
  /* ⚠ ESTADO VAZIO CRIADO SOB DEMANDA NÃO É ALTERAÇÃO. Os módulos das vistas
     guardam o que é deles DENTRO do estado 2D da obra e o criam na primeira
     vez que alguém olha (medido na e2e de 12/10/2026: entre salvar e reabrir,
     apareceu sozinho `p6: { v: 1, vistas: {}, modelos: {}, seq: {} }`). Sem
     podar, isso virava "alteração não salva" e "modelagem fora de projeto".
     Vazio = nulo, lista vazia, ou objeto que só tem versão (`v`) e vazios. */
  function vazio(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v).every(function (k) { return (k === "v" && typeof v[k] === "number") || vazio(v[k]); });
    return false;
  }
  function podarVazios(v) {
    if (Array.isArray(v)) return v.map(podarVazios);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { if (!vazio(v[k])) o[k] = podarVazios(v[k]); });
      return o;
    }
    return v;
  }
  function assinatura(obj) {
    var s;
    try { s = JSON.stringify(ordenado(obj === undefined ? null : obj)); } catch (e) { s = txt(obj); }
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return s.length + ":" + ("0000000" + h.toString(16)).slice(-8);
  }

  /* ---------------------------------------------------------------
   * ÍNDICE DOS PROJETOS DESTE APARELHO
   *   { v:1, projetos:[entrada…], obras:{ <obraId>: <assinatura> } }
   * entrada = { id, nome, obraId, obraNome, criadoEm, salvoEm, abertoEm,
   *             bytes, sistema, computador, caminho, computadorEm,
   *             baixado, oculto }
   * • `sistema`: há cópia do .opbim no banco do aparelho (IndexedDB);
   * • `computador`: o arquivo na pasta de projetos (caminho RELATIVO à
   *   pasta, o que o servidor local aceita de volta) e `caminho`, o
   *   absoluto, só para mostrar;
   * • `oculto`: "tirar da lista" — o projeto continua no sistema (aparece
   *   no "Abrir projeto do sistema"), só sai dos recentes;
   * • `obras`: a assinatura da área de trabalho de cada obra no momento em
   *   que ela ficou IGUAL a um projeto gravado (abrir, salvar, descartar).
   *   É o que permite dizer, antes de substituir a modelagem de uma obra,
   *   se ela está guardada em algum projeto ou se é trabalho solto.
   * ⚠ O ÍNDICE NÃO TEM TETO: ele é o catálogo do que está no sistema. Teto
   *   aqui deixaria .opbim no banco sem ninguém que o alcance. O teto é só
   *   da LISTA de recentes que a tela mostra.
   * --------------------------------------------------------------- */
  function bool(v) { return v === true; }
  function entradaNormal(e) {
    if (!e || typeof e !== "object") return null;
    var id = limpa(e.id);
    if (!id) return null;
    var n = {
      id: id, nome: limpa(e.nome) || "Projeto", obraId: txt(e.obraId), obraNome: limpa(e.obraNome),
      criadoEm: txt(e.criadoEm), salvoEm: txt(e.salvoEm), abertoEm: txt(e.abertoEm),
      bytes: (typeof e.bytes === "number" && isFinite(e.bytes) && e.bytes >= 0) ? e.bytes : 0,
      sistema: bool(e.sistema), computador: txt(e.computador), caminho: txt(e.caminho), computadorEm: txt(e.computadorEm),
      baixado: bool(e.baixado), oculto: bool(e.oculto)
    };
    return n;
  }
  function recencia(e) { var a = txt(e.abertoEm), s = txt(e.salvoEm); return a > s ? a : s; }
  function indiceNormal(bruto) {
    var b = (bruto && typeof bruto === "object") ? bruto : {};
    var vistos = {}, lista = [];
    (Array.isArray(b.projetos) ? b.projetos : []).forEach(function (x) {
      var e = entradaNormal(x);
      if (!e) return;
      /* id repetido (duas abas gravando): fica o mais recente */
      if (vistos[e.id] != null) { if (recencia(e) > recencia(lista[vistos[e.id]])) lista[vistos[e.id]] = e; return; }
      vistos[e.id] = lista.length; lista.push(e);
    });
    lista.sort(function (a, c) { var ra = recencia(a), rc = recencia(c); return ra < rc ? 1 : (ra > rc ? -1 : 0); });
    var obras = {};
    if (b.obras && typeof b.obras === "object") Object.keys(b.obras).forEach(function (k) { if (k && typeof b.obras[k] === "string") obras[k] = b.obras[k]; });
    return { v: 1, projetos: lista, obras: obras };
  }
  /* põe (ou atualiza) a entrada e a traz para o topo; abrir ou gravar de
     novo um projeto que tinha saído da lista o devolve aos recentes */
  function registrar(ix, entrada) {
    var i0 = indiceNormal(ix), e = entradaNormal(entrada);
    if (!e) return i0;
    var achou = false;
    i0.projetos = i0.projetos.map(function (x) {
      if (x.id !== e.id) return x;
      achou = true;
      var m = {}; Object.keys(x).forEach(function (k) { m[k] = x[k]; });
      Object.keys(entrada).forEach(function (k) { if (entrada[k] !== undefined && k in x) m[k] = e[k]; });
      m.oculto = entrada.oculto === true;
      return entradaNormal(m);
    });
    if (!achou) i0.projetos.push(e);
    return indiceNormal(i0);
  }
  function ocultar(ix, id) {
    var i0 = indiceNormal(ix);
    i0.projetos.forEach(function (x) { if (x.id === txt(id)) x.oculto = true; });
    return i0;
  }
  function esquecer(ix, id) {
    var i0 = indiceNormal(ix);
    i0.projetos = i0.projetos.filter(function (x) { return x.id !== txt(id); });
    return i0;
  }
  function obter(ix, id) {
    var l = indiceNormal(ix).projetos;
    for (var i = 0; i < l.length; i++) if (l[i].id === txt(id)) return l[i];
    return null;
  }
  function recentes(ix, n) {
    return indiceNormal(ix).projetos.filter(function (x) { return !x.oculto; }).slice(0, n > 0 ? n : TETO_RECENTES);
  }
  function doSistema(ix) {
    return indiceNormal(ix).projetos.filter(function (x) { return x.sistema; })
      .sort(function (a, c) { var na = a.nome.toLowerCase(), nc = c.nome.toLowerCase(); return na < nc ? -1 : (na > nc ? 1 : 0); });
  }
  /* outro projeto, nesta obra, que gravaria no MESMO arquivo do disco */
  function conflitoDeNome(ix, nome, obraId, idProprio) {
    var alvo = nomeArquivo(nome).toLowerCase();
    if (!alvo) return null;
    var l = indiceNormal(ix).projetos;
    for (var i = 0; i < l.length; i++) {
      var x = l[i];
      if (x.id !== txt(idProprio) && x.obraId === txt(obraId) && nomeArquivo(x.nome).toLowerCase() === alvo) return x;
    }
    return null;
  }
  function marcarObra(ix, obraId, ass) {
    var i0 = indiceNormal(ix);
    if (txt(obraId)) i0.obras[txt(obraId)] = txt(ass);
    return i0;
  }

  /* ---------------------------------------------------------------
   * O DIÁLOGO DO NOVO PROJETO
   * --------------------------------------------------------------- */
  function validarNovo(cfg, obrasIds) {
    var c = cfg || {}, erros = [];
    if (!txt(c.obra)) erros.push("Escolha a obra do projeto — ou crie uma nova pela opção “+ Criar obra nova…”.");
    else if (Array.isArray(obrasIds) && obrasIds.indexOf(txt(c.obra)) < 0) erros.push("A obra escolhida não existe mais nesta conta. Escolha outra.");
    var arq = limpa(c.arquivo);
    if (!arq) erros.push("Dê um nome ao arquivo do projeto.");
    else if (!nomeArquivo(arq)) erros.push("O nome do arquivo ficou vazio depois de tirar o que o Windows não aceita (\\ / : * ? \" < > |).");
    return { ok: !erros.length, erros: erros };
  }

  /* ---------------------------------------------------------------
   * A CÓPIA AUTOMÁTICA ANTES DE SUBSTITUIR
   * ⚠ NADA SE PERDE SEM VOLTA (regra da RA; revisão de 12/10/2026). Antes
   *   de SUBSTITUIR a modelagem de uma obra que não está em projeto nenhum
   *   (Novo projeto nela, ou abrir um projeto nela), o que está gravado na
   *   obra vira o projeto "Modelagem anterior — <obra> — <dd/mm/aaaa hh:mm>"
   *   (js/bimprojetosui.js `guardarAnterior`): recentes, sistema e
   *   computador. A hora é a do aparelho — a que a pessoa vê no relógio.
   *   O nome da obra encurta (50 letras) para a data caber no nome do
   *   arquivo, que tem teto de 100 (`nomeArquivo`): cortada, a data sumiria e
   *   duas cópias da mesma obra disputariam o mesmo arquivo.
   * --------------------------------------------------------------- */
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function nomeAnterior(obraNome, quando) {
    /* (data de outra janela/contexto não é `instanceof Date` daqui: confere pelo jeito) */
    var d = (quando && typeof quando.getTime === "function" && !isNaN(quando.getTime())) ? quando : new Date();
    var o = limpa(obraNome) || "sem obra";
    if (o.length > 50) o = o.slice(0, 49).replace(/\s+$/, "") + "…";
    return "Modelagem anterior — " + o + " — " + dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear() +
      " " + dois(d.getHours()) + ":" + dois(d.getMinutes());
  }
  /* o mesmo nome na mesma obra (duas cópias no mesmo minuto): " (2)", " (3)"…
     — a cópia automática nunca grava por cima de outro projeto */
  function nomeLivre(ix, nome, obraId) {
    var base = limpa(nome), n = base;
    for (var k = 2; k < 1000 && conflitoDeNome(ix, n, obraId, ""); k++) n = base + " (" + k + ")";
    return n;
  }

  /* ---------------------------------------------------------------
   * O CONTORNO DO NOVO PROJETO COMO OPERAÇÕES DO EDITOR
   * ⚠ ATÉ AQUI O CONTORNO ERA CAIXA SINTÉTICA (BIM.carregarSintetico):
   *   aparecia no 3D e não era gravado em lugar nenhum — F5 e as paredes
   *   sumiam (os níveis ficavam), e o .opbim, que leva as OPERAÇÕES, saía
   *   sem elas. Como operação `criar` (a mesma que o editor grava quando a
   *   pessoa desenha), a parede é editável, vai para a obra e para o
   *   arquivo do projeto e volta ao reabrir.
   * Planta em metros, X para a direita e a profundidade no Z do 3D (a
   * convenção do js/bimedit.js). `BimEdit` vem de fora (o motor do editor).
   * --------------------------------------------------------------- */
  function paredesRetangulo(cfg, espessura, BimEdit) {
    var g = cfg || {}, ops = [];
    if (!BimEdit || typeof BimEdit.parede !== "function") return ops;
    var L = Number(g.largura), C = Number(g.comprimento), pd = Number(g.peDireito), np = Math.round(Number(g.pavimentos));
    if (!(L > 0) || !(C > 0) || !(pd > 0) || !(np >= 1)) return ops;
    var esp = Number(espessura) > 0 ? Number(espessura) : 0.14, k = 0;
    var lados = [[0, 0, L, 0], [L, 0, L, C], [L, C, 0, C], [0, C, 0, 0]];
    for (var i = 0; i < np; i++) {
      var base = Math.round(i * pd * 10000) / 10000;
      lados.forEach(function (p) {
        var cx = BimEdit.parede({ x: p[0], z: p[1] }, { x: p[2], z: p[3] }, esp, pd, base);
        if (cx) ops.push({ op: "criar", id: "e" + (++k), caixa: cx });
      });
    }
    return ops;
  }

  /* ---------------------------------------------------------------
   * O PROJETO NUMA OBRA DIFERENTE DA DE ORIGEM
   * ⚠ O id do nível leva a obra na frente ("<obra>::terreo", ver
   *   Gestao._nivChave) — e o Store casa o registro SÓ pelo id. Abrir o
   *   projeto da obra A dentro da obra B com os ids de A moveria os níveis
   *   de A para B. Troca o prefixo nos níveis e nas operações (a peça
   *   aponta o nível dela pelo id), só quando a obra muda.
   * --------------------------------------------------------------- */
  function rechavear(modelo, obraOrigem, obraDestino) {
    var de = txt(obraOrigem), para = txt(obraDestino);
    if (!modelo || !de || !para || de === para) return modelo;
    var s;
    try { s = JSON.stringify(modelo); } catch (e) { return modelo; }
    s = s.split("\"" + de + "::").join("\"" + para + "::");
    try { return JSON.parse(s); } catch (e2) { return modelo; }
  }

  function chaveIdb(empresaId, id) { return PREFIXO + txt(empresaId) + ":" + txt(id); }
  function chaveIndice(empresaId) { return PREFIXO + txt(empresaId) + ":" + MARCA_INDICE; }

  var BimProjetos = {
    PREFIXO: PREFIXO, TETO_RECENTES: TETO_RECENTES, EXT: ".opbim",
    nomeArquivo: nomeArquivo, nomePadrao: nomePadrao, assinatura: assinatura, podarVazios: podarVazios,
    indiceNormal: indiceNormal, registrar: registrar, ocultar: ocultar, esquecer: esquecer, obter: obter,
    recentes: recentes, doSistema: doSistema, conflitoDeNome: conflitoDeNome, marcarObra: marcarObra,
    validarNovo: validarNovo, paredesRetangulo: paredesRetangulo, rechavear: rechavear,
    nomeAnterior: nomeAnterior, nomeLivre: nomeLivre,
    chaveIdb: chaveIdb, chaveIndice: chaveIndice
  };
  global.BimProjetos = BimProjetos;
  if (typeof module !== "undefined" && module.exports) module.exports = BimProjetos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
