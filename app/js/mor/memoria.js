/* =====================================================================
 * mor/memoria.js — A MEMÓRIA DO MOTOR: «aprende sozinho» (F6 do MOR, ESPEC §6)
 *
 * Local, por empresa, em `orcapro:mor:memoria:v1[:empresaId]`, versionada e migrável. Guarda cinco coisas:
 *   (a) CASAMENTOS   intenção normalizada → código escolhido/corrigido pelo usuário (contagem, data).
 *                    ⚠ A CORREÇÃO DO USUÁRIO VENCE SEMPRE: um casamento automático nunca troca um corrigido.
 *                    Na vez seguinte o motor decide igual, com confiança «memória».
 *   (b) COMPOSIÇÕES  composições próprias ACEITAS (com a origem: família, referência, regras), reaproveitadas
 *                    antes de gerar de novo.
 *   (c) RESPOSTAS    a resposta mais usada por tipologia/pergunta vira o PADRÃO da empresa (mínimo 2 usos e
 *                    estritamente a mais usada; empate não decide).
 *   (d) PERFIS       custo/m² por etapa de cada orçamento salvo → FAIXA PLAUSÍVEL («Cobertura saiu R$ 380/m²,
 *                    seus últimos 6 ficaram entre 140 e 210»). Só alerta com ao menos 3 anteriores.
 *   (e) FRASES       o que o usuário ENSINOU: frase não entendida → intenção do dicionário.
 * ⚠ Dado corrompido é ISOLADO (copiado para `…:corrompido:<data>`), nunca apagado nem travando a tela: o motor
 *   segue com memória vazia. Esquecer/editar, exportar e importar JSON estão aqui; a tela está em ui.js.
 * ⚠ ESPELHO NA NUVEM: NÃO feito. O espelho de js/propriasync.js depende de registrar uma entidade nova na
 *   nuvem (js/nuvem.js, com tombstones e merge por id/atualizadoEm) — não é cópia fácil. Fica LOCAL.
 * Puro, ES5. O armazenamento entra por parâmetro (`localStorage` no navegador).
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  var CHAVE = "orcapro:mor:memoria:v1";
  var MAX_PERFIS = 300, MAX_COMPOSICOES = 200, MAX_HIST = 5;

  var I = global.MorIntencoes || (typeof require === "function" ? (function () { try { return require("./intencoes.js"); } catch (e) { return null; } })() : null);

  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function agoraISO() { return new Date().toISOString(); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  var STOP = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, em: 1, com: 1, para: 1, a: 1, o: 1, na: 1, no: 1, por: 1, ou: 1, um: 1, uma: 1 };

  /* intenção/frase → chave estável: palavras sem acento, sem plural, sem «de/em/com…», sem repetição, ORDEM IGNORADA */
  function chaveDe(texto) {
    var t = I ? I.normalizar(texto) : String(texto || "").toLowerCase();
    var ps = t.split(" ").filter(Boolean).map(function (p) { return I ? I.radical(p) : p; });
    var v = {}, out = [];
    ps.forEach(function (p) { if (STOP[p]) return; if (/\d/.test(p)) { out.push(p); return; } if (!v[p]) { v[p] = 1; out.push(p); } });   /* número NÃO se deduplica: «60 60» ≠ «60» */
    return out.sort().join(" ");
  }

  function vazia() {
    var a = agoraISO();
    return { v: VERSAO, criadoEm: a, atualizadoEm: a, casamentos: {}, composicoes: [], respostas: {}, perfis: [], frases: {} };
  }

  /* Migração: aceita o que veio de qualquer versão e devolve { mem, migrou, avisos }. Nunca lança. */
  function migrar(obj) {
    var avisos = [], m = vazia(), migrou = false;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { mem: m, migrou: false, avisos: ["conteúdo inválido — memória começou vazia"], invalido: true };
    var v = Number(obj.v);
    if (!(v >= 0)) { v = 0; }
    if (v > VERSAO) return { mem: m, migrou: false, avisos: ["memória de uma versão mais nova (v" + v + ") — não mexi; começou vazia neste aparelho"], futuro: true };
    if (v === 0) {
      /* v0 (rascunho): casamentos como LISTA [{intencao,codigo,fonte}] */
      migrou = true;
      if (Array.isArray(obj.casamentos)) obj.casamentos.forEach(function (c) { if (c && c.intencao && c.codigo) m.casamentos[chaveCasamento(c.intencao, c.unidade || "")] = { intencao: String(c.intencao), codigo: String(c.codigo), fonte: String(c.fonte || "SINAPI"), usos: Number(c.usos) || 1, corrigido: false, ultima: String(c.data || m.criadoEm), historico: [] }; });
      avisos.push("memória v0 migrada para v1");
    } else {
      if (obj.casamentos && typeof obj.casamentos === "object") Object.keys(obj.casamentos).forEach(function (k) {
        var c = obj.casamentos[k];
        if (c && c.codigo) m.casamentos[k.indexOf("|") > -1 ? k : k + "|" + unidadeChave(c.unidade)] = {   /* chave antiga (sem unidade) vira «…|» : só SUGERE, não aplica sozinha */ intencao: String(c.intencao || k), unidade: String(c.unidade || ""), base: c.base || chaveBase(c.intencao || k), numeros: c.numeros || numerosDe(c.intencao || k), codigo: String(c.codigo), fonte: String(c.fonte || "SINAPI"), usos: Math.max(1, Number(c.usos) || 1), corrigido: c.corrigido === true, ultima: String(c.ultima || ""), historico: Array.isArray(c.historico) ? c.historico.slice(-MAX_HIST) : [] };
      });
      if (Array.isArray(obj.composicoes)) m.composicoes = obj.composicoes.filter(function (c) { return c && c.chave && c.comp && c.comp.codigo; }).slice(-MAX_COMPOSICOES);
      if (obj.respostas && typeof obj.respostas === "object") Object.keys(obj.respostas).forEach(function (tp) {
        var pt = obj.respostas[tp]; if (!pt || typeof pt !== "object") return;
        m.respostas[tp] = {};
        Object.keys(pt).forEach(function (pid) { var vs = pt[pid]; if (!vs || typeof vs !== "object") return; m.respostas[tp][pid] = {}; Object.keys(vs).forEach(function (val) { var n = Number(vs[val]); if (n > 0) m.respostas[tp][pid][val] = Math.floor(n); }); });
      });
      if (Array.isArray(obj.perfis)) m.perfis = obj.perfis.filter(function (p) { return p && p.orcId && p.etapas && typeof p.etapas === "object"; }).slice(-MAX_PERFIS);
      if (obj.frases && typeof obj.frases === "object") Object.keys(obj.frases).forEach(function (k) { var f = obj.frases[k]; if (f && f.entrada && f.frase) m.frases[k] = { frase: String(f.frase), entrada: String(f.entrada), usos: Math.max(1, Number(f.usos) || 1), em: String(f.em || "") }; });
      if (obj.criadoEm) m.criadoEm = String(obj.criadoEm);
      if (obj.atualizadoEm) m.atualizadoEm = String(obj.atualizadoEm);
    }
    m.v = VERSAO;
    return { mem: m, migrou: migrou, avisos: avisos };
  }

  /* ---------------- (a) casamentos ----------------
     ⚠ REVISÃO ADVERSÁRIA (13/11/2026): a chave tinha só as palavras da BUSCA, sem as medidas — «porcelanato 60x60» gravado
     (87263) era aplicado a «porcelanato 90x90», e «tubo PVC 50 mm» (89712) a «tubo PVC 100 mm esgoto». Agora a chave é a
     DESCRIÇÃO COM AS MEDIDAS + a UNIDADE: medida ou unidade diferente = outra chave = a memória NÃO aplica sozinha; no máximo
     SUGERE (casamentos de mesma base e unidade, medida diferente, rotulados «memória»). */
  function unidadeChave(u) { return String(u == null ? "" : u).toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/\s+/g, ""); }
  function chaveCasamento(texto, unidade) { return chaveDe(texto) + "|" + unidadeChave(unidade); }
  /* só as palavras do objeto (sem número, sem «x», «cm», «mm», «dn», «fck»): a «base» do pedido */
  function chaveBase(texto) {
    var t = I ? I.normalizar(texto) : String(texto || "").toLowerCase();
    var ps = t.split(" ").filter(Boolean).map(function (p) { return I ? I.radical(p) : p; }).filter(function (p) { return !STOP[p] && !/\d/.test(p) && !/^(x|cm|mm|m|dn|fck|mpa|kg|un|l)$/.test(p); });
    var v = {}, out = [];
    ps.forEach(function (p) { if (!v[p]) { v[p] = 1; out.push(p); } });
    return out.sort().join(" ");
  }
  function numerosDe(texto) {
    var out = [];
    (String(texto || "").replace(/²/g, "2").match(/\d+(?:[.,]\d+)?/g) || []).forEach(function (n) { var v = parseFloat(String(n).replace(",", ".")); if (v === v) out.push(v); });
    return out.sort(function (a, b) { return a - b; });
  }

  function registrarCasamento(mem, intencao, escolha, opts) {
    opts = opts || {};
    var k = chaveCasamento(intencao, opts.unidade); if (!chaveDe(intencao) || !escolha || !escolha.codigo) return { ok: false, motivo: "intenção ou código ausente" };
    var agora = opts.agora || agoraISO(), at = mem.casamentos[k], cod = String(escolha.codigo), fonte = String(escolha.fonte || "SINAPI");
    var corr = opts.corrigido === true;
    if (!at) {
      mem.casamentos[k] = { intencao: String(intencao), unidade: String(opts.unidade || ""), base: chaveBase(intencao), numeros: numerosDe(intencao), codigo: cod, fonte: fonte, usos: 1, corrigido: corr, ultima: agora, historico: [] };
      return { ok: true, acao: "novo" };
    }
    if (at.codigo === cod && at.fonte === fonte) { at.usos++; at.ultima = agora; if (corr) at.corrigido = true; return { ok: true, acao: "reforcado", usos: at.usos }; }
    /* código DIFERENTE do que está guardado */
    if (!corr && at.corrigido) return { ok: false, acao: "ignorado", motivo: "o casamento guardado foi CORRIGIDO pelo usuário — a escolha automática não o troca" };
    if (!corr && at.usos >= 3) return { ok: false, acao: "ignorado", motivo: "o guardado tem " + at.usos + " usos; uma escolha isolada não o troca" };
    at.historico.push({ codigo: at.codigo, fonte: at.fonte, ate: agora, usos: at.usos }); at.historico = at.historico.slice(-MAX_HIST);
    at.codigo = cod; at.fonte = fonte; at.usos = 1; at.ultima = agora; at.corrigido = corr;
    return { ok: true, acao: "trocado" };
  }
  /* EXATO: mesma descrição com as mesmas medidas e a mesma unidade */
  function consultarCasamento(mem, intencao, unidade) {
    var c = mem.casamentos[chaveCasamento(intencao, unidade)];
    return c ? { codigo: c.codigo, fonte: c.fonte, usos: c.usos, corrigido: c.corrigido, ultima: c.ultima, intencao: c.intencao, unidade: c.unidade || "", numeros: c.numeros || [], confianca: "memória" } : null;
  }
  /* SUGESTÕES: mesma base (objeto) e mesma unidade, mas medida diferente — nunca aplicadas sozinhas. Mais usadas primeiro. */
  function sugerirCasamentos(mem, intencao, unidade) {
    var base = chaveBase(intencao), exata = chaveCasamento(intencao, unidade), uk = unidadeChave(unidade), out = [];
    if (!base) return out;
    Object.keys(mem.casamentos).forEach(function (k) {
      if (k === exata) return;
      var c = mem.casamentos[k];
      if ((c.base || chaveBase(c.intencao)) !== base) return;
      if (c.unidade && unidadeChave(c.unidade) !== uk) return;   /* entrada antiga sem unidade vale como sugestão para qualquer unidade */
      out.push({ codigo: c.codigo, fonte: c.fonte, usos: c.usos, corrigido: c.corrigido, intencao: c.intencao, confianca: "memória" });
    });
    out.sort(function (a, b) { return (b.corrigido ? 1 : 0) - (a.corrigido ? 1 : 0) || b.usos - a.usos; });
    return out.slice(0, 3);
  }

  /* ---------------- (b) composições aceitas (mesma chave: descrição com medidas + unidade) ---------------- */
  function registrarComposicao(mem, intencao, comp, opts) {
    opts = opts || {};
    var un = opts.unidade !== undefined ? opts.unidade : (comp && comp.unidade);
    var k = chaveCasamento(intencao, un); if (!chaveDe(intencao) || !comp || !comp.codigo || !(comp.insumos || []).length) return { ok: false, motivo: "composição incompleta" };
    var i, agora = opts.agora || agoraISO();
    for (i = 0; i < mem.composicoes.length; i++) if (mem.composicoes[i].chave === k && mem.composicoes[i].comp.codigo === comp.codigo) { mem.composicoes[i].usos++; mem.composicoes[i].ultima = agora; return { ok: true, acao: "reforcada" }; }
    mem.composicoes.push({ chave: k, intencao: String(intencao), unidade: String(un || ""), comp: copia(comp), origem: comp.origem ? copia(comp.origem) : null, usos: 1, aceitaEm: agora, ultima: agora });
    if (mem.composicoes.length > MAX_COMPOSICOES) mem.composicoes = mem.composicoes.slice(-MAX_COMPOSICOES);
    return { ok: true, acao: "nova" };
  }
  /* só a de MESMA descrição (com medidas) e MESMA unidade */
  function composicaoDaMemoria(mem, intencao, unidade) {
    var k = chaveCasamento(intencao, unidade), melhor = null;
    mem.composicoes.forEach(function (c) { if (c.chave === k && (!melhor || c.usos > melhor.usos)) melhor = c; });
    return melhor ? { comp: copia(melhor.comp), usos: melhor.usos, origem: melhor.origem, confianca: "memória" } : null;
  }

  /* ---------------- (c) respostas → padrão ---------------- */
  function registrarResposta(mem, tipologia, perguntaId, valor) {
    var tp = String(tipologia || "_"), v = String(valor);
    mem.respostas[tp] = mem.respostas[tp] || {};
    mem.respostas[tp][perguntaId] = mem.respostas[tp][perguntaId] || {};
    mem.respostas[tp][perguntaId][v] = (mem.respostas[tp][perguntaId][v] || 0) + 1;
  }
  /* valor mais usado: ≥ 2 usos e ESTRITAMENTE o maior (empate não decide). Devolve o valor como string ou null. */
  function padraoDe(mem, tipologia, perguntaId) {
    var vs = ((mem.respostas[String(tipologia || "_")] || {})[perguntaId]) || {}, ks = Object.keys(vs);
    if (!ks.length) return null;
    ks.sort(function (a, b) { return vs[b] - vs[a]; });
    if (vs[ks[0]] < 2) return null;
    if (ks.length > 1 && vs[ks[1]] === vs[ks[0]]) return null;
    return ks[0];
  }
  /* { perguntaId: valorTipado } — o tipo vem do catálogo (número, sim/não, opção) */
  function padroes(mem, tipologia, catalogo) {
    var out = {}, pt = mem.respostas[String(tipologia || "_")] || {};
    Object.keys(pt).forEach(function (pid) {
      var v = padraoDe(mem, tipologia, pid); if (v === null) return;
      var q = catalogo && catalogo.pergunta ? catalogo.pergunta(pid) : null;
      if (q && q.bool) out[pid] = v === "true"; else if (q && q.num) { var n = Number(v); if (n === n) out[pid] = n; } else if (q) { if (!q.op || q.op.indexOf(v) > -1) out[pid] = v; }
    });
    return out;
  }

  /* ---------------- (d) perfil de custo/m² ---------------- */
  function registrarPerfil(mem, perfil, opts) {
    opts = opts || {};
    if (!perfil || !perfil.orcId || !(Number(perfil.area) > 0)) return { ok: false, motivo: "perfil sem orçamento ou sem área" };
    var etapas = {}, n = 0;
    Object.keys(perfil.etapas || {}).forEach(function (id) { var c = Number(perfil.etapas[id]); if (c > 0) { etapas[id] = Math.round(c / Number(perfil.area) * 100) / 100; n++; } });
    if (!n) return { ok: false, motivo: "nenhuma etapa com custo" };
    var novo = { orcId: String(perfil.orcId), tipologia: String(perfil.tipologia || "_"), area: Number(perfil.area), em: opts.agora || agoraISO(), etapas: etapas };
    var i; for (i = 0; i < mem.perfis.length; i++) if (mem.perfis[i].orcId === novo.orcId) { mem.perfis.splice(i, 1); break; }   /* mesmo orçamento salvo de novo = substitui (idempotente) */
    mem.perfis.push(novo);
    if (mem.perfis.length > MAX_PERFIS) mem.perfis = mem.perfis.slice(-MAX_PERFIS);
    return { ok: true, etapas: n };
  }
  /* custoM2 desta etapa vs. os últimos N orçamentos da MESMA tipologia (sem o próprio). Alerta só com ≥ 3 anteriores. */
  function faixa(mem, tipologia, etapaId, custoM2, opts) {
    opts = opts || {};
    var N = opts.n || 6, tp = String(tipologia || "_"), vals = [];
    for (var i = mem.perfis.length - 1; i >= 0 && vals.length < N; i--) {
      var p = mem.perfis[i];
      if (p.tipologia !== tp || (opts.ignorarOrc && p.orcId === opts.ignorarOrc)) continue;
      if (tem(p.etapas, etapaId)) vals.push(p.etapas[etapaId]);
    }
    if (vals.length < 3) return { n: vals.length, alerta: false, motivo: "histórico curto (" + vals.length + " anterior(es); preciso de 3)" };
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), c = Number(custoM2);
    var fora = c < mn || c > mx;
    return { n: vals.length, min: mn, max: mx, alerta: fora, atual: c, direcao: c > mx ? "acima" : (c < mn ? "abaixo" : ""), texto: fora ? "saiu R$ " + String(Math.round(c)).replace(".", ",") + "/m², seus últimos " + vals.length + " ficaram entre " + Math.round(mn) + " e " + Math.round(mx) : "" };
  }

  /* ---------------- (e) frases ensinadas ---------------- */
  function ensinarFrase(mem, frase, entradaId, opts) {
    var k = chaveDe(frase); if (!k) return { ok: false, motivo: "frase vazia" };
    if (I && !I.entradaDe(entradaId)) return { ok: false, motivo: "«" + entradaId + "» não é uma intenção do dicionário" };
    var at = mem.frases[k], agora = (opts && opts.agora) || agoraISO();
    if (at && at.entrada === entradaId) { at.usos++; at.em = agora; return { ok: true, acao: "reforcada" }; }
    mem.frases[k] = { frase: String(frase).trim(), entrada: String(entradaId), usos: 1, em: agora };   /* a correção do usuário troca sem discussão */
    return { ok: true, acao: at ? "trocada" : "nova" };
  }
  /* lista para o dicionário: [{ frase, entrada }] */
  function frasesEnsinadas(mem) { return Object.keys(mem.frases).map(function (k) { return { chave: k, frase: mem.frases[k].frase, entrada: mem.frases[k].entrada }; }); }

  /* ---------------- esquecer ---------------- */
  function esquecer(mem, tipo, chave) {
    if (tipo === "casamento") { if (!mem.casamentos[chave]) return false; delete mem.casamentos[chave]; return true; }
    if (tipo === "frase") { if (!mem.frases[chave]) return false; delete mem.frases[chave]; return true; }
    if (tipo === "composicao") { var n = mem.composicoes.length; mem.composicoes = mem.composicoes.filter(function (c) { return c.comp.codigo !== chave; }); return mem.composicoes.length < n; }
    if (tipo === "perfil") { var m = mem.perfis.length; mem.perfis = mem.perfis.filter(function (p) { return p.orcId !== chave; }); return mem.perfis.length < m; }
    if (tipo === "respostas") { if (!mem.respostas[chave]) return false; delete mem.respostas[chave]; return true; }
    if (tipo === "tudo") { var v = vazia(); mem.casamentos = v.casamentos; mem.composicoes = v.composicoes; mem.respostas = v.respostas; mem.perfis = v.perfis; mem.frases = v.frases; return true; }
    return false;
  }

  /* ---------------- exportar / importar ---------------- */
  function exportar(mem) { return JSON.stringify(mem, null, 1); }
  /* modo "mesclar" (soma usos; a CORREÇÃO do usuário vence; o mais recente desempata) ou "substituir". Devolve { ok, mem, avisos } sem tocar na memória atual. */
  function importar(atual, texto, modo) {
    var obj; try { obj = JSON.parse(String(texto)); } catch (e) { return { ok: false, motivo: "o arquivo não é JSON válido", mem: atual }; }
    var r = migrar(obj);
    if (r.invalido || r.futuro) return { ok: false, motivo: r.avisos[0], mem: atual };
    if (modo === "substituir") return { ok: true, mem: r.mem, avisos: r.avisos };
    var m = copia(atual), n = r.mem;
    Object.keys(n.casamentos).forEach(function (k) {
      var b = n.casamentos[k], a = m.casamentos[k];
      if (!a) { m.casamentos[k] = copia(b); return; }
      if (a.codigo === b.codigo && a.fonte === b.fonte) { a.usos += b.usos; a.corrigido = a.corrigido || b.corrigido; if (b.ultima > a.ultima) a.ultima = b.ultima; return; }
      if (a.corrigido && !b.corrigido) return;
      if (b.corrigido && !a.corrigido) { m.casamentos[k] = copia(b); return; }
      if (String(b.ultima) > String(a.ultima)) m.casamentos[k] = copia(b);
    });
    n.composicoes.forEach(function (c) { if (!m.composicoes.some(function (x) { return x.chave === c.chave && x.comp.codigo === c.comp.codigo; })) m.composicoes.push(copia(c)); });
    Object.keys(n.respostas).forEach(function (tp) { Object.keys(n.respostas[tp]).forEach(function (pid) { Object.keys(n.respostas[tp][pid]).forEach(function (val) { m.respostas[tp] = m.respostas[tp] || {}; m.respostas[tp][pid] = m.respostas[tp][pid] || {}; m.respostas[tp][pid][val] = (m.respostas[tp][pid][val] || 0) + n.respostas[tp][pid][val]; }); }); });
    n.perfis.forEach(function (p) { if (!m.perfis.some(function (x) { return x.orcId === p.orcId; })) m.perfis.push(copia(p)); });
    Object.keys(n.frases).forEach(function (k) { if (!m.frases[k]) m.frases[k] = copia(n.frases[k]); });
    m.atualizadoEm = agoraISO();
    return { ok: true, mem: m, avisos: r.avisos };
  }

  /* ---------------- armazenamento ---------------- */
  function chaveDaEmpresa(empresaId) { return CHAVE + (empresaId ? ":" + empresaId : ""); }
  function carregar(storage, empresaId) {
    var chave = chaveDaEmpresa(empresaId), cru = null;
    try { cru = storage ? storage.getItem(chave) : null; } catch (e) { return { mem: vazia(), avisos: ["armazenamento indisponível"], isolado: false }; }
    if (cru === null || cru === undefined || cru === "") return { mem: vazia(), avisos: [], isolado: false, novo: true };
    var obj;
    try { obj = JSON.parse(cru); } catch (e2) {
      var iso = chave + ":corrompido:" + agoraISO().replace(/[^0-9]/g, "").slice(0, 14);
      try { storage.setItem(iso, cru); } catch (e3) { /* sem espaço: segue */ }
      return { mem: vazia(), avisos: ["memória corrompida: isolada em «" + iso + "»; o motor segue com memória vazia"], isolado: true, copia: iso };
    }
    var r = migrar(obj);
    if (r.invalido || r.futuro) {
      var iso2 = chave + ":isolado:" + agoraISO().replace(/[^0-9]/g, "").slice(0, 14);
      try { storage.setItem(iso2, cru); } catch (e4) { /* ok */ }
      return { mem: r.mem, avisos: r.avisos.concat(["conteúdo antigo guardado em «" + iso2 + "»"]), isolado: true, copia: iso2 };
    }
    return { mem: r.mem, avisos: r.avisos, isolado: false, migrou: r.migrou };
  }
  /* grava só se mudou (idempotente) */
  function salvar(storage, empresaId, mem) {
    var chave = chaveDaEmpresa(empresaId), txt;
    try {
      mem.atualizadoEm = mem.atualizadoEm || agoraISO();
      txt = JSON.stringify(mem);
      if (storage.getItem(chave) === txt) return { ok: true, igual: true };
      storage.setItem(chave, txt);
      return { ok: true, igual: false };
    } catch (e) { return { ok: false, motivo: String((e && e.message) || e) }; }
  }

  var Mem = {
    VERSAO: VERSAO, CHAVE: CHAVE, chaveDe: chaveDe, chaveDaEmpresa: chaveDaEmpresa, vazia: vazia, migrar: migrar,
    chaveCasamento: chaveCasamento, chaveBase: chaveBase, sugerirCasamentos: sugerirCasamentos, registrarCasamento: registrarCasamento, consultarCasamento: consultarCasamento,
    registrarComposicao: registrarComposicao, composicaoDaMemoria: composicaoDaMemoria,
    registrarResposta: registrarResposta, padraoDe: padraoDe, padroes: padroes,
    registrarPerfil: registrarPerfil, faixa: faixa,
    ensinarFrase: ensinarFrase, frasesEnsinadas: frasesEnsinadas,
    esquecer: esquecer, exportar: exportar, importar: importar, carregar: carregar, salvar: salvar,
    resumo: function (mem) { return { casamentos: Object.keys(mem.casamentos).length, corrigidos: Object.keys(mem.casamentos).filter(function (k) { return mem.casamentos[k].corrigido; }).length, composicoes: mem.composicoes.length, perfis: mem.perfis.length, frases: Object.keys(mem.frases).length, respostas: Object.keys(mem.respostas).length }; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Mem;
  global.MorMemoria = Mem;
})(typeof window !== "undefined" ? window : globalThis);
