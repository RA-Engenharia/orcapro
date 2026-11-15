/* =====================================================================
 * mor/progresso.js — PROGRESSO REAL de leitura (barra + % + etapa + tempo + Cancelar + vigia de travamento)
 *
 * POR QUÊ (14/11/2026): ao ler um arquivo grande (PDF, DXF, IFC, planilha) a tela só dizia «Lendo…» e a pessoa achava que
 * tinha travado — e na dúvida fechava o programa no meio. Este módulo é o motor puro do que a tela mostra:
 *   • etapas PONDERADAS (cada uma com peso); o % é o trabalho JÁ FEITO e MEDIDO: etapas concluídas + fração da etapa ativa;
 *   • ⚠ etapa SEM medida contínua (ex.: «Medindo o modelo», que roda de uma vez) NÃO tem % — a barra fica indeterminada e a tela
 *     mostra só a etapa e o tempo. Nunca se inventa percentual: um número falso é pior que número nenhum;
 *   • vigia: sem NENHUM avanço por 60 s, a tela diz «Ainda trabalhando — arquivos grandes podem levar alguns minutos (X MB)»;
 *   • erro mostra a mensagem do erro e o que fazer; cancelar para a leitura entre as fatias.
 * O cálculo é puro e testável em Node (tools/test-mor-progresso.js); o DOM (montar) é só o que pinta e liga o botão Cancelar.
 * ES5, sem dependência. O relógio é injetável (opts.agora) para o teste não depender de tempo real.
 * ===================================================================== */
(function (global) {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(x) { return typeof x === "number" && isFinite(x); }

  var LIMITE_PARADO_MS = 60000;

  /* ------------------------------------------------------------ formatação (BR) */
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b < 1024) return Math.round(b) + " B";
    if (b < 1024 * 1024) return (Math.round(b / 102.4) / 10).toString().replace(".", ",") + " KB";
    return (Math.round(b / (1024 * 102.4)) / 10).toString().replace(".", ",") + " MB";
  }
  function fmtTempo(ms) {
    var s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60), r = s % 60;
    return m + " min " + (r < 10 ? "0" : "") + r + " s";
  }

  /* ------------------------------------------------------------ o rastreador */
  /* etapas: [{ id, nome, peso (padrão 1), medida (padrão true; false = nunca terá %) }]
     opts: { agora: function () → ms, tamanho: bytes do arquivo, cancelavel: bool, limiteParadoMs } */
  function criar(etapas, opts) {
    opts = opts || {};
    var agora = opts.agora || function () { return Date.now(); };
    var lista = [], porId = {}, i;
    for (i = 0; i < (etapas || []).length; i++) {
      var e = etapas[i], x = { id: String(e.id), nome: String(e.nome || e.id), peso: num(e.peso) && e.peso > 0 ? e.peso : 1, medida: e.medida !== false, feito: 0, total: 0, indet: e.medida === false, estado: "espera", detalhe: "", unidade: "" };
      lista.push(x); porId[x.id] = x;
    }
    var t0 = agora(), ultimo = t0;
    var T = {
      cancelavel: !!opts.cancelavel, tamanho: num(opts.tamanho) ? opts.tamanho : 0, limiteParadoMs: num(opts.limiteParadoMs) ? opts.limiteParadoMs : LIMITE_PARADO_MS,
      cancelado: false, finalizado: false, erro: "", _ouv: [], _canc: []
    };
    function avisar() { for (var k = 0; k < T._ouv.length; k++) { try { T._ouv[k](T); } catch (e1) { /* ouvinte não derruba a leitura */ } } }
    /* entrar numa etapa conclui as anteriores (a ordem é a do trabalho): quem liga a tela não precisa lembrar de concluir uma a uma */
    function ativar(x) {
      var k, achou = false;
      for (k = 0; k < lista.length; k++) {
        if (lista[k] === x) { achou = true; break; }
        if (lista[k].estado !== "ok") { lista[k].estado = "ok"; if (lista[k].medida && lista[k].total) lista[k].feito = lista[k].total; lista[k].indet = false; }
      }
      if (achou && x.estado !== "ativa") x.estado = "ativa";
    }
    T.etapas = function () { return lista; };
    T.iniciar = function (id, detalhe) {
      var x = porId[id]; if (!x || T.finalizado) return T;
      ativar(x); ultimo = agora(); if (detalhe !== undefined) x.detalhe = detalhe; avisar(); return T;
    };
    /* avancar(id, feito, total, extra): extra = { unidade: "bytes"|"paginas"|"itens", detalhe: "texto livre", nome: "novo nome da etapa" }.
       total ausente/0 → a etapa fica SEM medida neste momento (sem %), só com o detalhe. */
    T.avancar = function (id, feito, total, extra) {
      var x = porId[id]; if (!x || T.finalizado) return T;
      ativar(x); extra = extra || {};
      var novoDet = extra.detalhe !== undefined ? extra.detalhe : x.detalhe;
      if (extra.unidade) x.unidade = extra.unidade;
      if (extra.nome) x.nome = extra.nome;
      if (num(feito) && num(total) && total > 0) {
        var f = Math.max(0, Math.min(feito, total));
        /* só conta como AVANÇO o que mudou: o vigia de 60 s não pode ser enganado por quem repete o mesmo número */
        if (f !== x.feito || total !== x.total || x.indet) ultimo = agora();
        x.feito = f; x.total = total; x.indet = false;
      } else {
        if (x.indet !== true || novoDet !== x.detalhe) ultimo = agora();
        x.indet = true;
      }
      x.detalhe = novoDet; avisar(); return T;
    };
    T.concluir = function (id) {
      var x = porId[id]; if (!x || T.finalizado) return T;
      ativar(x); x.estado = "ok"; x.indet = false; if (x.medida && x.total) x.feito = x.total; ultimo = agora(); avisar(); return T;
    };
    /* batida de vida: o trabalho continua mas sem número novo (ex.: um passo longo que terminou e começou outro) */
    T.bater = function () { ultimo = agora(); return T; };
    T.finalizar = function () {
      if (T.finalizado) return T;
      for (var k = 0; k < lista.length; k++) { lista[k].estado = "ok"; lista[k].indet = false; if (lista[k].medida && lista[k].total) lista[k].feito = lista[k].total; }
      T.finalizado = true; ultimo = agora(); T._fim = ultimo; avisar(); return T;
    };
    T.falhar = function (msg) { if (T.finalizado) return T; T.erro = String(msg || "erro sem mensagem"); T.finalizado = true; T._fim = agora(); avisar(); return T; };
    T.cancelar = function () {
      if (T.cancelado || T.finalizado) return T;
      T.cancelado = true; T.finalizado = true; T._fim = agora();
      for (var k = 0; k < T._canc.length; k++) { try { T._canc[k](); } catch (e2) { /* ação de cancelar não derruba */ } }
      avisar(); return T;
    };
    T.aoCancelar = function (fn) { T._canc.push(fn); return T; };
    T.ouvir = function (fn) { T._ouv.push(fn); return T; };
    T.ativa = function () { for (var k = 0; k < lista.length; k++) if (lista[k].estado === "ativa") return lista[k]; return null; };

    /* % inteiro 0..100, ou NULL quando a etapa ativa não tem medida. 100 só com tudo concluído (finalizar). */
    T.pct = function () {
      if (T.erro || T.cancelado) { /* mostra onde parou, se der */ }
      var tot = 0, feito = 0, k, x, a = null;
      for (k = 0; k < lista.length; k++) tot += lista[k].peso;
      if (!tot) return null;
      if (T.finalizado && !T.erro && !T.cancelado) return 100;
      for (k = 0; k < lista.length; k++) {
        x = lista[k];
        if (x.estado === "ok") feito += x.peso;
        else if (x.estado === "ativa") { a = x; if (!x.medida || x.indet || !x.total) return null; feito += x.peso * (x.feito / x.total); }
      }
      if (!a && !feito) return 0;
      return Math.min(99, Math.floor(feito / tot * 100));
    };
    T.decorrido = function () { return Math.max(0, (T._fim || agora()) - t0); };
    T.semAvancoHa = function () { return Math.max(0, agora() - ultimo); };
    T.parado = function () { return !T.finalizado && T.semAvancoHa() >= T.limiteParadoMs; };

    /* o texto de uma linha: «Lendo o arquivo 35% · página 3 de 12 · 1,2 MB de 8 MB» */
    T.texto = function () {
      var a = T.ativa(), p = T.pct(), partes = [];
      if (T.erro) return "Não foi possível terminar a leitura";
      if (T.cancelado) return "Leitura cancelada";
      if (T.finalizado) return "Leitura concluída";
      if (!a) return "Preparando…";
      partes.push(a.nome + (p === null ? "" : " " + p + "%"));
      if (a.detalhe) partes.push(a.detalhe);
      else if (!a.indet && a.total) {
        if (a.unidade === "bytes") partes.push(fmtBytes(a.feito) + " de " + fmtBytes(a.total));
        else if (a.unidade === "paginas") partes.push("página " + Math.max(1, Math.min(a.total, Math.ceil(a.feito))) + " de " + a.total);
        else if (a.unidade === "itens") partes.push(a.feito + " de " + a.total);
      }
      return partes.join(" · ");
    };
    T.snap = function () {
      return { pct: T.pct(), texto: T.texto(), decorrido: T.decorrido(), parado: T.parado(), cancelado: T.cancelado, erro: T.erro, fim: T.finalizado, cancelavel: T.cancelavel && !T.finalizado, tamanho: T.tamanho, ativa: (T.ativa() || {}).id || "" };
    };
    return T;
  }

  /* ------------------------------------------------------------ HTML (puro) */
  function html(snap, opts) {
    opts = opts || {};
    var p = snap.pct, indet = p === null || p === undefined, ocup = !snap.fim, h;
    h = '<div class="mor-prog" data-mor-prog="1" style="margin:6px 0">';
    h += '<div data-mor-prog-texto="1" style="font-size:13px"' + (snap.erro ? ' role="alert"' : "") + ">" + esc(snap.texto) + "</div>";
    if (!snap.erro && !snap.cancelado) {
      h += '<div role="progressbar" aria-label="' + esc(opts.rotulo || "Progresso da leitura") + '" aria-valuemin="0" aria-valuemax="100"' + (indet ? "" : ' aria-valuenow="' + p + '"') + ' aria-valuetext="' + esc(snap.texto) + '"' +
        ' style="height:10px;border-radius:5px;background:rgba(128,128,128,.25);overflow:hidden;margin:4px 0;position:relative">' +
        (indet ? '<div data-mor-prog-indet="1" style="height:100%;width:100%;background:repeating-linear-gradient(45deg,rgba(21,101,192,.55) 0 10px,rgba(21,101,192,.25) 10px 20px)"></div>'
          : '<div data-mor-prog-fill="1" style="height:100%;width:' + p + '%;background:#1565c0"></div>') + "</div>";
    }
    h += '<div style="font-size:12px" class="muted">' + esc(fmtTempo(snap.decorrido)) + " decorridos" +
      (snap.cancelavel ? ' <button type="button" class="btn sm ghost" data-mor-prog-cancelar="1">Cancelar</button>' : "") + "</div>";
    if (ocup && snap.parado) h += '<div role="status" data-mor-prog-parado="1" style="font-size:12.5px;color:#8a5a00;margin-top:4px">Ainda trabalhando — arquivos grandes podem levar alguns minutos' + (snap.tamanho ? " (" + esc(fmtBytes(snap.tamanho)) + ")" : "") + ". Não feche a tela.</div>";
    if (snap.erro) h += '<div data-mor-prog-erro="1" style="font-size:12.5px;color:#c62828;margin-top:4px">' + esc(snap.erro) + '<br><b>O que fazer:</b> ' + esc(opts.acao || "tente de novo; se repetir, salve o arquivo em formato mais leve (ou dividido em partes) e escolha-o outra vez.") + "</div>";
    return h + "</div>";
  }

  /* ------------------------------------------------------------ DOM: pinta, repinta a cada 400 ms (tempo e vigia) e liga o Cancelar */
  function montar(el, tr, opts) {
    opts = opts || {};
    if (!el) return { parar: function () {} };
    var tim = null, parou = false;
    function pintar() { try { el.innerHTML = html(tr.snap(), opts); } catch (e) { /* tela sumiu */ } }
    function clique(ev) {
      var t = ev && ev.target;
      if (t && t.getAttribute && t.getAttribute("data-mor-prog-cancelar")) { tr.cancelar(); }
    }
    if (el.addEventListener) el.addEventListener("click", clique);
    var ult = 0;
    tr.ouvir(function () { var n = Date.now(); if (parou) return; if (n - ult >= 100 || tr.finalizado) { ult = n; pintar(); } });
    pintar();
    if (typeof setInterval === "function") tim = setInterval(function () { if (!parou) pintar(); }, 400);
    return {
      /* parar: some o relógio; o chamador decide o que pôr no lugar da barra (resultado ou erro) */
      parar: function () { parou = true; if (tim) clearInterval(tim); if (el.removeEventListener) el.removeEventListener("click", clique); },
      repintar: pintar
    };
  }

  /* ------------------------------------------------------------ leitura de arquivo com progresso (FileReader.onprogress) e cancelamento
     modo: "texto" | "buffer". cb(resultado, erro). O avanço é em BYTES lidos de verdade. */
  function lerArquivo(file, modo, tr, id, cb) {
    var fr = new FileReader(), feito = false;
    function fim(r, e) { if (feito) return; feito = true; cb(r, e); }
    fr.onprogress = function (ev) { if (tr && ev && ev.lengthComputable) tr.avancar(id, ev.loaded, ev.total, { unidade: "bytes" }); };
    fr.onload = function () { if (tr) tr.concluir(id); fim(fr.result, null); };
    fr.onerror = function () { fim(null, "Não consegui ler o arquivo (ele pode estar aberto em outro programa ou sem permissão)."); };
    fr.onabort = function () { fim(null, "cancelado"); };
    if (tr) tr.aoCancelar(function () { try { fr.abort(); } catch (e) { /* já terminou */ } });
    if (tr) tr.avancar(id, 0, file.size || 1, { unidade: "bytes" });
    if (modo === "buffer") fr.readAsArrayBuffer(file); else fr.readAsText(file);
  }

  var MorProgresso = { criar: criar, html: html, montar: montar, lerArquivo: lerArquivo, fmtBytes: fmtBytes, fmtTempo: fmtTempo, LIMITE_PARADO_MS: LIMITE_PARADO_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = MorProgresso;
  global.MorProgresso = MorProgresso;
})(typeof window !== "undefined" ? window : globalThis);
