/* =====================================================================
 * hiddocumentosui.js — a TELA "Gerar documentos" do hidrossanitário e da climatização (fiação fina).
 *
 * Um lugar só, um clique (pedido de 17/10/2026): do modelo e do dimensionamento ATUAL sai, num .zip,
 *   · Memorial de cálculo ÚNICO (todos os sistemas presentes, climatização inclusa);
 *   · Memorial descritivo (especificação por desempenho, peças com ícone);
 *   · Manual de execução e uso (links internos e externos, checklists, uso e manutenção, garantia);
 *   · Planilhas (.xlsx) e as Pranchas (PDF) — o manual aponta para as folhas do PDF que vai junto;
 * em HTML e Word (.docx, js/docx.js com links e marcadores). PDF: o botão "PDF" de cada documento abre a impressão do
 * navegador ("Salvar como PDF" mantém os links ativos) — o app não tem gerador de PDF de HTML, e fingir um seria pior.
 * A lógica é do js/hiddocumentos.js (motor puro); aqui só se junta a entrada, se baixa e se mostra o resumo.
 * Revisão e histórico de revisões ficam por obra no navegador (orcapro:hid:docs:<obra>).
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = typeof document !== "undefined" ? document : null;
  function dep(n) { return global[n] || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(t, k) { try { if (global.UI && UI.toast) UI.toast(t, k || "info"); } catch (e) {} }
  function hoje() { var d = new Date(); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); }   // hid:ok data, número da revisão e tamanho da lista na tela (apresentação)
  var MIME = { html: "text/html;charset=utf-8", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", zip: "application/zip" };
  var U = { ultimo: null, ocupado: false };

  function chave() { var C = dep("HidCalcUI"), em = C && C.dadosEmpresa ? C.dadosEmpresa() : { obra: {} }; return "orcapro:hid:docs:" + String(em.obra.id || em.obra.nome || "obra"); }
  function lerHist() { try { var o = JSON.parse(global.localStorage.getItem(chave()) || "null"); return o && typeof o === "object" ? o : { revisoes: [], portal: "" }; } catch (e) { return { revisoes: [], portal: "" }; } }
  function gravarHist(h) { try { global.localStorage.setItem(chave(), JSON.stringify(h)); } catch (e) {} }

  function baixar(nome, dados, mime) {
    if (!doc) return false;
    try { var bl = new Blob([dados], { type: mime }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; } catch (e) { return false; }   // hid:ok 5 s até soltar a URL
  }
  /* PDF pela impressão do navegador (links continuam ativos no "Salvar como PDF") */
  function abrirPdf(html) {
    var w = null;
    try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (!w) { toast("O navegador bloqueou a janela de impressão. Libere pop-ups para este endereço ou abra o HTML baixado e imprima.", "aviso"); return false; }
    w.document.open(); w.document.write(html.replace("</body>", "<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body>")); w.document.close();   // hid:ok 400 ms até a página assentar
    return true;
  }

  /* --------------------------------------------------------------- a entrada a partir do modelo e do cálculo atual */
  function montarEntrada(cfg) {
    var C = dep("HidCalcUI"), E = C ? C.estado : null;
    if (!C || !E || !E.resultado) return { erro: "Dimensione primeiro: sem resultado não há documento a gerar." };
    if (C.modeloMudou && C.modeloMudou()) return { erro: "O modelo mudou desde o cálculo — clique em Dimensionar de novo antes de gerar os documentos." };
    var em = C.dadosEmpresa ? C.dadosEmpresa() : { d: {}, obra: {}, logo: null }, CC = dep("ClimCalcUI");
    var clima = CC && CC.estado && CC.estado.resultado && Array.isArray(CC.estado.resultado.ambientes) ? CC.estado.resultado : null;
    var PC = dep("HidPecas");
    var en = { resultado: E.resultado, clima: clima, pecas: C.listaMaterial() || [], icones: PC ? PC.iconesEmCache(PC.TAMANHOS[0]) : {}, pranchas: [], arquivoPranchas: "projeto-hidrossanitario.pdf", portal: { url: cfg.portal } };
    var hist = lerHist(), revs = arr(hist.revisoes).filter(function (r) { return r.rev !== cfg.rev; }).concat([{ rev: cfg.rev, data: cfg.data, descricao: cfg.descricao || "Emissão", por: em.d.responsavel || "" }]);
    var op = { obra: { nome: em.obra.nome || "", endereco: em.obra.local || "", cidade: em.obra.cidade || "", proprietario: em.obra.clienteNome || "", contratante: em.obra.clienteNome || "" },
               responsavel: { nome: em.d.responsavel || "", titulo: em.d.titulo || "", crea: em.d.crea || "", empresa: em.d.nome || "", cnpj: em.d.cnpj || "" },
               documento: { numero: cfg.numero || "", revisao: cfg.rev, data: cfg.data }, revisoes: revs, logos: { ra: em.logo || "" }, local: em.obra.cidade || em.obra.local || "",
               materiaisProjeto: C.materiaisProjeto ? C.materiaisProjeto() : null };
    return { en: en, op: op, revs: revs, hist: hist, em: em };
  }

  /* --------------------------------------------------------------- gerar (promessa: { arquivos, resultado, avisos }) */
  function gerar(cfg) {
    cfg = cfg || {};
    var M = dep("HidDocumentos"), X = dep("Docx");
    if (!M) return Promise.reject(new Error("módulo não carregado (js/hiddocumentos.js)"));
    var ent = montarEntrada(cfg);
    if (ent.erro) return Promise.reject(new Error(ent.erro));
    var C = dep("HidCalcUI"), PC = dep("HidPecas"), arquivos = [], avisos = [];
    return new Promise(function (ok) { if (C.comIcones) C.comIcones(PC && PC.TAMANHOS ? PC.TAMANHOS[0] : null, ok); else ok(); }).then(function () {
      if (PC) ent.en.icones = PC.iconesEmCache(PC.TAMANHOS[0]);
      /* pranchas: o manual aponta para as folhas do PDF que vai junto */
      var HP = dep("HidPranchas");
      if (cfg.pranchas !== false && HP && HP.gerar) {
        try {
          var m = C.modeloAtual ? C.modeloAtual() : null, em = ent.em, pr = m ? HP.gerar(C.estado.resultado, { estado: m.estado, avaliarFam: m.avaliarFam }, { pavimentos: C.pavimentos ? C.pavimentos() : [], empresa: em.d && em.d.nome ? em.d : "", responsavel: em.d.responsavel || "", registro: em.d.crea || "", tituloProfissional: em.d.titulo || "", obra: em.obra.nome || "", proprietario: em.obra.clienteNome || "", contratante: em.obra.clienteNome || "", local: em.obra.local || "", logo: em.logo || null, revisao: cfg.rev }) : null;
          if (pr && pr.ok) {
            ent.en.pranchas = pr.folhas.map(function (f) { return { id: f.id, numero: f.numero, titulo: f.titulo }; });
            var pdf = HP.exportar(pr, "pdf");
            if (pdf) arquivos.push({ nome: "projeto-hidrossanitario.pdf", dados: pdf, mime: MIME.pdf, tipo: "pranchas" });
            else avisos.push("pranchas geradas, mas o conversor para PDF (js/svgpdf.js) não está disponível");
          } else avisos.push("pranchas: " + (arr(pr && pr.avisos).join(" ") || "não geradas"));
        } catch (e) { avisos.push("pranchas: " + (e && e.message ? e.message : e)); }
      }
      var R = M.gerar(ent.en, ent.op);
      if (!R.ok && !R.memorial) throw new Error(R.motivo || arr(R.avisos).join("; "));
      avisos = avisos.concat(arr(R.avisos));
      var quais = cfg.documentos || { memorial: true, descritivo: true, manual: true };
      ["memorial", "descritivo", "manual"].forEach(function (k) {
        var d = R[k]; if (!quais[k] || !d || !d.ok) return;
        if (cfg.html !== false) arquivos.push({ nome: d.nome + ".html", dados: d.html, mime: MIME.html, tipo: k, formato: "html" });
        if (cfg.word !== false && X && X.deHtml) {
          try { var w = X.deHtml(d.html, { titulo: d.titulo, corTitulo: "#00406A", corDestaque: "#00406A", fonteTexto: "Segoe UI" }); arquivos.push({ nome: d.nome + ".docx", dados: w.bytes, mime: MIME.docx, tipo: k, formato: "docx" }); if (arr(w.avisos).length) avisos.push(k + " (Word): " + w.avisos[0]); }
          catch (e2) { avisos.push(k + " (Word): " + (e2 && e2.message ? e2.message : e2)); }
        }
      });
      U.ultimo = { resultado: R, arquivos: arquivos, avisos: avisos, cfg: cfg };
      /* planilhas (ExcelJS sob demanda) */
      var P = dep("HidPlanilhas"), XO = typeof global.ExcelOrc !== "undefined" ? global.ExcelOrc : null;
      if (cfg.planilhas === false || !P || !P.escrever || !XO || !XO.ensureExcelJS) { if (cfg.planilhas !== false) avisos.push("planilhas: gerador de planilha não disponível"); return U.ultimo; }
      return new Promise(function (ok) {
        XO.ensureExcelJS(function () {
          var m = C.modeloAtual ? C.modeloAtual() : null, BI = dep("BimInst"), qto = null;
          try { qto = m && BI ? BI.qto(m.estado, m.avaliarFam) : null; } catch (e3) { qto = null; }
          P.escrever(C.estado.resultado, qto, { ExcelJS: global.ExcelJS, familias: m ? arr(m.estado.familias) : [], icones: PC ? PC.iconesEmCache(PC.TAMANHOS[0]) : {} }).then(function (buf) {
            arquivos.push({ nome: "planilhas-hidrossanitario-" + cfg.rev + ".xlsx", dados: new Uint8Array(buf), mime: MIME.xlsx, tipo: "planilhas", formato: "xlsx" }); ok(U.ultimo);
          }, function (er) { avisos.push("planilhas: " + (er && er.message ? er.message : er)); ok(U.ultimo); });
        });
      });
    }).then(function (u) {
      gravarHist({ revisoes: ent.revs, portal: cfg.portal || "" });
      return u;
    });
  }

  /* --------------------------------------------------------------- a tela */
  function corpoHtml() {
    var h = lerHist(), C = dep("HidCalcUI"), E = C ? C.estado : null, ult = arr(h.revisoes)[arr(h.revisoes).length - 1];
    var prox = ult ? "R" + (function (n) { return (n < 10 ? "0" : "") + n; })((parseInt(String(ult.rev).replace(/\D/g, ""), 10) || 0) + 1) : "R00";   // hid:ok data, número da revisão e tamanho da lista na tela (apresentação)
    var CC = dep("ClimCalcUI"), temClima = !!(CC && CC.estado && CC.estado.resultado);
    return '<div data-hid-docs="tela" style="font-size:13px">' +
      (!E || !E.resultado ? '<p class="muted" data-hid-docs="sem-resultado">Dimensione o hidrossanitário primeiro: os documentos saem do modelo e do cálculo atual.</p>' : "") +
      '<p style="margin:0 0 8px">Os documentos saem do modelo e do dimensionamento atual' + (temClima ? " (com a climatização)" : "") + ". Tudo num arquivo .zip; o botão <b>PDF</b> de cada documento abre a impressão (Salvar como PDF mantém os links).</p>" +
      '<fieldset style="border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 10px;margin:0 0 8px"><legend>Documentos</legend>' +
      ['memorial|Memorial de cálculo único (todos os sistemas)', 'descritivo|Memorial descritivo (especificação por desempenho, peças com ícone)', 'manual|Manual de execução e uso (com links, checklists e manutenção)', 'planilhas|Planilhas (.xlsx)', 'pranchas|Pranchas (PDF) — o manual aponta para as folhas'].map(function (x) { var p = x.split("|"); return '<label style="display:block"><input type="checkbox" data-hid-docs-doc="' + p[0] + '" checked> ' + esc(p[1]) + "</label>"; }).join("") + "</fieldset>" +
      '<fieldset style="border:1px solid rgba(127,127,127,.3);border-radius:8px;padding:6px 10px;margin:0 0 8px"><legend>Formatos</legend><label><input type="checkbox" data-hid-docs-fmt="word" checked> Word (.docx)</label> &nbsp; <label><input type="checkbox" data-hid-docs-fmt="html" checked> HTML (abre e imprime em PDF)</label></fieldset>' +
      '<div style="display:grid;grid-template-columns:90px 1fr;gap:6px 10px;align-items:center">' +
      '<label>Nº do doc.</label><input class="input" data-hid-docs-campo="numero" placeholder="ex.: HID-001">' +
      '<label>Revisão</label><input class="input" data-hid-docs-campo="rev" value="' + esc(prox) + '">' +
      '<label>Data</label><input class="input" data-hid-docs-campo="data" value="' + esc(hoje()) + '">' +
      '<label>Descrição</label><input class="input" data-hid-docs-campo="descricao" value="' + esc(ult ? "Revisão" : "Emissão inicial") + '">' +
      '<label>Portal (QR)</label><input class="input" data-hid-docs-campo="portal" placeholder="https://… (opcional: endereço do portal da obra)" value="' + esc(h.portal || "") + '"></div>' +
      (arr(h.revisoes).length ? '<details style="margin-top:8px"><summary>Histórico de revisões (' + h.revisoes.length + ")</summary><table class=\"tbl\"><thead><tr><th>Rev.</th><th>Data</th><th>Descrição</th></tr></thead><tbody>" + h.revisoes.map(function (r) { return "<tr><td>" + esc(r.rev) + "</td><td>" + esc(r.data) + "</td><td>" + esc(r.descricao) + "</td></tr>"; }).join("") + "</tbody></table></details>" : "") +
      '<div data-hid-docs="resumo" style="margin-top:10px"></div></div>';
  }
  function lerCfg(raiz) {
    function v(k) { var e = raiz.querySelector('[data-hid-docs-campo="' + k + '"]'); return e ? String(e.value || "").trim() : ""; }
    function c(sel) { var e = raiz.querySelector(sel); return !!(e && e.checked); }
    var portal = v("portal");
    return { numero: v("numero"), rev: v("rev") || "R00", data: v("data") || hoje(), descricao: v("descricao"), portal: /^https:\/\/\S+$/i.test(portal) ? portal : "",
             documentos: { memorial: c('[data-hid-docs-doc="memorial"]'), descritivo: c('[data-hid-docs-doc="descritivo"]'), manual: c('[data-hid-docs-doc="manual"]') },
             planilhas: c('[data-hid-docs-doc="planilhas"]'), pranchas: c('[data-hid-docs-doc="pranchas"]'), word: c('[data-hid-docs-fmt="word"]'), html: c('[data-hid-docs-fmt="html"]'), portalInvalido: !!portal && !/^https:\/\/\S+$/i.test(portal) };
  }
  function resumoHtml(u) {
    var R = u.resultado, linhas = [];
    ["memorial", "descritivo", "manual"].forEach(function (k) {
      var d = R[k]; if (!d || !d.ok) return;
      var nm = { memorial: "Memorial de cálculo", descritivo: "Memorial descritivo", manual: "Manual de execução e uso" }[k];
      linhas.push("<tr><td><b>" + nm + "</b><br><span class=\"muted\">" + arr(d.secoes).length + " seções · " + (d.links ? arr(d.links.externos).length : 0) + " links externos · " + arr(d.pendencias).length + " pendência(s)</span></td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-hid-docs-pdf="' + k + '">PDF</button> <button class="btn sm ghost" data-hid-docs-baixar="' + k + ':docx">Word</button> <button class="btn sm ghost" data-hid-docs-baixar="' + k + ':html">HTML</button></td></tr>');
    });
    var sit = R.situacao ? String(R.situacao.txt).replace(/<[^>]+>/g, "") : "";
    return '<div data-hid-docs="pronto" style="border:1px solid ' + (R.situacao && R.situacao.ok ? "#2e9e5b" : "#e0a100") + ';border-radius:8px;padding:6px 10px">' +
      "<div><b>Documentos gerados</b> — " + esc(sit) + "</div><table class=\"tbl\" style=\"margin-top:6px\"><tbody>" + linhas.join("") + "</tbody></table>" +
      (u.avisos.length ? '<ul class="muted" style="margin:6px 0 0;font-size:12px">' + u.avisos.slice(0, 6).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") +   // hid:ok data, número da revisão e tamanho da lista na tela (apresentação)
      (R.links && R.links.falhos.length ? '<p class="muted" style="font-size:12px;margin:6px 0 0">' + R.links.falhos.length + " link(s) não conferido(s) saíram como texto e estão nas pendências do documento.</p>" : "") + "</div>";
  }
  function nomeZip(u) { var R = u.resultado, base = (R.memorial && R.memorial.nome) || "documentos"; return base.replace(/^memorial-de-calculo-/, "documentos-hidrossanitario-") + ".zip"; }
  function abrir() {
    if (!global.UI || !UI.modal) return false;
    UI.modal("Gerar documentos — hidrossanitário e climatização", corpoHtml(), [
      { texto: "Gerar documentos", classe: "primary", onClick: function () { acaoGerar(); } },
      { texto: "Fechar", classe: "ghost", onClick: function () { try { UI.fecharModal(); } catch (e) {} } }
    ]);
    var raiz = doc && doc.querySelector('[data-hid-docs="tela"]');
    if (raiz) raiz.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-hid-docs-pdf],[data-hid-docs-baixar]") : null; if (!b || !U.ultimo) return;
      var R = U.ultimo.resultado;
      if (b.hasAttribute("data-hid-docs-pdf")) { var d = R[b.getAttribute("data-hid-docs-pdf")]; if (d && d.html) abrirPdf(d.html); return; }
      var p = b.getAttribute("data-hid-docs-baixar").split(":"), a = U.ultimo.arquivos.filter(function (x) { return x.tipo === p[0] && x.formato === p[1]; })[0];
      if (a) baixar(a.nome, a.dados, a.mime); else toast("Esse formato não foi gerado (marque-o e gere de novo).", "aviso");
    });
    return true;
  }
  function acaoGerar() {
    var raiz = doc && doc.querySelector('[data-hid-docs="tela"]'); if (!raiz || U.ocupado) return null;
    var cfg = lerCfg(raiz), alvo = raiz.querySelector('[data-hid-docs="resumo"]');
    if (cfg.portalInvalido) { alvo.innerHTML = '<p class="muted" style="color:#b45309">O endereço do portal precisa começar com https:// — deixe em branco para sair sem QR.</p>'; return null; }
    U.ocupado = true; alvo.innerHTML = '<p class="muted" data-hid-docs="gerando">Gerando os documentos…</p>';
    return gerar(cfg).then(function (u) {
      U.ocupado = false;
      var X = dep("Docx");
      if (X && X.zip && u.arquivos.length) baixar(nomeZip(u), X.zip(u.arquivos.map(function (a) { return { nome: a.nome, dados: a.dados }; })), MIME.zip);
      alvo.innerHTML = resumoHtml(u);
      try { alvo.scrollIntoView({ block: "nearest" }); } catch (eS) {}
      toast("Documentos gerados: " + u.arquivos.length + " arquivo(s) no .zip.", u.avisos.length ? "aviso" : "ok");
      return u;
    }, function (e) {
      U.ocupado = false;
      alvo.innerHTML = '<p data-hid-docs="erro" style="color:#d33a2c">Não foi possível gerar: ' + esc(e && e.message ? e.message : e) + "</p>";
      return null;
    });
  }

  U.abrir = abrir; U.gerar = gerar; U.acaoGerar = acaoGerar; U.abrirPdf = abrirPdf; U.montarEntrada = montarEntrada;
  global.HidDocumentosUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
