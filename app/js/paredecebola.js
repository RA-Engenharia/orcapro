/* =====================================================================
 * paredecebola.js — "Parede-Cebola" (Fase B do BIM 2D→obra real)
 *
 * Uma parede no orçamento é UMA linha (m² de alvenaria), mas na obra real
 * ela é um EMPILHAMENTO de camadas: bloco → chapisco → emboço/reboco →
 * massa → pintura/revestimento, em 1 ou 2 faces. Este motor EXPLODE a
 * parede (área + config) nessas camadas de serviço, cada uma com:
 *   - quantidade calculada da geometria (área × faces × fator);
 *   - código SINAPI REAL, casado pelo Escopo Inteligente (nunca inventado);
 *   - sequência de execução; e "pendente" honesto quando não há match.
 *
 * Grounded, NÃO inventa: o código de cada camada sai de Escopo.analisarItensIA
 * (Bases/Sinapi). Quantidade sai da geometria. Se a unidade do código casado
 * divergir da esperada (m²), a camada é marcada "revisar" — nunca aplica m²
 * num código de m³ silenciosamente.
 *
 * Lógica pura/testável (Node). Deps injetáveis via ParedeCebola._deps.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (typeof Util !== "undefined" && Util.num) return Util.num(v);
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(s) || 0;
  }
  function fix(s) { return (typeof Util !== "undefined" && Util.fixEnc) ? Util.fixEnc(String(s == null ? "" : s)) : String(s == null ? "" : s); }
  function norm(s) { return fix(s).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
  function round2(n) { return Math.round(num(n) * 100) / 100; }

  var ParedeCebola = {
    _deps: { Escopo: null },
    _E: function () { return this._deps.Escopo || (typeof global !== "undefined" && global.Escopo) || (typeof Escopo !== "undefined" ? Escopo : null); },

    DEFAULTS: {
      faces: 2,                 // faces a revestir (1 = só uma face; 2 = ambas)
      receita: "interna_pintura",
      incluiAlvenaria: true     // se a linha de origem JÁ é a alvenaria, desligue p/ não dupla-contar
    },

    // ---- dicionário de camadas (EDITÁVEL) --------------------------------
    // Cada camada: termo de busca (p/ o Escopo casar o SINAPI), unidade esperada,
    // porFace (a qtd escala com o nº de faces?), e a ordem de execução (seq).
    // "so": restringe a camada a interna/externa (opcional).
    RECEITAS: {
      interna_pintura: {
        rotulo: "Parede interna · reboco + pintura",
        camadas: [
          { camada: "Alvenaria de vedação", termo: "alvenaria vedacao bloco ceramico", un: "M2", porFace: false, seq: 1, base: true },
          { camada: "Chapisco", termo: "chapisco argamassa parede", un: "M2", porFace: true, seq: 2 },
          { camada: "Massa única (reboco)", termo: "massa unica parede argamassa", un: "M2", porFace: true, seq: 3 },
          { camada: "Massa corrida PVA", termo: "massa corrida pva parede", un: "M2", porFace: true, seq: 4 },
          { camada: "Pintura látex", termo: "pintura latex acrilica parede", un: "M2", porFace: true, seq: 5 }
        ]
      },
      externa_pintura: {
        rotulo: "Parede externa · emboço + pintura acrílica",
        camadas: [
          { camada: "Alvenaria de vedação", termo: "alvenaria vedacao bloco ceramico", un: "M2", porFace: false, seq: 1, base: true },
          { camada: "Chapisco", termo: "chapisco argamassa parede", un: "M2", porFace: true, seq: 2 },
          { camada: "Emboço / massa única", termo: "emboco reboco parede argamassa", un: "M2", porFace: true, seq: 3 },
          { camada: "Pintura acrílica", termo: "pintura acrilica parede", un: "M2", porFace: true, seq: 4 }
        ]
      },
      ceramica: {
        rotulo: "Área molhada · revestimento cerâmico",
        camadas: [
          { camada: "Alvenaria de vedação", termo: "alvenaria vedacao bloco ceramico", un: "M2", porFace: false, seq: 1, base: true },
          { camada: "Chapisco", termo: "chapisco argamassa parede", un: "M2", porFace: true, seq: 2 },
          { camada: "Emboço", termo: "emboco reboco parede argamassa", un: "M2", porFace: true, seq: 3 },
          { camada: "Revestimento cerâmico", termo: "revestimento ceramico parede", un: "M2", porFace: true, seq: 4 }
        ]
      }
    },

    receitas: function () {
      var self = this, out = [];
      Object.keys(this.RECEITAS).forEach(function (k) { out.push({ id: k, rotulo: self.RECEITAS[k].rotulo }); });
      return out;
    },

    // ---- MOTOR: explode a parede em camadas (puro, não muta orçamento) ---
    // parede = { nome, area | (comprimento & altura), descontos(m² de vãos),
    //            faces, receita, incluiAlvenaria }
    // Retorna { parede:{..., areaLiquida}, receita, camadas:[...], nOk, nPendentes, nRevisar }
    explodir: function (parede, override) {
      parede = parede || {};
      var p = {};
      for (var k in this.DEFAULTS) p[k] = this.DEFAULTS[k];
      ["faces", "receita", "incluiAlvenaria"].forEach(function (kk) { if (parede[kk] != null) p[kk] = parede[kk]; });
      if (override) for (k in override) if (override[k] != null) p[k] = override[k];

      var faces = Math.max(1, Math.round(num(p.faces)) || 2);
      // geometria: área líquida = (área OU comprimento×altura) − vãos
      var areaBruta = num(parede.area) > 0 ? num(parede.area) : (num(parede.comprimento) * num(parede.altura));
      var areaLiquida = Math.max(0, round2(areaBruta - num(parede.descontos)));

      var receita = this._receita(p.receita);
      var especs = [];
      receita.camadas.forEach(function (c) {
        if (c.base && !p.incluiAlvenaria) return;                 // não dupla-conta a alvenaria de origem
        if (c.so && norm(c.so) !== norm(p.receita.indexOf("externa") >= 0 ? "externa" : "interna")) return;
        var qtd = round2(areaLiquida * (c.porFace ? faces : 1));
        especs.push({ c: c, qtd: qtd, termoOk: !!(c.termo && String(c.termo).trim()) });
      });

      // casa cada camada no SINAPI pelo caminho FUNDAMENTADO (nunca inventa código).
      // Só manda ao Escopo as camadas com TERMO — analisarItensIA DROPA descrição vazia
      // (encolhe o array), então mapear por índice posicional cruzaria código na camada
      // errada se uma receita (editável) tivesse termo em branco. Consumo em ordem (bi++).
      var itens = [];
      especs.forEach(function (es) { if (es.termoOk) itens.push({ etapa: parede.nome || "Parede", descricao: es.c.termo, unidade: es.c.un, quantidade: es.qtd }); });
      var E = this._E();
      var linhas = (E && E.analisarItensIA) ? E.analisarItensIA(itens) : [];

      var camadas = [], nOk = 0, nPend = 0, nRev = 0, nZero = 0, bi = 0;
      especs.forEach(function (es, i) {
        var l = es.termoOk ? (linhas[bi++] || { candidatos: [], escolhido: -1, status: "pendente" }) : { candidatos: [], escolhido: -1, status: "pendente" };
        var cand = (l.escolhido != null && l.escolhido >= 0) ? l.candidatos[l.escolhido] : null;
        // checagem de UNIDADE: código casado tem que ser da mesma unidade da camada (m²),
        // senão aplicar a qtd (m²) num código de m³/m dá número errado silencioso -> "revisar".
        var status = l.status || (cand ? "ok" : "pendente");
        var unidadeDivergente = false;
        if (cand && cand.item && norm(cand.item.unidade) !== norm(es.c.un)) { unidadeDivergente = true; status = "revisar"; }
        var qtdZero = !(num(es.qtd) > 0);   // área líquida 0 (vãos ≥ área) -> camada NÃO aplicável
        // "aplicável" = casou (ok) E tem quantidade. Só isso conta como nOk (o botão promete o real).
        if (qtdZero) nZero++; else if (status === "ok") nOk++; else if (status === "revisar") nRev++; else nPend++;
        camadas.push({
          camada: es.c.camada, seq: es.c.seq, base: !!es.c.base, porFace: !!es.c.porFace,
          descricao: es.c.termo, unidade: es.c.un, quantidade: es.qtd,
          status: status, unidadeDivergente: unidadeDivergente, qtdZero: qtdZero,
          candidatos: l.candidatos || [], escolhido: (l.escolhido != null ? l.escolhido : -1),
          confianca: cand ? num(cand.confianca) : 0, fonte: cand ? (cand.fonte || "SINAPI") : null
        });
      });
      camadas.sort(function (a, b) { return a.seq - b.seq; });

      return {
        parede: { nome: parede.nome || "Parede", areaBruta: round2(areaBruta), descontos: round2(num(parede.descontos)), areaLiquida: areaLiquida, faces: faces },
        receita: { id: p.receita, rotulo: receita.rotulo }, incluiAlvenaria: !!p.incluiAlvenaria,
        camadas: camadas, nCamadas: camadas.length, nOk: nOk, nRevisar: nRev, nPendentes: nPend, nZerados: nZero
      };
    },

    // ---- aplica no orçamento (efeito): só camadas com match OK viram item --
    // Cada camada pendente/revisar NÃO entra (o usuário resolve antes) — nunca
    // adiciona código inventado nem qtd numa unidade errada. Retorna resumo.
    aplicarNoOrcamento: function (orc, etapaId, camadas, opts) {
      opts = opts || {};
      if (!orc || typeof Orcamento === "undefined" || !Orcamento.addItem) return { adicionadas: 0, puladas: (camadas || []).length };
      var incluirRevisar = !!opts.incluirRevisar; // por padrão NÃO aplica os de unidade divergente
      var add = 0, pulou = 0;
      (camadas || []).slice().sort(function (a, b) { return a.seq - b.seq; }).forEach(function (c) {
        var ok = c.status === "ok" || (incluirRevisar && c.status === "revisar");
        var cand = (c.escolhido != null && c.escolhido >= 0 && c.candidatos) ? c.candidatos[c.escolhido] : null;
        // pula qtd ≤ 0 — addItem coage Util.num(0)||1 = 1, FABRICANDO 1 m² que o usuário não digitou
        // (vãos ≥ área). atualizarItem já rejeita ≤0; addItem não, então o guard fica aqui.
        if (!ok || !cand || !cand.item || !(num(c.quantidade) > 0)) { pulou++; return; }
        var item = {};
        for (var kk in cand.item) item[kk] = cand.item[kk];
        item.baseFonte = cand.fonte || item.baseFonte || "SINAPI";
        Orcamento.addItem(orc, etapaId, item, c.quantidade);
        add++;
      });
      return { adicionadas: add, puladas: pulou };
    },

    _receita: function (id) {
      return this.RECEITAS[id] || this.RECEITAS[this.DEFAULTS.receita];
    }
  };

  global.ParedeCebola = ParedeCebola;
  if (typeof module !== "undefined" && module.exports) module.exports = ParedeCebola;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
