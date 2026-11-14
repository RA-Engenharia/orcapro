/* =====================================================================
 * mor/leitor.js — O LEITOR UNIVERSAL, SEM IA (F5 do MOR, ESPEC §4)
 *
 * Qualquer documento vira uma LISTA DE INTENÇÕES e, dela, o orçamento:
 *   texto livre / memorial (PDF ou DOCX já em texto) / planilha / edital
 *        → lerTexto · deMemorial · dePlanilha · deEdital
 *        → { tipologia, obra{área,pavimentos…}, respostas{perguntaDoCatálogo:valor}, etapas[], itens[],
 *            negados[], conflitos[], naoEntendidas[] }
 *        → montar(): cada item passa pelo CASADOR e, se não casa, pelo COMPOSITOR (Mor.resolverUm).
 * O QUE ELE LÊ (regras determinísticas, nenhuma IA):
 *   · quantidade + unidade em português do Brasil: «1.250 m²», «4,5 m2», «18.500 kg», «2 pontos», «12 m de…»;
 *     contagem por substantivo do dicionário: «18 tomadas», «3 quartos»;
 *   · medidas (nunca viram quantidade): DN, bitola/Ø, espessura, fck, dimensões «60x60 cm», «até 6 m»,
 *     «pé-direito», «de comprimento/altura»;
 *   · NEGAÇÃO («sem forro», «não haverá aquecimento solar», «sem remoção de esquadrias») derruba o termo
 *     dentro da oração e aparece em `negados`;
 *   · AÇÃO: executar · demolir · remover · substituir · recuperar;
 *   · termos do dicionário (js/mor/catalogo-dados/intencoes.js + Escopo.SINONIMOS) → etapa do catálogo e
 *     RESPOSTA IMPLÍCITA às perguntas dela («telha cerâmica» → cob.tipo = ceramica).
 * ⚠ O QUE NÃO ENTENDE APARECE (`naoEntendidas`) — não some e não é chutado. «Ensinar» a frase é a F6.
 * ⚠ Conflito (porcelanato E cerâmica no piso) não é resolvido calado: usa o 1º citado e lista em `conflitos`.
 * ⚠ Valor fora da faixa do catálogo (pé-direito de 8 m onde o catálogo vai até 6) NÃO entra: vai para `conflitos`.
 * Puro, ES5, sem DOM; planilha e licitação entram por injeção (opts) ou pelos globais do app.
 * ===================================================================== */
(function (global) {
  "use strict";

  var I = global.MorIntencoes || (typeof require === "function" ? require("./intencoes.js") : null);
  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);

  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function numBR(s) {
    var t = String(s).replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else if (t.indexOf(",") > -1) t = t.replace(",", ".");
    else if (/^\d+\.\d{3}$/.test(t)) t = t.replace(".", "");
    var v = parseFloat(t); return v === v ? v : NaN;
  }
  function r4(x) { return Math.round(x * 10000) / 10000; }

  var NEGADORES = { sem: 1, nao: 1, exceto: 1, exclusive: 1, menos: 1, dispensa: 1, dispensado: 1, dispensada: 1, exclui: 1, excluido: 1, excluida: 1 };
  var UN_CANON = [
    [/^(m 2|m2|metros? quadrados?)$/, "m²"], [/^(m 3|m3|metros? cubicos?)$/, "m³"], [/^(ml|metros? lineares?|metros?|m)$/, "m"],
    [/^(un|und|unid|unidades?|unidade|pecas?|pcs?|pc|pontos?|ponto)$/, "un"], [/^(kg|quilos?|quilogramas?)$/, "kg"], [/^(toneladas?|t)$/, "t"],
    [/^(litros?|l)$/, "l"], [/^(vb|verba)$/, "vb"], [/^(cj|conjuntos?)$/, "cj"], [/^(dias?|meses|mes)$/, "dia"]
  ];
  function unCanon(u) { for (var i = 0; i < UN_CANON.length; i++) if (UN_CANON[i][0].test(u)) return UN_CANON[i][1]; return ""; }
  var UNID = "(m 2|m2|m 3|m3|metros? quadrados?|metros? cubicos?|metros? lineares?|metros?|ml|m|unidades?|unidade|unid|und|un|pecas?|pcs?|pc|pontos?|kg|quilos?|quilogramas?|toneladas?|t|litros?|l|vb|verba|cj|conjuntos?|dias?|meses|mes)";
  var QTD_RE = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)\\s*" + UNID + "\\b";
  var NUM_RE = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";

  /* o que vem ANTES/DEPOIS do número e o torna MEDIDA, não quantidade */
  var ANTES_MEDIDA = /(dn|fck|espessura|\be\s*=|diametro|bitola|altura|largura|profundidade|comprimento|pe direito|ate|ate a|acima de|abaixo de|vao|vaos|ø|fi)\s*=?\s*(de\s+)?$/;
  var DEPOIS_MEDIDA = /^\s*(de\s+)?(comprimento|altura|espessura|largura|profundidade|de pe direito|de vao|de diametro|de lado)/;

  /* leitura de UMA linha ------------------------------------------------------------------------------------ */
  function palavras(norm) { return norm.match(/[a-z]+|\d+(?:[.,]\d+)*|[,;:.!?()]/g) || []; }

  function medidasDe(norm) {
    var m = {}, r;
    if ((r = /\bdn\s*(\d+)/.exec(norm))) m.dn = Number(r[1]);
    else if (/\b(tubo|tubos|tubulacao|cano|canos|pvc|cpvc|ppr|conexao|conexoes|joelho|luva|registro|eletroduto|ramal|esgoto)\b/.test(norm) && (r = /\b(\d{2,3})\s*mm\b/.exec(norm))) m.dn = Number(r[1]);   /* o diâmetro de tubulação escrito «100 mm» também é DN */
    if ((r = /(?:espessura|\be)\s*=?\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(cm|mm)/.exec(norm)) || (r = /(\d+(?:[.,]\d+)?)\s*(cm|mm)\s+de\s+espessura/.exec(norm))) m.espessuraCm = r[2] === "mm" ? numBR(r[1]) / 10 : numBR(r[1]);
    if ((r = /\bfck\s*=?\s*(\d+)/.exec(norm))) m.fck = Number(r[1]);
    if ((r = /(?:diametro|bitola|(?:^|[\s(])ø|\bfi)\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*mm/.exec(norm))) m.bitolaMm = numBR(r[1]);
    if ((r = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?\s*(cm|mm|m)?\b/.exec(norm))) {
      m.dimsPos = r.index; m.dims = [numBR(r[1]), numBR(r[2])]; if (r[3]) m.dims.push(numBR(r[3])); m.dimsUn = r[4] || "cm";
    }
    return m;
  }
  function textoMedidas(m) {
    var t = [];
    if (m.dn) t.push("dn " + m.dn);
    if (m.fck) t.push("fck " + m.fck);
    if (m.dims) t.push(m.dims.join(" x ") + " " + (m.dimsUn || "cm"));
    return t.join(" ");
  }

  /* parâmetros de OBRA escritos na linha. Devolve { campo:valor } e marca os trechos usados (para não virarem item). */
  function paramsDeObra(norm, usados) {
    var p = {}, r;
    function marca(re) { var m = re.exec(norm); if (m) usados.push([m.index, m.index + m[0].length]); return m; }
    if ((r = marca(new RegExp("area\\s+(?:construida\\s+|total\\s+|util\\s+|de\\s+|=\\s*)?(?:de\\s+)?" + NUM_RE + "\\s*(?:m 2|m2)")))) p.area = numBR(r[1]);
    else if ((r = marca(new RegExp(NUM_RE + "\\s*(?:m 2|m2)\\s+de\\s+area(?:\\s+construida|\\s+total|\\s+util)?")))) p.area = numBR(r[1]);
    if ((r = marca(/(\d+)\s*(?:pavimentos?|andares?|pisos)\b/))) p.pavimentos = Number(r[1]);
    else if (/\b(terrea|terreo)\b/.test(norm)) p.pavimentos = 1;
    else if (/\bsobrado\b/.test(norm)) p.pavimentos = 2;
    if ((r = marca(/(\d+)\s*(?:quartos?|dormitorios?|suites?)\b/))) p.quartos = Number(r[1]);
    if ((r = marca(/(\d+)\s*(?:banheiros?|wcs?|lavabos?)\b/))) p.banheiros = Number(r[1]);
    if ((r = marca(new RegExp("pe direito\\s*(?:de\\s+|=\\s*)?" + NUM_RE + "\\s*m?\\b")))) p.peDireito = numBR(r[1]);
    if ((r = marca(new RegExp("perimetro\\s*(?:externo\\s+)?(?:de\\s+|=\\s*)?" + NUM_RE + "\\s*m\\b")))) p.perimetro = numBR(r[1]);
    if (/\b(alto padrao|padrao alto|luxo|alto luxo)\b/.test(norm)) p.padrao = "alto";
    else if (/\b(padrao popular|popular|economico|baixo padrao|padrao baixo)\b/.test(norm)) p.padrao = "popular";
    else if (/\bpadrao\s+(normal|medio)\b/.test(norm)) p.padrao = "normal";
    return p;
  }

  /* respostas numéricas/textuais que dependem do número escrito na MESMA linha do termo */
  function respostasNumericas(norm, ents, med) {
    var out = {}, r, etapas = {};
    ents.forEach(function (e) { if (e.etapa) etapas[e.etapa] = 1; });
    if (etapas.alvenaria && /\b(bloco ceramico|tijolo|blocos ceramicos|bloco de vedacao)/.test(norm)) {
      var e1 = /(?:de\s+)?(9|14|19)\s*cm\b/.exec(norm); if (e1) out["alv.bloco"] = "ceramico" + e1[1];
    }
    if (etapas.pisoind && med.espessuraCm && [12, 14, 15].indexOf(med.espessuraCm) > -1) out["pisoind.esp"] = String(med.espessuraCm);
    if (etapas.muro) {
      if ((r = new RegExp(NUM_RE + "\\s*m\\s+de\\s+comprimento").exec(norm))) out["mur.comprimento"] = numBR(r[1]);
      if ((r = new RegExp(NUM_RE + "\\s*m\\s+de\\s+altura").exec(norm))) out["mur.altura"] = numBR(r[1]);
    }
    if (etapas.cobertura && (r = /inclinacao\s*(?:de\s+)?(\d+(?:[.,]\d+)?)\s*%/.exec(norm))) out["cob.inclinacao"] = numBR(r[1]);
    if (etapas.cobertura && (r = new RegExp("beiral\\s*(?:de\\s+)?" + NUM_RE + "\\s*m").exec(norm))) out["cob.beiral"] = numBR(r[1]);
    return out;
  }

  var ACAO_DE = { demolir: "demolir", remover: "remover", substituir: "substituir", executar: "executar", recuperar: "recuperar" };

  function analisarLinha(bruto, opts) {
    var norm = I.normalizar(bruto), tk = palavras(norm);
    var L = { bruto: bruto, entendida: false, tipologias: [], obra: {}, respostas: {}, negados: [], etapas: [], acao: "", itens: [], confl: [], medidas: medidasDe(norm), prazo: null, termos: [] };
    /* 1) termos do dicionário */
    var ms = I.achar(tk, opts && opts.extra);
    /* contexto: «pilares e vigas em AÇO» numa frase de estrutura metálica não é armação de concreto (termo do Escopo) */
    if (ms.some(function (mm) { return mm.entrada.etapa === "estmetal"; })) ms = ms.filter(function (mm) { return !(mm.entrada.origem === "escopo" && mm.entrada.etapa === "super"); });
    /* 2) negação: negador + até 5 palavras, até a pontuação */
    var neg = new Array(tk.length), i, j;
    for (i = 0; i < tk.length; i++) neg[i] = false;
    for (i = 0; i < tk.length; i++) {
      if (NEGADORES[tk[i]] && !(tk[i] === "nao" && tk[i + 1] === "so")) {
        for (j = i + 1; j < tk.length && j <= i + 5 && !/^[,;:.!?]$/.test(tk[j]); j++) neg[j] = true;
      }
    }
    ms.forEach(function (m) { m.negado = neg[m.ini] === true; });
    /* 3) parâmetros de obra */
    var usados = [], po = paramsDeObra(norm, usados), k;
    for (k in po) if (tem(po, k)) L.obra[k] = po[k];
    /* 4) quantidades: número + unidade; número inteiro + substantivo do dicionário */
    var qtds = [], re = new RegExp(QTD_RE, "g"), m;
    while ((m = re.exec(norm))) {
      var ini = m.index, fim = ini + m[0].length;
      if (usados.some(function (u) { return ini >= u[0] && ini < u[1]; })) continue;
      var antes = norm.slice(Math.max(0, ini - 22), ini).replace(/\s+$/, ""), depois = norm.slice(fim, fim + 24);
      var un = unCanon(m[2]), v = numBR(m[1]);
      if (!un || !(v > 0)) continue;
      if (ANTES_MEDIDA.test(antes) || DEPOIS_MEDIDA.test(depois)) continue;
      if (un === "dia") { L.prazo = { valor: v, unidade: /mes/.test(m[2]) ? "meses" : "dias" }; continue; }
      qtds.push({ pos: ini, fim: fim, valor: v, un: un, texto: m[0] });
    }
    /* contagem por substantivo: «18 tomadas» (a unidade é implícita: un) */
    var pos = 0, offsets = [];
    tk.forEach(function (t) { var at = norm.indexOf(t, pos); offsets.push(at < 0 ? pos : at); pos = (at < 0 ? pos : at) + t.length; });
    ms.forEach(function (mm) {
      if (mm.negado || !/^[SM]$/.test(mm.entrada.tipo)) return;
      var a = mm.ini - 1; if (a < 0 || !/^\d+$/.test(tk[a])) return;
      var off = offsets[a];
      if (usados.some(function (u) { return off >= u[0] && off < u[1]; })) return;
      if (qtds.some(function (q) { return off >= q.pos && off < q.fim; })) return;
      if (ANTES_MEDIDA.test(norm.slice(Math.max(0, off - 22), off).replace(/\s+$/, ""))) return;
      var v = Number(tk[a]); if (v > 0 && v < 100000) qtds.push({ pos: off, fim: off + tk[a].length, valor: v, un: "un", texto: tk[a] + " " + tk[mm.ini], porSubstantivo: true });
    });
    qtds.sort(function (x, y) { return x.pos - y.pos; });
    /* 5) a linha fala de tipo de obra? */
    ms.forEach(function (mm) {
      if (mm.negado) return;
      var rt = mm.entrada.resp && mm.entrada.resp._tipologia;
      if (rt && L.tipologias.indexOf(rt) < 0) L.tipologias.push(rt);
    });
    /* área na linha que descreve o tipo da obra («Galpão industrial de 1.250 m²») = parâmetro, não item */
    if (L.tipologias.length && qtds.length && L.obra.area === undefined) {
      var qa = qtds.filter(function (q) { return q.un === "m²"; })[0];
      if (qa) { L.obra.area = qa.valor; qtds.splice(qtds.indexOf(qa), 1); }
    }
    /* 6) respostas implícitas, etapas, negados, ação */
    var vivos = [];
    ms.forEach(function (mm) {
      var e = mm.entrada;
      L.termos.push({ forma: mm.forma, id: e.id, tipo: e.tipo, etapa: e.etapa, negado: mm.negado });
      if (mm.negado) {
        L.negados.push({ termo: e.id, etapa: e.etapa });
        var kk; for (kk in e.resp) if (tem(e.resp, kk) && kk !== "_tipologia" && typeof e.resp[kk] === "boolean") L.respostas[kk] = !e.resp[kk];
        return;
      }
      if (e.tipo === "T") return;
      vivos.push(mm);
      if (e.etapa && L.etapas.indexOf(e.etapa) < 0) L.etapas.push(e.etapa);
      var k2; for (k2 in e.resp) if (tem(e.resp, k2) && k2 !== "_tipologia") {
        if (!tem(L.respostas, k2)) L.respostas[k2] = e.resp[k2];
        else if (L.respostas[k2] !== e.resp[k2]) L.confl.push({ id: k2, valores: [L.respostas[k2], e.resp[k2]] });
      }
      if (e.tipo === "A" && !L.acao) L.acao = ACAO_DE[e.id] || "executar";
    });
    var rn = respostasNumericas(norm, vivos.map(function (mm) { return mm.entrada; }), L.medidas), k3;
    for (k3 in rn) if (tem(rn, k3)) L.respostas[k3] = rn[k3];
    /* 7) itens: cada quantidade pega o termo de serviço/material mais próximo (antes, em empate; senão depois) */
    var serv = vivos.filter(function (mm) { return /^[SM]$/.test(mm.entrada.tipo); });
    if (!serv.length) serv = vivos.filter(function (mm) { return mm.entrada.tipo === "W"; });   /* «demolir paredes»: só a palavra fraca */
    var acoesNaLinha = vivos.filter(function (mm) { return mm.entrada.tipo === "A"; });
    /* a AÇÃO de um termo é a do verbo que vem antes dele («Remover 40 m² de telhado e COLOCAR telha cerâmica»); sem verbo antes, o 1º da frase */
    function acaoEm(ini) {
      var a = "";
      acoesNaLinha.forEach(function (v) { if (v.ini < ini) a = ACAO_DE[v.entrada.id] || "executar"; });
      return a || (acoesNaLinha.length ? (ACAO_DE[acoesNaLinha[0].entrada.id] || "executar") : (L.acao || "executar"));
    }
    var dedup = function (t) { var v = {}, o = []; String(t).split(" ").forEach(function (w) { if (w && !v[w]) { v[w] = 1; o.push(w); } }); return o.join(" "); };
    /* «pintar 50 m² de TETO»; mas «paredes ATÉ O TETO» é altura, não o serviço */
    var temTeto = vivos.some(function (mm) { return mm.entrada.id === "teto" && tk[mm.ini - 1] !== "ate" && !(tk[mm.ini - 1] === "o" && tk[mm.ini - 2] === "ate"); });
    /* termos em LISTA («Chapisco, emboço e reboco em 100 m²»): só vírgula, «e» ou «ou» entre eles → a quantidade vale para cada serviço da lista */
    function cadeia(best) {
      var out = [best], i, mm, entre = function (a, b) { for (var z = a; z < b; z++) if (!/^(,|e|ou)$/.test(tk[z])) return false; return true; };
      var idx = serv.indexOf(best), prev = best, j;
      for (j = idx - 1; j >= 0; j--) { mm = serv[j]; if (!entre(mm.fim, prev.ini)) break; out.unshift(mm); prev = mm; }
      prev = best;
      for (j = idx + 1; j < serv.length; j++) { mm = serv[j]; if (!entre(prev.fim, mm.ini)) break; out.push(mm); prev = mm; }
      var vistos = {}, res = [];
      out.forEach(function (m2) { if (!vistos[m2.entrada.id]) { vistos[m2.entrada.id] = 1; res.push(m2); } });
      return res;
    }
    function fazItem(q, best, opcoes) {
      opcoes = opcoes || {};
      var et = best.entrada.etapa, acao = acaoEm(best.ini);
      /* as dimensões «60x60 cm» pertencem ao termo MAIS PRÓXIMO delas; os outros itens da frase não as herdam */
      var med = {}, mk; for (mk in L.medidas) if (tem(L.medidas, mk)) med[mk] = L.medidas[mk];
      if (med.dims && med.dimsPos !== undefined) {
        var prox = null, pd = 1e9;
        serv.forEach(function (mm) { var dd = Math.abs(offsets[mm.ini] - med.dimsPos); if (dd < pd) { pd = dd; prox = mm; } });
        if (prox !== best) { delete med.dims; delete med.dimsUn; delete med.dimsPos; }
      }
      var demol = acao === "demolir" || acao === "remover";
      var b0 = best.entrada.busca || best.forma;
      /* «pintar 50 m² de TETO»: a palavra fraca «teto» vira a intenção (pintura/revestimento de teto, não de parede) */
      if (temTeto && !demol && (et === "pintura" || et === "revestimento")) b0 = /\bparedes?\b/.test(b0) ? b0.replace(/\bparedes?\b/, "teto") : b0 + " teto";
      var busca = dedup((demol ? (acao === "demolir" ? "demolicao " : "remocao ") : "") + b0);
      var it = {
        bruto: bruto, quantidade: r4(q.valor), unidade: q.un, quantidadeTexto: q.texto,
        etapa: demol ? "demolicoes" : et, acao: acao, intencao: best.entrada.id, busca: busca,
        medidas: med, descricao: (busca + " " + textoMedidas(med)).replace(/\s+/g, " ").trim()
      };
      if (opcoes.herdada) it.herdada = true;
      L.itens.push(it);
      return it;
    }
    var jaTem = {};
    qtds.forEach(function (q) {
      var tkQ = 0, t2;
      for (t2 = 0; t2 < offsets.length; t2++) { if (offsets[t2] >= q.pos) { tkQ = t2; break; } tkQ = t2 + 1; }
      var best = null, bd = 1e9;
      serv.forEach(function (mm) {
        var d = mm.fim <= tkQ ? tkQ - mm.fim : mm.ini - tkQ - (q.porSubstantivo ? 0 : 1);
        if (mm.fim > tkQ && mm.ini <= tkQ) d = 0;
        if (mm.ini === tkQ + 1) d = -1;       /* «18 tomadas», «12 pontos de iluminação»: o termo vem colado ao número */
        var pref = mm.fim <= tkQ ? 0 : 0.5;
        if (d + pref < bd && d <= 9) { bd = d + pref; best = mm; }
      });
      if (!best) return;
      /* a lista só vale se a quantidade vem COLADA ao fim dela («Chapisco, emboço e reboco EM 100 m²»); longe dela a quantidade é de um termo só */
      var distQ = best.fim <= tkQ ? tkQ - best.fim : best.ini - tkQ;
      (distQ <= 2 ? cadeia(best) : [best]).forEach(function (m2) { var it = fazItem(q, m2); jaTem[m2.entrada.id] = it; });
    });
    /* «Remover 40 m² de telhado e COLOCAR telha cerâmica»: o serviço de execução sem quantidade própria herda a da remoção
       (é a substituição na mesma área) — e a linha diz isso */
    var demols = L.itens.filter(function (it) { return it.acao === "demolir" || it.acao === "remover"; });
    if (demols.length === 1 && L.itens.length === 1) {
      var base0 = demols[0], vistosH = {};
      serv.forEach(function (mm) {
        if (jaTem[mm.entrada.id] || vistosH[mm.entrada.id] || mm.entrada.tipo === "W") return;
        if (acaoEm(mm.ini) !== "executar") return;
        vistosH[mm.entrada.id] = 1;
        fazItem({ valor: base0.quantidade, un: base0.unidade, texto: base0.quantidadeTexto + " (herdada da remoção)" }, mm, { herdada: true });
      });
    }
    var temObra = false, kx; for (kx in L.obra) if (tem(L.obra, kx)) temObra = true;
    L.entendida = temObra || ms.length > 0 || qtds.length > 0 || !!L.prazo;
    return L;
  }

  /* quebra em orações: linhas e «. » seguido de maiúscula; «;» */
  function oracoes(texto) {
    var out = [];
    String(texto == null ? "" : texto).split(/\r?\n/).forEach(function (linha) {
      var s = linha.replace(/^\s*(?:[-•*·]+|\d+(?:\.\d+)*[.)]\s*(?=[A-Za-zÀ-ú]{3,}))\s*/, "").trim();
      if (!s) return;
      var ini = 0, i;
      for (i = 0; i < s.length; i++) {
        var c = s.charAt(i), pr = s.charAt(i - 1), nx = s.charAt(i + 1), nn = s.charAt(i + 2);
        if (c === ";" || (c === "." && /[A-Za-zÀ-ú)\]²³]/.test(pr) && nx === " " && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(nn) && !/\b(art|no|nº|sr|dr|eng)$/i.test(s.slice(Math.max(0, i - 4), i)))) {
          var p = s.slice(ini, i).trim(); if (p) out.push(p); ini = i + 1;
        }
      }
      var resto = s.slice(ini).trim(); if (resto) out.push(resto);
    });
    return out.filter(function (x) { return x.replace(/[^A-Za-zÀ-ú0-9]/g, "").length >= 3; });
  }

  function valida(q, v) {
    if (!q) return { ok: false, motivo: "pergunta fora do catálogo" };
    if (q.bool) return typeof v === "boolean" ? { ok: true, v: v } : { ok: false, motivo: "esperava sim/não" };
    if (q.num) { var n = Number(v); if (!(n === n)) return { ok: false, motivo: "não é número" }; if ((q.min != null && n < q.min) || (q.max != null && n > q.max)) return { ok: false, motivo: "fora da faixa " + q.min + "–" + q.max }; return { ok: true, v: n }; }
    if (q.op) return q.op.indexOf(String(v)) > -1 ? { ok: true, v: String(v) } : { ok: false, motivo: "fora das opções" };
    return { ok: false, motivo: "tipo de pergunta desconhecido" };
  }

  var Leitor = {
    oracoes: oracoes, analisarLinha: analisarLinha,

    /* Texto livre (ou memorial já em texto) → lista de intenções consolidada. */
    lerTexto: function (texto, opts) {
      opts = opts || {};
      var R = { ok: true, linhas: [], tipologia: "", tipologiasCitadas: [], obra: {}, respostas: {}, etapas: [], itens: [], negados: [], conflitos: [], naoEntendidas: [], prazo: null, avisos: [] };
      var vistaResp = {}, vistaObra = {};
      var extra = (opts.frases && I.indiceExtra) ? I.indiceExtra(opts.frases) : null;
      oracoes(texto).forEach(function (ora) {
        var L = analisarLinha(ora, { extra: extra });
        R.linhas.push(L);
        if (!L.entendida) { R.naoEntendidas.push({ bruto: ora, motivo: "nenhum termo do dicionário, quantidade ou parâmetro de obra reconhecido" }); return; }
        L.tipologias.forEach(function (t) { if (R.tipologiasCitadas.indexOf(t) < 0) R.tipologiasCitadas.push(t); });
        var k;
        for (k in L.obra) if (tem(L.obra, k)) {
          var q = C.PERGUNTAS_OBRA.filter(function (x) { return x.id === k; })[0], vv = q ? valida(q, L.obra[k]) : { ok: true, v: L.obra[k] };
          if (q && q.op) vv = valida(q, L.obra[k]);
          if (!vv.ok) { R.conflitos.push({ id: k, tipo: "faixa", valor: L.obra[k], motivo: "«" + (q ? q.txt : k) + "» = " + L.obra[k] + ": " + vv.motivo + " — não usei; o Manual vai pedir", linha: ora }); continue; }
          if (tem(vistaObra, k) && vistaObra[k] !== vv.v) { R.conflitos.push({ id: k, tipo: "duplo", valores: [vistaObra[k], vv.v], usado: vistaObra[k], motivo: "«" + k + "» citado com dois valores (" + vistaObra[k] + " e " + vv.v + ") — usei o 1º", linha: ora }); continue; }
          vistaObra[k] = vv.v; R.obra[k] = vv.v;
        }
        for (k in L.respostas) if (tem(L.respostas, k)) {
          var pq = C.pergunta(k), v2 = valida(pq, L.respostas[k]);
          if (!v2.ok) { R.conflitos.push({ id: k, tipo: "faixa", valor: L.respostas[k], motivo: "«" + (pq ? pq.txt : k) + "» = " + L.respostas[k] + ": " + v2.motivo + " — não usei; vale o padrão do catálogo", linha: ora }); continue; }
          if (tem(vistaResp, k) && vistaResp[k] !== v2.v) { R.conflitos.push({ id: k, tipo: "duplo", valores: [vistaResp[k], v2.v], usado: vistaResp[k], motivo: "«" + (pq ? pq.txt : k) + "»: o texto cita " + vistaResp[k] + " e " + v2.v + " — usei " + vistaResp[k] + " (o 1º); confira", linha: ora }); continue; }
          vistaResp[k] = v2.v; R.respostas[k] = v2.v;
        }
        L.confl.forEach(function (c) { var pq2 = C.pergunta(c.id); R.conflitos.push({ id: c.id, tipo: "duplo", valores: c.valores, usado: c.valores[0], motivo: "«" + (pq2 ? pq2.txt : c.id) + "»: a mesma frase cita " + c.valores[0] + " e " + c.valores[1] + " — usei " + c.valores[0] + " (o 1º); confira", linha: ora }); });
        L.etapas.forEach(function (e) { if (R.etapas.indexOf(e) < 0) R.etapas.push(e); });
        L.negados.forEach(function (n) { R.negados.push({ termo: n.termo, etapa: n.etapa, linha: ora }); });
        L.itens.forEach(function (it) { R.itens.push(it); });
        if (L.prazo && !R.prazo) R.prazo = L.prazo;
      });
      R.tipologia = R.tipologiasCitadas[0] || "";
      if (R.tipologiasCitadas.length > 1) R.conflitos.push({ id: "_tipologia", tipo: "duplo", valores: R.tipologiasCitadas.slice(), usado: R.tipologia, motivo: "o texto cita mais de um tipo de obra (" + R.tipologiasCitadas.join(", ") + ") — usei o 1º" });
      /* etapa só vale se existir no catálogo e NÃO foi apenas negada em todas as menções */
      R.etapas = R.etapas.filter(function (e) { return !!C.etapa(e); });
      if (R.obra.area === undefined) R.avisos.push("O texto não diz a área: o Manual vai pedir (sem ela não há quantidade por regra).");
      return R;
    },

    /* Memorial/PDF: o texto já extraído (Gestao._pdfTexto / CplproTpl.memorialParaEscopo) entra aqui. */
    deMemorial: function (texto, opts) {
      var R = Leitor.lerTexto(texto, opts);
      R.origem = "memorial";
      var E = (opts && opts.Escopo) || global.Escopo;
      if (E && E.deTextos) {
        try { var amb = E.deTextos(String(texto || "").split(/\r?\n/)); if (amb && amb.ok) { R.ambientes = amb.ambientes; R.areaAmbientes = amb.total; if (R.obra.area === undefined) R.avisos.push("Os ambientes somam " + amb.total + " m² (área útil escrita no documento) — confirme se é a área construída."); } } catch (e) { /* ajuda; segue */ }
      }
      return R;
    },

    /* Planilha: matriz → Importador.analisar → itens. Item com código e fonte mantém o código; sem código, vai ao casador. */
    dePlanilha: function (matriz, opts) {
      opts = opts || {};
      var Imp = opts.Importador || global.Importador;
      var R = { ok: true, origem: "planilha", linhas: [], tipologia: "", obra: {}, respostas: {}, etapas: [], itens: [], negados: [], conflitos: [], naoEntendidas: [], prazo: null, avisos: [], etapasPlanilha: [] };
      if (!Imp || !Imp.analisar) { R.ok = false; R.avisos.push("Importador indisponível."); return R; }
      var a = Imp.analisar(matriz, opts.analise || {});
      if (a.erro) { R.ok = false; R.avisos = (a.avisos || []).concat([a.erro]); return R; }
      (a.avisos || []).forEach(function (x) { R.avisos.push(x); });
      (a.etapas || []).forEach(function (et) {
        var cat = C.etapaPorNome(et.nome);
        R.etapasPlanilha.push({ nome: et.nome, catalogo: cat ? cat.id : "" });
        if (cat && R.etapas.indexOf(cat.id) < 0) R.etapas.push(cat.id);
        (et.itens || []).forEach(function (it) {
          var L = analisarLinha(it.descricao);
          L.etapas.forEach(function (e) { if (C.etapa(e) && R.etapas.indexOf(e) < 0 && !cat) R.etapas.push(e); });
          var k; for (k in L.respostas) if (tem(L.respostas, k) && !tem(R.respostas, k)) { var v = valida(C.pergunta(k), L.respostas[k]); if (v.ok) R.respostas[k] = v.v; }
          var un = String(it.unidade || ""), uk = un.toLowerCase().replace("²", "2").replace("³", "3");
          var uc = unCanon(I.normalizar(un).replace(/²/g, "2")) || unCanon(uk) || un;
          R.itens.push({
            bruto: it.descricao, quantidade: it.quantidade, unidade: uc || un, etapa: cat ? cat.id : (L.etapas[0] || ""), etapaNome: et.nome,
            acao: L.acao || "executar", intencao: (L.termos[0] && L.termos[0].id) || "", busca: it.descricao, medidas: L.medidas,
            descricao: it.descricao, codigo: it.codigo || "", fonte: it.fonte || "", custoPlanilha: it.custoUnitario || 0, daPlanilha: true
          });
          if (!L.termos.length) R.naoEntendidas.push({ bruto: it.descricao, motivo: "item da planilha sem termo do dicionário (segue para o casador pela descrição inteira)", daPlanilha: true });
        });
      });
      return R;
    },

    /* Edital: bases exigidas, competência, UF, regime, BDI e tipo (preset). Só o que está ESCRITO. */
    deEdital: function (texto, opts) {
      opts = opts || {};
      var t = I.normalizar(texto), orig = String(texto || ""), E = { ok: true, origem: "edital", bases: [], competencia: "", uf: "", desonerado: null, bdi: null, regime: "", obraEngenharia: null, presetId: "", presetMotivo: "", avisos: [] };
      var BASES = [["SINAPI", /\bsinapi\b/], ["SICRO", /\bsicro\b/], ["ORSE", /\borse\b/], ["SEINFRA", /\bseinfra\b/], ["CPOS", /\bcpos\b|\bcdhu\b/], ["SBC", /\bsbc\b/], ["IOPES", /\biopes\b|\bder es\b/], ["SUDECAP", /\bsudecap\b/], ["GOINFRA", /\bgoinfra\b|\bagetop\b/], ["SETOP", /\bsetop\b/], ["EMOP", /\bemop\b/], ["DNIT", /\bdnit\b/], ["TCPO", /\btcpo\b/], ["SIURB", /\bsiurb\b/], ["FDE", /\bfde\b/]];
      BASES.forEach(function (b) { var m = b[1].exec(t); if (m) E.bases.push({ fonte: b[0], pos: m.index }); });
      E.bases.sort(function (a, b) { return a.pos - b.pos; });
      E.bases = E.bases.map(function (b, i) { return { fonte: b.fonte, ordem: i + 1 }; });
      /* para datas e siglas o «/» e o «-» CONTAM: texto próprio, só sem acento e minúsculo */
      var te = String(texto || ""); try { te = te.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (eN) {}
      te = te.toLowerCase().replace(/\s+/g, " ");
      var mc = /(?:data[ -]?base|data de referencia|referencia|competencia|mes base|mes de referencia)\s*[:\-]?\s*(?:de\s+)?(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})/.exec(te) || /\b(0?[1-9]|1[0-2])\s*\/\s*(20\d{2})\b/.exec(te);
      if (mc) E.competencia = mc[2] + "-" + (mc[1].length < 2 ? "0" + mc[1] : mc[1]);
      var ESTADOS = { "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso do sul": "MS", "mato grosso": "MT", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO" };
      var ks = Object.keys(ESTADOS).sort(function (x, y) { return y.length - x.length; }), iu;
      var pb = /\b(?:sinapi|sicro|orse|seinfra)\b/.exec(te);
      if (pb) { var janela = te.slice(pb.index, pb.index + 90); for (iu = 0; iu < ks.length; iu++) if (new RegExp("\\b" + ks[iu] + "\\b").test(janela)) { E.uf = ESTADOS[ks[iu]]; break; } }
      if (!E.uf) { var mu2 = /\b(?:uf|estado)\s*(?:de|do|da)?\s*[:\-]?\s*([a-z]{2})\b/.exec(te); if (mu2) E.uf = mu2[1].toUpperCase(); }
      if (/sem desoneracao|nao desonerad|\bonerad[oa]/.test(te)) E.desonerado = false;
      else if (/com desoneracao|\bdesonerad[oa]|desoneracao/.test(te)) E.desonerado = true;
      var mb = /\bbdi\b[^0-9]{0,70}(\d{1,2}(?:[.,]\d+)?)\s*%/.exec(t);
      if (mb) E.bdi = { percentual: numBR(mb[1]), texto: mb[0] };
      if (/preco global|empreitada por preco global/.test(t)) E.regime = "empreitada_global";
      else if (/preco unitario|empreitada por preco unitario/.test(t)) E.regime = "empreitada_unitario";
      else if (/contratacao integrada|empreitada integral|regime integral/.test(t)) E.regime = "integral";
      else if (/\btarefa\b/.test(t)) E.regime = "tarefa";
      var tt = t.replace(/materia(?:l|is) de construcao/g, "material");   /* «material de construção» não é obra */
      var compra = /aquisicao de|fornecimento de material|compra de|registro de precos para aquisicao/.test(tt) && !/obra|reforma|construcao|engenharia/.test(tt);
      if (/obra de engenharia|servico de engenharia|obras? e servicos? de engenharia|reforma|construcao|ampliacao|pavimentacao|execucao de obra/.test(tt)) E.obraEngenharia = true;
      else if (compra || /servico comum|servicos comuns/.test(tt)) E.obraEngenharia = false;
      var Lic = opts.LicitacaoAuto || global.LicitacaoAuto;
      if (compra) { E.presetId = "compra"; E.presetMotivo = "o edital fala em aquisição/compra e não em obra"; }
      else if (Lic && Lic.escolherPreset) {
        var p = Lic.escolherPreset({ obra_engenharia: E.obraEngenharia === null ? undefined : E.obraEngenharia, regime_execucao: E.regime || undefined });
        E.presetId = p.id; E.presetMotivo = p.motivo;
      } else E.avisos.push("LicitacaoAuto indisponível: tipo do edital não deduzido.");
      E.premissas = [];
      if (!E.uf && opts.ufEmpresa) { E.uf = String(opts.ufEmpresa).toUpperCase(); E.ufPremissa = true; E.premissas.push("O edital não diz a UF das tabelas: usei a UF da empresa (" + E.uf + ") — confira."); }
      if (!E.bases.length) E.avisos.push("O edital não cita base de preços (SINAPI, SICRO…): a escolha fica com o orçamentista.");
      if (!E.bdi) E.avisos.push("Nenhum BDI escrito no edital.");
      var itens = Leitor.lerTexto(orig, opts); E.objeto = itens;   /* o objeto/escopo descrito no edital também é lido */
      return E;
    },

    /* Consolida a leitura num PLANO e resolve cada item (casador → compositor). ctx = o do Orçamentista (ver casador.js).
       Sem ctx, devolve o plano com itens `estado:"nao-resolvido"` (a fiação resolve depois). */
    montar: function (leitura, ctx, opts) {
      opts = opts || {};
      var M = opts.Mor || global.Mor || (typeof require === "function" ? (function () { try { return require("./motor.js"); } catch (e) { return null; } })() : null);
      var plano = {
        ok: leitura.ok !== false, origem: leitura.origem || "texto", tipologia: leitura.tipologia || "", obra: leitura.obra || {}, respostas: leitura.respostas || {},
        etapas: (leitura.etapas || []).map(function (id) { var e = C.etapa(id); return { id: id, nome: e ? e.etapa : id }; }),
        itens: [], negados: leitura.negados || [], conflitos: leitura.conflitos || [], naoEntendidas: leitura.naoEntendidas || [], avisos: (leitura.avisos || []).slice(), prazo: leitura.prazo || null,
        relatorio: { itens: 0, comCodigoDoDocumento: 0, casados: 0, compostos: 0, pendentes: 0, naoResolvidos: 0 }
      };
      (leitura.itens || []).forEach(function (it) {
        var x = {}, k; for (k in it) if (tem(it, k)) x[k] = it[k];
        plano.relatorio.itens++;
        if (it.codigo && ctx && typeof ctx.obter === "function") {
          var base = null, fontes = (ctx.fontes || ["SINAPI"]), f;
          for (f = 0; f < fontes.length && !base; f++) { base = ctx.obter(fontes[f], it.codigo); if (base) x.fonte = fontes[f]; }
          var O = global.Orcamentista || (typeof require === "function" ? (function () { try { return require("../orcamentista.js"); } catch (e) { return null; } })() : null);
          var CAS = global.MorCasador || (typeof require === "function" ? (function () { try { return require("./casador.js"); } catch (e) { return null; } })() : null);
          /* ⚠ REVISÃO ADVERSÁRIA: antes bastava semelhança ≥ 0,22 e a unidade nem era conferida (87879 em «m» passava; a 89402,
             água fria 25 mm, passava por «tubo pvc 50 mm esgoto»). Agora: MESMA unidade + as MEDIDAS do texto na descrição do código
             (a conferência do casador) + semelhança ≥ 0,6. Divergiu → PENDENTE, com o motivo escrito. */
          var motivoCod = "";
          if (!base) motivoCod = "o código " + it.codigo + " não existe nas bases carregadas";
          else {
            var mu = CAS && CAS.medidasEUnidade ? CAS.medidasEUnidade({ descricao: it.descricao, unidade: it.unidade }, base, ctx) : { ok: true };
            var sim = O ? O.similaridade(it.descricao, base.descricao, it.unidade, base.unidade, ctx) : 1;
            if (!mu.ok) motivoCod = mu.motivo; else if (sim < 0.6) motivoCod = "a semelhança com a descrição do código é só " + Math.round(sim * 100) + "% (mínimo 60%): «" + String(base.descricao).slice(0, 60) + "»";
            if (!motivoCod) { x.resolucao = { estado: "codigo-do-documento", codigo: String(it.codigo), fonte: x.fonte, confianca: sim, motivo: "código do documento achado na base " + x.fonte + ", mesma unidade, medidas e descrição conferem" }; plano.relatorio.comCodigoDoDocumento++; plano.itens.push(x); return; }
          }
          x.avisoCodigo = "código do documento não confere: " + motivoCod;
          var rSug = (M && M.resolverUm && ctx) ? M.resolverUm({ descricao: x.descricao, unidade: x.unidade, intencao: x.busca }, ctx, { memoria: opts.memoria }) : null;
          var sugC = rSug && rSug.casador ? (rSug.casador.sugestoes || []).slice() : [];
          if (rSug && rSug.estado === "casado" && rSug.codigo) sugC.unshift({ codigo: rSug.codigo, fonte: rSug.fonte, descricao: rSug.descricaoBase || "", unidade: x.unidade, custoUnitario: 0, confianca: rSug.confianca, aviso: "achado pela descrição (o código do documento não conferiu)" });
          x.resolucao = { estado: "pendente", codigo: "", fonte: "", confianca: 0, motivo: x.avisoCodigo, sugestoes: sugC.slice(0, 3) };
          plano.relatorio.pendentes++; plano.itens.push(x); return;
        }
        if (!ctx || !M || !M.resolverUm) { x.resolucao = { estado: "nao-resolvido", motivo: "sem bases carregadas neste momento" }; plano.relatorio.naoResolvidos++; plano.itens.push(x); return; }
        var rOpts = {}, zk; for (zk in (opts.resolver || {})) if (tem(opts.resolver, zk)) rOpts[zk] = opts.resolver[zk];
        if (opts.memoria) rOpts.memoria = opts.memoria;
        var r = M.resolverUm({ descricao: x.descricao, unidade: x.unidade, intencao: x.busca }, ctx, rOpts);
        x.resolucao = { estado: r.estado, codigo: r.codigo, fonte: r.fonte, confianca: r.confianca, motivo: r.motivo, composicao: r.composicao ? { codigo: r.composicao.comp.codigo, familia: r.composicao.familia, referencia: r.composicao.referencia, regras: r.composicao.regras, conferir: !!r.composicao.conferir, erroCustoMedido: r.composicao.erroCustoMedido, comp: r.composicao.comp } : null, sugestoes: ((r.casador && r.casador.sugestoes) || []).slice(0, 3), via: r.via || "" };
        if (r.estado === "casado") plano.relatorio.casados++; else if (r.estado === "composto") plano.relatorio.compostos++; else plano.relatorio.pendentes++;
        plano.itens.push(x);
      });
      return plano;
    },

    /* Relatório curto, em texto, do que foi entendido e do que não foi (para a tela e para o log). */
    resumo: function (plano) {
      var l = [];
      l.push("Tipo de obra: " + (plano.tipologia || "não identificado") + " · área: " + (plano.obra.area !== undefined ? plano.obra.area + " m²" : "não informada"));
      l.push("Etapas: " + (plano.etapas.map(function (e) { return e.nome; }).join("; ") || "nenhuma"));
      l.push("Respostas implícitas: " + (Object.keys(plano.respostas).map(function (k) { return k + " = " + plano.respostas[k]; }).join("; ") || "nenhuma"));
      l.push("Itens com quantidade escrita: " + plano.itens.length + " · casados " + plano.relatorio.casados + " · compostos " + plano.relatorio.compostos + " · pendentes " + plano.relatorio.pendentes + " · com código do documento " + plano.relatorio.comCodigoDoDocumento);
      if (plano.conflitos.length) l.push("Conflitos: " + plano.conflitos.map(function (c) { return c.motivo; }).join(" | "));
      if (plano.naoEntendidas.length) l.push("Não entendi (" + plano.naoEntendidas.length + "): " + plano.naoEntendidas.map(function (n) { return "«" + n.bruto.slice(0, 60) + "»"; }).join(" · "));
      return l.join("\n");
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Leitor;
  global.MorLeitor = Leitor;
})(typeof window !== "undefined" ? window : globalThis);
