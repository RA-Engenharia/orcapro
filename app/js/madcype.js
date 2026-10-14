/* =====================================================================
 * madcype.js — EXPORTAÇÃO DA ESTRUTURA DE MADEIRA PARA O CYPE 3D (motor
 * PURO, ES5, sem DOM, Node-testável).
 *
 *   MadCype.pacote(resultado, opcoes) → { arquivos: { nome: texto }, roteiro, series, liberacoes, cargas, avisos }
 *   resultado = MadDimensionar.calcular(...) (docs/madeira/CONTRATO.md)
 *
 * O CYPE 3D não tem API: importa SÓ nós e barras por arquivo de texto
 * (Geometria → Importar → Ficheiro de texto, um arquivo por etiqueta); o resto
 * (séries, materiais, liberações, apoios, cargas) é lançado nos diálogos — à
 * mão ou pelo motor de automação da RA (skill cype-motor). Por isso o pacote
 * leva: os c3d_<ETIQUETA>.txt (gerados pelo MadModelo, idênticos ao que a obra
 * já importou), a tabela de séries/materiais, as liberações por etiqueta, as
 * cargas por hipótese em tabela (barra a barra) e o ROTEIRO na ordem certa.
 *
 * MATERIAL NO CYPE: o CYPE 3D 2026.a usa a nomenclatura de classes da NBR
 * 7190:1997 (C 20…C 60 dicotiledôneas, C 20/25/30 coníferas) — foi assim nas
 * rodadas R00–V18 da obra. O sistema verifica pela 7190-1:2022 (fonte
 * secundária). O pacote diz as duas coisas: o material a escolher no CYPE e a
 * classe 2022 adotada no sistema; a diferença entre os dois cálculos é
 * esperada e vai no roteiro.
 * ⚠ Arquivos de texto em latin-1 com CRLF (o CYPE recusa UTF-8 com acento).
 * Teste: node tools/test-mad-cype.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var MadCype = {};

  /* classe 2022 adotada → material equivalente no CYPE (nomenclatura 1997), conservador */
  var MATERIAL_CYPE = {
    "nativa:D40": "Dicotiledônea C40, 2ª categoria", "nativa:D60": "Dicotiledônea C60, 2ª categoria",
    "nativa:D30": "Dicotiledônea C30, 2ª categoria", "nativa:D20": "Dicotiledônea C20, 2ª categoria",
    "peca:C20": "Conífera C20", "peca:C24": "Conífera C20", "peca:C30": "Conífera C30"
  };
  MadCype.MATERIAL_CYPE = MATERIAL_CYPE;

  var LIBERACAO = {
    LIG_ROT: "Articulação nos 2 planos no NÓ INICIAL (a rótula fica na peça de baixo — regra 2 — ou na que recebe — regra 3)",
    PE_PILAR: "Articulação nos 2 planos no nó inicial (pé do pilar, L01: uma barra colada não transmite momento)",
    APOIO_X: "Garfo no nó final: só o giro em torno de Y global livre (VP no pilarete, L09)",
    APOIO_Y: "Garfo no nó final: só o giro em torno de X global livre (VP no pilarete, L09)",
    GARFO_X: "Garfo no nó final: só o giro em torno de Y global livre (barrote do piso apoiado em cima de VP — torção travada pelo Painel Wall)",
    GARFO_Y: "Garfo no nó final: só o giro em torno de X global livre (barrote do piso apoiado em cima de VP — torção travada pelo Painel Wall)"
  };

  function num(x, n) { return (Math.round(x * Math.pow(10, n)) / Math.pow(10, n)).toFixed(n).replace(".", ","); }

  MadCype.pacote = function (r, opcoes) {
    opcoes = opcoes || {};
    var m = r.modelo || {}, mod = m.modelo, avisos = [];
    if (!m.textosCype || !mod) throw new Error("MadCype.pacote: resultado sem modelo.textosCype / modelo.modelo (rode o MadDimensionar)");
    var arquivos = {};
    Object.keys(m.textosCype).sort().forEach(function (k) { arquivos[k] = m.textosCype[k]; });

    /* séries e materiais por etiqueta */
    var nPorGrupo = {};
    mod.barras.forEach(function (b) { nPorGrupo[b.grupo] = (nPorGrupo[b.grupo] || 0) + 1; });
    var series = Object.keys(mod.secoes).map(function (g) {
      var s = mod.secoes[g], cl = s.classe || null;
      var matC = s.E_MPa && !cl ? (s.material || "aço genérico") : (MATERIAL_CYPE[cl] || s.material);
      if (cl && !MATERIAL_CYPE[cl]) avisos.push("Classe " + cl + " sem equivalente no CYPE: escolher manualmente para " + g + ".");
      return { etiqueta: g, barras: nPorGrupo[g] || 0, perfil: s.perfil || (s.b_cm + "x" + s.h_cm), b_cm: s.b_cm, h_cm: s.h_cm,
        especie: s.especie || null, classeSistema: cl, materialCype: matC, liberacao: LIBERACAO[g] || "contínua (nós rígidos)",
        arquivo: Object.keys(arquivos).filter(function (a) { return a.indexOf(g + ".txt") >= 0; })[0] || null };
    }).sort(function (a, b) { return a.etiqueta < b.etiqueta ? -1 : 1; });
    series.forEach(function (s) { if (!s.arquivo && s.barras) avisos.push("Etiqueta " + s.etiqueta + " sem arquivo c3d."); });

    /* cargas por hipótese (tabela que o motor de automação lança) */
    var hips = m.hipoteses || {}, cargas = [];
    (m.ops || []).forEach(function (o) {
      cargas.push({ hipotese: hips[String(o.hip)] || String(o.hip), tipo: o.tipo, direcao: o.dir, q: o.q != null ? o.q : null, F: o.F != null ? o.F : null,
        a: o.a != null ? o.a : null, barras: o.barras, grupo: o.grupo || null, origem: o.origem || "" });
    });
    var csv = ["hipotese;tipo;direcao;q_kN_m;F_kN;a_m;grupo;barras;origem"].concat(cargas.map(function (c) {
      return [c.hipotese, c.tipo, c.direcao, c.q == null ? "" : num(c.q, 3), c.F == null ? "" : num(c.F, 3), c.a == null ? "" : num(c.a, 3), c.grupo || "", c.barras.join(" "), c.origem].join(";");
    })).join("\r\n");
    arquivos["cargas_por_hipotese.csv"] = csv;
    arquivos["series_materiais.csv"] = ["etiqueta;barras;perfil;b_cm;h_cm;especie;classe_sistema_7190_2022;material_no_CYPE;liberacao;arquivo"].concat(series.map(function (s) {
      return [s.etiqueta, s.barras, s.perfil, s.b_cm, s.h_cm, s.especie || "", s.classeSistema || "", s.materialCype, s.liberacao, s.arquivo || ""].join(";");
    })).join("\r\n");

    var obra = (opcoes.obra && opcoes.obra.nome) || "obra";
    var linhas = [
      "# Roteiro — " + obra + " no CYPE 3D (gerado pelo OrçaPRO, " + (r.versao || "") + ")", "",
      "Recurso exclusivo: reservar o CYPE na RA-Central (`travar`) antes e `destravar` depois. Automação: skill **cype-motor** (sem mouse real).", "",
      "## 1. Obra nova e geometria",
      "- Unidades m / kN; norma de madeira NBR 7190 (o CYPE 2026.a usa a nomenclatura de 1997 — ver seção 2).",
      "- Geometria → Importar → Ficheiro de texto, um arquivo por etiqueta, NESTA ordem (nós repetidos se fundem pela coordenada):",
      series.filter(function (s) { return s.arquivo; }).map(function (s) { return "  - `" + s.arquivo + "` — " + s.barras + " barras"; }).join("\n"),
      "- Conferir: " + m.nos + " nós e " + m.barras + " barras (" + (m.placas || 0) + " placas de parede são lançadas à parte — seção 4).", "",
      "## 2. Séries e materiais (`series_materiais.csv`)",
      "| Etiqueta | Barras | Perfil | Espécie | Classe no sistema (7190-1:2022) | Material no CYPE |", "|---|---|---|---|---|---|",
      series.map(function (s) { return "| " + s.etiqueta + " | " + s.barras + " | " + s.perfil + " | " + (s.especie || "—") + " | " + (s.classeSistema || "—") + " | " + s.materialCype + " |"; }).join("\n"),
      "", "O CYPE verifica pela nomenclatura de 1997; o sistema pela 2022. Diferença de η entre os dois é esperada; o memorial do sistema é o que vale para a emissão — o CYPE é conferência.", "",
      "## 3. Liberações e apoios",
      series.filter(function (s) { return LIBERACAO[s.etiqueta]; }).map(function (s) { return "- **" + s.etiqueta + "** — " + s.liberacao; }).join("\n"),
      "- Apoios: nós do topo dos pilaretes (z = " + (mod.z_apoios != null ? num(mod.z_apoios, 3) : "?") + " m) engastados (o garfo está na barra APOIO).", "",
      "## 4. Paredes (placas)", "Cada trecho cheio de parede é uma placa entre o eixo do dormente e o da guia superior, com o E equivalente da chapa pregada (ver `placas` no resultado / memorial seção 8). Ligar SÓ pelos vértices.", "",
      "## 5. Hipóteses e cargas (`cargas_por_hipotese.csv`)",
      "- Hipóteses: " + Object.keys(hips).sort(function (a, b) { return a - b; }).map(function (k) { return k + " = " + hips[k]; }).join(", ") + ". Peso próprio automático, com a densidade do material — ⚠ o CYPE usa a densidade da classe; o sistema usa 10 kN/m³ (Itaúba/Tatajuba) e 6 kN/m³ (Pinus).",
      "- " + cargas.length + " operações de carga (uniforme/faixa/concentrada por barra).", "",
      "## 6. Depois de calcular",
      "- Comparar as reações por pilarete com `reacoesFundacao` do sistema (seção 10 do memorial): o esperado é ≤ 10 % nos casos de vento e sobrecarga.",
      "- Exportar o relatório em partes (o inteiro parava na p. 106 — rel_partes_v18.py)."
    ];
    if (avisos.length) linhas.push("", "## Avisos", avisos.map(function (a) { return "- " + a; }).join("\n"));
    var roteiro = linhas.join("\n");
    arquivos["ROTEIRO_CYPE.md"] = roteiro;
    return { arquivos: arquivos, roteiro: roteiro, series: series, liberacoes: LIBERACAO, cargas: cargas, avisos: avisos };
  };

  /** texto para gravar no disco do jeito que o CYPE aceita (latin-1, CRLF) — Node: Buffer.from(t, "latin1") */
  MadCype.paraLatin1 = function (t) { return String(t).replace(/\r?\n/g, "\r\n"); };

  if (typeof module !== "undefined" && module.exports) module.exports = MadCype;
  else global.MadCype = MadCype;
})(typeof window !== "undefined" ? window : this);
