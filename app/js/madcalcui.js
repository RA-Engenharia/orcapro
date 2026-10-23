/* =====================================================================
 * madcalcui.js — a TELA DO CÁLCULO DA ESTRUTURA DE MADEIRA (aba Carpintaria
 * & Marcenaria do BIM, painel "Cálculo estrutural"; prévia do modelador).
 * Fina: quem calcula e quem escreve os documentos são os motores puros
 *   js/maddimensionar.js (+ madmateriais, madespecie, madpiso, madmodelo,
 *   madanalise, madligcalc, madwoodframe, madmercado, madcatalogo)
 *   js/madmemorial.js · js/madpranchas.js · js/madmanual.js · js/madcype.js
 *   js/madcalcworker.js — o pacote da obra e o cálculo num Web Worker
 * Padrão único de tela (ROTEIRO-MODULO.md, js/modulo.js): cabeçalho → aviso
 * → indicadores → abas → seções. As abas são o caminho de quem calcula:
 *   1. Dados da obra — o PACOTE DA OBRA (um .json/.json.gz, ou os arquivos
 *      soltos da obra, ou um .zip com eles) e o exemplo pronto;
 *   2. Premissas — espécie por função, classe, umidade, flecha, decisões do RT;
 *   3. Resultado — resumo por função (η, governa, combinação), reprovações e
 *      impedimentos em destaque, α_cr, reações para a fundação, compra;
 *   4. Documentos — memorial, pranchas, manual de montagem, pacote do CYPE 3D
 *      e lista de compra (.xlsx).
 * ⚠ O CÁLCULO RODA NO WORKER e o resultado completo FICA LÁ: a tela recebe só o
 *   resumo, e cada documento é pedido ao Worker (js/madcalcworker.js explica o
 *   porquê). Sem Worker, os motores são injetados na página e a tela avisa que
 *   fica parada durante o cálculo.
 * ⚠ Os ~5 MB do pacote não vão para o localStorage (o teto é ~5 M caracteres e
 *   é dividido com o resto do app): ficam na sessão, e a tela oferece baixar o
 *   pacote da obra. As premissas e os dados do documento ficam na OBRA
 *   (localStorage `orcapro:madeira:calc:<obra>`).
 * ⚠ Sem backdrop-filter: a janela fica por cima do BIM (z 49, abaixo do modal
 *   do app, z 50) — backdrop-filter quebra position:fixed dos filhos.
 * ===================================================================== */
(function (global) {
  "use strict";
  var doc = global.document;

  /* ================================================================ UTIL */
  function W() { return global.MadCalcWorker || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fmt(v, c) {
    if (v == null || !isFinite(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s.join(".")) !== 0 ? "−" : "") + i + (c ? "," + s[1] : "");
  }
  function pct(v) { return v == null || !isFinite(v) ? "—" : fmt(v * 100, 0) + " %"; }
  function toast(t, tipo, ms) { try { if (global.UI && UI.toast) UI.toast(t, tipo || "ok", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }
  function ico(nome, t) { try { if (global.Icones && Icones.get) return Icones.get(nome, t || 16) || ""; } catch (e) {} return ""; }
  function Ges() { return global.Gestao; }
  function obraId() { var g = Ges(); return String((g && g._bimSel) || "geral"); }
  function obraApp() { var g = Ges(), o = null; try { if (g && g._bimSel && global.Store && global.Auth) o = Store.obter(Auth.empresaId(), "obras", g._bimSel); } catch (e) {} return o; }
  function versao() { try { return (global.CONFIG && CONFIG.versao) || ""; } catch (e) { return ""; } }
  function hojeBR() { var d = new Date(); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function nomeSeguro(s) { var t = String(s || "obra"); return global.OpFormato && OpFormato.nomeSeguro ? OpFormato.nomeSeguro(t) : t.replace(/[^\w.-]+/g, "-"); }
  function chave() { return "orcapro:madeira:calc:" + obraId(); }
  function lerSalvo() { try { var t = global.localStorage.getItem(chave()); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function salvar() { try { global.localStorage.setItem(chave(), JSON.stringify({ premissas: UIC.prem, documento: UIC.docu, em: Date.now() })); return true; } catch (e) { return false; } }
  function baixar(nome, dados, mime) {
    /* teste de 1 hora (js/testemodulo.js): entregável em teste sai com a marca; módulo vencido não sai */
    if (global.TesteModulo && TesteModulo.marcarArquivo) { var wT = TesteModulo.marcarArquivo(nome, dados, mime, "modela:marcenaria"); if (!wT) return false; nome = wT.nome; dados = wT.dados; }
    UIC.baixados.push(nome);
    if (global.BimMetalUI && BimMetalUI.baixar) return BimMetalUI.baixar(nome, dados, mime, "modela:marcenaria");   /* o dono do entregável é a Marcenaria, não a Metálica (teste de 1 hora) */
    try { var bl = new Blob([dados], { type: mime || "application/octet-stream" }), u = URL.createObjectURL(bl), a = doc.createElement("a"); a.href = u; a.download = nome; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000); return true; } catch (e) { return false; }
  }
  /* ⚠ TRAVA DE LICENÇA NA FUNÇÃO (21/10/2026, js/licencafuncao.js): a fita esconde o grupo da Marcenaria quando a disciplina não
     está liberada, mas o cálculo e cada entrega também são chamados pelos botões desta janela, pela API e por atalho — cada
     função confere sozinha. Em teste de 1 hora libera e conta (o entregável sai com a marca, pelo `baixar`); vencido ou sem
     licença recusa e mostra a oferta. Consultar (abrir a janela, ver o que já foi calculado) continua livre. Sem o módulo: não trava. */
  function lic(acao) { var L = global.LicencaFuncao; return L && L.guarda ? L.guarda("marcenaria", acao) : true; }
  function bt(acao, texto, o) {
    o = o || {};
    return '<button type="button" class="btn' + (o.pri ? " primary" : "") + (o.sm ? " sm" : "") + '" data-mdc-acao="' + acao + '"' + (o.v != null ? ' data-mdc-v="' + esc(o.v) + '"' : "") + (o.dis ? " disabled" : "") + (o.dica ? ' title="' + esc(o.dica) + '"' : "") + ">" + (o.ico ? ico(o.ico, 15) + " " : "") + esc(texto) + "</button>";
  }
  function M() { return global.Modulo || null; }
  function sec(o) { var Mo = M(); if (Mo) return Mo.secao(o); return '<section class="mod-sec"><div class="mod-sec-cab"><div><h2>' + esc(o.titulo) + '</h2></div>' + (o.acoesHtml ? '<div class="mod-sec-acoes">' + o.acoesHtml + "</div>" : "") + '</div><div class="mod-sec-corpo">' + (o.corpoHtml || "") + "</div></section>"; }
  function pil(t, tom) { var Mo = M(); return Mo ? Mo.pilula(t, tom) : '<span class="mod-pil mod-pil-' + tom + '">' + esc(t) + "</span>"; }

  /* ================================================================ ESTADO */
  var UIC = {
    aba: "dados", pacote: null, msgs: [], prem: null, docu: null, resumo: null, calc: null, modoCalc: null, worker: null, obra: null,
    pranchas: null, saidas: {}, baixados: [], erro: null, carregando: false
  };
  var ETAPA_NOME = { motores: "Carregando os motores do cálculo", especies: "Espécies por função", piso: "Piso seco — barrotes, vigas e Painel Wall", modelo: "Modelo analítico (barras e paredes em casca)",
    analise: "Análise global — montagem e solução", esforcos: "Esforços por barra", estabilidade: "Estabilidade global (α_cr)", verificacao: "Verificação por membro — NBR 7190-1:2022",
    compra: "Lista de compra", paredes: "Paredes de contraventamento e ligações" };
  function conferirObra() {
    if (UIC.obra === obraId()) return;
    UIC.obra = obraId(); UIC.resumo = null; UIC.pranchas = null; UIC.saidas = {};
    /* o resultado guardado no Worker é da obra anterior: solta o processo (e a memória dele) */
    if (UIC.worker && !(UIC.calc && UIC.calc.rodando)) { try { UIC.worker.terminate(); } catch (e) {} UIC.worker = null; }
    var s = lerSalvo(), W0 = W();
    UIC.prem = s && s.premissas ? s.premissas : (W0 ? W0.premissasPadrao() : null);
    UIC.docu = s && s.documento ? s.documento : null;
  }
  function garantirDocu() {
    if (UIC.docu) return UIC.docu;
    var o = obraApp() || {}, p = UIC.pacote;
    UIC.docu = { obra: (p && p.obra && p.obra.nome) || o.nome || "", local: (p && p.obra && p.obra.local) || o.local || "", proprietario: o.clienteNome || "", contratante: "", codigo: "EST-MAD", revisao: "R00" };
    return UIC.docu;
  }

  /* ================================================================ ESTILO */
  function estilo() {
    if (!doc || doc.getElementById("mdc-estilo")) return;
    var st = doc.createElement("style"); st.id = "mdc-estilo";
    st.textContent = [
      ".mdc-veu{position:fixed;inset:0;z-index:49;background:var(--bg);color:var(--texto);display:flex;flex-direction:column}",
      ".mdc-jan{position:relative;flex:1;overflow:auto;padding:18px 24px 40px;outline:none}",
      ".mdc-in{max-width:1320px;margin:0 auto;display:flex;flex-direction:column;gap:16px}",
      ".mdc-fechar{position:absolute;top:14px;right:16px;z-index:2}",
      ".mdc-in .mod-cab{padding-right:48px}",
      ".mdc-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px}",
      ".mdc-campo{display:flex;flex-direction:column;gap:4px;font-size:var(--t-peq);color:var(--texto-fraco)}",
      ".mdc-campo input,.mdc-campo select{font-size:var(--t-base);color:var(--texto)}",
      ".mdc-arqs{list-style:none;margin:0;padding:0}",
      ".mdc-arqs li{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--linha)}",
      ".mdc-arqs li:last-child{border-bottom:0} .mdc-arqs .mdc-q{flex:1;min-width:0}",
      ".mdc-arqs small,.mdc-fraco{color:var(--texto-fraco)}",
      ".mdc-msgs{margin:8px 0 0;padding-left:18px;color:var(--texto-fraco);font-size:var(--t-peq)}",
      ".mdc-eta{display:flex;align-items:center;gap:8px;justify-content:flex-end}",
      ".mdc-eta i{display:block;width:72px;height:6px;border-radius:var(--raio-sm);background:var(--surface-2);overflow:hidden;position:relative}",
      ".mdc-eta i b{position:absolute;left:0;top:0;bottom:0;background:var(--verde)} .mdc-eta i b.al{background:var(--amarelo)} .mdc-eta i b.er{background:var(--vermelho)}",
      ".mdc-prog{max-width:640px;margin:24px auto;text-align:center}",
      ".mdc-barra{height:8px;border-radius:var(--raio-sm);background:var(--surface-2);overflow:hidden;margin:14px 0}",
      ".mdc-barra i{display:block;height:100%;background:var(--aco);transition:width .4s var(--ease)}",
      ".mdc-etapas{list-style:none;margin:12px auto 0;padding:0;text-align:left;max-width:460px}",
      ".mdc-etapas li{padding:5px 0 5px 22px;position:relative;color:var(--texto-fraco)}",
      ".mdc-etapas li::before{content:'';position:absolute;left:4px;top:11px;width:8px;height:8px;border-radius:50%;background:var(--linha-forte)}",
      ".mdc-etapas li.feito{color:var(--texto)} .mdc-etapas li.feito::before{background:var(--verde)}",
      ".mdc-etapas li.agora{color:var(--aco);font-weight:var(--p-forte)} .mdc-etapas li.agora::before{background:var(--aco)}",
      ".mdc-lista{margin:0;padding-left:18px} .mdc-lista li{margin:4px 0}",
      ".mdc-docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}",
      ".mdc-doc{border:1px solid var(--linha);border-radius:var(--raio);padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--surface)}",
      ".mdc-doc b{font-weight:var(--p-forte)} .mdc-doc p{margin:0;color:var(--texto-fraco);font-size:var(--t-peq)} .mdc-doc .btn{align-self:flex-start}",
      ".mdc-folhas{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}",
      ".mdc-folha{border:1px solid var(--linha);border-radius:var(--raio);overflow:hidden;background:var(--surface)}",
      ".mdc-folha .mdc-fig{background:white;aspect-ratio:841/594;cursor:zoom-in}",
      ".mdc-folha .mdc-fig svg{width:100%;height:100%;display:block}",
      ".mdc-folha .mdc-fc{padding:10px 12px;display:flex;gap:8px;align-items:center;justify-content:space-between}",
      ".mdc-tab-rola{overflow-x:auto}",
      "table.tbl.mdc-t th,table.tbl.mdc-t td{padding:8px 10px}",
      ".mdc-det summary{cursor:pointer;color:var(--aco)}",
      "@media (max-width:640px){.mdc-jan{padding:12px 12px 32px}.mdc-folhas,.mdc-docs{grid-template-columns:1fr}}"
    ].join("\n");
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ================================================================ JANELA */
  function raiz() { return doc ? doc.getElementById("mdc-veu") : null; }
  function garantir() {
    estilo(); conferirObra();
    var v = raiz(); if (v) return v;
    v = doc.createElement("div"); v.id = "mdc-veu"; v.className = "mdc-veu";
    v.innerHTML = '<div class="mdc-jan" role="dialog" aria-modal="true" aria-labelledby="mdc-tit" tabindex="-1"></div>';
    doc.body.appendChild(v);
    ligar(v);
    /* foco na janela ao abrir e Esc no documento: aberta por um comando da fita, a janela ficava sem foco, o Esc não chegava
     * nela e o véu continuava por cima da fita — o clique no comando seguinte caía no véu (e2e-bim-ferramentas intermitente,
     * achado da frente da Metálica em 13/10/2026) */
    setTimeout(function () { var j = v.querySelector(".mdc-jan"); if (j && raiz() === v && !v.contains(doc.activeElement)) try { j.focus({ preventScroll: true }); } catch (e) {} }, 0);
    if (!garantir.escDoc) {
      garantir.escDoc = true;
      doc.addEventListener("keydown", function (ev) {
        var r = raiz();
        if (!r || ev.key !== "Escape" || r.contains(ev.target) || doc.querySelector(".modal-bg, .mod-mais-menu:not([hidden])")) return;
        fechar();
      });
    }
    return v;
  }
  function fechar() {
    var v = raiz(); if (!v) return;
    if (UIC.calc && UIC.calc.rodando && !global.confirm("O cálculo está rodando. Fechar e cancelar?")) return;
    if (UIC.calc && UIC.calc.rodando) cancelar(true);
    salvar(); v.remove();
  }

  function cabecalho() {
    var Mo = M(), p = UIC.pacote, nome = (UIC.docu && UIC.docu.obra) || (p && p.obra && p.obra.nome) || ((obraApp() || {}).nome) || "";
    var sub = (nome ? nome + " · " : "") + "NBR 7190-1:2022 · NBR 6120 · NBR 6123 · NBR 8681";
    var acoes = [bt("exemplo", "Carregar exemplo", { ico: "camadas", dica: "Abre o pacote de exemplo: um quiosque de madeira real anonimizado (907 peças, piso seco, wood frame e duas coberturas)" }),
                 bt("arquivos", "Carregar arquivos", { ico: "pasta", dica: "O pacote da obra (.json ou .json.gz), os arquivos soltos da obra ou um .zip com eles" })];
    if (Mo) acoes.push(Mo.SEP);
    acoes.push(bt("baixar-pacote", "Baixar pacote da obra", { ico: "baixar", dis: !p, dica: "Junta os arquivos carregados num pacote só (.json.gz) para abrir de novo depois" }));
    acoes.push(bt("restaurar", "Restaurar premissas padrão", { ico: "livro" }));
    var cal = UIC.calc && UIC.calc.rodando;
    var pri = '<button type="button" class="btn primary" data-mdc-acao="calcular"' + (cal || !pacoteOk() ? " disabled" : "") + ' title="Calcula em paralelo (a tela continua livre) — leva cerca de meio minuto">' + ico("raio", 15) + " Calcular</button>";
    var h = Mo ? Mo.cab({ iconeHtml: ico("estrutura", 22), titulo: "Estrutura de madeira", sub: sub, acoes: acoes, primariaHtml: pri }).replace("<h1>", '<h1 id="mdc-tit">')
               : '<header class="mod-cab"><h1 id="mdc-tit">Estrutura de madeira</h1>' + acoes.join("") + pri + "</header>";
    return h;
  }
  function pacoteOk() { var w = W(); return !!(UIC.pacote && w && w.conferir(UIC.pacote).ok); }

  function avisoTopo() {
    var Mo = M(), r = UIC.resumo; if (!Mo) return "";
    if (UIC.erro) return Mo.aviso({ tom: "erro", titulo: "O cálculo não terminou", texto: UIC.erro });
    if (UIC.calc && UIC.calc.modo === "pagina" && UIC.calc.rodando) return Mo.aviso({ tom: "alerta", titulo: "Calculando na própria página", texto: "O navegador não abriu o processo paralelo (" + (UIC.calc.motivo || "") + "): a tela fica parada até terminar." });
    if (!r) return "";
    if (r.impedimentos.length) return Mo.aviso({ tom: "erro", titulo: "Não emitir: " + r.impedimentos.length + " impedimento(s)", texto: r.impedimentos[0] + (r.impedimentos.length > 1 ? " (e mais " + (r.impedimentos.length - 1) + " — ver Resultado)" : ""), acaoHtml: bt("aba", "Ver impedimentos", { v: "resultado", sm: 1 }) });
    if (r.reprovacoes.length) return Mo.aviso({ tom: "erro", titulo: r.reprovacoes.length + " função(ões) reprovada(s)", texto: r.reprovacoes.map(function (x) { return x.funcao + " (η " + fmt(x.etaMax, 2) + ")"; }).join("; ") });
    if (r.pendencias.length) return Mo.aviso({ tom: "alerta", titulo: r.pendencias.length + " pendência(s) para o RT", texto: r.pendencias[0] });
    return "";
  }
  function kpis() {
    var Mo = M(), r = UIC.resumo; if (!Mo || !r) return "";
    var pior = r.funcoes.slice().sort(function (a, b) { return b.etaMax - a.etaMax; })[0], vol = 0;
    r.porEspecie.forEach(function (x) { vol += x.volume_m3 || 0; });
    return Mo.kpis([
      { rotulo: "Situação", valor: r.ok ? "Atende" : "Não atende", sub: r.ok ? "sem reprovação nem impedimento" : (r.reprovacoes.length ? r.reprovacoes.length + " reprovação(ões)" : r.impedimentos.length + " impedimento(s)"), tom: r.ok ? "pos" : "neg", id: "mdc-k-situacao" },
      { rotulo: "Aproveitamento", valor: pior ? fmt(pior.etaMax, 2) : "—", sub: pior ? "η máximo · " + pior.funcao : "", tom: pior && pior.etaMax > 1 ? "neg" : (pior && pior.etaMax > 0.9 ? "alerta" : ""), id: "mdc-k-eta" },
      { rotulo: "Estabilidade global", valor: r.alphaCr == null ? "—" : fmt(r.alphaCr, 1), sub: r.alphaCr == null ? "α_cr não calculado" : "α_cr · " + (r.alphaCr >= 10 ? "indeslocável (≥ 10)" : "deslocável — 2ª ordem"), tom: "info", id: "mdc-k-alpha" },
      { rotulo: "Membros", valor: String(r.verificados), sub: r.funcoes.length + " funções verificadas", id: "mdc-k-membros" },
      { rotulo: "Madeira", valor: fmt(vol, 2) + " m³", sub: r.porEspecie.map(function (x) { return x.nome + " " + fmt(x.volume_m3, 2); }).join(" · "), id: "mdc-k-volume" }
    ]);
  }
  function abas() {
    var Mo = M(), L = [{ id: "dados", rotulo: "Dados da obra" }, { id: "premissas", rotulo: "Premissas" }, { id: "resultado", rotulo: "Resultado" }, { id: "documentos", rotulo: "Documentos" }];
    var lista = L.map(function (a) { return { rotulo: a.rotulo, ativa: UIC.aba === a.id, attrs: 'data-mdc-acao="aba" data-mdc-v="' + a.id + '"' }; });
    return Mo ? Mo.abas(lista) : "";
  }
  function render() {
    var v = garantir(), jan = v.querySelector(".mdc-jan"), top = jan.scrollTop;
    var corpo = "";
    if (UIC.calc && UIC.calc.rodando) corpo = calculandoHtml();
    else if (UIC.aba === "dados") corpo = dadosHtml();
    else if (UIC.aba === "premissas") corpo = premissasHtml();
    else if (UIC.aba === "resultado") corpo = resultadoHtml();
    else if (UIC.aba === "documentos") corpo = documentosHtml();
    jan.innerHTML = '<button type="button" class="btn sm icone mdc-fechar" data-mdc-acao="fechar" aria-label="Fechar" title="Fechar (Esc) — as premissas ficam salvas na obra">' + (ico("fechar", 16) || "×") + "</button>" +
      '<div class="mdc-in">' + cabecalho() + avisoTopo() + kpis() + abas() + '<div data-mdc="corpo" data-mdc-aba="' + UIC.aba + '">' + corpo + "</div></div>";
    jan.setAttribute("data-mdc-aba", UIC.aba);
    if (UIC.manterRolagem) jan.scrollTop = top;
    UIC.manterRolagem = false;
    if (!v.contains(doc.activeElement)) { try { jan.focus({ preventScroll: true }); } catch (e) { try { jan.focus(); } catch (e2) {} } }
  }

  /* ================================================================ 1. DADOS DA OBRA */
  function dadosHtml() {
    var w = W(); if (!w) return '<p>O módulo do cálculo da madeira não carregou (js/madcalcworker.js).</p>';
    var p = UIC.pacote, Mo = M();
    var input = '<input type="file" data-mdc="arquivo" multiple accept=".json,.gz,.zip,application/json,application/gzip,application/zip" hidden>';
    if (!p) {
      return input + (Mo ? Mo.vazio({ icone: "estrutura", titulo: "Nenhuma obra carregada", texto: "Carregue o pacote da obra de madeira (.json ou .json.gz) — ou os arquivos da obra: fonte de peças, sobreposição, cargas, vento, ligações, cena, piso e paredes. Para ver o caminho inteiro, abra o exemplo pronto.",
        acaoHtml: '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' + bt("exemplo", "Carregar exemplo: Quiosque", { pri: 1, ico: "camadas" }) + bt("arquivos", "Carregar arquivos", { ico: "pasta" }) + "</div>" }) : "") +
        (UIC.carregando ? '<p class="mdc-fraco" data-mdc="carregando">Lendo os arquivos…</p>' : "");
    }
    var cf = w.conferir(p);
    var linhas = w.ARQUIVOS.map(function (d) {
      var t = !!p.arquivos[d.id];
      return '<li data-mdc-arq="' + d.id + '"' + (t ? ' data-mdc-tem="1"' : "") + '><span class="mdc-q"><b>' + esc(d.rotulo) + "</b><br><small>" + esc(d.arquivo) + (d.obrigatorio ? " · obrigatório" : " · opcional") + "</small></span>" +
        (t ? pil("Carregado", "ok") : pil(d.obrigatorio ? "Falta" : "Sem este arquivo", d.obrigatorio ? "erro" : "neutro")) + "</li>";
    }).join("");
    var h = input;
    h += sec({ titulo: "Pacote da obra", sub: (p.obra && p.obra.nome ? p.obra.nome + " · " : "") + cf.pecas + " peças na fonte" + (p.exemplo ? " · exemplo" : ""),
      acoesHtml: bt("arquivos", "Acrescentar arquivos", { sm: 1, ico: "pasta" }) + bt("limpar", "Limpar", { sm: 1 }),
      corpoHtml: (p.exemplo ? '<p class="mdc-fraco" style="margin:0 0 8px">' + esc(p.exemplo.texto) + "</p>" : "") + '<ul class="mdc-arqs" data-mdc="arquivos">' + linhas + "</ul>" +
        (UIC.msgs.length ? '<ul class="mdc-msgs">' + UIC.msgs.slice(-6).map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul>" : "") });
    if (cf.avisos.length) h += sec({ titulo: "O que fica de fora com o que foi carregado", corpoHtml: '<ul class="mdc-lista">' + cf.avisos.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" });
    if (cf.ok) h += '<div style="display:flex;justify-content:flex-end;gap:8px">' + bt("aba", "Conferir as premissas", { v: "premissas" }) + bt("calcular", "Calcular", { pri: 1, ico: "raio" }) + "</div>";
    else h += '<p class="mdc-fraco">Falta: ' + esc(cf.falta.map(function (f) { return f.rotulo; }).join("; ")) + ".</p>";
    return h;
  }

  /* ler arquivos: .json, .json.gz, .zip (com .json dentro) — o tipo vem dos bytes, não da extensão */
  function bytesDe(f) {
    if (f.arrayBuffer) return f.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, erro) { var r = new FileReader(); r.onload = function () { ok(new Uint8Array(r.result)); }; r.onerror = function () { erro(r.error); }; r.readAsArrayBuffer(f); });
  }
  function descomprimir(bytes, formato) {
    if (typeof global.DecompressionStream === "undefined") return Promise.reject(new Error("este navegador não descomprime arquivos (" + formato + "); use o .json sem compressão"));
    return new Response(new Blob([bytes]).stream().pipeThrough(new global.DecompressionStream(formato))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function texto(bytes) { return typeof global.TextDecoder !== "undefined" ? new global.TextDecoder("utf-8").decode(bytes) : String.fromCharCode.apply(null, bytes); }
  function jsonsDe(nome, bytes) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) return descomprimir(bytes, "gzip").then(function (b) { return jsonsDe(nome.replace(/\.gz$/i, ""), b); });
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      if (!global.BimBcf || !BimBcf.zipLer) return Promise.reject(new Error("o leitor de .zip não carregou"));
      return BimBcf.zipLer(bytes, { inflar: function (b) { return descomprimir(b, "deflate-raw"); } }).then(function (ents) {
        var nomes = Object.keys(ents).filter(function (k) { return /\.json(\.gz)?$/i.test(k) && !/(^|\/)__MACOSX\//.test(k); });
        return Promise.all(nomes.map(function (k) { return jsonsDe(k.split("/").pop(), ents[k]); })).then(function (ls) { return [].concat.apply([], ls); });
      });
    }
    try { return Promise.resolve([{ nome: nome, json: JSON.parse(texto(bytes).replace(/^﻿/, "")) }]); }
    catch (e) { return Promise.reject(new Error("“" + nome + "” não é JSON válido (" + e.message + ")")); }
  }
  function juntarLista(lista) {
    var w = W(); if (!UIC.pacote) UIC.pacote = w.novoPacote({ nome: ((obraApp() || {}).nome) || "" });
    var ok = 0;
    lista.forEach(function (x) {
      var r = w.juntar(UIC.pacote, x.nome, x.json);
      if (r.ok) { ok++; UIC.msgs.push(x.nome + " → " + r.rotulo); } else UIC.msgs.push(r.motivo);
    });
    UIC.resumo = null; UIC.pranchas = null; UIC.saidas = {}; UIC.erro = null;
    if (UIC.docu && !UIC.docu.obra && UIC.pacote.obra && UIC.pacote.obra.nome) UIC.docu.obra = UIC.pacote.obra.nome;
    return ok;
  }
  function lerArquivos(files) {
    var lista = Array.prototype.slice.call(files || []);
    if (!lista.length) return Promise.resolve(0);
    UIC.carregando = true; render();
    return Promise.all(lista.map(function (f) { return bytesDe(f).then(function (b) { return jsonsDe(f.name, b); }).catch(function (e) { UIC.msgs.push(e.message); return []; }); }))
      .then(function (ls) {
        var n = juntarLista([].concat.apply([], ls)); UIC.carregando = false; UIC.aba = "dados"; render();
        toast(n ? n + " arquivo(s) no pacote da obra." : "Nenhum arquivo reconhecido — veja a lista na tela.", n ? "ok" : "aviso");
        return n;
      });
  }
  function exemplo() {
    var w = W(); if (!w) { toast("O módulo do cálculo da madeira não carregou.", "erro"); return Promise.resolve(false); }
    garantir(); UIC.carregando = true; UIC.aba = "dados"; render();
    var url = "data/madeira-exemplo.json.gz" + (versao() ? "?v=" + encodeURIComponent(versao()) : "");
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (b) { return jsonsDe("madeira-exemplo.json.gz", new Uint8Array(b)); })
      .then(function (ls) {
        UIC.pacote = null; UIC.msgs = []; UIC.docu = null;
        juntarLista(ls); garantirDocu(); UIC.carregando = false; render();
        var cf = w.conferir(UIC.pacote);
        status("Exemplo carregado: " + cf.pecas + " peças, " + cf.tem.length + " arquivos da obra.");
        return cf.ok;
      }, function (e) { UIC.carregando = false; render(); toast("Não consegui abrir o exemplo (data/madeira-exemplo.json.gz): " + e.message, "erro", 9000); return false; });
  }
  function baixarPacote() {
    var p = UIC.pacote; if (!p) { toast("Carregue os arquivos da obra primeiro.", "aviso"); return; }
    var t = JSON.stringify(p), nome = nomeSeguro((UIC.docu && UIC.docu.obra) || p.nome || "obra") + "-madeira-obra.json";
    if (typeof global.CompressionStream === "undefined") { baixar(nome, t, "application/json"); return; }
    new Response(new Blob([t]).stream().pipeThrough(new global.CompressionStream("gzip"))).arrayBuffer().then(function (b) {
      baixar(nome + ".gz", new Uint8Array(b), "application/gzip"); toast("Pacote da obra baixado (" + fmt(b.byteLength / 1048576, 1) + " MB).", "ok");
    }, function () { baixar(nome, t, "application/json"); });
  }

  /* ================================================================ 2. PREMISSAS */
  function premissasHtml() {
    var w = W(); if (!w) return "";
    var P = UIC.prem || (UIC.prem = w.premissasPadrao()), op = w.opcoes();
    function selEsp(campo, val) { return '<select data-mdc-campo="' + campo + '">' + op.especies.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === val ? " selected" : "") + ">" + esc(e.nome.split(" (")[0]) + "</option>"; }).join("") + "</select>"; }
    var h = "";
    h += sec({ titulo: "Espécie por função", sub: "Quem escolhe a madeira é o cliente; o cálculo recusa a que não passa. Trocar a função troca o modelo, a compra, as pranchas e o memorial juntos.",
      corpoHtml: '<div class="mdc-tab-rola"><table class="tbl mdc-t" data-mdc="funcoes"><thead><tr><th>Função</th><th>Espécie</th><th>No cálculo</th></tr></thead><tbody>' + op.funcoes.map(function (f) {
        return "<tr><td>" + esc(f.rotulo) + "</td><td>" + selEsp("esp." + f.id, P.especiePorFuncao[f.id]) + "</td><td>" + (f.modelo ? pil("Verificada", "info") : pil("Só compra e desenho", "neutro")) + "</td></tr>";
      }).join("") + "</tbody></table></div>" });
    var usadas = {}; Object.keys(P.especiePorFuncao).forEach(function (k) { usadas[P.especiePorFuncao[k]] = 1; }); Object.keys(P.classes || {}).forEach(function (k) { usadas[k] = 1; });
    h += sec({ titulo: "Classe de resistência (NBR 7190-1:2022)", sub: "Premissa conservadora do RT.",
      corpoHtml: '<div class="mdc-grade">' + Object.keys(usadas).map(function (k) {
        var e = op.especies.filter(function (x) { return x.id === k; })[0]; if (!e) return "";
        var val = (P.classes || {})[k] || e.classe2022;
        return '<label class="mdc-campo"><span>' + esc(e.nome.split(" (")[0]) + '</span><select data-mdc-campo="cls.' + esc(k) + '">' + op.classes.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === val ? " selected" : "") + ">" + esc(c.nome) + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</div>" });
    var pf = P.perfil || {};
    h += sec({ titulo: "Umidade e deslocamentos", corpoHtml: '<div class="mdc-grade">' +
      '<label class="mdc-campo"><span>Classe de umidade</span><select data-mdc-campo="perfil.umidade">' + [1, 2, 3, 4].map(function (u) { return '<option value="' + u + '"' + (num(pf.umidade, 3) === u ? " selected" : "") + ">Classe " + u + (u === 3 ? " (ambiente externo coberto, litoral)" : "") + "</option>"; }).join("") + "</select></label>" +
      '<label class="mdc-campo"><span>Flecha no vão: L /</span><input data-mdc-campo="perfil.limVao" inputmode="decimal" value="' + esc(pf.limVao == null ? 350 : pf.limVao) + '"></label>' +
      '<label class="mdc-campo"><span>Flecha no balanço: L /</span><input data-mdc-campo="perfil.limBalanco" inputmode="decimal" value="' + esc(pf.limBalanco == null ? 175 : pf.limBalanco) + '"></label>' +
      '<label class="mdc-campo"><span>ψ2 da sobrecarga (quase permanente)</span><input data-mdc-campo="perfil.psi2" inputmode="decimal" value="' + esc(String(pf.psi2 == null ? 0.4 : pf.psi2).replace(".", ",")) + '"></label>' +
      "</div>" });
    var dec = P.decisoesRT || {}, kd = Object.keys(dec);
    h += sec({ titulo: "Decisões do RT (troca de seção)", sub: "Valem no cálculo e na compra. Desligar mostra o resultado sem a decisão.",
      corpoHtml: kd.length ? '<div class="mdc-tab-rola"><table class="tbl mdc-t" data-mdc="decisoes"><thead><tr><th>Usar</th><th>Grupo</th><th class="num">b (cm)</th><th class="num">h (cm)</th><th>Espécie</th><th>Motivo</th></tr></thead><tbody>' + kd.map(function (g) {
        var d = dec[g];
        return '<tr><td><input type="checkbox" data-mdc-campo="dec.' + esc(g) + '.ativo"' + (d.ativo !== false ? " checked" : "") + ' aria-label="Usar a decisão ' + esc(g) + '"></td><td>' + esc(g) + '</td><td class="num"><input style="width:64px" inputmode="decimal" data-mdc-campo="dec.' + esc(g) + '.b_cm" value="' + esc(d.b_cm) + '"></td><td class="num"><input style="width:64px" inputmode="decimal" data-mdc-campo="dec.' + esc(g) + '.h_cm" value="' + esc(d.h_cm) + '"></td><td>' + selEsp("dec." + g + ".especie", d.especie) + '</td><td class="mdc-fraco" style="max-width:520px">' + esc(d.motivo) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="mdc-fraco">Nenhuma decisão registrada.</p>' });
    h += '<div style="display:flex;justify-content:flex-end;gap:8px">' + bt("restaurar", "Restaurar padrão") + bt("calcular", "Calcular", { pri: 1, ico: "raio", dis: !pacoteOk() }) + "</div>";
    return h;
  }
  function mudarCampo(campo, valor, el) {
    var P = UIC.prem || (UIC.prem = W().premissasPadrao()), p = campo.split(".");
    if (p[0] === "esp") P.especiePorFuncao[p[1]] = valor;
    else if (p[0] === "cls") { P.classes = P.classes || {}; P.classes[p[1]] = valor; }
    else if (p[0] === "perfil") { P.perfil = P.perfil || {}; P.perfil[p[1]] = num(valor, null); }
    else if (p[0] === "dec") { var d = P.decisoesRT[p[1]]; if (!d) return; d[p[2]] = p[2] === "ativo" ? !!(el && el.checked) : (p[2] === "especie" ? valor : num(valor, d[p[2]])); }
    else if (p[0] === "docu") { garantirDocu()[p[1]] = valor; }
    salvar();
    if (UIC.resumo && p[0] !== "docu") { UIC.desatualizado = true; }
  }

  /* ================================================================ 3. CALCULAR */
  function calcular() {
    if (!lic("calcular a estrutura")) return false;
    var w = W(); if (!w) { toast("O módulo do cálculo da madeira não carregou.", "erro"); return false; }
    garantir();
    if (!pacoteOk()) { UIC.aba = "dados"; render(); toast("Faltam arquivos no pacote da obra — veja a lista.", "aviso", 6000); return false; }
    if (UIC.calc && UIC.calc.rodando) return false;
    if (UIC.worker) { try { UIC.worker.terminate(); } catch (e) {} UIC.worker = null; }
    salvar();
    var prem = JSON.parse(JSON.stringify(UIC.prem || w.premissasPadrao())), id = "m" + Date.now();
    UIC.calc = { rodando: true, id: id, t0: Date.now(), etapa: "motores", feitas: {}, n: 0, modo: null };
    UIC.erro = null; UIC.resumo = null; UIC.pranchas = null; UIC.saidas = {}; UIC.desatualizado = false; render();
    var relogio = setInterval(function () { if (!UIC.calc || UIC.calc.id !== id) { clearInterval(relogio); return; } var el = doc.querySelector("[data-mdc='progresso']"); if (el) el.innerHTML = progressoHtml(); }, 500);
    var wk = null;
    try { wk = new global.Worker("js/madcalcworker.js" + (versao() ? "?v=" + encodeURIComponent(versao()) : "")); } catch (eW) { wk = null; }
    if (!wk) { naPagina(prem, "o navegador não abriu o processo paralelo"); return true; }
    UIC.worker = wk; UIC.calc.modo = "worker"; UIC.modoCalc = "worker";
    wk.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.tipo === "saida" || (m.tipo === "erro" && m.qual)) { respostaSaida(m); return; }
      if (!UIC.calc || m.id !== UIC.calc.id) return;
      if (m.tipo === "progresso") progresso(m);
      else if (m.tipo === "motores") { UIC.calc.feitas.motores = true; if (UIC.calc.etapa === "motores") UIC.calc.etapa = null; }
      else if (m.tipo === "fim") { var r = null; try { r = JSON.parse(m.texto); } catch (eP) { falhou("resumo ilegível: " + eP.message); return; } terminar(r, m.ms); }
      else if (m.tipo === "erro") { if (/Não carregou/.test(m.mensagem || "")) { try { wk.terminate(); } catch (e) {} UIC.worker = null; naPagina(prem, m.mensagem); } else falhou(m.mensagem); }
    };
    wk.onerror = function (ev) { if (!UIC.calc || UIC.calc.id !== id) return; if (ev && ev.preventDefault) ev.preventDefault(); try { wk.terminate(); } catch (e) {} UIC.worker = null; naPagina(prem, "o processo paralelo falhou (" + ((ev && ev.message) || "erro") + ")"); };
    wk.postMessage({ tipo: "calcular", id: id, pacote: UIC.pacote, premissas: prem });
    return true;
  }
  /* sem Worker: os motores entram na página (todos de novo, na ordem: o maddimensionar guarda as referências na carga) */
  var motoresPagina = null;
  function carregarMotoresPagina() {
    if (motoresPagina) return motoresPagina;
    var w = W(), lista = w.MOTORES.concat(w.SAIDAS.filter(function (a) { return /^mad/.test(a) || !global[w.GLOBAL_DE[a]]; }));
    motoresPagina = new Promise(function (ok, erro) {
      var i = 0;
      (function prox() {
        if (i >= lista.length) { ok(true); return; }
        var arq = lista[i++], s = doc.createElement("script");
        s.src = "js/" + arq + (versao() ? "?v=" + encodeURIComponent(versao()) : ""); s.async = false;
        s.onload = prox; s.onerror = function () { motoresPagina = null; erro(new Error("não carregou js/" + arq)); };
        (doc.head || doc.documentElement).appendChild(s);
      })();
    });
    return motoresPagina;
  }
  function naPagina(prem, motivo) {
    var c = UIC.calc; if (!c) return;
    c.modo = "pagina"; c.motivo = motivo; UIC.modoCalc = "pagina"; render();
    carregarMotoresPagina().then(function () {
      setTimeout(function () {
        if (UIC.calc !== c) return;
        var t0 = Date.now(), r;
        try { r = W().resumir(W().rodar(UIC.pacote, prem, function (p) { c.etapa = p.etapa; })); } catch (e) { falhou(e && e.message ? e.message : String(e)); return; }
        terminar(JSON.parse(JSON.stringify(r)), Date.now() - t0);
      }, 60);
    }, function (e) { falhou(e.message); });
  }
  function progresso(m) {
    var c = UIC.calc; if (!c) return;
    var et = W().ETAPAS, i = et.indexOf(m.etapa);
    et.forEach(function (k, j) { if (j < i) c.feitas[k] = true; });
    c.etapa = m.etapa; if (m.n) c.n = m.n; if (m.barras) c.barras = m.barras;
    var el = doc && doc.querySelector("[data-mdc='progresso']"); if (el) el.innerHTML = progressoHtml();
  }
  function cancelar(calado) {
    if (UIC.worker) { try { UIC.worker.terminate(); } catch (e) {} UIC.worker = null; }
    UIC.calc = null; if (!calado) { render(); toast("Cálculo cancelado.", "aviso", 3000); }
  }
  function falhou(msg) {
    UIC.calc = null; UIC.erro = msg || "erro desconhecido"; UIC.aba = "dados";
    if (UIC.worker) { try { UIC.worker.terminate(); } catch (e) {} UIC.worker = null; }
    if (raiz()) render(); toast("Cálculo da madeira: " + UIC.erro, "erro", 9000);
  }
  function terminar(r, ms) {
    var c = UIC.calc; UIC.calc = null;
    r.tempoTela = ms || (c ? Date.now() - c.t0 : 0); r.modoCalculo = c ? c.modo : null;
    UIC.resumo = r; UIC.aba = "resultado";
    if (raiz()) render();
    var pior = r.funcoes.slice().sort(function (a, b) { return b.etaMax - a.etaMax; })[0];
    status("Estrutura de madeira: " + (r.ok ? "atende" : "não atende") + " — " + r.funcoes.length + " funções, pior η " + (pior ? fmt(pior.etaMax, 2) + " (" + pior.funcao + ")" : "—") + (r.alphaCr != null ? ", α_cr " + fmt(r.alphaCr, 1) : "") + (r.impedimentos.length ? "; " + r.impedimentos.length + " impedimento(s)" : "") + ".");
  }
  function calculandoHtml() {
    var c = UIC.calc || {};
    return '<div class="mdc-prog" data-mdc="calculando"><h2 style="margin:0 0 6px">Calculando a estrutura de madeira</h2><p class="mdc-fraco">' +
      (c.modo === "pagina" ? "Rodando na própria página — a tela fica parada até terminar." : "O cálculo roda em paralelo; esta janela continua respondendo.") +
      '</p><div data-mdc="progresso">' + progressoHtml() + '</div><p style="margin-top:16px">' + bt("cancelar", "Cancelar o cálculo") + "</p></div>";
  }
  function progressoHtml() {
    var c = UIC.calc || {}, et = W() ? W().ETAPAS : [], seg = Math.round((Date.now() - (c.t0 || Date.now())) / 1000), i = Math.max(0, et.indexOf(c.etapa));
    var h = '<div class="mdc-fraco">' + seg + " s" + (c.etapa === "verificacao" && c.n ? " · " + c.n + " verificações" : "") + (c.barras ? " · " + c.barras + " barras" : "") + "</div>";
    h += '<div class="mdc-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(100 * i / Math.max(1, et.length)) + '"><i style="width:' + Math.max(4, Math.round(100 * (i + 0.5) / Math.max(1, et.length))) + '%"></i></div><ul class="mdc-etapas">';
    et.forEach(function (k) {
      if (k === "motores" && c.modo === "pagina") return;
      var cls = c.etapa === k ? "agora" : (c.feitas && c.feitas[k] ? "feito" : "");
      h += '<li class="' + cls + '">' + esc(ETAPA_NOME[k] || k) + "</li>";
    });
    return h + "</ul>";
  }

  /* ================================================================ 4. RESULTADO */
  function barraEta(e) {
    var w = Math.min(100, Math.max(2, Math.round((e || 0) * 100))), cl = e > 1 ? "er" : (e > 0.9 ? "al" : "");
    return '<span class="mdc-eta"><span>' + fmt(e, 2) + '</span><i aria-hidden="true"><b class="' + cl + '" style="width:' + w + '%"></b></i></span>';
  }
  function resultadoHtml() {
    var r = UIC.resumo, Mo = M();
    if (!r) return Mo ? Mo.vazio({ icone: "grafico", titulo: "Ainda não há cálculo", texto: pacoteOk() ? "Os dados da obra estão completos: calcule para ver o resultado." : "Carregue o pacote da obra (ou o exemplo) e calcule.", acaoHtml: pacoteOk() ? bt("calcular", "Calcular", { pri: 1, ico: "raio" }) : bt("exemplo", "Carregar exemplo: Quiosque", { pri: 1 }) }) : "";
    var h = "";
    if (UIC.desatualizado) h += Mo.aviso({ tom: "alerta", titulo: "Premissas alteradas depois do cálculo", texto: "O resultado abaixo é o do cálculo anterior.", acaoHtml: bt("calcular", "Calcular de novo", { sm: 1, pri: 1 }) });
    h += sec({ titulo: "Resumo por função", sub: r.verificados + " membros verificados (pior estação × combinação) · " + r.combinacoes + " combinações (NBR 8681) · cálculo em " + fmt((r.msTotal || r.tempoTela || 0) / 1000, 0) + " s",
      corpoHtml: '<div class="mdc-tab-rola"><table class="tbl mdc-t" data-mdc="funcoes-res"><thead><tr><th>Função</th><th>Espécie · seção</th><th class="num">Membros</th><th class="num">Aproveitamento</th><th>Governa</th><th>Combinação</th><th>Situação</th></tr></thead><tbody>' +
        r.funcoes.map(function (f) {
          return '<tr data-mdc-funcao="' + esc(f.grupo) + '"><td>' + esc(f.funcao) + '</td><td>' + esc(f.especie + " " + (f.secao || "")) + (f.classe ? '<br><small class="mdc-fraco">' + esc(f.classe) + "</small>" : "") + '</td><td class="num">' + f.n + '</td><td class="num">' + barraEta(f.etaMax) + "</td><td>" + esc(f.governa || "") + "</td><td>" + esc(f.combinacao || "") + "</td><td>" + (f.ok ? pil("Atende", "ok") : pil(f.reprovados + " reprovado(s)", "erro")) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="mdc-fraco" data-mdc="alpha" style="margin:10px 0 0">Estabilidade global: α_cr = <b>' + (r.alphaCr == null ? "não calculado" : fmt(r.alphaCr, 1)) + "</b>" + (r.combinacaoCritica ? " (combinação crítica " + esc(r.combinacaoCritica) + ")" : "") + (r.alphaCr != null ? (r.alphaCr >= 10 ? " — estrutura indeslocável; β de projeto dos pilares = máx(1,0; β do autovalor)." : " — estrutura deslocável: efeitos de 2ª ordem relevantes.") : "") + "</p>" });
    h += sec({ titulo: "Reprovações", id: "mdc-reprovacoes", corpoHtml: r.reprovacoes.length ? r.reprovacoes.map(function (x) {
      return '<div data-mdc-reprovacao="' + esc(x.grupo) + '" style="margin-bottom:12px"><b>' + esc(x.funcao) + "</b> — " + x.membros + " membro(s), η até " + fmt(x.etaMax, 2) + "<p>" + esc(x.mecanismo) + '</p><p class="mdc-fraco" style="margin:4px 0">Alternativas (decisão do RT):</p><ol class="mdc-lista">' + x.alternativas.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ol></div>";
    }).join("") : '<p data-mdc="sem-reprovacao" style="margin:0">' + pil("Nenhuma reprovação", "ok") + " — todos os membros verificados com η ≤ 1,0.</p>" });
    var ip = r.impedimentos.map(function (t) { return '<li data-mdc-imped="1">' + pil("Impede o uso", "erro") + " " + esc(t) + "</li>"; })
      .concat(r.pendencias.map(function (t) { return "<li>" + pil("Pendência", "alerta") + " " + esc(t) + "</li>"; }));
    h += sec({ titulo: "Impedimentos e pendências", sub: r.impedimentos.length + " impedimento(s) · " + r.pendencias.length + " pendência(s)", corpoHtml: ip.length ? '<ul class="mdc-lista" style="list-style:none;padding:0">' + ip.join("") + "</ul>" : '<p style="margin:0">Nenhum.</p>' });
    h += sec({ titulo: "Reações para a fundação", sub: r.reacoes.length + " pilaretes · características por hipótese, kN",
      corpoHtml: '<div class="mdc-tab-rola"><table class="tbl mdc-t" data-mdc="reacoes"><thead><tr><th>Pilarete</th><th class="num">x (m)</th><th class="num">y (m)</th><th class="num">N G</th><th class="num">N Q</th><th class="num">N V1</th><th class="num">N V2</th><th class="num">N V3</th><th class="num">N V4</th><th class="num">H máx. vento</th></tr></thead><tbody>' +
        r.reacoes.map(function (x) {
          var hm = 0; ["V1", "V2", "V3", "V4"].forEach(function (k) { if (x[k]) hm = Math.max(hm, Math.sqrt(Math.pow(x[k].Vx || 0, 2) + Math.pow(x[k].Vy || 0, 2))); });
          return "<tr><td>" + esc(x.pilarete) + '</td><td class="num">' + fmt(x.x, 2) + '</td><td class="num">' + fmt(x.y, 2) + '</td><td class="num">' + fmt(x.G, 2) + '</td><td class="num">' + fmt(x.Q, 2) + "</td>" +
            ["V1", "V2", "V3", "V4"].map(function (k) { return '<td class="num">' + fmt(x[k] ? x[k].N : null, 2) + "</td>"; }).join("") + '<td class="num">' + fmt(hm, 2) + "</td></tr>";
        }).join("") + "</tbody></table></div>" + (r.reacoesConvencao ? '<p class="mdc-fraco" style="margin:8px 0 0">' + esc(r.reacoesConvencao) + "</p>" : "") });
    h += compraSecao(r);
    if (r.ligacoes.length) h += sec({ titulo: "Ligações", sub: r.ligacoes.length + " tipos",
      corpoHtml: '<div class="mdc-tab-rola"><table class="tbl mdc-t"><thead><tr><th>Código</th><th>Tipo</th><th>Descrição</th><th class="num">Qtd.</th><th class="num">η</th><th>Situação</th></tr></thead><tbody>' +
        r.ligacoes.map(function (l) { return "<tr><td>" + esc(l.codigo + (l.sub ? " " + l.sub : "")) + "</td><td>" + esc(l.tipo || "") + "</td><td>" + esc(l.descricao || "") + '</td><td class="num">' + esc(l.quantidade == null ? "—" : l.quantidade) + '</td><td class="num">' + (l.eta == null ? "—" : fmt(l.eta, 2)) + "</td><td>" + (l.eta == null ? pil("Sem verificação", "alerta") : (l.ok ? pil("Atende", "ok") : pil("Não atende", "erro"))) + "</td></tr>"; }).join("") + "</tbody></table></div>" });
    h += sec({ titulo: "Premissas e o que não foi calculado", corpoHtml:
      '<details class="mdc-det"><summary>' + r.premissas.length + " premissas do cálculo</summary>" + '<div class="mdc-tab-rola"><table class="tbl mdc-t"><thead><tr><th>Item</th><th>Valor</th><th>Fonte</th><th>Confiança</th></tr></thead><tbody>' + r.premissas.map(function (p) { return "<tr><td>" + esc(p.item) + "</td><td>" + esc(p.valor) + "</td><td>" + esc(p.fonte) + "</td><td>" + esc(p.confianca || "") + "</td></tr>"; }).join("") + "</tbody></table></div></details>" +
      (r.naoAbrangido.length ? '<p style="margin:12px 0 4px"><b>Não abrangido nesta versão</b> (nunca aparece como "OK"):</p><ul class="mdc-lista">' + r.naoAbrangido.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
      (r.avisos.length ? '<p style="margin:12px 0 4px"><b>Avisos</b></p><ul class="mdc-lista">' + r.avisos.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
      (r.nivel && r.nivel.mensagem ? '<p style="margin:12px 0 0"><b>Nível do piso:</b> ' + esc(r.nivel.mensagem) + "</p>" : "") });
    return h;
  }
  function compraSecao(r) {
    var c = r.compra; if (!c) return sec({ titulo: "Lista de compra", corpoHtml: '<p style="margin:0">Sem catálogo de madeira serrada para montar a compra.</p>' });
    return sec({ titulo: "Lista de compra", sub: c.grupos.length + " itens por espécie e seção" + (c.catalogoFonte ? " · " + c.catalogoFonte : ""), acoesHtml: bt("compra", "Baixar .xlsx", { sm: 1, ico: "planilha" }),
      corpoHtml: (arr(c.cotacao).length ? '<p class="mdc-fraco" style="margin:0 0 8px" data-mdc="cotacao">Cotação em madeireira (serrada sob medida, por m³): ' + arr(c.cotacao).map(function (x) { return "<b>" + esc(String(x.nomeEspecie).replace(/\s*\(.*$/, "")) + "</b> " + fmt(x.volume_m3, 2) + " m³ em " + x.secoes.length + " seções (maior peça " + fmt(x.maiorPeca_m, 2) + " m)"; }).join(" · ") + ".</p>" : "") +
        '<div class="mdc-tab-rola"><table class="tbl mdc-t" data-mdc="compra"><thead><tr><th>Espécie</th><th>Seção</th><th class="num">Peças</th><th class="num">Útil (m)</th><th class="num">Volume (m³)</th><th>Fornecedor</th><th>Barras</th><th class="num">Aprov.</th><th>Pendência</th></tr></thead><tbody>' +
        c.grupos.map(function (g) {
          var barras = g.porComprimento ? Object.keys(g.porComprimento).map(function (L) { return g.porComprimento[L] + " × " + fmt(Number(L), 1) + " m"; }).join(" + ") : (g.sobMedida ? "sob medida" : "—");
          return "<tr><td>" + esc(g.especieNome) + "</td><td>" + esc(g.secao) + '</td><td class="num">' + g.n + '</td><td class="num">' + fmt(g.util_m, 1) + '</td><td class="num">' + fmt(g.volume_m3, 3) + "</td><td>" + esc(g.fornecedor || "—") + (g.bruta ? ' <small class="mdc-fraco">(medida bruta)</small>' : "") + (g.origem ? ' <small class="mdc-fraco">(' + esc(g.origem) + ")</small>" : "") + "</td><td>" + esc(barras) + '</td><td class="num">' + pct(g.aproveitamento) + "</td><td>" + (g.pendencia ? pil("Pendência", "alerta") + ' <small>' + esc(g.pendencia) + "</small>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" });
  }

  /* ================================================================ 5. DOCUMENTOS */
  function documentosHtml() {
    var r = UIC.resumo, Mo = M(), d = garantirDocu(), s = UIC.saidas;
    if (!r) return Mo ? Mo.vazio({ icone: "relatorio", titulo: "Os documentos saem do cálculo", texto: "Calcule primeiro: memorial, pranchas, manual de montagem, pacote do CYPE 3D e lista de compra saem do resultado.", acaoHtml: pacoteOk() ? bt("calcular", "Calcular", { pri: 1, ico: "raio" }) : "" }) : "";
    function campo(k, rot) { return '<label class="mdc-campo"><span>' + esc(rot) + '</span><input data-mdc-campo="docu.' + k + '" value="' + esc(d[k] || "") + '"></label>'; }
    var h = sec({ titulo: "Dados do documento", sub: "Responsável técnico, empresa e logo vêm de Configurações › Empresa.", corpoHtml: '<div class="mdc-grade">' + campo("obra", "Obra") + campo("local", "Local") + campo("proprietario", "Proprietário") + campo("contratante", "Contratante") + campo("codigo", "Código do projeto") + campo("revisao", "Revisão") + "</div>" });
    function cartao(acao, titulo, texto, ok, rot) { return '<div class="mdc-doc" data-mdc-doc="' + acao + '"><b>' + esc(titulo) + "</b><p>" + esc(texto) + "</p>" + (ok ? '<p data-mdc-feito="' + acao + '">' + pil(ok, "ok") + "</p>" : "") + bt(acao, rot, { pri: acao === "memorial", ico: acao === "compra" ? "planilha" : (acao === "cype" ? "exportar" : "relatorio") }) + "</div>"; }
    h += sec({ titulo: "Documentos do projeto", sub: r.ok ? "" : "O cálculo tem impedimento: os documentos saem marcados como “não atende” até a pendência ser resolvida.",
      corpoHtml: '<div class="mdc-docs">' +
        cartao("memorial", "Memorial de cálculo", "Ações, combinações, modelo, verificações passo a passo, ligações, reações para a fundação e normas — abre para imprimir ou salvar em PDF.", s.memorial ? s.memorial.secoes + " seções" : "", "Abrir memorial") +
        cartao("pranchas", "Pranchas do projeto executivo", "Locação, piso seco em camadas, coberturas, pilares, paredes, ligações e lista de materiais — folhas A1 no padrão da casa.", s.pranchas ? s.pranchas + " folhas" : "", "Gerar pranchas") +
        cartao("manual", "Manual de montagem", "Uma etapa por página, a mesma câmera em todas, peças e fixações de cada etapa — para a equipe de obra.", s.manual ? s.manual.paginas + " páginas" : "", "Abrir manual") +
        cartao("cype", "Pacote para o CYPE 3D", "Geometria por etiqueta (texto latin-1), séries e materiais, liberações, cargas por hipótese e o roteiro na ordem certa (.zip).", s.cype ? s.cype.length + " arquivos" : "", "Baixar .zip") +
        cartao("compra", "Lista de compra", "Madeira por espécie e seção, barras comerciais, aproveitamento e pendências de fornecedor (.xlsx).", s.compra ? "baixada" : "", "Baixar .xlsx") +
        "</div>" });
    if (UIC.pranchas) h += pranchasSecao();
    return h;
  }
  function pranchasSecao() {
    var x = UIC.pranchas;
    return sec({ titulo: "Pranchas", sub: x.folhas.length + " folhas " + ((x.folhas[0] || {}).formato || "A1") + (x.avisos.length ? " · " + x.avisos.length + " aviso(s)" : ""), id: "mdc-pranchas",
      acoesHtml: bt("pranchas-zip", "Baixar todas (.zip)", { sm: 1 }) + bt("pranchas-dxf", "DXF (.zip)", { sm: 1, dica: "Uma folha por DXF, no Padrão RA, com o carimbo RA: abre no AutoCAD e salva em DWG" }) + bt("pranchas-imprimir", "Imprimir / PDF", { sm: 1, pri: 1 }),
      corpoHtml: (x.avisos.length ? '<ul class="mdc-lista mdc-fraco">' + x.avisos.slice(0, 8).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "") +
        '<div class="mdc-folhas">' + x.folhas.map(function (f, i) {
          return '<div class="mdc-folha" data-mdc="folha"><div class="mdc-fig" data-mdc-acao="folha-abrir" data-mdc-v="' + i + '" title="Abrir a folha grande">' + f.svg + '</div><div class="mdc-fc"><span><b>' + esc(f.numero || "") + "</b> " + esc(f.titulo || "") + '<br><small class="mdc-fraco">Escala ' + esc(f.escala || "indicada") + "</small></span>" + bt("folha-svg", "SVG", { sm: 1, v: i, ico: "baixar" }) + bt("folha-dxf", "DXF", { sm: 1, v: i, ico: "baixar" }) + "</div></div>";
        }).join("") + "</div>" });
  }

  /* opções dos documentos: obra (tela), empresa e responsável (Configurações › Empresa) — nada de dado de empresa no código */
  function empresa() { var d = {}, logo = null; try { if (global.Empresa && Empresa.dados) d = Empresa.dados() || {}; if (global.Empresa && Empresa.logo) logo = Empresa.logo(); } catch (e) {} return { d: d, logo: logo }; }
  function opcoesDoc(qual) {
    var em = empresa(), d = garantirDocu(), e = em.d, cod = d.codigo || "EST-MAD", rev = d.revisao || "R00", data = hojeBR();
    var resp = { nome: e.responsavel || "", titulo: e.titulo || "", abrev: e.titulo || "", conselho: "CREA", crea: e.crea || "", empresa: e.nome || "", cnpj: e.cnpj || "", endereco: [e.endereco, e.cidade].filter(Boolean).join(" — "), contato: [e.telefone, e.email].filter(Boolean).join(" · ") };
    var obra = { nome: d.obra || "", endereco: d.local || "", cidade: "", proprietario: d.proprietario || "", contratante: d.contratante || "" };
    var situacao = "Gerado pelo OrçaPRO em " + data + " — conferir antes de emitir";
    if (qual === "memorial") return { obra: obra, documento: { numero: cod + "-MEM", revisao: rev, data: data, situacao: situacao }, revisoes: [{ rev: rev, data: data, descricao: "Emissão inicial gerada pelo OrçaPRO", por: e.nome || "" }],
      responsavel: resp, local: e.cidade || "", logos: em.logo ? { ra: em.logo } : {}, versao: versao() };
    if (qual === "pranchas") return { empresa: e.nome || "", responsavel: e.responsavel || "", registro: e.crea ? "CREA nº " + e.crea : "", tituloProfissional: e.titulo || "", obra: (d.obra || "") + " - estrutura de madeira",
      proprietario: d.proprietario || "", contratante: d.contratante || "", local: d.local || "", codigo: cod, revisao: rev, data: data, descricaoRevisao: "EMISSÃO INICIAL", formato: "A1", logo: em.logo || null };
    if (qual === "manual") return { obra: obra, documento: { numero: cod + "-LIV", revisao: rev, data: data, situacao: situacao }, responsavel: resp, logos: em.logo ? { ra: em.logo } : {} };
    if (qual === "cype") return { obra: { nome: d.obra || "" } };
    return {};
  }
  /* pede uma saída: ao Worker (onde o resultado está) ou à página */
  var pendentes = {};
  function pedirSaida(qual) {
    var opc = opcoesDoc(qual);
    if (UIC.modoCalc === "worker" && UIC.worker) {
      return new Promise(function (ok, erro) {
        var id = "s" + Date.now() + qual; pendentes[id] = { ok: ok, erro: erro };
        UIC.worker.postMessage({ tipo: "gerar", id: id, qual: qual, opcoes: opc });
      });
    }
    if (UIC.modoCalc === "pagina" && W().ultimo()) { try { return Promise.resolve(W().gerar(qual, opc)); } catch (e) { return Promise.reject(e); } }
    return Promise.reject(new Error("o resultado do cálculo não está mais disponível nesta sessão — calcule de novo"));
  }
  function respostaSaida(m) {
    var p = pendentes[m.id]; if (!p) return; delete pendentes[m.id];
    if (m.tipo === "erro") { p.erro(new Error(m.mensagem)); return; }
    try { p.ok(JSON.parse(m.texto)); } catch (e) { p.erro(e); }
  }
  function abrirJanela(titulo) {
    var w = null; try { w = global.open("", "_blank"); } catch (e) { w = null; }
    if (w && w.document) { try { w.document.write('<!doctype html><meta charset="utf-8"><title>' + esc(titulo) + '</title><p style="font:15px system-ui;padding:40px">Montando o documento…</p>'); } catch (e) {} }
    return w;
  }
  function mostrarHtml(w, html, nomeArq) {
    /* teste de 1 hora (js/testemodulo.js, revisão R7): o documento da janela nova leva a marca; vencido não abre */
    if (global.TesteModulo && TesteModulo.marcarHtml) { var hT = TesteModulo.marcarHtml(html, "modela:marcenaria"); if (hT == null) { try { if (w) w.close(); } catch (eW) {} return "recusado"; } html = hT; }
    if (w && !w.closed && w.document) { w.document.open(); w.document.write(html); w.document.close(); return "aba"; }
    baixar(nomeArq, html, "text/html"); return "baixado";
  }
  /* sem cálculo, o documento não existe: abre a tela do módulo (efeito visível — regra do e2e-bim-ferramentas: todo comando
   * faz algo que se vê ou fica desabilitado com o motivo) e diz o que fazer */
  function semResultado() {
    if (UIC.resumo) return false;
    try { API.abrir(); } catch (e) {}
    toast("Calcule primeiro: o memorial, as pranchas, o manual, o pacote do CYPE e a lista de compra saem do resultado do cálculo.", "aviso");
    return true;
  }
  function base() { return nomeSeguro((UIC.docu && UIC.docu.obra) || "obra"); }
  function memorial() {
    if (!lic("gerar o memorial")) return Promise.resolve(false);
    if (semResultado()) return Promise.resolve(false);
    var w = abrirJanela("Memorial de cálculo"); status("Montando o memorial de cálculo da madeira…");
    return pedirSaida("memorial").then(function (x) {
      if (!x || !x.html) throw new Error("o memorial não gerou conteúdo");
      UIC.saidas.memorial = { secoes: x.secoes, bytes: x.html.length, avisos: x.avisos.length };
      var onde = mostrarHtml(w, x.html, base() + "-memorial-madeira.html");
      toast(onde === "aba" ? "Memorial aberto em outra aba: imprima ou salve em PDF (Ctrl+P)." : "Memorial baixado (.html): abra e imprima em PDF.", "ok", 8000);
      if (raiz() && UIC.aba === "documentos") { UIC.manterRolagem = true; render(); }
      return true;
    }).catch(function (e) { if (w) try { w.close(); } catch (e2) {} toast("Memorial: " + e.message, "erro", 9000); return false; });
  }
  function manual() {
    if (!lic("gerar o manual de montagem")) return Promise.resolve(false);
    if (semResultado()) return Promise.resolve(false);
    var w = abrirJanela("Manual de montagem"); status("Montando o manual de montagem…");
    return pedirSaida("manual").then(function (x) {
      if (!x || !x.html) throw new Error("o manual não gerou conteúdo");
      UIC.saidas.manual = { paginas: x.paginas, etapas: x.etapas, bytes: x.html.length };
      var onde = mostrarHtml(w, x.html, base() + "-manual-montagem.html");
      toast(onde === "aba" ? "Manual aberto em outra aba (A3 paisagem): imprima ou salve em PDF." : "Manual baixado (.html).", "ok", 8000);
      if (raiz() && UIC.aba === "documentos") { UIC.manterRolagem = true; render(); }
      return true;
    }).catch(function (e) { if (w) try { w.close(); } catch (e2) {} toast("Manual: " + e.message, "erro", 9000); return false; });
  }
  function pranchas() {
    if (!lic("gerar as pranchas")) return Promise.resolve(false);
    if (semResultado()) return Promise.resolve(false);
    status("Desenhando as pranchas…");
    return pedirSaida("pranchas").then(function (x) {
      if (!x || !x.ok || !x.folhas.length) throw new Error((x && x.avisos[0]) || "nada gerado");
      UIC.pranchas = x; UIC.saidas.pranchas = x.folhas.length; UIC.aba = "documentos";
      if (raiz()) { render(); var el = doc.getElementById("mdc-pranchas"); if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" }); }
      toast(x.folhas.length + " pranchas prontas: abra, baixe o SVG ou imprima em PDF.", "ok", 7000);
      return true;
    }).catch(function (e) { toast("Pranchas: " + e.message, "erro", 9000); return false; });
  }
  function folhaHtml(f) { return '<!doctype html><meta charset="utf-8"><title>' + esc((f.numero || "") + " " + (f.titulo || "")) + '</title><style>html,body{margin:0;background:white}svg{width:100vw;height:auto;display:block}</style>' + f.svg; }
  function folhaAbrir(i) {
    var f = UIC.pranchas && UIC.pranchas.folhas[i]; if (!f) return;
    if (!lic("abrir a prancha")) return;
    var w = abrirJanela(f.titulo || "Prancha"); mostrarHtml(w, folhaHtml(f), base() + "-" + nomeSeguro(f.numero || "folha" + (i + 1)) + ".html");
  }
  function pranchasImprimir() {
    var x = UIC.pranchas; if (!x) return;
    if (!lic("imprimir as pranchas")) return;
    var fmtF = (x.folhas[0] || {}).formato || "A1";
    var html = '<!doctype html><meta charset="utf-8"><title>Pranchas</title><style>@page{size:' + fmtF + ' landscape;margin:0}html,body{margin:0;background:white}.pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto}svg{width:100%;height:auto;display:block}</style>' +
      x.folhas.map(function (f) { return '<div class="pg">' + f.svg + "</div>"; }).join("") + "<script>setTimeout(function(){try{window.print()}catch(e){}},400)<\/script>";
    var w = abrirJanela("Pranchas"); mostrarHtml(w, html, base() + "-pranchas-madeira.html");
  }
  function pranchasZip() {
    var x = UIC.pranchas; if (!x) return;
    if (!global.BimBcf || !BimBcf.zipEscrever) { toast("O gerador de .zip não carregou.", "erro"); return; }
    if (!lic("baixar as pranchas")) return;
    var arqs = {}; x.folhas.forEach(function (f, i) { arqs[nomeSeguro((f.numero || "folha-" + (i + 1)) + " " + (f.titulo || "")).slice(0, 80) + ".svg"] = f.svg; });
    baixar(base() + "-pranchas-madeira.zip", BimBcf.zipEscrever(arqs), "application/zip");
  }
  /* O DXF DAS PRANCHAS (21/10/2026, js/pranchasdxf.js): cada folha em DXF R2000, mm de papel 1:1, layers e penas do Padrão RA,
     textos e cotas como entidades, carimbo RA. Em teste de 1 hora o `baixar` põe a marca "Versão de teste" em cada DXF (também dentro do .zip).
     Os dados do carimbo vêm junto de cada folha (folha.dxf), que o Worker devolve em JSON. */
  function folhaDxf(i) {
    var x = UIC.pranchas, PX = global.PranchasDxf, f = x && x.folhas[i];
    if (!f) return;
    if (!PX) { toast("O DXF das pranchas não carregou (js/pranchasdxf.js).", "erro"); return; }
    if (!lic("baixar o DXF da prancha")) return;
    var t = null; try { t = PX.dxfDaFolha(f); } catch (e) { toast("DXF: " + e.message, "erro", 9000); return; }
    if (baixar(base() + "-" + PX.nomeArquivo(f, i), t, "application/dxf") !== false) toast("DXF da folha " + (f.numero || (i + 1)) + " baixado (R2000, mm de papel 1:1, layers do Padrão RA). O AutoCAD abre direto e salva em DWG.", "ok", 8000);
  }
  function pranchasDxf() {
    var x = UIC.pranchas, PX = global.PranchasDxf;
    if (!x) return;
    if (!PX || !global.BimBcf || !BimBcf.zipEscrever) { toast("O DXF das pranchas (ou o gerador de .zip) não carregou.", "erro"); return; }
    if (!lic("baixar o DXF das pranchas")) return;
    var r = null; try { r = PX.arquivos(x); } catch (e) { toast("DXF: " + e.message, "erro", 9000); return; }
    if (!r || !r.nomes.length) { toast("DXF: " + ((r && r.avisos[0]) || "nada gerado") + ".", "erro", 9000); return; }
    if (baixar(base() + "-pranchas-madeira-dxf.zip", BimBcf.zipEscrever(r.arquivos), "application/zip") !== false)
      toast(r.nomes.length + " DXF (R2000, mm de papel 1:1, layers do Padrão RA com a pena de cada uma, textos e cotas como entidades, carimbo RA)." + (r.avisos.length ? " " + r.avisos.length + " aviso(s): " + r.avisos[0] : "") + " O AutoCAD abre direto e salva em DWG.", "ok", 9000);
  }
  function latin1Bytes(t) { var b = new Uint8Array(t.length); for (var i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 255; return b; }
  function cype() {
    if (!lic("exportar para o CYPE 3D")) return Promise.resolve(false);
    if (semResultado()) return Promise.resolve(false);
    if (!global.BimBcf || !BimBcf.zipEscrever) { toast("O gerador de .zip não carregou.", "erro"); return Promise.resolve(false); }
    return pedirSaida("cype").then(function (x) {
      var arqs = {}, nomes = Object.keys(x.arquivos || {});
      if (!nomes.length) throw new Error("o exportador não devolveu arquivos");
      /* ⚠ os textos do CYPE vão em latin-1 (o Worker já trocou o que não cabe); o roteiro .md em UTF-8 */
      nomes.forEach(function (k) { var a = x.arquivos[k]; arqs[k] = a.latin1 ? latin1Bytes(a.texto) : a.texto; });
      baixar(base() + "-cype3d-madeira.zip", BimBcf.zipEscrever(arqs), "application/zip");
      UIC.saidas.cype = nomes;
      toast("Pacote para o CYPE 3D baixado: " + nomes.length + " arquivos — siga o ROTEIRO_CYPE.md dentro do .zip.", "ok", 9000);
      if (raiz() && UIC.aba === "documentos") { UIC.manterRolagem = true; render(); }
      return true;
    }).catch(function (e) { toast("CYPE 3D: " + e.message, "erro", 9000); return false; });
  }
  function comExcel(fn) {
    if (global.ExcelJS) { fn(global.ExcelJS); return; }
    if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(function () { fn(global.ExcelJS); });
    else toast("O gerador de Excel não carregou.", "erro");
  }
  function compra() {
    if (!lic("baixar a lista de compra")) return Promise.resolve(false);
    var r = UIC.resumo; if (semResultado()) return Promise.resolve(false);
    if (!r.compra) { toast("Este cálculo não tem lista de compra (sem catálogo de madeira serrada).", "aviso"); return Promise.resolve(false); }
    return new Promise(function (ok) {
      comExcel(function (EJ) {
        if (!EJ) { ok(false); return; }
        var wb = new EJ.Workbook(), d = garantirDocu();
        wb.creator = "OrçaPRO"; wb.created = new Date();
        var ws = wb.addWorksheet("Compra", { views: [{ state: "frozen", ySplit: 4 }] });
        ws.getCell("A1").value = "Lista de compra — estrutura de madeira" + (d.obra ? " — " + d.obra : ""); ws.getCell("A1").font = { bold: true, size: 14 };
        ws.getCell("A2").value = "Gerada pelo OrçaPRO em " + hojeBR() + (r.compra.catalogoFonte ? " · catálogo: " + r.compra.catalogoFonte : "") + " · conferir medidas brutas com o fornecedor";
        var cab = ["Espécie", "Seção", "Peças", "Comprimento útil (m)", "Volume (m³)", "Fornecedor", "Produto", "Barras a comprar", "Comprado (m)", "Aproveitamento", "Pendência"];
        ws.getRow(4).values = cab; ws.getRow(4).font = { bold: true };
        ws.getRow(4).eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } }; c.border = { bottom: { style: "thin" } }; });
        r.compra.grupos.forEach(function (g) {
          var barras = g.porComprimento ? Object.keys(g.porComprimento).map(function (L) { return g.porComprimento[L] + " × " + String(L).replace(".", ",") + " m"; }).join(" + ") : "";
          var row = ws.addRow([g.especieNome, g.secao, g.n, g.util_m, g.volume_m3, g.fornecedor || "", g.produto || "", barras, g.comprado_m == null ? null : g.comprado_m, g.aproveitamento == null ? null : g.aproveitamento, g.pendencia || ""]);
          row.getCell(4).numFmt = "#,##0.0"; row.getCell(5).numFmt = "#,##0.000"; row.getCell(9).numFmt = "#,##0.0"; row.getCell(10).numFmt = "0%";
        });
        var tot = ws.addRow(["Total", "", r.compra.grupos.reduce(function (s, g) { return s + g.n; }, 0), r.compra.grupos.reduce(function (s, g) { return s + (g.util_m || 0); }, 0), r.compra.grupos.reduce(function (s, g) { return s + (g.volume_m3 || 0); }, 0)]);
        tot.font = { bold: true }; tot.getCell(4).numFmt = "#,##0.0"; tot.getCell(5).numFmt = "#,##0.000";
        [16, 12, 8, 14, 12, 14, 34, 26, 13, 13, 60].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
        var ws2 = wb.addWorksheet("Por espécie");
        ws2.addRow(["Espécie", "Peças", "Volume (m³)"]).font = { bold: true };
        r.porEspecie.forEach(function (x) { var rw = ws2.addRow([x.nome, x.n, x.volume_m3]); rw.getCell(3).numFmt = "#,##0.000"; });
        [24, 10, 14].forEach(function (w, i) { ws2.getColumn(i + 1).width = w; });
        if (r.compra.pendencias.length) { var ws3 = wb.addWorksheet("Pendências"); ws3.addRow(["Pendência de compra"]).font = { bold: true }; r.compra.pendencias.forEach(function (p) { ws3.addRow([p]); }); ws3.getColumn(1).width = 120; }
        wb.xlsx.writeBuffer().then(function (buf) {
          baixar(base() + "-compra-madeira.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          UIC.saidas.compra = true; toast("Lista de compra baixada (.xlsx): " + r.compra.grupos.length + " itens.", "ok", 7000);
          if (raiz() && UIC.aba === "documentos") { UIC.manterRolagem = true; render(); }
          ok(true);
        }, function (e) { toast("Lista de compra: " + e.message, "erro", 9000); ok(false); });
      });
    });
  }

  /* ================================================================ EVENTOS */
  function ligar(v) {
    v.addEventListener("click", function (ev) {
      var el = ev.target && ev.target.closest ? ev.target.closest("[data-mdc-acao]") : null;
      if (!el || !v.contains(el) || el.disabled) return;
      var a = el.getAttribute("data-mdc-acao"), val = el.getAttribute("data-mdc-v");
      if (a === "fechar") fechar();
      else if (a === "aba") { UIC.aba = val; render(); }
      else if (a === "exemplo") exemplo();
      else if (a === "arquivos") { var inp = v.querySelector("[data-mdc='arquivo']"); if (!inp) { UIC.aba = "dados"; render(); inp = v.querySelector("[data-mdc='arquivo']"); } if (inp) { inp.value = ""; inp.click(); } }
      else if (a === "limpar") { UIC.pacote = null; UIC.msgs = []; UIC.resumo = null; UIC.pranchas = null; UIC.saidas = {}; render(); }
      else if (a === "baixar-pacote") baixarPacote();
      else if (a === "restaurar") { UIC.prem = W().premissasPadrao(); salvar(); if (UIC.resumo) UIC.desatualizado = true; UIC.aba = "premissas"; render(); toast("Premissas de volta ao padrão (especificação do cliente e decisões do RT).", "ok"); }
      else if (a === "calcular") calcular();
      else if (a === "cancelar") cancelar();
      else if (a === "memorial") memorial();
      else if (a === "pranchas") pranchas();
      else if (a === "manual") manual();
      else if (a === "cype") cype();
      else if (a === "compra") compra();
      else if (a === "pranchas-zip") pranchasZip();
      else if (a === "pranchas-dxf") pranchasDxf();
      else if (a === "folha-dxf") folhaDxf(+val);
      else if (a === "pranchas-imprimir") pranchasImprimir();
      else if (a === "folha-abrir") folhaAbrir(+val);
      else if (a === "folha-svg") { var f = UIC.pranchas && UIC.pranchas.folhas[+val]; if (f && lic("baixar a prancha")) baixar(base() + "-" + nomeSeguro(f.numero || "folha") + ".svg", f.svg, "image/svg+xml"); }
    });
    v.addEventListener("change", function (ev) {
      var el = ev.target; if (!el) return;
      if (el.getAttribute("data-mdc") === "arquivo") { lerArquivos(el.files); return; }
      var c = el.getAttribute("data-mdc-campo"); if (!c) return;
      mudarCampo(c, el.value, el);
      if (/^(esp|cls|dec)\./.test(c) && el.tagName !== "INPUT") { UIC.manterRolagem = true; render(); }
    });
    v.addEventListener("keydown", function (ev) {
      /* Esc fecha a janela — menos quando há um modal do app ou o menu "Mais" aberto (o Esc é deles) */
      if (ev.key === "Escape" && !doc.querySelector(".modal-bg, .mod-mais-menu:not([hidden])")) { ev.stopPropagation(); fechar(); }
    });
    /* soltar arquivos na janela */
    v.addEventListener("dragover", function (ev) { ev.preventDefault(); });
    v.addEventListener("drop", function (ev) { ev.preventDefault(); if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) lerArquivos(ev.dataTransfer.files); });
  }

  /* ================================================================ FITA (aba Carpintaria & Marcenaria) */
  /* mesma porta da Metálica: prévia do modelador e a disciplina contratada (aqui, "marcenaria") */
  function previa() { var P = global.BimPrevia; if (!P || !P.modelador || !P.modelador()) return false; if (P.disciplina) { try { return P.disciplina("marcenaria") !== false; } catch (e) { return true; } } return true; }
  var COMANDOS = [
    { id: "mad-calc-abrir", rotulo: "Estrutura de\nmadeira", icone: "estrutura", grande: true, dica: "Cálculo da estrutura de madeira pela NBR 7190-1:2022: carregue o pacote da obra (ou o exemplo), confira as premissas e calcule — piso seco, pilares, coberturas, paredes, ligações, reações e compra." },
    { id: "mad-calc-exemplo", rotulo: "Carregar\nexemplo", icone: "camadas", grande: true, dica: "Abre o exemplo pronto: um quiosque de madeira real anonimizado (907 peças, piso seco, wood frame e duas coberturas)." },
    { id: "mad-calc-calcular", rotulo: "Calcular", icone: "raio", grande: true, dica: "Calcula a estrutura carregada em paralelo (a tela continua livre) — cerca de meio minuto." },
    { id: "mad-calc-resultados", rotulo: "Resultados", icone: "grafico", grande: true, dica: "Resumo por função (η, o que governa, a combinação), reprovações e impedimentos, α_cr, reações para a fundação e compra." },
    { id: "mad-calc-memorial", rotulo: "Memorial", icone: "relatorio", dica: "Memorial de cálculo da madeira (abre para imprimir ou salvar em PDF)." },
    { id: "mad-calc-pranchas", rotulo: "Pranchas", icone: "prancha", dica: "Pranchas A1 do projeto executivo no padrão da casa." },
    { id: "mad-calc-manual", rotulo: "Manual de\nmontagem", icone: "livro", dica: "Manual de montagem: uma etapa por página, para a equipe de obra." },
    { id: "mad-calc-cype", rotulo: "Para o CYPE 3D", icone: "exportar", dica: "Pacote para o CYPE 3D: geometria, séries, liberações, cargas e o roteiro (.zip)." },
    { id: "mad-calc-compra", rotulo: "Lista de\ncompra", icone: "planilha", dica: "Madeira por espécie e seção com as barras comerciais (.xlsx)." }
  ];
  function registrar(reg) {
    var R = global.BimRibbon;
    if (!previa() || !R || !reg || !W()) return false;
    R.acrescentar("marcenaria", "Carpintaria & Marcenaria", "Cálculo estrutural", COMANDOS);
    var ids = COMANDOS.map(function (c) { return c.id; });
    if (global.BimDisciplinas && typeof global.BimDisciplinas.declarar === "function") { try { global.BimDisciplinas.declarar(ids, "marcenaria"); } catch (e) {} }
    ids.forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
    var h = {
      "mad-calc-abrir": function () { API.abrir(); }, "mad-calc-exemplo": function () { API.exemplo(); }, "mad-calc-calcular": function () { API.calcular(); },
      "mad-calc-resultados": function () { API.resultados(); }, "mad-calc-memorial": function () { API.memorial(); }, "mad-calc-pranchas": function () { API.pranchas(); },
      "mad-calc-manual": function () { API.manual(); }, "mad-calc-cype": function () { API.cype(); }, "mad-calc-compra": function () { API.compra(); }
    };
    Object.keys(h).forEach(function (k) { reg[k] = function () { try { h[k](); } catch (e) { toast("Estrutura de madeira: " + (e && e.message ? e.message : e), "erro", 8000); } return true; }; });
    /* a aba pode já estar desenhada: a casca ressincroniza (mesmo mecanismo da Metálica e da Marcenaria) */
    setTimeout(function () { try { var sh = global.BimShell; if (sh && sh._raiz && typeof sh._sincAbas === "function") sh._sincAbas(); } catch (e) {} }, 0);
    return true;
  }

  /* ================================================================ API */
  function abrirEm(aba) { garantir(); if (aba) UIC.aba = aba; render(); return true; }
  var API = {
    COMANDOS: COMANDOS, registrar: registrar,
    abrir: function () { return abrirEm(null); },
    exemplo: function () { garantir(); return exemplo(); },
    calcular: function () { if (!lic("calcular a estrutura")) return false; garantir(); return calcular(); },
    /* a trava na função, para quem integra e para o teste: true = pode (e em teste de 1 hora o relógio do módulo anda) */
    licenca: function (acao) { return lic(acao || "usar a função"); },
    resultados: function () { return abrirEm(UIC.resumo ? "resultado" : (UIC.pacote ? "dados" : "dados")); },
    premissas: function () { return abrirEm("premissas"); },
    documentos: function () { return abrirEm("documentos"); },
    memorial: function () { if (!lic("gerar o memorial")) return Promise.resolve(false); garantir(); if (!UIC.resumo) { abrirEm("documentos"); } return memorial(); },
    pranchas: function () { if (!lic("gerar as pranchas")) return Promise.resolve(false); garantir(); if (!UIC.resumo) { abrirEm("documentos"); } return pranchas(); },
    manual: function () { if (!lic("gerar o manual de montagem")) return Promise.resolve(false); garantir(); if (!UIC.resumo) { abrirEm("documentos"); } return manual(); },
    cype: function () { if (!lic("exportar para o CYPE 3D")) return Promise.resolve(false); garantir(); if (!UIC.resumo) { abrirEm("documentos"); } return cype(); },
    compra: function () { if (!lic("baixar a lista de compra")) return Promise.resolve(false); garantir(); if (!UIC.resumo) { abrirEm("documentos"); } return compra(); },
    fechar: fechar,
    lerArquivos: lerArquivos,
    /* para as e2e e para quem integra: o estado sem expor o pacote inteiro */
    estado: function () {
      var w = W(), cf = UIC.pacote && w ? w.conferir(UIC.pacote) : null;
      return { aberta: !!raiz(), aba: UIC.aba, pacote: cf ? { ok: cf.ok, pecas: cf.pecas, arquivos: cf.tem.length, falta: cf.falta.map(function (f) { return f.id; }) } : null,
               calculando: !!(UIC.calc && UIC.calc.rodando), etapa: UIC.calc ? UIC.calc.etapa : null, modoCalculo: UIC.modoCalc, erro: UIC.erro,
               resumo: UIC.resumo ? { ok: UIC.resumo.ok, funcoes: UIC.resumo.funcoes.length, reprovacoes: UIC.resumo.reprovacoes.length, alphaCr: UIC.resumo.alphaCr, impedimentos: UIC.resumo.impedimentos.length, pendencias: (UIC.resumo.pendencias || []).length, reacoes: UIC.resumo.reacoes.length } : null,
               saidas: JSON.parse(JSON.stringify(UIC.saidas)), baixados: UIC.baixados.slice() };
    },
    resumo: function () { return UIC.resumo; },
    premissasAtuais: function () { return UIC.prem; }
  };
  global.MadCalcUI = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
