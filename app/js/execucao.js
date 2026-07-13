/* =====================================================================
 * execucao.js — "Agente de Execução" (Fase A do BIM 2D→obra real)
 *
 * O CÉREBRO de canteiro: pega cada item do orçamento (código SINAPI + qtd),
 * lê os COEFICIENTES DE MÃO-DE-OBRA reais do analítico SINAPI (horas-homem por
 * profissão: pedreiro, servente, eletricista, encanador, pintor, carpinteiro,
 * armador...), e responde as perguntas do dono da obra:
 *   - quanto tempo leva cada etapa?  (duração = Hh ÷ (equipe × jornada))
 *   - quantas pessoas de cada profissão preciso p/ bater a data de entrega?
 *   - quanto REALMENTE custa cada etapa (custo/dia real dos meus colaboradores)?
 *   - o simulado de execução FECHA com o orçamento executivo? senão, ONDE ajusta?
 *
 * Grounded, NÃO inventa: produtividade = Hh do SINAPI; custo/dia = colaborador
 * real (RH do app), com fallback honesto no custo-hora do próprio SINAPI.
 * Lógica pura/testável (Node). Depende de window.Analitico e window.Cronograma
 * quando presentes (injetáveis nos testes via Execucao._deps).
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v) {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;      // número JS = usa direto (coeficiente/qtd)
    if (typeof Util !== "undefined" && Util.num) return Util.num(v);
    var s = String(v).trim();
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", "."); // BR "1.234,56" -> 1234.56
    return parseFloat(s) || 0;                                   // "0.5" (sem vírgula) = decimal com ponto
  }
  function fix(s) { return (typeof Util !== "undefined" && Util.fixEnc) ? Util.fixEnc(String(s == null ? "" : s)) : String(s == null ? "" : s); }
  function norm(s) { return fix(s).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }

  // Mesmo critério do analitico.js: linha de hora-homem com encargos é MO pura.
  var RE_MO = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/;
  function ehMoPura(txt) { return RE_MO.test(norm(txt)); }

  // Profissão = texto antes de " COM ENCARGOS"/"(HORISTA)". Ex.: "PEDREIRO COM
  // ENCARGOS COMPLEMENTARES" -> "PEDREIRO".
  function profDe(desc) {
    var d = norm(desc);
    d = d.replace(/ COM ENCARGOS.*$/, "").replace(/\(HORISTA\)|\(MENSALISTA\)/g, "").replace(/\s+/g, " ").trim();
    return d || "MAO DE OBRA";
  }

  // Sinônimos p/ casar a FUNÇÃO livre do colaborador com a PROFISSÃO do SINAPI.
  var SINONIMOS = [
    ["SERVENTE", ["SERVENTE", "AJUDANTE", "AUXILIAR", "PEAO", "PEÃO", "MEIO OFICIAL", "MEIO-OFICIAL"]],
    ["PEDREIRO", ["PEDREIRO"]],
    ["ELETRICISTA", ["ELETRICISTA", "ELETROTECNICO"]],
    ["ENCANADOR OU BOMBEIRO HIDRAULICO", ["ENCANADOR", "BOMBEIRO", "HIDRAULICO", "HIDRAULICA"]],
    ["PINTOR", ["PINTOR"]],
    ["CARPINTEIRO DE FORMAS", ["CARPINTEIRO", "CARPINTARIA"]],
    ["ARMADOR", ["ARMADOR", "FERREIRO", "FERRAGEM"]],
    ["MONTADOR DE ESTRUTURAS METALICAS", ["MONTADOR", "SERRALHEIRO"]],
    ["SOLDADOR", ["SOLDADOR"]],
    ["OPERADOR DE BETONEIRA", ["BETONEIRA"]],
    ["ENCARREGADO GERAL", ["ENCARREGADO", "MESTRE", "MESTRE DE OBRAS"]],
    ["ENGENHEIRO CIVIL", ["ENGENHEIRO", "ENGENHEIRA"]],
    ["VIDRACEIRO", ["VIDRACEIRO", "VIDRO"]],
    ["GESSEIRO", ["GESSEIRO", "GESSO"]],
    // "ASSENTADOR" cru sai daqui: na base SINAPI real as linhas "ASSENTADOR ..." são de TUBOS/MANILHAS
    // (tubulação, outro ofício) — um azulejista cruzaria com elas. Mantém só as formas de revestimento.
    ["AZULEJISTA", ["AZULEJISTA", "LADRILHISTA", "LADRILHEIRO", "ASSENTADOR DE CERAMICA", "ASSENTADOR DE PISO", "ASSENTADOR DE PORCELANATO", "ASSENTADOR DE REVESTIMENTO", "ASSENTADOR DE AZULEJO"]],
    ["TELHADISTA", ["TELHADISTA", "TELHADO", "COBERTURA"]],
    ["JARDINEIRO", ["JARDINEIRO", "JARDIM", "PAISAG"]]
  ];
  // Pessoal de ESCRITÓRIO/gestão nunca casa profissão de CAMPO (senão contamina o custo de obra).
  var OFFICE = /ADMINISTRAT|FINANCEIR|ESCRITORI|COMPRAS|RECURSOS HUMAN|\bRH\b|CONTABIL|CONTADOR|COMERCIAL|VENDAS|SECRETARI|ESTAGIARI|RECEPC|ALMOXARIF|GERENTE|DIRETOR|ANALISTA|TECNICO DE SEGURANC|ADVOGAD|ASSISTENTE SOCIAL|MOTORISTA|VIGIA|PORTEIR|COZINHEIR/;
  // Tokens "largos" que sozinhos casam demais — exigem 2º termo em comum com a profissão.
  var LARGO = /^(OPERADOR|AUXILIAR|AJUDANTE|MONTADOR|OFICIAL|ASSENTADOR)$/;
  // Normaliza o TIER (nível) de uma função/profissão livre p/ o match não cruzar níveis diferentes.
  // Aplicado NOS DOIS lados (função do colaborador E profissão SINAPI) — senão fica assimétrico: o
  // colapso só na função deixa a profissão SINAPI "AUXILIAR DE ELETRICISTA" ser casada pelo oficial
  // "Eletricista" (via LARGO) e cobrada com a diária cara do oficial.
  function canonTier(s) {
    // AUXILIAR/ajudante/servente/meio-oficial/peão (inclusive "... DE <ofício>" e abrev. AUX/AJUD/SERV) = SERVENTE.
    // "meio-oficial" tem grafias de "metade": MEIO/MEIA/1-2/½ + OFICIAL — todas são servente-tier.
    s = s.replace(/^((MEI[OA]|1\/2|½)[\s-]*OFICIAL|AJUDANTE|AJUD|AUXILIAR|AUX|SERVENTE|SERV|PEAO)\b.*/, "SERVENTE");
    // supervisor "encarregado/mestre/chefe/supervisor/líder [de <ofício>]" = ENCARREGADO GERAL — tier de
    // supervisão NÃO empresta (nem toma) o custo do ofício ("chefe de pedreiro" ≠ pedreiro).
    s = s.replace(/^(ENCARREGADO|MESTRE|CONTRA[\s-]*MESTRE|CHEFE|SUPERVISOR|LIDER|ENCARR)\b.*/, "ENCARREGADO GERAL");
    if (s === "OFICIAL") s = "PEDREIRO"; // "OFICIAL" isolado = oficial de campo (pedreiro-tier)
    return s;
  }
  // pontuação de match entre função-colaborador e profissão-SINAPI
  function scoreMatch(funcaoColab, profSinapi) {
    var f = norm(funcaoColab), p = norm(profSinapi);
    if (!f) return 0;
    if (OFFICE.test(f)) return 0; // administrativo/financeiro/motorista/vigia etc. -> nunca é MO de campo
    f = canonTier(f); p = canonTier(p); // normaliza o tier nos DOIS lados (função e profissão)
    if (f === p) return 100;
    var p0 = p.split(" ")[0], reTok = new RegExp("(^| )" + p0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "( |$)");
    // token DIRETO: a função tem a 1ª palavra da profissão como palavra inteira (não substring solta)
    if (p.indexOf(f) >= 0 || (p0.length >= 4 && reTok.test(f))) {
      if (LARGO.test(p0)) { // "operador/auxiliar de X": exige o X (2º termo) também em comum
        var resto = p.split(" ").slice(1).filter(function (w) { return w.length >= 4 && w !== "COM"; });
        var comum = resto.some(function (w) { return f.indexOf(w) >= 0; });
        return comum ? 60 : 0;
      }
      return 60;
    }
    // via sinônimos (a função e a profissão caem no mesmo grupo)
    for (var i = 0; i < SINONIMOS.length; i++) {
      var grpProf = norm(SINONIMOS[i][0]), kws = SINONIMOS[i][1];
      var profNoGrupo = (p.indexOf(grpProf.split(" ")[0]) >= 0);
      var funcNoGrupo = kws.some(function (k) { return f.indexOf(norm(k)) >= 0; });
      var profKwNoGrupo = kws.some(function (k) { return p.indexOf(norm(k)) >= 0; });
      if (funcNoGrupo && (profNoGrupo || profKwNoGrupo)) return 40;
    }
    return 0;
  }

  var Execucao = {
    DEFAULTS: {
      jornadaH: 8,            // horas por dia de trabalho
      diasUteisSemana: 5,
      diasUteisMes: 22,       // divisor p/ converter salário MENSAL em custo/dia
      paralelismo: 0.15,      // sobreposição entre etapas (mesmo do Cronograma)
      toleranciaPct: 5,       // faixa "dentro do orçado" (±%)
      dataInicio: null,       // "AAAA-MM-DD" (default: hoje)
      dataEntrega: null,      // "AAAA-MM-DD" (se dado: dimensiona equipe p/ caber)
      encargosPct: 68,        // encargos patronais CLT (%) — MESMO default da Folha (gestao.js calcFolha) p/ os módulos concordarem; onera a diária p/ comparar com SINAPI (onerado)
      diariaMin: 150,         // piso de diária quando a base não tem preço da profissão (custo-hora<=0)
      coberturaMin: 55,       // abaixo disso a reconciliação é rotulada "parcial" (não confiável)
      colaboradores: []       // [{funcao, remuneracao, unidadeRem, tipoContrato, status}]
    },
    _deps: { Analitico: null, Cronograma: null }, // injetável em teste
    _A: function () { return this._deps.Analitico || global.Analitico || null; },
    _C: function () { return this._deps.Cronograma || global.Cronograma || null; },
    profDe: profDe, ehMoPura: ehMoPura, _score: scoreMatch,

    // Horas-homem por profissão de UM item (recursa nas sub-composições não-MO,
    // multiplicando coeficientes). Retorna {prof:{HH,custoHora}}, exato:bool.
    hhDoItem: function (item, A) {
      A = A || this._A();
      var qtd = num(item.quantidade), acc = {}, exato = false;
      if (A && item.codigo != null && A.tem && A.tem(item.codigo)) {
        var self = this;
        (function rec(cod, mult, trilha) {
          var comp = A.obter(String(cod)); if (!comp || !comp.insumos) return;
          comp.insumos.forEach(function (ins) {
            var coef = num(ins.coeficiente);
            if (ins.unidade === "H" && ehMoPura(ins.descricao)) {
              var p = profDe(ins.descricao), s = acc[p] || (acc[p] = { hh: 0, custoHora: 0 });
              s.hh += coef * mult;
              if (!s.custoHora) s.custoHora = num(ins.custoUnitario);
              exato = true;
            } else if (ins.tipo === "COMPOSICAO" && !ehMoPura(ins.descricao) && A.tem(ins.codigo) && !trilha[ins.codigo]) {
              trilha[ins.codigo] = 1; rec(ins.codigo, mult * coef, trilha); delete trilha[ins.codigo];
            }
          });
        })(item.codigo, qtd, {});
      }
      return { prof: acc, exato: exato };
    },

    // custo/dia de uma profissão a partir dos colaboradores reais; fallback = custo-hora SINAPI × jornada.
    // Onera a diária de CLT pelos ENCARGOS PATRONAIS antes de comparar com a MO do SINAPI (que já é
    // ONERADA "COM ENCARGOS COMPLEMENTARES") — senão compara bruto (colab) com onerado (SINAPI) e a
    // "folga" mostrada é só o encargo que a empresa AINDA vai pagar. Diarista/autônomo/PJ pagam cheio.
    custoDiaProf: function (prof, custoHoraSinapi, params) {
      var col = params.colaboradores || [], jorn = num(params.jornadaH) || 8, divMes = num(params.diasUteisMes) || 22;
      var encFat = 1 + (num(params.encargosPct) || 0) / 100, valores = [], comEncargo = false;
      col.forEach(function (c) {
        if (c.status && c.status !== "ativo") return;
        var sc = scoreMatch(c.funcao, prof); if (sc < 40) return;
        var rem = num(c.remuneracao) || num(c.salario), u = String(c.unidadeRem || "mensal").toLowerCase(), dia; // demo/legado grava 'salario' (mensal)
        if (u === "diaria" || u === "diária") dia = rem;
        else if (u === "hora") dia = rem * jorn;
        else dia = rem / divMes; // mensal
        if (dia <= 0) return;
        // Onera SÓ o que é folha CLT (salário bruto). A diária de um diarista/autônomo/PJ JÁ é o custo
        // cheio da empresa. tipoContrato manda; sem ele, infere pela unidade (mensal=CLT presumido).
        var tc = String(c.tipoContrato || "").toLowerCase(), onera;
        if (/clt|mensal|efetiv|registrad/.test(tc)) onera = true;
        else if (/diarist|autonom|\bpj\b|empreit|terceir|avuls|hora/.test(tc)) onera = false;
        else onera = (u !== "diaria" && u !== "diária" && u !== "hora"); // sem tipoContrato: só mensal onera
        if (encFat > 1 && onera) { dia *= encFat; comEncargo = true; }
        valores.push(dia);
      });
      if (valores.length) {
        var media = valores.reduce(function (a, b) { return a + b; }, 0) / valores.length;
        return { valor: media, fonte: "real", n: valores.length, comEncargo: comEncargo };
      }
      var v = (num(custoHoraSinapi) || 0) * jorn;
      if (v <= 0) v = num(params.diariaMin) || 150; // profissão sem preço na base -> piso (senão MO deflaciona a 0)
      return { valor: v, fonte: "sinapi", n: 0 };
    },

    // Simulação completa. Retorna etapas com equipe por profissão, duração, custo,
    // + totais + reconciliação com o orçamento.
    simular: function (orc, override) {
      var self = this, C = this._C(), A = this._A();
      var params = {}; for (var k in this.DEFAULTS) params[k] = this.DEFAULTS[k];
      if (orc && orc.execucao && orc.execucao.params) for (k in orc.execucao.params) if (orc.execucao.params[k] != null) params[k] = orc.execucao.params[k];
      if (override) for (k in override) if (override[k] != null) params[k] = override[k];
      var jorn = num(params.jornadaH) || 8;

      // diária de referência p/ converter MO-R$ estimada em homens-dia (servente real ou fallback)
      var diariaRef = self.custoDiaProf("SERVENTE", 0, params).valor || 220;

      // 1) por etapa: agrega Hh por profissão (exato) + MO-R$ estimada (fallback honesto) +
      //    marca itens de base estadual/própria SEM custo de MO (GOINFRA/SEINFRA só têm preço total).
      var etapas = (orc.etapas || []).map(function (e) {
        var prof = {}, moEstimR = 0, hdEstim = 0, custoDireto = 0, nComQtd = 0, nExatos = 0, orcadoMOExato = 0, custoSemBaseMO = 0, nSemBaseMO = 0;
        (e.itens || []).forEach(function (it) {
          var q = num(it.quantidade);
          custoDireto += q * num(it.custoUnitario);
          var r = self.hhDoItem(it, A);
          if (q > 0) { nComQtd++; if (r.exato) { nExatos++; orcadoMOExato += q * num(it.custoMO); } } // MO orçada só da porção com Hh
          if (r.exato) {
            for (var p in r.prof) { var s = prof[p] || (prof[p] = { hh: 0, custoHora: 0 }); s.hh += r.prof[p].hh; if (!s.custoHora) s.custoHora = r.prof[p].custoHora; }
          } else if (q > 0) {
            // item sem coeficiente SINAPI: MO estimada = o PRÓPRIO custoMO do orçamento (R$).
            // NÃO fabrica homem-hora p/ material/verba puros. Se custoMO=0 (base estadual GOINFRA/
            // SEINFRA, que só grava preço total) NÃO dá p/ estimar MO -> marca "sem base de MO" em
            // vez de colapsar o prazo a 1 dia e mostrar equipe em branco como se fosse verdade.
            var moR = num(it.custoMO) * q;
            if (moR > 0) { moEstimR += moR; hdEstim += moR / diariaRef; }
            else { custoSemBaseMO += q * num(it.custoUnitario); nSemBaseMO++; }
          }
        });
        var catO = (C && C.classificar) ? C.classificar((e.itens && e.itens[0] && e.itens[0].descricao) || e.nome) : null;
        return {
          id: e.id, codigo: e.codigo, nome: e.nome,
          categoria: catO ? catO.id : "outros", cor: catO ? catO.cor : "#94a3b8",
          prof: prof, moEstimR: moEstimR, homensDiaEstim: hdEstim, custoDireto: custoDireto,
          nComQtd: nComQtd, nExatos: nExatos, orcadoMOExato: orcadoMOExato,
          custoSemBaseMO: custoSemBaseMO, nSemBaseMO: nSemBaseMO
        };
      });

      // 2) homens-dia por profissão + duração natural. Etapa SEM base de MO (nem Hh, nem MO-R$)
      //    é NÃO-ESTIMÁVEL: duração 0 (não colapsa o prazo p/ 1 dia, e some da conta com aviso).
      etapas.forEach(function (et) {
        var maxHomDia = 0;
        for (var p in et.prof) { var hd = et.prof[p].hh / jorn; et.prof[p].homensDia = hd; if (hd > maxHomDia) maxHomDia = hd; }
        if (et.homensDiaEstim > maxHomDia) maxHomDia = et.homensDiaEstim;
        et.temBaseMO = maxHomDia > 0; // tem produtividade (SINAPI) OU MO-R$ estimada?
        et.duracaoNatural = et.temBaseMO ? Math.max(1, Math.ceil(maxHomDia)) : 0;
      });

      // 3) sequência natural (cascata c/ paralelismo) -> prazo natural
      function sequencia(dursKey) {
        var t = 0;
        etapas.forEach(function (et, i) {
          var dur = et[dursKey];
          if (i === 0) et._ini = 0; else { var prev = etapas[i - 1]; var ov = Math.floor((num(params.paralelismo) || 0) * prev[dursKey]); et._ini = Math.max(0, prev._ini + prev[dursKey] - ov); }
          et._fim = et._ini + dur; if (et._fim > t) t = et._fim;
        });
        return t;
      }
      var prazoNatural = sequencia("duracaoNatural");

      // 4) alvo de prazo? dimensiona equipe por profissão p/ caber (fator por etapa)
      var prazoAlvo = null;
      if (params.dataInicio && params.dataEntrega && C && C.addDiasUteis) {
        prazoAlvo = self._diasUteisEntre(params.dataInicio, params.dataEntrega, params.diasUteisSemana, C);
      }
      var modo = prazoAlvo && prazoAlvo > 0 ? "prazo" : "equipe";
      // duração-alvo por etapa: se há prazoAlvo, comprime proporcional à duração natural
      var fatorGlobal = (modo === "prazo" && prazoNatural > 0) ? Math.min(1, prazoAlvo / prazoNatural) : 1;

      etapas.forEach(function (et) {
        var durAlvo = et.temBaseMO ? Math.max(1, Math.round(et.duracaoNatural * fatorGlobal)) : 0;
        et.duracao = durAlvo;
        et.equipe = {}; et.custoMO = 0; et.custoMOReal = 0; et.orcadoMOReal = 0; et.custoMORealSemBase = 0;
        var div = durAlvo || 1; // guarda: etapa não-estimável não entra neste loop (prof vazio), mas evita /0
        for (var p in et.prof) {
          var s = et.prof[p];
          var q = Math.max(1, Math.ceil(s.homensDia / div)); // pessoas dessa profissão p/ caber
          var cd = self.custoDiaProf(p, s.custoHora, params);
          s.equipe = q; s.custoDia = cd.valor; s.fonteCusto = cd.fonte; s.comEncargo = !!cd.comEncargo;
          s.custo = s.homensDia * cd.valor;                 // custo pelo CONTEÚDO de trabalho (equipe eficiente)
          s.orcadoProf = s.hh * (num(s.custoHora) || 0);    // MO orçada (SINAPI onerado) desta profissão
          et.equipe[p] = q; et.custoMO += s.custo;
          // RECONCILIAÇÃO só sobre a profissão com DIÁRIA REAL E com orçado-SINAPI > 0. No fallback SINAPI
          // custo≡orçado (tautologia). E se a linha de MO do SINAPI tem custoUnitario=0 (14 linhas na base
          // MG real, ex.: MONTADOR DE FÔRMAS), orcadoProf=0 e somar só o custo real inflaria o desvio e
          // inverteria o veredito — então fica FORA de ambos (rastreado à parte como "sem base p/ comparar").
          if (cd.fonte === "real") {
            if (s.orcadoProf > 0) { et.custoMOReal += s.custo; et.orcadoMOReal += s.orcadoProf; }
            else { et.custoMORealSemBase += s.custo; }
          }
        }
        // parcela ESTIMADA (itens sem SINAPI mas com custoMO): custo = MO-R$ da própria base (não subvaloriza)
        if (et.moEstimR > 0) {
          et.equipeEstim = Math.max(1, Math.ceil(et.homensDiaEstim / div));
          et.custoMOEstim = et.moEstimR;
          et.custoMO += et.custoMOEstim;
        }
      });
      var prazoFinal = sequencia("duracao");

      // datas
      var ini = params.dataInicio ? new Date(params.dataInicio + "T00:00:00") : new Date();
      if (C && C.addDiasUteis) etapas.forEach(function (et) { et.dataInicio = C.addDiasUteis(ini, et._ini, params.diasUteisSemana); et.dataFim = C.addDiasUteis(ini, et._fim, params.diasUteisSemana); });

      // 5) equipe de PICO + custos. Separa: EXATO (profissões SINAPI), REAL (só profissões com
      //    diária cadastrada — base da reconciliação) e SEM-BASE (itens estaduais sem custoMO).
      var equipePico = {}, custoMOTotal = 0, custoMOExato = 0, orcadoMOExato = 0, custoMOReal = 0, orcadoMOReal = 0, custoMORealSemBaseTot = 0;
      var coberturaN = 0, coberturaTot = 0, houveEncargo = false, nEtapasComBase = 0, nEtapasSemBase = 0, custoSemBaseMOTot = 0;
      etapas.forEach(function (et) {
        custoMOTotal += et.custoMO; coberturaN += et.nExatos; coberturaTot += et.nComQtd; orcadoMOExato += et.orcadoMOExato;
        custoMOReal += et.custoMOReal || 0; orcadoMOReal += et.orcadoMOReal || 0; custoSemBaseMOTot += et.custoSemBaseMO || 0; custoMORealSemBaseTot += et.custoMORealSemBase || 0;
        if (et.temBaseMO) nEtapasComBase++; else nEtapasSemBase++;
        for (var p in et.prof) { custoMOExato += et.prof[p].custo || 0; if (et.prof[p].comEncargo) houveEncargo = true; }
        for (var pp in et.equipe) equipePico[pp] = Math.max(equipePico[pp] || 0, et.equipe[pp]);
        if (et.equipeEstim) equipePico["equipe geral (estimada)"] = Math.max(equipePico["equipe geral (estimada)"] || 0, et.equipeEstim);
      });

      // 6) reconciliação SÓ sobre a porção com DIÁRIA REAL (real×orçado-SINAPI da mesma profissão).
      //    Sem colaborador que case a profissão, o custo cai no fallback SINAPI (custo≡orçado) e o
      //    "0% dentro do orçado" seria SINAPI comparado consigo mesmo — mentira verde. status "sem-base".
      var temDiariaReal = orcadoMOReal > 0;
      var reconConfiavel = temDiariaReal;
      var tol = num(params.toleranciaPct) || 5;
      var desvio = reconConfiavel ? (custoMOReal - orcadoMOReal) : 0;
      var desvioPct = reconConfiavel ? (desvio / orcadoMOReal) * 100 : 0;
      var status = !reconConfiavel ? "sem-base" : (Math.abs(desvioPct) <= tol ? "dentro" : (desvioPct > 0 ? "acima" : "abaixo"));
      // cobertura da RECONCILIAÇÃO = quanto da MO-SINAPI tem diária real (NÃO arredonda antes do corte)
      var reconCobPct = orcadoMOExato > 0 ? (orcadoMOReal / orcadoMOExato) * 100 : 0;
      var coberturaBaixa = reconConfiavel && reconCobPct < (num(params.coberturaMin) || 55);
      var semBaseMO = nEtapasComBase === 0;             // NENHUMA etapa dimensionável (100% estadual/sem MO)
      var coberturaPct = coberturaTot > 0 ? Math.round(coberturaN / coberturaTot * 100) : 0; // % itens com Hh SINAPI
      // orçado total (todos os itens) só p/ exibição de contexto
      var orcadoMOTotal = 0;
      if (typeof Orcamento !== "undefined" && Orcamento.totais) { try { orcadoMOTotal = num(Orcamento.totais(orc).mo); } catch (e) {} }
      if (!orcadoMOTotal) { (orc.etapas || []).forEach(function (e) { (e.itens || []).forEach(function (it) { orcadoMOTotal += num(it.custoMO) * num(it.quantidade); }); }); }

      var entregaInvalida = !!(params.dataEntrega && (!prazoAlvo || prazoAlvo <= 0));
      var metaAtingida = (modo !== "prazo" || semBaseMO) ? null : (prazoFinal <= prazoAlvo + 0.5);
      var ranking = etapas.slice().sort(function (a, b) { return b.custoMO - a.custoMO; }).slice(0, 5)
        .map(function (e) { return { nome: e.nome, custoMO: Math.round(e.custoMO), duracao: e.duracao }; });

      var sugestoes = [];
      if (semBaseMO) {
        sugestoes.push("Este orçamento não tem coeficientes de mão-de-obra (base estadual GOINFRA/SEINFRA/própria, ou itens sem custo de MO). O agente não consegue dimensionar equipe nem prazo por aqui — use itens com composição SINAPI, ou informe a produtividade manualmente. Os valores abaixo NÃO são uma estimativa de obra.");
      } else if (!reconConfiavel) {
        if (orcadoMOExato > 0) sugestoes.push("Há itens SINAPI, mas nenhuma DIÁRIA REAL cadastrada no RH que case as profissões — o custo simulado usou a própria referência SINAPI (comparar SINAPI × SINAPI daria sempre 0%). Cadastre sua equipe em RH para checar custo real × orçado.");
        else sugestoes.push("Nenhum item com composição SINAPI para reconciliar o custo de MO — a base é própria/estadual. O prazo/equipe abaixo saem das quantidades e da MO-R$ do orçamento; para checar custo × orçado, use itens SINAPI + equipe no RH.");
      } else if (status === "acima") {
        sugestoes.push("A mão-de-obra com diária real está " + desvioPct.toFixed(1) + "% ACIMA do orçado (na porção reconciliável). Foque nas etapas de maior custo (abaixo).");
        sugestoes.push("Opções: renegociar a diária das profissões mais caras, aumentar produtividade, ou repassar o excedente ao BDI/contrato.");
      } else if (status === "abaixo") {
        sugestoes.push("A MO com diária real está " + Math.abs(desvioPct).toFixed(1) + "% ABAIXO do orçado" + (houveEncargo ? " (já com os encargos patronais de " + (num(params.encargosPct) || 0) + "% aplicados às suas diárias CLT)." : ". ⚠ Confira se as diárias no RH já incluem os encargos — senão a folga pode ser só o encargo a pagar."));
        sugestoes.push("Se a folga for real, dá pra adiantar o prazo (mais frentes) ou guardar como contingência.");
      } else {
        sugestoes.push("A MO com diária real fecha DENTRO do orçado (desvio " + desvioPct.toFixed(1) + "%, na porção reconciliável). Coerente com o previsto.");
      }
      if (coberturaBaixa) sugestoes.push("⚠ Reconciliação PARCIAL: só " + Math.round(reconCobPct) + "% do custo de MO-SINAPI tem diária real cadastrada. O veredito vale só p/ essa parte — cadastre as demais profissões no RH.");
      if (custoMORealSemBaseTot > 0) sugestoes.push("⚠ Algumas profissões têm diária real cadastrada mas a linha de MO do SINAPI vem sem preço (custo-hora 0) — R$ " + Math.round(custoMORealSemBaseTot) + " de custo real ficaram FORA do veredito por não haver orçado-SINAPI p/ comparar.");
      if (nEtapasSemBase > 0 && !semBaseMO) sugestoes.push("⚠ " + nEtapasSemBase + " etapa(s) de base estadual sem coeficiente de MO NÃO entram no prazo nem na equipe (aparecem como “não estimável”). O prazo/equipe cobrem só o restante.");
      if (entregaInvalida) sugestoes.push("⚠ Data de entrega inválida (anterior ao início) — ignorada; mostrando o prazo natural da obra.");
      else if (modo === "prazo" && !semBaseMO) {
        if (metaAtingida) { if (prazoNatural > prazoAlvo) sugestoes.push("Para bater a entrega, a equipe foi reforçada (veja a equipe de pico). Sem reforço, a obra levaria ~" + prazoNatural + " dias úteis."); }
        else sugestoes.push("⚠ A data de entrega NÃO é alcançável com este dimensionamento: o mínimo é ~" + prazoFinal + " dias úteis (você pediu " + prazoAlvo + "). Reveja o escopo, o paralelismo, ou a data.");
      }

      return {
        etapas: etapas, params: params, modo: modo, metaAtingida: metaAtingida, entregaInvalida: entregaInvalida,
        prazoNatural: prazoNatural, prazoAlvo: prazoAlvo, prazoDias: prazoFinal,
        prazoSemanas: Math.max(1, Math.ceil(prazoFinal / (num(params.diasUteisSemana) || 5))),
        dataInicio: ini, dataFim: (C && C.addDiasUteis) ? C.addDiasUteis(ini, prazoFinal, params.diasUteisSemana) : null,
        equipePico: equipePico,
        custoMOSimulado: custoMOTotal, orcadoMO: orcadoMOTotal,
        custoMOExato: custoMOExato, orcadoMOExato: orcadoMOExato,
        custoMOReal: custoMOReal, orcadoMOReal: orcadoMOReal, temDiariaReal: temDiariaReal,
        reconConfiavel: reconConfiavel, coberturaBaixa: coberturaBaixa, reconCobPct: reconCobPct,
        semBaseMO: semBaseMO, nEtapasSemBase: nEtapasSemBase, custoSemBaseMO: custoSemBaseMOTot, custoMORealSemBase: custoMORealSemBaseTot,
        desvio: desvio, desvioPct: desvioPct, status: status, tolerancia: tol,
        rankingCusto: ranking, sugestoes: sugestoes,
        cobertura: { exatos: coberturaN, total: coberturaTot, pct: coberturaPct }
      };
    },

    // Aplica as durações do agente no objeto cronograma COM PROVENIÊNCIA (Node-testável).
    // Só grava etapa fundamentada (temBaseMO && duracao>0) e marca em duracoesAgente. Se uma etapa
    // antes gravada pelo agente virou "não estimável", REMOVE o valor stale (senão ressurgiria como
    // override "editado" falso no Gantt/Curva-S/Excel/proposta). Edição MANUAL do usuário (não marcada
    // em duracoesAgente) é preservada. Retorna {enviadas, puladas}.
    aplicarNoCronograma: function (cron, etapas) {
      cron.duracoes = cron.duracoes || {};
      cron.duracoesAgente = cron.duracoesAgente || {};
      cron.iaMotivos = cron.iaMotivos || {};
      var nEnv = 0, lista = etapas || [];
      lista.forEach(function (et) {
        if (et.temBaseMO && num(et.duracao) > 0) {
          cron.duracoes[et.id] = et.duracao; cron.duracoesAgente[et.id] = "exec";
          if (cron.iaMotivos[et.id]) delete cron.iaMotivos[et.id]; // a duração deste agente substitui o motivo antigo da IA
          nEnv++;
        } else if (cron.duracoesAgente[et.id] === "exec") {
          // só remove o que ESTE agente (exec) gravou e ficou stale. NÃO toca em edição manual do
          // usuário (sem marca) nem em estimativa da IA (marca "ia") — a IA consegue estimar etapa estadual.
          delete cron.duracoes[et.id]; delete cron.duracoesAgente[et.id];
          if (cron.iaMotivos[et.id]) delete cron.iaMotivos[et.id];
        }
      });
      return { enviadas: nEnv, puladas: lista.length - nEnv };
    },

    _diasUteisEntre: function (ini, fim, diasSemana, C) {
      var a = new Date(ini + "T00:00:00"), b = new Date(fim + "T00:00:00"); if (b <= a) return 0;
      var n = 0, d = new Date(a.getTime());
      while (d < b) { d.setDate(d.getDate() + 1); var wd = d.getDay(); if (diasSemana >= 7) n++; else if (diasSemana === 6) { if (wd !== 0) n++; } else { if (wd !== 0 && wd !== 6) n++; } }
      return n;
    }
  };

  global.Execucao = Execucao;
  if (typeof module !== "undefined" && module.exports) module.exports = Execucao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
