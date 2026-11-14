/* =====================================================================
 * mor/catalogo-dados/coerencia.js — F11: REGRAS DE COERÊNCIA (ESPEC §15 item 5)
 *
 * DADO, não código. Cada regra diz: «se o orçamento tem um item GATILHO, tem de ter também um item PAR; senão, AVISO».
 * O aviso só avisa: nada é lançado, nada é somado (quem decide é o orçamentista — alvenaria aparente, piso sobre
 * laje já regularizada, instalação aparente etc. existem).
 *
 * Como um item casa com `se` / `exige`:
 *   chaves  ids do catálogo no formato «etapaId.chave» (o mesmo de `item.mor.regra`; ver catalogo-dados/etapas-*.js);
 *   texto   expressão regular (fonte, sem barras) aplicada à DESCRIÇÃO do item normalizada (minúscula, sem acento) —
 *           é o que pega o item que veio da base/lançado à mão sem passar pelo catálogo.
 * Basta UM dos dois casar. tools/test-mor-f11.js confere que toda chave citada aqui existe no catálogo.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  D.coerencia = [
    {
      id: "alvenaria-revestimento",
      se: { chaves: ["alvenaria.alvenaria", "muro.muroAlvenaria"], texto: "^alvenaria" },
      exige: { chaves: ["revestimento.massaInt", "revestimento.emboco", "revestimento.massaExt", "murorev.muroChapisco", "murorev.muroMassa"], texto: "chapisco|reboco|emboco|massa unica" },
      aviso: "Há alvenaria, mas nenhum chapisco/reboco/emboço/massa única. Se a parede é aparente, ignore; senão falta o revestimento."
    },
    {
      id: "telha-estrutura",
      se: { chaves: ["cobertura.telhaCer", "cobertura.telhaConc", "cobertura.telhaFibro", "cobertura.telhaMet"], texto: "^telhamento|^telha " },
      exige: { chaves: ["cobertura.tramaMadeira", "cobertura.tramaMadeiraTerca", "cobertura.tesouraMadeira", "cobertura.tramaAcoCer", "cobertura.tramaAcoConc", "cobertura.tramaAcoOnd", "cobertura.tesouraAco", "estmetal.estruturaAco"], texto: "trama|tesoura|caibro|ripa|terca|engradamento|estrutura (de |em )?(madeira|aco|metalica)" },
      aviso: "Há telha, mas nenhuma estrutura de apoio (trama, tesoura, caibro, ripa, terça). Se a estrutura vem em outro pacote, ignore."
    },
    {
      id: "piso-contrapiso",
      se: { chaves: ["pisos.pisoPorc", "pisos.pisoCer"], texto: "^revestimento ceramico (para )?piso|^piso (ceramic|porcelanat|vinilic|laminad)|^porcelanato" },
      exige: { chaves: ["pisos.contrapiso"], texto: "contrapiso|camada regularizadora|regularizacao de piso" },
      aviso: "Há piso de acabamento, mas nenhum contrapiso/camada regularizadora. Se a base já vem regularizada (laje nivelada, piso industrial), ignore."
    },
    {
      id: "tomada-eletroduto",
      se: { chaves: ["eletrica.tomada"], texto: "^tomada" },
      exige: { chaves: ["eletrica.eletroduto"], texto: "eletroduto|conduite|canaleta" },
      aviso: "Há tomada, mas nenhum eletroduto/conduíte/canaleta para levar o fio. Se a instalação é de outro contratado, ignore."
    }
  ];
})(typeof window !== "undefined" ? window : globalThis);
