/* =====================================================================
 * docobraui.js — A TELA "Documentos da obra": o arquivo com o PDF, as
 * revisões, quem assinou e o histórico de cada documento.
 *
 * O motor é js/docobra.js (puro, no gate). A assinatura digital é do
 * assinador local, pela ponte do servidor (server/assinador.js, rotas
 * /__assinador/*). Engate como o tour360ui.js: `Gestao.ui`,
 * `Gestao.registrarAcoes` (RBAC do módulo de graça) e `Gestao.registrarWire`.
 *
 * ⚠ NÃO CONFUNDIR com `Gestao.docsObra` (lista de documentos do PORTAL do
 *   cliente: número, validade e link, sem arquivo). Aquele é o que o cliente
 *   vê; este é o arquivo técnico da empresa. Os dois convivem.
 *
 * REGRAS QUE ESTA TELA SEGUE
 * 1) OS BYTES MORAM NESTE APARELHO (IndexedDB), A FICHA VIAJA. É a regra das
 *    pranchas e dos anexos do içamento: a entidade inteira cabe num documento
 *    de 1 MiB da nuvem, PDF não. No outro aparelho a linha diz "o arquivo não
 *    está neste computador" em vez de fingir que abre.
 * 2) "ASSINADO" SÓ SAI DA VERIFICAÇÃO DO ARQUIVO (DocObra.estado). Nenhum
 *    botão marca assinatura à mão.
 * 3) ASSINAR SÓ NO COMPUTADOR DO CERTIFICADO. O servidor recusa pedido de
 *    outro aparelho; a tela já avisa antes, para ninguém preencher o modal à
 *    toa no celular.
 * 4) A MANUSCRITA AUTORIZADA ENTRA ANTES DA ASSINATURA DIGITAL. Imagem posta
 *    em PDF já assinado invalida a assinatura que está lá — por isso, com o
 *    documento já assinado, a opção aparece desligada com o motivo.
 * 5) O ORIGINAL NUNCA SE PERDE: assinar cria uma VERSÃO nova; a anterior
 *    continua no aparelho e no histórico, com o SHA-256 de cada uma.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;

  var G = global.Gestao;
  var K = G.ui;
  /* ⚠ uma constante por linha, terminada em ";": é assim que o test-v12-escopo
     reconhece que a entidade do mapa de obra é lida de verdade (chave morta reprova) */
  var ENT = "obra_docs";
  var ENT_ASS = "doc_assinantes";

  function motor() { return global.DocObra; }
  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function agora() { return Util.agoraISO(); }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function quem() {
    try { var u = (typeof Auth !== "undefined" && Auth._usuario) || {}; return u.nome || u.email || "usuário"; } catch (e) { return "usuário"; }
  }
  function tamanho(b) { b = +b || 0; return b >= 1048576 ? Util.fmtNum(b / 1048576, 1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function quando(iso) { if (!iso) return "—"; try { var d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleString("pt-BR"); } catch (e) { return String(iso); } }
  function ehAdminOuAprovador() {
    if (typeof Auth === "undefined") return true;
    return (Auth.ehAdmin && Auth.ehAdmin()) || (Auth.podeAprovar && Auth.podeAprovar());
  }
  function servidorLocal() {
    var h = (global.location && global.location.hostname) || "";
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  }
  function ehPdfReg(d) {
    var a = d && d.arquivo; if (!a) return false;
    return /pdf/i.test(a.tipo || "") || /\.pdf$/i.test(a.nome || "");
  }
  function listaDocs() { return K.lista(ENT); }
  function todosDocs() { try { return Store.listar(eid(), ENT) || []; } catch (e) { return []; } }
  function assinantes() { try { return (Store.listar(eid(), ENT_ASS) || []).filter(function (a) { return a.ativo !== false; }); } catch (e) { return []; } }
  function obraNome(id) {
    if (!id) return "Sem obra";
    var o = null; try { o = Store.obter(eid(), "obras", id); } catch (e) {}
    return o ? (o.nome || "Obra") : "";
  }

  /* ---------------------------------------------------------------
   * ESTADO DA TELA
   * --------------------------------------------------------------- */
  G._dobObra = G._dobObra || "todas";
  G._dobTipo = G._dobTipo || "";
  G._dobSit = G._dobSit || "vigentes";
  G._dobBusca = G._dobBusca || "";
  G._dobAssinador = G._dobAssinador || { carregado: false };
  G._dobPresentes = G._dobPresentes || null;   // {chave: 1} do IndexedDB deste aparelho

  function rerender() { if (typeof App !== "undefined" && App.render) App.render(); }

  /* status do assinador: pergunta UMA vez por minuto, e só no computador do servidor */
  function carregarAssinador(forcar) {
    var st = G._dobAssinador;
    if (!servidorLocal()) { if (!st.carregado) G._dobAssinador = { carregado: true, instalado: false, motivo: "a assinatura digital só funciona no computador onde o certificado está instalado." }; return; }
    if (!forcar && st.pedindo) return;
    if (!forcar && st.carregado && (Date.now() - (st.em || 0) < 60000)) return;
    st.pedindo = true;
    api("GET", "/__assinador/status").then(function (r) {
      var antes = JSON.stringify([st.instalado, st.versao, st.motivo]);
      G._dobAssinador = { carregado: true, em: Date.now(), instalado: !!(r && r.instalado), versao: r && r.versao, motivo: (r && r.motivo) || "" };
      if (antes !== JSON.stringify([G._dobAssinador.instalado, G._dobAssinador.versao, G._dobAssinador.motivo]) && G._telaDocumentos()) rerender();
    }, function (e) {
      G._dobAssinador = { carregado: true, em: Date.now(), instalado: false, motivo: "o servidor local não respondeu (" + (e && e.message || e) + ")." };
      if (G._telaDocumentos()) rerender();
    });
  }
  G._telaDocumentos = function () { return !!document.getElementById("dob-tela"); };

  function carregarPresentes() {
    if (typeof Idb === "undefined" || !Idb.chaves) return;
    if (G._dobPresentesPedindo) return;
    G._dobPresentesPedindo = true;
    Idb.chaves("docobra:" + eid() + ":").then(function (ks) {
      G._dobPresentesPedindo = false;
      var m = {}; (ks || []).forEach(function (k) { m[k] = 1; });
      var mudou = JSON.stringify(m) !== JSON.stringify(G._dobPresentes || {});
      G._dobPresentes = m;
      if (mudou && G._telaDocumentos()) rerender();
    }, function () { G._dobPresentesPedindo = false; G._dobPresentes = G._dobPresentes || {}; });
  }
  function presente(d) {
    if (!d || !d.arquivo) return false;
    if (!G._dobPresentes) return true;   // ainda não sabemos: não acusar falta sem ter olhado
    return !!G._dobPresentes[d.arquivo.chave];
  }

  /* fetch com JSON e recado legível (o servidor responde {ok:false, erro}) */
  function api(metodo, rota, corpo) {
    return fetch(rota, {
      method: metodo, cache: "no-store",
      headers: corpo ? { "Content-Type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!res.ok) {
          var msg = (j && j.erro) || (res.status === 404 ? "esta instalação do OrçaPRO ainda não tem a ponte do assinador (atualize o app)." : "o servidor respondeu " + res.status + ".");
          var err = new Error(msg); err.codigo = j && j.codigo; err.status = res.status; throw err;
        }
        return j;
      });
    });
  }

  function lerArquivo(f) {
    return new Promise(function (ok, falha) {
      var fr = new FileReader();
      fr.onload = function () { ok(new Uint8Array(fr.result)); };
      fr.onerror = function () { falha(fr.error || new Error("não consegui ler o arquivo")); };
      fr.readAsArrayBuffer(f);
    });
  }
  function bytesDoAparelho(chave) {
    if (typeof Idb === "undefined") return Promise.reject(new Error("este navegador não guarda arquivos (sem IndexedDB)."));
    return Idb.get(chave).then(function (v) {
      if (!v || !v.dados) { var e = new Error("o arquivo não está neste computador — ele foi adicionado em outro aparelho."); e.codigo = "ausente"; throw e; }
      return new Uint8Array(v.dados);
    });
  }
  function guardarBytes(chave, nome, tipo, bytes) {
    if (typeof Idb === "undefined") return Promise.reject(new Error("este navegador não guarda arquivos (sem IndexedDB)."));
    var copia = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return Idb.set(chave, { nome: nome, tipo: tipo, dados: copia }).then(function () {
      if (G._dobPresentes) G._dobPresentes[chave] = 1;
    });
  }
  function abrirBytes(bytes, tipo, nomeBaixar) {
    var url = URL.createObjectURL(new Blob([bytes], { type: tipo || "application/pdf" }));
    var w = nomeBaixar ? null : global.open(url, "_blank");
    if (!w) {   // pop-up bloqueado (ou pedido de baixar): vira download com nome
      var a = document.createElement("a"); a.href = url; a.download = nomeBaixar || "documento.pdf";
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
  }

  /* ---------------------------------------------------------------
   * LISTA
   * --------------------------------------------------------------- */
  G.renderDocumentos = function () {
    if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("documentos")) return G._semPermissao("documentos");
    var M = motor();
    if (!M) return G._moduloNaoCarregado("Documentos da obra", "js/docobra.js");
    carregarAssinador(false);
    carregarPresentes();

    var obras = K.lista("obras");
    if (G._dobObra !== "todas" && !obras.some(function (o) { return String(o.id) === String(G._dobObra); }) && G._dobObra !== "_sem") G._dobObra = "todas";
    var todos = listaDocs();
    var docs = M.ordenar(M.filtrar(todos, { obraId: G._dobObra === "_sem" ? "" : G._dobObra, tipo: G._dobTipo, situacao: G._dobSit, busca: G._dobBusca }));
    if (G._dobObra === "_sem") docs = docs.filter(function (d) { return !d.obraId; });

    var selObra = '<select data-gacao="dob-obra" title="Documentos de qual obra" style="max-width:230px"><option value="todas">Todas as obras (' + todos.length + ")</option>" +
      obras.map(function (o) {
        var nn = todos.filter(function (d) { return String(d.obraId) === String(o.id); }).length;
        return '<option value="' + esc(o.id) + '"' + (String(o.id) === String(G._dobObra) ? " selected" : "") + ">" + esc(o.nome || "Obra") + " (" + nn + ")</option>";
      }).join("") +
      (todos.some(function (d) { return !d.obraId; }) ? '<option value="_sem"' + (G._dobObra === "_sem" ? " selected" : "") + ">Sem obra (obra excluída)</option>" : "") + "</select>";
    var selTipo = '<select data-gacao="dob-tipo" title="Tipo de documento"><option value="">Todos os tipos</option>' +
      M.TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === G._dobTipo ? " selected" : "") + ">" + esc(t[1]) + "</option>"; }).join("") + "</select>";
    var selSit = '<select data-gacao="dob-sit" title="Situação">' +
      [["vigentes", "Vigentes"], ["", "Todos (com revisões antigas)"], ["assinado", "Assinados"], ["pendencia", "Assinatura com pendência"], ["emitido", "Sem assinatura"], ["enviado", "Enviados"], ["rascunho", "Rascunhos"], ["substituido", "Substituídos"], ["cancelado", "Cancelados"]]
        .map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === G._dobSit ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select>";
    var extra = '<div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center">' + selObra + selTipo + selSit +
      '<input id="dob-busca" type="search" placeholder="Buscar título, código, quem assinou…" value="' + esc(G._dobBusca) + '" style="min-width:210px">' +
      '<button class="btn ghost" data-gacao="dob-assinantes" title="Quem assina: certificado digital ou assinatura manuscrita autorizada">Assinantes</button></div>';

    var html = '<div id="dob-tela">' + G._head(K.svg("documentos") + "Documentos da obra", "dob-novo", "Adicionar documento", extra);
    html += '<p class="muted" style="margin:-4px 0 10px;font-size:12.5px">O arquivo técnico de cada obra: PDF, revisão, quem assinou e o histórico. ' +
      'A ficha sincroniza entre os aparelhos; o <b>arquivo</b> fica no computador onde foi adicionado. ' +
      'O que o cliente vê no Portal (ART, alvará, validade) continua na ficha da obra: aba <b>Documentos → Gerenciar documentos</b>.</p>';
    html += faixaAssinador();

    if (!docs.length) {
      var vazio = todos.length ? "Nenhum documento com estes filtros." : "Nenhum documento guardado ainda.";
      return html + K.vazioBox(vazio, "dob-novo", "Adicionar documento") + "</div>";
    }

    var grupos = {}, ordem = [];
    docs.forEach(function (d) {
      var k = d.obraId || "_sem";
      if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
      grupos[k].push(d);
    });
    html += '<table class="tbl" id="dob-tabela"><thead><tr><th>Documento</th><th>Data</th><th>Situação</th><th>Assinaturas</th><th>Arquivo</th><th style="text-align:right">Ações</th></tr></thead><tbody>';
    ordem.forEach(function (k) {
      if (G._dobObra === "todas") {
        var nome = k === "_sem" ? "Sem obra (obra excluída)" : (obraNome(k) || (grupos[k][0].obraNome + " (obra não encontrada)"));
        html += '<tr class="dob-grupo"><td colspan="6" style="background:rgba(0,64,106,.06);font-weight:800;padding:6px 8px">' + esc(nome) + ' <span class="muted" style="font-weight:400">· ' + grupos[k].length + " documento(s)</span></td></tr>";
      }
      grupos[k].forEach(function (d) { html += linha(M, d); });
    });
    html += "</tbody></table></div>";
    return html;
  };

  function faixaAssinador() {
    var st = G._dobAssinador || {};
    var cor, txt;
    if (!st.carregado) { cor = "#64748b"; txt = "Conferindo o assinador digital deste computador…"; }
    else if (st.instalado) { cor = "#15803d"; txt = "Assinador digital pronto neste computador (versão " + esc(st.versao || "?") + "). Os botões Assinar e Verificar usam o certificado instalado no Windows."; }
    else { cor = "#b45309"; txt = "Assinar e verificar não estão disponíveis aqui: " + esc(st.motivo || "assinador não encontrado.") + " Os documentos continuam abrindo e baixando normalmente."; }
    return '<div class="dob-faixa" style="border-left:4px solid ' + cor + ';background:' + cor + '12;padding:7px 10px;border-radius:6px;font-size:12.5px;margin-bottom:12px">' + txt + "</div>";
  }

  function pillEstado(e) {
    var cores = { assinado: "#15803d", pendencia: "#b45309", emitido: "#475569", rascunho: "#64748b", enviado: "#1d4ed8", substituido: "#64748b", cancelado: "#b91c1c" };
    var c = cores[e.codigo] || "#475569";
    return '<span class="g-pill" style="background:' + c + '1f;color:' + c + ';font-weight:700">' + esc(e.rotulo) + "</span>";
  }

  function linha(M, d) {
    var e = M.estado(d);
    var sig = M.signatarios(d);
    var assin = sig.length ? sig.map(function (s) {
      var c = s.manuscrita ? "#6d28d9" : (s.ok ? "#15803d" : "#b45309");
      return '<div style="font-size:11px;color:' + c + '">' + (s.manuscrita ? "manuscrita: " : "") + esc(s.titular || "?") + (s.n > 1 ? " ×" + s.n : "") + (s.manuscrita || s.ok ? "" : " (pendência)") + "</div>";
    }).join("") : '<span class="muted" style="font-size:11px">—</span>';
    var a = d.arquivo || {};
    var arq = a.nome ? '<div style="font-size:11px;word-break:break-all">' + esc(a.nome) + "</div><div class=\"muted\" style=\"font-size:10.5px\">" + tamanho(a.tam) +
      ((d.versoes || []).length > 1 ? " · " + d.versoes.length + " versões" : "") + "</div>" +
      (presente(d) ? "" : '<div style="font-size:10.5px;color:#b45309">não está neste computador</div>') : '<span class="muted">—</span>';
    var pdf = ehPdfReg(d), vivo = e.codigo !== "cancelado" && e.codigo !== "substituido";
    var acoes = '<button class="btn sm" data-gacao="dob-abrir" data-id="' + esc(d.id) + '">Abrir</button> ' +
      (pdf && vivo ? '<button class="btn sm primary" data-gacao="dob-assinar" data-id="' + esc(d.id) + '">Assinar</button> ' : "") +
      (pdf ? '<button class="btn sm ghost" data-gacao="dob-verificar" data-id="' + esc(d.id) + '">Verificar</button> ' : "") +
      '<button class="btn sm ghost" data-gacao="dob-mais" data-id="' + esc(d.id) + '" title="Ficha, revisão, histórico, baixar, excluir">Mais…</button>';
    var sub = [d.codigo, d.revisao].filter(Boolean).join(" · ");
    var tipo = M.rotuloTipo(d.tipo) + (d.disciplina ? " · " + M.rotuloDisciplina(d.disciplina) : "");
    return '<tr class="dob-linha" data-doc="' + esc(d.id) + '">' +
      "<td><b>" + esc(d.titulo || "—") + "</b>" + (sub ? '<div style="font-size:11px;color:var(--texto-fraco)">' + esc(sub) + "</div>" : "") +
      '<div class="muted" style="font-size:10.5px">' + esc(tipo) + "</div></td>" +
      /* ⚠ DATA do documento é DIA (input date): fmtDia. O fmtData lê "2026-10-02"
         como meia-noite UTC e escrevia "01/10/2026 21:00" (visto na foto da e2e). */
      "<td>" + (d.data ? esc(Util.fmtDia(d.data)) : "—") + "</td>" +
      "<td>" + pillEstado(e) + (d.verificadoEm ? '<div class="muted" style="font-size:10px">verificado ' + esc(quando(d.verificadoEm)) + "</div>" : "") + "</td>" +
      "<td>" + assin + "</td><td>" + arq + "</td>" +
      '<td style="text-align:right;white-space:nowrap">' + acoes + "</td></tr>";
  }

  function acharDoc(id) { try { return Store.obter(eid(), ENT, id); } catch (e) { return null; } }
  function salvarDoc(d) {
    var r = Store.salvar(eid(), ENT, d);
    if (!r) UI.toast("Não consegui gravar a ficha do documento (armazenamento do navegador cheio ou bloqueado). O arquivo continua guardado.", "erro");
    return r;
  }

  /* ---------------------------------------------------------------
   * ADICIONAR
   * --------------------------------------------------------------- */
  function formFicha(prefixo, d, obras) {
    var M = motor();
    return '<div class="row">' +
      K.campo("Obra *", '<select id="' + prefixo + '-obra">' + K.optsRec(obras, "nome", d.obraId || "", "— escolha a obra —") + "</select>") +
      K.campo("Tipo", K.sel(prefixo + "-tipo", K.opts(M.TIPOS, d.tipo || "outro"))) +
      K.campo("Disciplina", K.sel(prefixo + "-disc", K.opts(M.DISCIPLINAS, d.disciplina || ""))) + "</div>" +
      '<div class="row">' + K.campo("Título *", K.inp(prefixo + "-tit", d.titulo || "", "Ex.: Memorial de cálculo da fundação")) + "</div>" +
      '<div class="row">' + K.campo("Código", K.inp(prefixo + "-cod", d.codigo || "", "Ex.: OBRA-FUND")) +
      K.campo("Revisão", K.inp(prefixo + "-rev", d.revisao || "", "Ex.: R00")) +
      K.campo("Data", K.inp(prefixo + "-data", d.data || hoje(), "", "date")) + "</div>" +
      '<div class="row">' + K.campo("Observação", K.inp(prefixo + "-obs", d.observacao || "", "Ex.: versão enviada para aprovação da prefeitura")) + "</div>";
  }
  function lerFicha(prefixo) {
    return { obraId: K.v(prefixo + "-obra"), tipo: K.v(prefixo + "-tipo"), disciplina: K.v(prefixo + "-disc"),
      titulo: K.v(prefixo + "-tit"), codigo: K.v(prefixo + "-cod"), revisao: K.v(prefixo + "-rev"),
      data: K.v(prefixo + "-data"), observacao: K.v(prefixo + "-obs") };
  }

  function novoDocumento() {
    var M = motor();
    var obras = K.lista("obras");
    if (!obras.length) { UI.toast("Cadastre a obra primeiro: todo documento pertence a uma obra.", "erro"); return; }
    var obraPadrao = (G._dobObra !== "todas" && G._dobObra !== "_sem") ? G._dobObra : (obras.length === 1 ? obras[0].id : "");
    var corpo = '<div class="field"><label>Arquivo(s) *</label><input type="file" id="dob-arq" multiple accept=".pdf,application/pdf,image/*,.dwg,.dxf,.ifc,.xlsx,.xls,.docx,.doc,.zip"></div>' +
      '<p class="muted" style="font-size:12px;margin:2px 0 10px">Pode escolher vários. A ficha de cada um vem preenchida pelo nome do arquivo (código, revisão, tipo) — confira antes de salvar. ' +
      'O mesmo arquivo duas vezes na mesma obra não entra de novo.</p>' +
      '<div class="row">' + K.campo("Obra de todos *", '<select id="dob-nv-obra">' + K.optsRec(obras, "nome", obraPadrao, "— escolha a obra —") + "</select>") + "</div>" +
      '<div id="dob-nv-lista"></div>';
    var escolhidos = [];
    UI.modal("Adicionar documento", corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Guardar", classe: "primary", onClick: function () {
        var obraId = K.v("dob-nv-obra");
        if (!obraId) { UI.toast("Escolha a obra.", "erro"); return; }
        if (!escolhidos.length) { UI.toast("Escolha o arquivo.", "erro"); return; }
        var fichas = escolhidos.map(function (f, i) {
          return { arquivo: f, obraId: obraId, tipo: K.v("dob-nv-tipo-" + i), disciplina: K.v("dob-nv-disc-" + i),
            titulo: K.v("dob-nv-tit-" + i) || M.tituloDoNome(f.name), codigo: K.v("dob-nv-cod-" + i),
            revisao: K.v("dob-nv-rev-" + i), data: K.v("dob-nv-data-" + i) };
        });
        UI.fecharModal();
        guardarVarios(fichas);
      } }
    ]);
    var inp = document.getElementById("dob-arq");
    if (inp) inp.onchange = function () {
      escolhidos = Array.prototype.slice.call(inp.files || []);
      var el = document.getElementById("dob-nv-lista"); if (!el) return;
      el.innerHTML = escolhidos.map(function (f, i) {
        return '<div style="border:1px solid var(--linha,#e2e8f0);border-radius:8px;padding:8px;margin-bottom:8px">' +
          '<div style="font-size:12px;font-weight:700;margin-bottom:4px;word-break:break-all">' + esc(f.name) + ' <span class="muted" style="font-weight:400">· ' + tamanho(f.size) + "</span></div>" +
          '<div class="row">' + K.campo("Tipo", K.sel("dob-nv-tipo-" + i, K.opts(M.TIPOS, M.tipoDoNome(f.name)))) +
          K.campo("Disciplina", K.sel("dob-nv-disc-" + i, K.opts(M.DISCIPLINAS, ""))) +
          K.campo("Data", K.inp("dob-nv-data-" + i, hoje(), "", "date")) + "</div>" +
          '<div class="row">' + K.campo("Título", K.inp("dob-nv-tit-" + i, M.tituloDoNome(f.name), "")) +
          K.campo("Código", K.inp("dob-nv-cod-" + i, M.codigoDoNome(f.name), "")) +
          K.campo("Revisão", K.inp("dob-nv-rev-" + i, M.revisaoDoNome(f.name), "R00")) + "</div></div>";
      }).join("");
    };
  }

  /* guarda um por vez (o IndexedDB e a ficha), e só no fim conta o que entrou */
  function guardarVarios(fichas) {
    var M = motor();
    var feitos = 0, repetidos = [], erros = [], paraVerificar = [];
    var i = 0;
    UI.toast("Guardando " + fichas.length + " documento(s)…", "ok");
    (function proximo() {
      if (i >= fichas.length) {
        var msg = feitos + " documento(s) guardado(s)." + (repetidos.length ? " Já existiam (mesmo arquivo): " + repetidos.join(", ") + "." : "") + (erros.length ? " Falharam: " + erros.join("; ") : "");
        UI.toast(msg, erros.length ? "erro" : "ok");
        rerender();
        /* PDF que JÁ chega assinado (ex.: assinado no Adobe) — a ficha conta quem assinou */
        if (paraVerificar.length && (G._dobAssinador || {}).instalado) verificarEmSerie(paraVerificar);
        return;
      }
      var fc = fichas[i++];
      lerArquivo(fc.arquivo).then(function (bytes) {
        var sha = M.sha256Bytes(bytes);
        var dup = M.duplicado(todosDocs(), fc.obraId, sha);
        if (dup) { repetidos.push((dup.titulo || fc.arquivo.name)); return proximo(); }
        var reg = M.normalizar({ obraId: fc.obraId, obraNome: obraNome(fc.obraId), tipo: fc.tipo, disciplina: fc.disciplina,
          titulo: fc.titulo, codigo: fc.codigo, revisao: fc.revisao, data: fc.data, situacao: "emitido" });
        reg.id = Util.uid("dob");
        reg.criadoPor = quem();
        var tipoMime = fc.arquivo.type || (/\.pdf$/i.test(fc.arquivo.name) ? "application/pdf" : "application/octet-stream");
        var chave = M.chaveArquivo(eid(), fc.obraId, reg.id, sha);
        return guardarBytes(chave, fc.arquivo.name, tipoMime, bytes).then(function () {
          M.trocarArquivo(reg, { chave: chave, nome: fc.arquivo.name, tipo: tipoMime, tam: bytes.length, sha256: sha }, quem(), "original", agora());
          M.evento(reg, "adicionou", quem(), fc.arquivo.name + " · " + tamanho(bytes.length) + " · SHA-256 " + sha.slice(0, 16) + "…", agora());
          var errosF = M.validar(reg);
          if (errosF.length) { erros.push(fc.arquivo.name + ": " + errosF[0]); try { Idb.del(chave); } catch (e) {} return proximo(); }
          if (!salvarDoc(reg)) { erros.push(fc.arquivo.name); try { Idb.del(chave); } catch (e) {} return proximo(); }
          feitos++;
          if (M.ehPdf(bytes)) paraVerificar.push(reg.id);
          proximo();
        });
      }).then(null, function (e) { erros.push(fc.arquivo.name + ": " + (e && e.message || e)); proximo(); });
    })();
  }

  function verificarEmSerie(ids) {
    var j = 0;
    (function prox() {
      if (j >= ids.length) { rerender(); return; }
      var d = acharDoc(ids[j++]);
      if (!d) return prox();
      verificarDoc(d, true).then(prox, prox);
    })();
  }

  /* ---------------------------------------------------------------
   * ABRIR / BAIXAR
   * --------------------------------------------------------------- */
  function abrir(d, baixar, chaveVersao) {
    var M = motor();
    var ch = chaveVersao || (d.arquivo && d.arquivo.chave);
    if (!ch) { UI.toast("Este documento não tem arquivo.", "erro"); return; }
    bytesDoAparelho(ch).then(function (b) {
      abrirBytes(b, (d.arquivo && d.arquivo.tipo) || "application/pdf", baixar ? M.nomeParaBaixar(d) : null);
    }, function (e) { UI.toast("Não abriu: " + (e && e.message || e), "erro"); });
  }

  /* ---------------------------------------------------------------
   * VERIFICAR
   * --------------------------------------------------------------- */
  function verificarDoc(d, silencioso) {
    var M = motor();
    if (!servidorLocal()) { if (!silencioso) UI.toast("A verificação roda no computador onde o OrçaPRO está instalado.", "erro"); return Promise.reject(); }
    return bytesDoAparelho(d.arquivo.chave).then(function (b) {
      if (!M.ehPdf(b)) throw new Error("o arquivo não é um PDF.");
      return api("POST", "/__assinador/verificar", { pdf: M.bytesParaBase64(b) });
    }).then(function (r) {
      var atual = acharDoc(d.id) || d;
      M.aplicarVerificacao(atual, r.assinaturas || [], quem(), agora());
      var e = M.estado(atual);
      M.evento(atual, "verificou", quem(), (r.assinaturas || []).length ? e.rotulo : "nenhuma assinatura digital no arquivo", agora());
      salvarDoc(atual);
      if (!silencioso) mostrarVerificacao(atual);
      return atual;
    }).then(null, function (e) {
      if (!silencioso && e) UI.toast("Não verificou: " + (e.message || e), "erro");
      throw e;
    });
  }

  function mostrarVerificacao(d) {
    var M = motor();
    var a = d.assinaturas || [];
    var corpo = a.length ? '<table class="tbl" style="font-size:12px"><thead><tr><th>Quem assinou</th><th>Data/hora</th><th>Íntegro</th><th>Cadeia</th><th>Resultado</th></tr></thead><tbody>' +
      a.map(function (s) {
        return "<tr><td><b>" + esc(s.titular) + "</b>" + (s.documento ? '<div class="muted">' + esc(s.documento) + "</div>" : "") +
          (s.responsavel ? '<div class="muted">Responsável: ' + esc(s.responsavel) + "</div>" : "") +
          '<div class="muted">' + esc(s.emissor) + (s.icp ? " (ICP-Brasil)" : "") + "</div></td>" +
          "<td>" + esc(quando(s.data)) + "</td>" +
          "<td>" + (s.integra ? "Sim" : '<b style="color:#b91c1c">Não</b>') + "</td>" +
          "<td>" + (s.confiavel ? "Reconhecida" : '<span style="color:#b45309">Não reconhecida aqui' + (s.problema ? " (" + esc(s.problema) + ")" : "") + "</span>") + "</td>" +
          "<td>" + (s.ok ? '<b style="color:#15803d">Válida</b>' : '<b style="color:#b45309">Com pendência</b>') + "</td></tr>";
      }).join("") + "</tbody></table>" : '<p>Nenhuma assinatura digital neste arquivo.</p>';
    corpo += '<p class="muted" style="font-size:11.5px;margin-top:10px">Verificação feita neste computador, com as raízes em que o Windows confia; a revogação do certificado não é consultada aqui. ' +
      'Para valor de prova, confira também em <b>validar.iti.gov.br</b>. Situação: <b>' + esc(M.estado(d).rotulo) + "</b>.</p>";
    UI.modal("Assinaturas — " + esc(d.titulo || ""), corpo, [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); rerender(); } }]);
  }

  /* ---------------------------------------------------------------
   * ASSINAR
   * --------------------------------------------------------------- */
  function prefAncora(cert) { try { return localStorage.getItem("orcapro:dob:ancora:" + cert) || ""; } catch (e) { return ""; } }
  function gravarPrefAncora(cert, t) { try { localStorage.setItem("orcapro:dob:ancora:" + cert, t); } catch (e) {} }

  function assinar(d) {
    var M = motor();
    var st = G._dobAssinador || {};
    if (!ehAdminOuAprovador()) { UI.toast("Assinar com o certificado da empresa é do administrador ou de quem aprova documentos (cadastro de Usuários).", "erro"); return; }
    if (!servidorLocal()) { UI.toast("Assine no computador onde o certificado está instalado (o app aberto em localhost). Daqui dá para abrir e verificar a ficha.", "erro"); return; }
    if (!st.instalado) { UI.toast("O assinador digital não está pronto neste computador: " + (st.motivo || "não encontrado") + ".", "erro"); carregarAssinador(true); return; }
    if (!presente(d)) { UI.toast("O arquivo deste documento não está neste computador — adicione-o aqui para assinar.", "erro"); return; }
    UI.toast("Lendo os certificados deste computador…", "ok");
    api("GET", "/__assinador/certificados").then(function (r) {
      var certs = (r && r.certificados) || [];
      if (!certs.length) { UI.toast("Nenhum certificado válido instalado no Windows deste computador. Instale o .pfx com dois cliques.", "erro"); return; }
      modalAssinar(d, certs);
    }, function (e) { UI.toast("Não consegui listar os certificados: " + (e.message || e), "erro"); });
  }

  function modalAssinar(d, certs) {
    var M = motor();
    var ass = assinantes();
    var manus = ass.filter(function (a) { return a.modo === "manuscrita"; });
    var porCert = {}; ass.forEach(function (a) { if (a.modo === "certificado" && a.cert) porCert[a.cert] = a; });
    var jaAssinado = (d.assinaturas || []).length > 0;
    var ancora0 = (porCert[certs[0].documento] && porCert[certs[0].documento].ancora) || prefAncora(certs[0].documento);
    var corpo =
      K.campo("Certificado *", '<select id="dob-as-cert">' + certs.map(function (c, i) {
        return '<option value="' + i + '">' + esc(c.rotulo) + "</option>";
      }).join("") + "</select>") +
      '<div class="field"><label>Onde vai a assinatura</label>' +
        '<label style="display:flex;gap:6px;align-items:flex-start;font-weight:400"><input type="radio" name="dob-as-onde" value="linha" checked> ' +
          '<span>Sobre a linha de assinatura acima deste texto (o nome como está no documento):</span></label>' +
        K.inp("dob-as-ancora", ancora0, "Ex.: Eng. Civil Fulano de Tal") +
        '<label style="display:flex;gap:6px;align-items:center;font-weight:400;margin-top:4px"><input type="checkbox" id="dob-as-todas"' + (d.tipo === "projeto" ? " checked" : "") + "> Em todas as páginas onde o texto aparece (prancha: uma assinatura por folha)</label>" +
        '<label style="display:flex;gap:6px;align-items:center;font-weight:400;margin-top:6px"><input type="radio" name="dob-as-onde" value="canto"> Última página, canto inferior direito</label></div>' +
      K.campo("Razão (opcional — aparece no carimbo)", K.inp("dob-as-razao", "", "Ex.: Contratada")) +
      '<div class="field"><label>Assinatura manuscrita autorizada (opcional)</label>' +
        (jaAssinado
          ? '<p class="muted" style="font-size:12px;margin:0">Indisponível: este arquivo <b>já tem assinatura digital</b>, e pôr a imagem agora invalidaria a que está lá. ' +
            'A manuscrita entra antes — use a primeira versão (Mais… → Histórico) ou peça a quem falta que assine digitalmente (gov.br ou certificado).</p>'
          : (manus.length
            ? '<select id="dob-as-manus"><option value="">— nenhuma —</option>' + manus.map(function (a) {
                return '<option value="' + esc(a.id) + '">' + esc(a.nome) + (a.papel ? " · " + esc(a.papel) : "") + "</option>";
              }).join("") + '</select><div id="dob-as-aut" class="muted" style="font-size:11.5px;margin-top:4px"></div>'
            : '<p class="muted" style="font-size:12px;margin:0">Nenhuma cadastrada. Em <b>Assinantes</b> você cadastra a assinatura (PNG sem fundo) de quem não tem certificado e registra a autorização dele.</p>')) +
      "</div>" +
      '<div style="border:1px solid #f59e0b55;background:#f59e0b12;border-radius:8px;padding:8px;font-size:12px">' +
        "Assinatura com certificado ICP-Brasil tem validade jurídica (MP 2.200-2/2001). O arquivo de agora continua guardado como versão anterior, e a assinatura fica no histórico do documento.</div>";
    UI.modal("Assinar — " + esc(d.titulo || ""), corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Assinar agora", classe: "primary", onClick: function () {
        var c = certs[+K.v("dob-as-cert") || 0];
        var ondeEl = document.querySelector('input[name="dob-as-onde"]:checked');
        var onde = ondeEl ? ondeEl.value : "linha";
        var ancora = K.v("dob-as-ancora");
        if (onde === "linha" && !ancora) { UI.toast("Informe o texto debaixo da linha de assinatura, ou escolha o canto da última página.", "erro"); return; }
        var todasEl = document.getElementById("dob-as-todas");
        var manusId = jaAssinado ? "" : K.v("dob-as-manus");
        var pedido = { cert: c.documento, razao: K.v("dob-as-razao") };
        if (onde === "linha") { pedido.ancora = ancora; if (todasEl && todasEl.checked) pedido.paginas = "todas"; gravarPrefAncora(c.documento, ancora); }
        UI.fecharModal();
        executarAssinatura(d, c, pedido, manusId ? ass.filter(function (a) { return a.id === manusId; })[0] : null);
      } }
    ]);
    var selC = document.getElementById("dob-as-cert");
    if (selC) selC.onchange = function () {
      var c = certs[+selC.value || 0];
      var a = (porCert[c.documento] && porCert[c.documento].ancora) || prefAncora(c.documento);
      var el = document.getElementById("dob-as-ancora"); if (el && a) el.value = a;
    };
    var selM = document.getElementById("dob-as-manus");
    if (selM) selM.onchange = function () {
      var a = manus.filter(function (x) { return x.id === selM.value; })[0];
      var el = document.getElementById("dob-as-aut");
      if (el) el.innerHTML = a ? "Autorização registrada: " + esc(M.textoAutorizacao(a)) + ". A imagem vai sobre a linha acima de “" + esc(a.ancora) + "”." : "";
    };
  }

  function executarAssinatura(d, cert, pedido, manus) {
    var M = motor();
    UI.toast("Assinando com " + cert.titular + "… (alguns segundos)", "ok");
    var pImg = manus ? bytesDoAparelho(manus.imagem.chave).then(null, function () {
      throw new Error("a imagem da assinatura de " + manus.nome + " não está neste computador (cadastre de novo em Assinantes).");
    }) : Promise.resolve(null);
    var antigo = null;
    pImg.then(function (img) {
      if (manus) {
        pedido.manuscrita = M.bytesParaBase64(img);
        pedido.manuscritaAncora = manus.ancora;
        pedido.autorizacao = M.textoAutorizacao(manus);
      }
      return bytesDoAparelho(d.arquivo.chave);
    }).then(function (b) {
      antigo = b;
      if (!M.ehPdf(b)) throw new Error("o arquivo não é um PDF.");
      pedido.pdf = M.bytesParaBase64(b);
      return api("POST", "/__assinador/assinar", pedido);
    }).then(function (r) {
      var novo = M.base64ParaBytes(r.pdf);
      var sha = M.sha256Bytes(novo);
      /* ⚠ o hash que o servidor mediu tem de bater com o que chegou aqui:
         resposta truncada (aba lenta, memória) guardaria um PDF quebrado
         como "assinado" e o original pareceria substituído */
      if (r.sha256 && r.sha256 !== sha) throw new Error("o PDF assinado chegou incompleto (o código de conferência não bate). Nada foi trocado — tente de novo.");
      var atual = acharDoc(d.id) || d;
      var chave = M.chaveArquivo(eid(), atual.obraId || "sem", atual.id, sha);
      var nomeArq = String((atual.arquivo && atual.arquivo.nome) || "documento.pdf").replace(/(\s*-\s*assinado)?(\.pdf)?$/i, "") + " - assinado.pdf";
      return guardarBytes(chave, nomeArq, "application/pdf", novo).then(function () {
        var motivo = "assinado por " + cert.titular + " (" + cert.documentoFormatado + ")" + (manus ? " + manuscrita autorizada de " + manus.nome : "");
        M.trocarArquivo(atual, { chave: chave, nome: nomeArq, tipo: "application/pdf", tam: novo.length, sha256: sha }, quem(), motivo, agora());
        if (manus) {
          atual.manuscritas = (atual.manuscritas || []).concat([{ nome: manus.nome, papel: manus.papel || "", autorizacao: M.textoAutorizacao(manus),
            por: quem(), em: agora(), paginas: (r.manuscrita || []).map(function (m) { return m.pagina; }) }]);
          M.evento(atual, "aplicou manuscrita", quem(), manus.nome + " — " + M.textoAutorizacao(manus), agora());
        }
        M.evento(atual, "assinou", quem(), motivo + " · " + (r.assinaturas || []).length + " carimbo(s), pág. " +
          (r.assinaturas || []).map(function (a) { return a.pagina; }).join(", ") + " · SHA-256 " + sha.slice(0, 16) + "…", agora());
        salvarDoc(atual);
        return verificarDoc(atual, true).then(function (v) { return v; }, function () { return atual; });
      });
    }).then(function (final) {
      var e = M.estado(final);
      UI.toast("Assinado. Situação: " + e.rotulo + ". A versão anterior continua guardada no histórico.", e.codigo === "assinado" ? "ok" : "aviso");
      rerender();
    }, function (e) {
      UI.toast("Não assinou: " + (e && e.message || e), "erro");
    });
  }

  /* ---------------------------------------------------------------
   * MAIS: ficha, revisão, histórico, situação, excluir
   * --------------------------------------------------------------- */
  function mais(d) {
    var M = motor();
    var e = M.estado(d);
    var vivo = e.codigo !== "cancelado" && e.codigo !== "substituido";
    var corpo = '<p style="margin:0 0 8px"><b>' + esc(d.titulo) + "</b> " + esc([d.codigo, d.revisao].filter(Boolean).join(" · ")) + " — " + pillEstado(e) + "</p>" +
      '<p class="muted" style="font-size:12px;margin:0 0 12px">' + esc(M.rotuloTipo(d.tipo)) + " · " + esc(obraNome(d.obraId) || d.obraNome || "") +
      (d.arquivo ? " · SHA-256 do arquivo atual: <code>" + esc(String(d.arquivo.sha256 || "").slice(0, 24)) + "…</code>" : "") + "</p>" +
      '<div class="flex" style="gap:8px;flex-wrap:wrap">' +
      '<button class="btn" id="dob-m-hist">Histórico e versões</button>' +
      '<button class="btn" id="dob-m-baixar">Baixar com nome padrão</button>' +
      '<button class="btn" id="dob-m-ficha">Editar ficha</button>' +
      (vivo ? '<button class="btn" id="dob-m-rev">Nova revisão</button>' : "") +
      (vivo && d.situacao !== "enviado" ? '<button class="btn" id="dob-m-env">Marcar como enviado</button>' : "") +
      (vivo ? '<button class="btn" id="dob-m-canc">Cancelar documento</button>' : "") +
      (d.situacao === "cancelado" ? '<button class="btn" id="dob-m-reat">Reativar</button>' : "") +
      '<button class="btn" id="dob-m-excl" style="color:#b91c1c">Excluir</button></div>';
    UI.modal("Documento", corpo, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    function liga(id, fn) { var b = document.getElementById(id); if (b) b.onclick = function () { UI.fecharModal(); fn(); }; }
    liga("dob-m-hist", function () { historico(d); });
    liga("dob-m-baixar", function () { abrir(d, true); });
    liga("dob-m-ficha", function () { editarFicha(d); });
    liga("dob-m-rev", function () { novaRevisao(d); });
    liga("dob-m-env", function () { mudarSituacao(d, "enviado", "marcou como enviado"); });
    liga("dob-m-canc", function () { cancelar(d); });
    liga("dob-m-reat", function () { mudarSituacao(d, "emitido", "reativou"); });
    liga("dob-m-excl", function () { excluir(d); });
  }

  function editarFicha(d) {
    var M = motor();
    UI.modal("Editar ficha — " + esc(d.titulo || ""), formFicha("dob-ed", d, K.lista("obras")), [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Salvar", classe: "primary", onClick: function () {
        var f = lerFicha("dob-ed");
        var atual = acharDoc(d.id) || d;
        var mud = [];
        ["obraId", "tipo", "disciplina", "titulo", "codigo", "revisao", "data", "observacao"].forEach(function (k) {
          if (String(atual[k] || "") !== String(f[k] || "")) { mud.push(k + ": “" + (atual[k] || "") + "” → “" + (f[k] || "") + "”"); atual[k] = f[k]; }
        });
        if (!mud.length) { UI.fecharModal(); return; }
        atual.obraNome = obraNome(atual.obraId) || atual.obraNome;
        var n = M.normalizar(atual);
        var er = M.validar(n);
        if (er.length) { UI.toast(er[0], "erro"); return; }
        M.evento(n, "editou a ficha", quem(), mud.join("; "), agora());
        salvarDoc(n);
        UI.fecharModal();
        rerender();
      } }
    ]);
  }

  function novaRevisao(d) {
    var M = motor();
    var rev = M.proximaRevisao(d.revisao);
    var corpo = '<div class="field"><label>Arquivo da nova revisão *</label><input type="file" id="dob-rv-arq" accept=".pdf,application/pdf,image/*,.dwg,.dxf,.ifc,.xlsx,.docx,.zip"></div>' +
      '<div class="row">' + K.campo("Revisão", K.inp("dob-rv-rev", rev, "")) + K.campo("Data", K.inp("dob-rv-data", hoje(), "", "date")) + "</div>" +
      '<div class="row">' + K.campo("O que mudou", K.inp("dob-rv-obs", "", "Ex.: cota da sapata conforme o calculista")) + "</div>" +
      '<p class="muted" style="font-size:12px">A revisão atual (' + esc(d.revisao || "sem número") + ") fica guardada e marcada como substituída; as duas ficam ligadas no histórico.</p>";
    UI.modal("Nova revisão — " + esc(d.titulo || ""), corpo, [
      { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Guardar revisão", classe: "primary", onClick: function () {
        var inp = document.getElementById("dob-rv-arq");
        var f = inp && inp.files && inp.files[0];
        if (!f) { UI.toast("Escolha o arquivo da revisão.", "erro"); return; }
        var revN = K.v("dob-rv-rev") || rev, data = K.v("dob-rv-data"), obs = K.v("dob-rv-obs");
        UI.fecharModal();
        lerArquivo(f).then(function (bytes) {
          var sha = M.sha256Bytes(bytes);
          var dup = M.duplicado(todosDocs(), d.obraId, sha);
          if (dup) { UI.toast("Este arquivo já está guardado nesta obra (" + (dup.titulo || "") + " " + (dup.revisao || "") + ").", "erro"); return; }
          var nova = M.novaRevisao(acharDoc(d.id) || d, revN);
          nova.id = Util.uid("dob"); nova.data = data; nova.observacao = obs; nova.criadoPor = quem();
          var tipoMime = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "application/octet-stream");
          var chave = M.chaveArquivo(eid(), nova.obraId, nova.id, sha);
          return guardarBytes(chave, f.name, tipoMime, bytes).then(function () {
            M.trocarArquivo(nova, { chave: chave, nome: f.name, tipo: tipoMime, tam: bytes.length, sha256: sha }, quem(), "original", agora());
            M.evento(nova, "adicionou revisão", quem(), revN + " substitui " + (d.revisao || "a anterior") + (obs ? " — " + obs : "") + " · SHA-256 " + sha.slice(0, 16) + "…", agora());
            if (!salvarDoc(nova)) return;
            var ant = acharDoc(d.id) || d;
            ant.substituidoPor = nova.id;
            M.evento(ant, "substituído", quem(), "pela revisão " + revN, agora());
            salvarDoc(ant);
            UI.toast("Revisão " + revN + " guardada; a " + (d.revisao || "anterior") + " ficou como substituída.", "ok");
            rerender();
            if (M.ehPdf(bytes) && (G._dobAssinador || {}).instalado) verificarEmSerie([nova.id]);
          });
        }).then(null, function (e) { UI.toast("Não guardou: " + (e && e.message || e), "erro"); });
      } }
    ]);
  }

  function historico(d) {
    var M = motor();
    var vs = (d.versoes || []).slice().reverse();
    var corpo = "<h4 style=\"margin:0 0 6px\">Versões do arquivo</h4>" +
      '<table class="tbl" style="font-size:11.5px"><thead><tr><th>Quando</th><th>Por</th><th>O quê</th><th>SHA-256</th><th>Tamanho</th><th></th></tr></thead><tbody>' +
      vs.map(function (v, i) {
        var tem = !G._dobPresentes || G._dobPresentes[v.chave];
        return "<tr><td>" + esc(quando(v.em)) + "</td><td>" + esc(v.por) + "</td><td>" + esc(v.motivo) + (i === 0 ? " <b>(atual)</b>" : "") + "</td>" +
          "<td><code>" + esc(String(v.sha256 || "").slice(0, 16)) + "…</code></td><td>" + tamanho(v.tam) + "</td>" +
          "<td>" + (tem ? '<button class="btn sm ghost" data-dob-ver="' + esc(v.chave) + '">Abrir</button>' : '<span class="muted">não está aqui</span>') + "</td></tr>";
      }).join("") + "</tbody></table>";
    if ((d.manuscritas || []).length) {
      corpo += '<h4 style="margin:12px 0 6px">Assinaturas manuscritas autorizadas</h4><ul style="font-size:12px;margin:0;padding-left:18px">' +
        d.manuscritas.map(function (m) { return "<li>" + esc(m.nome) + " — " + esc(m.autorizacao) + " · aplicada por " + esc(m.por) + " em " + esc(quando(m.em)) + "</li>"; }).join("") + "</ul>";
    }
    corpo += '<h4 style="margin:12px 0 6px">Histórico</h4><table class="tbl" style="font-size:11.5px"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>' +
      (d.historico || []).slice().reverse().map(function (h) {
        return "<tr><td>" + esc(quando(h.em)) + "</td><td>" + esc(h.por) + "</td><td>" + esc(h.acao) + "</td><td>" + esc(h.detalhe) + "</td></tr>";
      }).join("") + "</tbody></table>";
    if (d.substitui) { var a = acharDoc(d.substitui); corpo += '<p class="muted" style="font-size:12px">Substitui: ' + esc(a ? (a.titulo + " " + (a.revisao || "")) : "revisão anterior (não encontrada)") + "</p>"; }
    if (d.substituidoPor) { var b = acharDoc(d.substituidoPor); corpo += '<p class="muted" style="font-size:12px">Substituído por: ' + esc(b ? (b.titulo + " " + (b.revisao || "")) : "revisão nova (não encontrada)") + "</p>"; }
    UI.modal("Histórico — " + esc(d.titulo || ""), corpo, [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    Array.prototype.forEach.call(document.querySelectorAll("[data-dob-ver]"), function (b) {
      b.onclick = function () { abrir(d, false, b.getAttribute("data-dob-ver")); };
    });
  }

  function mudarSituacao(d, sit, acao) {
    var M = motor();
    var atual = acharDoc(d.id) || d;
    atual.situacao = sit;
    M.evento(atual, acao, quem(), "", agora());
    salvarDoc(atual);
    rerender();
  }
  function cancelar(d) {
    var M = motor();
    UI.modal("Cancelar documento", '<p>O documento continua guardado (com o arquivo e o histórico), marcado como cancelado.</p>' +
      K.campo("Motivo *", K.inp("dob-canc-mot", "", "Ex.: emitido com o endereço errado")), [
      { texto: "Voltar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Cancelar documento", classe: "primary", onClick: function () {
        var mot = K.v("dob-canc-mot");
        if (!mot) { UI.toast("Diga o motivo: é o que explica, daqui a um ano, por que este documento não vale.", "erro"); return; }
        var atual = acharDoc(d.id) || d;
        atual.situacao = "cancelado";
        M.evento(atual, "cancelou", quem(), mot, agora());
        salvarDoc(atual);
        UI.fecharModal(); rerender();
      } }
    ]);
  }
  function excluir(d) {
    var M = motor();
    var assinado = (d.assinaturas || []).length > 0;
    if (assinado && !(typeof Auth === "undefined" || (Auth.ehAdmin && Auth.ehAdmin()))) {
      UI.toast("Documento assinado só o administrador exclui. Prefira Cancelar: ele fica guardado como prova.", "erro"); return;
    }
    UI.modal("Excluir documento", "<p>Excluir <b>" + esc(d.titulo) + "</b>" + (d.revisao ? " (" + esc(d.revisao) + ")" : "") + "? A ficha some de todos os aparelhos e " +
      (d.versoes || []).length + " versão(ões) do arquivo somem deste computador.</p>" +
      (assinado ? '<p style="color:#b91c1c"><b>Este documento está assinado.</b> Documento assinado é prova: o normal é <b>Cancelar</b>, que mantém tudo guardado.</p>' : ""), [
      { texto: "Voltar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
      { texto: "Excluir", classe: "primary", onClick: function () {
        var chaves = (d.versoes || []).map(function (v) { return v.chave; }).concat(d.arquivo ? [d.arquivo.chave] : []);
        Store.excluir(eid(), ENT, d.id);
        chaves.forEach(function (k) { try { Idb.del(k); if (G._dobPresentes) delete G._dobPresentes[k]; } catch (e) {} });
        UI.fecharModal();
        UI.toast("Documento excluído.", "ok");
        rerender();
      } }
    ]);
  }

  /* ---------------------------------------------------------------
   * ASSINANTES
   * --------------------------------------------------------------- */
  function telaAssinantes() {
    var M = motor();
    var l = (function () { try { return Store.listar(eid(), ENT_ASS) || []; } catch (e) { return []; } })();
    var lista = l.length ? '<table class="tbl" style="font-size:12px"><thead><tr><th>Quem</th><th>Como assina</th><th>Texto debaixo da linha</th><th></th></tr></thead><tbody>' +
      l.map(function (a) {
        var como = a.modo === "manuscrita"
          ? "Manuscrita autorizada<div class=\"muted\" style=\"font-size:10.5px\">" + esc(M.textoAutorizacao(a)) + "</div>"
          : "Certificado digital · " + esc(a.cert.length === 14 ? "CNPJ" : "CPF") + " " + esc(a.cert);
        return "<tr" + (a.ativo === false ? ' style="opacity:.5"' : "") + "><td><b>" + esc(a.nome) + "</b>" + (a.papel ? '<div class="muted">' + esc(a.papel) + "</div>" : "") + "</td><td>" + como + "</td><td>" + esc(a.ancora) + "</td>" +
          '<td style="white-space:nowrap"><button class="btn sm ghost" data-dob-ass-onoff="' + esc(a.id) + '">' + (a.ativo === false ? "Reativar" : "Desativar") + "</button></td></tr>";
      }).join("") + "</tbody></table>" : '<p class="muted">Ninguém cadastrado ainda.</p>';
    var corpo = lista +
      '<div style="border:1px solid var(--linha,#e2e8f0);border-radius:10px;padding:10px;margin-top:10px">' +
      '<b style="font-size:12px;display:block;margin-bottom:6px">Cadastrar</b>' +
      '<div class="row">' + K.campo("Como assina", K.sel("dob-ass-modo", K.opts([["certificado", "Certificado digital (ICP-Brasil) deste computador"], ["manuscrita", "Assinatura manuscrita autorizada (imagem)"]], "certificado"))) + "</div>" +
      '<div class="row">' + K.campo("Nome *", K.inp("dob-ass-nome", "", "Ex.: Fulano de Tal")) + K.campo("Papel", K.inp("dob-ass-papel", "", "Ex.: Responsável técnico")) + "</div>" +
      '<div class="row">' + K.campo("Texto debaixo da linha de assinatura *", K.inp("dob-ass-ancora", "", "Como está no documento. Ex.: Arq. e Urb. Fulano de Tal")) + "</div>" +
      '<div id="dob-ass-cert-box"><div class="row">' + K.campo("CPF ou CNPJ do certificado *", K.inp("dob-ass-cert", "", "Só números")) + "</div></div>" +
      '<div id="dob-ass-man-box" style="display:none">' +
        '<div class="field"><label>Imagem da assinatura (PNG sem fundo) *</label><input type="file" id="dob-ass-img" accept="image/png"></div>' +
        '<div class="row">' + K.campo("Autorização: o que a pessoa autorizou *", K.inp("dob-ass-aut", "", "Ex.: uso nos documentos técnicos da obra X em que é responsável técnico")) + "</div>" +
        '<div class="row">' + K.campo("Quem confirmou a autorização *", K.inp("dob-ass-aut-por", quem(), "")) + K.campo("Data da autorização *", K.inp("dob-ass-aut-em", hoje(), "", "date")) + "</div>" +
        '<p class="muted" style="font-size:11.5px">A imagem só vai em documento <b>antes</b> da assinatura digital, e cada uso fica no histórico do documento com esta autorização. ' +
        "Imagem de assinatura sem autorização da pessoa é falsificação.</p></div>" +
      '<button class="btn sm primary" id="dob-ass-add">Cadastrar</button></div>';
    UI.modal("Assinantes", corpo, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    var modo = document.getElementById("dob-ass-modo");
    if (modo) modo.onchange = function () {
      var m = modo.value === "manuscrita";
      document.getElementById("dob-ass-cert-box").style.display = m ? "none" : "";
      document.getElementById("dob-ass-man-box").style.display = m ? "" : "none";
    };
    /* com o assinador pronto, o CPF/CNPJ vem do próprio certificado — digitar errado deixaria o cadastro sem par */
    if ((G._dobAssinador || {}).instalado && servidorLocal()) {
      api("GET", "/__assinador/certificados").then(function (r) {
        var box = document.getElementById("dob-ass-cert-box"); if (!box || !r || !r.certificados || !r.certificados.length) return;
        box.innerHTML = '<div class="row">' + K.campo("Certificado *", '<select id="dob-ass-cert">' + r.certificados.map(function (c) {
          return '<option value="' + esc(c.documento) + '">' + esc(c.rotulo) + "</option>";
        }).join("") + "</select>") + "</div>";
      }, function () {});
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-dob-ass-onoff]"), function (b) {
      b.onclick = function () {
        var a = Store.obter(eid(), ENT_ASS, b.getAttribute("data-dob-ass-onoff")); if (!a) return;
        a.ativo = a.ativo === false; Store.salvar(eid(), ENT_ASS, a); UI.fecharModal(); telaAssinantes();
      };
    });
    var add = document.getElementById("dob-ass-add");
    if (add) add.onclick = function () {
      var m = K.v("dob-ass-modo");
      var a = M.normalizarAssinante({ modo: m, nome: K.v("dob-ass-nome"), papel: K.v("dob-ass-papel"), ancora: K.v("dob-ass-ancora"),
        cert: K.v("dob-ass-cert"), autorizacao: { texto: K.v("dob-ass-aut"), por: K.v("dob-ass-aut-por"), em: K.v("dob-ass-aut-em") } });
      a.id = Util.uid("das");
      var fin = function () {
        var er = M.validarAssinante(a);
        if (er.length) { UI.toast(er[0], "erro"); return; }
        if (!Store.salvar(eid(), ENT_ASS, a)) { UI.toast("Não consegui gravar o cadastro.", "erro"); return; }
        UI.toast(a.nome + " cadastrado.", "ok");
        UI.fecharModal(); telaAssinantes();
      };
      if (m !== "manuscrita") return fin();
      var f = document.getElementById("dob-ass-img"); f = f && f.files && f.files[0];
      if (!f) { UI.toast("Escolha a imagem da assinatura (PNG sem fundo).", "erro"); return; }
      if (!/png/i.test(f.type || "") && !/\.png$/i.test(f.name)) { UI.toast("Use PNG sem fundo: JPG traz o fundo branco junto e tampa a linha do documento.", "erro"); return; }
      lerArquivo(f).then(function (bytes) {
        var chave = "docass:" + eid() + ":" + a.id;
        return guardarBytes(chave, f.name, "image/png", bytes).then(function () { a.imagem = { chave: chave, nome: f.name }; fin(); });
      }).then(null, function (e) { UI.toast("Não guardou a imagem: " + (e && e.message || e), "erro"); });
    };
  }

  /* ---------------------------------------------------------------
   * AÇÕES E FIAÇÃO
   * --------------------------------------------------------------- */
  function comDoc(fn) {
    return function (ds) {
      var d = acharDoc(ds && ds.id);
      if (!d) { UI.toast("Documento não encontrado (pode ter sido excluído em outro aparelho).", "erro"); rerender(); return; }
      return fn(d, ds);
    };
  }
  G.registrarAcoes("documentos", {
    "dob-novo": function () { novoDocumento(); },
    "dob-obra": function (d) { G._dobObra = (d && d.value) || "todas"; rerender(); },
    "dob-tipo": function (d) { G._dobTipo = (d && d.value) || ""; rerender(); },
    "dob-sit": function (d) { G._dobSit = (d && d.value != null) ? d.value : "vigentes"; rerender(); },
    "dob-abrir": comDoc(function (d) { abrir(d, false); }),
    "dob-assinar": comDoc(function (d) { assinar(d); }),
    "dob-verificar": comDoc(function (d) { verificarDoc(d, false).then(null, function () {}); }),   // o Fechar do resultado redesenha
    "dob-mais": comDoc(function (d) { mais(d); }),
    "dob-assinantes": function () { telaAssinantes(); }
  });

  G.registrarWire("documentos", function () {
    /* ⚠ campo de digitar NÃO leva data-gacao (o dispatcher escuta clique e
       redesenharia a tela debaixo do dedo) — liga aqui, no Enter/troca */
    var b = document.getElementById("dob-busca");
    if (b) {
      var aplicar = function () { if (G._dobBusca !== b.value) { G._dobBusca = b.value; rerender(); var nb = document.getElementById("dob-busca"); if (nb) { nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); } } };
      b.onchange = aplicar;
      b.onkeydown = function (e) { if (e.key === "Enter") aplicar(); };
    }
  });

  /* para a suíte e2e e para quem quiser chamar de outro módulo */
  G._dob = { carregarAssinador: carregarAssinador, verificarDoc: verificarDoc, presente: presente, guardarVarios: guardarVarios };

})(typeof window !== "undefined" ? window : this);
