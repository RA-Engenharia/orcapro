/* =====================================================================
 * incacsui.js — a TELA de "Incêndio e acessibilidade" (21/10/2026). Fiação fina: a conta está nos motores puros
 * (js/incregras.js, js/incgeo.js, js/incauto.js, js/incauditor.js, js/acsauditor.js). Molde: js/eleautoui.js.
 *
 * Fita: Arquitetura › "Incêndio e acessibilidade" (registrado pelo js/gestao.js, logo depois dos Pontos elétricos):
 *   inc-dados      Dados da edificação: divisão (Decreto 47.998), atividade (IT 09 → carga de incêndio), altura/área/população (vazios =
 *                  medidos no modelo), TRRF, compartimentação, chuveiros, detecção, hidráulico, construção até 2005, projeto acessível
 *   inc-lancar     Lançar extintores, placas e luminárias de emergência (um lote; rodar de novo não duplica)
 *   inc-auditar    Auditar incêndio (CBMMG) — cada achado: o que é + Corrigir + Mostrar no 3D (js/problemacard.js)
 *   acs-auditar    Auditar acessibilidade (NBR 9050 / 16537 / LBI)
 * Os dados ficam NESTE APARELHO, por obra (localStorage raerp:bim:incendio-dados:<obra>).
 * TRAVA POR LICENÇA NA FUNÇÃO (como js/eleautoui.js): incêndio vale se Arquitetura, Hidráulica ou Elétrica estiver liberada;
 * acessibilidade, se Arquitetura estiver — a fita esconde, e a função confere sozinha (atalho, "Corrigir").
 * ===================================================================== */
(function (global) {
  "use strict";
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  var PREF = "raerp:bim:incendio-dados:";
  var DISC_INC = ["civil", "hidraulica", "eletrica"], DISC_ACS = ["civil"];
  var TRANCADA = "Incêndio e acessibilidade fazem parte do OrçaPRO Modela (Arquitetura, Hidráulica ou Elétrica): a disciplina não está liberada nesta conta.";
  function liberada(discs) { try { var D = global.BimDisciplinas; if (!D || typeof D.trancada !== "function") return true; return discs.some(function (d) { return !D.trancada(d); }); } catch (e) { return true; } }
  function trancou(titulo, discs) { if (liberada(discs)) return false; status(TRANCADA); janela(titulo, "<p>" + esc(TRANCADA) + "</p>"); return true; }

  function estado() { var B = global.BIM, E = global.BimEdit; if (!B || !B.editarOps || !E) return null; try { return E.aplicar(B.editarOps()); } catch (e) { return null; } }
  function opsDoModelo() { var B = global.BIM; try { return B && B.editarOps ? B.editarOps() : null; } catch (e) { return null; } }
  function avaliar() { var B = global.BIM; return B && B.familiaAvaliar ? function (f, t, i) { return B.familiaAvaliar(f, t, i); } : null; }
  function aplicar(lote, discs) { var B = global.BIM; if (!liberada(discs || DISC_INC)) { status(TRANCADA); return false; } if (!B || !B.editarLote) { status("O editor 3D não está aberto."); return false; } return !!B.editarLote(lote); }
  function obraId() { try { var G = global.Gestao; return G && G._bimSel ? String(G._bimSel) : "geral"; } catch (e) { return "geral"; } }
  function lerDados() { try { var t = global.localStorage && global.localStorage.getItem(PREF + obraId()); return t ? JSON.parse(t) || {} : {}; } catch (e) { return {}; } }
  function gravarDados(o) { try { if (global.localStorage) global.localStorage.setItem(PREF + obraId(), JSON.stringify(o || {})); } catch (e) {} }

  function janela(titulo, html) {
    if (typeof document === "undefined") return null;
    var velho = document.getElementById("inc-modal"); if (velho && velho.parentNode) velho.parentNode.removeChild(velho);
    var ov = document.createElement("div"); ov.id = "inc-modal";
    ov.setAttribute("style", "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px");
    ov.innerHTML = '<div role="dialog" aria-label="' + esc(titulo) + '" data-inc-caixa style="background:var(--surface,#fff);color:var(--text,#16202a);max-width:1080px;width:100%;max-height:88vh;overflow:auto;border-radius:10px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px"><strong style="font-size:15px">' + esc(titulo) + '</strong><button type="button" data-inc-fechar class="btn sm">Fechar</button></div>' + html + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov || (e.target && e.target.hasAttribute && e.target.hasAttribute("data-inc-fechar"))) { if (ov.parentNode) ov.parentNode.removeChild(ov); } });
    document.body.appendChild(ov);
    return ov;
  }
  function lista(titulo, itens) {
    itens = arr(itens); if (!itens.length) return "";
    return '<h4 style="margin:10px 0 4px">' + esc(titulo) + '</h4><ul style="margin:0 0 0 18px;padding:0">' + itens.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
  }
  var COR = { A: "#1e7a3c", N: "#1e5a7a", C: "#2d6a9c", X: "#8a1c1c" };
  function selo(n) { var k = String(n || "X").charAt(0), R = global.IncRegras; return '<span title="' + esc(R ? R.rotuloNivel(k) : k) + '" style="display:inline-block;min-width:18px;text-align:center;border-radius:4px;padding:0 4px;color:#fff;background:' + (COR[k] || "#555") + ';font-weight:700">' + esc(k) + "</span>"; }
  function legenda() {
    var R = global.IncRegras; if (!R) return "";
    return '<p style="margin:4px 0 6px;font-size:12px">' + ["A", "N", "C", "X"].map(function (k) { return selo(k) + " " + esc(R.NIVEIS[k]); }).join(" &nbsp; ") + "</p>" +
      '<p data-inc-aviso-norma style="margin:0 0 8px;padding:6px 8px;border-radius:6px;background:rgba(30,90,122,.10);font-size:12px">Em MG vale a <b>IT do CBMMG</b> (Decreto 47.998/2020): IT 01 v10.5, IT 08, IT 09, IT 13, IT 15, IT 16 — PDFs oficiais. A NBR 9077 da biblioteca (1993/2001) está cancelada e <b>não é usada</b>. NBR 10898: a IT 13 da biblioteca (1ª ed., Portaria 5/2005) cita a NBR 10898/1999; edição adotada em MG: conferir; os valores de lux e autonomia são da 2023 em cópia <b>não licenciada</b> e saem como "conferir".</p>';
  }
  function cabecalho(K) {
    if (!K) return "";
    return '<p style="margin:4px 0 8px;font-size:12px"><b>Edificação:</b> ' + esc(K.divisao || "divisão NÃO informada") + (K.descricao ? " — " + esc(K.descricao) : "") + " · altura " + f2(K.altura) + " m · área " + f2(K.area) + " m² · população " + (K.populacao != null ? Math.ceil(K.populacao - 1e-9) : "?") +
      (K.isentaA1 ? " · <b>isenta</b> das medidas (IT 01 A.4.1): sem nível de risco nem PSCIP" : " · carga " + (K.qfi != null ? K.qfi + " MJ/m² (risco " + esc(K.risco.rotulo.toLowerCase()) + ")" : "?") + " · nível " + esc(K.nivel.nivel) + " · " + esc(K.pscip.tipo)) + ' &nbsp; <button type="button" class="btn ghost sm" data-inc-abrir-dados>Dados da edificação</button></p>';
  }
  function ligarDados(ov) { if (!ov) return; ov.addEventListener("click", function (e) { var t = e.target; if (t && t.hasAttribute && t.hasAttribute("data-inc-abrir-dados")) dadosTela(); }); }

  /* ----------------------------------------------------------- comandos */
  function lancar() {
    if (trancou("Lançar extintores, placas e luminárias", DISC_INC)) return;
    var st = estado(), IA = global.IncAuto; if (!st || !IA) { status("O editor 3D não está aberto."); return; }
    var res = IA.gerar({ estado: st, avaliarFam: avaliar(), dados: lerDados() });
    if (!res.ok) { janela("Extintores, placas e luminárias", "<p>" + esc(res.motivo) + "</p>"); status(res.motivo); return; }
    var aplicado = res.lote ? aplicar(res.lote, DISC_INC) : false, z = res.resumo;
    /* "o que existe já atende" só quando o auditor concorda (27/10/2026): sem nada a lançar mas com erro/aviso (capacidade B, extintor sem rótulo...), a tela diz o que falta */
    var pendAud = null;
    if (!res.lote && global.IncAuditor) { try { var ra = global.IncAuditor.auditar({ estado: st, avaliarFam: avaliar(), dados: lerDados() }); if (ra.resumo.erros + ra.resumo.avisos > 0) pendAud = ra.resumo; } catch (e) { pendAud = null; } }
    var ROT = { extintor: "Extintor", placa: "Placa", luminaria: "Luminária de emergência" };
    var linhas = res.itens.map(function (x) { return "<tr><td>" + esc(x.id) + "</td><td>" + esc(x.ambienteNome) + "</td><td>" + esc(ROT[x.tipo] || x.tipo) + " · " + esc(x.tipoId) + " · " + f2(x.altura) + " m</td><td style=\"font-size:12px\">" + arr(x.regras).map(esc).join("<br>") + "</td></tr>"; }).join("");
    var html = legenda() + cabecalho(res.classe) + "<p><b>" + z.extintores + "</b> extintor(es), <b>" + z.placas + "</b> placa(s) e <b>" + z.luminarias + "</b> luminária(s) de emergência" +
      (aplicado ? " — aplicado num lote (Ctrl+Z desfaz)." : (res.lote ? " — <b>não aplicado</b>." : ": " + (pendAud ? "nada a lançar automaticamente, mas o auditor ainda aponta <b>" + pendAud.erros + "</b> erro(s) e <b>" + pendAud.avisos + "</b> aviso(s) — rode <b>Auditar incêndio</b>." : "nada a lançar (o que existe já atende)."))) + "</p>" +
      (linhas ? '<table class="tbl" style="width:100%;border-collapse:collapse"><thead><tr><th>Peça</th><th>Ambiente</th><th>O quê</th><th>Regras aplicadas</th></tr></thead><tbody>' + linhas + "</tbody></table>" : "") +
      '<p style="font-size:12px;margin-top:8px">Orçamento: ' + selo("A") + " extintor de água/PQS BC/CO2 e luminária pela composição SINAPI 06/2026 do tipo; " + selo("C") + " extintor de pó ABC e placas pelo <b>maior preço público lido</b>, marcado PROVISÓRIO (cotar com o fornecedor) — a SINAPI não tem composição deles.</p>" +
      lista("Pendências", res.pendencias.map(function (p) { return p.texto; })) + lista("Avisos", res.avisos);
    ligarDados(janela("Extintores, placas e luminárias", html));
    status("Incêndio: " + z.extintores + " extintor(es), " + z.placas + " placa(s), " + z.luminarias + " luminária(s).");
    return res;
  }
  function mostrarAuditoria(titulo, res, discs, refazer, origem) {
    var PC = global.ProblemaCard, probs = res.problemas;
    var erros = probs.filter(function (p) { return p.gravidade === "erro"; }), avs = probs.filter(function (p) { return p.gravidade !== "erro" && p.peso !== "info" && p.peso !== "pendente"; }), infos = probs.filter(function (p) { return p.peso === "info" || p.peso === "pendente"; });
    function bloco(L, tit, grav, pre) {
      if (!L.length) return "";
      var o = { acoes: function (s) { return s && (arr(s.ops).length || s.dados) ? (s.texto || true) : false; }, titulo: tit, gravidade: grav, prefixoIndice: pre };
      o.depois = function (p) { return '<p style="font-size:11px;margin:2px 0 0">' + selo(p.nivel) + " " + esc(p.nivelRotulo) + " · <code>" + esc(p.codigo) + "</code></p>"; };
      return PC ? PC.lista(L, o) : lista(tit, L.map(function (p) { return p.titulo; }));
    }
    var html = legenda() + cabecalho(res.classe) + (erros.length || avs.length ? "" : "<p><b>Nenhum erro nem aviso</b> no modelo.</p>") +
      bloco(erros, "Erros (" + erros.length + ")", "erro", "e") + bloco(avs, "Avisos (" + avs.length + ")", "aviso", "a") + bloco(infos, "Informações e pendências (" + infos.length + ")", "aviso", "i");
    var ov = janela(titulo, html);
    ligarDados(ov);
    if (ov && PC) PC.ligar(ov, {
      corrigir: function (solId, k) {
        var c = String(k).charAt(0), L = c === "a" ? avs : c === "i" ? infos : erros, p = L[+String(k).slice(1)], s = p && arr(p.solucoes).filter(function (x) { return x.id === solId; })[0];
        if (!s || (!arr(s.ops).length && !s.dados)) return;
        /* Corrigir de DADOS (divisão, atividade): grava em Dados da edificação — não mexe no modelo, então não há Ctrl+Z; a tela de dados desfaz */
        if (s.dados) { if (!liberada(discs || DISC_INC)) { status(TRANCADA); return; } gravarDados(global.IncAuto.aplicarDados(lerDados(), s)); status("Corrigido: " + s.texto + " (desfaz em Dados da edificação)."); refazer(); return; }
        if (aplicar({ op: "lote", id: origem + "-corr-" + Date.now().toString(36), origem: origem, pedido: "Corrigir: " + s.texto, ops: s.ops }, discs)) { status("Corrigido: " + s.texto + " (Ctrl+Z desfaz)."); refazer(); }
      },
      mostrar: function (ids) { PC.mostrarNo3D(ids); }
    });
    status(titulo + ": " + erros.length + " erro(s), " + avs.length + " aviso(s).");
  }
  function auditarInc() {
    if (trancou("Auditar incêndio", DISC_INC)) return;
    var st = estado(), AU = global.IncAuditor; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, ops: opsDoModelo(), avaliarFam: avaliar(), dados: lerDados() });
    mostrarAuditoria("Auditar incêndio (CBMMG)", res, DISC_INC, auditarInc, "inc-auditor");
    return res;
  }
  function auditarAcs() {
    if (trancou("Auditar acessibilidade", DISC_ACS)) return;
    var st = estado(), AU = global.AcsAuditor; if (!st || !AU) { status("O editor 3D não está aberto."); return; }
    var res = AU.auditar({ estado: st, avaliarFam: avaliar(), dados: lerDados() });
    mostrarAuditoria("Auditar acessibilidade (NBR 9050)", res, DISC_ACS, auditarAcs, "acs-auditor");
    return res;
  }
  function dadosTela() {
    var R = global.IncRegras; if (!R) return;
    var d = lerDados(), divs = R.divisoes(), ats = d.divisao ? R.atividades(d.divisao) : [];
    function chk(k, rot) { return '<label style="display:block;margin:2px 0"><input type="checkbox" data-inc-d="' + k + '"' + (d[k] ? " checked" : "") + "> " + esc(rot) + "</label>"; }
    /* uso público: marcado por padrão nas divisões abertas ao público (comercial, serviços, saúde, educação, reunião...) e desmarcado em residencial; a escolha do usuário (inclusive desmarcar) fica gravada */
    function chkU(k, rot, div) { var marcado = d[k] != null ? !!d[k] : !!(div && R.usoPublicoPadrao && R.usoPublicoPadrao(div)); return '<label style="display:block;margin:2px 0"><input type="checkbox" data-inc-d="' + k + '"' + (marcado ? " checked" : "") + "> " + esc(rot) + "</label>"; }
    function nm(k, rot, dica) { return '<label style="display:inline-block;margin:2px 12px 2px 0">' + esc(rot) + ' <input type="number" step="0.01" data-inc-d="' + k + '" value="' + (d[k] != null && d[k] !== "" ? esc(d[k]) : "") + '" placeholder="' + esc(dica) + '" style="width:90px"></label>'; }
    var html = legenda() +
      '<p><label>Divisão de ocupação (Decreto 47.998/2020, Anexo) <select data-inc-d="divisao"><option value="">— escolha —</option>' + divs.map(function (x) { return '<option value="' + esc(x.divisao) + '"' + (d.divisao === x.divisao ? " selected" : "") + ">" + esc(x.divisao + " — " + x.descricao) + "</option>"; }).join("") + "</select></label>" + (d.divisao === "A-1" ? '<br><span data-inc-a1 style="font-size:12px">Residência unifamiliar: <b>isenta</b> das medidas de segurança contra incêndio (CBMMG IT 01 A.4.1) — não depende de área nem de altura. Áreas comuns de condomínio (guarita, salão de festas) seguem a regra normal.</span>' : "") + "</p>" +
      '<p><label>Atividade (IT 09 Tabela A.1 → carga de incêndio) <select data-inc-d="atividade"><option value="">— a maior carga da divisão (lado seguro) —</option>' + ats.map(function (x) { return '<option value="' + x.i + '"' + (String(d.atividade) === String(x.i) ? " selected" : "") + ">" + esc(x.descricao + (x.qfi != null ? " — " + x.qfi + " MJ/m²" : " — método do Anexo B/C")) + "</option>"; }).join("") + "</select></label></p>" +
      "<p>" + nm("altura", "Altura (m)", "do modelo") + nm("area", "Área total (m²)", "do modelo") + nm("populacao", "População", "IT 08 T4") + nm("qfi", "Carga (MJ/m²)", "da atividade") + "</p>" +
      '<div style="display:flex;gap:24px;flex-wrap:wrap"><div>' + chk("trrf", "TRRF (estrutura com resistência ao fogo — IT 06)") + chk("compartimentacaoVertical", "Compartimentação vertical completa (IT 07)") + chk("chuveiros", "Chuveiros automáticos (IT 18)") + chk("deteccao", "Detecção de incêndio (IT 14)") + chk("hidraulico", "Há projeto de sistema hidráulico (hidrantes/chuveiros)") + "</div><div>" +
      chk("ate2005", "Construída até 01/07/2005 (IT 01 A.2)") + chk("subsoloComUso", "Subsolo com uso diferente de estacionamento") + chk("patrimonio", "Patrimônio histórico cultural") + chk("acessivel", "Projeto acessível (NBR 9050), mesmo se não obrigatório") + chkU("usoPublico", "Uso PÚBLICO — aberto ao público em geral, propriedade pública ou privada (NBR 9050:2020 3.1.37): corredor 1,50 m. Padrão por critério RA (o Decreto 47.998 não define uso público): marque quando a sala atende o público", d.divisao) + "</div></div>" +
      '<p style="font-size:12px">Vazio = medido no modelo (altura pelos pavimentos, área pela soma dos ambientes, população pela IT 08 Tabela 4). Fica neste aparelho, por obra.</p>' +
      '<div style="display:flex;gap:8px"><button type="button" class="btn primary sm" data-inc-salvar>Salvar</button><button type="button" class="btn ghost sm" data-inc-limpar>Limpar</button></div>';
    var ov = janela("Dados da edificação (incêndio e acessibilidade)", html); if (!ov) return;
    function ler() {
      var o = {};
      arr(ov.querySelectorAll("[data-inc-d]")).forEach(function (i) {
        var k = i.getAttribute("data-inc-d");
        if (i.type === "checkbox") { if (i.checked) o[k] = true; else if (k === "usoPublico") o[k] = false; return; }   /* desmarcar o uso público é escolha (o padrão da divisão é marcado) */
        var v = String(i.value || "").trim(); if (v === "") return;
        if (i.type === "number") { var n = parseFloat(v.replace(",", ".")); if (isFinite(n)) o[k] = n; } else o[k] = k === "atividade" ? Number(v) : v;
      });
      return o;
    }
    ov.addEventListener("change", function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute("data-inc-d") === "divisao") { var o = ler(); delete o.atividade; gravarDados(o); dadosTela(); } });
    ov.addEventListener("click", function (e) {
      var t = e.target; if (!t || !t.hasAttribute) return;
      if (t.hasAttribute("data-inc-salvar")) { gravarDados(ler()); status("Dados da edificação gravados neste aparelho."); if (ov.parentNode) ov.parentNode.removeChild(ov); }
      if (t.hasAttribute("data-inc-limpar")) { gravarDados({}); status("Dados da edificação apagados."); dadosTela(); }
    });
  }

  var IncAcsUI = {
    registrar: function (reg) {
      var R = global.BimRibbon;
      if (!R || !reg || !global.IncAuto) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Incêndio e acessibilidade", [
        { id: "inc-dados", rotulo: "Dados da\nedificação", icone: "regua", grande: true, dica: "Divisão de ocupação, atividade (carga de incêndio da IT 09), altura, área, população, TRRF, chuveiros, detecção e projeto acessível — o que classifica a edificação no CBMMG (nível de risco e PT/PTS/PTD)." },
        { id: "inc-lancar", rotulo: "Extintores, placas\ne luminárias", icone: "mais", grande: true, dica: "Lança extintores (IT 16: a ≤ 10 m da entrada e cobertura pelo percurso real), placas de saída e de orientação (IT 15) e luminárias de emergência (IT 13: 15 m) — com preço. Um Ctrl+Z desfaz; rodar de novo não duplica." },
        { id: "inc-auditar", rotulo: "Auditar\nincêndio", icone: "calculadora", grande: true, dica: "Saídas (distância de caminhamento, larguras, portas, sentido de abertura, escadas, rampas), extintores, iluminação e sinalização de emergência pelas ITs do CBMMG — cada item com Corrigir e Mostrar no 3D." },
        { id: "acs-auditar", rotulo: "Auditar\nacessibilidade", icone: "calculadora", grande: true, dica: "Rota acessível, portas 0,80 m, espaço da maçaneta, corredores, desníveis, rampas, escadas e corrimãos, sanitário acessível (giro Ø 1,50) pela NBR 9050:2020 e a lei — cada item com Corrigir e Mostrar no 3D." }
      ]);
      reg["inc-dados"] = function () { dadosTela(); return true; };
      reg["inc-lancar"] = function () { lancar(); return true; };
      reg["inc-auditar"] = function () { auditarInc(); return true; };
      reg["acs-auditar"] = function () { auditarAcs(); return true; };
      return true;
    },
    lancar: lancar, auditarIncendio: auditarInc, auditarAcessibilidade: auditarAcs, dados: dadosTela, lerDados: lerDados, gravarDados: gravarDados, liberada: liberada
  };
  global.IncAcsUI = IncAcsUI;
  if (typeof module !== "undefined" && module.exports) module.exports = IncAcsUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
