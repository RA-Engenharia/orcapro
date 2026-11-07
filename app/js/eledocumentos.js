/* =====================================================================
 * eledocumentos.js — GERAR DOCUMENTOS ELÉTRICOS: um lugar só, um clique (Elétrica v2, lote L5, 06/11/2026).
 * Motor PURO, ES5, sem DOM, Node-testável. A tela é o js/eledocumentosui.js. Molde: js/hiddocumentos.js.
 *
 *   EleDocumentos.gerar(analise, opcoes) → Promise<{ ok, arquivos[], memorial, planilha, pranchas, pendencias[], avisos[], situacao, resumo[], leiame }>
 *       analise = EleCircuitos.analisar(...)  · o MESMO cálculo para os três documentos
 *       opcoes  = os de ElePlanilhas / EleMemorial / ElePranchas (obra, local, empresa, responsavel, registro, revisao, numero, data, logo, estado,
 *                 avaliarFam, qto, preco …) + { documentos: { memorial, planilha, pranchas }, formatos: { html, word, dxf }, Docx, ExcelJS }
 *   cada arquivo: { nome, dados, mime, tipo: "memorial" | "planilha" | "pranchas" | "leiame", formato }
 *   EleDocumentos.zipar(arquivos) → Uint8Array | null   (js/docx.js, o mesmo zip do hidrossanitário)
 *   EleDocumentos.nomeBase(opcoes) → "eletrico-<obra>-<revisão>"   (sem acento nem barra: serve de nome de arquivo)
 *
 * O PACOTE: memorial (HTML e Word), planilha .xlsx, pranchas (PDF e DXF) e um LEIA-ME com o que ficou PENDENTE — em vermelho o que não
 * pode ser assinado como está (sem fonte lida, a decidir pelo RT, circuito que não atende), em amarelo o que é aviso ou critério RA.
 * ⚠ HONESTO: o pacote nunca diz "pronto" com item vermelho; as pranchas só saem com o projeto gravado no quadro ("Circuitos e quadro"
 *   rodado) e o aviso diz quando não saíram. Cada documento falha sozinho (try/catch) sem derrubar os outros.
 * ⚠ NENHUM VALOR DE NORMA AQUI: tudo vem dos motores (js/elememorial.js, js/eleplanilhas.js, js/elepranchas.js).
 * Teste: node tools/test-ele-documentos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function EM() { return dep("EleMemorial", "./elememorial.js"); }
  function PL() { return dep("ElePlanilhas", "./eleplanilhas.js"); }
  function PR() { return dep("ElePranchas", "./elepranchas.js"); }
  function DX(o) { return (o && o.Docx) || dep("Docx", "./docx.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  var MIME = { html: "text/html;charset=utf-8", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf", dxf: "application/dxf", txt: "text/plain;charset=utf-8", zip: "application/zip" };

  /* nome de arquivo e âncora sem acento ("casa-terrea", não "casa-t-rrea") */
  function slug(s) { var x = txt(s); if (x.normalize) x = x.normalize("NFD").replace(/[̀-ͯ]/g, ""); return x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "obra"; }
  function nomeBase(o) { o = o || {}; return "eletrico-" + slug(o.obra) + "-" + slug(o.revisao || "R00"); }

  function leiame(R, o) {
    var L = [], pend = R.pendencias, v = pend.filter(function (p) { return p.nivel === "vermelho"; }), a = pend.filter(function (p) { return p.nivel !== "vermelho"; });
    L.push("PROJETO ELÉTRICO DE BAIXA TENSÃO — " + (txt(o.obra) || "[OBRA]"));
    L.push((txt(o.numero) ? txt(o.numero) + " " : "") + (txt(o.revisao) || "R00") + " — " + (txt(o.data) || ""));
    L.push("");
    L.push("SITUAÇÃO: " + R.situacao.texto + ".");
    L.push("");
    L.push("ARQUIVOS DESTE PACOTE");
    R.arquivos.forEach(function (f) { if (f.tipo !== "leiame") L.push(" - " + f.nome); });
    arr(R.naoGerados).forEach(function (t) { L.push(" - NÃO GERADO: " + t); });
    L.push("");
    L.push("O QUE FICOU PENDENTE — EM VERMELHO (" + v.length + "): sem fonte lida ou a decidir pelo responsável técnico; o projeto não pode ser assinado como está.");
    v.forEach(function (p, i) { L.push(" " + (i + 1) + ". " + p.texto + (p.secao ? " (seção " + p.secao + " do memorial)" : "")); });
    L.push("");
    L.push("AVISOS E CRITÉRIOS RA — EM AMARELO (" + a.length + "): conferir com o responsável técnico.");
    a.forEach(function (p, i) { L.push(" " + (i + 1) + ". " + p.texto); });
    if (R.avisos.length) { L.push(""); L.push("AVISOS DA GERAÇÃO"); R.avisos.forEach(function (t) { L.push(" - " + t); }); }
    L.push("");
    L.push("RESSALVA DA NORMA: a NBR 5410:2004 foi lida numa cópia de consulta NÃO licenciada à RA Engenharia, edição original SEM a Errata 1/2008. Confira cada valor no exemplar licenciado da edição vigente antes de assinar.");
    return L.join("\r\n") + "\r\n";
  }

  function gerar(A, opc) {
    opc = opc || {};
    var M = EM(), Pl = PL(), Pr = PR(), X = DX(opc), docs = opc.documentos || {}, fmt = opc.formatos || {}, base = nomeBase(opc);
    var R = { ok: false, arquivos: [], memorial: null, planilha: null, pranchas: null, pendencias: [], avisos: [], naoGerados: [], situacao: null, resumo: [], leiame: "" };
    if (!A || !A.ok || !arr(A.circuitos).length) { R.motivo = A && A.motivo ? A.motivo : "Sem circuitos analisados: rode \"Circuitos e quadro\" antes de gerar os documentos."; return Promise.resolve(R); }
    if (!M || !Pl) { R.motivo = "Módulos não carregados (js/elememorial.js, js/eleplanilhas.js)."; return Promise.resolve(R); }
    function usa(k) { return docs[k] !== false; }
    function nao(t) { R.naoGerados.push(t); R.avisos.push(t); }
    /* a lista de materiais é UMA só: o memorial e a planilha leem a mesma */
    var mats = null; try { mats = Pl.materiais(A, opc); } catch (e0) { mats = null; R.avisos.push("lista de materiais: " + (e0 && e0.message ? e0.message : e0)); }
    var o2 = {}; Object.keys(opc).forEach(function (k) { o2[k] = opc[k]; }); if (mats) o2.materiais = mats;
    R.pendencias = M.pendencias(A, o2); R.situacao = M.situacao(R.pendencias);
    /* 1) memorial */
    if (usa("memorial")) {
      try {
        var m = M.gerar(A, o2); R.memorial = m;
        if (!m.ok) nao("memorial: " + m.motivo);
        else {
          if (fmt.html !== false) R.arquivos.push({ nome: "memorial-" + base + ".html", dados: m.html, mime: MIME.html, tipo: "memorial", formato: "html" });
          if (fmt.word !== false && X && X.deHtml) {
            try { var w = X.deHtml(m.html, { titulo: m.titulo, corTitulo: "#0F2740", corDestaque: "#0F2740", fonteTexto: "Segoe UI" }); R.arquivos.push({ nome: "memorial-" + base + ".docx", dados: w.bytes, mime: MIME.docx, tipo: "memorial", formato: "docx" }); arr(w.avisos).forEach(function (t) { R.avisos.push("memorial (Word): " + t); }); }
            catch (e1) { R.avisos.push("memorial (Word): " + (e1 && e1.message ? e1.message : e1)); }
          }
          if (m.indefinidos) R.avisos.push("memorial: " + m.indefinidos + " valor(es) indefinido(s) trocados por [valor indefinido] — conferir.");
        }
      } catch (e2) { nao("memorial: " + (e2 && e2.message ? e2.message : e2)); }
    }
    /* 2) pranchas (síncrono) */
    if (usa("pranchas")) {
      if (!Pr) nao("pranchas: módulo js/elepranchas.js não carregado");
      else if (!A.projetoGravado) nao("pranchas: rode \"Circuitos e quadro\" antes (o projeto fica gravado no quadro) — as pranchas leem o projeto gravado");
      else {
        try {
          var pr = Pr.gerar(A, o2); R.pranchas = pr;
          if (!pr.ok) nao("pranchas: " + (arr(pr.avisos).join(" ") || "não geradas"));
          else {
            var pdf = Pr.exportar(pr, "pdf");
            if (pdf) R.arquivos.push({ nome: "projeto-" + base + ".pdf", dados: pdf, mime: MIME.pdf, tipo: "pranchas", formato: "pdf" }); else R.avisos.push("pranchas: o conversor para PDF (js/svgpdf.js) não está disponível");
            if (fmt.dxf !== false) { var dxf = Pr.exportar(pr, "dxf"); if (dxf) R.arquivos.push({ nome: "projeto-" + base + ".dxf", dados: dxf, mime: MIME.dxf, tipo: "pranchas", formato: "dxf" }); else R.avisos.push("pranchas: o DXF não foi gerado (js/bimdxf.js)"); }
            arr(pr.avisos).forEach(function (t) { R.avisos.push("pranchas: " + t); });
            if (pr.verificacao && pr.verificacao.sobreposicoes) R.avisos.push("pranchas: " + pr.verificacao.sobreposicoes + " texto(s) sobreposto(s) — conferir antes de emitir");
          }
        } catch (e3) { nao("pranchas: " + (e3 && e3.message ? e3.message : e3)); }
      }
    }
    /* 3) planilha (assíncrona: ExcelJS escreve em buffer) */
    function fim() {
      R.ok = R.arquivos.length > 0;
      R.resumo = [];
      if (R.memorial && R.memorial.ok) R.resumo.push("Memorial: " + R.memorial.secoes.length + " seções, " + R.pendencias.length + " pendência(s) (" + R.situacao.vermelhos + " em vermelho)");
      if (R.planilha && R.planilha.ok) R.resumo.push("Planilha: " + R.planilha.abas.length + " abas, " + R.planilha.formulas + " fórmulas, " + arr(mats).length + " linhas de material (" + arr(mats).filter(function (x) { return x.situacao === "pendente"; }).length + " sem código SINAPI)");
      if (R.pranchas && R.pranchas.ok) R.resumo.push("Pranchas: " + R.pranchas.folhas.length + " folha(s)");
      R.leiame = leiame(R, opc);
      R.arquivos.push({ nome: "LEIA-ME-" + base + ".txt", dados: R.leiame, mime: MIME.txt, tipo: "leiame", formato: "txt" });
      return R;
    }
    if (!usa("planilha")) return Promise.resolve(fim());
    var o3 = {}; Object.keys(o2).forEach(function (k) { o3[k] = o2[k]; }); if (opc.ExcelJS) o3.ExcelJS = opc.ExcelJS;
    var go = Pl.gerar(A, o3);
    R.planilha = go;
    if (!go.ok) { nao("planilha: " + go.motivo); return Promise.resolve(fim()); }
    return go.workbook.xlsx.writeBuffer().then(function (buf) {
      R.arquivos.push({ nome: "planilhas-" + base + ".xlsx", dados: new Uint8Array(buf), mime: MIME.xlsx, tipo: "planilha", formato: "xlsx" });
      arr(go.avisos).forEach(function (t) { R.avisos.push("planilha: " + t); });
      return fim();
    }, function (er) { nao("planilha: " + (er && er.message ? er.message : er)); return fim(); });
  }
  function zipar(arquivos, opc) {
    var X = DX(opc); if (!X || !X.zip) return null;
    return X.zip(arr(arquivos).map(function (f) { return { nome: f.nome, dados: f.dados }; }));
  }

  var EleDocumentos = { VERSAO: 1, gerar: gerar, zipar: zipar, nomeBase: nomeBase, leiame: leiame, MIME: MIME };
  global.EleDocumentos = EleDocumentos;
  if (typeof module !== "undefined" && module.exports) module.exports = EleDocumentos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
