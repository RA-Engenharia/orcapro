/* =====================================================================
 * andaimeui.js — A TELA DO ANDAIME (E5, 27/10/2026). Fiação fina: a lógica que se prova sem navegador mora em js/andaimetela.js.
 *
 * Pedido do Rogério: "vou tracejar a linha e a altura que eu quero vencer, ele já vai montar tudo certinho, com as conexões,
 * guarda-corpo, piso, a saia de madeira" — "igual faz um guarda-corpo: puxa o comprimento, dá a quantidade/altura e o andaime
 * sobe pela altura que o usuário colocou".
 *
 *   1. MODO DE TRAÇADO (fita › Metálica › Andaime): cliques na planta/3D desenham a face (ou o contorno fechado em volta de um
 *      equipamento). A PRÉVIA em arame mostra o andaime SUBINDO até a altura digitada no painel (níveis desenhados),
 *      "faltam X m", nº de vãos e levantes. Enter fecha, Backspace volta um ponto, Esc cancela, Tab troca o lado.
 *   2. AO FECHAR: Andaime.montarInteligente (ligado por padrão), cria o componente e abre o PAINEL com as abas
 *      Resumo · Cálculo · Simulação · Locação · Montagem · Checklist · Aprovação · Documentos.
 *   3. DUPLO CLIQUE no componente reabre o painel (gancho em MetalProntasUI.dialogo); alterar parâmetro refaz no lugar e a
 *      aprovação passa por Aprovacao.aoAlterar (volta para «em revisão»); cópia do componente = rascunho.
 *   4. Pranchas e Memorial: botões que chamam AndaimePranchas.gerar / AndaimeMemorial.gerar quando existirem (E8).
 *   5. (M4-A, 27/10/2026) MULTIDIRECIONAL: botão «Andaime multidirecional» na fita (COMANDOS_MULTI — fora de COMANDOS para o tubo-roll não mudar) e o seletor
 *      «Sistema: Tubo-roll · Multidirecional (roseta) · Multidirecional (estribo)» no traçado e no Resumo; trocar o sistema de um andaime existente
 *      refaz no lugar e a aprovação volta para «em revisão». As 8 abas valem para os dois sistemas; as pendências do RT são desenhadas de forma genérica.
 *
 * ⚠ Nada é aplicado em silêncio: cada mudança do Montar inteligente aparece na lista com o seu desfazer. Dado que o sistema
 * não tem (V0, categoria, tela, faceAte, tensão do solo, ancoragem) é PENDÊNCIA do RT, em destaque — nunca um verde.
 * Cores: tokens do css/app.css (tema claro e escuro). ES5, IIFE.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MODO = "andaimeTraco";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AN() { return dep("Andaime", "./andaime.js"); }
  function T() { return dep("AndaimeTela", "./andaimetela.js"); }
  function AD() { return dep("AndaimeDocs", "./andaimedocs.js"); }
  function AC() { return dep("AndaimeCalc", "./andaimecalc.js"); }
  function MP() { return global.MetalProntas || null; }
  function PU() { return global.MetalProntasUI || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; v = num(v, NaN); if (!isFinite(v)) return "—"; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 7000); } catch (e) {} }
  function doc() { return typeof document !== "undefined" ? document : null; }
  function relogio() { return new Date().toISOString(); }
  /* E11: TODO texto de ajuda e de diagnóstico vem de js/andaimeajuda.js — aqui só se monta o HTML (ajI = o ⓘ com tooltip, ajL = a linha curta sob o rótulo, tx = frase do dicionário) */
  function AJ() { return dep("AndaimeAjuda", "./andaimeajuda.js"); }
  function ajI(id, sis) { var a = AJ(); return a ? a.icone(id, sis) : ""; }
  function ajL(id, sis) { var a = AJ(); return a ? a.linhaHtml(id, sis) : ""; }
  function tx(k) { var a = AJ(); return a ? a.txt(k) : k; }

  /* ================================================================ FITA */
  var COMANDOS = [
    { id: "met-andaime", tipo: "andaime", modo: "polilinha", rotulo: "Andaime\ntubo-roll", icone: "grade", grande: true, dica: "Andaime tubo-roll (tubo equipado). Trace a linha da face a trabalhar e digite a ALTURA que quer vencer: o andaime sobe em arame até ela, e ao fechar (Enter) já nasce montado — montantes, travessas, diagonais, bases, pisos, guarda-corpo, rodapé, escada, ancoragens e conexões — com o Montar inteligente ligado e o painel de cálculo, locação, montagem, checklist e aprovação. Tab troca o lado." },
    { id: "met-andaime-contorno", tipo: "andaime", modo: "contorno", rotulo: "Em volta de\nequipamento", icone: "grade", grande: true, dica: "Clique os cantos do contorno de um tanque ou equipamento e Enter fecha: o andaime nasce em volta (por fora; Tab troca para dentro), subindo até a altura digitada." },
    { id: "met-andaime-pranchas", tipo: "andaime", modo: null, acao: "pranchas", requer: "selecao", rotulo: "Pranchas\nexecutivas", icone: "grade", grande: true, dica: "Gera o JOGO COMPLETO de pranchas do andaime selecionado (A1): AND-01 planta e cortes A-A/B-B · AND-02 elevações · AND-03 isométrico e detalhes · AND-04 relação de peças, pesos, reações e ancoragens · AND-05 memorial, checklist e liberação. Sai em PDF (imprimir → salvar como PDF) e em DXF com o carimbo RA." },
    { id: "met-andaime-ifc", tipo: "andaime", modo: null, emBreve: true, rotulo: "A partir de\nvolumetria IFC", icone: "bloco", grande: true, dica: "Em breve (E6): monta o andaime em volta de um volume do modelo (tanque cilíndrico, caixa) lendo o contorno e a altura do topo." }
  ];
  /* M4-A: o botão do multidirecional fica FORA de COMANDOS (o contrato do tubo-roll — 4 botões, ids e ordem — não muda); metalui e bimfita o acrescentam num grupo próprio */
  var COMANDOS_MULTI = [
    { id: "met-andaime-multi", tipo: "andaime", modo: "polilinha", sistema: "multidirecional", linha: "roseta", rotulo: "Andaime\nmultidirecional", icone: "grade", grande: true, dica: "Andaime multidirecional (postes com roseta a cada 0,50 m, travessas com cunha, piso metálico com alçapão e escada). Trace a linha da face a trabalhar e digite a ALTURA: o andaime sobe em arame até ela e, ao fechar (Enter), já nasce montado — postes, travessas, diagonais, bases, pisos, guarda-corpo, rodapé, alçapões, ancoragens — com o Montar inteligente e o painel de cálculo, locação, montagem (sequência do manual do fabricante), checklist e aprovação. Escolha a linha (roseta ou estribo) no painel do traçado. Tab troca o lado." }
  ];
  /* campos do diálogo antigo (Peças prontas) — seguem valendo como «Parâmetros avançados» do painel */
  function camposDe() {
    var sel = function (id, rot, ops) { return [id, rot, "sel", ops]; };
    return [
      ["caminho", "Caminho da face — x z; x z… (m, relativo; os cliques preenchem)", "txt"], ["comprimento", "Comprimento (m) — sem caminho", "num"], ["contorno", "Contorno fechado — x z; x z… (os cliques preenchem)", "txt"],
      sel("lado", "Lado do andaime (olhando do começo para o fim; no contorno: fora ou dentro)", [["esquerda", "À esquerda"], ["direita", "À direita"], ["fora", "Fora do contorno"], ["dentro", "Dentro do contorno"]]),
      ["altura", "Altura do piso de trabalho mais alto (m)", "num"], ["afastamento", "Afastamento da face (m) — confirmar RT", "num"], ["nPranchas", "Pranchões na largura (a largura sai deles; 0,30 m cada)", "int"], ["largura", "Largura forçada (m; 0 = pelas pranchas)", "num"],
      ["vaoMax", "Vão longitudinal máximo (m) — confirmar RT", "num"], ["levanteMax", "Levante máximo (m) — confirmar RT", "num"], ["hVarredor", "Travessa de base acima da base (m) — confirmar RT", "num"],
      ["pisos", "Pisos de trabalho: topo, todos ou alturas (2,0; 4,0)", "txt"], sel("piso", "Piso", [["madeira", "Prancha de madeira 0,24 × 0,045 m"], ["metalico", "Piso metálico com gancho 0,37 m"]]),
      ["guarda", "Guarda-corpo: travessão superior (m) — NR-18 18.9.4.2 a)", "num"], ["intermediaria", "Travessão intermediário (m) — NR-18 18.9.4.2 b)", "num"], ["rodape", "Rodapé: altura (m) — NR-18 18.9.4.2 c): mínimo 0,15", "num"], ["rodapeEsp", "Rodapé: espessura (m) — confirmar RT", "num"],
      ["guardaInterno", "Guarda-corpo também na linha interna (face)", "check"], ["tela", "Tela na face externa (NR-18 18.12.15)", "check"],
      sel("sistema", "Sistema do andaime", [["tuboroll", "Tubo-roll (tubo equipado)"], ["multidirecional", "Multidirecional (roseta ou estribo)"]]), sel("linha", "Linha do multidirecional", [["roseta", "Roseta"], ["estribo", "Estribo"]]), ["larguraModulo", "Largura do módulo do multidirecional (m) — uma travessa da linha", "num"],
      ["tubo", "Tubo", "cat", ["HSSC"]], ["barras", "Comprimentos comerciais dos tubos (m)", "txt"], ["diagCada", "Diagonal de fachada a cada N vãos — confirmar RT", "int"], ["diagTransv", "Diagonal transversal", "check"],
      sel("ancoragem", "Ancoragem", [["tubo", "Tubo de amarração + olhal na face"], ["nenhuma", "Nenhuma (só anel fechado ou torre que passa no 4×)"]]), ["ancH", "Ancoragem: espaçamento horizontal (m) — SEM FONTE, RT define", "num"], ["ancV", "Ancoragem: espaçamento vertical (m) — SEM FONTE, RT define", "num"],
      sel("base", "Base", [["regulavel", "Regulável 120 × 120"], ["fixa", "Fixa"], ["rodizio", "Rodízio com trava"]]), ["calco", "Calço de madeira sob a base", "check"],
      sel("acesso", "Acesso", [["auto", "Automático (NR-18: escada de mão por lance acima de 1,0 m)"], ["escada", "Escada de mão por lance (alçapão + ultrapassa 1 m)"], ["coletiva", "Torre de escada de uso coletivo"], ["marinheiro", "Escada marinheiro (NR-18 18.8.6.2)"], ["nenhum", "Nenhum (só com piso até 1,0 m)"]]), ["acessoPos", "Posição do acesso (0 = automático: 1º vão da cabeceira … 1 = último)", "num"],
      ["nr34Montantes", "Sem tubo de 4,50 a 6,00 m como montante a partir do 2º lance (NR-34.11.11, naval — referência)", "check"], ["conexoes3d", "Desenhar as braçadeiras no 3D", "check"]
    ];
  }

  /* ================================================================ O COMPONENTE NO MODELO */
  function estadoEd() { var u = PU(); return u ? u.estado() : null; }
  function caixas() { var e = estadoEd(); return (e && e.caixas) || []; }
  /* ⚠ DUVIDAS H15 (E7): as braçadeiras/bases/escadas são FAMÍLIAS — sem estado.familias o refazer deixa peças órfãs no modelo */
  function prontasTodas() { var e = estadoEd(), M = MP(); return M && e ? M.prontas(e.caixas || [], e.familias || []) : []; }
  function prontaDe(gid) { return prontasTodas().filter(function (p) { return p.id === String(gid) && p.tipo === "andaime"; })[0] || null; }
  function cabecaDe(gid) {
    var hs = caixas().filter(function (c) { return String(c.pronta) === String(gid) && c.prontaInfo; });
    return hs.filter(function (c) { return c.prontaInfo.ref && String(c.prontaInfo.ref.id) === String(c.id); })[0] || hs[hs.length - 1] || null;
  }
  function andaimes() { return prontasTodas().filter(function (p) { return p.tipo === "andaime"; }); }
  /* grava o prontaInfo novo da cabeça (aprovação, cabeçalho, mudanças) — apagar + criar no mesmo lote (um Ctrl+Z volta) */
  function gravarInfo(gid, mutar, pedido) {
    var cx = cabecaDe(gid), b = B(), u = PU(); if (!cx || !b || !b.editarLote) return false;
    var nc = clone(cx); mutar(nc.prontaInfo);
    return !!b.editarLote({ op: "lote", id: String(u.novoId()), origem: "andaime-tela", pedido: pedido || "Andaime", ops: [{ op: "apagar", id: cx.id }, { op: "criar", id: cx.id, caixa: nc }] });
  }
  /* refaz o componente NO LUGAR com o par novo: a aprovação passa por Aprovacao.aoAlterar (M.identidade) */
  function refazer(gid, par, extras, pedido) {
    var M = MP(), u = PU(), b = B(), alvo = prontaDe(gid); if (!M || !u || !b || !alvo) return { ok: false, motivo: "O componente não está mais no modelo." };
    var k = 0, r = M.gerar("andaime", par, function () { return u.novoId(); }, {});
    if (!r.ok) { toast("Andaime: " + r.motivo, "aviso", 9000); return r; }
    var info = { tipo: "andaime", par: r.par, em: relogio(), andaimeTela: clone((alvo.info && alvo.info.andaimeTela) || {}) };
    if (extras) extras(info);
    M.identidade(r, alvo.id, info, alvo);
    if (pedido) r.op.pedido = pedido;
    if (!b.editarLote(r.op)) { toast("O editor recusou o andaime.", "erro"); r.ok = false; return r; }
    return r;
  }

  /* ================================================================ MODO DE TRAÇADO */
  var _sess = null;     /* a sessão ativa (AndaimeTela.novo) */
  var _arma = null;     /* o que o botão pediu antes de o editor criar a sessão: { modo, altura } */
  var _ultAltura = null, _ultInteligente = true, _ultSistema = "tuboroll";
  var _anim = { t: 0, ativo: false };
  function sess(s) {
    if (!s) return _sess;
    if (s.and) { s.and.pts = s.pts; _sess = s.and; }   /* o Esc do editor troca a lista (pts = []): religa a MESMA lista */
    if (!s.and) {
      var a = _arma || { modo: "polilinha" }, base = {};
      s.and = T().novo({ sistema: a.sistema, linha: a.linha, modo: a.modo, altura: a.altura != null ? a.altura : (_ultAltura != null ? _ultAltura : AN().PADRAO.altura), inteligente: _ultInteligente, y0: PU() ? PU().cota() : 0, par: a.par || {} });
      s.and.pts = s.pts;   /* a MESMA lista: Backspace/cancelar do editor valem para a sessão */
      _sess = s.and;
    }
    return s.and;
  }
  function localObra() { try { var C = global.MetalCalcLivreUI; return C && C.localObra ? C.localObra() : null; } catch (e) { return null; } }
  function ventoFalta() { return !T().v0DoLocal(localObra()); }
  /* o HTML do painel do traçado: cada campo leva o ⓘ (tooltip); a linha completa de cada um fica em «Ajuda dos campos» e sob os campos de «Local e vento» */
  function tracoHtml() {
    var sis = _sess ? T().sistemaDe(_sess) : _ultSistema;
    return '<div class="andui-traco-txt" data-andui="traco-txt" role="status"></div>' +
      '<div class="andui-traco-ctl">' +
      '<label>Altura a vencer (m) ' + ajI("altura", sis) + '<input data-andui="altura" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Altura do piso de trabalho em metros"></label>' +
      '<label>Sistema ' + ajI("sistema", sis) + '<select data-andui="sistema" aria-label="Sistema do andaime">' + ["tuboroll", "multi-roseta", "multi-estribo"].map(function (k) { return '<option value="' + k + '">' + esc(T().ROT_SISTEMA[k]) + "</option>"; }).join("") + "</select></label>" +
      '<label>Lado ' + ajI("lado", sis) + '<select data-andui="lado" aria-label="Lado do andaime"></select></label>' +
      '<label class="andui-ck"><input type="checkbox" data-andui="intel"> Montar inteligente ' + ajI("intel", sis) + '</label>' +
      '<button type="button" class="andui-bt pri" data-andui-acao="traco-fechar">Fechar (Enter)</button>' +
      '<button type="button" class="andui-bt" data-andui-acao="traco-voltar">Voltar ponto (⌫)</button>' +
      '<button type="button" class="andui-bt" data-andui-acao="traco-cancelar">Cancelar (Esc)</button>' +
      '<details class="andui-aj-det" data-andui="aj-traco"><summary>Ajuda</summary>' + ["altura", "sistema", "lado", "intel", "V0", "categoria", "telaSombreamento", "faceAte"].map(function (k) { return "<div><b>" + esc(AJ().campo(k, sis).rot) + "</b><br>" + ajL(k, sis) + "</div>"; }).join("") + '</details>' +
      '</div>' +
      '<details class="andui-vento" data-andui="vento"' + (ventoFalta() ? " open" : "") + '><summary>Local e vento</summary><div class="andui-vento-corpo">' +
      '<label><span>V0 (m/s) ' + ajI("V0", sis) + '</span><input data-andui-v="V0" inputmode="decimal" autocomplete="off" aria-label="V0, velocidade básica do vento em metros por segundo"></label>' +
      '<label><span>Categoria do terreno ' + ajI("categoria", sis) + '</span><select data-andui-v="categoria"><option value="">não informada (pior caso: I)</option>' + ["I", "II", "III", "IV", "V"].map(function (c) { return "<option>" + c + "</option>"; }).join("") + '</select></label>' +
      '<label><span>Tipo de tela ' + ajI("telaSombreamento", sis) + '</span><select data-andui-v="telaSombreamento"><option value="">não informada (0,75)</option><option value="0.3">Tela aberta (30 % fechada)</option><option value="0.5">Tela 50 %</option><option value="0.75">Tela 75 %</option><option value="1">Lona (100 %)</option></select></label>' +
      '<label><span>Face até a cota (m) ' + ajI("faceAte", sis) + '</span><input data-andui-v="faceAte" inputmode="decimal" autocomplete="off" placeholder="até o topo" aria-label="Cota até onde a face permite ancorar"></label>' +
      '<small data-andui="vento-nota"></small></div></details>' +
      '<div class="andui-traco-erro" data-andui="traco-erro" role="alert"></div>';
  }
  function painelTraco(prev, sa) {
    var d = doc(); if (!d) return null;
    var el = d.querySelector('[data-andui="traco"]');
    if (!prev && !sa) { if (el) el.remove(); return null; }
    cssGeral();
    if (!el) {
      el = d.createElement("div"); el.className = "andui-traco"; el.setAttribute("data-andui", "traco"); el.setAttribute("role", "region"); el.setAttribute("aria-label", "Traçado do andaime");
      el.innerHTML = tracoHtml();
      d.body.appendChild(el);
      el.addEventListener("click", function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest("[data-andui-acao]") : null; if (!b) return; var a = b.getAttribute("data-andui-acao"); if (a === "traco-fechar") AndaimeUI.fechar(); else if (a === "traco-voltar") AndaimeUI.voltarPonto(); else if (a === "traco-cancelar") AndaimeUI.cancelarTraco(); });
      el.addEventListener("change", function (ev) {
        var t = ev.target, s = _sess; if (!s || !t) return;
        if (t.getAttribute("data-andui-v")) {
          var cp = t.getAttribute("data-andui-v"), er2 = el.querySelector('[data-andui="traco-erro"]'), vv = String(t.value).trim();
          var ch = vv === "" ? { ok: true } : T().aplicarPendencia({}, cp, vv);
          er2.textContent = ch.ok ? "" : ch.erro; s.vento = s.vento || {}; if (ch.ok) { if (vv === "") delete s.vento[cp]; else s.vento[cp] = vv; } else t.value = s.vento[cp] != null ? s.vento[cp] : "";
          painelTraco(null, s); return;
        }
        if (t.getAttribute("data-andui") === "altura") { var er = T().setAltura(s, t.value); el.querySelector('[data-andui="traco-erro"]').textContent = er || ""; if (!er) _ultAltura = s.altura; else t.value = br(s.altura, 2); AndaimeUI.redesenhar(); }
        else if (t.getAttribute("data-andui") === "sistema") { T().setSistema(s, t.value); _ultSistema = t.value; AndaimeUI.redesenhar(); status("Sistema: " + T().ROT_SISTEMA[t.value] + "."); }
        else if (t.getAttribute("data-andui") === "lado") { s.lado = t.value; s.hVis = 0; AndaimeUI.redesenhar(); }
        else if (t.getAttribute("data-andui") === "intel") { s.inteligente = !!t.checked; _ultInteligente = s.inteligente; }
      });
      el.addEventListener("input", function (ev) { avisoDoCampo(ev.target, _sess ? T().sistemaDe(_sess) : _ultSistema); });
      el.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target && ev.target.getAttribute && ev.target.getAttribute("data-andui") === "altura") { ev.preventDefault(); ev.stopPropagation(); ev.target.dispatchEvent(new Event("change", { bubbles: true })); ev.target.blur(); } if (ev.key === "Escape") ev.stopPropagation(); }, true);
    }
    var s = sa || _sess;
    if (s) {
      var ia = el.querySelector('[data-andui="altura"]'); if (ia && d.activeElement !== ia) ia.value = br(s.altura, 2);
      var sl = el.querySelector('[data-andui="lado"]'), L = T().LADOS[s.modo];
      if (sl && sl.getAttribute("data-modo") !== s.modo) { sl.setAttribute("data-modo", s.modo); sl.innerHTML = L.map(function (l) { return '<option value="' + l + '">' + esc(l.charAt(0).toUpperCase() + l.slice(1)) + "</option>"; }).join(""); }
      if (sl) sl.value = s.lado;
      var ic = el.querySelector('[data-andui="intel"]'); if (ic) ic.checked = !!s.inteligente;
      var ss = el.querySelector('[data-andui="sistema"]'); if (ss) ss.value = T().sistemaDe(s);
    }
    if (s) {   /* Local e vento: o V0 sai sozinho do local da obra (AcoIsopletas) quando há coordenada; a fonte é dita */
      var dv = T().v0DoLocal(localObra()), iv = el.querySelector('[data-andui-v="V0"]'), nv = el.querySelector('[data-andui="vento-nota"]'), vt = s.vento || {};
      if (iv) iv.placeholder = dv ? "automático: " + br(dv.v0, 0) : "informe";
      if (nv) nv.textContent = (vt.V0 ? "V0 digitado pelo responsável técnico. " : (dv ? "V0 = " + br(dv.v0, 0) + " m/s — " + dv.fonte + ". Digite para trocar. " : "Sem coordenadas no cadastro da obra: informe o V0 (sem ele o vento fica NÃO VERIFICADO). ")) + "Face vazia = «até o topo» — confirmar. O Montar inteligente roda com estes dados.";
    }
    if (prev && prev.texto) {
      var tx = el.querySelector('[data-andui="traco-txt"]'); tx.textContent = ""; var b = d.createElement("b"); b.textContent = prev.texto.t; tx.appendChild(b);
      if (prev.texto.s) { var sm = d.createElement("small"); sm.textContent = prev.texto.s; tx.appendChild(sm); }
      el.className = "andui-traco " + (prev.texto.cls || ""); el.setAttribute("data-andui-estado", prev.texto.cls || "");
    }
    return el;
  }

  function modo() {
    var self = AndaimeUI;
    return {
      rotulo: "Traçar o andaime (altura a vencer)", orto: true,
      dica: function (s) {
        var a = sess(s); if (!a) return "";
        var t = a.modo === "contorno" ? "Andaime em volta do equipamento: clique os cantos do contorno (3 ou mais), Enter fecha. " : "Andaime: clique os pontos da face a trabalhar, Enter fecha (2 pontos ou mais). ";
        t += "Digite a altura no painel; Tab troca o lado (" + T().ROT_LADO[a.lado] + "), Backspace volta um ponto, Esc cancela — no 3D ou na planta.";
        painelTraco(null, a); return t;
      },
      ponto: function (s, p, U) {
        var a = sess(s); T().clicar(a, p);
        var pv = T().previa(a, null); painelTraco(pv, a);
        U._dica(); if (U._3d) U._3d.redesenhar();
        return true;
      },
      previa: function (s, p, U) {
        var a = sess(s); a.y0 = a.pts.length ? a.pts[0][1] : (p ? p[1] : a.y0);
        var pv = T().previa(a, p); self.ultimaPrevia = pv; painelTraco(pv, a);
        if (pv.subindo) self._animar(pv);
        if (!pv.ok) return null;
        var linhas = [], G = pv.segs;
        function add(lst, rot) { for (var i = 0; i + 5 < lst.length; i += 6) linhas.push({ a: [lst[i], lst[i + 1], lst[i + 2]], b: [lst[i + 3], lst[i + 4], lst[i + 5]], p: rot }); }
        add(G.tubos, "Tubo"); add(G.piso, "Piso"); add(G.ancor, "Tubo"); add(G.guarda, "guarda-corpo");
        return { ok: true, linhas: linhas, resumo: pv.texto.t, avisos: [], corPrevia: null, pv: pv };
      },
      pintar: function (s, p, r, api) {
        var a = sess(s); if (!a || !a.pts.length || !p) return;
        var pts = T().pontosComCursor(a, p), pos = [];
        for (var i = 1; i < pts.length; i++) pos.push(pts[i - 1][0], pts[i - 1][1] + 0.02, pts[i - 1][2], pts[i][0], pts[i][1] + 0.02, pts[i][2]);
        if (a.modo === "contorno" && pts.length >= 3) pos.push(pts[pts.length - 1][0], pts[0][1] + 0.02, pts[pts.length - 1][2], pts[0][0], pts[0][1] + 0.02, pts[0][2]);
        var l = api.linhas(pos, api.cor("--verde", "#15803d"), 1); if (l) api.grp.add(l);
        /* a RÉGUA da altura a vencer no 1º ponto (verde = onde o andaime chega, vermelho tracejado = o que falta) e os níveis */
        var pv = self.ultimaPrevia, y0 = pts[0][1], a0 = pts[0], reg = [a0[0], y0, a0[2], a0[0], y0 + a.altura, a0[2]];
        var cima = pv && pv.ok ? Math.min(pv.hVis, a.altura) : 0;
        var rg = api.linhas(reg, api.cor(pv && pv.ok && !pv.subindo ? "--verde" : "--vermelho", "#c0392b"), 1); if (rg) api.grp.add(rg);
        if (pv && pv.ok) {
          var tk = [], niv = arr(pv.modelo.niveis);
          niv.forEach(function (n) { var y = n.yPiso != null ? n.yPiso : n.y; if (y > pv.hVis + 1e-6 || !(n.piso || n.yPiso != null)) return; tk.push(a0[0] - 0.25, y0 + y, a0[2], a0[0] + 0.25, y0 + y, a0[2]); });
          var tl = api.linhas(tk, api.cor("--verde", "#15803d"), 1); if (tl) api.grp.add(tl);
        }
      },
      enter: function (s, U) { self.fechar(); },
      voltar: function (s) { var a = sess(s); T().voltar(a); painelTraco(T().previa(a, null), a); },
      cancelar: function () { painelTraco(null, null); _sess = null; _arma = null; self.ultimaPrevia = null; }
    };
  }

  /* ================================================================ O OVERLAY 3D (simulação pintada e «Mostrar no 3D») */
  function cena() { var u = PU(); return u && u._3d && u._3d.cena ? u._3d.cena() : null; }
  function limparGrupo(nome) {
    var c = cena(); if (!c) return false; var g = c.scene.getObjectByName(nome); if (!g) return false;
    g.children.slice().forEach(function (o) { g.remove(o); if (o.material && o.material.dispose) o.material.dispose(); });
    c.scene.remove(g); if (g.userData && g.userData.geos) g.userData.geos.forEach(function (x) { x.dispose(); });
    return true;
  }
  /* desenha as primitivas de AndaimeTela.primitivas num grupo da cena; devolve o nº de peças desenhadas */
  function desenharPrims(nome, prims) {
    var c = cena(); if (!c) return 0; limparGrupo(nome);
    var THREE = c.THREE, g = new THREE.Group(); g.name = nome; var geoC = new THREE.CylinderGeometry(1, 1, 1, 10), geoB = new THREE.BoxGeometry(1, 1, 1), geoS = new THREE.SphereGeometry(1, 10, 8), mats = {}, n = 0;
    g.userData.geos = [geoC, geoB, geoS];
    function mat(cor) { if (!mats[cor]) mats[cor] = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.96, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); return mats[cor]; }
    var Y = new THREE.Vector3(0, 1, 0);
    prims.forEach(function (p) {
      var m;
      if (p.k === "cil") {
        var a = new THREE.Vector3(p.a[0], p.a[1], p.a[2]), bb = new THREE.Vector3(p.b[0], p.b[1], p.b[2]), dir = bb.clone().sub(a), len = dir.length(); if (len < 1e-6) return;
        m = new THREE.Mesh(geoC, mat(p.cor)); m.position.copy(a.clone().add(bb).multiplyScalar(0.5)); m.scale.set(p.r, len, p.r); m.quaternion.setFromUnitVectors(Y, dir.normalize());
      } else if (p.k === "caixa") {
        m = new THREE.Mesh(geoB, mat(p.cor)); m.position.set(p.c[0], p.c[1], p.c[2]); m.scale.set(p.L, p.h, p.larg); m.rotation.y = p.giro;
      } else { m = new THREE.Mesh(geoS, mat(p.cor)); m.position.set(p.c[0], p.c[1], p.c[2]); m.scale.set(p.r, p.r, p.r); }
      m.userData.andId = p.id; m.userData.andEstado = p.estado; m.raycast = function () {}; m.renderOrder = 5; g.add(m); n++;
    });
    c.scene.add(g); return n;
  }

  /* ================================================================ O PAINEL */
  var ABAS = [["resumo", "Resumo"], ["calculo", "Cálculo"], ["simulacao", "Simulação"], ["locacao", "Locação"], ["montagem", "Montagem"], ["checklist", "Checklist"], ["aprovacao", "Aprovação"], ["documentos", "Documentos"]];
  var P = null;   /* { gid, aba, msg, quem, sim, destaque, res, parKey } */

  function cssGeral() {
    var d = doc(); if (!d || d.getElementById("andui-css")) return;
    var s = d.createElement("style"); s.id = "andui-css";
    s.textContent =
      ".andui-traco{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:62;width:min(860px,94vw);padding:5px 14px;border-radius:10px;font-size:13px;line-height:1.35;background:var(--surface);color:var(--texto);border:2px solid var(--linha);box-shadow:0 4px 18px rgba(0,0,0,.22)}" +
      ".andui-traco.falta{border-color:var(--vermelho)}.andui-traco.ok{border-color:var(--verde)}.andui-traco-txt b{display:block}.andui-traco-txt small{display:block;color:var(--texto-fraco);font-size:11.5px;margin-top:2px}" +
      ".andui-traco-ctl{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-top:4px}.andui-traco-ctl label{display:flex;gap:6px;align-items:center;font-size:12px}.andui-traco-ctl input:not([type=checkbox]){width:74px;min-height:30px;text-align:right}.andui-traco-ctl select{min-height:30px}" +
      ".andui-vento{margin-top:2px;font-size:12px}.andui-vento summary{cursor:pointer;font-weight:700}.andui-vento-corpo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 10px;margin-top:6px}.andui-vento-corpo label{display:flex;flex-direction:column;gap:2px;font-size:11.5px}.andui-vento-corpo input,.andui-vento-corpo select{min-height:28px}.andui-vento-corpo small{grid-column:1 / -1;color:var(--texto-fraco);font-size:10.5px;line-height:1.25}" +
      ".andui-traco-erro{color:var(--vermelho);font-size:12px;min-height:1.1em}" +
      ".andui-bt{min-height:30px;padding:3px 11px;border-radius:8px;border:1px solid var(--linha-forte,var(--linha));background:var(--surface);color:var(--texto);cursor:pointer;font-size:12.5px}.andui-bt:hover{border-color:var(--aco)}.andui-bt:focus-visible{outline:2px solid var(--aco);outline-offset:1px}.andui-bt.pri{background:var(--aco);color:#fff;border-color:var(--aco)}.andui-bt[disabled]{opacity:.55;cursor:not-allowed}.andui-bt.perigo{border-color:var(--vermelho);color:var(--vermelho)}" +
      ".andui-painel{position:fixed;top:56px;right:0;bottom:0;width:min(520px,100vw);z-index:70;display:flex;flex-direction:column;background:var(--surface);color:var(--texto);border-left:2px solid var(--linha);box-shadow:-6px 0 22px rgba(0,0,0,.2);font-size:13px}" +
      ".andui-cab{display:flex;align-items:flex-start;gap:8px;padding:10px 14px 6px}.andui-cab b{font-size:14.5px}.andui-cab small{display:block;color:var(--texto-fraco);font-size:11.5px}.andui-x{margin-left:auto}" +
      ".andui-abas{display:flex;flex-wrap:wrap;gap:2px;padding:0 10px;border-bottom:1px solid var(--linha)}.andui-aba{border:0;background:none;color:var(--texto-fraco);padding:7px 9px;cursor:pointer;font-size:12.5px;border-bottom:3px solid transparent}.andui-aba[aria-selected=true]{color:var(--texto);font-weight:700;border-bottom-color:var(--aco)}.andui-aba:focus-visible{outline:2px solid var(--aco)}" +
      ".andui-corpo{flex:1;overflow:auto;padding:12px 14px 40px}.andui-corpo h3{font-size:13.5px;margin:14px 0 6px}.andui-corpo h3:first-child{margin-top:0}.andui-corpo p{margin:0 0 6px}.andui-mut{color:var(--texto-fraco);font-size:12px}" +
      ".andui-msg{padding:7px 10px;border-radius:8px;border:1px solid var(--linha);margin-bottom:10px}.andui-msg.erro{border-color:var(--vermelho);color:var(--vermelho)}.andui-msg.ok{border-color:var(--verde)}" +
      ".andui-tab{width:100%;border-collapse:collapse;font-size:12px}.andui-tab th,.andui-tab td{border-bottom:1px solid var(--linha);padding:4px 5px;text-align:left;vertical-align:top}.andui-tab td.n,.andui-tab th.n{text-align:right;white-space:nowrap}.andui-tab tr[data-vid]{cursor:pointer}.andui-tab tr[data-vid]:hover{background:rgba(127,127,127,.1)}" +
      ".andui-chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:700;border:1px solid currentColor;white-space:nowrap}.andui-chip.ok{color:var(--verde)}.andui-chip.atencao{color:#b45309}.andui-chip.falha{color:var(--vermelho)}.andui-chip.nao_verificado{color:var(--texto-fraco)}" +
      ".andui-rt{border:2px solid #b45309;border-radius:10px;padding:9px 11px;margin:8px 0}.andui-rt h3{margin:0 0 6px;color:#b45309}.andui-rt .lin{display:grid;grid-template-columns:1fr 110px auto;gap:6px 8px;align-items:center;margin:6px 0}.andui-rt .lin small{grid-column:1 / -1;color:var(--texto-fraco);font-size:11px;margin-top:-3px}.andui-rt input,.andui-rt select{min-height:28px;width:100%}" +
      ".andui-mud{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--linha);border-radius:8px;padding:6px 8px;margin:5px 0}.andui-mud.desfeita{opacity:.55}.andui-mud div{flex:1}.andui-mud small{display:block;color:var(--texto-fraco);font-size:11px}" +
      ".andui-med{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}.andui-med div{border:1px solid var(--linha);border-radius:8px;padding:5px 8px}.andui-med small{display:block;color:var(--texto-fraco);font-size:11px}" +
      ".andui-leg{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.andui-leg span{display:inline-flex;align-items:center;gap:5px;font-size:12px}.andui-leg i{width:12px;height:12px;border-radius:3px;display:inline-block}" +
      ".andui-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 10px;margin:6px 0}.andui-form label{display:flex;flex-direction:column;gap:2px;font-size:11.5px}.andui-form input,.andui-form select,.andui-form textarea{min-height:28px}" +
      ".andui-chk{border:1px solid var(--linha);border-radius:8px;padding:6px 8px;margin:5px 0}.andui-chk .rb{display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;align-items:center}.andui-chk .rb .andui-bt[aria-pressed=true]{background:var(--aco);color:#fff}.andui-chk.nc{border-color:var(--vermelho)}.andui-chk small{color:var(--texto-fraco);font-size:11px}" +
      ".andui-cartao{border-radius:10px;padding:12px;text-align:center;font-weight:800;font-size:15px;color:#fff;margin:6px 0}.andui-cartao.verde{background:#1f7a3d}.andui-cartao.amarelo{background:#d9a400}.andui-cartao.vermelho{background:#b3261e}.andui-cartao.nulo{background:#5b6673}" +
      ".andui-sis{border:1px solid var(--linha);border-radius:10px;padding:8px 10px;margin:8px 0}.andui-sis h3{margin:0 0 6px}.andui-form .ck{flex-direction:row;align-items:center;gap:6px}" +
      ".andui-hist{list-style:none;padding:0;margin:0;font-size:12px}.andui-hist li{border-left:3px solid var(--linha);padding:2px 0 2px 8px;margin:3px 0}" +
      ".andui-i{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:3px;border-radius:50%;border:1px solid var(--aco);color:var(--aco);font-size:10px;line-height:1;cursor:help;vertical-align:middle;user-select:none}.andui-i:focus-visible{outline:2px solid var(--aco);outline-offset:1px}" +
      ".andui-aj{display:block;color:var(--texto-fraco);font-size:10.5px;line-height:1.28;margin-top:2px;font-weight:400}.andui-aj b{font-weight:700}.andui-aviso{display:block;color:var(--vermelho);font-size:11px;line-height:1.25;margin-top:2px}[aria-invalid=true]{border-color:var(--vermelho)!important}" +
      ".andui-aj-det{font-size:12px;position:relative}.andui-traco .andui-aj-det[open]>div{max-width:300px}.andui-aj-det summary{cursor:pointer;font-weight:700}.andui-aj-det div{margin:4px 0}.andui-form{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))!important}.andui-form .ck{flex-wrap:wrap}.andui-form .ck .andui-aj{flex-basis:100%}" +
      ".andui-faixa{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border:2px solid #b45309;border-radius:10px;padding:8px 10px;margin:10px 0}" +
      ".andui-diag{border:1px solid var(--linha);border-left:5px solid var(--linha);border-radius:10px;padding:9px 11px;margin:10px 0}.andui-diag.falha{border-left-color:var(--vermelho)}.andui-diag.atencao{border-left-color:#b45309}.andui-diag.nao_verificado{border-left-color:var(--texto-fraco)}.andui-diag.ok{border-left-color:var(--verde)}" +
      ".andui-diag p{margin:5px 0}.andui-diag-cab{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.andui-diag small{display:block;color:var(--texto-fraco);font-size:11.5px;margin:2px 0}.andui-diag .lin{display:grid;grid-template-columns:1fr 110px auto;gap:6px 8px;align-items:center;margin:6px 0}.andui-diag .lin .andui-aj{grid-column:1 / -1}.andui-diag .lin input:not([type=checkbox]),.andui-diag .lin select{min-height:28px;width:100%}" +
      ".andui-op{border:1px solid var(--linha);border-radius:8px;padding:7px 9px;margin:6px 0}.andui-op.rec{border-color:var(--verde);background:rgba(31,157,85,.07)}.andui-op-t{margin:3px 0;font-weight:600}.andui-op .andui-bt{margin-top:5px}" +
      ".andui-memo-det td{background:rgba(127,127,127,.06)}.andui-tab tr[data-memo]{cursor:pointer}.andui-tab tr[data-memo]:hover{background:rgba(127,127,127,.1)}" +
      "@media (max-width:760px){.andui-painel{top:0;width:100vw}.andui-traco{bottom:8px}}";
    d.head.appendChild(s);
  }

  /* qual entrada do dicionário de ajuda este campo da tela usa */
  var CHAVES_CAMPO = ["data-andui-cab", "data-andui-mp", "data-andui-p", "data-andui-pj", "data-andui-v", "data-andui-ip", "data-andui-ipj", "data-andui-f"];
  function idDoCampo(t) {
    if (!t || !t.getAttribute) return null;
    for (var i = 0; i < CHAVES_CAMPO.length; i++) { var v = t.getAttribute(CHAVES_CAMPO[i]); if (v) return v; }
    var a = t.getAttribute("data-andui"); return /^(altura|sistema|lado|intel)$/.test(a || "") ? a : null;
  }
  /* fora da faixa que o motor recusa → aviso ao lado do campo (role=alert via aria-invalid); NUNCA apaga o que foi digitado */
  function avisoDoCampo(t, sis) {
    var id = idDoCampo(t), a = AJ(); if (!id || !a || !a.campo(id) || !t.parentNode) return;
    var msg = t.type === "checkbox" ? "" : a.validar(id, t.value, sis), host = t.parentNode, av = host.querySelector('[data-aj-aviso="' + id + '"]');
    if (!msg) { if (av) av.remove(); t.removeAttribute("aria-invalid"); return; }
    if (!av) { av = doc().createElement("small"); av.className = "andui-aviso"; av.setAttribute("data-aj-aviso", id); av.setAttribute("role", "alert"); t.parentNode.insertBefore(av, t.nextSibling); }
    av.textContent = msg; t.setAttribute("aria-invalid", "true");
  }
  function raiz() { var d = doc(); return d ? d.querySelector('[data-andui="painel"]') : null; }
  function lerDoModelo() {
    if (!P) return null;
    var alvo = prontaDe(P.gid); if (!alvo || !alvo.info || !alvo.info.par) return null;
    var par = MP().parParaRefazer(alvo);
    return { alvo: alvo, par: par, ap: AD().Aprovacao.ler(alvo.info.aprovacao), tela: alvo.info.andaimeTela || {} };
  }
  var _resCache = { k: null, v: null };
  function resultadoDe(par) { var k = JSON.stringify(par); if (_resCache.k === k) return _resCache.v; var r = T().recalcular(par); _resCache.k = k; _resCache.v = r; return r; }

  function chipEstado(est, rot) { return '<span class="andui-chip ' + esc(est) + '">' + esc(rot || T().ROT_ESTADO[est] || est) + "</span>"; }
  function msgHtml() { if (!P || !P.msg) return ""; return '<div class="andui-msg ' + (P.msg.erro ? "erro" : "ok") + '" role="' + (P.msg.erro ? "alert" : "status") + '" data-andui="msg">' + esc(P.msg.t) + "</div>"; }
  function dizer(t, erro) { if (P) P.msg = { t: t, erro: !!erro }; if (erro) toast(t, "aviso", 9000); }

  /* ---------------------------------------------------------------- responsável técnico e obra */
  function empresaApp() { var d = {}; try { if (global.Empresa && global.Empresa.dados) d = global.Empresa.dados() || {}; } catch (e) {} return d; }
  /* o cabeçalho que vale agora: o que foi digitado + (se vazio) a aprovação + o cadastro da empresa — a mesma conta para a tela, as pranchas e o memorial */
  function cabDe(D) { return T().cabPreenchido(D.tela.cab, D.ap, empresaApp()); }
  var CAMPOS_RT = [["empresa", "Empresa"], ["responsavel", "Responsável técnico (nome)"], ["tituloProfissional", "Título profissional (Eng. Civil / Eng. Mecânico…)"], ["registro", "Registro CREA/CAU"], ["art", "ART nº"],
    ["proprietario", "Contratante / Proprietário"], ["obra", "Obra"], ["local", "Local"], ["andaime", "Código do andaime"], ["revisao", "Revisão"], ["data", "Data"]];
  function camposCabHtml(cab) { return CAMPOS_RT.map(function (x) { return '<label>' + x[1] + ' ' + ajI(x[0]) + '<input data-andui-cab="' + x[0] + '" value="' + esc(cab[x[0]]) + '" autocomplete="off">' + ajL(x[0]) + '</label>'; }).join(""); }
  /* o MESMO bloco em Documentos e Resumo (e na Locação): grava em D.tela.cab pelo handler de data-andui-cab */
  function blocoRT(D) {
    var cab = cabDe(D);
    return '<div data-andui="bloco-rt"><h3>Responsável técnico e obra</h3><p class="andui-mut">Estes dados vão para o carimbo das pranchas e para o memorial. Campo vazio usa a aprovação do projeto e o cadastro da empresa; o que não existe fica em branco, nunca inventado.</p>' +
      '<div class="andui-form" data-andui="cab-rt">' + camposCabHtml(cab) + "</div></div>";
  }

  /* ---------------------------------------------------------------- abas */
  /* as pendências do RT: lista GENÉRICA (a tela não conhece os campos: lê o que o cálculo do sistema manda em calc.pendenciasRT) */
  function dicaPend(p, sis) { return AJ() && AJ().campo(p.campo, sis) ? ajL(p.campo, sis) : "<small>" + esc(p.dica) + "</small>"; }
  function blocoPendencias(D, res) {
    var h = "", sis = T().sistemaDe(D.par);
    if (D.tela.fonteV0) h += '<p class="andui-mut" data-andui="fonte-v0">V0 — fonte: ' + esc(D.tela.fonteV0) + ".</p>";
    h += '<div class="andui-rt" data-andui="pendencias-rt"><h3>Pendências do responsável técnico</h3><p class="andui-mut">O sistema não tem estes dados e não os inventa. Sem eles a verificação correspondente fica NÃO VERIFICADA (cinza) — nunca verde.</p>';
    T().pendenciasRT(D.par, res && res.calc).forEach(function (p) {
      if (p.tipo === "marca") {   /* C-T1.1: caixa + justificativa do RT (mesmo padrão: Aplicar → AndaimeUI.informar → reagirAoDado) */
        h += '<div class="lin" data-andui-pend="' + esc(p.campo) + '"><label for="andp-' + esc(p.campo) + '">' + esc(p.rotulo) + " " + (p.informado ? chipEstado("ok", "conferido") : chipEstado("atencao", "pendente")) + " " + ajI(p.campo, sis) + "</label>";
        h += '<label style="display:inline-flex;gap:5px;align-items:center"><input type="checkbox" id="andp-' + esc(p.campo) + '" data-andui-p="' + esc(p.campo) + '"' + (p.valor ? " checked" : "") + '> ' + esc(p.campo === "ventoParaleloRT" ? "Vento paralelo à fachada conferido pelo RT" : (p.rotuloMarca || "Conferido pelo RT")) + '</label>';
        h += '<input data-andui-pj="' + esc(p.campo) + '" placeholder="Justificativa do RT (mín. 15 caracteres)" value="' + esc(p.justificativa || "") + '" autocomplete="off" aria-label="Justificativa do RT: ' + esc(p.rotulo) + '">';
        h += '<button type="button" class="andui-bt" data-andui-acao="pend-aplicar" data-campo="' + esc(p.campo) + '">Aplicar</button>' + dicaPend(p, sis) + "</div>";
        return;
      }
      var v = p.valor == null ? "" : (p.tipo === "num" ? br(p.valor, p.campo === "telaSombreamento" ? 2 : 2) : p.valor);
      h += '<div class="lin" data-andui-pend="' + esc(p.campo) + '"><label for="andp-' + esc(p.campo) + '">' + esc(p.rotulo) + " " + (p.informado ? chipEstado("ok", "informado") : chipEstado("atencao", p.valor != null && !p.confirmado ? "confirmar" : "pendente")) + " " + ajI(p.campo, sis) + "</label>";
      if (p.tipo === "sel") h += '<select id="andp-' + esc(p.campo) + '" data-andui-p="' + esc(p.campo) + '"><option value="">—</option>' + p.ops.map(function (o) { return '<option value="' + o + '"' + (String(p.valor) === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select>";
      else h += '<input id="andp-' + esc(p.campo) + '" data-andui-p="' + esc(p.campo) + '" inputmode="decimal" value="' + esc(v) + '" autocomplete="off">';
      h += '<button type="button" class="andui-bt" data-andui-acao="pend-aplicar" data-campo="' + esc(p.campo) + '">Aplicar</button>';
      if (p.confirma) h += '<small><label style="display:inline-flex;gap:5px;align-items:center"><input type="checkbox" data-andui-pc="' + esc(p.campo) + '"' + (p.confirmado ? " checked" : "") + '> Confirmo como RT (preciso confirmar para a verificação contar)</label></small>';
      h += dicaPend(p, sis) + "</div>";
    });
    h += "</div>";
    return h;
  }

  /* o seletor de sistema e o formulário do multidirecional (M4-A) */
  function blocoSistema(D) {
    var cur = T().sistemaDe(D.par), multi = cur !== "tuboroll", h = '<div class="andui-sis" data-andui="sistema-bloco"><h3>Sistema do andaime</h3>';
    h += '<div class="andui-form"><label>Sistema ' + ajI("sistema", cur) + '<select data-andui-f="sistema" aria-label="Sistema do andaime">' + ["tuboroll", "multi-roseta", "multi-estribo"].map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + esc(T().ROT_SISTEMA[k]) + "</option>"; }).join("") + "</select>" + ajL("sistema", cur) + "</label></div>";
    h += '<p><button type="button" class="andui-bt" data-andui-acao="sistema-trocar">Trocar o sistema</button> <span class="andui-mut">Refaz o andaime no lugar com o mesmo traçado e a mesma altura; os parâmetros voltam ao padrão do sistema novo e a aprovação volta para «em revisão».</span></p>';
    if (multi) {
      h += '<h3 style="margin-top:10px">Parâmetros do multidirecional</h3><div class="andui-form" data-andui="param-multi">';
      T().PARAMETROS_MULTI.forEach(function (d) {
        var v = D.par[d.id], id = 'andmp-' + d.id;
        if (d.tipo === "check") h += '<label class="ck" for="' + id + '"><input type="checkbox" id="' + id + '" data-andui-mp="' + d.id + '"' + (v === false || v === "false" ? "" : " checked") + "> " + esc(d.rotulo) + " " + ajI(d.id, cur) + ajL(d.id, cur) + "</label>";
        else if (d.id === "larguraModulo") h += '<label>' + esc(d.rotulo) + ' ' + ajI(d.id, cur) + '<select id="' + id + '" data-andui-mp="' + d.id + '">' + T().largurasDaLinha(D.par.linha).map(function (w) { return '<option value="' + w + '"' + (Math.abs(num(v, 0) - w) < 1e-6 ? " selected" : "") + ">" + br(w, 2) + " m</option>"; }).join("") + "</select>" + ajL(d.id, cur) + "</label>";
        else if (d.tipo === "sel") { var cv = d.id === "pisos" ? (String(v) === "todos" ? "todos" : "topo") : String(v); h += '<label>' + esc(d.rotulo) + ' ' + ajI(d.id, cur) + '<select id="' + id + '" data-andui-mp="' + d.id + '">' + d.ops.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cv ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" + ajL(d.id, cur) + "</label>"; }
        else h += '<label>' + esc(d.rotulo) + ' ' + ajI(d.id, cur) + '<input id="' + id + '" data-andui-mp="' + d.id + '" inputmode="decimal" value="' + esc(br(v, d.int ? 0 : 2)) + '" autocomplete="off">' + ajL(d.id, cur) + '</label>';
      });
      h += '</div><p><button type="button" class="andui-bt pri" data-andui-acao="multi-aplicar">Aplicar os parâmetros</button> <span class="andui-mut">Guarda-corpo do multidirecional: travessão a 1,00 m e intermediário a 0,50 m (NR-18 18.12.15.2). A altura se muda em «Altura a vencer».</span></p>';
    }
    return h + "</div>";
  }

  function abaResumo(D, res) {
    var M = res.modelo.medidas, c = res.calc, ver = T().verificacoes(c), nF = ver.filter(function (v) { return v.estado === "falha"; }).length, nA = ver.filter(function (v) { return v.estado === "atencao"; }).length, nN = ver.filter(function (v) { return v.estado === "nao_verificado"; }).length;
    var passou = nF === 0, h = "";
    h += "<h3>Situação</h3>";
    h += '<p>' + (passou ? chipEstado(nN || nA ? "atencao" : "ok", nN || nA ? "passou, com pendências" : "passou em tudo") : chipEstado("falha", "NÃO passou")) + " <span class=\"andui-mut\">" + (nF ? nF + " verificação(ões) reprovada(s). " : "") + (nA ? nA + " em atenção. " : "") + (nN ? nN + " não verificada(s) por falta de dado do RT." : "") + "</span></p>";
    h += '<p class="andui-mut" data-andui="aviso-calculo">' + esc(c.resumo || "") + "</p>";
    h += '<div class="andui-med">' + [["Comprimento", br(M.comprimento) + " m"], ["Largura", br(M.largura) + " m"], ["Piso mais alto", br(M.alturaPiso) + " m"], ["Vãos × levantes", M.nVaos + " × " + M.nLevantes], ["Pisos de trabalho", M.nPisos], [res.modelo.sistema === "multidirecional" ? "Postes" : "Prumadas", res.modelo.sistema === "multidirecional" ? M.nPostes : M.nMontantes], ["Ancoragens", M.nAncoragens], ["Área de piso", br(M.areaPiso != null ? M.areaPiso : M.areaForrada) + " m²"], ["Peso do conjunto", br(M.pesoTotal, 0) + " kg"], ["Tubos", M.nTubos], ["Conexões", M.nConexoesTotal], ["Tela", br(res.modelo.tela ? res.modelo.tela.area : 0) + " m²"]].map(function (x) { return "<div><small>" + esc(x[0]) + "</small><b>" + esc(x[1]) + "</b></div>"; }).join("") + "</div>";
    /* altura */
    h += "<h3>Altura a vencer</h3>" + '<div class="andui-form"><label>Altura do piso de trabalho (m) ' + ajI("altura", T().sistemaDe(D.par)) + '<input data-andui-f="altura" inputmode="decimal" value="' + esc(br(D.par.altura, 2)) + '">' + ajL("altura", T().sistemaDe(D.par)) + '</label></div>' +
      '<p><button type="button" class="andui-bt pri" data-andui-acao="altura-aplicar">Aplicar a altura</button> <button type="button" class="andui-bt" data-andui-acao="reinteligente" title="Roda de novo o gerador que corrige o andaime e lista o que mudou">Refazer com Montar inteligente</button> <button type="button" class="andui-bt" data-andui-acao="param-dialogo">Parâmetros avançados…</button></p>' +
      '<p class="andui-mut">Mudar a altura (ou qualquer parâmetro) refaz o andaime no lugar. Aprovado/liberado volta para «em revisão» com o cartão vermelho.</p>';
    /* mudanças */
    var mud = arr(D.tela.mudancas);
    h += "<h3>O que o Montar inteligente mudou</h3>";
    if (!mud.length) h += '<p class="andui-mut" data-andui="sem-mudancas">Nenhuma mudança: o andaime passou com os valores que você pediu' + (D.tela.inteligente === false ? " (Montar inteligente desligado)." : ".") + "</p>";
    else h += '<p class="andui-mut">O gerador ajustou ' + mud.length + " parâmetro(s) para o andaime passar. Cada um se desfaz sozinho — o cálculo mostra o que acontece.</p>" +
      mud.map(function (m) {
        return '<div class="andui-mud' + (m.desfeita ? " desfeita" : "") + '" data-andui-mud="' + esc(m.id) + '"><div><b>' + esc(m.texto) + "</b><small>" + esc(m.motivo) + "</small></div>" +
          (m.desfeita ? '<span class="andui-mut">desfeita</span>' : '<button type="button" class="andui-bt" data-andui-acao="desfazer" data-k="' + esc(m.id) + '">Desfazer</button>') + "</div>";
      }).join("");
    h += blocoRT(D);
    h += blocoSistema(D);
    h += blocoPendencias(D, res);
    if (arr(res.pendenciasTexto).length) h += '<h3>Hipóteses em uso</h3><ul class="andui-mut">' + res.pendenciasTexto.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
    return h;
  }

  /* ---------------------------------------------------------------- E11: DIAGNÓSTICO COM CORREÇÃO GUIADA (aba Cálculo e Memorial na tela)
   * Um cartão por verificação que não está ok: o que é · por que não passou (com os números) · as opções com «o que muda» e o RESULTADO PREVISTO já recalculado ·
   * o campo do dado que falta. Quem decide é o usuário: nada é aplicado sem o clique em [Corrigir], e tudo se desfaz. Os textos vêm de js/andaimeajuda.js. */
  var _diagCache = { k: null, v: null };
  function diagnosticoDe(D, res) { var k = JSON.stringify(D.par); if (_diagCache.k === k) return _diagCache.v; var v = T().diagnostico(D.par, res.calc); _diagCache.k = k; _diagCache.v = v; return v; }
  function sisDe(D) { return T().sistemaDe(D.par); }

  /* o campo do dado que falta, DENTRO do cartão (atributos próprios: data-andui-ip/ipc/ipj — os do bloco de pendências seguem únicos na aba) */
  function campoInlineHtml(p, sis, vid) {
    var id = esc(p.campo), h = '<div class="lin" data-andui-il="' + id + '"><label>' + esc(p.rotulo) + " " + ajI(p.campo, sis) + "</label>";
    if (p.tipo === "marca") {
      h += '<label class="ck"><input type="checkbox" data-andui-ip="' + id + '"' + (p.valor ? " checked" : "") + "> " + esc(p.rotuloMarca || tx("confirmoRT")) + "</label>";
      h += '<input data-andui-ipj="' + id + '" placeholder="' + esc(tx("justificativa")) + '" value="' + esc(p.justificativa || "") + '" autocomplete="off" aria-label="' + esc(tx("justificativa")) + '">';
    } else if (p.tipo === "sel") {
      h += '<select data-andui-ip="' + id + '" aria-label="' + esc(p.rotulo) + '"><option value="">—</option>' + arr(p.ops).map(function (o) { return '<option value="' + esc(o) + '"' + (String(p.valor) === o ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    } else h += '<input data-andui-ip="' + id + '" inputmode="decimal" value="' + esc(p.valor == null ? "" : br(p.valor, 2)) + '" autocomplete="off" aria-label="' + esc(p.rotulo) + '">';
    if (p.confirma) h += '<label class="ck"><input type="checkbox" data-andui-ipc="' + id + '"' + (p.confirmado ? " checked" : "") + "> " + esc(tx("confirmoRT")) + "</label>";
    h += '<button type="button" class="andui-bt pri" data-andui-acao="inline-recalcular" data-campo="' + id + '" data-vid="' + esc(vid) + '">' + esc(tx("recalcular")) + "</button>" + ajL(p.campo, sis) + "</div>";
    return h;
  }
  function cartaoHtml(c, sis) {
    var A = AJ(), h = '<div class="andui-diag ' + esc(c.estado) + '" data-andui-card="' + esc(c.vid) + '">';
    h += '<div class="andui-diag-cab"><b>' + esc(c.titulo) + "</b> " + chipEstado(c.estado) + (c.usoTxt && c.usoTxt !== "—" ? ' <span class="andui-mut">uso ' + esc(c.usoTxt) + "</span>" : "") + "</div>";
    if (c.oQueE) h += '<p class="andui-diag-o" data-andui="o-que-e"><b>' + esc(tx("oQueE")) + ":</b> " + esc(c.oQueE) + "</p>";
    h += '<p class="andui-diag-c" data-andui="causa"><b>' + esc(tx(c.estado === "nao_verificado" ? "falta" : (c.estado === "atencao" ? "porqueAtencao" : "porque"))) + ":</b> " + esc(c.causa) + "</p>";
    if (c.opcoes.length) {
      h += '<p class="andui-diag-t"><b>' + esc(tx("comoResolver")) + ":</b></p>";
      c.opcoes.forEach(function (o, i) {
        h += '<div class="andui-op' + (o.id === c.recomendada ? " rec" : "") + '" data-andui-op="' + esc(o.id) + '"><div><b>' + esc(tx("opcao")) + " " + (i + 1) + "</b>" + (o.id === c.recomendada ? ' <span class="andui-chip ok">' + esc(tx("recomendada")) + "</span>" : "") + "</div>" +
          '<div class="andui-op-t">' + esc(o.texto) + "</div>" + (o.conjunto ? "<small>" + esc(tx("conjunto")) + "</small>" : "") +
          '<small data-andui="op-muda"><b>' + esc(tx("oQueMuda")) + ":</b> " + esc(o.delta) + "</small>" +
          '<small data-andui="op-previsto"><b>' + esc(tx("resultadoPrevisto")) + ":</b> " + esc(A.textoPrevisto(o.previsto)) + "</small>" +
          '<button type="button" class="andui-bt pri" data-andui-acao="corrigir-opcao" data-vid="' + esc(c.vid) + '" data-op="' + esc(o.id) + '">' + esc(tx("corrigir")) + "</button></div>";
      });
    } else if (c.estado !== "nao_verificado") h += '<p class="andui-mut" data-andui="sem-opcao">' + esc(tx("semOpcao")) + "</p>";
    if (c.decisaoRT.length) h += '<div class="andui-mut"><b>' + esc(tx("soRT")) + ":</b><ul>" + c.decisaoRT.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    if (c.dados.length) h += '<p class="andui-diag-t"><b>' + esc(tx("dadoInline")) + ":</b></p>" + c.dados.map(function (p) { return campoInlineHtml(p, sis, c.vid); }).join("");
    if (c.semCampo) h += '<p class="andui-mut" data-andui="sem-campo">' + esc(c.semCampo) + "</p>";
    if (c.pecas.length) h += '<p><button type="button" class="andui-bt" data-andui-acao="mostrar-vid" data-vid="' + esc(c.vid) + '">' + esc(tx("mostrar3d")) + "</button></p>";
    return h + "</div>";
  }
  function faixaHtml(dg) {
    if (!dg.n) return '<p class="andui-msg ok" data-andui="faixa-problemas">' + esc(tx("faixaZero")) + "</p>";
    var c = dg.cont;
    return '<div class="andui-faixa" data-andui="faixa-problemas"><b>' + dg.n + " " + esc(tx("faixaTitulo")) + '</b> <span class="andui-mut">(' + c.falha + " não passam · " + c.atencao + " em atenção · " + c.nao_verificado + " sem dado)</span>" +
      (dg.nCorrigivel ? ' <button type="button" class="andui-bt pri" data-andui-acao="corrigir-tudo">' + esc(tx("corrigirTudo")) + "</button>" : "") + "</div>";
  }
  function restanteHtml(rest) {
    if (!rest || !rest.length) return "";
    return '<div data-andui="restante"><b>' + esc(tx("mesmoCorrigindo")) + ":</b><ul>" + rest.map(function (r) { return "<li><b>" + esc(r.titulo) + ":</b> " + esc(r.causa) + (arr(r.decisaoRT).length ? " <i>" + esc(tx("soRT")) + ": " + esc(r.decisaoRT[0]) + "</i>" : "") + "</li>"; }).join("") + "</ul></div>";
  }
  /* «Deseja corrigir? Vai mudar: …» — a lista ANTES de aplicar */
  function previaTudoHtml(pv) {
    if (!pv) return "";
    if (!pv.ok) return '<div class="andui-msg erro" role="alert" data-andui="previa-tudo">' + esc(pv.erro) + "</div>";
    var h = '<div class="andui-msg" data-andui="previa-tudo" role="region"><b>' + esc(tx("deseja")) + ":</b>";
    if (pv.semMudancas) h += "<p>" + esc(tx("nadaMudar")) + "</p>";
    else h += "<ul>" + pv.mudancas.map(function (m) { return "<li><b>" + esc(m.txt) + "</b><br><small>" + esc(m.motivo) + "</small></li>"; }).join("") + "</ul><small>" + esc(tx("oQueMuda")) + ": " + esc(pv.delta) + " · verificações que não passam: " + pv.falhasAntes + " → " + pv.falhasDepois + ".</small>";
    h += restanteHtml(pv.restante) + "<p>" + (pv.semMudancas ? "" : '<button type="button" class="andui-bt pri" data-andui-acao="corrigir-tudo-aplicar">' + esc(tx("aplicar")) + "</button> ") + '<button type="button" class="andui-bt" data-andui-acao="corrigir-tudo-cancelar">' + esc(tx("cancelar")) + "</button></p></div>";
    return h;
  }
  /* depois de aplicar o «Corrigir tudo»: o resumo, o Desfazer de cada mudança e o que só o RT resolve */
  function fechamentoHtml(f, D) {
    if (!f) return "";
    var lista = arr(D.tela.mudancas), itens = arr(f.ids).map(function (id) { return lista.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    return '<div class="andui-msg ' + (f.passou ? "ok" : "erro") + '" data-andui="fechamento-tudo" role="status"><b>Corrigido: ' + itens.length + " mudança(s).</b>" +
      itens.map(function (m) { return '<div class="andui-mud' + (m.desfeita ? " desfeita" : "") + '" data-andui-mud-tudo="' + esc(m.id) + '"><div><b>' + esc(m.texto) + "</b><small>" + esc(m.motivo) + "</small></div>" + (m.desfeita ? '<span class="andui-mut">desfeita</span>' : '<button type="button" class="andui-bt" data-andui-acao="desfazer" data-k="' + esc(m.id) + '">' + esc(tx("desfazer")) + "</button>") + "</div>"; }).join("") + restanteHtml(f.restante) + "</div>";
  }
  /* depois de [Corrigir] numa opção: «Corrigido — …: uso 1,42 → 0,43 (passa)» + Desfazer */
  function corrigidoHtml(u, D) {
    if (!u) return "";
    var lista = arr(D.tela.mudancas), ativos = arr(u.ids).filter(function (id) { return lista.some(function (x) { return x.id === id && !x.desfeita; }); });
    return '<div class="andui-msg ok" data-andui="corrigido" role="status">' + esc(u.txt) + (ativos.length ? ' <button type="button" class="andui-bt" data-andui-acao="desfazer-grupo" data-ids="' + esc(ativos.join(",")) + '">' + esc(tx("desfazer")) + "</button>" : "") + "</div>";
  }
  function blocoDiagnostico(D, res, dg) {
    var S = P || {}, sis = sisDe(D);
    return corrigidoHtml(S.ultCorrecao, D) + fechamentoHtml(S.fechamentoTudo, D) + previaTudoHtml(S.previaTudo) + faixaHtml(dg) +
      (dg.itens.length ? '<div data-andui="diagnostico">' + dg.itens.map(function (c) { return cartaoHtml(c, sis); }).join("") + "</div>" : "");
  }

  function abaCalculo(D, res) {
    var ver = T().verificacoes(res.calc), dg = diagnosticoDe(D, res), h = "";
    h += '<p class="andui-mut">Clique numa linha para ver as peças no 3D. Uso = solicitante ÷ resistente (1,00 é o limite).</p>';
    h += '<table class="andui-tab" data-andui="verificacoes"><thead><tr><th>Verificação</th><th class="n">Uso</th><th>Estado</th></tr></thead><tbody>' +
      ver.map(function (v) { return '<tr data-vid="' + esc(v.id) + '" tabindex="0" title="Mostrar no 3D"><td>' + esc(v.titulo) + '</td><td class="n">' + esc(v.usoTxt) + "</td><td>" + chipEstado(v.estado) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += blocoDiagnostico(D, res, dg);
    var nao = arr(res.calc.naoVerificado); if (nao.length) h += "<h3>Não verificado</h3><ul class=\"andui-mut\">" + nao.slice(0, 12).map(function (t) { return "<li>" + esc(typeof t === "string" ? t : (t.texto || t.titulo || JSON.stringify(t))) + "</li>"; }).join("") + "</ul>";
    h += blocoPendencias(D, res);
    return h;
  }

  /* o MEMORIAL NA TELA (aba Documentos): a tabela das verificações; abrir a linha mostra o cartão (corrigir aqui = o mesmo corrigir da aba Cálculo) */
  function abaMemorial(D, res) {
    var S = P || {}, sis = sisDe(D), dg = diagnosticoDe(D, res), rows = T().memorial(res.calc), aberto = S.memoAbertas || {}, A = AJ(), h = "";
    var porVid = {}; dg.itens.forEach(function (c) { porVid[c.vid] = c; });
    h += '<div data-andui="memorial"><h3>' + esc(tx("memorialTitulo")) + "</h3>";
    h += '<p class="andui-mut" data-andui="memorial-aviso">' + esc(tx("memorialAviso")) + " " + esc(tx("memorialAbrir")) + "</p>";
    h += '<p class="andui-mut" data-andui="memorial-resumo">' + esc(res.calc.resumo || "") + "</p>";
    h += blocoDiagnostico(D, res, dg);
    h += '<p><button type="button" class="andui-bt" data-andui-acao="memo-recalcular">' + esc(tx("memorialRecalcular")) + "</button></p>";
    h += '<table class="andui-tab" data-andui="memorial-tab"><thead><tr><th>' + esc(tx("cabVerificacao")) + "</th><th>" + esc(tx("cabSolicitante")) + "</th><th>" + esc(tx("cabResistente")) + '</th><th class="n">' + esc(tx("cabUso")) + "</th><th>" + esc(tx("cabEstado")) + "</th></tr></thead><tbody>" +
      rows.map(function (r) {
        var ab = !!aberto[r.vid], c = porVid[r.vid], det = "";
        if (ab) {
          det = '<tr class="andui-memo-det" data-andui-memo-det="' + esc(r.vid) + '"><td colspan="5">' + (c ? cartaoHtml(c, sis) :
            '<div class="andui-diag ok" data-andui-card="' + esc(r.vid) + '"><p class="andui-diag-o"><b>' + esc(tx("oQueE")) + ":</b> " + esc(A.explicacao(r.vid)) + "</p>" + (r.texto ? "<p>" + esc(r.texto) + "</p>" : "") + (r.formula ? '<p class="andui-mut">' + esc(r.formula) + "</p>" : "") + (r.fonte ? '<p class="andui-mut">' + esc(r.fonte) + "</p>" : "") + "</div>") + "</td></tr>";
        }
        return '<tr data-memo="' + esc(r.vid) + '" tabindex="0" aria-expanded="' + (ab ? "true" : "false") + '"><td>' + (ab ? "▾ " : "▸ ") + esc(r.titulo) + "</td><td>" + esc(r.solicitante) + "</td><td>" + esc(r.resistente) + '</td><td class="n">' + esc(r.usoTxt) + "</td><td>" + chipEstado(r.estado) + "</td></tr>" + det;
      }).join("") + "</tbody></table></div>";
    return h;
  }

  function abaSimulacao(D, res) {
    var AcC = AC(), sim = AcC.simulacao(res.modelo, res.calc), pint = T().pintura(sim), c = pint.contagem, h = "";
    h += '<p class="andui-mut">Pinta cada peça do 3D pelo resultado do cálculo: verde passa, amarelo atenção, vermelho não passa, <b>cinza = dado faltando</b> (não é aprovação).</p>';
    h += '<p><button type="button" class="andui-bt pri" data-andui-acao="sim-toggle" aria-pressed="' + (P.sim ? "true" : "false") + '">' + (P.sim ? "Tirar a pintura do 3D" : "Pintar no 3D") + "</button></p>";
    h += '<div class="andui-leg" data-andui="legenda">' + [["ok", "passa"], ["atencao", "atenção"], ["falha", "não passa"], ["nao_verificado", "não verificado"]].map(function (x) { return '<span><i style="background:' + T().COR_ESTADO[x[0]] + '"></i>' + x[1] + ' <b data-andui-cont="' + x[0] + '">' + c[x[0]] + "</b></span>"; }).join("") + "</div>";
    h += '<p class="andui-mut">' + pint.total + " peças pintadas (tubos, pranchas, rodapés, conexões, bases e calços).</p>";
    return h;
  }

  function abaLocacao(D, res) {
    var cab = cabDe(D), lista = AD().listaLocacao(res.modelo, cab), h = "";
    h += '<div class="andui-form" data-andui="cab">' + camposCabHtml(cab) +
      '<label>Reserva (% a mais) ' + ajI("reserva") + '<input data-andui-cab="reserva" inputmode="decimal" value="' + esc(cab.reserva) + '">' + ajL("reserva") + '</label></div>';
    h += '<p><button type="button" class="andui-bt pri" data-andui-acao="xlsx">Baixar a lista (.xlsx)</button></p>';
    if (!lista.ok) return h + "<p>" + esc(lista.motivo) + "</p>";
    var res0 = lista.reserva > 0;
    h += '<table class="andui-tab" data-andui="locacao"><thead><tr><th class="n">Qnt</th>' + (res0 ? '<th class="n">Trazer</th>' : "") + "<th>Peça</th>" + (lista.temRef ? "<th>Ref. catálogo</th>" : "") + "<th>Un</th><th class=\"n\">Peso (kg)</th></tr></thead><tbody>" +
      lista.linhas.map(function (l) { return '<tr><td class="n">' + br(l.qtd, l.un === "m²" ? 2 : 0) + "</td>" + (res0 ? '<td class="n"><b>' + br(l.trazer, l.un === "m²" ? 2 : 0) + "</b></td>" : "") + "<td>" + esc(l.nome) + (l.confirmarRT ? ' <span class="andui-mut">(confirmar RT)</span>' : "") + '<br><span class="andui-mut">' + esc(l.oQueE) + "</span></td>" + (lista.temRef ? "<td>" + esc(l.refCatalogo || "") + "</td>" : "") + "<td>" + esc(l.un) + '</td><td class="n">' + (l.pesoTotal == null ? "—" : br(l.pesoTotal)) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<p class="andui-mut">' + lista.totais.pecas + " peças (sem a tela)" + (res0 ? ", " + lista.totais.pecasTrazer + " com a reserva" : "") + " · " + br(lista.totais.pesoKg) + " kg · tela " + br(lista.totais.m2Tela) + " m². Sem preço (custo é outra etapa).</p>";
    return h;
  }

  function abaMontagem(D, res) {
    var pl = AD().planoMontagem(res.modelo, res.modelo.par), h = "";
    if (!pl.ok) return "<p>" + esc(pl.motivo) + "</p>";
    h += '<ol data-andui="passos" style="padding-left:18px">' + pl.passos.map(function (p) {
      /* multidirecional: a ordem DENTRO do levante (subir os postes → travessas → pisos → guarda-corpo → diagonais → ancoragens) é o que o manual manda; o tubo-roll segue como era */
      var et = pl.sistema === "multidirecional" && arr(p.etapas).length ? '<div class="andui-mut" data-andui="etapas">' + p.etapas.map(function (e, i) { return "<div>" + (i + 1) + ". <b>" + esc(e.titulo) + ":</b> " + esc(e.fazer) + "</div>"; }).join("") + "</div>" : "";
      return "<li><b>" + esc(p.titulo) + "</b><br>" + esc(p.fazer) + (p.quantidades ? '<br><span class="andui-mut">' + esc(p.quantidades) + "</span>" : "") + et + "</li>";
    }).join("") + "</ol>";
    if (pl.sistema === "multidirecional") h = '<p class="andui-mut" data-andui="aviso-plano">' + esc(pl.aviso) + "</p>" + h;
    if (pl.desmontagem && arr(pl.desmontagem.passos).length) h += "<details><summary>Desmontagem (ordem inversa)</summary><ol style=\"padding-left:18px\">" + pl.desmontagem.passos.map(function (p) { return "<li><b>" + esc(p.titulo) + "</b><br>" + esc(p.fazer) + "</li>"; }).join("") + "</ol></details>";
    if (arr(pl.requisitos).length) h += "<h3>Requisitos de quem monta</h3><ul>" + pl.requisitos.map(function (r) { return "<li>" + esc(r.texto) + ' <span class="andui-mut">(' + esc(r.fonte) + ")</span></li>"; }).join("") + "</ul>";
    return h;
  }

  function quemHtml() { return '<div class="andui-form"><label>Quem está fazendo isto (nome)<input data-andui-f="quem" value="' + esc(P.quem || "") + '" autocomplete="name"></label></div>'; }
  function abaChecklist(D, res) {
    var ck = T().checklistComRespostas(res.modelo, res.modelo.par, D.ap), h = "";
    if (!ck.ok) return "<p>Checklist indisponível.</p>";
    var antes = ck.itens.filter(function (i) { return arr(i.momentos).indexOf("antes") >= 0; }), resp = antes.filter(function (i) { return i.resposta; }).length;
    h += '<p class="andui-mut">Checklist «antes da liberação» (NR-18 18.12.4): <b data-andui="chk-cont">' + resp + " de " + antes.length + "</b> respondidos · " + ck.naoConformes + " não conforme(s). Item sem resposta bloqueia a liberação: não inspecionado não é conforme.</p>" + quemHtml();
    var grupo = null;
    antes.forEach(function (it) {
      if (it.grupo !== grupo) { grupo = it.grupo; h += "<h3>" + esc(grupo) + "</h3>"; }
      h += '<div class="andui-chk' + (it.resposta === "nc" ? " nc" : "") + '" data-andui-chk="' + esc(it.id) + '"><div>' + esc(it.texto) + '<br><small>' + esc(it.fonte) + "</small></div>" +
        '<div class="rb">' + [["ok", "OK"], ["nc", "Não conforme"], ["na", "Não se aplica"]].map(function (r) { return '<button type="button" class="andui-bt" data-andui-acao="chk" data-id="' + esc(it.id) + '" data-r="' + r[0] + '" aria-pressed="' + (it.resposta === r[0] ? "true" : "false") + '">' + r[1] + "</button>"; }).join("") +
        '<input data-andui-obs="' + esc(it.id) + '" placeholder="observação (obrigatória se não conforme)" value="' + esc(it.obsResp) + '" style="flex:1;min-width:130px"></div></div>';
    });
    return h;
  }

  function cartaoCor(D) { return AD().Aprovacao.cartaoEfetivo(D.ap, D.par); }
  function abaAprovacao(D, res) {
    var A = AD().Aprovacao, ap = D.ap, ef = cartaoCor(D), h = "", est = ap.estado;
    var titulo = ef.cor === "verde" ? "LIBERADO PARA USO" : (ef.cor === "amarelo" ? "LIBERADO COM RESTRIÇÃO" : (ef.cor === "vermelho" ? "NÃO USAR — INTERDITADO" : "SEM LIBERAÇÃO — NÃO USAR"));
    h += '<div class="andui-cartao ' + (ef.cor || "nulo") + '" data-andui="cartao" data-cartao="' + esc(ef.cor || "") + '">' + esc(titulo) + "</div>";
    h += '<p>Estado: <b data-andui="estado-ap">' + esc(est.replace("_", " ")) + "</b>" + (ef.motivo ? " — " + esc(ef.motivo) : "") + "</p>" + quemHtml();
    var bts = [];
    if (est === "rascunho") bts.push('<button type="button" class="andui-bt pri" data-andui-acao="ap" data-ap="enviar">Enviar para revisão</button>');
    if (est === "em_revisao" && ap.cartao === "vermelho") h += '<h3>Interdição em aberto</h3><div class="andui-form"><label style="grid-column:1/-1">O que foi corrigido<textarea data-andui-f="obs-corrigido" rows="2"></textarea></label></div><p><button type="button" class="andui-bt pri" data-andui-acao="ap" data-ap="corrigido">Corrigido — reinspecionar</button></p>';
    if (est === "em_revisao") h += '<h3>Aprovar o projeto (NR-18 18.12.2)</h3><div class="andui-form"><label>Registro CREA/CAU<input data-andui-f="registro"></label><label>ART (ou «dispensada — motivo»)<input data-andui-f="art"></label><label style="grid-column:1/-1">Observação<input data-andui-f="obs-aprovar"></label></div><p><button type="button" class="andui-bt pri" data-andui-acao="ap" data-ap="aprovar">Aprovar</button></p>';
    if (est === "aprovado") h += '<h3>Liberar para uso (NR-18 18.12.4)</h3><p class="andui-mut">Exige o checklist «antes da liberação» 100 % respondido e sem não conforme.</p><div class="andui-form"><label>Função<input data-andui-f="funcao"></label><label>Cartão<select data-andui-f="cartao"><option value="verde">Verde — liberado</option><option value="amarelo">Amarelo — com restrição</option></select></label><label style="grid-column:1/-1">Restrição (se amarelo): o que NÃO pode<input data-andui-f="restricao"></label></div><p><button type="button" class="andui-bt pri" data-andui-acao="ap" data-ap="liberar">Liberar</button></p>';
    if (est === "liberado") h += '<h3>Liberado</h3><div class="andui-form"><label style="grid-column:1/-1">Restrição ou motivo<input data-andui-f="motivo-ap"></label></div><p><button type="button" class="andui-bt" data-andui-acao="ap" data-ap="restringir">Restringir (amarelo)</button> <button type="button" class="andui-bt perigo" data-andui-acao="ap" data-ap="interditar">Interditar (vermelho)</button></p>';
    if (est === "aprovado" || est === "liberado") h += '<div class="andui-form"><label style="grid-column:1/-1">Por que reabrir o projeto<input data-andui-f="obs-reabrir"></label></div><p><button type="button" class="andui-bt" data-andui-acao="ap" data-ap="reabrir">Reabrir para revisão</button></p>';
    if (bts.length) h += "<p>" + bts.join(" ") + "</p>";
    h += '<p><button type="button" class="andui-bt" data-andui-acao="imprimir-cartao">Imprimir o cartão (A5)</button></p>';
    /* solução do RT */
    h += "<h3>Solução adotada pelo RT</h3><p class=\"andui-mut\">Registra o que o RT decidiu para o que o cálculo reprova (ex.: guarda-corpo ensaiado — exige o nº do laudo). O cálculo continua mostrando o uso real.</p>" +
      '<div class="andui-form"><label>Tipo<select data-andui-f="sol-tipo"><option value="laudo_guarda_corpo">Guarda-corpo ensaiado (laudo)</option><option value="poste_guarda">Poste de guarda-corpo</option><option value="escora">Escora / mão-francesa</option><option value="ancoragem_topo">Ancoragem de topo</option><option value="outra">Outra</option></select></label><label>Nº do laudo<input data-andui-f="sol-laudo"></label><label style="grid-column:1/-1">Descrição<input data-andui-f="sol-obs"></label></div>' +
      '<p><button type="button" class="andui-bt" data-andui-acao="ap" data-ap="solucao">Registrar a solução</button></p>';
    if (arr(ap.solucoes).length) h += '<ul class="andui-hist">' + ap.solucoes.map(function (s) { return "<li><b>" + esc(s.tipo) + "</b> — " + esc(s.quem) + (s.laudo ? ", laudo " + esc(s.laudo) : "") + (s.obs ? ": " + esc(s.obs) : "") + "</li>"; }).join("") + "</ul>";
    h += "<h3>Histórico</h3>" + (arr(ap.historico).length ? '<ul class="andui-hist" data-andui="historico">' + ap.historico.slice().reverse().slice(0, 40).map(function (e) { return "<li><b>" + esc(e.acao) + "</b> — " + esc(e.quem) + " <span class=\"andui-mut\">" + esc(String(e.quando || "").slice(0, 16).replace("T", " ")) + "</span>" + (e.obs ? "<br>" + esc(e.obs) : "") + "</li>"; }).join("") + "</ul>" : '<p class="andui-mut">Sem registros.</p>');
    return h;
  }

  function abaDocumentos(D, res) {
    var P1 = global.AndaimePranchas && typeof global.AndaimePranchas.gerar === "function", M1 = global.AndaimeMemorial && typeof global.AndaimeMemorial.gerar === "function";
    var h = blocoRT(D) + '<p class="andui-mut">Os documentos saem do MESMO modelo do 3D e da lista de locação — nunca um segundo cálculo de quantidade.</p>' + abaMemorial(D, res);
    h += '<p><button type="button" class="andui-bt pri" data-andui-acao="doc-pranchas"' + (P1 ? "" : ' disabled aria-disabled="true"') + ">Gerar pranchas executivas</button> " + (P1 ? "" : '<span class="andui-mut" data-andui="pranchas-prep">em preparação</span>') + "</p>";
    h += '<p><button type="button" class="andui-bt pri" data-andui-acao="doc-memorial"' + (M1 ? "" : ' disabled aria-disabled="true"') + ">Memorial</button> " + (M1 ? "" : '<span class="andui-mut" data-andui="memorial-prep">em preparação</span>') + "</p>";
    h += '<p><button type="button" class="andui-bt" data-andui-acao="xlsx">Lista de locação (.xlsx)</button> <button type="button" class="andui-bt" data-andui-acao="imprimir-cartao">Cartão do andaime (A5)</button></p>';
    return h;
  }

  function renderizar() {
    var r0 = raiz(); if (!r0 || !P) return;
    var D = lerDoModelo();
    if (!D) { r0.querySelector('[data-andui="corpo"]').innerHTML = '<p>O andaime não está mais no modelo.</p>'; return; }
    var res = resultadoDe(D.par);
    P.res = res; P.sis = T().sistemaDe(D.par);
    var corpo = r0.querySelector('[data-andui="corpo"]'), top = corpo.scrollTop, h = "";
    /* os campos digitados (nome, registro, ART, observação…) sobrevivem ao refazer da tela — uma recusa não pode apagar o que a pessoa escreveu */
    P.form = P.form || {}; [].forEach.call(corpo.querySelectorAll("[data-andui-f]"), function (e) { var k = e.getAttribute("data-andui-f"); if (k !== "altura" && String(e.value) !== "") P.form[k] = e.value; });
    var tt = r0.querySelector('[data-andui="titulo"]'); if (tt) tt.textContent = "Andaime " + (D.par.sistema === "multidirecional" ? "multidirecional (" + (D.par.linha === "estribo" ? "estribo" : "roseta") + ")" : "tubo-roll");
    r0.querySelector('[data-andui="sub"]').textContent = (res.ok ? res.modelo.medidas.nVaos + " vãos × " + res.modelo.medidas.nLevantes + " levantes · piso a " + br(res.modelo.medidas.alturaPiso) + " m · " : "") + ({ verde: "liberado (cartão verde)", amarelo: "liberado com restrição (cartão amarelo)", vermelho: "NÃO USAR (cartão vermelho)" }[AD().Aprovacao.cartaoEfetivo(D.ap, D.par).cor] || "sem liberação");
    r0.querySelectorAll("[data-andui-aba]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-andui-aba") === P.aba ? "true" : "false"); });
    if (!res.ok) { corpo.innerHTML = msgHtml() + '<p class="andui-msg erro">' + esc(res.erro) + "</p>"; return; }
    var f = { resumo: abaResumo, calculo: abaCalculo, simulacao: abaSimulacao, locacao: abaLocacao, montagem: abaMontagem, checklist: abaChecklist, aprovacao: abaAprovacao, documentos: abaDocumentos }[P.aba] || abaResumo;
    corpo.innerHTML = msgHtml() + f(D, res);
    [].forEach.call(corpo.querySelectorAll("[data-andui-f]"), function (e) { var k = e.getAttribute("data-andui-f"); if (k !== "altura" && P.form[k] != null && String(e.value) === "") e.value = P.form[k]; });
    corpo.scrollTop = top;
    [].forEach.call(corpo.querySelectorAll("input,select,textarea"), function (e) { if (e.type !== "checkbox" && String(e.value) !== "" && idDoCampo(e)) avisoDoCampo(e, P.sis); });
    if (global.ProblemaCard && corpo.querySelector('[data-pc="lista"]')) global.ProblemaCard.ligar(corpo, { corrigir: function (solId, k) { AndaimeUI.corrigir(k, solId); }, mostrar: function (ids) { AndaimeUI.mostrarIds(ids); } });
    atualizarPintura(D, res);
  }
  function atualizarPintura(D, res) {
    if (!cena()) return;
    if (P.sim && res.ok) {
      var sim = AC().simulacao(res.modelo, res.calc), pint = T().pintura(sim);
      P.ultPintura = { n: desenharPrims("andaime-simulacao", T().primitivas(res.modelo, [D.par.x0, D.par.y0, D.par.z0], pint)), contagem: pint.contagem };
    } else if (P.ultPintura) { limparGrupo("andaime-simulacao"); P.ultPintura = null; }
  }

  /* ---------------------------------------------------------------- ações do painel */
  function fval(nome) { var r0 = raiz(), e = r0 ? r0.querySelector('[data-andui-f="' + nome + '"]') : null; return e ? String(e.value).trim() : ""; }
  function quem() { var q = fval("quem"); if (q) P.quem = q; return P.quem || ""; }
  function aplicarPar(D, parNovo, textoOk, extras) {
    var r = refazer(P.gid, parNovo, extras, "Andaime — " + (textoOk || "parâmetros"));
    if (!r || !r.ok) { dizer((r && r.motivo) || "Não consegui refazer o andaime.", true); return false; }
    dizer(textoOk || "Andaime refeito no lugar.", false); return true;
  }
  function persistirAp(D, ap, texto) {
    var ok = gravarInfo(P.gid, function (inf) { inf.aprovacao = ap; }, "Andaime — aprovação");
    if (!ok) { dizer("O editor recusou a gravação.", true); return false; }
    dizer(texto, false); return true;
  }
  function acaoAp(D, qual) {
    var A = AD().Aprovacao, ap = D.ap, q = quem(), r, par = D.alvo.info.par, res = P.res;
    if (qual === "enviar") r = A.enviarRevisao(ap, { quem: q });
    else if (qual === "aprovar") r = A.aprovar(ap, { quem: q, registro: fval("registro"), art: fval("art"), obs: fval("obs-aprovar") }, par);
    else if (qual === "liberar") { var ck = AD().checklist(res.modelo, par, {}); r = A.liberar(ap, { quem: q, funcao: fval("funcao"), cartao: fval("cartao"), restricao: fval("restricao") }, par, ck.itens); }
    else if (qual === "restringir") r = A.restringir(ap, { quem: q, restricao: fval("motivo-ap") });
    else if (qual === "interditar") r = A.interditar(ap, { quem: q, motivo: fval("motivo-ap") });
    else if (qual === "corrigido") r = A.corrigido(ap, { quem: q, obs: fval("obs-corrigido") });
    else if (qual === "reabrir") r = A.reabrir(ap, { quem: q, obs: fval("obs-reabrir") });
    else if (qual === "solucao") r = A.registrarSolucao(ap, { quem: q, tipo: fval("sol-tipo"), laudo: fval("sol-laudo"), obs: fval("sol-obs") });
    else return;
    if (!r.ok) { dizer(r.erro, true); return; }
    P.form = {}; if (q) P.form.quem = q;
    persistirAp(D, r.ap, { enviar: "Enviado para revisão.", aprovar: "Projeto aprovado.", liberar: "Andaime liberado.", restringir: "Cartão amarelo.", interditar: "Andaime interditado (cartão vermelho).", corrigido: "Correção registrada: reinspecione e aprove de novo.", reabrir: "Projeto reaberto para revisão.", solucao: "Solução do RT registrada." }[qual]);
  }

  function cliquePainel(ev) {
    var t = ev.target, el = t && t.closest ? t.closest("[data-andui-acao],[data-andui-aba],tr[data-vid],tr[data-memo]") : null; if (!el || !P) return;
    var aba = el.getAttribute("data-andui-aba");
    if (aba) { AndaimeUI.aba(aba); return; }
    if (el.tagName === "TR") { if (el.getAttribute("data-memo")) AndaimeUI.abrirLinha(el.getAttribute("data-memo")); else AndaimeUI.mostrarVerificacao(el.getAttribute("data-vid")); return; }
    var a = el.getAttribute("data-andui-acao"), D = lerDoModelo();
    if (a === "fechar-painel") { AndaimeUI.fecharPainel(); return; }
    if (a === "pranchas-exec") { AndaimeUI.pranchasExecutivas(); return; }
    if (!D) return;
    if (a === "desfazer") AndaimeUI.desfazer(el.getAttribute("data-k"));
    else if (a === "altura-aplicar") AndaimeUI.aplicarAltura(fval("altura"));
    else if (a === "reinteligente") AndaimeUI.reinteligente();
    else if (a === "param-dialogo") AndaimeUI.parametrosAvancados();
    else if (a === "sistema-trocar") { var ss = raiz().querySelector('[data-andui-f="sistema"]'); AndaimeUI.trocarSistema(ss ? ss.value : "tuboroll"); }
    else if (a === "multi-aplicar") { var vv = {}; [].forEach.call(raiz().querySelectorAll("[data-andui-mp]"), function (e) { vv[e.getAttribute("data-andui-mp")] = e.type === "checkbox" ? !!e.checked : e.value; }); AndaimeUI.aplicarParametrosMulti(vv); }
    else if (a === "pend-aplicar") { var c = el.getAttribute("data-campo"), r0 = raiz(), inp = r0.querySelector('[data-andui-p="' + c + '"]'), ck = r0.querySelector('[data-andui-pc="' + c + '"]'), jj = r0.querySelector('[data-andui-pj="' + c + '"]'); if (inp && inp.type === "checkbox") AndaimeUI.informar(c, inp.checked ? "true" : "", false, jj ? jj.value : ""); else AndaimeUI.informar(c, inp ? inp.value : "", ck ? !!ck.checked : false); }
    else if (a === "corrigir-opcao") AndaimeUI.corrigirOpcao(el.getAttribute("data-vid"), el.getAttribute("data-op"));
    else if (a === "corrigir-tudo") AndaimeUI.corrigirTudoPrevia();
    else if (a === "corrigir-tudo-aplicar") AndaimeUI.corrigirTudoAplicar();
    else if (a === "corrigir-tudo-cancelar") AndaimeUI.corrigirTudoCancelar();
    else if (a === "desfazer-grupo") AndaimeUI.desfazerVarios(String(el.getAttribute("data-ids") || "").split(",").filter(Boolean));
    else if (a === "mostrar-vid") AndaimeUI.mostrarVerificacao(el.getAttribute("data-vid"));
    else if (a === "memo-recalcular") AndaimeUI.recalcularTudo();
    else if (a === "inline-recalcular") { var cI = el.getAttribute("data-campo"), vI = el.getAttribute("data-vid"), bx = el.closest("[data-andui-il]"), iI = bx && bx.querySelector('[data-andui-ip="' + cI + '"]'), kI = bx && bx.querySelector('[data-andui-ipc="' + cI + '"]'), jI = bx && bx.querySelector('[data-andui-ipj="' + cI + '"]'); if (iI && iI.type === "checkbox") AndaimeUI.informarDoCartao(vI, cI, iI.checked ? "true" : "", false, jI ? jI.value : ""); else AndaimeUI.informarDoCartao(vI, cI, iI ? iI.value : "", kI ? !!kI.checked : false); }
    else if (a === "sim-toggle") { P.sim = !P.sim; limparGrupo("andaime-destaque"); renderizar(); }
    else if (a === "xlsx") AndaimeUI.exportarXlsx();
    else if (a === "chk") { var id = el.getAttribute("data-id"), ob = raiz().querySelector('[data-andui-obs="' + id + '"]'); AndaimeUI.responder(id, el.getAttribute("data-r"), ob ? ob.value : ""); }
    else if (a === "ap") acaoAp(D, el.getAttribute("data-ap")), renderizar();
    else if (a === "imprimir-cartao") AndaimeUI.imprimirCartao();
    else if (a === "doc-pranchas") AndaimeUI.documento("pranchas");
    else if (a === "doc-memorial") AndaimeUI.documento("memorial");
  }
  function mudancaPainel(ev) {
    var t = ev.target; if (!t || !P) return;
    if (t.getAttribute && t.getAttribute("data-andui-cab")) {
      var campo = t.getAttribute("data-andui-cab"), v = t.value;
      gravarInfo(P.gid, function (inf) { inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.cab = T().cabPadrao(inf.andaimeTela.cab); inf.andaimeTela.cab[campo] = campo === "reserva" ? Math.max(0, Math.min(100, num(v, 0))) : v; }, "Andaime — cabeçalho");
      renderizar();
    } else if (t.getAttribute && t.getAttribute("data-andui-f") === "quem") { P.quem = String(t.value).trim(); }
  }

  /* o que as pranchas e o memorial recebem (um só lugar: carimbo e memorial nunca divergem) */
  function opcoesDocumento(cab) {
    return { obra: cab.obra, local: cab.local, codigo: cab.andaime || "ANDAIME", revisao: cab.revisao, data: cab.data, responsavel: cab.responsavel, registro: cab.registro, art: cab.art,
             tituloProfissional: cab.tituloProfissional, empresa: cab.empresa, proprietario: cab.proprietario, contratante: cab.proprietario };
  }
  function avisoRT(cab) { return (!String(cab.responsavel || "").trim() || !String(cab.registro || "").trim()) ? "Responsável técnico / CREA em branco no carimbo — preencha em Documentos" : ""; }

  /* ================================================================ A API */
  var AndaimeUI = {
    /* ganchos de teste: o MESMO bloco/opcoes que as abas e os botoes usam (testados sem DOM) */
    _cartaoHtml: cartaoHtml, _faixaHtml: faixaHtml, _previaTudoHtml: previaTudoHtml, _abaCalculo: abaCalculo, _abaMemorial: abaMemorial, _abaResumo: abaResumo, _tracoHtml: tracoHtml, _camposDe: camposDe, _diagnosticoDe: diagnosticoDe, _avisoDoCampo: avisoDoCampo, _idDoCampo: idDoCampo,
    _blocoRT: blocoRT, _blocoSistema: blocoSistema, _blocoPendencias: blocoPendencias, _abaLocacao: abaLocacao, _opcoesDocumento: opcoesDocumento, _avisoRT: avisoRT, _cabDe: cabDe,
    MODO: MODO, COMANDOS: COMANDOS, COMANDOS_MULTI: COMANDOS_MULTI, ultimaPrevia: null,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    idsMulti: function () { return COMANDOS_MULTI.map(function (c) { return c.id; }); },
    pronto: function () { return !!(MP() && PU() && AN() && AN().registrado && AN().registrado() && T() && previa()); },
    registrar: function (reg) {
      if (!this.pronto()) return false;
      var self = this;
      PU().registrarCampos("andaime", camposDe());
      PU().registrarModo(MODO, modo());
      reg["ctx-andaime-pranchas"] = function () { try { self.pranchasExecutivas(); } catch (e) { toast("Andaime: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      COMANDOS_MULTI.forEach(function (c) {
        reg[c.id] = function () { try { self.comando(c.modo, { sistema: c.sistema, linha: c.linha }); } catch (e) { toast("Andaime: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      });
      COMANDOS.forEach(function (c) {
        reg[c.id] = function () {
          try { if (c.emBreve) { toast("A partir de volumetria IFC: em breve (E6).", "info", 6000); return true; } if (c.acao === "pranchas") { self.pranchasExecutivas(); return true; } self.comando(c.modo); }
          catch (e) { toast("Andaime: " + (e && e.message ? e.message : e), "erro", 8000); }
          return true;
        };
      });
      try { var Dr = global.DicaRica; if (Dr && Dr.item && Dr.registrar) { var d = MP().dica("andaime"); if (d) { Dr.item("andaime", d); Dr.registrar("met-andaime", "andaime"); Dr.registrar("met-andaime-contorno", "andaime"); Dr.registrar("met-andaime-multi", "andaime"); } } } catch (eD) {}
      this._ligarTeclas();
      return true;
    },
    /* o botão: com um andaime selecionado abre o painel dele; senão arma o traçado */
    comando: function (modoT, opc) {
      var u = PU(), alvo = u ? u.prontaSelecionada() : null;
      if (alvo && alvo.tipo === "andaime") { var a2 = prontaDe(alvo.id); if (a2) return this.abrirPainel(a2.id); }
      return this.armar(modoT || "polilinha", opc);
    },
    armar: function (modoT, opc) {
      var u = PU(), M = MP(); if (!u || !M) return false;
      opc = opc || {}; var sis = opc.sistema === "multidirecional" ? (opc.linha === "estribo" ? "multi-estribo" : "multi-roseta") : "tuboroll";
      _arma = { modo: modoT === "contorno" ? "contorno" : "polilinha", altura: opc.altura, par: opc.par, sistema: opc.sistema === "multidirecional" ? "multidirecional" : null, linha: opc.sistema === "multidirecional" ? (opc.linha === "estribo" ? "estribo" : "roseta") : null };
      _ultSistema = sis;
      _sess = null;
      var par = M.padrao("andaime"); par.y0 = u.cota();
      var ok = u.posicionar("andaime", par, {}, MODO);
      if (ok && u._pos) { sess(u._pos); u._dica(); }
      return ok;
    },
    sessao: function () { return _sess; },
    redesenhar: function () { var u = PU(); if (u && u._3d) u._3d.redesenhar(); },
    voltarPonto: function () { var u = PU(); if (u && u._pos) { u.voltarPonto(); } },
    cancelarTraco: function () { var u = PU(); if (u) u.cancelar(); var b = B(); try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {} painelTraco(null, null); _sess = null; _arma = null; },
    alternarLado: function () {
      var s = _sess; if (!s) return null; var l = T().alternarLado(s); painelTraco(T().previa(s, null), s); this.redesenhar(); status("Andaime " + T().ROT_LADO[l] + "."); return l;
    },
    _ligarTeclas: function () {
      var d = doc(); if (!d || this._teclas) return; this._teclas = true;
      d.addEventListener("keydown", function (e) {
        var u = PU(); if (!_sess || !u || !u._pos || u.modoPos(u._pos) !== MODO) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "") || t.isContentEditable) return;
        if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); AndaimeUI.alternarLado(); }
      }, true);
    },
    _animar: function (pv) {
      var self = this, u = PU(); if (_anim.ativo) return; _anim.ativo = true;
      var agora = function () { return (global.performance && global.performance.now) ? global.performance.now() : Date.now(); };
      var passo = function () {
        _anim.ativo = false;
        if (!_sess || !u || !u._pos) return;
        var t1 = agora(), dt = Math.min(0.1, Math.max(0.01, (t1 - (_anim.ult || (t1 - 50))) / 1000));   /* tempo REAL: o quadro lento não alonga a subida */
        _anim.ult = t1;
        if (T().avancar(_sess, dt, pv.hTopo)) { _anim.t = setTimeout(function () { self.redesenhar(); }, 40); } else { _anim.ult = 0; self.redesenhar(); }
      };
      _anim.t = setTimeout(passo, 40);
    },

    /* ENTER: fecha o traçado e cria o componente */
    fechar: function () {
      var s = _sess, u = PU(), M = MP(), b = B(); if (!s || !u || !M) return false;
      if (!T().podeFechar(s)) { var m = s.modo === "contorno" ? "o contorno precisa de 3 cantos ou mais" : "clique pelo menos 2 pontos antes do Enter"; status("Andaime: " + m + "."); toast("Andaime: " + m + ".", "aviso", 6000); return false; }
      var pts = s.pts.slice(), par = T().parDe(s, pts), lv = T().aplicarLocalVento(par, s.vento || {}, localObra());
      if (!lv.ok) { status("Andaime: " + lv.erro); toast("Andaime: " + lv.erro, "aviso", 9000); return false; }
      par = lv.par; var res = T().resultado(par, { inteligente: s.inteligente });
      if (!res.ok) { status("Andaime: " + res.erro); toast("Andaime: " + res.erro, "aviso", 9000); var er = doc() && doc().querySelector('[data-andui="traco-erro"]'); if (er) er.textContent = res.erro; return false; }
      var r = M.gerar("andaime", res.par, function () { return u.novoId(); }, {});
      if (!r.ok) { toast("Andaime: " + r.motivo, "aviso", 9000); return false; }
      var gid = "pronta-" + u.novoId();
      M.identidade(r, gid, { tipo: "andaime", par: r.par, em: relogio(), andaimeTela: { cab: T().cabPadrao({}), mudancas: res.mudancas, inteligente: s.inteligente, fonteV0: lv.fonteV0, criadoEm: relogio() } }, null);
      if (!b || !b.editarLote || !b.editarLote(r.op)) { toast("O editor recusou o andaime.", "erro"); return false; }
      /* sai do modo de traçado */
      var cr = _sess; _sess = null; _arma = null; painelTraco(null, null);
      u._pos = null; try { if (b.editarArmar) b.editarArmar(null); } catch (e) {}
      try { var Ls = u._3d; if (Ls && Ls.cancelar) Ls.cancelar(); } catch (e2) {}
      try { u.enquadrar(r); } catch (e3) {}
      this.ultimo = { gid: gid, resumo: r.resumo, passou: res.passou, mudancas: res.mudancas.length, inteligente: s.inteligente, altura: cr ? cr.altura : null };
      var nNV = arr(res.pendencias).length;
      var t = "Andaime criado — " + r.resumo + (res.passou ? (nNV ? " Nenhuma verificação reprovada, mas " + nNV + " ficaram NÃO VERIFICADAS por falta de dado do responsável técnico (veja o Resumo)." : " Passou em todas as verificações.") : " ATENÇÃO: não passou em tudo (veja o painel).") + " Ctrl+Z desfaz.";
      status(t); toast(t, res.passou ? "ok" : "aviso", 10000);
      this.abrirPainel(gid);
      return true;
    },

    /* ---------------------------------------------------------------- painel */
    abrirPainel: function (gid, aba) {
      var d = doc(); if (!d || !prontaDe(gid)) return false;
      cssGeral(); var prev = P; P = { gid: String(gid), aba: aba || (prev && prev.gid === String(gid) ? prev.aba : "resumo"), msg: null, quem: prev ? prev.quem : "", sim: prev && prev.gid === String(gid) ? prev.sim : false };
      var r0 = raiz();
      if (!r0) {
        r0 = d.createElement("aside"); r0.className = "andui-painel"; r0.setAttribute("data-andui", "painel"); r0.setAttribute("role", "dialog"); r0.setAttribute("aria-label", "Painel do andaime");
        r0.innerHTML = '<div class="andui-cab"><div><b data-andui="titulo">Andaime tubo-roll</b><small data-andui="sub"></small></div><button type="button" class="andui-bt pri andui-x" data-andui-acao="pranchas-exec" title="Gera as 5 pranchas A1 do projeto: planta e cortes, elevações, isométrico e detalhes, tabelas e memorial">Gerar pranchas executivas</button><button type="button" class="andui-bt" data-andui-acao="fechar-painel" aria-label="Fechar o painel do andaime">Fechar</button></div>' +
          '<div class="andui-abas" role="tablist">' + ABAS.map(function (a) { return '<button type="button" role="tab" class="andui-aba" data-andui-aba="' + a[0] + '" aria-selected="false">' + a[1] + "</button>"; }).join("") + "</div>" +
          '<div class="andui-corpo" data-andui="corpo" role="tabpanel"></div>';
        d.body.appendChild(r0);
        r0.addEventListener("click", cliquePainel); r0.addEventListener("change", mudancaPainel); r0.addEventListener("input", function (ev) { avisoDoCampo(ev.target, P ? P.sis : null); });
        r0.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); AndaimeUI.fecharPainel(); } if ((e.key === "Enter") && e.target && e.target.tagName === "TR") { cliquePainel({ target: e.target }); } });
      }
      this._sanearCopias();
      renderizar(); return true;
    },
    fecharPainel: function () { var r0 = raiz(); if (r0) r0.remove(); limparGrupo("andaime-simulacao"); limparGrupo("andaime-destaque"); P = null; return true; },
    painelAberto: function () { return !!(P && raiz()); },
    estado: function () { return P ? { gid: P.gid, aba: P.aba, sim: P.sim, quem: P.quem, passou: P.res ? P.res.passou : null, pintura: P.ultPintura || null, msg: P.msg } : null; },
    /* trocar de aba tira o destaque e a pintura: o overlay não fica velho por cima de um andaime que foi refeito */
    aba: function (nome) { if (!P) return false; P.aba = nome; P.msg = null; P.previaTudo = null; P.ultCorrecao = null; P.fechamentoTudo = null; if (nome !== "simulacao") P.sim = false; limparGrupo("andaime-destaque"); renderizar(); return true; },
    gidAtual: function () { return P ? P.gid : null; },
    andaimes: andaimes,
    parAtual: function () { var D = lerDoModelo(); return D ? D.par : null; },
    aprovacaoAtual: function () { var D = lerDoModelo(); return D ? D.ap : null; },

    /* o cópia do editor trouxe o prontaInfo: zera a aprovação (rascunho) — DUPLICAR NÃO HERDA O CARTÃO VERDE */
    _sanearCopias: function () {
      var ops = T().opsDeCopias(caixas(), relogio()); if (!ops.length) return 0;
      var b = B(), u = PU(); if (!b || !b.editarLote) return 0;
      if (b.editarLote({ op: "lote", id: String(u.novoId()), origem: "andaime-tela", pedido: "Andaime copiado: aprovação zerada (rascunho)", ops: ops })) { toast("Andaime copiado: a aprovação e o cartão do original NÃO valem para a cópia (rascunho).", "aviso", 9000); return ops.length / 2; }
      return 0;
    },
    sanearCopias: function () { return this._sanearCopias(); },
    atualizar: function () { if (P) renderizar(); return !!P; },

    aplicarAltura: function (v) {
      var D = lerDoModelo(); if (!D) return false;
      var h = num(v, NaN); if (!isFinite(h) || !(h >= T().ALTURA_MIN && h <= T().ALTURA_MAX)) { dizer("Altura de " + br(T().ALTURA_MIN, 1) + " a " + T().ALTURA_MAX + " m.", true); renderizar(); return false; }
      var p = clone(D.par); p.altura = h; var ok = aplicarPar(D, p, "Altura alterada para " + br(h) + " m: o andaime foi refeito no lugar."); renderizar(); return ok;
    },
    reinteligente: function () {
      var D = lerDoModelo(); if (!D) return false;
      var res = T().resultado(D.par, { inteligente: true }); if (!res.ok) { dizer(res.erro, true); renderizar(); return false; }
      var ok = aplicarPar(D, res.par, res.mudancas.length ? "Montar inteligente: " + res.mudancas.length + " mudança(s)." : "Montar inteligente: nada a mudar.", function (inf) { inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.mudancas = res.mudancas; inf.andaimeTela.inteligente = true; });
      renderizar(); return ok;
    },
    desfazer: function (id) {
      var D = lerDoModelo(); if (!D) return false;
      var lista = arr(D.tela.mudancas), m = lista.filter(function (x) { return x.id === id; })[0]; if (!m || m.desfeita) return false;
      var p = T().desfazerMudanca(D.par, m);
      var ok = aplicarPar(D, p, "Desfeito: " + m.campo + " voltou a " + (m.de === undefined ? "(padrão)" : String(m.de).replace(".", ",")) + ".", function (inf) { (inf.andaimeTela.mudancas || []).forEach(function (x) { if (x.id === id) x.desfeita = true; }); });
      renderizar(); return ok;
    },
    informar: function (campo, valor, confirmado, justificativa) {
      var D = lerDoModelo(); if (!D) return false;
      var r = T().aplicarPendencia(D.par, campo, valor, confirmado, justificativa, T().defsRT(D.par, P && P.res ? P.res.calc : null)); if (!r.ok) { dizer(r.erro, true); renderizar(); return false; }
      /* ⚠ dado novo pode reprovar o que antes estava «não verificado»: recalcula e, se falhar, roda o Montar inteligente sobre o par atual — nunca calado */
      var inte = D.tela.inteligente !== false, g = T().reagirAoDado(r.par, D.tela.mudancas, { inteligente: inte });
      if (!g.ok) { dizer(g.erro, true); renderizar(); return false; }
      var ok = aplicarPar(D, g.par, valor === "" || valor == null ? "Pendência «" + campo + "» limpa." : "Informado: " + campo + " = " + valor + ". O cálculo foi refeito.", function (inf) {
        inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.mudancas = arr(inf.andaimeTela.mudancas).concat(g.novas);
      });
      if (ok && g.aviso) { dizer(g.aviso, !g.passou); if (g.passou) toast(g.aviso, "aviso", 14000); }
      renderizar(); return ok;
    },
    corrigir: function (k, solId) {
      var D = lerDoModelo(); if (!D || !P || !P.res) return false;
      var probs = T().problemas(P.res.calc), pr = probs[k]; if (!pr) return false;
      var novo = T().aplicarCorrecao(D.par, P.res.calc, pr.vid, solId); if (!novo) { dizer("Esta correção não tem par proposto.", true); renderizar(); return false; }
      var difs = AD().Aprovacao.diff(D.par, novo), base = arr(D.tela.mudancas).length;
      var ok = aplicarPar(D, novo, "Correção aplicada: " + difs.map(function (x) { return x.campo; }).join(", ") + ".", function (inf) {
        inf.andaimeTela = inf.andaimeTela || {}; var l = arr(inf.andaimeTela.mudancas).slice();
        difs.forEach(function (x, i) { l.push({ id: "m" + (base + i), campo: x.campo, de: x.de, para: x.para, motivo: "Corrigir — " + pr.titulo, passos: 1, desfeita: false, texto: x.campo + ": " + String(x.de) + " → " + String(x.para) }); });
        inf.andaimeTela.mudancas = l;
      });
      renderizar(); return ok;
    },
    /* E11: [Corrigir] numa opção do cartão — aplica o par proposto (refaz no lugar), registra cada mudança com Desfazer e mostra «uso antes → depois» MEDIDO no recálculo real */
    corrigirOpcao: function (vid, opId) {
      var D = lerDoModelo(); if (!D || !P || !P.res || !P.res.ok) return false;
      var dg = diagnosticoDe(D, P.res), card = dg.itens.filter(function (c) { return c.vid === vid; })[0], op = card ? card.opcoes.filter(function (o) { return o.id === opId; })[0] : null;
      if (!op) { dizer("Esta correção não existe mais: o cálculo mudou. Veja as opções de novo.", true); renderizar(); return false; }
      var base = arr(D.tela.mudancas).length, novas = op.campos.map(function (x, i) { return { id: "m" + (base + i), campo: x.campo, de: x.de, para: x.para, motivo: "Corrigir — " + card.titulo, passos: 1, desfeita: false, texto: x.txt }; });
      var ok = aplicarPar(D, op.par, "Correção aplicada: " + op.texto + ".", function (inf) { inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.mudancas = arr(inf.andaimeTela.mudancas).concat(novas); });
      if (ok) {
        var D2 = lerDoModelo(), r2 = D2 ? resultadoDe(D2.par) : null, v2 = r2 && r2.ok ? arr(r2.calc.verificacoes).filter(function (x) { return x.id === vid; })[0] : null;
        P.ultCorrecao = { vid: vid, ids: novas.map(function (m) { return m.id; }), txt: AJ().textoCorrigido(card.titulo, card.uso, v2 ? v2.uso : null, v2 ? v2.estado : null) }; P.previaTudo = null; P.msg = null;
      }
      renderizar(); return ok;
    },
    /* E11: «Corrigir tudo» — PRIMEIRO a lista do que vai mudar (Deseja corrigir? Vai mudar: …), depois [Aplicar] / [Cancelar] */
    corrigirTudoPrevia: function () { var D = lerDoModelo(); if (!D || !P) return false; var pv = T().corrigirTudoPrevia(D.par); P.previaTudo = pv; P.ultCorrecao = null; P.fechamentoTudo = null; P.msg = null; renderizar(); return pv; },
    corrigirTudoCancelar: function () { if (!P) return false; P.previaTudo = null; renderizar(); return true; },
    corrigirTudoAplicar: function () {
      var D = lerDoModelo(); if (!D || !P) return false;
      var pv = T().corrigirTudoPrevia(D.par); if (!pv.ok) { dizer(pv.erro, true); renderizar(); return false; }
      if (pv.semMudancas) { P.previaTudo = null; dizer(tx("nadaMudar"), true); renderizar(); return false; }
      var base = arr(D.tela.mudancas).length, novas = pv.mudancas.map(function (m, i) { return { id: "m" + (base + i), campo: m.campo, de: m.de, para: m.para, motivo: "Corrigir tudo — " + m.motivo, passos: 1, desfeita: false, texto: m.txt }; });
      var ok = aplicarPar(D, pv.par, "Corrigir tudo: " + novas.length + " mudança(s) aplicada(s).", function (inf) { inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.mudancas = arr(inf.andaimeTela.mudancas).concat(novas); });
      if (ok) { P.fechamentoTudo = { ids: novas.map(function (m) { return m.id; }), restante: pv.restante, passou: pv.passou }; P.previaTudo = null; P.ultCorrecao = null; P.msg = null; }
      renderizar(); return ok;
    },
    /* desfaz várias mudanças de uma vez (o Desfazer da correção): uma só gravação, na ordem inversa */
    desfazerVarios: function (ids) {
      var D = lerDoModelo(); if (!D) return false;
      var lista = arr(D.tela.mudancas), ms = arr(ids).map(function (id) { return lista.filter(function (x) { return x.id === id && !x.desfeita; })[0]; }).filter(Boolean); if (!ms.length) return false;
      var p = D.par, set = {}; ms.slice().reverse().forEach(function (m) { p = T().desfazerMudanca(p, m); set[m.id] = true; });
      var ok = aplicarPar(D, p, "Desfeito: " + ms.map(function (m) { return m.campo; }).join(", ") + " voltou ao valor de antes.", function (inf) { arr(inf.andaimeTela.mudancas).forEach(function (x) { if (set[x.id]) x.desfeita = true; }); });
      if (P) { P.ultCorrecao = null; } renderizar(); return ok;
    },
    /* E11: o campo do dado que falta, dentro do cartão — aplica o dado, recalcula e diz o que aconteceu com a verificação */
    informarDoCartao: function (vid, campo, valor, confirmado, justificativa) {
      var D = lerDoModelo(); if (!D || !P || !P.res) return false;
      var ef = T().efeitoDoDado(D.par, P.res.calc, vid, campo, valor, confirmado, justificativa); if (!ef.ok) { dizer(ef.erro, true); renderizar(); return false; }
      var ok = this.informar(campo, valor, confirmado, justificativa);
      if (ok && P) {
        var D2 = lerDoModelo(), r2 = D2 ? resultadoDe(D2.par) : null, v2 = r2 && r2.ok ? arr(r2.calc.verificacoes).filter(function (x) { return x.id === vid; })[0] : null, antes = P.msg && P.msg.t ? P.msg.t + " " : "";
        dizer(antes + AJ().textoEfeito(ef.titulo, ef.antes.estado, v2 ? v2.estado : ef.depois.estado, v2 ? v2.uso : ef.depois.uso), P.msg ? !!P.msg.erro : false);
        renderizar();
      }
      return ok;
    },
    /* E11 (Memorial na tela): abrir/fechar a linha e [Recalcular] geral */
    abrirLinha: function (vid) { if (!P) return false; P.memoAbertas = P.memoAbertas || {}; P.memoAbertas[vid] = !P.memoAbertas[vid]; renderizar(); return !!P.memoAbertas[vid]; },
    recalcularTudo: function () {
      var D = lerDoModelo(); if (!D || !P) return false;
      _resCache.k = null; _diagCache.k = null; var res = resultadoDe(D.par); if (!res.ok) { dizer(res.erro, true); renderizar(); return false; }
      var ver = T().verificacoes(res.calc), nF = ver.filter(function (v) { return v.estado === "falha"; }).length, nN = ver.filter(function (v) { return v.estado === "nao_verificado"; }).length;
      dizer("Cálculo refeito com os parâmetros atuais: " + ver.length + " verificações, " + nF + " não passam, " + nN + " sem dado. O PDF do memorial e as pranchas saem com este cálculo.", false); renderizar(); return true;
    },
    responder: function (id, resposta, obs) {
      var D = lerDoModelo(); if (!D) return false;
      var q = quem(); var r = AD().Aprovacao.responder(D.ap, { momento: "antes", id: id, resposta: resposta, quem: q, obs: obs }, D.alvo.info.par);
      if (!r.ok) { dizer(r.erro, true); renderizar(); return false; }
      var ok = persistirAp(D, r.ap, "Item " + id + ": " + resposta + "."); renderizar(); return ok;
    },
    /* várias respostas do checklist de uma vez (uma gravação só): cada uma passa pelo mesmo Aprovacao.responder, com nome e hash do par */
    responderVarios: function (idsItens, resposta, obs) {
      var D = lerDoModelo(); if (!D) return false; var A = AD().Aprovacao, ap = D.ap, q = quem();
      for (var i = 0; i < idsItens.length; i++) {
        var r = A.responder(ap, { momento: "antes", id: idsItens[i], resposta: resposta, quem: q, obs: obs || "" }, D.alvo.info.par);
        if (!r.ok) { dizer(r.erro, true); renderizar(); return false; } ap = r.ap;
      }
      var ok = persistirAp(D, ap, idsItens.length + " itens respondidos (" + resposta + ")."); renderizar(); return ok;
    },
    /* M4-A: troca o sistema do andaime no lugar (mesmo traçado e altura); a aprovação volta para «em revisão» pelo Aprovacao.aoAlterar do refazer */
    trocarSistema: function (destino) {
      var D = lerDoModelo(); if (!D) return false;
      if (T().sistemaDe(D.par) === destino) { dizer("O andaime já é " + T().ROT_SISTEMA[destino] + ".", false); renderizar(); return false; }
      var novoPar = T().trocarSistema(D.par, destino), res = T().resultado(novoPar, { inteligente: D.tela.inteligente !== false });
      if (!res.ok) { dizer("Não consegui trocar para " + T().ROT_SISTEMA[destino] + ": " + res.erro, true); renderizar(); return false; }
      var ok = aplicarPar(D, res.par, "Sistema trocado para " + T().ROT_SISTEMA[destino] + ": o andaime foi refeito no lugar" + (res.mudancas.length ? " (Montar inteligente: " + res.mudancas.length + " mudança(s))" : "") + ".", function (inf) {
        inf.andaimeTela = inf.andaimeTela || {}; inf.andaimeTela.mudancas = res.mudancas;
      });
      renderizar(); return ok;
    },
    aplicarParametrosMulti: function (vals) {
      var D = lerDoModelo(); if (!D) return false;
      var r = T().aplicarParametrosMulti(D.par, vals); if (!r.ok) { dizer(r.erro, true); renderizar(); return false; }
      var ok = aplicarPar(D, r.par, "Parâmetros do multidirecional aplicados: o andaime foi refeito no lugar."); renderizar(); return ok;
    },
    /* abre o diálogo antigo das Peças prontas (todos os parâmetros) */
    parametrosAvancados: function () { var u = PU(), a = P ? prontaDe(P.gid) : null; if (!u || !a) return false; return u.dialogo("andaime", { alvo: a, direto: true }); },

    /* Mostrar no 3D: pinta as peças do modelo em destaque e enquadra */
    mostrarIds: function (ids) {
      var D = lerDoModelo(), res = P && P.res; if (!D || !res || !res.ok) return false;
      var por = {}; arr(ids).forEach(function (i) { por[i] = { estado: "destaque", cor: "#ff2bd6" }; });
      var prims = T().primitivas(res.modelo, [D.par.x0, D.par.y0, D.par.z0], { porId: por }); prims.forEach(function (p) { if (p.k === "cil") p.r *= 1.25; });
      var n = desenharPrims("andaime-destaque", prims), cx = T().caixaDe(res.modelo, [D.par.x0, D.par.y0, D.par.z0], ids), b = B();
      if (cx && b && b.olharPara) { try { b.olharPara(cx.centro, Math.max(4, cx.raio * 2.6)); } catch (e) {} }
      this.ultimoMostrar = { n: n, ids: ids.length, centro: cx ? cx.centro : null };
      return n > 0;
    },
    mostrarVerificacao: function (vid) {
      var v = P && P.res && P.res.calc ? arr(P.res.calc.verificacoes).filter(function (x) { return x.id === vid; })[0] : null; if (!v) return false;
      return this.mostrarIds(arr(v.pecas).slice(0, 80));
    },
    pintar: function (on) { if (!P) return false; P.sim = on == null ? !P.sim : !!on; renderizar(); return P.sim; },

    exportarXlsx: function () {
      var D = lerDoModelo(); if (!D || !P || !P.res || !P.res.ok) return false;
      var cab = T().cabPadrao(D.tela.cab), lista = AD().listaLocacao(P.res.modelo, cab);
      if (!lista.ok) { dizer(lista.motivo, true); renderizar(); return false; }
      AD().exportarXlsx(lista, cab, { nome: "Lista de locacao do andaime" + (cab.andaime ? " - " + cab.andaime : ""), ok: function () { dizer("Planilha .xlsx gerada.", false); renderizar(); }, erro: function (e) { dizer("Não consegui gerar o .xlsx: " + (e && e.message ? e.message : e), true); renderizar(); } });
      return true;
    },
    imprimir: function (html) {
      var d = doc(); if (!d) return false;
      var f = d.createElement("iframe"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"; f.srcdoc = html;
      f.onload = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(function () { try { f.remove(); } catch (e2) {} }, 4000); };
      d.body.appendChild(f); return true;
    },
    imprimirCartao: function () {
      var D = lerDoModelo(); if (!D || !P || !P.res || !P.res.ok) return false;
      var cab = cabDe(D), html = T().cartaoHtmlDe(D.ap, P.res.modelo, D.par, cab, { qServ: P.res.calc && P.res.calc.parametros ? P.res.calc.parametros.qServ : null });
      this.ultimoCartao = html; return this.imprimir(html);
    },
    /* E10: o JOGO EXECUTIVO (5 folhas A1) do andaime selecionado/aberto: monta o modelo do painel, gera as folhas, abre a impressão (PDF) e baixa o DXF com o carimbo RA */
    pranchasExecutivas: function () {
      var D = lerDoModelo();
      if (!D) { var u0 = PU(), alvo0 = u0 && u0.prontaSelecionada ? u0.prontaSelecionada() : null; if (alvo0 && alvo0.tipo === "andaime" && prontaDe(alvo0.id)) { this.abrirPainel(prontaDe(alvo0.id).id); D = lerDoModelo(); } }
      if (!D || !P || !P.res || !P.res.ok) { toast("Selecione um andaime (ou abra o painel dele) para gerar as pranchas executivas.", "aviso", 6000); return false; }
      var AP0 = global.AndaimePranchas; if (!AP0 || typeof AP0.gerar !== "function") { dizer("Pranchas: o motor de pranchas do andaime não carregou.", true); renderizar(); return false; }
      var cab = cabDe(D), r = null, op0 = opcoesDocumento(cab); op0.jogo = "completo";  /* jogo: "completo" */
      try { r = AP0.gerar(P.res.modelo, P.res.calc, {}, op0); }
      catch (e) { dizer("Pranchas executivas: " + (e && e.message ? e.message : e), true); renderizar(); return false; }
      if (!r || !r.ok) { dizer("Pranchas executivas: " + ((r && r.avisos && r.avisos[0]) || "não foi possível gerar."), true); renderizar(); return false; }
      this.ultimoJogo = r;
      var d = doc(), html = '<!doctype html><html><head><meta charset="utf-8"><title>Pranchas executivas do andaime</title><style>@page{size:841mm 594mm;margin:0}html,body{margin:0;background:#fff}.f{width:841mm;height:594mm;page-break-after:always;overflow:hidden}.f svg{width:841mm;height:594mm;display:block}</style></head><body>' + r.folhas.map(function (f) { return '<div class="f">' + f.svg + "</div>"; }).join("") + "</body></html>";
      this.ultimoJogoHtml = html;
      var dxfOk = false;
      try {
        var PX = global.PranchasDxf, Z = global.BimBcf;
        if (PX && Z && Z.zipEscrever && d) { var arq = PX.arquivos(r); if (arq && arq.nomes && arq.nomes.length) { var blob = new Blob([Z.zipEscrever(arq.arquivos)], { type: "application/zip" }), u = URL.createObjectURL(blob), a = d.createElement("a"); a.href = u; a.download = (cab.andaime || "andaime") + "-pranchas-dxf.zip"; d.body.appendChild(a); a.click(); setTimeout(function () { try { a.remove(); URL.revokeObjectURL(u); } catch (e3) {} }, 3000); dxfOk = true; } }
      } catch (eD) { dizer("DXF das pranchas: " + (eD && eD.message ? eD.message : eD), true); }
      this.imprimir(html);
      var avRT = avisoRT(cab); if (avRT) toast(avRT, "aviso", 9000);
      dizer((avRT ? avRT + ". " : "") + r.folhas.length + " pranchas A1 geradas (" + (r.liberado ? "projeto liberável" : r.faixa) + "). PDF: na janela de impressão escolha «Salvar como PDF»." + (dxfOk ? " O DXF (carimbo RA, layers do Padrão RA) foi baixado em .zip." : " (DXF indisponível neste ambiente.)"), false); renderizar();
      return r;
    },
    documento: function (qual) {
      var D = lerDoModelo(); if (!D || !P || !P.res || !P.res.ok) return false;
      if (qual === "pranchas") return this.pranchasExecutivas();
      var M = qual === "pranchas" ? global.AndaimePranchas : global.AndaimeMemorial;
      if (!M || typeof M.gerar !== "function") { dizer((qual === "pranchas" ? "Pranchas" : "Memorial") + ": em preparação.", true); renderizar(); return false; }
      var cabM = cabDe(D), opM = opcoesDocumento(cabM); opM.cab = cabM;
      try {
        var r = M.gerar(P.res.modelo, P.res.calc, {}, opM);
        if (!r || !r.ok) { dizer("Memorial: " + ((r && r.motivo) || "não foi possível gerar."), true); renderizar(); return false; }
        this.ultimoMemorialHtml = r.html; this.imprimir(r.html);
        var avM = avisoRT(cabM); if (avM) toast(avM, "aviso", 9000);
        dizer((avM ? avM + ". " : "") + "Memorial gerado. PDF: na janela de impressão escolha «Salvar como PDF».", false); renderizar(); return r;
      }
      catch (e) { dizer((qual === "pranchas" ? "Pranchas" : "Memorial") + ": " + (e && e.message ? e.message : e), true); renderizar(); return false; }
    }
  };
  /* mantém o contrato antigo: metalui.js lê Andaime.UI (pronto/COMANDOS/ids/registrar) */
  try { var An0 = AN(); if (An0) An0.UI = AndaimeUI; } catch (eU) {}
  global.AndaimeUI = AndaimeUI;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
