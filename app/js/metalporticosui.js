/* =====================================================================
 * metalporticosui.js — a TELA da BIBLIOTECA DE PÓRTICOS INDUSTRIAIS
 * (Metálica & Mecânica › Pórticos; só com a prévia do modelador).
 * 14/10/2026, frente M4 da 1.2.145.
 *
 * Quem gera e decide é o js/metalporticos.js (motor puro). Aqui:
 *   · o botão da fita (grupo "Pórticos", logo depois do Galpão);
 *   · o DIÁLOGO: os cartões das tipologias (croqui do pórtico típico, o
 *     MOTOR de cálculo de cada uma e o que fica NÃO VERIFICADO), os campos
 *     da escolhida com a prévia ao vivo e o resumo;
 *   · "Criar no modelo" e "Criar e calcular": a alma cheia de uma e duas
 *     águas entra pelo gerador do galpão (BimMetalUI.gerarGalpao, o galpão
 *     fica ligado ao cálculo do galpão) e abre o Cálculo do galpão com a
 *     geometria; o resto entra como peças desenhadas (um lote, um Ctrl+Z) e
 *     abre o Cálculo da estrutura desenhada já preparado — base, áreas de
 *     cobertura por água, piso do mezanino, cargas da ponte, fechamento das
 *     faces e as peças do pórtico (MetalCalcLivreUI.preparar);
 *   · "Atualizar no lugar": com uma peça de um pórtico da biblioteca
 *     selecionada, o diálogo abre com os dados dele e refaz no mesmo lugar.
 * Cores: tokens do css/app.css (tema claro e escuro). Sem backdrop-filter.
 * ===================================================================== */
(function (global) {
  "use strict";

  function MP() { return global.MetalPorticos || null; }
  function MU() { return global.BimMetalUI || null; }
  function B() { return global.BIM || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }

  var COMANDOS = [
    { id: "met-porticos", rotulo: "Pórticos\nindustriais", icone: "estrutura", grande: true, dica: "Biblioteca de pórticos industriais paramétricos: alma cheia de uma e duas águas, mísula, atirantado, treliçados (banzos paralelos, trapezoidal, tesouras Howe/Pratt/Warren), shed, multivão, ponte rolante, mezanino e coluna treliçada. Gera o modelo BIM inteiro e prepara o cálculo." }
  ];

  /* ------------------------------------------------------------ campos [id, rótulo, tipo, opções] */
  var S_PRINC = ["GERDAU", "W", "VS", "CVS", "CS"], S_TUBO = ["VMB-TQ", "VMB-TR", "VMB-TC", "HSSR"], S_TERCA = ["UE", "UFF", "GERDAU"], S_BARRA = ["BARRA-R"], S_L = ["L", "GERDAU-L"];
  var SN = [["rotulada", "Rotulada"], ["engastada", "Engastada"]];
  function campos(t) {
    var c = [];
    if (t !== "shed" && t !== "multivao") c.push(["vao", "Vão (m)", "num"]);
    c.push(["peDireito", t === "trelica-paralelos" || t === "trelica-trapezoidal" || t === "tesoura" ? "Altura do banzo de cima no pilar (m)" : "Pé-direito — altura do beiral (m)", "num"]);
    if (t !== "shed") c.push(["inclinacao", "Inclinação do telhado (%)", "num"]);
    c.push(["espacamento", "Espaçamento dos pórticos (m)", "num"], ["nPorticos", "Número de pórticos", "int"]);
    if (t !== "coluna-trelicada") c.push(["base", "Base dos pilares", "sel", SN]);
    c.push(["fechamento", "Fechamento (laterais e oitões)", "sel", [["fechado", "Fechado — telha trapezoidal"], ["aberto", "Aberto"]]]);
    c.push(["contraventamento", "Contraventamento (vãos das pontas)", "sel", [["X-barra", "X de barra redonda"], ["X-cantoneira", "X de cantoneira"], ["nenhum", "Nenhum"]]]);
    if (t === "trelica-paralelos") c.push(["aguas", "Águas", "sel", [["2", "Duas águas"], ["1", "Uma água"]]]);
    if (/^trelica|^tesoura/.test(t)) {
      c.push(["padrao", "Treliça", "sel", [["pratt", "Pratt"], ["howe", "Howe"], ["warren", "Warren"]]]);
      if (t !== "tesoura") c.push(["alturaTrelica", t === "trelica-paralelos" ? "Altura da treliça (m, entre eixos)" : "Altura no apoio (m, entre eixos)", "num"]);
      c.push(["paineis", "Nº de painéis (0 = automático)", "int"], ["banzo", "Perfil dos banzos", "cat", S_TUBO.concat(S_PRINC)], ["diagonal", "Perfil das diagonais (tubo)", "cat", S_TUBO], ["montante", "Perfil dos montantes (tubo)", "cat", S_TUBO], ["escora", "Escora do banzo de baixo", "cat", S_TUBO]);
    }
    if (t === "shed") c.push(["dentes", "Número de dentes", "int"], ["vaoDente", "Vão de cada dente (m)", "num"], ["alturaDente", "Altura da face envidraçada (m)", "num"]);
    if (t === "multivao") c.push(["vaos", "Número de vãos", "int"], ["vaoCada", "Vão de cada módulo (m)", "num"], ["cobertura", "Cobertura", "sel", [["unica", "Única em duas águas"], ["geminada", "Geminada (duas águas por vão)"]]], ["ligInterna", "Pilar interno no topo", "sel", [["rigida", "Rígido com as vigas"], ["rotulada", "Rotulado (pendular)"]]], ["pilarInterno", "Perfil do pilar interno", "cat", S_PRINC]);
    if (t === "coluna-trelicada") c.push(["larguraColuna", "Largura da coluna (m, entre eixos)", "num"], ["painelColuna", "Altura do painel do travejamento (m)", "num"], ["banzoColuna", "Perfil dos banzos da coluna", "cat", S_PRINC], ["travejamento", "Perfil do travejamento (tubo)", "cat", S_TUBO], ["escora", "Escora longitudinal da coluna", "cat", S_TUBO]);
    else c.push(["pilar", "Perfil dos pilares", "cat", S_PRINC]);
    if (!/^trelica|^tesoura/.test(t)) c.push(["viga", "Perfil das vigas", "cat", S_PRINC]);
    if (t === "misula") c.push(["misulaComprimento", "Mísula: comprimento em planta (m; 0 = vão/10)", "num"], ["misulaAltura", "Mísula: altura acrescida no joelho (m; 0 = a da viga)", "num"], ["degraus", "Mísula: degraus do cálculo (2 a 6)", "int"]);
    if (t === "atirantado") c.push(["tirante", "Tirante (barra redonda)", "cat", S_BARRA], ["pendural", "Pendural (barra redonda)", "cat", S_BARRA]);
    if (t === "ponte") c.push(["cotaConsole", "Cota do topo do console (m; 0 = 70 % do pé-direito)", "num"], ["excentricidade", "Do eixo do pilar ao da viga de rolamento (m)", "num"], ["console", "Perfil do console", "cat", S_PRINC], ["vigaRolamento", "Perfil da viga de rolamento", "cat", S_PRINC],
      ["rodaMax", "Reação MÁX. por roda, com impacto (kN) — fabricante", "num"], ["rodaMin", "Reação mín. por roda (kN) — fabricante", "num"], ["rodaTransv", "Força transversal por roda (kN) — fabricante", "num"], ["forcaLong", "Força longitudinal por trilho (kN) — fabricante", "num"], ["entreEixos", "Distância entre as rodas de um lado (m)", "num"], ["capacidade", "Capacidade da ponte (t) — só dado", "num"]);
    if (t === "mezanino") c.push(["largura", "Largura do mezanino (m, da lateral esquerda)", "num"], ["cotaPiso", "Cota do piso — topo do aço (m)", "num"], ["espSec", "Espaçamento das secundárias (m)", "num"], ["vigaMez", "Viga do mezanino", "cat", S_PRINC], ["secMez", "Secundária do mezanino", "cat", S_PRINC], ["pilarMez", "Pilar do mezanino", "cat", S_PRINC.concat(S_TUBO)],
      ["uso", "Uso do piso (NBR 6120, Tabela 10)", "sel", usos()], ["qInformado", "Sobrecarga informada (kN/m²; só se o uso pede)", "num"], ["gPiso", "Permanente do piso (kN/m²)", "num"]);
    c.push(["terca", "Perfil das terças", "cat", S_TERCA], ["espTercas", "Espaçamento máx. das terças (m)", "num"], ["correntes", "Linhas de corrente por vão (0 a 3)", "int"]);
    c.push(["tapamento", "Coluna de tapamento (oitão fechado)", "cat", S_TUBO.concat(S_PRINC)]);
    if (true) c.push(["barraCv", "Barra do X (contraventamento)", "cat", S_BARRA], ["cantoneiraCv", "Cantoneira do X (contraventamento)", "cat", S_L]);
    c.push(["x0", "Origem X (m)", "num"], ["z0", "Origem Z (m)", "num"], ["cota", "Cota da base (m)", "num"]);
    return c;
  }
  function usos() { var M = global.AcoModeloLivre; return M && M.USOS ? M.USOS.filter(function (u) { return !u.cobertura; }).map(function (u) { return [u.id, u.grupo + " — " + u.local + (u.q != null ? " (" + br(u.q, u.q < 1 ? 2 : 1) + " kN/m²)" : " (informar)")]; }) : [["industrial-adm", "Edificações industriais — salas administrativas (2,5 kN/m²)"]]; }
  var _dl = {};
  function datalist(series) {
    var k = series.join("-"); if (_dl[k]) return _dl[k];
    var A = global.PerfisAco, MC = global.MetalCriar, o = [];
    if (A) series.forEach(function (s) { (A.listar(s) || []).forEach(function (n) { if (!MC || MC.perfilCat(n)) o.push(n); }); });
    _dl[k] = o; return o;
  }

  function css() {
    if (typeof document === "undefined" || document.getElementById("mpo-css")) return;
    var s = document.createElement("style"); s.id = "mpo-css";
    s.textContent = ".mpo-dlg{display:grid;grid-template-columns:250px minmax(0,1fr) 330px;gap:12px;align-items:start}" +
      ".mpo-tipos{display:flex;flex-direction:column;gap:6px;max-height:64vh;overflow:auto;padding-right:4px}" +
      ".mpo-tipo{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;text-align:left;border:1px solid var(--linha);border-radius:9px;background:var(--surface);color:var(--texto);padding:5px 7px;cursor:pointer;font:inherit}" +
      ".mpo-tipo:hover{border-color:var(--aco)}.mpo-tipo[aria-pressed='true']{border-color:var(--aco);box-shadow:inset 3px 0 0 var(--aco)}" +
      ".mpo-tipo svg{width:72px;height:40px;display:block}.mpo-tipo b{display:block;font-size:12px;line-height:1.25}.mpo-tipo small{display:block;font-size:10.5px;color:var(--texto-fraco);line-height:1.25}" +
      ".mpo-tag{display:inline-block;font-size:10px;padding:0 5px;border-radius:5px;margin-top:2px;border:1px solid var(--linha)}.mpo-tag.galpao{color:var(--verde)}.mpo-tag.livre{color:var(--aco)}.mpo-tag.nv{color:var(--amarelo)}" +
      ".mpo-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px 12px;max-height:64vh;overflow:auto;padding-right:4px}" +
      ".mpo-campos label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--texto)}.mpo-campos input,.mpo-campos select{min-height:30px}" +
      ".mpo-lado{display:flex;flex-direction:column;gap:8px}.mpo-prev{border:1px solid var(--linha);border-radius:8px;background:var(--surface);padding:6px;color:var(--texto)}.mpo-prev svg{width:100%;height:auto;display:block}" +
      ".mpo-res{font-size:12px;color:var(--texto);margin:0}.mpo-motor{font-size:12px;margin:0;color:var(--texto)}.mpo-nv{font-size:11px;color:var(--amarelo);margin:0;padding-left:16px}" +
      ".mpo-av{font-size:11px;color:var(--texto-fraco);margin:0;padding-left:16px;max-height:110px;overflow:auto}.mpo-erro{font-size:12px;color:var(--vermelho);margin:0;min-height:1.2em}" +
      "@media (max-width:980px){.mpo-dlg{grid-template-columns:1fr}.mpo-tipos{max-height:none;flex-direction:row;flex-wrap:wrap}.mpo-tipo{width:220px}.mpo-campos{max-height:none}}";
    document.head.appendChild(s);
  }

  var MetalPorticosUI = {
    COMANDOS: COMANDOS, _n: 0, ultimo: null, _dlg: null, campos: campos,
    ids: function () { return COMANDOS.map(function (c) { return c.id; }); },
    novoId: function () { var U = MU(); if (U && U.novoId) return U.novoId(); this._n++; return "mpo-" + Date.now().toString(36) + "-" + this._n; },
    estado: function () { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; },
    caixas: function () { var st = this.estado(); return (st && st.caixas) || []; },
    registrar: function (reg) {
      if (!previa() || !MP()) return false;
      var self = this;
      reg["met-porticos"] = function () { try { self.abrir(); } catch (e) { toast("Pórticos: " + (e && e.message ? e.message : e), "erro", 8000); } return true; };
      return true;
    },
    /* os pórticos da biblioteca no modelo (peças com caixa.portico; o de alma cheia é um galpão: caixa.galpao + porticoTipo) */
    porticos: function () {
      var por = {}, ordem = [];
      this.caixas().forEach(function (c) {
        if (!c || !c.portico) return; var g = String(c.portico);
        if (!por[g]) { por[g] = { id: g, pecas: [], info: null }; ordem.push(g); }
        por[g].pecas.push(String(c.id)); if (c.porticoInfo) por[g].info = c.porticoInfo;
      });
      return ordem.map(function (g) { var o = por[g]; o.n = o.pecas.length; return o; });
    },
    porticoSelecionado: function () {
      var U = MU(), ids = U && U.selecao ? U.selecao().map(String) : [], gs = this.porticos();
      var c = this.caixas().filter(function (x) { return x && x.portico && ids.indexOf(String(x.id)) >= 0; })[0];
      return c ? gs.filter(function (g) { return g.id === String(c.portico); })[0] || null : null;
    },

    /* ------------------------------------------------------------ diálogo */
    abrir: function (tipo, o) {
      var M = MP(); if (!M || !global.UI) return false;
      css(); o = o || {};
      var alvo = o.alvo || (o.novo ? null : this.porticoSelecionado());
      var par = alvo && alvo.info && alvo.info.par ? clone(alvo.info.par) : null;
      tipo = (alvo && alvo.info && alvo.info.tipo) || tipo || (this._ultimo && this._ultimo.tipo) || "alma-cheia-2";
      if (!par) par = this._ultimoPar && this._ultimoPar[tipo] ? clone(this._ultimoPar[tipo]) : M.padrao(tipo);
      this._dlg = { tipo: tipo, par: M.normalizar(tipo, par), alvo: alvo };
      var self = this, h = '<div class="mpo-dlg" data-modal-largo data-mpo="dlg"><div class="mpo-tipos" role="list" data-mpo="tipos">' + this.htmlTipos(tipo) + '</div><div class="mpo-campos" data-mpo="campos"></div>' +
        '<div class="mpo-lado"><div class="mpo-prev" data-mpo="previa"></div><p class="mpo-motor" data-mpo="motor"></p><ul class="mpo-nv" data-mpo="nv"></ul><p class="mpo-res" data-mpo="resumo"></p><p class="mpo-erro" data-mpo="erro" role="alert"></p><ul class="mpo-av" data-mpo="avisos"></ul>' +
        '<p class="muted" style="font-size:11px;margin:0">Os perfis são de <b>partida</b>: o cálculo confere todos e mostra o que não passa (e acha o mais leve, se pedido).</p></div></div>';
      var bts = [];
      if (alvo) bts.push({ texto: "Atualizar no lugar", classe: "primary", onClick: function () { self._confirmar(false, true); } });
      bts.push({ texto: "Criar e calcular", classe: alvo ? "" : "primary", onClick: function () { self._confirmar(true, !!alvo); } });
      if (!alvo) bts.push({ texto: "Criar no modelo", onClick: function () { self._confirmar(false, false); } });
      bts.push({ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); self._dlg = null; } });
      UI.modal(alvo ? "Pórtico da biblioteca — " + M.TIPOS[tipo].rotulo + " (" + alvo.n + " peças)" : "Pórticos industriais", h, bts);
      var raiz = document.querySelector('[data-mpo="dlg"]'); this._dlg.raiz = raiz;
      if (raiz) {
        raiz.addEventListener("click", function (ev) { var b = ev.target && ev.target.closest ? ev.target.closest("[data-mpo-tipo]") : null; if (b && !self._dlg.alvo) self.trocarTipo(b.getAttribute("data-mpo-tipo")); });
        var tm = null;
        raiz.addEventListener("input", function (ev) { if (ev.target && ev.target.closest && ev.target.closest('[data-mpo="campos"]')) { clearTimeout(tm); tm = setTimeout(function () { self.previa(); }, 200); } });
        raiz.addEventListener("change", function (ev) { if (ev.target && ev.target.closest && ev.target.closest('[data-mpo="campos"]')) self.previa(); });
      }
      this.desenharCampos(); this.previa();
      return true;
    },
    htmlTipos: function (sel) {
      var M = MP(), self = this;
      return M.ORDEM.map(function (t) {
        var T = M.TIPOS[t], nv = T.naoVerifica || [];
        return '<button type="button" class="mpo-tipo" role="listitem" data-mpo-tipo="' + t + '" aria-pressed="' + (t === sel) + '"' + (self._dlg && self._dlg.alvo && t !== sel ? " disabled" : "") + ">" + M.esquema(t, M.padrao(t), { w: 144, h: 80 }) +
          "<span><b>" + esc(T.rotulo) + "</b><small>" + esc(T.grupo) + '</small><span class="mpo-tag ' + T.motor + '">' + (T.motor === "galpao" ? "motor do galpão" : "estrutura desenhada") + "</span>" + (nv.length ? ' <span class="mpo-tag nv" title="' + esc(nv.join("; ")) + '">não verificado: ' + nv.length + "</span>" : "") + "</span></button>";
      }).join("");
    },
    trocarTipo: function (t) {
      var M = MP(), d = this._dlg; if (!M || !d || !M.TIPOS[t] || t === d.tipo) return;
      this._ultimoPar = this._ultimoPar || {}; this._ultimoPar[d.tipo] = this.ler();
      d.tipo = t; d.par = M.normalizar(t, this._ultimoPar[t] || M.padrao(t));
      var tp = d.raiz && d.raiz.querySelector('[data-mpo="tipos"]'); if (tp) Array.prototype.forEach.call(tp.querySelectorAll("[data-mpo-tipo]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mpo-tipo") === t)); });
      this.desenharCampos(); this.previa();
    },
    desenharCampos: function () {
      var d = this._dlg; if (!d || !d.raiz) return;
      var el = d.raiz.querySelector('[data-mpo="campos"]'), p = d.par, h = "";
      campos(d.tipo).forEach(function (c) {
        var id = c[0], v = p[id];
        h += "<label><span>" + esc(c[1]) + "</span>";
        if (c[2] === "sel") h += '<select data-mpo-c="' + id + '">' + c[3].map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? " selected" : "") + ">" + esc(op[1]) + "</option>"; }).join("") + "</select>";
        else if (c[2] === "cat") h += '<input data-mpo-c="' + id + '" list="mpo-dl-' + id + '" value="' + esc(v) + '" autocomplete="off" spellcheck="false"><datalist id="mpo-dl-' + id + '">' + datalist(c[3]).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
        else h += '<input data-mpo-c="' + id + '" inputmode="decimal" value="' + esc(v === "" || v == null ? "" : br(v, c[2] === "int" ? 0 : 3)) + '">';
        h += "</label>";
      });
      if (el) el.innerHTML = h;
    },
    ler: function () {
      var d = this._dlg; if (!d) return null;
      var p = clone(d.par), raiz = d.raiz; if (!raiz) return p;
      campos(d.tipo).forEach(function (c) {
        var el = raiz.querySelector('[data-mpo-c="' + c[0] + '"]'); if (!el) return;
        if (c[2] === "sel" || c[2] === "cat") p[c[0]] = String(el.value).trim();
        else { var s = String(el.value).trim(); if (s === "" && /^(rodaMax|rodaMin|rodaTransv|forcaLong|qInformado)$/.test(c[0])) p[c[0]] = ""; else { var v = num(s, NaN); if (isFinite(v)) p[c[0]] = v; } }
      });
      if (p.aguas != null) p.aguas = num(p.aguas, 2);
      return p;
    },
    previa: function () {
      var d = this._dlg, M = MP(); if (!d || !M || !d.raiz || !d.raiz.isConnected) return null;
      var p = this.ler(), T = M.TIPOS[d.tipo], el = function (s) { return d.raiz.querySelector('[data-mpo="' + s + '"]'); };
      var e = M.validar(d.tipo, p), m = e ? null : M.modelo(d.tipo, p);
      el("previa").innerHTML = M.esquema(d.tipo, p, { w: 320, h: 170 });
      el("motor").innerHTML = "<b>Cálculo:</b> " + (T.motor === "galpao" ? "motor do galpão (pórtico, terças, travessas, vento da NBR 6123, ligações e placas de base) — abre o Cálculo do galpão" : "estrutura desenhada (todas as barras, envoltório e vento da NBR 6123) — abre o Cálculo da estrutura desenhada");
      var nv = (T.naoVerifica || []).slice();
      if (d.tipo === "multivao" && p.cobertura !== "geminada") nv = [];
      if (d.tipo === "ponte" && num(p.rodaMax, 0) > 0) nv = nv.filter(function (x) { return !/sem as cargas/.test(x); });   /* com as cargas do fabricante a ponte entra */
      el("nv").innerHTML = nv.map(function (x) { return "<li>Não verificado: " + esc(x) + "</li>"; }).join("");
      el("erro").textContent = e || "";
      el("resumo").textContent = m && m.ok ? m.resumo : "";
      el("avisos").innerHTML = m && m.ok ? m.avisos.concat(m.decisoes).slice(0, 5).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") : "";
      d.parLido = p;
      return m;
    },
    _confirmar: function (calcular, atualizar) {
      var d = this._dlg, M = MP(); if (!d || !M) return false;
      var p = this.ler(), e = M.validar(d.tipo, p);
      if (e) { var er = d.raiz && d.raiz.querySelector('[data-mpo="erro"]'); if (er) er.textContent = e; return false; }
      this._ultimoPar = this._ultimoPar || {}; this._ultimoPar[d.tipo] = clone(p); this._ultimo = { tipo: d.tipo };
      UI.fecharModal();
      var tipo = d.tipo, alvo = atualizar ? d.alvo : null; this._dlg = null;
      return this.criar(tipo, p, { calcular: calcular, alvo: alvo });
    },

    /* ------------------------------------------------------------ criar (e calcular) */
    criar: function (tipo, par, op) {
      op = op || {};
      var M = MP(), U = MU(), self = this; if (!M || !U) { toast("O modelador da metálica não carregou.", "erro"); return null; }
      var T = M.TIPOS[tipo], p = M.normalizar(tipo, par);
      if (T.motor === "galpao") {
        var rg = U.gerarGalpao(M.parGalpaoBIM(tipo, p), {});
        if (!rg || !rg.ok) return rg;
        /* a alma cheia é um GALPÃO do assistente no modelo (caixa.galpao): o Cálculo do galpão o atualiza ("Atualizar o galpão no
           modelo"), sem marca própria da biblioteca */
        this.ultimo = { tipo: tipo, motor: "galpao", galpaoId: rg.galpaoId, resumo: rg.resumo };
        if (op.calcular && global.MetalCalcUI && MetalCalcUI.preparar) {
          /* o gerador do galpão abre a janela de avisos do modelador (Conferência — NBR 8800): no "Criar e calcular" ela ficaria
             por cima do cálculo — fecha e resume num aviso (a lista inteira continua em Ligações › Conferir furos) */
          var nAv = (rg.avisos || []).length + (rg.avisosLigacoes || []).length;
          if (nAv) { try { UI.fecharModal(); } catch (eF) {} toast(rg.resumo + ' — ' + nAv + ' aviso(s) do modelador: Ligações › Conferir furos lista cada um.', 'aviso', 9000); }
          MetalCalcUI.preparar({ geometria: { vao: p.vao, comprimento: p.comprimento, espacamento: p.espacamento, peDireito: p.peDireito, inclinacaoPct: p.inclinacao, aguas: p.aguas, base: p.base }, fechamento: p.fechamento, contraventamento: p.contraventamento, galpaoId: rg.galpaoId, modelo: null });
          MetalCalcUI.abrir(99);
          try { MetalCalcUI.calcular(); } catch (eC) {}
        }
        return rg;
      }
      var g = M.gerar(tipo, p, function () { return self.novoId(); }, { porticoId: op.alvo ? op.alvo.id : null });
      if (!g.ok) { toast(T.rotulo + ": " + g.motivo, "aviso", 9000); status(g.motivo); return g; }
      if (op.alvo) { g.op.ops = op.alvo.pecas.map(function (id) { return { op: "apagar", id: id }; }).concat(g.op.ops); g.op.pedido = "Atualizar o pórtico (" + op.alvo.n + " peças refeitas)"; }
      if (!U.enviar(g.op)) { toast("O editor recusou o pórtico.", "erro"); g.ok = false; return g; }
      this.ultimo = { tipo: tipo, motor: "livre", porticoId: g.porticoId, resumo: g.resumo, n: g.pecas.length, naoVerificados: g.naoVerificados };
      var tx = (op.alvo ? "Pórtico atualizado no lugar — " : "") + g.resumo + " Ctrl+Z desfaz.";
      status(tx); toast(tx, "ok", 9000);
      try { var PU = global.MetalProntasUI; if (PU && PU.enquadrar) { var fin = {}; g.pecas.forEach(function (c) { fin[c.id] = c; }); PU.enquadrar({ finais: fin }); } } catch (eE) {}
      if (op.calcular && global.MetalCalcLivreUI && MetalCalcLivreUI.preparar) {
        var pre = M.presetLivre(tipo, p, g, this.caixas());
        MetalCalcLivreUI.preparar(pre);
        MetalCalcLivreUI.abrir(3);
        try { MetalCalcLivreUI.calcular(); } catch (eL) {}
      }
      return g;
    }
  };
  global.MetalPorticosUI = MetalPorticosUI;
})(typeof window !== "undefined" ? window : this);
