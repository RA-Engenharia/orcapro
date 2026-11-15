/* =====================================================================
 * mor/ifcui.js — FIAÇÃO FINA do «Orçar pelo modelo» (F13 do MOR, ESPEC §16.5) — prévia `?previa=motor`
 *
 * A regra mora em js/mor/ifcler.js + ifcorc.js (puros e testados: tools/test-mor-ifc.js); aqui só há tela:
 *   1. o botão «Orçar pelo modelo» no quantitativo do BIM (só com a prévia ligada);
 *   2. a configuração (padrão baixo/médio/alto, arquivo .ifc ou as peças já abertas no BIM, parâmetros que a PESSOA informa);
 *   3. a CONFERÊNCIA: linhas por etapa, cor pela origem — VERDE medido · AMARELO implícito/sugerido/estimado · VERMELHO
 *      pendente —, «Por quê?» com o(s) elemento(s) de origem (clique destaca no 3D), OK / OK todos da etapa;
 *   4. o lançamento: SÓ entra o que está marcado; implícito, sugerido e estimado só ficam marcados depois do OK.
 * ⚠ Nada grava sem a pessoa: abrir, ler e conferir não mexem em orçamento. Lançar é o ato final, e é idempotente
 *   (MorManual.inserir pula a regra que já está na etapa).
 * ⚠ Respeita o bimorc.js: não vincula sozinho por parecença, não converte unidade, mostra a fonte da quantidade
 *   (estimado ≠ medido) e não muda orçamento aprovado.
 * Os builders de HTML são puros e testáveis em Node; os que tocam DOM/Store/UI só rodam no navegador.
 * F6 (projeto): com o js/projorc.js carregado, aceita VÁRIOS arquivos — .ifc, .dxf, .pdf (arquitetura vetorial e elétrico
 *   pelo texto) e .dwg (só o aviso de exportar DXF) — e roda o pipeline num clique (triagem → extratores → junção →
 *   ifcorc). A conferência ganha o painel «O que foi lido» por arquivo e a prévia 2D (SVG) de cada planta.
 * ===================================================================== */
(function (global) {
  "use strict";

  function mod(g, caminho) { if (global[g]) return global[g]; if (typeof require === "function") { try { return require(caminho); } catch (e) { return null; } } return null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f2(x) { return String(Math.round((Number(x) || 0) * 100) / 100).replace(".", ","); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }

  var COR = { medido: "#2e7d32", estimado: "#b26a00", implicito: "#b26a00", sugerido: "#b26a00", pendente: "#c62828" };
  var ROTULO = { medido: "medido", estimado: "estimado", implicito: "implícito", sugerido: "sugerido", pendente: "pendente" };
  var DICA = {
    medido: "Verde: a quantidade está no IFC (Qto do arquivo).",
    estimado: "Amarelo: o IFC não trouxe o Qto — estimado pela geometria simples do arquivo. Estimado não vale como medido: confira.",
    implicito: "Amarelo: o modelo não desenha, mas a obra consome — só entra com o seu OK.",
    sugerido: "Amarelo: padrão do orçamento ou taxa do catálogo — só entra com o seu OK.",
    pendente: "Vermelho: falta medida, composição ou parâmetro — o motivo está na linha."
  };

  function pilula(origem) { return '<span title="' + esc(DICA[origem] || "") + '" style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11.5px;font-weight:600;color:#fff;background:' + (COR[origem] || "#666") + '">' + esc(ROTULO[origem] || origem) + "</span>"; }

  /* a linha entra marcada de saída? só o que é medido com código e quantidade — o resto espera o OK */
  function marcadaDeSaida(l) { return l.origem === "medido" && l.estado === "ok" && l.codigo && l.quantidade > 0; }
  function podeMarcar(l) { return l.estado === "ok" && !!l.codigo && l.quantidade > 0; }

  var MorIfcUI = {
    _st: null,
    COR: COR,

    ativo: function () { var U = mod("MorUI", "./ui.js"); return !!(U && U.ativo && U.ativo()); },
    botaoHtml: function () {
      if (!MorIfcUI.ativo()) return "";
      return '<button class="btn sm" id="mor-ifc-orcar" title="Lê o modelo inteiro (todas as disciplinas) e monta o orçamento completo: medido, implícito, sugerido e pendente — você confere e dá OK antes de entrar (prévia)">' + (typeof Icones !== "undefined" ? Icones.get("calc", 15) : "") + " Orçar pelo modelo</button>";
    },

    /* ---------------- builders puros ---------------- */

    htmlConfiguracao: function (temViewer, pre) {
      return '<div id="mor-ifc-cfg">' +
        (arr(pre).length ? '<p data-mor-ifc-pre="1" style="margin:0 0 8px;font-size:12.5px"><b>Arquivo já escolhido:</b> ' + arr(pre).map(function (x) { return esc(x.name); }).join(", ") + ' <span class="muted">(vindo do leitor de documento — para trocar, escolha outro abaixo)</span></p>' : "") +
        '<p class="muted" style="margin:0 0 8px;font-size:12.5px">Lê o IFC inteiro e orça o que o modelo mostra <b>e o que a obra consome sem estar desenhado</b> (chapisco, fôrma, impermeabilização…). Cada linha diz de onde veio; <b>nada implícito entra sem o seu OK</b>.</p>' +
        '<div class="field"><label for="mor-ifc-padrao">Padrão do orçamento</label><select id="mor-ifc-padrao"><option value="baixo">Baixo (popular)</option><option value="medio" selected>Médio (normal)</option><option value="alto">Alto</option></select>' +
        '<span class="muted" style="font-size:12px">O padrão só escolhe o material onde o IFC não diz; o material informado no IFC vence.</span></div>' +
        (MorIfcUI.projeto()
          ? '<div class="field"><label for="mor-ifc-arq">Arquivos do projeto</label><input type="file" id="mor-ifc-arq" accept=".ifc,.dxf,.pdf,.dwg" multiple aria-label="Arquivos do projeto (IFC, DXF, PDF)">' +
            '<span class="muted" style="font-size:12px">Solte de uma vez o IFC, os DXF e os PDF (arquitetura, elétrico). O sistema decide a disciplina, a escala e o pavimento sozinho; o que não reconhecer fica fora do orçamento, contado. DWG: exporte em DXF.</span>'
          : '<div class="field"><label for="mor-ifc-arq">Arquivo IFC</label><input type="file" id="mor-ifc-arq" accept=".ifc" aria-label="Arquivo IFC">') +
        (temViewer ? ' <span class="muted" style="font-size:12px">ou deixe em branco para usar as peças já abertas no BIM (leitura parcial: sem Psets, camadas nem ambientes).</span>' : "") + "</div>" +
        '<details><summary><b>Parâmetros que o IFC não traz</b> <span class="muted" style="font-weight:400">(em branco = o item fica pendente)</span></summary>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' +
        MorIfcUI._campo("mor-ifc-p-profEsc", "Profundidade escavada das fundações (m)") + MorIfcUI._campo("mor-ifc-p-folga", "Folga de trabalho da cava (m)") + MorIfcUI._campo("mor-ifc-p-dmt", "Distância ao bota-fora (km)") +
        MorIfcUI._campo("mor-ifc-p-espSuporte", "Espaçamento entre suportes de tubo (m)") + MorIfcUI._campo("mor-ifc-p-empolamento", "Empolamento do solo (0,25 = 25 %; padrão 0,25)") + "</div></details>" +
        '<div id="mor-ifc-res" aria-live="polite" style="margin-top:10px"></div></div>';
    },
    /* o pipeline de projeto (DXF/PDF) está carregado? */
    projeto: function () { return !!mod("ProjOrcar", "../projorc.js"); },

    /* painel «O que foi lido» por arquivo + prévia 2D de cada planta (puro) */
    htmlLido: function (lidos) {
      var PO = mod("ProjOrcar", "../projorc.js");
      return '<details open id="mor-proj-lido" style="margin-bottom:8px"><summary style="font-size:13px"><b>O que foi lido</b> (' + arr(lidos).length + ' arquivo(s))</summary>' + arr(lidos).map(function (l) {
        var r = l.resumo || {}, el = r.eletrica || {}, h = '<div class="card" data-proj-arquivo="' + esc(l.arquivo) + '" style="margin:6px 0;padding:8px;font-size:12.5px"><b>' + esc(l.arquivo) + '</b> <span class="muted">(' + esc(String(l.tipo).toUpperCase()) + ")</span>";
        if (l.erro) h += '<div data-proj-erro="1" style="color:#c62828;margin-top:4px">' + esc(l.erro) + "</div>";
        if (arr(l.disciplinas).length) h += '<div style="margin-top:4px"><b>Disciplina:</b> ' + esc(l.disciplinas.join(", ")) + ' <span class="muted">— ' + esc(String(l.porqueDisciplina).slice(0, 300)) + "</span></div>";
        if (l.escala) h += "<div><b>Escala/fator:</b> " + esc(l.escala) + (l.escalaComo ? ' <span class="muted">— ' + esc(l.escalaComo) + "</span>" : "") + "</div>";
        if (arr(l.pavimentos).length) h += "<div><b>Pavimentos:</b> " + esc(l.pavimentos.join(" · ")) + "</div>";
        if (l.tipo !== "ifc" && l.resumo) {
          var esps = Object.keys(r.paredePorEsp || {}).map(function (k) { return f2(r.paredePorEsp[k]) + " m de " + k; });
          var lou = Object.keys(r.loucas || {}).map(function (k) { return r.loucas[k] + " " + k; });
          h += '<div data-proj-contagens="1"><b>Contagens:</b> parede ' + (esps.length ? esps.join(", ") : "0 m") + " · " + r.portas + " porta(s) · " + r.janelas + " janela(s) · " + r.ambientes + " ambiente(s)" + (r.ambientesSemNome ? " (" + r.ambientesSemNome + " sem nome)" : "") + (r.ambientesPendentes ? ' <span style="color:#c62828">(' + r.ambientesPendentes + " pendente(s))</span>" : "") +
            " · louças: " + (lou.length ? lou.join(", ") : "0") + " · elétrica: " + el.luz + " luz, " + el.tomadas + " tomada(s), " + el.quadros + " quadro(s), " + el.disjuntores + " disjuntor(es)</div>";
        }
        if (arr(l.avisos).length) h += '<ul style="margin:4px 0 0 18px;color:#8a5a00">' + l.avisos.slice(0, 12).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + (l.avisos.length > 12 ? "<li>… e mais " + (l.avisos.length - 12) + "</li>" : "") + "</ul>";
        if (PO && arr(l.plantas).length) h += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">' + l.plantas.slice(0, 8).map(function (p) { return '<figure style="margin:0;flex:1 1 300px"><figcaption class="muted" style="font-size:11.5px">' + esc(p.nome) + ' — <span style="color:#d32f2f">parede</span> · <span style="color:#2e7d32">porta</span> · <span style="color:#1565c0">janela</span></figcaption>' + PO.svgPlanta(p, { largura: 520 }) + "</figure>"; }).join("") + "</div>";
        return h + "</div>";
      }).join("") + "</details>";
    },

    _campo: function (id, rot) { return '<div class="field" style="min-width:210px"><label for="' + id + '">' + esc(rot) + '</label><input type="text" inputmode="decimal" id="' + id + '" style="width:100%"></div>'; },

    /* cabeçalho de cobertura (o que foi lido, o que não tem regra) */
    htmlCobertura: function (res) {
      var c = res.cobertura; if (!c) return "";
      var h = '<div class="muted" style="font-size:12.5px;margin-bottom:6px"><b>Leitura do modelo:</b> ' + c.lidos + " elemento(s) lido(s) → <b>" + c.classificados + "</b> classificado(s), <b>" + c.semRegra.length + "</b> sem regra" +
        (c.completa ? " <span style=\"color:#2e7d32\">(nada foi descartado em silêncio)</span>" : ' <span style="color:#c62828">(a contagem não fecha — avise o suporte)</span>') + ". Ambientes (IfcSpace): " + c.ambientes + ".</div>";
      if (c.semRegra.length) h += '<details style="margin-bottom:6px"><summary style="font-size:12.5px"><b>' + c.semRegra.length + ' elemento(s) sem regra</b> (não entram no orçamento; decida caso a caso)</summary><ul style="margin:4px 0 0 18px;font-size:12px">' +
        c.semRegra.slice(0, 80).map(function (s) { return "<li>" + esc(s.classe) + (s.predef ? " " + esc(s.predef) : "") + " «" + esc(s.nome) + "»" + (s.material ? " [" + esc(s.material) + "]" : "") + " — " + esc(s.motivo) + "</li>"; }).join("") + (c.semRegra.length > 80 ? "<li>… e mais " + (c.semRegra.length - 80) + "</li>" : "") + "</ul></details>";
      return h;
    },

    /* A conferência inteira. st = { res, marcadas:{id:true}, aceitos:{id:true} } */
    htmlConferencia: function (st) {
      var res = st.res, h = st.lidos ? MorIfcUI.htmlLido(st.lidos) : "";
      var nNao = res.cobertura && res.cobertura.naoReconhecidos;
      if (st.lidos) h += '<div data-proj-naorec="' + (nNao || 0) + '" style="margin:6px 0;font-size:12.5px;color:' + (nNao ? "#c62828" : "#2e7d32") + '"><b>Não reconhecido: ' + (nNao || 0) + " item(ns)</b> — fora do orçamento" + (nNao ? " (lista em «sem regra», abaixo)" : "") + "</div>";
      if (st.lidos && st.modeloProj && mod("ProjModelar", "../projmodelar.js")) h += '<div style="margin:6px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn" data-proj-modelar="1" title="Cria no BIM as paredes (cortadas nos vãos pelas portas e janelas), as louças e os pavimentos — tudo numa operação só: Ctrl+Z desfaz">Modelar no 3D</button><span id="mor-proj-modelado" class="muted" style="font-size:12.5px">' + (st.modelado ? esc(st.modelado.texto) : "") + "</span></div>";
      h += MorIfcUI.htmlCobertura(res);
      var ct = res.contagem || {};
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0">' + ["medido", "estimado", "implicito", "sugerido", "pendente"].map(function (o) { return pilula(o) + " <b>" + (ct[o] || 0) + "</b>"; }).join(" &nbsp; ") + "</div>";
      arr(res.premissas).length && (h += '<details style="margin-bottom:6px"><summary style="font-size:12.5px"><b>Premissas</b> (' + res.premissas.length + ')</summary><ul style="margin:4px 0 0 18px;font-size:12px">' + res.premissas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></details>");
      res.etapas.forEach(function (et) {
        var rs = global.MorIfcOrc ? global.MorIfcOrc.resumoEtapa(et) : {};
        h += '<div class="card" style="margin:8px 0;padding:8px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1">' + esc(et.nome) + '</b>' +
          ["medido", "estimado", "implicito", "sugerido", "pendente"].filter(function (o) { return rs[o]; }).map(function (o) { return pilula(o) + " " + rs[o]; }).join(" ") +
          ' <button type="button" class="btn sm" data-mor-ifc-okEtapa="' + esc(et.id) + '" title="Dá OK em todas as linhas desta etapa que têm código e quantidade">OK todos da etapa</button></div>' +
          '<div style="overflow:auto"><table class="tbl" style="width:100%"><thead><tr><th style="width:28px"></th><th>Origem</th><th>Serviço</th><th>Un</th><th class="num">Qtd</th><th></th></tr></thead><tbody>' +
          et.linhas.map(function (l) {
            var marc = !!st.marcadas[l.id], pode = podeMarcar(l), aceito = !!st.aceitos[l.id];
            var fonte = l.qtdFonte ? ' <span class="muted" style="font-size:11px" title="Fonte da quantidade: ifc = Qto do arquivo; estimado = geometria simples; misto = os dois">(' + esc(l.qtdFonte) + ")</span>" : "";
            return '<tr data-mor-ifc-linha="' + esc(l.id) + '"' + (l.estado === "pendente" ? ' style="background:rgba(198,40,40,.06)"' : "") + '><td><input type="checkbox" data-mor-ifc-marca="' + esc(l.id) + '"' + (marc ? " checked" : "") + (pode ? "" : " disabled") + ' aria-label="Lançar esta linha"></td>' +
              "<td>" + pilula(l.origem) + (aceito ? ' <span title="OK dado" style="color:#2e7d32">✓</span>' : "") + "</td>" +
              "<td>" + esc(l.descricao) + (l.codigo ? ' <span class="muted" style="font-size:11px">' + esc(l.codigo) + "</span>" : "") + (l.erro ? '<br><span style="font-size:11.5px;color:#c62828">' + esc(l.erro) + "</span>" : "") + "</td>" +
              "<td>" + esc(l.unidade) + '</td><td class="num">' + f2(l.quantidade) + fonte + '</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-mor-ifc-porque="' + esc(l.id) + '">Por quê?</button>' +
              (pode && !aceito && l.origem !== "medido" ? ' <button type="button" class="btn sm" data-mor-ifc-ok="' + esc(l.id) + '">OK</button>' : "") + "</td></tr>";
          }).join("") + "</tbody></table></div></div>";
      });
      var inc = arr(res.incluidos);
      if (inc.length) h += '<details style="margin:8px 0"><summary style="font-size:12.5px"><b>Já incluso na composição — NÃO lançado (' + inc.length + ")</b> (evita dupla contagem)</summary><ul style=\"margin:4px 0 0 18px;font-size:12px\">" +
        inc.map(function (i) { return "<li><b>" + esc(i.rotulo || i.regra) + "</b>" + (i.tipo === "modelado" ? " (já modelado no IFC)" : "") + " — " + esc(i.motivo) + "</li>"; }).join("") + "</ul></details>";
      var faltas = arr(res.faltas);
      h += '<div class="card" style="margin:8px 0;padding:8px"><b>Checklist de completude por disciplina</b> <span class="muted" style="font-size:12px">(par obrigatório: o que costuma faltar)</span>' +
        (faltas.length ? '<ul style="margin:4px 0 0 18px;font-size:12.5px">' + faltas.map(function (f) { return '<li style="color:#c62828"><b>' + esc(f.disciplina) + ":</b> " + esc(f.aviso) + "</li>"; }).join("") + "</ul>" : '<p style="margin:4px 0 0;color:#2e7d32;font-size:12.5px">Todos os pares obrigatórios fecham.</p>') + "</div>";
      var sm = arr(res.semMedida);
      if (sm.length) h += '<details style="margin:8px 0"><summary style="font-size:12.5px"><b>Regras que não puderam ser avaliadas por falta de medida no IFC (' + sm.length + ")</b></summary><ul style=\"margin:4px 0 0 18px;font-size:12px\">" + sm.map(function (s) { return "<li>" + esc(s.regra) + " — " + esc(s.erro) + " (" + s.elementos.length + " elemento(s))</li>"; }).join("") + "</ul></details>";
      return h;
    },

    htmlPorque: function (l) {
      var P = global.MorPorque || mod("MorPorque", "./porque.js"), x = P ? P.explicar(l) : { tem: false };
      var h = '<div style="font-size:13px">' + pilula(l.origem) + ' <b>' + esc(l.descricao) + "</b>" + (l.codigo ? ' <span class="muted">(' + esc(l.codigo) + ")</span>" : "") + "<br>";
      if (l.mor && l.mor.porque) h += '<p style="margin:8px 0 4px"><b>Por quê:</b> ' + esc(l.mor.porque) + "</p>";
      h += "<p style=\"margin:4px 0\"><b>Conta:</b> " + esc((x && x.formulaNumeros) || l.formula || "") + (l.quantidade ? " → <b>" + f2(l.quantidade) + " " + esc(l.unidade) + "</b>" : "") + "</p>";
      h += '<p style="margin:4px 0"><b>Regra:</b> ' + esc((l.mor && l.mor.regra) || "") + (l.mor && l.mor.ifc && l.mor.ifc.origemRegra ? " — origem: " + esc(l.mor.ifc.origemRegra.tipo) + " (" + esc(l.mor.ifc.origemRegra.ref) + ")" : "") + "</p>";
      if (l.formula) h += '<p style="margin:4px 0" class="muted">' + esc(l.formula) + "</p>";
      if (l.qtdFonte) h += '<p style="margin:4px 0"><b>Fonte da quantidade:</b> ' + esc(l.qtdFonte) + (l.qtdFonte === "estimado" || l.qtdFonte === "misto" ? " — estimado pela geometria simples do arquivo; <b>não é medida do modelo</b>" : " — Qto do arquivo IFC") + "</p>";
      if (l.mor && arr(l.mor.premissas).length) h += '<p style="margin:4px 0"><b>Premissas:</b></p><ul style="margin:0 0 0 18px">' + l.mor.premissas.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
      if (l.erro) h += '<p style="margin:4px 0;color:#c62828"><b>Pendência:</b> ' + esc(l.erro) + "</p>";
      h += '<p style="margin:8px 0 2px"><b>Elemento(s) de origem</b> (' + arr(l.elementos).length + "):</p><ul style=\"margin:0 0 0 18px;max-height:180px;overflow:auto\">" +
        arr(l.elementos).slice(0, 40).map(function (e) { var o = MorIfcUI._st && MorIfcUI._st.origemPorId && MorIfcUI._st.origemPorId[e.id]; return "<li>" + esc(e.classe) + " «" + esc(e.nome) + "»" + (o ? ' <span class="muted" data-proj-origem="1">— ' + esc(o.arquivo) + ", " + esc(o.folha) + (o.vista ? ", " + esc(o.vista) : "") + " (" + esc(o.disciplina) + ")</span>" : "") + "</li>"; }).join("") + (arr(l.elementos).length > 40 ? "<li>…</li>" : "") + "</ul>";
      return h + "</div>";
    },

    /* ---------------- DOM / Store / UI (só no navegador) ---------------- */

    _num: function (id) {
      var el = typeof document !== "undefined" ? document.getElementById(id) : null; if (!el) return undefined;
      var v = String(el.value || "").trim().replace(",", "."); if (!v) return undefined;
      var n = Number(v); return isFinite(n) && n >= 0 ? n : undefined;
    },
    _params: function () {
      var p = {}, k, ids = { profEsc: "mor-ifc-p-profEsc", folga: "mor-ifc-p-folga", dmt: "mor-ifc-p-dmt", espSuporte: "mor-ifc-p-espSuporte", empolamento: "mor-ifc-p-empolamento" };
      for (k in ids) { var v = MorIfcUI._num(ids[k]); if (v !== undefined && (k !== "espSuporte" || v > 0)) p[k] = v; }
      return p;
    },
    _obterBase: function (cod, fonte) { var U = global.MorUI; return U && U._obterBase ? U._obterBase(cod, fonte) : null; },

    /* arquivos que a pessoa escolheu: o input da tela ou, vindo do leitor de documento, o arquivo já escolhido lá (st.arquivosPre) */
    _arquivos: function (st) {
      var inp = typeof document !== "undefined" ? document.getElementById("mor-ifc-arq") : null;
      var fs = inp && inp.files && inp.files.length ? Array.prototype.slice.call(inp.files) : [];
      return fs.length ? fs : arr(st && st.arquivosPre);
    },
    /* as etapas da barra de progresso (js/mor/progresso.js). ⚠ Etapa sem medida contínua (medir, juntar/orçar) é declarada medida:false:
       a barra fica indeterminada e mostra só etapa + tempo — nunca um % inventado. */
    _etapas: function (st, files) {
      var projeto = files.length && MorIfcUI.projeto() && !(files.length === 1 && /\.ifc$/i.test(files[0].name));
      if (!files.length) return [{ id: "ler", nome: "Lendo as peças abertas no BIM", medida: false }, { id: "orcar", nome: "Orçando", medida: false }];
      if (!projeto) return [{ id: "abrir", nome: "Abrindo o arquivo", peso: 2 }, { id: "entidades", nome: "Lendo as entidades do modelo", peso: 6 }, { id: "medir", nome: "Medindo o modelo", peso: 2, medida: false }, { id: "orcar", nome: "Orçando", peso: 1, medida: false }];
      var et = files.map(function (f, i) { return { id: "f" + i, nome: "Lendo " + f.name + " (" + (i + 1) + " de " + files.length + ")", peso: Math.max(1, Math.round((f.size || 0) / 1024)) }; });
      var tot = et.reduce(function (s, e) { return s + e.peso; }, 0);
      et.push({ id: "juntar", nome: "Juntando os arquivos e orçando", peso: Math.max(1, Math.round(tot / 10)), medida: false });
      return et;
    },

    /* roda: lê o IFC (arquivo ou peças do viewer) e orça. cb(res, erro). tr = rastreador de progresso (opcional; cancelado → erro «cancelado») */
    _rodar: function (st, cb, tr) {
      var Ler = global.MorIfcLer, Orc = global.MorIfcOrc, padrao = (document.getElementById("mor-ifc-padrao") || {}).value || "medio", params = MorIfcUI._params();
      tr = tr || (global.MorProgresso ? global.MorProgresso.criar([]) : { avancar: function () {}, iniciar: function () {}, concluir: function () {}, aoCancelar: function () {}, cancelado: false });
      var canc = function () { return !!tr.cancelado; };
      var fim = function (modelo) {
        tr.iniciar("orcar");
        /* uma batida de relógio antes do cálculo, para a tela pintar «Orçando» (o cálculo roda de uma vez) */
        setTimeout(function () {
          try {
            if (canc()) { cb(null, "cancelado"); return; }
            var res = Orc.orcar(modelo, { padrao: padrao, params: params, obter: function (c, f) { return MorIfcUI._obterBase(c, f); } });
            if (!res.ok) { cb(null, res.erro); return; }
            cb(res, null);
          } catch (e) { cb(null, "Falha ao orçar: " + e.message); }
        }, 20);
      };
      var files = MorIfcUI._arquivos(st), file = files[0];
      st.lidos = null; st.origemPorId = null; st.modeloProj = null; st.modelado = null;
      if (files.length && MorIfcUI.projeto() && !(files.length === 1 && /\.ifc$/i.test(file.name))) { MorIfcUI._rodarProjeto(st, files, padrao, params, cb, tr); return; }
      if (file) {
        if (file.size > 150 * 1024 * 1024) { cb(null, "Arquivo com mais de 150 MB: a leitura completa trava a aba. Abra o modelo no BIM e use «as peças já abertas» (leitura parcial)."); return; }
        var P = global.MorProgresso;
        if (!P) { cb(null, "O módulo de progresso não carregou: atualize a página (Ctrl+F5)."); return; }
        P.lerArquivo(file, "texto", tr, "abrir", function (txt, err) {
          if (txt === null || txt === undefined) { cb(null, err || "Falha ao ler o arquivo."); return; }
          Ler.lerAsync(txt, {}, function (fase, fr) {
            if (fase === "entidades") tr.avancar("entidades", Math.round(fr * 1000), 1000, { detalhe: "varrendo " + P.fmtBytes(file.size) + " de texto do IFC" });
            else tr.avancar("medir", null, null, { detalhe: "calculando as quantidades de cada peça (roda de uma vez)" });
          }, function (m, e) {
            if (!m) { cb(null, e === "cancelado" ? "cancelado" : (e || "Não consegui ler o IFC.")); return; }
            st.arquivo = file.name; fim(m);
          }, canc);
        });
        return;
      }
      if (st.elementosViewer && st.elementosViewer.length) { st.arquivo = "(peças abertas no BIM)"; tr.iniciar("ler"); fim(Ler.deElementosViewer(st.elementosViewer)); return; }
      cb(null, "Escolha o arquivo .ifc (ou abra um modelo no BIM).");
    },

    /* F6: vários arquivos → ProjOrcar (triagem, extratores, junção, ifcorc). Um arquivo por vez (memória da aba).
       Progresso REAL por arquivo (cada um é uma etapa da barra): bytes lidos 10 %, leitura 80–90 % (caracteres do IFC, linhas do DXF,
       páginas do PDF), e o que não tem medida contínua (medir/classificar, juntar) vira «etapa + tempo» sem %. */
    _rodarProjeto: function (st, files, padrao, params, cb, tr) {
      var PO = global.ProjOrcar, Ler = global.MorIfcLer, P = global.MorProgresso, lidos = [], i = 0, N = files.length;
      var canc = function () { return !!(tr && tr.cancelado); };
      function falho(f, t, msg) { var l = PO.outro(f.name); l.tipo = t; l.erro = msg; return l; }
      function prox() {
        if (canc()) { cb(null, "cancelado"); return; }
        if (i >= files.length) {
          if (tr) tr.iniciar("juntar", "juntando as plantas, os pavimentos e as quantidades (roda de uma vez)");
          setTimeout(function () {
            var r;
            if (canc()) { cb(null, "cancelado"); return; }
            st.lidos = lidos; st.arquivo = files.map(function (f) { return f.name; }).join(", ");
            try { r = PO.orcar(lidos, { padrao: padrao, params: params, obter: function (c, f) { return MorIfcUI._obterBase(c, f); } }); } catch (e) { cb(null, "Falha ao orçar: " + e.message); return; }
            if (!r.ok) { cb(null, r.erro); return; }
            st.origemPorId = r.origemPorId; st.modeloProj = r.modelo; st.modelado = null; cb(r.res, null);
          }, 20);
          return;
        }
        var idx = i, f = files[i++], t = PO.tipo(f.name), id = "f" + idx, pre = "arquivo " + (idx + 1) + " de " + N + " · " + f.name + " · ";
        function prog(frac, det) { if (!tr) return; if (frac === null) tr.avancar(id, null, null, { detalhe: pre + det }); else tr.avancar(id, Math.round(frac * 1000), 1000, { detalhe: pre + det }); }
        function pronto(l) { lidos.push(l); if (tr) tr.concluir(id); setTimeout(prox, 0); }
        if (tr) tr.iniciar(id, pre + "abrindo");
        if (f.size > 150 * 1024 * 1024) { pronto(falho(f, t, "arquivo com mais de 150 MB: não lido (trava a aba)")); return; }
        if (t === "dwg") { pronto(PO.dwg(f.name)); return; }
        if (t === "outro") { pronto(PO.outro(f.name)); return; }
        MorIfcUI._bytes(f, function (buf) {
          if (canc()) { cb(null, "cancelado"); return; }
          if (!buf) { pronto(falho(f, t, "falha ao ler o arquivo")); return; }
          if (t === "ifc") {
            Ler.lerAsync(MorIfcUI._texto(buf, false), {}, function (fase, fr) {
              if (fase === "entidades") prog(0.1 + 0.8 * fr, "lendo as entidades do IFC");
              else prog(null, "medindo o modelo (roda de uma vez)");
            }, function (m, e) {
              if (e === "cancelado") { cb(null, "cancelado"); return; }
              try { pronto(m ? PO.deIfc(m, f.name) : falho(f, t, "não consegui ler: " + e)); } catch (e1) { pronto(falho(f, t, "não consegui ler: " + e1.message)); }
            }, canc);
            return;
          }
          if (t !== "pdf") {
            PO.lerDxfAsync(MorIfcUI._texto(buf, true), f.name, { mem: MorIfcUI._mem() }, function (fr, fase) {
              if (fr === null || fase === "medir") prog(null, "classificando camadas e medindo (roda de uma vez)");
              else prog(0.1 + 0.8 * fr, fase === "linhas" ? "lendo as linhas do DXF" : "montando a geometria");
            }, function (l, e) { if (e === "cancelado") { cb(null, "cancelado"); return; } pronto(l); }, canc);
            return;
          }
          MorIfcUI._pdfPaginas(buf, function (pgs, total, erro) {
            if (erro === "cancelado" || canc()) { cb(null, "cancelado"); return; }
            prog(null, "interpretando as páginas (roda de uma vez)");
            setTimeout(function () {
              try { var lp = PO.lerPdf(pgs || [], f.name, { totalPaginas: total }); if (erro && !lp.ok) lp.erro = erro; pronto(lp); }
              catch (e2) { pronto(falho(f, "pdf", "não consegui ler o PDF: " + e2.message)); }
            }, 20);
          }, function (k, n) { prog(0.1 + 0.9 * (k / n), "página " + k + " de " + n); }, canc);
        }, function (ev, tot) { if (P && tot) prog(0.1 * ev / tot, P.fmtBytes(ev) + " de " + P.fmtBytes(tot)); });
      }
      prox();
    },
    /* bytes do arquivo; aoProg(lidos, total) é opcional (FileReader.onprogress) */
    _bytes: function (f, cb, aoProg) {
      if (!aoProg && f.arrayBuffer) { f.arrayBuffer().then(function (b) { cb(b); }, function () { cb(null); }); return; }
      var fr = new FileReader(); fr.onload = function () { cb(fr.result); }; fr.onerror = function () { cb(null); };
      if (aoProg) fr.onprogress = function (ev) { if (ev && ev.lengthComputable) aoProg(ev.loaded, ev.total); };
      fr.readAsArrayBuffer(f);
    },
    /* DXF antigo é ANSI: «TÉRREO» chega estragado em UTF-8 → cai para windows-1252 */
    _texto: function (buf, ansi) {
      var b = new Uint8Array(buf), t = new TextDecoder("utf-8").decode(b);
      if (ansi && t.indexOf("\uFFFD") >= 0) { try { t = new TextDecoder("windows-1252").decode(b); } catch (e) { /* fica o utf-8 */ } }
      return t;
    },
    /* memória do motor (camada/bloco que a pessoa já corrigiu): só leitura aqui */
    _mem: function () { try { var Mm = global.MorMemoria; return Mm && Mm.carregar && typeof localStorage !== "undefined" ? (Mm.carregar(localStorage, Auth.empresaId()) || {}).mem || null : null; } catch (e) { return null; } },
    /* pdf.js local (o mesmo do leitor de prancha, sem CDN): traço vetorial + texto + linhas de cada página */
    _pdfPaginas: function (buf, cb, aoPagina, cancelado) {
      var G = global.Gestao, PV = global.PdfVetor, PO = global.ProjOrcar;
      if (!G || !G._estPdfLib) { cb([], 0, "o leitor de PDF não está disponível nesta tela"); return; }
      G._estPdfLib(function (lib) {
        if (!lib) { cb([], 0, "não carregou o leitor de PDF local"); return; }
        lib.getDocument({ data: new Uint8Array(buf) }).promise.then(function (doc) {
          var n = Math.min(doc.numPages, PO.MAX_PAGINAS), pgs = [], ch = Promise.resolve();
          for (var p = 1; p <= n; p++) (function (k) {
            ch = ch.then(function () { if (cancelado && cancelado()) throw new Error("cancelado"); return doc.getPage(k).then(function (page) {
              var vp = page.getViewport({ scale: 1 });
              return Promise.all([page.getOperatorList(), page.getTextContent()]).then(function (rr) {
                var vs = PV ? PV.segmentos(rr[0], lib.OPS, { base: vp.transform }) : { ok: false }, segs = vs && vs.ok ? vs.segmentos : [];
                if (segs.length && PV.tirarMoldura) { var sm = PV.tirarMoldura(segs); if (sm && sm.segmentos) segs = sm.segmentos; }
                var textos = [], porY = {}, ys = [];
                (rr[1].items || []).forEach(function (it) {
                  if (!it.str || !String(it.str).trim()) return;
                  var m = lib.Util.transform(vp.transform, it.transform); textos.push({ s: it.str, x: m[4], y: m[5] });
                  var ky = Math.round(m[5] / 3); if (!porY[ky]) { porY[ky] = []; ys.push(ky); } porY[ky].push({ x: m[4], s: it.str });
                });
                ys.sort(function (a, b) { return a - b; });
                var linhas = ys.map(function (ky) { return porY[ky].sort(function (a, b) { return a.x - b.x; }).map(function (q) { return q.s; }).join(" "); });
                pgs.push({ segmentos: segs, textos: textos, linhas: linhas });
                if (aoPagina) aoPagina(k, n);
              });
            }); });
          })(p);
          ch.then(function () { cb(pgs, doc.numPages, ""); }, function (e) { cb(pgs, doc.numPages, e && e.message === "cancelado" ? "cancelado" : "falha ao ler a página: " + (e && e.message)); });
        }, function () { cb([], 0, "o PDF não abriu (protegido ou corrompido?)"); });
      });
    },

    _repintar: function () {
      var st = MorIfcUI._st, box = document.getElementById("mor-ifc-res"); if (!st || !box || !st.res) return;
      box.innerHTML = MorIfcUI.htmlConferencia(st);
      MorIfcUI._ligar(box);
    },
    _achar: function (id) { var st = MorIfcUI._st, l = null; if (st && st.res) st.res.linhas.forEach(function (x) { if (x.id === id) l = x; }); return l; },
    _ok: function (id) { var st = MorIfcUI._st, l = MorIfcUI._achar(id); if (!st || !l || !podeMarcar(l)) return; st.aceitos[id] = true; st.marcadas[id] = true; },
    _okEtapa: function (etapaId) { var st = MorIfcUI._st; if (!st) return; st.res.linhas.forEach(function (l) { if (l.etapaId === etapaId && podeMarcar(l)) { st.aceitos[l.id] = true; st.marcadas[l.id] = true; } }); },

    /* destaca no 3D as peças de origem (se o viewer expõe pintarChaves); a chave do viewer é a do globalId */
    _destacar: function (l) {
      var st = MorIfcUI._st; if (!global.BIM || !global.BIM.pintarChaves) { UI.toast("O visualizador 3D não está aberto.", "info"); return; }
      var porGid = {}; arr(st.elementosViewer).forEach(function (e) { if (e.globalId && e.chave) porGid[e.globalId] = e.chave; });
      var mapa = {}, n = 0;
      arr(l.elementos).forEach(function (e) { var gidE = String(e.chave || "").replace(/^ifc::/, ""), ch = porGid[gidE] || (st.chavesDireto ? e.chave : ""); if (ch) { mapa[ch] = "#ffd400"; n++; } });
      if (!n) { UI.toast("Não achei estas peças no modelo aberto no BIM (abra o mesmo arquivo no visualizador).", "info"); return; }
      global.BIM.pintarChaves(mapa, "mor-orc"); UI.toast(n + " peça(s) destacada(s) no 3D.", "ok");
    },

    /* F5: «Modelar no 3D» — o lote do js/projmodelar.js entra no BIM aberto (ou na área de teste) num clique, sem pergunta */
    _familiaCat: function (famId) {
      var HF = global.HidFamilias, RA = global.FamiliasRA, f = null;
      try { f = (HF && HF.porId ? HF.porId(famId) : null) || (RA && RA.obter ? RA.obter(famId, true) : null); } catch (e) { f = null; }
      return f;
    },
    modelar3D: function (cb) {
      var st = MorIfcUI._st, PM = global.ProjModelar, self = MorIfcUI;
      function fim(t, ok) { if (st) st.modelado = { texto: t, ok: ok }; var el = document.getElementById("mor-proj-modelado"); if (el) el.textContent = t; UI.toast(t, ok ? "ok" : "info", 9000); if (cb) cb(ok); }
      if (!st || !st.modeloProj || !PM) { fim("Leia um projeto (DXF/PDF) antes de modelar.", false); return; }
      /* o lote é montado na hora de gravar: o catálogo de famílias (louças) só fica completo com o grupo do BIM carregado */
      function montar() {
        return PM.gerar(st.modeloProj, {
          novoId: function (p) { return (p || "pm") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
          temFamilia: function (f) { return !!self._familiaCat(f); },
          tipoDe: function (f) { var x = self._familiaCat(f); return x && x.tipos && x.tipos[0] ? String(x.tipos[0].id) : ""; }
        });
      }
      var tent = 0;
      function pronto() { var b = global.BIM; try { return !!(b && b.editarLote && b.editarEstado && b.editarEstado()); } catch (e) { return false; } }
      function gravar() {
        var b = global.BIM, P = global.BimProjetosUI;
        /* BIM sem projeto aberto (tela inicial): entra na ÁREA DE TESTE sem o seletor de template (zero perguntas) — o mesmo
           que BimProjetosUI.areaTeste faz, menos o «começar com qual template?», que a modelagem dispensa */
        try {
          if (P && P.inicioVisivel && P.inicioVisivel()) {
            if (P.descarregarCena) P.descarregarCena();
            if (global.Gestao && global.Gestao.bimTrocaObra) global.Gestao.bimTrocaObra("", {});
            if (P.esconderInicio) P.esconderInicio(); if (P.pintarTitulo) P.pintarTitulo();
            setTimeout(gravar, 600); return;
          }
        } catch (e0) {}
        var g = montar(); if (!g.ok) { fim("Nada a modelar: " + (g.erro || "sem paredes"), false); return; }
        var ok = false; try { ok = !!b.editarLote(g.lote); } catch (e) { ok = false; }
        if (!ok) { fim("O editor recusou a modelagem (nada mudou).", false); return; }
        var c = g.criadas, t = "Modelado no 3D: " + c.parede + " parede(s), " + c.porta + " porta(s), " + c.janela + " janela(s), " + c.louca + " louça(s)" + (c.generico ? ", " + c.generico + " genérico(s) marcado(s)" : "") + " em " + g.pavimentos.length + " pavimento(s). Ctrl+Z desfaz tudo.";
        st.modeladoLote = { id: g.lote.id, criadas: c, avisos: g.avisos, nOps: g.ops.length };
        fim(t, true);
      }
      var tCat = 0;
      function catalogo() { try { return !!(global.HidFamilias && global.HidFamilias.todas().length && global.FamiliasRA); } catch (e) { return false; } }
      /* ⚠ CORRIDA (14/11/2026, PCD real): o BIM fica pronto antes do catálogo de famílias hidráulicas — as 40 louças viravam
         genérico. Espera o catálogo até ~10 s; sem ele, segue (o que não tiver família sai genérico, marcado). */
      function esperar() { if (pronto() && (catalogo() || ++tCat > 40)) { gravar(); return; } if (++tent > 120) { fim("O BIM não abriu a tempo: abra o BIM e clique de novo.", false); return; } setTimeout(esperar, 250); }
      if (!pronto()) {
        try { if (UI.fecharModal) UI.fecharModal(); } catch (e1) {}
        try { if (st.app && st.app.irPara) st.app.irPara("bim"); else if (global.App && global.App.irPara) global.App.irPara("bim"); } catch (e2) {}
      }
      esperar();
    },

    _ligar: function (box) {
      Array.prototype.forEach.call(box.querySelectorAll("[data-proj-modelar]"), function (el) { el.addEventListener("click", function () { MorIfcUI.modelar3D(); }); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-mor-ifc-marca]"), function (el) { el.addEventListener("change", function () { var id = el.getAttribute("data-mor-ifc-marca"), l = MorIfcUI._achar(id); if (!l) return; if (el.checked && l.origem !== "medido" && !MorIfcUI._st.aceitos[id]) { MorIfcUI._ok(id); } else if (el.checked) MorIfcUI._st.marcadas[id] = true; else { delete MorIfcUI._st.marcadas[id]; delete MorIfcUI._st.aceitos[id]; } MorIfcUI._repintar(); }); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-mor-ifc-ok]"), function (el) { el.addEventListener("click", function () { MorIfcUI._ok(el.getAttribute("data-mor-ifc-ok")); MorIfcUI._repintar(); }); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-mor-ifc-okEtapa]"), function (el) { el.addEventListener("click", function () { MorIfcUI._okEtapa(el.getAttribute("data-mor-ifc-okEtapa")); MorIfcUI._repintar(); }); });
      Array.prototype.forEach.call(box.querySelectorAll("[data-mor-ifc-porque]"), function (el) {
        el.addEventListener("click", function () {
          var l = MorIfcUI._achar(el.getAttribute("data-mor-ifc-porque")); if (!l) return;
          UI.modal("Por quê? — " + String(l.descricao).slice(0, 70), MorIfcUI.htmlPorque(l), [
            { texto: "Ver no 3D", classe: "", onClick: function () { MorIfcUI._destacar(l); } },
            { texto: "Fechar", classe: "primary", onClick: function () { MorIfcUI.abrirConferenciaDe(MorIfcUI._st); } }
          ]);
        });
      });
    },

    /* abre (ou reabre) a janela da conferência com o estado já lido */
    abrirConferenciaDe: function (st) {
      MorIfcUI._st = st;
      UI.modal("Orçar pelo modelo — conferência", '<div id="mor-ifc-res">' + MorIfcUI.htmlConferencia(st) + "</div>", [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Lançar os marcados", classe: "primary", onClick: function () { MorIfcUI.lancar(); } }
      ]);
      var box = document.getElementById("mor-ifc-res"); if (box) MorIfcUI._ligar(box);
    },

    /* clique em «Ler o modelo e orçar» (ou automático, vindo do leitor de documento): barra de progresso real + Cancelar */
    _executar: function (st) {
      var box = document.getElementById("mor-ifc-res"), P = global.MorProgresso;
      if (st.tr && !st.tr.finalizado) return;   /* já está lendo: segundo clique não dispara outra leitura */
      var files = MorIfcUI._arquivos(st), tam = files.reduce(function (s, x) { return s + (x.size || 0); }, 0);
      var tr = P ? P.criar(MorIfcUI._etapas(st, files), { tamanho: tam, cancelavel: true }) : null, vis = null;
      st.tr = tr;
      if (box) { if (tr) vis = P.montar(box, tr); else box.innerHTML = '<p class="muted">Lendo o modelo…</p>'; }
      MorIfcUI._rodar(st, function (res, erro) {
        if (vis) vis.parar();
        if (st !== MorIfcUI._st) return;   /* a janela foi fechada no meio: não reabre sozinha */
        box = document.getElementById("mor-ifc-res") || box;
        if (tr && tr.cancelado) { if (box) box.innerHTML = '<p class="muted">Leitura cancelada. Nada foi lançado — clique em «Ler o modelo e orçar» para tentar de novo.</p>'; return; }
        if (!res) {
          if (tr) tr.falhar(erro);
          if (box) box.innerHTML = (tr ? P.html(tr.snap(), { acao: "confira o arquivo (ele abre no programa que o gerou?). Se for muito grande, exporte só as disciplinas que você quer orçar, ou use «as peças já abertas» no BIM." }) : '<p style="color:#c62828">' + esc(erro) + "</p>") + (st.lidos ? MorIfcUI.htmlLido(st.lidos) : "");
          return;
        }
        if (tr) tr.finalizar();
        st.res = res; st.marcadas = {}; st.aceitos = {};
        res.linhas.forEach(function (l) { if (marcadaDeSaida(l)) st.marcadas[l.id] = true; });
        MorIfcUI.abrirConferenciaDe(st);
      }, tr);
    },

    /* opts.arquivos (File[]) + opts.auto: o leitor de documento encaminha um .ifc/.dxf/.dwg para cá — o arquivo já escolhido entra sem
       a pessoa ter que escolher de novo, e com auto a leitura começa na hora */
    abrir: function (app, opts) {
      opts = opts || {};
      if (!MorIfcUI.ativo()) { UI.toast("«Orçar pelo modelo» é uma prévia: abra o app com ?previa=motor.", "info"); return; }
      var st = { app: app, res: null, marcadas: {}, aceitos: {}, elementosViewer: arr(opts.elementos), obraNome: opts.obraNome || "", arquivo: "", arquivosPre: arr(opts.arquivos), tr: null };
      MorIfcUI._st = st;
      UI.modal("Orçar pelo modelo (prévia)", MorIfcUI.htmlConfiguracao(st.elementosViewer.length > 0, st.arquivosPre), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { if (st.tr) st.tr.cancelar(); MorIfcUI._st = null; UI.fecharModal(); } },
        { texto: "Ler o modelo e orçar", classe: "primary", onClick: function () { MorIfcUI._executar(st); } }
      ]);
      if (opts.auto && st.arquivosPre.length) MorIfcUI._executar(st);
    },

    /* lança as linhas marcadas no orçamento aberto (ou num novo): só as marcadas, só com preço da base, idempotente */
    lancar: function () {
      var st = MorIfcUI._st; if (!st || !st.res) return;
      var app = st.app, MM = global.MorManual, C = global.MorCatalogo, PQ = global.MorPorque;
      var chaves = Object.keys(st.marcadas).filter(function (k) { return st.marcadas[k]; });
      if (!chaves.length) { UI.toast("Marque ao menos uma linha (ou dê OK nas amarelas).", "info"); return; }
      var orc = app && app.orcAtual, novo = false;
      if (!orc) {
        if (app && app._orcNovoRecusado && app._orcNovoRecusado()) return;
        orc = Orcamento.novo({ nome: "Orçamento pelo modelo IFC" + (st.obraNome ? " — " + st.obraNome : "") }); novo = true;
      }
      if (Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)) { UI.toast("Este orçamento está aprovado — crie uma revisão para acrescentar itens.", "erro"); return; }
      var cfg = Orcamento.garantirConfig(orc), tot = { inseridos: 0, ja: 0, semPreco: [], pendentes: 0 }, quem = "";
      try { quem = (typeof Auth !== "undefined" && Auth.usuario && (Auth.usuario() || {}).nome) || ""; } catch (e0) { /* sem usuário */ }
      st.res.etapas.forEach(function (et) {
        var marc = et.linhas.filter(function (l) { return st.marcadas[l.id]; }).map(function (l) { return l.id; }); if (!marc.length) return;
        var existe = null; (orc.etapas || []).forEach(function (e) { if (C.semAcento(e.nome) === C.semAcento(et.nome)) existe = e; });
        if (!existe) { Orcamento.addEtapa(orc, et.nome); existe = orc.etapas[orc.etapas.length - 1]; }
        var r = MM.inserir(orc, existe.id, { itens: et.linhas }, marc, { Orcamento: Orcamento, permitirZerado: !!cfg.permitirZerado, obter: function (c, f) { return MorIfcUI._obterBase(c, f); }, totalItens: Orcamento.totais(orc).qtdItens, limiteItens: Auth.limite("limiteItensPorOrcamento") });
        tot.inseridos += r.inseridos; tot.ja += r.jaExistiam; tot.pendentes += r.pendentes; r.semPreco.forEach(function (d) { tot.semPreco.push(d); });
        /* a linha que a pessoa conferiu (OK) sai sem a marca «conferir» */
        (existe.itens || []).forEach(function (it) { if (it.mor && st.aceitos[it.mor.regra] && PQ && PQ.precisaConferir(it)) { it.mor.conferido = true; it.mor.conferidoEm = new Date().toISOString(); it.mor.conferidoPor = quem; } });
      });
      orc.mor = orc.mor || { v: 1, tipologia: "", params: {}, respostas: {} };
      orc.mor.ifc = { v: 1, arquivo: st.arquivo, padrao: st.res.padrao, params: st.res.params, lidos: st.res.cobertura && st.res.cobertura.lidos, classificados: st.res.cobertura && st.res.cobertura.classificados, semRegra: st.res.cobertura && st.res.cobertura.semRegra.length, geradoEm: new Date().toISOString() };
      if (novo) { try { Store.salvarOrcamento(Auth.empresaId(), orc); } catch (e1) { UI.toast("Não consegui salvar o orçamento novo.", "erro"); return; } app.orcAtual = orc; app.tela = "editor"; app.aba = "planilha"; }
      var g = app.persistir ? app.persistir() : null; UI.fecharModal(); if (app.render) app.render(); MorIfcUI._st = null;
      if (g && app._gravou && !app._gravou(g)) return;
      var msg = tot.inseridos + " linha(s) lançada(s)";
      if (tot.ja) msg += "; " + tot.ja + " já estava(m) na etapa";
      if (tot.semPreco.length) msg += ". " + tot.semPreco.length + " ficou(aram) de fora por falta de preço na base (libere «Permitir insumos com preço zerado» ou resolva no Orçamentista)";
      UI.toast(msg + ".", tot.semPreco.length ? "info" : "ok", tot.semPreco.length ? 9000 : 4000);
    }
  };

  MorIfcUI._interno = { marcadaDeSaida: marcadaDeSaida, podeMarcar: podeMarcar, pilula: pilula };
  if (typeof module !== "undefined" && module.exports) module.exports = MorIfcUI;
  global.MorIfcUI = MorIfcUI;
})(typeof window !== "undefined" ? window : globalThis);
