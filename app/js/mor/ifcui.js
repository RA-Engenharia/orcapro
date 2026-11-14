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

    htmlConfiguracao: function (temViewer) {
      return '<div id="mor-ifc-cfg">' +
        '<p class="muted" style="margin:0 0 8px;font-size:12.5px">Lê o IFC inteiro e orça o que o modelo mostra <b>e o que a obra consome sem estar desenhado</b> (chapisco, fôrma, impermeabilização…). Cada linha diz de onde veio; <b>nada implícito entra sem o seu OK</b>.</p>' +
        '<div class="field"><label for="mor-ifc-padrao">Padrão do orçamento</label><select id="mor-ifc-padrao"><option value="baixo">Baixo (popular)</option><option value="medio" selected>Médio (normal)</option><option value="alto">Alto</option></select>' +
        '<span class="muted" style="font-size:12px">O padrão só escolhe o material onde o IFC não diz; o material informado no IFC vence.</span></div>' +
        '<div class="field"><label for="mor-ifc-arq">Arquivo IFC</label><input type="file" id="mor-ifc-arq" accept=".ifc" aria-label="Arquivo IFC">' +
        (temViewer ? ' <span class="muted" style="font-size:12px">ou deixe em branco para usar as peças já abertas no BIM (leitura parcial: sem Psets, camadas nem ambientes).</span>' : "") + "</div>" +
        '<details><summary><b>Parâmetros que o IFC não traz</b> <span class="muted" style="font-weight:400">(em branco = o item fica pendente)</span></summary>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap">' +
        MorIfcUI._campo("mor-ifc-p-profEsc", "Profundidade escavada das fundações (m)") + MorIfcUI._campo("mor-ifc-p-folga", "Folga de trabalho da cava (m)") + MorIfcUI._campo("mor-ifc-p-dmt", "Distância ao bota-fora (km)") +
        MorIfcUI._campo("mor-ifc-p-espSuporte", "Espaçamento entre suportes de tubo (m)") + MorIfcUI._campo("mor-ifc-p-empolamento", "Empolamento do solo (0,25 = 25 %; padrão 0,25)") + "</div></details>" +
        '<div id="mor-ifc-res" aria-live="polite" style="margin-top:10px"></div></div>';
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
      var res = st.res, h = MorIfcUI.htmlCobertura(res);
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
        arr(l.elementos).slice(0, 40).map(function (e) { return "<li>" + esc(e.classe) + " «" + esc(e.nome) + "»</li>"; }).join("") + (arr(l.elementos).length > 40 ? "<li>…</li>" : "") + "</ul>";
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

    /* roda: lê o IFC (arquivo ou peças do viewer) e orça. cb(res, erro) */
    _rodar: function (st, cb) {
      var Ler = global.MorIfcLer, Orc = global.MorIfcOrc, padrao = (document.getElementById("mor-ifc-padrao") || {}).value || "medio", params = MorIfcUI._params();
      var fim = function (modelo) {
        try {
          var res = Orc.orcar(modelo, { padrao: padrao, params: params, obter: function (c, f) { return MorIfcUI._obterBase(c, f); } });
          if (!res.ok) { cb(null, res.erro); return; }
          cb(res, null);
        } catch (e) { cb(null, "Falha ao orçar: " + e.message); }
      };
      var inp = document.getElementById("mor-ifc-arq"), file = inp && inp.files && inp.files[0];
      if (file) {
        if (file.size > 150 * 1024 * 1024) { cb(null, "Arquivo com mais de 150 MB: a leitura completa trava a aba. Abra o modelo no BIM e use «as peças já abertas» (leitura parcial)."); return; }
        var rd = function (txt) { try { var m = Ler.ler(txt); if (!m.ok) { cb(null, m.erro); return; } st.arquivo = file.name; fim(m); } catch (e) { cb(null, "Não consegui ler o IFC: " + e.message); } };
        if (file.text) file.text().then(rd, function () { cb(null, "Falha ao ler o arquivo."); });
        else { var fr = new FileReader(); fr.onload = function () { rd(String(fr.result)); }; fr.onerror = function () { cb(null, "Falha ao ler o arquivo."); }; fr.readAsText(file); }
        return;
      }
      if (st.elementosViewer && st.elementosViewer.length) { st.arquivo = "(peças abertas no BIM)"; fim(Ler.deElementosViewer(st.elementosViewer)); return; }
      cb(null, "Escolha o arquivo .ifc (ou abra um modelo no BIM).");
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

    _ligar: function (box) {
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

    abrir: function (app, opts) {
      opts = opts || {};
      if (!MorIfcUI.ativo()) { UI.toast("«Orçar pelo modelo» é uma prévia: abra o app com ?previa=motor.", "info"); return; }
      var st = { app: app, res: null, marcadas: {}, aceitos: {}, elementosViewer: arr(opts.elementos), obraNome: opts.obraNome || "", arquivo: "" };
      MorIfcUI._st = st;
      UI.modal("Orçar pelo modelo (prévia)", MorIfcUI.htmlConfiguracao(st.elementosViewer.length > 0), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { MorIfcUI._st = null; UI.fecharModal(); } },
        { texto: "Ler o modelo e orçar", classe: "primary", onClick: function () {
          var box = document.getElementById("mor-ifc-res"); if (box) box.innerHTML = '<p class="muted">Lendo o modelo…</p>';
          MorIfcUI._rodar(st, function (res, erro) {
            if (!res) { if (box) box.innerHTML = '<p style="color:#c62828">' + esc(erro) + "</p>"; return; }
            st.res = res; st.marcadas = {}; st.aceitos = {};
            res.linhas.forEach(function (l) { if (marcadaDeSaida(l)) st.marcadas[l.id] = true; });
            MorIfcUI.abrirConferenciaDe(st);
          });
        } }
      ]);
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
