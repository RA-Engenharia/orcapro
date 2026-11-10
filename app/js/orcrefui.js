/* =====================================================================
 * orcrefui.js — FIAÇÃO do pacote do orçamento de referência (leva G2, 10/11/2026)
 *
 * O motor é js/orcref.js (puro) + js/orcrefxls.js. Aqui só: pergunta os poucos dados que o orçamento não tem
 * (tipo de obra para a faixa do BDI, recurso federal, ART/RRT, responsável), mostra as pendências ANTES de gerar e
 * baixa PDF + XLSX. O CPLPRO chama `OrcamentoReferencia.baixar(orc, opcoes)` direto, sem esta tela.
 * ⚠ Não grava nada no orçamento: as respostas ficam só neste navegador (localStorage, por orçamento), em try/catch.
 * ES5 de propósito.
 * ===================================================================== */
(function (global) {
  "use strict";
  var CH = "orcapro:orcref:";
  function s(v) { return String(v == null ? "" : v).trim(); }
  function esc(v) { return s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function lerSalvo(id) { try { return JSON.parse(global.localStorage.getItem(CH + id) || "{}") || {}; } catch (e) { return {}; } }
  function gravarSalvo(id, o) { try { global.localStorage.setItem(CH + id, JSON.stringify(o)); } catch (e) {} }
  function el(id) { return global.document ? global.document.getElementById(id) : null; }
  function val(id) { var e = el(id); return e ? s(e.value) : ""; }

  /* opções de montar() a partir do que a conta já sabe + o que a pessoa respondeu */
  function opcoesDe(orc, f) {
    var emp = (global.Empresa && global.Empresa.dados) ? global.Empresa.dados() : {};
    try { if (global.Empresa && global.Empresa.logo && global.Empresa.logo() && !emp.timbradoTopo) emp.timbradoTopo = global.Empresa.logo(); } catch (e) {}
    var bases = [];
    try { bases = (global.Bases && global.Bases.lista) ? global.Bases.lista() : []; } catch (e2) { bases = []; }
    return {
      empresa: emp, bases: bases, tipoObra: f.tipoObra || "", recursoFederal: !!f.recursoFederal, processo: f.processo || "",
      responsavel: { nome: f.rtNome || s(emp.rtNome) || s(emp.responsavel), titulo: s(emp.titulo), registro: f.rtReg || s(emp.rtCrea) || s(emp.crea) },
      art: { tipo: f.artTipo || "ART", numero: f.artNum || "" }
    };
  }

  function listaHtml(tit, a, cor) {
    return a.length ? '<h4 style="margin:10px 0 4px;font-size:13px;color:' + cor + '">' + tit + ' (' + a.length + ')</h4><ul style="margin:0 0 0 18px;font-size:12.5px">' +
      a.slice(0, 12).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + (a.length > 12 ? '<li>e mais ' + (a.length - 12) + '…</li>' : '') + '</ul>' : "";
  }

  function lerForm() {
    var e = el("orcref-fed");
    return { tipoObra: val("orcref-tipo"), recursoFederal: !!(e && e.checked), processo: val("orcref-proc"), rtNome: val("orcref-rt"), rtReg: val("orcref-reg"), artTipo: val("orcref-arttipo"), artNum: val("orcref-art") };
  }

  function abrir(orc) {
    var UI = global.UI, OR = global.OrcamentoReferencia;
    if (!orc || !OR || !UI) return;
    var salvo = lerSalvo(orc.id), emp = (global.Empresa && global.Empresa.dados) ? global.Empresa.dados() : {};
    var tipos = global.Bdi.FAIXAS_TCU;
    var opt = '<option value="">(escolha o tipo de obra)</option>' + Object.keys(tipos).map(function (k) { return '<option value="' + k + '"' + (salvo.tipoObra === k ? " selected" : "") + '>' + esc(tipos[k].label) + '</option>'; }).join("");
    function campo(rot, id, v) { return '<label style="display:block;margin:6px 0"><span style="font-size:12px;color:#64748b">' + rot + '</span><input id="' + id + '" value="' + esc(v) + '" style="width:100%"></label>'; }
    var corpo = '<p style="font-size:13px;margin-top:0">Gera o <b>orçamento de referência</b> no padrão que o órgão público precisa: sintética, analítica, BDI, encargos, curva ABC de serviços e de insumos, cronograma físico-financeiro, memória de cálculo, mapa de cotação, declarações e (com recurso da União) a aba para a CAIXA. PDF em A4 e Excel com fórmulas vivas.</p>' +
      '<label style="display:block;margin:6px 0"><span style="font-size:12px;color:#64748b">Tipo de obra (define a faixa do BDI do Acórdão TCU 2.622/2013)</span><select id="orcref-tipo" style="width:100%">' + opt + '</select></label>' +
      '<label style="display:block;margin:8px 0"><input type="checkbox" id="orcref-fed"' + (salvo.recursoFederal ? " checked" : "") + '> Obra com recurso da União (repasse): exige SINAPI e monta a aba CAIXA</label>' +
      campo("Processo / edital", "orcref-proc", salvo.processo || "") +
      campo("Responsável técnico pelo orçamento", "orcref-rt", salvo.rtNome || s(emp.rtNome) || s(emp.responsavel)) +
      campo("Registro profissional (CREA/CAU)", "orcref-reg", salvo.rtReg || s(emp.rtCrea) || s(emp.crea)) +
      '<div style="display:flex;gap:8px"><label style="flex:0 0 90px"><span style="font-size:12px;color:#64748b">Tipo</span><select id="orcref-arttipo" style="width:100%"><option>ART</option><option' + (salvo.artTipo === "RRT" ? " selected" : "") + '>RRT</option></select></label>' +
      '<div style="flex:1">' + campo("Número da ART/RRT do orçamento", "orcref-art", salvo.artNum || "") + '</div></div>' +
      '<div id="orcref-pend" style="margin-top:8px"></div>';
    function mostrarPend() {
      var f = lerForm(), r = OR.montar(orc, opcoesDe(orc, f)), box = el("orcref-pend");
      if (!box) return r;
      if (!r.ok) box.innerHTML = '<div style="border:1px solid #c00000;color:#c00000;padding:8px;font-size:12.5px"><b>O pacote não pode sair assim:</b> ' + esc(r.erro) + '</div>';
      else box.innerHTML = (r.dados.pronto ? '<div style="color:#1a7f37;font-size:12.5px"><b>Sem pendências que impeçam publicar.</b></div>' : '<div style="color:#c00000;font-size:12.5px"><b>Com pendências: o arquivo sai marcado "NÃO PUBLICAR".</b></div>') +
        listaHtml("Em aberto", r.pendencias.bloqueios, "#c00000") + listaHtml("Conferir", r.pendencias.conferir, "#b45309");
      return r;
    }
    UI.modal("Orçamento de referência — pacote da prefeitura", corpo, [
      { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Conferir pendências", classe: "ghost", onClick: function () { mostrarPend(); } },
      { texto: "Baixar PDF e Excel", classe: "primary", onClick: function () {
          var f = lerForm(); gravarSalvo(orc.id, f);
          var r = mostrarPend();
          if (!r.ok) { UI.toast(r.erro, "erro"); return; }
          UI.toast("Montando o pacote…", "ok");
          OR.baixar(orc, opcoesDe(orc, f)).then(function (res) {
            UI.toast("Pacote gerado: " + res.saidas.map(function (x) { return x.formato.toUpperCase() + (x.paginas ? " (" + x.paginas + " pág.)" : ""); }).join(" e ") + (res.dados.pronto ? "." : ". Atenção: há pendências, o arquivo sai marcado NÃO PUBLICAR."), res.dados.pronto ? "ok" : "aviso");
          }, function (e) { UI.toast("Não consegui gerar o pacote: " + (e && e.message ? e.message : e), "erro"); });
        } }
    ]);
    mostrarPend();
  }

  global.OrcRefUI = { abrir: abrir, opcoesDe: opcoesDe };
  if (typeof module !== "undefined" && module.exports) module.exports = global.OrcRefUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
