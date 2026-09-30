/* =====================================================================
 * rvnuvem.js — as regras do LINK da RA/RV (o projeto no celular de
 * qualquer pessoa). Motor puro: sem DOM, sem Store, sem THREE.
 *
 * O que ele decide:
 *   - o que vai junto com o modelo no link (marca da empresa, pontos de
 *     vista, cronograma 4D) — por LISTA BRANCA;
 *   - como o celular traduz as chaves das peças do computador;
 *   - a regra do apontamento de campo (espelho da do servidor) e como ele
 *     vira ponto de vista na obra;
 *   - os textos de "Meus links".
 *
 * ⚠ O QUE NUNCA SAI NO LINK — DINHEIRO. A Simulação 4D guarda, por
 *   atividade, `custo` (custo direto), `valor` (venda) e `peso` — que É o
 *   custo quando o orçamento tem custo, então a proporção entre etapas
 *   revelaria o orçamento. Nada disso é removido em lugar nenhum do app (a
 *   tela só esconde). O link vai para o cliente final, sem login: por isso
 *   aqui é LISTA BRANCA — campo novo na simulação não viaja até alguém
 *   decidir que pode. `test-rvnuvem.js` reprova se qualquer número de
 *   dinheiro aparecer no JSON do link.
 *
 * ⚠ AS CHAVES NÃO BATEM ENTRE OS APARELHOS. A chave durável da peça é
 *   `<modeloId>::<GlobalId>`, e o modeloId do computador leva a obra
 *   (`<obraId>/<arquivo>`, ou a vaga da federação), enquanto o celular, que
 *   não tem obra, monta `sem_obra/<arquivo>`. O GlobalId é o mesmo, e o
 *   hash do conteúdo (arquivoId/versaoId) também. O link leva o par
 *   {arquivoId, modeloId} de cada modelo, e o celular troca o prefixo.
 *   Sem isto, toda vista abria com todas as peças "não localizadas".
 * ===================================================================== */
(function (global) {
  "use strict";

  var SEP = "::";
  var VALIDADES = [
    { dias: 1, rotulo: "1 dia" },
    { dias: 3, rotulo: "3 dias" },
    { dias: 7, rotulo: "7 dias" },
    { dias: 30, rotulo: "30 dias" }
  ];
  var DIAS_PADRAO = 3;
  var MAX_VISTAS = 60;
  var MAX_LOGO = 30000;          // dataURL; a camisa do avatar já usa ≤ 20 KB
  var TIPOS_NOTA = [
    { id: "obs", rotulo: "Observação" },
    { id: "problema", rotulo: "Problema" },
    { id: "duvida", rotulo: "Dúvida" }
  ];

  function txt(v, max) { var s = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return max ? s.slice(0, max) : s; }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function vec(a, n) {
    if (!a || a.length !== n) return null;
    for (var i = 0; i < n; i++) if (!num(a[i])) return null;
    return a.slice(0, n);
  }
  function pega(o, campos) {
    var r = {};
    if (!o) return r;
    for (var i = 0; i < campos.length; i++) if (o[campos[i]] !== undefined) r[campos[i]] = copia(o[campos[i]]);
    return r;
  }

  /* ---------------- marca ---------------- */
  function marca(empresa, obra, logo) {
    var l = String(logo || "");
    return {
      empresa: txt(empresa, 80),
      obra: txt(obra, 120),
      /* só imagem de verdade e pequena: o manifesto inteiro vai ao celular
         antes do modelo, e um logo de 2 MB atrasaria a primeira tela */
      logo: /^data:image\/(png|jpeg|webp);base64,/.test(l) && l.length <= MAX_LOGO ? l : ""
    };
  }

  /* ---------------- pontos de vista ---------------- */
  /* ⚠ sem comentarios, autor, marcacoes nem obraId: o comentário da vista é
     conversa interna da equipe, e o link vai para o cliente */
  var CAMPOS_VISTA = ["id", "nome", "completa", "camera", "cortes", "visibilidade", "aparencias", "modelos", "estilo", "medidas"];
  function vistasParaLink(vistas) {
    return (vistas || []).filter(function (v) {
      /* só as vistas que a equipe salvou: as que vieram do BCF e as de
         apontamento de campo são pendência de coordenação, não apresentação */
      return v && v.camera && !v.origem;
    }).slice(0, MAX_VISTAS).map(function (v) {
      var r = pega(v, CAMPOS_VISTA);
      r.nome = txt(v.nome, 80) || "Vista";
      return r;
    });
  }

  /* ---------------- 4D ---------------- */
  var CAMPOS_ATV = ["id", "codigo", "n", "nome", "pai", "sub", "categoria", "corEtapa", "inicio", "termino", "marco", "critico", "estimado", "demolicao"];
  function cronoParaLink(sim, uidParaChave) {
    if (!sim || !sim.atividades || !sim.eixo) return null;
    var semChave = 0;
    var atividades = sim.atividades.map(function (a) {
      var r = pega(a, CAMPOS_ATV);
      r.base = a.base ? pega(a.base, ["inicio", "termino", "marco"]) : { inicio: a.inicio, termino: a.termino, marco: !!a.marco };
      r.real = a.real ? pega(a.real, ["ini", "fim", "pct"]) : null;
      r.peso = 0;           // ⚠ o peso É o custo quando há custo — ver o cabeçalho
      return r;
    });
    var elementos = [];
    (sim.elementos || []).forEach(function (el) {
      var ch = uidParaChave ? uidParaChave(el.id) : "";
      if (!ch) { semChave++; return; }
      elementos.push({ chave: ch, atv: el.atv == null ? null : el.atv, fase: el.fase || "" });
    });
    var E = sim.eixo;
    return {
      versao: 1,
      inicio: sim.inicio, fim: sim.fim, hoje: sim.hoje || "",
      temReal: !!sim.temReal, corte: sim.corte || null,
      dataInicioObra: sim.dataInicioObra || sim.inicio, dataFimObra: sim.dataFimObra || "",
      eixo: {
        dias: (E.dias || []).map(function (d) { return { data: d.data, util: !!d.util, feriado: d.feriado || null, c: d.c, dow: d.dow }; }),
        idx: copia(E.idx || {}), totalUteis: E.totalUteis || 0
      },
      atividades: atividades,
      porId: copia(sim.porId || {}),
      elementos: elementos,
      semChave: semChave
    };
  }
  /* o que o motor da Simulação 4D (BIM4DSim.estadoEm/cena) precisa, com as
     peças já no uid DESTE aparelho. pesoTotal 0 = sem % na tela: o % do
     computador é pesado pelo custo, e um % "por contagem" seria outro
     número com o mesmo nome. */
  function cronoNoCelular(crono, chaveParaUid) {
    if (!crono) return null;
    var sim = copia(crono), els = [], perdidas = 0;
    (crono.elementos || []).forEach(function (el) {
      var uid = chaveParaUid ? chaveParaUid(el.chave) : "";
      if (!uid) { perdidas++; return; }
      els.push({ id: uid, atv: el.atv, fase: el.fase });
    });
    sim.elementos = els;
    sim.pesoTotal = 0; sim.custoTotal = 0; sim.peso = "sem";
    sim.naoLocalizadas = perdidas;
    return sim;
  }

  /* ---------------- chaves ---------------- */
  function partes(ch) {
    var s = String(ch || ""), i = s.indexOf(SEP);
    if (i <= 0) return null;
    return { modeloId: s.slice(0, i), resto: s.slice(i + SEP.length) };
  }
  /* {modeloIdDoComputador: modeloIdDoCelular}, casando pelo hash do arquivo */
  function mapaModelos(doLink, doCelular) {
    var porArq = {}, mapa = {};
    (doCelular || []).forEach(function (m) { if (m && m.arquivoId) porArq[m.arquivoId] = m.modeloId; });
    (doLink || []).forEach(function (m) {
      if (m && m.arquivoId && m.modeloId && porArq[m.arquivoId]) mapa[m.modeloId] = porArq[m.arquivoId];
    });
    return mapa;
  }
  function inverter(mapa) { var r = {}; Object.keys(mapa || {}).forEach(function (k) { r[mapa[k]] = k; }); return r; }
  function traduzir(ch, mapa) {
    var p = partes(ch);
    if (!p || !mapa || !Object.prototype.hasOwnProperty.call(mapa, p.modeloId)) return ch;
    return mapa[p.modeloId] + SEP + p.resto;
  }
  function traduzLista(l, mapa) { return (l || []).map(function (c) { return traduzir(c, mapa); }); }
  function traduzirDados(dados, doCelular) {
    var d = copia(dados) || {}, mapa = mapaModelos(d.modelos, doCelular);
    (d.vistas || []).forEach(function (v) {
      var vis = v.visibilidade;
      if (vis) {
        if (vis.ocultos) vis.ocultos = traduzLista(vis.ocultos, mapa);
        if (vis.isolados) vis.isolados = traduzLista(vis.isolados, mapa);
        if (vis.raioXAlvo) vis.raioXAlvo = traduzLista(vis.raioXAlvo, mapa);
      }
      (v.aparencias || []).forEach(function (a) { a.chave = traduzir(a.chave, mapa); });
      (v.modelos || []).forEach(function (m) { if (mapa[m.modeloId]) m.modeloId = mapa[m.modeloId]; });
    });
    if (d.crono) (d.crono.elementos || []).forEach(function (el) { el.chave = traduzir(el.chave, mapa); });
    var semPar = (d.modelos || []).filter(function (m) { return !mapa[m.modeloId]; }).map(function (m) { return m.modeloId; });
    return { dados: d, mapa: mapa, semPar: semPar };
  }

  /* ---------------- apontamento de campo ---------------- */
  /* ⚠ ESPELHO da regra do servidor (validarNota em server/vps/bim-rv.js):
     o celular recusa ANTES de enviar, para a pessoa não perder o texto e a
     foto por um 400. Os números têm de ser os mesmos dos dois lados. */
  var MAX_FOTO = 700 * 1024;
  function validarNota(n) {
    n = n || {};
    if (txt(n.texto).length < 2) return "Escreva o apontamento (pelo menos 2 letras).";
    if (txt(n.texto).length > 1000) return "O texto passa de 1000 letras.";
    if (txt(n.autor).length < 2) return "Diga seu nome.";
    if (!vec(n.ponto, 3)) return "Toque num ponto do modelo.";
    if (n.foto) {
      var m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(n.foto));
      if (!m) return "Foto em formato inválido (use JPEG ou PNG).";
      if (Math.floor(m[2].length * 3 / 4) > MAX_FOTO) return "Foto grande demais (máx " + Math.round(MAX_FOTO / 1024) + " KB).";
    }
    return null;
  }
  function rotuloTipo(id) {
    for (var i = 0; i < TIPOS_NOTA.length; i++) if (TIPOS_NOTA[i].id === id) return TIPOS_NOTA[i].rotulo;
    return "Observação";
  }
  /* a câmera que olha para o ponto: um pouco acima e ao lado, a ~5 m */
  function cameraPara(p) {
    return { pos: [p[0] + 3.5, p[1] + 2.5, p[2] + 3.5], alvo: [p[0], p[1], p[2]], up: [0, 1, 0], fov: 50, orto: false };
  }
  /* o apontamento vira PONTO DE VISTA da obra (bim_vistas, origem "campo"),
     no mesmo molde que a importação de BCF já usa: aparece na lista de
     pontos de vista, com o comentário aberto, e o clique leva a câmera ao
     ponto. `origemId` torna a importação idempotente. */
  function notaParaVista(nota, ctx) {
    ctx = ctx || {};
    var p = vec(nota.ponto, 3) || [0, 0, 0];
    var quando = num(nota.criado) ? new Date(nota.criado).toISOString() : "";
    return {
      obraId: ctx.obraId || "",
      nome: rotuloTipo(nota.tipo) + ": " + txt(nota.texto, 60),
      origem: "campo",
      origemId: String(ctx.token || "") + ":" + String(nota.id || ""),
      completa: false,
      camera: cameraPara(p),
      comentarios: [{ autor: txt(nota.autor, 60), em: quando, texto: txt(nota.texto, 1000), status: "aberto" }],
      campo: {
        tipo: nota.tipo || "obs", autor: txt(nota.autor, 60), criado: nota.criado || 0,
        elemento: txt(nota.elemento, 200), chave: txt(nota.chave, 200), ponto: p,
        token: String(ctx.token || ""), notaId: String(nota.id || ""), temFoto: !!nota.foto, link: txt(ctx.nomeLink, 120)
      }
    };
  }
  /* as que ainda não entraram na obra */
  function notasNovas(notas, vistasDaObra, token) {
    var ja = {};
    (vistasDaObra || []).forEach(function (v) { if (v && v.origemId) ja[v.origemId] = 1; });
    return (notas || []).filter(function (n) { return n && n.id && !ja[String(token) + ":" + n.id]; });
  }

  /* ---------------- Meus links ---------------- */
  function doisDig(n) { return (n < 10 ? "0" : "") + n; }
  function dataHora(ms) { var d = new Date(ms); return doisDig(d.getDate()) + "/" + doisDig(d.getMonth() + 1) + " às " + doisDig(d.getHours()) + ":" + doisDig(d.getMinutes()); }
  function tempoRelativo(ms, agora) {
    var s = Math.max(0, Math.round(((agora || Date.now()) - ms) / 1000));
    if (s < 60) return "agora há pouco";
    if (s < 3600) return "há " + Math.round(s / 60) + " min";
    if (s < 86400) return "há " + Math.round(s / 3600) + " h";
    var d = Math.round(s / 86400);
    return "há " + d + (d === 1 ? " dia" : " dias");
  }
  function resumoLink(l, agora) {
    agora = agora || Date.now();
    var falta = (l.expira || 0) - agora, validade;
    if (falta <= 0) validade = "vencido";
    else if (falta < 86400000) validade = "vence hoje às " + dataHora(l.expira).split(" às ")[1];
    else { var d = Math.ceil(falta / 86400000); validade = "vence em " + d + (d === 1 ? " dia" : " dias") + " (" + dataHora(l.expira) + ")"; }
    var ab = l.aberturas || 0;
    return {
      titulo: txt(l.nome, 120) || "Projeto",
      validade: validade,
      aberturas: ab ? "aberto " + ab + (ab === 1 ? " vez" : " vezes") + " · última " + tempoRelativo(l.ultimaAbertura, agora) : "ainda não foi aberto",
      notas: l.notas ? l.notas + (l.notas === 1 ? " apontamento" : " apontamentos") : "",
      /* `=== false`, não `!`: servidor anterior ao v4 nem manda o campo, e aí
         não dá para afirmar nada */
      semApontar: l.aceitaNotas === false ? "Não recebe apontamentos (link criado antes da versão que os traz para a obra). Gere um link novo para receber." : "",
      vencendo: falta > 0 && falta < 86400000
    };
  }

  /* hash curto e estável (FNV-1a, 2 × 32 bits) — chave do .glb no servidor:
     o mesmo recorte do modelo não sobe duas vezes */
  function hashCurto(s) {
    s = String(s);
    var h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 + ((h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24))) >>> 0;
      h2 ^= c; h2 = (h2 + ((h2 << 1) + (h2 << 4) + (h2 << 7) + (h2 << 8) + (h2 << 24))) >>> 0;
    }
    function hx(n) { var x = n.toString(16); while (x.length < 8) x = "0" + x; return x; }
    return hx(h1) + hx(h2);
  }

  var RvNuvem = {
    VALIDADES: VALIDADES, DIAS_PADRAO: DIAS_PADRAO, TIPOS_NOTA: TIPOS_NOTA, MAX_FOTO: MAX_FOTO,
    marca: marca, vistasParaLink: vistasParaLink, cronoParaLink: cronoParaLink, cronoNoCelular: cronoNoCelular,
    mapaModelos: mapaModelos, inverter: inverter, traduzir: traduzir, traduzirDados: traduzirDados,
    validarNota: validarNota, rotuloTipo: rotuloTipo, cameraPara: cameraPara, notaParaVista: notaParaVista, notasNovas: notasNovas,
    resumoLink: resumoLink, tempoRelativo: tempoRelativo, hashCurto: hashCurto
  };
  global.RvNuvem = RvNuvem;
  if (typeof module !== "undefined" && module.exports) module.exports = RvNuvem;
})(typeof window !== "undefined" ? window : this);
