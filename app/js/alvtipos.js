/* =====================================================================
 * alvtipos.js — TIPO DE PAREDE: as camadas com espessura real.
 *
 * Motor PURO (Node-testável, ES5). Espessuras em MILÍMETROS (é assim que
 * se especifica revestimento), geometria em metros.
 *
 * No Revit isto é o "Edit Type → Structure": a parede não tem uma
 * espessura digitada, ela tem CAMADAS, e a espessura é a soma delas. É a
 * diferença entre a parede crua ("14 cm") e a parede executiva:
 *
 *   bloco 14 cm  +  chapisco 5 + reboco 20 (dentro)
 *                +  chapisco 5 + emboço 25 (fora)   =  19,5 cm de verdade
 *
 * Sem isso: o 3D fica com a espessura errada, o revestimento não tem
 * área, e o peso — que o usuário pediu por parede, por nível e total —
 * não existe.
 *
 * O QUE ESTE MOTOR NÃO FAZ: casar código SINAPI. Isso é do
 * paredecebola.js, que já explode a parede em SERVIÇOS com código real
 * vindo do Escopo Inteligente. Aqui é a GEOMETRIA e o PESO das camadas.
 * Os dois se encontram pelo nome da camada.
 *
 * FONTES (verificáveis, nada inventado):
 *   · NBR 13749:2013 — espessuras admissíveis de revestimento de argamassa:
 *       parede interna  5 a 20 mm · parede externa 20 a 30 mm · teto ≤ 20 mm
 *   · NBR 7200:1998 — execução de revestimento de argamassa
 *   · NBR 6120:2019 — pesos específicos aparentes (Tabela 1 e 2)
 *   · NBR 6136:2016 — bloco vazado de concreto (via blocos.js)
 * Onde o valor é PRÁTICA e não norma, está escrito assim no campo `fonte`.
 *
 * Teste: node tools/test-alvtipos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function r2(n) { return Math.round(num(n) * 100) / 100; }
  function r3(n) { return Math.round(num(n) * 1000) / 1000; }

  var AlvTipos = {

    /* ---------------------------------------------------------------
     * PESOS ESPECÍFICOS — NBR 6120:2019, em kg/m³.
     * (a norma dá em kN/m³; aqui já convertido por 1 kN/m³ ≈ 102 kg/m³)
     * --------------------------------------------------------------- */
    PESO: {
      argamassa_cimento_areia:    2100,  /* 21,0 kN/m³ */
      argamassa_cal_cimento_areia: 1900, /* 19,0 kN/m³ */
      argamassa_gesso:            1250,  /* 12,5 kN/m³ */
      gesso:                      1250,
      ceramica:                   1800,  /* 18,0 kN/m³ */
      porcelanato:                2300,  /* prática — mais denso que a cerâmica comum */
      concreto_simples:           2400,
      concreto_armado:            2500,
      graute:                     2400,
      tinta:                        60   /* prática — desprezível na estrutura, entra por completude */
    },

    /* ---------------------------------------------------------------
     * NBR 13749:2013 — o que é espessura ADMISSÍVEL
     * --------------------------------------------------------------- */
    LIMITES: {
      interna: { min: 5, max: 20, fonte: "NBR 13749:2013" },
      externa: { min: 20, max: 30, fonte: "NBR 13749:2013" },
      teto:    { min: 5, max: 20, fonte: "NBR 13749:2013" }
    },

    /* ---------------------------------------------------------------
     * CAMADAS DE ACABAMENTO — o vocabulário brasileiro.
     * `e` = espessura em mm (padrão) · `porFace` = existe em cada face
     * `servico` = a chave que o paredecebola.js usa para casar o SINAPI
     * --------------------------------------------------------------- */
    CAMADAS: {
      chapisco:      { rotulo: "Chapisco",              e: 5,  material: "argamassa_cimento_areia",     traco: "1:3 (cimento : areia)",                 servico: "Chapisco",              fonte: "NBR 7200 — prática 3 a 5 mm" },
      emboco:        { rotulo: "Emboço",                e: 20, material: "argamassa_cal_cimento_areia", traco: "1:2:8 (cimento : cal : areia)",         servico: "Emboço",                fonte: "NBR 13749" },
      reboco:        { rotulo: "Reboco",                e: 5,  material: "argamassa_cal_cimento_areia", traco: "1:2:9 (cimento : cal : areia)",         servico: "Reboco",                fonte: "NBR 13749" },
      massa_unica:   { rotulo: "Massa única",           e: 20, material: "argamassa_cal_cimento_areia", traco: "1:2:8 (cimento : cal : areia)",         servico: "Massa única (reboco)",  fonte: "NBR 13749 — emboço e reboco numa camada só" },
      gesso_liso:    { rotulo: "Gesso liso",            e: 5,  material: "gesso",                       traco: "gesso em pó + água",                    servico: "Revestimento em gesso", fonte: "prática — só interno, não pega umidade" },
      massa_corrida: { rotulo: "Massa corrida PVA",     e: 1,  material: "tinta",                       traco: "massa PVA pronta",                      servico: "Massa corrida PVA",     fonte: "prática" },
      massa_acrilica:{ rotulo: "Massa acrílica",        e: 1,  material: "tinta",                       traco: "massa acrílica pronta",                 servico: "Massa acrílica",        fonte: "prática — resiste a intempérie" },
      pintura_latex: { rotulo: "Pintura látex PVA",     e: 0,  material: "tinta",                       traco: "2 demãos",                              servico: "Pintura látex",         fonte: "espessura desprezível" },
      pintura_acril: { rotulo: "Pintura acrílica",      e: 0,  material: "tinta",                       traco: "2 demãos",                              servico: "Pintura acrílica",      fonte: "espessura desprezível" },
      textura:       { rotulo: "Textura acrílica",      e: 2,  material: "tinta",                       traco: "textura pronta",                        servico: "Textura acrílica",      fonte: "prática" },
      ceramica:      { rotulo: "Revestimento cerâmico", e: 15, material: "ceramica",                    traco: "placa 8 mm + argamassa colante AC-II",  servico: "Revestimento cerâmico", fonte: "prática — placa + colante" },
      porcelanato:   { rotulo: "Porcelanato",           e: 18, material: "porcelanato",                 traco: "placa 10 mm + argamassa colante AC-III", servico: "Porcelanato",          fonte: "prática — placa + colante" }
    },

    /* ---------------------------------------------------------------
     * NÚCLEOS — o miolo estrutural ou de vedação.
     * `bloco` aponta para a família do blocos.js, quando houver.
     * --------------------------------------------------------------- */
    /* ATENÇÃO ao campo `peso`: aqui ele é MASSA ESPECÍFICA, em kg/m³ — a
     * mesma unidade da tabela PESO acima. No blocos.js, `peso` é kg POR
     * PEÇA. Foi essa ambiguidade que produziu o bloco cerâmico dez vezes
     * leve; por isso cada núcleo declara a unidade. */
    NUCLEOS: {
      bloco_concreto_14:  { rotulo: "Bloco de concreto 14 cm",  e: 140, familia: "39-14", peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136 — família 39, largura 14" },
      bloco_concreto_19:  { rotulo: "Bloco de concreto 19 cm",  e: 190, familia: "39-19", peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136 — família 39, largura 19" },
      /* familia: null de propósito — não existe família de 9 cm no catálogo.
         Apontava para a "29", que é de 14 cm de largura: no dia em que o peso
         fosse ligado, a divisória de 9 receberia carga de parede de 14 (+55%). */
      bloco_concreto_9:   { rotulo: "Bloco de concreto 9 cm",   e: 90,  familia: null,    peso: null, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6136 — vedação" },
      /* 13 kN/m³ × 102 ≈ 1300 kg/m³. Estava 130 — dez vezes leve, e saindo
         com selo de "peso completo". Uma parede cerâmica de 14 cm, 3,0 × 2,8 m,
         era anunciada com 153 kg de nucleo quando o certo sao 1.528,8 kg
         (2.344,6 kg com o revestimento das duas faces). */
      bloco_ceramico_14:  { rotulo: "Bloco cerâmico 14 cm",     e: 140, familia: null,    peso: 1300, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6120:2019 — alvenaria de bloco cerâmico vazado ≈ 13 kN/m³" },
      bloco_ceramico_9:   { rotulo: "Bloco cerâmico 9 cm",      e: 90,  familia: null,    peso: 1300, unidade: "kg/m3", tipo: "bloco",  fonte: "NBR 6120:2019" },
      concreto_armado_15: { rotulo: "Parede de concreto 15 cm", e: 150, familia: null,    peso: 2500, unidade: "kg/m3", tipo: "concreto", fonte: "NBR 6120:2019 — concreto armado 25 kN/m³" },
      drywall_70:         { rotulo: "Drywall montante 70 mm",   e: 95,  familia: null,    peso: 280,  unidade: "kg/m3", tipo: "seco",   fonte: "prática — 70 mm + 2 chapas de 12,5 mm" }
    },

    /* ---------------------------------------------------------------
     * TIPOS PREDEFINIDOS — o que o usuário pediu: "configurações
     * predefinidas para os tipos de parede e acabamentos mais usuais no
     * Brasil". Cada um é uma receita completa e editável.
     * `dentro`/`fora` são as pilhas de camadas de cada face.
     * --------------------------------------------------------------- */
    TIPOS: {
      "est-14-int": {
        rotulo: "Estrutural · bloco 14 · duas faces internas",
        funcao: "estrutural", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Parede interna de alvenaria estrutural. Massa única (emboço e reboco numa camada só) é o mais usado em obra corrente."
      },
      "est-14-fachada": {
        rotulo: "Estrutural · bloco 14 · fachada",
        funcao: "estrutural", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        notaFora: "A face externa vai a 25 mm de emboço porque a NBR 13749 exige de 20 a 30 mm em parede externa.",
        nota: "Face externa com massa e pintura acrílicas — resistem a chuva e sol."
      },
      "est-19-fachada": {
        rotulo: "Estrutural · bloco 19 · fachada",
        funcao: "estrutural", nucleo: "bloco_concreto_19",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        nota: "Bloco de 19 cm — usado quando a carga ou a altura pede mais espessura."
      },
      "ved-14-int": {
        rotulo: "Vedação · bloco 14 · interna",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Vedação em bloco de concreto — não recebe carga da estrutura."
      },
      "ved-9-int": {
        rotulo: "Vedação · bloco 9 · divisória interna",
        funcao: "vedacao", nucleo: "bloco_concreto_9",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Divisória leve. Não use em parede que recebe armário suspenso pesado sem reforço."
      },
      "ved-14-molhada": {
        rotulo: "Vedação · bloco 14 · área molhada (banho/cozinha)",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "emboco", "ceramica"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "Face molhada com cerâmica sobre emboço. Sem massa corrida embaixo de cerâmica — a massa PVA não é base para colante."
      },
      "ved-14-fachada": {
        rotulo: "Vedação · bloco 14 · fachada",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "massa_acrilica", "pintura_acril"],
        nota: "Vedação de fachada."
      },
      "ved-14-fachada-ceramica": {
        rotulo: "Vedação · bloco 14 · fachada com cerâmica",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "emboco", "ceramica"],
        nota: "Fachada revestida — pastilha ou cerâmica de fachada sobre emboço."
      },
      "cer-14-int": {
        rotulo: "Vedação · bloco cerâmico 14 · interna",
        funcao: "vedacao", nucleo: "bloco_ceramico_14",
        dentro: ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        fora:   ["chapisco", "massa_unica", "massa_corrida", "pintura_latex"],
        nota: "O bloco cerâmico furado é o mais comum na vedação da obra corrente brasileira."
      },
      "crua": {
        rotulo: "Parede crua (só o núcleo)",
        funcao: "vedacao", nucleo: "bloco_concreto_14",
        dentro: [], fora: [],
        nota: "Só o núcleo, sem revestimento. É o ponto de partida — o painel de camadas transforma numa parede executiva."
      }
    },

    /* ================================================================
     * MONTAR — a parede crua vira parede executiva.
     * opts: { nucleo, dentro:[], fora:[], espessuras:{camada:mm},
     *         funcao, rotulo }
     * Aceita também `base:"est-14-fachada"` para partir de um predefinido.
     * ================================================================ */
    montar: function (opts) {
      opts = opts || {};
      var base = opts.base && this.TIPOS[opts.base] ? this.TIPOS[opts.base] : null;
      var nucleoId = opts.nucleo || (base && base.nucleo) || "bloco_concreto_14";
      var nucleo = this.NUCLEOS[nucleoId];
      if (!nucleo) return { ok: false, motivo: "Núcleo desconhecido: " + nucleoId + "." };

      var esp = opts.espessuras || {};
      var self = this;
      function pilha(lista, face) {
        return (lista || []).map(function (id, i) {
          var c = self.CAMADAS[id];
          if (!c) return { id: id, erro: "Camada desconhecida: " + id + "." };
          var e = esp[id] != null ? num(esp[id]) : (esp[face + ":" + id] != null ? num(esp[face + ":" + id]) : c.e);
          /* fachada pede 20 a 30 mm; se o usuário não mexeu, sobe o emboço
             para 25 mm em vez de deixar 20 no limite exato da norma */
          if (face === "fora" && id === "emboco" && esp[id] == null && esp["fora:" + id] == null) e = 25;
          return {
            id: id, ordem: i + 1, face: face, rotulo: c.rotulo,
            espessura: r2(e), material: c.material, traco: c.traco,
            servico: c.servico, fonte: c.fonte,
            pesoM2: r2(e / 1000 * (self.PESO[c.material] || 0))
          };
        });
      }

      var dentro = pilha(opts.dentro || (base && base.dentro) || [], "dentro");
      var fora = pilha(opts.fora || (base && base.fora) || [], "fora");
      var erros = dentro.concat(fora).filter(function (c) { return c.erro; }).map(function (c) { return c.erro; });
      if (erros.length) return { ok: false, motivo: erros[0], erros: erros };

      var eNucleo = opts.espessuraNucleo != null ? num(opts.espessuraNucleo) : nucleo.e;
      var somaD = dentro.reduce(function (s, c) { return s + c.espessura; }, 0);
      var somaF = fora.reduce(function (s, c) { return s + c.espessura; }, 0);

      return {
        ok: true,
        id: opts.id || (opts.base || "custom"),
        rotulo: opts.rotulo || (base && base.rotulo) || ("Parede " + nucleo.rotulo),
        funcao: opts.funcao || (base && base.funcao) || "vedacao",
        nucleo: { id: nucleoId, rotulo: nucleo.rotulo, espessura: r2(eNucleo), familia: nucleo.familia, tipo: nucleo.tipo, peso: nucleo.peso, fonte: nucleo.fonte },
        dentro: dentro, fora: fora,
        espessuraNucleo: r2(eNucleo),
        espessuraDentro: r2(somaD),
        espessuraFora: r2(somaF),
        espessura: r2(eNucleo + somaD + somaF),            /* mm */
        espessuraM: r3((eNucleo + somaD + somaF) / 1000),  /* m — é o que o 3D usa */
        nota: (base && base.nota) || ""
      };
    },

    /* Atalho: pega um predefinido pronto. */
    tipo: function (id, opts) {
      if (!this.TIPOS[id]) return { ok: false, motivo: "Tipo de parede desconhecido: " + id + "." };
      var o = {};
      for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      o.base = id; o.id = id;
      return this.montar(o);
    },

    listar: function () {
      var self = this, out = [];
      for (var id in this.TIPOS) {
        if (!Object.prototype.hasOwnProperty.call(this.TIPOS, id)) continue;
        var t = self.tipo(id);
        out.push({ id: id, rotulo: this.TIPOS[id].rotulo, funcao: this.TIPOS[id].funcao,
                   espessura: t.ok ? t.espessura : null, espessuraM: t.ok ? t.espessuraM : null });
      }
      return out;
    },

    /* ================================================================
     * CONFERIR — as espessuras batem com a NBR 13749?
     * `faceExterna` diz qual pilha está exposta ao tempo.
     * ================================================================ */
    conferir: function (tipo, opts) {
      opts = opts || {};
      var faceExterna = opts.faceExterna || "fora";
      var avisos = [], erros = [], self = this;

      function somaArgamassa(pilha) {
        return pilha.filter(function (c) {
          return c.id === "chapisco" || c.id === "emboco" || c.id === "reboco" || c.id === "massa_unica";
        }).reduce(function (s, c) { return s + c.espessura; }, 0);
      }

      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        var face = par[0], pilha = par[1] || [];
        if (!pilha.length) return;
        var arg = somaArgamassa(pilha);
        if (arg <= 0) return;
        /* o chapisco é camada de aderência, não conta na espessura de
           revestimento que a NBR 13749 limita */
        var semChapisco = arg - pilha.filter(function (c) { return c.id === "chapisco"; })
                                     .reduce(function (s, c) { return s + c.espessura; }, 0);
        var lim = (face === faceExterna) ? self.LIMITES.externa : self.LIMITES.interna;
        var qual = (face === faceExterna) ? "externa" : "interna";
        if (semChapisco < lim.min) {
          avisos.push("A face " + face + " tem " + semChapisco.toFixed(0) + " mm de revestimento; a " + lim.fonte +
                      " pede no mínimo " + lim.min + " mm em parede " + qual + ".");
        }
        if (semChapisco > lim.max) {
          avisos.push("A face " + face + " tem " + semChapisco.toFixed(0) + " mm de revestimento; a " + lim.fonte +
                      " admite no máximo " + lim.max + " mm em parede " + qual + ". Acima disso o revestimento precisa de tela.");
        }
      });

      /* erros de sequência que a obra não perdoa */
      function seq(pilha, face) {
        var ids = pilha.map(function (c) { return c.id; });
        var iCer = Math.max(ids.indexOf("ceramica"), ids.indexOf("porcelanato"));
        var iMassa = Math.max(ids.indexOf("massa_corrida"), ids.indexOf("massa_acrilica"));
        if (iCer >= 0 && iMassa >= 0 && iMassa < iCer) {
          erros.push("Na face " + face + " há massa corrida embaixo da cerâmica. A argamassa colante não adere na massa — a placa cai.");
        }
        if (ids.length && ids[0] !== "chapisco" && ids[0] !== "gesso_liso") {
          avisos.push("A face " + face + " começa com \"" + (self.CAMADAS[ids[0]] || {}).rotulo + "\" sem chapisco. Sem a camada de aderência, o revestimento descola.");
        }
        var iGesso = ids.indexOf("gesso_liso");
        if (iGesso >= 0 && face === (opts.faceExterna || "fora")) {
          erros.push("Gesso na face externa. Gesso não resiste à umidade — em fachada ele empola e cai.");
        }
      }
      seq(tipo.dentro || [], "dentro");
      seq(tipo.fora || [], "fora");

      return { ok: erros.length === 0, erros: erros, avisos: avisos };
    },

    /* ================================================================
     * QUANTIFICAR — área de parede → quantidade por camada + PESO.
     * area = m² de face (uma face). O núcleo usa a área uma vez; as
     * camadas de acabamento usam a área de CADA face.
     * ================================================================ */
    quantificar: function (tipo, area, opts) {
      opts = opts || {};
      var A = num(area);
      if (A <= 0) return { ok: false, motivo: "Área de parede tem que ser maior que zero." };
      var self = this;
      var linhas = [], pesoTotal = 0;

      /* núcleo */
      var nu = tipo.nucleo || {};
      var volNucleo = r3(A * (num(tipo.espessuraNucleo) / 1000));
      var pesoNucleo = null, obsNucleo = "";
      if (nu.peso != null) {
        pesoNucleo = r2(volNucleo * nu.peso);
        obsNucleo = nu.fonte || "";
      } else if (nu.familia && opts.pesoBlocoM2 != null) {
        pesoNucleo = r2(A * num(opts.pesoBlocoM2));
        obsNucleo = "peso por m² informado pelo catálogo de blocos";
      } else if (nu.familia) {
        obsNucleo = "peso do bloco vem do catálogo (blocos.js) — informe pesoBlocoM2 ou classe do bloco";
      } else {
        /* sem massa específica E sem família: sem este ramo a observação saía
           vazia e o peso do núcleo sumia sem nenhuma explicação na tela */
        obsNucleo = "Não há família de bloco desta espessura no catálogo — informe o peso do seu fornecedor.";
      }
      linhas.push({
        camada: nu.rotulo || "Núcleo", face: "núcleo", tipoLinha: "nucleo",
        espessura: tipo.espessuraNucleo, area: r2(A), volume: volNucleo,
        peso: pesoNucleo, obs: obsNucleo, servico: "Alvenaria"
      });
      if (pesoNucleo != null) pesoTotal += pesoNucleo;

      /* acabamentos, face a face */
      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        (par[1] || []).forEach(function (c) {
          var vol = r3(A * (c.espessura / 1000));
          var peso = r2(vol * (self.PESO[c.material] || 0));
          pesoTotal += peso;
          linhas.push({
            camada: c.rotulo, face: par[0], tipoLinha: "acabamento",
            espessura: c.espessura, area: r2(A), volume: vol,
            peso: peso, traco: c.traco, servico: c.servico, obs: c.fonte,
            material: c.material
          });
        });
      });

      var pesoConhecido = pesoNucleo != null;
      return {
        ok: true,
        area: r2(A),
        areaTotalFaces: r2(A * ((tipo.dentro || []).length ? 1 : 0) + A * ((tipo.fora || []).length ? 1 : 0)),
        linhas: linhas,
        /* argamassa de REVESTIMENTO (chapisco, emboço, reboco, massa única).
           A de assentamento do bloco é outra conta, e sai do blocos.js. */
        volumeArgamassa: r3(linhas.filter(function (l) {
          return l.material === "argamassa_cimento_areia" || l.material === "argamassa_cal_cimento_areia";
        }).reduce(function (s, l) { return s + l.volume; }, 0)),
        peso: r2(pesoTotal),
        pesoPorM2: r2(pesoTotal / A),
        pesoCompleto: pesoConhecido,
        avisoPeso: pesoConhecido ? "" : "O peso não inclui o núcleo — o peso do bloco vem do catálogo. Informe a família e a classe do bloco para fechar o total."
      };
    },

    /* Peso por m² de parede pronta — o número que vai para a fundação. */
    pesoPorM2: function (tipo, opts) {
      var q = this.quantificar(tipo, 1, opts);
      return q.ok ? { peso: q.pesoPorM2, completo: q.pesoCompleto, aviso: q.avisoPeso } : q;
    },

    /* A lista de serviços, na ordem de execução — é a ponte com o
     * paredecebola.js, que casa cada um com o código SINAPI. */
    servicos: function (tipo) {
      var out = [{ servico: "Alvenaria", face: "núcleo", seq: 1 }];
      var n = 1;
      [["dentro", tipo.dentro], ["fora", tipo.fora]].forEach(function (par) {
        (par[1] || []).forEach(function (c) { out.push({ servico: c.servico, face: par[0], seq: ++n, espessura: c.espessura, traco: c.traco }); });
      });
      return out;
    }
  };

  global.AlvTipos = AlvTipos;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvTipos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
