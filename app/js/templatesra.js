/* =====================================================================
 * templatesra.js — TEMPLATES RA PRONTOS (.optpl) — B6, 08/10/2026
 *
 * O .optpl é o ".rte do OrçaPRO" (js/opformato.js): o ponto de partida de um
 * projeto. Até aqui ele levava níveis, famílias e o estilo das vistas 2D;
 * a B6 (PLANO-BIM-MODELADOR.md) pede também TIPOS DE PAREDE E DE LAJE,
 * MATERIAIS e o CARIMBO. Os campos novos entram no MESMO formato v1 (o
 * leitor passa adiante o que não conhece; arquivo antigo continua abrindo):
 *
 *   tiposParede [{ id, nome, base (id do js/alvtipos.js), nucleo?, espessura (m), altura (m), funcao }]
 *   tiposLaje   [{ id, nome, espessura (m), material, funcao }]
 *   materiais   [{ nome, cor "#rrggbb", classe, pesoEspecifico (kN/m³), fonte }]
 *   prancha     { formato, orientacao, carimbo {...}, coluna [{ titulo, itens }] }
 *               (o formato do js/prancha.js; o carimbo vai VAZIO de propósito:
 *                quem preenche é o cadastro da empresa na hora da prancha)
 *   familias    ids da biblioteca RA (js/familiasra.js) — viram as famílias
 *               inteiras no arquivo (TemplatesRA.obter resolve)
 *
 * ⚠ Nada aqui é dado de cliente nem preço. A espessura de cada tipo de parede
 *   é a SOMA DAS CAMADAS do js/alvtipos.js (tools/test-bim-b6.js recalcula e
 *   reprova se o número daqui divergir) — o template não inventa espessura.
 * ⚠ Níveis e alturas são PONTO DE PARTIDA editável (pé-direito 2,80 m é o
 *   usual em residência térrea; a obra ajusta no Navegador de projeto).
 * ===================================================================== */
(function (global) {
  "use strict";

  var NOTAS_RES = ["Cotas em metros, salvo indicação.", "Níveis em metros, referidos ao piso acabado do térreo (±0,00).",
    "Conferir as medidas na obra antes de executar."];
  var NOTAS_MAD = ["Cotas das plantas em centímetros; detalhes em milímetros.", "Níveis em metros.",
    "Madeira, ferragens e ligações conforme o memorial de cálculo da obra."];

  var LISTA = [
    {
      id: "ra-tpl-residencial-terreo", nome: "RA — Residencial térreo",
      descricao: "Casa térrea em alvenaria de vedação com laje e cobertura: níveis térreo/forro/cobertura, paredes de fachada, internas e de área molhada (camadas do js/alvtipos.js), lajes maciça e pré-moldada, esquadrias e louças da biblioteca RA, plantas e cortes em 1:50.",
      niveis: [
        { nome: "Térreo", elevacao: 0, corte: 1.2 },
        { nome: "Forro", elevacao: 2.8, corte: 1.2 },
        { nome: "Cobertura", elevacao: 2.9, corte: 1.2 }
      ],
      tiposParede: [
        { id: "res-fachada", nome: "Fachada · bloco 14", base: "ved-14-fachada", espessura: 0.197, altura: 2.8, funcao: "vedacao" },
        { id: "res-interna", nome: "Interna · bloco cerâmico 14", base: "cer-14-int", espessura: 0.192, altura: 2.8, funcao: "vedacao" },
        { id: "res-molhada", nome: "Área molhada · bloco 14 com cerâmica", base: "ved-14-molhada", espessura: 0.206, altura: 2.8, funcao: "vedacao" },
        { id: "res-divisoria", nome: "Divisória · bloco 9", base: "ved-9-int", espessura: 0.142, altura: 2.8, funcao: "vedacao" }
      ],
      tiposLaje: [
        { id: "laje-macica-10", nome: "Laje maciça 10 cm", espessura: 0.10, material: "Concreto", funcao: "forro" },
        { id: "laje-pre-12", nome: "Laje pré-moldada 12 cm", espessura: 0.12, material: "Concreto", funcao: "forro" },
        { id: "contrapiso-5", nome: "Contrapiso 5 cm", espessura: 0.05, material: "Argamassa", funcao: "piso" }
      ],
      materiais: [
        { nome: "Concreto", cor: "#a9b0b8", classe: "Concreto", pesoEspecifico: 25, fonte: "NBR 6120:2019 — concreto armado 25 kN/m³" },
        { nome: "Bloco cerâmico", cor: "#b5651d", classe: "Cerâmica", pesoEspecifico: 13, fonte: "NBR 6120:2019 — alvenaria de bloco cerâmico vazado ≈ 13 kN/m³ (js/alvtipos.js)" },
        { nome: "Argamassa", cor: "#c8c2b4", classe: "Concreto", pesoEspecifico: null, fonte: "camadas do js/alvtipos.js (peso por camada lá)" },
        { nome: "Madeira", cor: "#b88a5a", classe: "Madeira", pesoEspecifico: null, fonte: "cor do 3D do OrçaPRO" },
        { nome: "Alumínio", cor: "#c9ced6", classe: "Metal", pesoEspecifico: null, fonte: "cor do 3D do OrçaPRO" },
        { nome: "Vidro", cor: "#9fd3f0", classe: "Vidro", pesoEspecifico: null, fonte: "cor do 3D do OrçaPRO" },
        { nome: "Louça branca", cor: "#f4f4f2", classe: "Cerâmica", pesoEspecifico: null, fonte: "cor do 3D do OrçaPRO" }
      ],
      estilos2d: {
        planta: { escala: 50, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo", textoCota: 2.5, unidade: "m", casas: 2, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true, identAmbiente: true, esquemaCores: "nenhum" },
        corte: { escala: 50, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo", textoCota: 2.5, unidade: "m", casas: 2, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true, identAmbiente: true, esquemaCores: "nenhum" }
      },
      prancha: { formato: "A1", orientacao: "paisagem", carimbo: {}, coluna: [{ titulo: "Notas", itens: NOTAS_RES }] },
      familias: ["ra-porta-giro", "ra-porta-giro-2f", "ra-porta-correr", "ra-janela-correr", "ra-janela-basculante", "ra-bacia", "ra-lavatorio-coluna", "ra-tanque", "ra-bancada", "ra-caixa-dagua"]
    },
    {
      id: "ra-tpl-estrutura-madeira", nome: "RA — Estrutura de madeira",
      descricao: "Estrutura de madeira no padrão RA: peças serradas (vigas, barrotes, caibros) e pilares com as seções e espécies reais, piso seco em placa cimentícia de 40 mm, plantas em cm (1:50) e detalhes em mm (1:25), folha A1.",
      niveis: [
        { nome: "Piso (topo do barrote)", elevacao: 0, corte: 1.2 },
        { nome: "Respaldo", elevacao: 3.0, corte: 1.2 }
      ],
      tiposParede: [
        { id: "mad-vedacao-leve", nome: "Vedação leve · drywall 70", base: "crua", nucleo: "drywall_70", espessura: 0.095, altura: 3.0, funcao: "vedacao" }
      ],
      tiposLaje: [
        { id: "piso-seco-40", nome: "Piso seco · placa cimentícia 40 mm", espessura: 0.04, material: "Placa cimentícia", funcao: "piso" }
      ],
      materiais: [
        { nome: "Madeira", cor: "#b88a5a", classe: "Madeira", pesoEspecifico: 10, fonte: "NBR 6120:2019 Tab. 1 — tatajuba 10 kN/m³ (madeira_quiosque.json)" },
        { nome: "Madeira — Pinus CCA", cor: "#d9b77e", classe: "Madeira", pesoEspecifico: 6, fonte: "NBR 6120:2019 Tab. 1 — coníferas C30 6 kN/m³ (Pinus não listado: maior da classe)" },
        { nome: "Aço inox A4", cor: "#d0d4d8", classe: "Metal", pesoEspecifico: 80, fonte: "EN 10088-1 — 1.4401 (AISI 316), 8,0 kg/dm³ (ferragens.json)" },
        { nome: "Placa cimentícia", cor: "#b9bcbf", classe: "Concreto", pesoEspecifico: null, fonte: "conferir no catálogo do fabricante" },
        { nome: "Concreto", cor: "#a9b0b8", classe: "Concreto", pesoEspecifico: 25, fonte: "NBR 6120:2019 — concreto armado 25 kN/m³" }
      ],
      estilos2d: {
        planta: { escala: 50, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo", textoCota: 2.5, unidade: "cm", casas: 0, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true, identAmbiente: true, esquemaCores: "nenhum" },
        corte: { escala: 25, pena: "media", preenchimento: "hachura", cotas: true, marcaCota: "obliquo", textoCota: 2.5, unidade: "mm", casas: 0, cotaParcial: true, niveis: true, marcasCorte: true, titulo: true, identAmbiente: true, esquemaCores: "nenhum" }
      },
      prancha: { formato: "A1", orientacao: "paisagem", carimbo: {}, coluna: [{ titulo: "Notas", itens: NOTAS_MAD }] },
      familias: ["ra-madeira-viga", "ra-madeira-pilar", "ra-caixa-dagua", "ra-bombup230"]
    }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var TemplatesRA = {
    lista: function () { return LISTA.map(function (t) { return { id: t.id, nome: t.nome, descricao: t.descricao, familias: t.familias.length, tiposParede: t.tiposParede.length, niveis: t.niveis.length }; }); },
    /* o template inteiro, com as FAMÍLIAS resolvidas pela biblioteca RA
       (FamiliasRA no navegador; o require do Node nos testes) */
    obter: function (id, FamiliasRA) {
      var FR = FamiliasRA || global.FamiliasRA;
      var t = null; LISTA.forEach(function (x) { if (x.id === id) t = clone(x); });
      if (!t) return null;
      var faltam = [];
      t.familias = t.familias.map(function (fid) { var f = FR ? FR.obter(fid, true) : null;   /* template é do modelador: leva as famílias da prévia */ if (!f) faltam.push(fid); return f; }).filter(function (f) { return !!f; });
      if (faltam.length) t.familiasFaltando = faltam;
      return t;
    },
    /* o texto do .optpl (o mesmo gravador do "Salvar como template") */
    arquivo: function (id, meta, deps) {
      deps = deps || {};
      var OF = deps.OpFormato || global.OpFormato, t = this.obter(id, deps.FamiliasRA);
      if (!t || !OF) return null;
      return OF.templateParaArquivo(t, meta || { app: "OrçaPRO", autor: "RA Engenharia", descricao: t.descricao });
    }
  };
  global.TemplatesRA = TemplatesRA;
  if (typeof module !== "undefined" && module.exports) module.exports = TemplatesRA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
