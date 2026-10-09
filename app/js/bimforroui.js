/* =====================================================================
 * bimforroui.js — a TELA do FORRO (P2-B, prévia `?previa=modelador`).
 *
 * O motor é o js/bimforro.js (puro). Aqui só: o comando "Forro" na aba
 * Arquitetura da fita (Ribbon.acrescentar, painel "Modelador"), as
 * Propriedades da FERRAMENTA (tipo, desenho automático/contorno, altura do
 * deslocamento do nível, inclinação) e a op que a ferramenta manda para o
 * editor (criar). Quem coleta o clique é o js/bim.js (gancho "P2-B" no
 * bloco B2 — MODELADOR); quem chama `registrar` e `esquema` é o
 * js/bimarqui.js (ganchos "P2-B"). As Propriedades da PEÇA vêm do registro
 * (js/bimparam.js, categoria forro) pela paleta da P1-C (js/bimpropsui.js).
 *
 * Sem a prévia NADA daqui roda: `registrar` sai na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function F() { return global.BimForro || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }
  function num(v, d) { var x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; }

  /* a ferramenta: automático (um clique dentro da sala) ou contorno (os cantos) */
  var cfg = { modo: "automatico", tipoId: "gesso-12_5", deslocNivel: 2.6, inclinacao: 0, dirInclinacao: 0 };

  var BimForroUI = {
    ativo: previa,
    cfg: function () { return JSON.parse(JSON.stringify(cfg)); },

    /* a fita (chamado pelo BimArqUI.registrar). opts.previa: o teste em Node
       passa explícito; na tela vale a prévia do aparelho. */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !F() || !reg) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Modelador", [
        { id: "forro", rotulo: "Forro", icone: "camadas", grande: true, tipo: "alterna",
          dica: "Forro: AUTOMÁTICO (um clique dentro da sala fechada por paredes — o contorno sai das faces e acompanha se a parede andar) ou pelo CONTORNO (clique os cantos). Gesso 12,5 mm ou PVC 8 mm, a 2,60 m do nível; área, perímetro (tabica) e volume no quantitativo." }
      ]);
      if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf("forro") < 0) R._EXCLUSIVOS.push("forro");
      reg.forro = function (e) {
        if (e && e.ligado === false) { var b = global.BIM; if (b && b.editarArmar) b.editarArmar(null); return true; }
        return arqui && arqui.armar ? arqui.armar("forro") : false;
      };
      return true;
    },

    /* a op de um forro novo pelo que a ferramenta coletou, CONFERIDA antes
       (o automático sem sala fechada não vira op: a tela diz o motivo).
       dados = { contorno:[{x,z}] } | { ponto:{x,z} }; nivel = o nível ativo
       ({id, elevacao}) ou null; base = a cota do plano de trabalho (obra sem
       níveis); niveis = os da obra (para a conferência).
       → { ok, op, forro, resumo } | { ok:false, motivo } */
    criar: function (estado, dados, nivel, base, id, niveis) {
      var M = F(); if (!M) return { ok: false, motivo: "O motor do forro (js/bimforro.js) não carregou." };
      var d = { tipoId: cfg.tipoId, deslocNivel: cfg.deslocNivel };
      if (cfg.inclinacao > 0) { d.inclinacao = cfg.inclinacao; d.dirInclinacao = cfg.dirInclinacao; }
      if (dados && dados.contorno) d.contorno = dados.contorno; else if (dados && dados.ponto) d.ponto = dados.ponto;
      else return { ok: false, motivo: "Clique dentro da sala ou os cantos do forro." };
      if (nivel && nivel.id != null) { d.nivelId = String(nivel.id); d.base = +nivel.elevacao || 0; }
      else d.base = +base || 0;
      var op = M.op(id, d);
      if (!op) return { ok: false, motivo: "Forro inválido: confira o contorno e as Propriedades." };
      var f = M.calcular(op, estado || { caixas: [] }, niveis || (nivel ? [{ id: nivel.id, elevacao: +nivel.elevacao || 0 }] : []));
      if (!f.ok) return { ok: false, motivo: (f.avisos || []).join(" ") || "Não deu para montar o forro." };
      return { ok: true, op: op, forro: f,
               resumo: "Forro (" + f.tipoForro.rotulo + "): " + n2(f.area) + " m², perímetro " + n2(f.perimetro) + " m, face de baixo a " + n2(f.cota) + " m" +
                       (f.furos.length ? ", " + f.furos.length + " furo" + (f.furos.length > 1 ? "s" : "") : "") + (f.avisos ? ". " + f.avisos.join(" ") : "") + "." };
    },

    /* Propriedades da FERRAMENTA (chamado pelo BimArqUI.esquemaFerramenta) */
    esquema: function (arqui) {
      var M = F(); if (!M) return null;
      var self = this, t = M.tipo(cfg.tipoId), secs = [];
      if (arqui && arqui._secNivel) secs.push(arqui._secNivel());
      secs.push({ nome: "Forro", params: [
        { id: "b2f:fo:tipoId", rotulo: "Tipo", tipo: "lista", valor: t.id, opcoes: M.TIPOS.map(function (x) { return { id: x.id, rotulo: x.rotulo }; }) },
        { id: "b2f:fo:modo", rotulo: "Desenho", tipo: "lista", valor: cfg.modo, opcoes: [{ id: "automatico", rotulo: "Automático — clique dentro da sala" }, { id: "contorno", rotulo: "Contorno — clique os cantos" }] },
        { id: "b2f:fo:deslocNivel", rotulo: "Altura do deslocamento do nível", unidade: "m", tipo: "numero", passo: "0.01", valor: cfg.deslocNivel },
        { id: "b2f:fo:inclinacao", rotulo: "Inclinação (0 = plano)", unidade: "graus", tipo: "numero", passo: "1", valor: cfg.inclinacao },
        { id: "b2f:fo:dirInclinacao", rotulo: "Direção da subida (0 = +X, 90 = +Z)", unidade: "graus", tipo: "numero", passo: "15", valor: cfg.dirInclinacao },
        ro("b2f:fo:esp", "Espessura (soma das camadas)", n2(t.espessura * 1000, 1) + " mm")
      ] });
      secs.push({ nome: "Camadas", params: t.camadas.map(function (k, i) { return ro("b2f:fo:cam" + i, k.rotulo + (k.material ? " · " + k.material : ""), n2(k.e * 1000, 1) + " mm"); }) });
      return { titulo: "Ferramenta: Forro", icone: "camadas", semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudar(pid, valor, arqui); } };
    },
    mudar: function (pid, valor, arqui) {
      var k = String(pid).replace(/^b2f:/, ""), M = F();
      if (k === "nivel" && arqui && arqui.mudarFerramenta) return arqui.mudarFerramenta("forro", pid, valor);
      if (k === "fo:tipoId" && M && M.tipo(valor).id === String(valor)) cfg.tipoId = String(valor);
      else if (k === "fo:modo") cfg.modo = valor === "contorno" ? "contorno" : "automatico";
      else if (k === "fo:deslocNivel") { var dv = num(valor, cfg.deslocNivel); if (Math.abs(dv) <= 200) cfg.deslocNivel = dv; }
      else if (k === "fo:inclinacao") { var iv = num(valor, 0); cfg.inclinacao = Math.max(0, Math.min(60, iv)); }
      else if (k === "fo:dirInclinacao") cfg.dirInclinacao = num(valor, 0);
      return this.esquema(arqui);   /* a casca (BimShell) repinta com o esquema novo */
    }
  };

  global.BimForroUI = BimForroUI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimForroUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
