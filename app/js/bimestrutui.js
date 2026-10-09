/* =====================================================================
 * bimestrutui.js — a TELA da P9 (prévia `?previa=modelador`): os comandos
 * novos na fita (Rampa e Escada em U na aba Arquitetura › Circulação;
 * Treliça na aba Estrutura) e as Propriedades da FERRAMENTA (rampa e
 * treliça). A geometria e o quantitativo moram no js/bimestrut.js (puro);
 * a escada em U usa a ferramenta Escada do js/bimarqui.js com a forma "U".
 *
 * Sem a prévia NADA daqui roda: quem chama `registrar` é o
 * BimArqUI.registrar, que já sai na hora sem ela.
 * ===================================================================== */
(function (global) {
  "use strict";
  function B() { return global.BIM; }
  function E() { return global.BimEstrut; }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? String(Math.round(x * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).replace(".", ",") : "—"; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }

  /* a configuração das ferramentas (o que a próxima peça leva) */
  var cfg = {
    /* rampa: NBR 9050 — 8,33 % (1:12), largura 1,20 m (mínima admissível), patamar 1,50 m */
    rampa: { desnivel: 0.5, inclinacao: 8.33, largura: 1.2, patamar: 1.5, espessura: 0.12, forma: "reta", giro: "direita", vao: 0, guarda: "dois" },
    /* treliça de madeira: tesoura, altura = vão/6 (vazio), 6 painéis, banzo 6 × 16 cm, alma 6 × 12 cm */
    trelica: { tipo: "tesoura", altura: null, paineis: 6, banzoB: 0.06, banzoH: 0.16, almaB: 0.06, almaH: 0.12 }
  };
  var arqUI = null;

  var BimEstrutUI = {
    cfg: function () { return cfg; },

    /* ------------------------------------------------------- a fita */
    registrar: function (reg, ui) {
      arqUI = ui || arqUI;
      var R = global.BimRibbon, self = this; if (!R || !E()) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Circulação", [
        { id: "rampa", rotulo: "Rampa", icone: "regua", grande: true, tipo: "alterna", dica: "Rampa pela NBR 9050: o desnível e a inclinação dão os segmentos (até 8,33 % — 1:12) e os patamares entre eles; reta ou em U; guarda-corpo com corrimão duplo (0,92 e 0,70 m). Volume, área de piso e percurso no quantitativo." },
        { id: "escada-u", rotulo: "Escada\nem U", icone: "niveis", grande: true, tipo: "alterna", dica: "Escada em U (patamar de meia-volta) pelas regras do tipo: o 2º lance volta paralelo ao 1º; o vão entre os lances (o poço) em Propriedades." }
      ]);
      R.acrescentar("estrutura", "Estrutura", "Elementos", [
        { id: "trelica", rotulo: "Treliça", icone: "estrutura", grande: true, tipo: "alterna", dica: "Treliça simples de madeira (tesoura ou banzos paralelos): dois cliques nos apoios. Banzos, montantes e diagonais viram vigas e pilares de madeira, com volume e orçamento." }
      ], "alvenaria");
      ["rampa", "escada-u", "trelica"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      function arma(sub, antes) {
        return function (e) {
          var b = B();
          if (e && e.ligado === false) { if (b && b.editarArmar) b.editarArmar(null); status("Ferramenta desligada."); return true; }
          if (antes) antes();
          return arqUI ? arqUI.armar(sub) : !!(b && b.editarArmar && b.editarArmar(sub));
        };
      }
      reg.rampa = arma("rampa");
      reg.trelica = arma("trelica");
      /* a Escada em U é a ferramenta Escada com a forma U (a escada reta/L continua no botão Escada) */
      reg["escada-u"] = arma("escada", function () { if (arqUI && arqUI.cfg) arqUI.cfg().escada.forma = "U"; });
      return true;
    },

    /* --------------------------------- Propriedades da FERRAMENTA */
    esquema: function (sub, ui) {
      arqUI = ui || arqUI;
      var self = this, M = E(), secs = [];
      if (arqUI && arqUI._secNivel) secs.push(arqUI._secNivel());
      if (sub === "rampa") {
        var r = cfg.rampa, k = M ? M.rampaCalc(r.desnivel, r) : null, ps = [];
        ps.push({ id: "b2f:rp:desnivel", rotulo: "Desnível", unidade: "m", tipo: "numero", passo: "0.01", valor: r.desnivel });
        ps.push({ id: "b2f:rp:inclinacao", rotulo: "Inclinação (até 8,33 %)", unidade: "%", tipo: "numero", passo: "0.01", valor: r.inclinacao });
        ps.push({ id: "b2f:rp:largura", rotulo: "Largura livre", unidade: "m", tipo: "numero", passo: "0.05", valor: r.largura });
        ps.push({ id: "b2f:rp:patamar", rotulo: "Comprimento do patamar", unidade: "m", tipo: "numero", passo: "0.05", valor: r.patamar });
        ps.push({ id: "b2f:rp:espessura", rotulo: "Espessura da laje", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round(r.espessura * 100) });
        ps.push({ id: "b2f:rp:forma", rotulo: "Forma", tipo: "lista", valor: r.forma, opcoes: [{ id: "reta", rotulo: "Reta (patamares em linha)" }, { id: "U", rotulo: "Em U (vai e volta)" }] });
        if (r.forma === "U") {
          ps.push({ id: "b2f:rp:giro", rotulo: "Volta para a", tipo: "lista", valor: r.giro, opcoes: [{ id: "direita", rotulo: "Direita" }, { id: "esquerda", rotulo: "Esquerda" }] });
          ps.push({ id: "b2f:rp:vao", rotulo: "Vão entre os segmentos", unidade: "m", tipo: "numero", passo: "0.05", valor: r.vao });
        }
        ps.push({ id: "b2f:rp:guarda", rotulo: "Guarda-corpo (corrimão 0,92 e 0,70 m)", tipo: "lista", valor: r.guarda, opcoes: [{ id: "dois", rotulo: "Nos dois lados" }, { id: "um", rotulo: "Só de um lado" }, { id: "nenhum", rotulo: "Nenhum" }] });
        secs.push({ nome: "Rampa", params: ps });
        var pc = [];
        if (k && k.ok) {
          pc.push(ro("b2f:rp:seg", "Segmentos", k.segmentos + " de " + n2(k.comprimentoSegmento) + " m (" + n2(k.h * 100, 1) + " cm de desnível cada)"));
          pc.push(ro("b2f:rp:faixa", "Faixa da NBR 9050", "inclinação " + k.faixa + ": até " + n2(k.hMax) + " m por segmento"));
          if (k.avisos.length) pc.push(ro("b2f:rp:av", "Atenção", k.avisos.join(" ")));
          pc.push(ro("b2f:rp:conf", "Conferir", k.conferir.join(" ")));
        } else pc.push(ro("b2f:rp:erro", "Não dá", k ? k.motivo : "motor da rampa não carregado"));
        secs.push({ nome: "NBR 9050 (regras)", params: pc });
      } else if (sub === "trelica") {
        var t = cfg.trelica, pt = [];
        pt.push({ id: "b2f:tr:tipo", rotulo: "Tipo", tipo: "lista", valor: t.tipo, opcoes: [{ id: "tesoura", rotulo: "Tesoura (duas águas)" }, { id: "paralela", rotulo: "Banzos paralelos" }] });
        pt.push({ id: "b2f:tr:altura", rotulo: "Altura no meio (vazio = vão ÷ 6)", unidade: "m", tipo: "numero", passo: "0.05", valor: t.altura > 0 ? t.altura : "" });
        pt.push({ id: "b2f:tr:paineis", rotulo: "Painéis (par)", tipo: "numero", passo: "2", valor: t.paineis });
        pt.push({ id: "b2f:tr:banzoB", rotulo: "Banzo: largura", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(t.banzoB * 1000) / 10 });
        pt.push({ id: "b2f:tr:banzoH", rotulo: "Banzo: altura", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(t.banzoH * 1000) / 10 });
        pt.push({ id: "b2f:tr:almaB", rotulo: "Montante e diagonal: largura", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(t.almaB * 1000) / 10 });
        pt.push({ id: "b2f:tr:almaH", rotulo: "Montante e diagonal: altura", unidade: "cm", tipo: "numero", passo: "0.5", valor: Math.round(t.almaH * 1000) / 10 });
        pt.push(ro("b2f:tr:nota", "Apoio", "o banzo inferior nasce no topo da parede (plano de trabalho + altura do editor)"));
        secs.push({ nome: "Treliça de madeira", params: pt });
      }
      return { titulo: "Ferramenta: " + (sub === "rampa" ? "Rampa" : "Treliça"), icone: "quadrado", semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudar(sub, pid, valor); } };
    },
    mudar: function (sub, pid, valor) {
      var k = String(pid).replace(/^b2f:/, ""), num = parseFloat(String(valor).replace(",", "."));
      if (k === "nivel" && arqUI && arqUI.mudarFerramenta) return arqUI.mudarFerramenta(sub, pid, valor);
      if (k.indexOf("rp:") === 0) {
        var c = k.slice(3), r = cfg.rampa;
        if (c === "forma") r.forma = valor === "U" ? "U" : "reta";
        else if (c === "giro") r.giro = valor === "esquerda" ? "esquerda" : "direita";
        else if (c === "guarda") r.guarda = valor === "um" || valor === "nenhum" ? valor : "dois";
        else if (c === "espessura" && isFinite(num) && num > 0) r.espessura = num / 100;
        else if (isFinite(num) && num >= 0 && (c === "desnivel" || c === "inclinacao" || c === "largura" || c === "patamar" || c === "vao")) r[c] = num;
      } else if (k.indexOf("tr:") === 0) {
        var ct = k.slice(3), t = cfg.trelica;
        if (ct === "tipo") t.tipo = valor === "paralela" ? "paralela" : "tesoura";
        else if (ct === "altura") t.altura = isFinite(num) && num > 0 ? num : null;
        else if (ct === "paineis" && isFinite(num)) t.paineis = Math.max(2, Math.round(num / 2) * 2);
        else if (isFinite(num) && num > 0 && /^(banzo|alma)[BH]$/.test(ct)) t[ct] = num / 100;
      }
      try { if (global.BimShell) BimShell.pintarProps(this.esquema(sub)); } catch (e) {}
      return true;
    },

    /* --------------------------------- o clique (js/bim.js, bloco P9)
     * ini, p2: os dois cliques ({x, z}); ctx = { base, alt, nivel, novoId }.
     * Devolve { ok, op (lote), resumo } ou { ok:false, motivo }. Puro: o
     * teste chama direto. */
    criar: function (sub, ini, p2, ctx) {
      var M = E(); ctx = ctx || {};
      if (!M) return { ok: false, motivo: "O motor da estrutura (js/bimestrut.js) não carregou." };
      if (sub === "rampa") {
        var r = cfg.rampa, ang = Math.atan2(p2.z - ini.z, p2.x - ini.x);
        if (Math.sqrt(Math.pow(p2.x - ini.x, 2) + Math.pow(p2.z - ini.z, 2)) < 0.05) return { ok: false, motivo: "Clique a direção um pouco mais longe do primeiro ponto." };
        var k = M.rampaCalc(r.desnivel, r); if (!k.ok) return { ok: false, motivo: k.motivo };
        var rp = M.rampa({ x: ini.x, z: ini.z, ang: ang, base: ctx.base || 0, desnivel: r.desnivel, largura: r.largura, inclinacao: r.inclinacao, espessura: r.espessura, patamar: r.patamar, forma: r.forma, giro: r.giro, vao: r.vao, guarda: r.guarda, nivelId: ctx.nivel ? ctx.nivel.id : null });
        if (!rp) return { ok: false, motivo: "Parâmetros da rampa inválidos (largura 0,80 a 6 m, espessura 6 a 40 cm)." };
        var lote = M.opsRampa(rp, ctx.novoId, { guarda: r.guarda });
        var c = rp.rampa.calc, nG = lote.ops.length - 1;
        return { ok: true, op: lote, peca: rp, resumo: "Rampa " + n2(c.inclinacao) + " %: " + c.segmentos + " segmento(s) de " + n2(c.comprimentoSegmento) + " m, " + (c.segmentos - 1) + " patamar(es) de " + n2(c.patamar) + " m; " +
          n2(rp.medidas.volume, 3) + " m³, " + n2(rp.medidas.area) + " m² de piso" + (nG ? ", " + nG + " guarda-corpo(s) com corrimão duplo" : "") + "." + (c.avisos.length ? " " + c.avisos.join(" ") : "") + " Limites da NBR 9050 a conferir." };
      }
      if (sub === "trelica") {
        var t = cfg.trelica, L = Math.sqrt(Math.pow(p2.x - ini.x, 2) + Math.pow(p2.z - ini.z, 2));
        var o = { tipo: t.tipo, altura: t.altura > 0 ? t.altura : Math.max(0.3, Math.round(L / 6 * 100) / 100), paineis: t.paineis, base: (ctx.base || 0) + (ctx.alt || 0),
                  banzo: { b: t.banzoB, h: t.banzoH }, alma: { b: t.almaB, h: t.almaH }, nivelId: ctx.nivel ? ctx.nivel.id : null };
        var rt = M.opsTrelica({ x: ini.x, z: ini.z }, { x: p2.x, z: p2.z }, o, ctx.novoId);
        if (!rt.ok) return { ok: false, motivo: rt.motivo };
        var tr = rt.trelica;
        return { ok: true, op: rt.op, resumo: "Treliça " + (tr.tipo === "tesoura" ? "tesoura" : "de banzos paralelos") + ": vão " + n2(tr.vao) + " m, altura " + n2(tr.altura) + " m, " + tr.barras.length + " barras (" + n2(tr.comprimento) + " m de madeira)." };
      }
      return { ok: false, motivo: "Ferramenta desconhecida: " + sub + "." };
    }
  };

  global.BimEstrutUI = BimEstrutUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEstrutUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
