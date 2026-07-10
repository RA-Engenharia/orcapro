/* =====================================================================
 * folhasemanal.js — Folha de Pagamento SEMANAL de diaristas, por obra
 * (caso real: operário com FAVORECIDO + CHAVE PIX, valor dia a dia
 * SEG→DOM, "x" = falta, hora extra, empreitas/fretes/reembolsos e
 * fechamento por obra). Motor PURO, Node-testável — a view fica no
 * gestao.js. Inclui parser da planilha semanal (1 obra por aba).
 * ===================================================================== */
(function (global) {
  "use strict";

  var DIAS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  var ROT = { seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado", dom: "Domingo" };
  var HDR = { "SEGUNDA": "seg", "TERCA": "ter", "TERÇA": "ter", "QUARTA": "qua", "QUINTA": "qui", "SEXTA": "sex", "SABADO": "sab", "SÁBADO": "sab", "DOMINGO": "dom" };

  /* célula do ExcelJS pode vir objeto (richText/fórmula/hyperlink) ou Date — reduz ao valor cru */
  function bruto(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      if (v instanceof Date || typeof v.getFullYear === "function") return v;
      if (v.richText) return v.richText.map(function (t) { return t.text || ""; }).join("");
      if (v.result != null) return bruto(v.result);
      if (v.text != null) return v.text;
      if (v.hyperlink) return v.text || "";
      if (v.error) return "";
      return "";
    }
    return v;
  }
  function up(s) { return String(s == null ? "" : s).toUpperCase(); }
  function limpo(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function ehFalta(v) { return /^x+$/i.test(limpo(v)); }

  /* número dual: aceita BR (1.234,56 / 166,00) e US da planilha dela (R$ 1,050.00 / 166.00) */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var s = limpo(v).replace(/r\$\s*/i, "");
    if (!s || ehFalta(s) || !/\d/.test(s)) return 0;
    s = s.replace(/[^\d.,-]/g, "");
    var pv = s.lastIndexOf(","), pd = s.lastIndexOf(".");
    if (pv !== -1 && pd !== -1) s = (pd > pv) ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    else if (pv !== -1) s = (s.length - pv - 1 === 3 && s.indexOf(",") !== pv) ? s.replace(/,/g, "") : s.replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /* segunda-feira da semana de d (chave AAAA-MM-DD) */
  function chaveSemana(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow);
    var m = x.getMonth() + 1, dd = x.getDate();
    return x.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
  }
  function semanaVizinha(ch, delta) {
    var p = String(ch).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + (delta * 7));
    return chaveSemana(d);
  }
  function periodoDaChave(ch) {
    var p = String(ch).split("-"), ini = new Date(+p[0], +p[1] - 1, +p[2]), fim = new Date(+p[0], +p[1] - 1, +p[2] + 6);
    function f(d) { return (d.getDate() < 10 ? "0" : "") + d.getDate() + "/" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1); }
    return f(ini) + " a " + f(fim) + "/" + fim.getFullYear();
  }

  /* total de uma linha: diária = soma dos dias + HE; avulso = valor fixo */
  function totalLinha(l) {
    if (l.tipo && l.tipo !== "diaria") return num(l.valor);
    var t = 0; DIAS.forEach(function (d) { t += num(l.dias && l.dias[d]); });
    return t + num(l.he);
  }

  /* fechamento: totais por obra + geral */
  function fechamento(lancs) {
    var porObra = {}, total = 0;
    (lancs || []).forEach(function (l) {
      var t = totalLinha(l), k = l.obraId || l.obra || "—";
      if (!porObra[k]) porObra[k] = { total: 0, linhas: [] };
      porObra[k].total += t; porObra[k].linhas.push(l); total += t;
    });
    return { porObra: porObra, total: total };
  }

  /* lista de pagamento PIX: agrupa por favorecido+chave (a dor real da semana) */
  function listaPix(lancs) {
    var m = {}, out = [];
    (lancs || []).forEach(function (l) {
      var t = totalLinha(l); if (t <= 0) return;
      var fav = limpo(l.favorecido) || limpo(l.nome) || "—";
      var k = up(fav) + "|" + limpo(l.chavePix);
      if (!m[k]) { m[k] = { favKey: k, favorecido: fav, chavePix: limpo(l.chavePix), total: 0, itens: [] }; out.push(m[k]); }
      m[k].total += t; m[k].itens.push({ nome: l.nome, obraId: l.obraId || l.obra, valor: t });
    });
    out.sort(function (a, b) { return b.total - a.total; });
    return out;
  }

  /* chave PIX que é telefone BR vira link de WhatsApp (10-11 dígitos, com ou sem DDI) */
  function foneDaChave(chave) {
    var d = String(chave || "").replace(/\D/g, "");
    if (/@/.test(chave) || d.length === 11 && /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(limpo(chave))) return null; // e-mail/CPF
    if (d.length === 13 && d.slice(0, 2) === "55") return d;
    if (d.length === 10 || d.length === 11) return "55" + d;
    return null;
  }

  /* mesmo operário com valor lançado em 2+ obras no MESMO dia da semana */
  function conflitos(lancs) {
    var mapa = {}, out = [];
    (lancs || []).forEach(function (l) {
      if (l.tipo !== "diaria" || !l.dias) return;
      DIAS.forEach(function (d) {
        if (!num(l.dias[d])) return;
        var k = up(limpo(l.nome)) + "|" + d;
        if (!mapa[k]) mapa[k] = [];
        mapa[k].push(l.obraId || l.obra || "—");
      });
    });
    Object.keys(mapa).forEach(function (k) {
      var obras = mapa[k]; if (obras.length < 2) return;
      var p = k.split("|");
      out.push({ nome: p[0], dia: p[1], rotDia: ROT[p[1]], obras: obras });
    });
    return out;
  }

  /* rótulos dos tipos de lançamento (a "categoria" do custo) */
  var ROT_TIPO = { diaria: "Mão de obra (diárias)", empreita: "Empreita", frete: "Frete", reembolso: "Reembolso", fornecedor: "Material / Fornecedor", outro: "Outros" };

  /* total por tipo (MO, empreita, frete, material…) */
  function porTipo(lancs) {
    var m = {};
    (lancs || []).forEach(function (l) { var k = l.tipo || "outro"; m[k] = (m[k] || 0) + totalFinal(l); });
    return m;
  }

  /* semanas cujo início (segunda) cai no mês AAAA-MM, rotuladas Semana 01.. */
  function semanasDoMes(mesChave) {
    var p = String(mesChave).split("-"), ano = +p[0], mes = +p[1] - 1;
    var d = new Date(ano, mes, 1), out = [], n = 1;
    var dow = (d.getDay() + 6) % 7; if (dow) d.setDate(d.getDate() + (7 - dow)); // 1ª segunda do mês
    while (d.getMonth() === mes) {
      out.push({ chave: chaveSemana(d), rotulo: "Semana " + (n < 10 ? "0" : "") + n, periodo: periodoDaChave(chaveSemana(d)) });
      n++; d.setDate(d.getDate() + 7);
    }
    return out;
  }

  /* medição do período: anterior (tudo antes), atual (período), acumulado — por chave de grupo */
  function medicao(todos, semanasPeriodo, chaveDe) {
    var noPer = {}, antes = {}, setPer = {};
    (semanasPeriodo || []).forEach(function (s) { setPer[s] = 1; });
    var ini = (semanasPeriodo && semanasPeriodo.length) ? semanasPeriodo.slice().sort()[0] : "";
    (todos || []).forEach(function (l) {
      var k = chaveDe(l), t = totalFinal(l); if (!k || !t) return;
      if (setPer[l.semana]) noPer[k] = (noPer[k] || 0) + t;
      else if (l.semana < ini) antes[k] = (antes[k] || 0) + t;
    });
    var out = {};
    Object.keys(noPer).concat(Object.keys(antes)).forEach(function (k) {
      if (out[k]) return;
      var a = antes[k] || 0, c = noPer[k] || 0;
      out[k] = { anterior: a, atual: c, acumulado: a + c };
    });
    return out;
  }

  /* resumo do mês: semanas cujo início cai no mês (AAAA-MM) → por obra e por pessoa */
  function resumoMensal(lancs, mesChave) {
    var porObra = {}, porPessoa = {}, semanas = {}, total = 0;
    (lancs || []).forEach(function (l) {
      if (!l.semana || l.semana.slice(0, 7) !== mesChave) return;
      var t = totalFinal(l); if (!t) return;
      semanas[l.semana] = 1; total += t;
      var ob = l.obraId || l.obra || "—";
      porObra[ob] = (porObra[ob] || 0) + t;
      var quem = limpo(l.favorecido) || limpo(l.nome) || "—";
      porPessoa[quem] = (porPessoa[quem] || 0) + t;
    });
    return { mes: mesChave, semanas: Object.keys(semanas).sort(), porObra: porObra, porPessoa: porPessoa, total: total };
  }

  /* ---- parser da célula "Nome (Função) FAVORECIDO: ... CHAVE PIX: ..." ---- */
  var FUNCOES = [["MESTRE DE OBRAS", "Mestre de Obras"], ["PEDREIRO", "Pedreiro"], ["AJUDANTE", "Ajudante"], ["LIMPEZA", "Limpeza"], ["PINTURA", "Pintor"], ["PINTOR", "Pintor"], ["ELETRICISTA", "Eletricista"], ["ELETRICA", "Eletricista"], ["ELÉTRICA", "Eletricista"], ["CARPINTEIRO", "Carpinteiro"], ["FERREIRO", "Ferreiro"], ["SERRALHEIRO", "Serralheiro"], ["ENTULHO", "Entulho"], ["EMPREITA", "Empreiteiro"], ["FRETE", "Frete"], ["FORNECEDOR", "Fornecedor"], ["REEMBOLSO", "Reembolso"]];
  function parseOperario(txt) {
    var t = limpo(txt), U = up(t);
    var iFav = U.search(/FAVORECIDO\s*:?/), iPix = U.search(/(CHAVE\s*PIX|PIX|CPF)\s*:/);
    var cab = t.slice(0, iFav !== -1 ? iFav : (iPix !== -1 ? iPix : t.length));
    var favorecido = "", chave = "";
    if (iFav !== -1) {
      var resto = t.slice(iFav).replace(/^[^:]*:\s*/, "");
      var iPix2 = up(resto).search(/(CHAVE\s*PIX|PIX|CPF)\s*:/);
      favorecido = limpo(iPix2 !== -1 ? resto.slice(0, iPix2) : resto).replace(/[.,;]$/, "");
      if (iPix2 !== -1) chave = limpo(resto.slice(iPix2).replace(/^[^:]*:\s*/, ""));
    } else if (iPix !== -1) chave = limpo(t.slice(iPix).replace(/^[^:]*:\s*/, ""));
    chave = chave.replace(/\((CELULAR|CPF|E-?MAIL)\)\.?$/i, "").replace(/[.,;]\s*$/, "").trim();
    var funcao = "";
    for (var i = 0; i < FUNCOES.length; i++) if (up(cab).indexOf(FUNCOES[i][0]) !== -1) { funcao = FUNCOES[i][1]; break; }
    var nome = limpo(cab.replace(/[\(\)\-–]/g, " ").replace(new RegExp(funcao ? funcao.normalize("NFD").replace(/[̀-ͯ]/g, "") : "$nunca$", "i"), " "));
    // remove a função escrita de outros jeitos (acentos) e sobras
    FUNCOES.forEach(function (f) { nome = nome.replace(new RegExp(f[0].replace(/[ÉÊ]/g, "[EÉÊ]").replace(/Ç/g, "[CÇ]"), "ig"), " "); });
    nome = limpo(nome).replace(/\s{2,}/g, " ");
    return { nome: nome || limpo(cab), funcao: funcao, favorecido: favorecido, chavePix: chave };
  }

  function tipoAvulso(texto) {
    var U = up(texto);
    if (U.indexOf("REEMBOLSO") !== -1) return "reembolso";
    if (U.indexOf("FRETE") !== -1) return "frete";
    if (U.indexOf("FORNECEDOR") !== -1) return "fornecedor";
    if (U.indexOf("EMPREITA") !== -1) return "empreita";
    return "outro";
  }

  /* ---- parser da PLANILHA SEMANAL dela: {abas:[{nome,dados:[][]}]} (mesma
     estrutura que o app já extrai de .xlsx/.xls/.csv) ---- */
  function parsePlanilha(abas) {
    var obras = [], lancs = [], avisos = [];
    (abas || []).forEach(function (aba) {
      var m = (aba.dados || aba.matriz || []).map(function (r) { return (r || []).map(bruto); });
      var hi = -1, mapa = null, obraNome = null, chave = null;
      for (var r = 0; r < m.length; r++) {
        var row = m[r] || [], c0 = limpo(row[0]), U0 = up(c0);
        // cabeçalho de bloco: "OBRA X ... PERÍODO data ... data" (pode repetir na MESMA aba)
        var ehHdrDias = row.some(function (c) { return HDR[up(limpo(c))]; }) && /OPER/i.test(U0);
        if (ehHdrDias) {
          hi = r; mapa = { dias: {}, he: -1, total: -1 };
          row.forEach(function (c, i) {
            var h = up(limpo(c));
            if (HDR[h]) mapa.dias[i] = HDR[h];
            else if (/HORA\s*EXTRA/.test(h)) mapa.he = i;
            else if (h === "TOTAL") mapa.total = i;
          });
          if (mapa.total === -1) mapa.total = row.length - 1;
          continue;
        }
        if (!c0) continue;
        if (/PER[ÍI]ODO/i.test(row.join(" ")) && !mapa) { // linha-título do bloco
          obraNome = limpo(c0.replace(/^OBRA\s+/i, ""));
          if (obras.indexOf(obraNome) === -1) obras.push(obraNome);
          // 1ª data da linha vira a semana (M/D/AA ou D/M/AA — planilha dela é M/D/AA)
          for (var ci = 1; ci < row.length; ci++) {
            if (row[ci] && typeof row[ci] === "object" && typeof row[ci].getFullYear === "function") { var dU = row[ci]; chave = chaveSemana(new Date(dU.getUTCFullYear(), dU.getUTCMonth(), dU.getUTCDate())); break; }
            var dv = limpo(row[ci]), md = dv.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
            if (md) { var a = +md[3] < 100 ? 2000 + (+md[3]) : +md[3]; var mm = +md[1], dd = +md[2]; if (mm > 12) { var tmp = mm; mm = dd; dd = tmp; } chave = chaveSemana(new Date(a, mm - 1, dd)); break; }
          }
          hi = -1; mapa = null; continue;
        }
        if (/FECHAMENTO/i.test(U0)) { mapa = null; continue; }
        if (!mapa || hi === -1) continue;
        // linha de gente/avulso
        var op = parseOperario(c0), dias = {}, faltas = [], temDia = false, obs = [];
        Object.keys(mapa.dias).forEach(function (ci2) {
          var v = row[ci2], d = mapa.dias[ci2], s = limpo(v);
          if (ehFalta(s)) { faltas.push(d); return; }
          // só vira valor-dia se a célula for numérica de verdade ("2ª COMPRA" é observação, não R$ 2)
          if (/^(r\$)?\s*[\d.,]+$/i.test(s)) { var n = num(s); if (n > 0) { dias[d] = n; temDia = true; return; } }
          if (s) obs.push(s);
        });
        var he = mapa.he !== -1 ? num(row[mapa.he]) : 0;
        var totPl = num(row[mapa.total]);
        var l = { obra: obraNome || aba.nome, semana: chave, nome: op.nome, funcao: op.funcao, favorecido: op.favorecido, chavePix: op.chavePix, obs: obs.join(" · ") };
        if (temDia) { l.tipo = "diaria"; l.dias = dias; l.faltas = faltas; l.he = he; }
        else { l.tipo = tipoAvulso(c0 + " " + obs.join(" ")); l.valor = totPl; }
        if (totPl > 0 || temDia) {
          var calc = totalLinha(l);
          if (totPl > 0 && Math.abs(calc - totPl) > 0.01) {
            // total da planilha manda (pode ter semana anterior embutida) — mas avisa
            avisos.push(l.obra + " · " + l.nome + ": calculado R$ " + calc.toFixed(2) + " ≠ planilha R$ " + totPl.toFixed(2) + " (mantive o da planilha)");
            if (l.tipo === "diaria") { l.tipo = "diaria"; l.ajuste = totPl - (calc - num(l.he)) - num(l.he); l.valor = totPl; l.usarValor = true; }
          }
          lancs.push(l);
        }
      }
    });
    return { obras: obras, lancamentos: lancs, avisos: avisos };
  }

  /* total considerando ajuste manual (linhas onde a planilha mandou) */
  function totalFinal(l) { return l.usarValor ? num(l.valor) : totalLinha(l); }

  var FolhaSemanal = {
    DIAS: DIAS, ROT: ROT,
    num: num, ehFalta: ehFalta,
    chaveSemana: chaveSemana, periodoDaChave: periodoDaChave, semanaVizinha: semanaVizinha,
    foneDaChave: foneDaChave, conflitos: conflitos, resumoMensal: resumoMensal,
    ROT_TIPO: ROT_TIPO, porTipo: porTipo, semanasDoMes: semanasDoMes, medicao: medicao,
    totalLinha: totalLinha, totalFinal: totalFinal,
    fechamento: function (lancs) { var f = fechamento(lancs); var t2 = 0, po = {}; (lancs || []).forEach(function (l) { var k = l.obraId || l.obra || "—", v = totalFinal(l); if (!po[k]) po[k] = { total: 0, linhas: [] }; po[k].total += v; po[k].linhas.push(l); t2 += v; }); return { porObra: po, total: t2 }; },
    listaPix: function (lancs) { var out = listaPix((lancs || []).map(function (l) { var c = {}; for (var k in l) c[k] = l[k]; if (l.usarValor) { c.tipo = "outro"; c.valor = l.valor; } return c; })); return out; },
    parseOperario: parseOperario, parsePlanilha: parsePlanilha
  };

  global.FolhaSemanal = FolhaSemanal;
  if (typeof module !== "undefined" && module.exports) module.exports = FolhaSemanal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
