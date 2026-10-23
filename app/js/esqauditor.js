/* =====================================================================
 * esqauditor.js — AUDITOR DE ESQUADRIAS (20/10/2026). Motor PURO, ES5, Node-testável.
 *
 * No molde do tools/hid-auditar-projeto.js: confere o modelo PRONTO (lançado à mão ou pelo "Portas e janelas
 * automáticas") com regras objetivas, SEM confiar no lançador — a área de janela, a distância à divisa e a varredura
 * da folha são refeitas aqui. Regra do dono (problema sempre com solução, 15/10/2026): cada achado sai no formato do
 * js/problemacard.js — o que é, "Corrigir: …" (as ops já calculadas, aplicadas num lote com Ctrl+Z) e "Mostrar no 3D"
 * (as peças). Solução sem ação vira nota, nunca botão vazio.
 *
 *   EsqAuditor.auditar({ estado, avaliarFam, criterios, acessivel, municipio, uso }) → { problemas[], porCodigo{}, ambientes[], criterios, codigo }
 *     municipio = "Uberlândia/MG" (ou o texto do local da obra): a regra mora em js/esqcodigo.js; sem regra cadastrada → padrão nacional conservador
 *     uso = "residencial_unifamiliar" (padrão) | "residencial_vertical" | "nao_residencial" — conta no art. 52 (banheiro) e no art. 72 (áreas)
 *
 * CÓDIGOS (gravidade · nível de fonte):
 *   ESQ_ILUMINACAO   erro  · B  área do VÃO das janelas < fração × área do piso (1/6 prolongada, 1/8 transitória — art. 53 da LC 524/2011, provisório)
 *   ESQ_VENTILACAO   erro  · B  área que ABRE das esquadrias (geometria da família) < 50 % da iluminação exigida (art. 54)
 *   ESQ_SEM_JANELA   erro  · B  ambiente de permanência prolongada sem parede externa / sem janela (art. 51)
 *   ESQ_BANHO_VENT   aviso · B/A  banheiro/lavabo sem janela: em casa unifamiliar de Uberlândia, aviso com o laudo + ART do art. 51, par. único, VIII
 *                          (LC 739/2022) e "ponto a confirmar com a Seplan" — NUNCA erro (revisão 21/10/2026); lavabo, vertical e não residencial: aviso
 *   ESQ_PROFUNDIDADE erro  · B  ponto mais afastado a mais de 2,5 × pé-direito da abertura (2,0 × para espaço interno) — art. 50
 *   ESQ_PE_DIREITO   erro  · B  pé-direito < 2,40 (transitória) / 2,60 m (demais) — art. 41
 *   ESQ_AREA_MINIMA  erro  · B  área ou dimensão (círculo inscrito) abaixo do art. 72 (sala 7, dormitório 7/6, cozinha 5, banheiro 1,80/1,20, serviço 1,50 m²)
 *   ESQ_POCO         erro  · A/B poço de luz / claraboia: círculo ≥ 1,50 m (art. 48, LC 739/2022), área 6,00 / 4,00 m² (art. 49)
 *   ESQ_CLASSE_PENDENTE aviso · X  área de serviço não classificada na lei: regra mais exigente aplicada, confirmar
 *   ESQ_MUNICIPIO    aviso · C  município sem regra cadastrada: padrão nacional conservador, conferir o código de obras
 *   ESQ_DIVISA       erro  · A  janela a < 1,50 m da divisa que ela vê, de frente ou oblíqua (Código Civil art. 1.301; Súmula 414 STF)
 *   ESQ_DIVISA_LADO  erro  · A  ponta da janela a < 0,75 m da divisa perpendicular (art. 1.301 § 1º)
 *   ESQ_DIVISA_MUN   erro  · B  eixo da abertura a < 1,50 m da divisa na perpendicular (art. 47 da LC 524/2011; porta externa e frente do lote = aviso)
 *   ESQ_DIVISA_PENDENTE aviso    sem lote modelado: distância à divisa NÃO conferida
 *   ESQ_GUARDA_BORDA / _MURETA / _JANELA / _ESCADA  erro · A  desnível > 1,00 m sem guarda-corpo (NBR 14718:2019, 4.1) — Corrigir lança o guarda-corpo
 *   ESQ_GUARDA_ALTURA erro · A  guarda-corpo com H < 1,10 m, vão-luz > 0,11 m ou sem barreira de piso
 *   ESQ_PORTA_LARG   erro  · B/C folha abaixo do mínimo do ambiente
 *   ESQ_PORTA_ACESS  erro  · A  vão livre < 0,80 m num projeto acessível (NBR 9050:2020 6.11.2.4)
 *   ESQ_BANHO_ACESS  erro  · A  banheiro acessível com porta de giro abrindo para dentro (NBR 9050:2020 7.5)
 *   ESQ_PORTA_COLISAO erro · C  a folha aberta bate em outra porta, móvel ou louça
 *   ESQ_SEM_PORTA    erro  · C  ambiente sem porta (e sem passagem aberta)
 *   ESQ_PEITORIL     aviso · C  peitoril fora da faixa do ambiente (critério RA)
 *   ESQ_NOME         aviso · C  nome do ambiente sem tipo conhecido
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("EsqRegras", "./esqregras.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ECod() { return dep("EsqCodigo", "./esqcodigo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  function semFamilia(estado, id) {
    var e = {}; Object.keys(estado || {}).forEach(function (k) { e[k] = estado[k]; });
    e.familias = arr(estado && estado.familias).filter(function (f) { return f && String(f.id) !== String(id); });
    return e;
  }
  /* varredura própria (não usa a do lançador): quarto de círculo em pontos */
  function quarto(EAm, w, v) {
    var u = EAm.eixoU(w.rotY), n = EAm.eixoN(w.rotY), sH = v.maoDireita ? 1 : -1, lado = v.abreFora ? 1 : -1;
    var H = EAm.ptParede(w, v.t + sH * v.folha / 2, lado * w.espessura / 2), dF = [-sH * u[0], -sH * u[1]], dA = [lado * n[0], lado * n[1]], pts = [];
    for (var i = 1; i <= 6; i++) for (var j = 0; j <= 12; j++) { var r = v.folha * 0.98 * i / 6, a = Math.PI / 180 * (3 + 87 * j / 12); pts.push([H[0] + r * (Math.cos(a) * dF[0] + Math.sin(a) * dA[0]), H[1] + r * (Math.cos(a) * dF[1] + Math.sin(a) * dA[1])]); }
    function tem(p) { var q = [p[0] - H[0], p[1] - H[1]], x = q[0] * dF[0] + q[1] * dF[1], y = q[0] * dA[0] + q[1] * dA[1]; return x >= -1e-3 && y >= 0.01 && x * x + y * y <= v.folha * v.folha; }
    return { pts: pts, tem: tem, lado: lado };
  }

  function auditar(o) {
    o = o || {};
    var R = RG(), EAm = EA(), EC = ECod(), K = EC.resolver(o.municipio), uso = EC.usoValido(o.uso), C = R.criterios(o.criterios, K), est = o.estado, aval = o.avaliarFam;
    var L = EAm.leitura(est, aval), probs = [];
    function p(cod, grav, nivel, titulo, texto, pecas, solucoes) {
      probs.push({ tipo: cod, codigo: cod, gravidade: grav, nivel: nivel, nivelRotulo: R.rotuloNivel(nivel), titulo: titulo, texto: texto, pecas: arr(pecas).map(String), solucoes: arr(solucoes) });
    }
    function gerarPara(ambId, estX) {
      var g = EAm.gerar({ estado: estX || est, avaliarFam: aval, ambientes: [ambId], criterios: o.criterios, acessivel: o.acessivel, municipio: o.municipio, uso: o.uso, loteId: "corr-" + ambId });
      return g.ok ? g.ops : [];
    }
    function noTrecho(v, tr) { return v.parede === tr.paredeId && v.t >= tr.t0 - 0.02 && v.t <= tr.t1 + 0.02; }
    var porAmb = {}; L.ambientes.forEach(function (a) { porAmb[a.id] = a; });

    /* ---------------- o código de obras em uso (município) e a classe de cada ambiente */
    var nBanheiros = L.ambientes.filter(function (a) { return a.tipo.id === "banheiro"; }).length;
    var dorms = L.ambientes.filter(function (a) { return a.tipo.id === "dormitorio" || a.tipo.id === "suite"; }).map(function (a) { return { id: a.id, area: a.area }; });
    var temExterna = false;
    /* a altura MÉDIA do ambiente (volume ÷ área, com o forro inclinado/parcial já cortado — js/bimambiente.js calc.alturaVolume) */
    var calcPorId = {}; arr(est && est.ambientes).forEach(function (x) { if (x && x.calc) calcPorId[String(x.id)] = x.calc; });
    function peMedioDe(id) { var c = calcPorId[String(id)], v = c ? Number(c.alturaVolume) : NaN; return isFinite(v) && v > 0 && c.forrosVolume && c.forrosVolume.length ? v : null; }
    if (K.aviso) p("ESQ_MUNICIPIO", "aviso", "C", "Código de obras: padrão nacional conservador", K.aviso + " " + K.conferir, [],
      [{ id: "nota-mun", texto: "Escolha o município em Critérios das esquadrias. Sem regra cadastrada vale o padrão nacional conservador." }]);

    /* ---------------- janelas por ambiente */
    L.ambientes.forEach(function (a) {
      var def = a.tipo.def, fr = R.fracaoIluminacao(def, C), ce = EC.classeEfetiva(K, a.tipo.id, def.classe);
      if (!a.tipo.casou) p("ESQ_NOME", "aviso", "C", "\"" + a.nome + "\": nome sem tipo conhecido", "Sem tipo, vale a regra mais restritiva (permanência prolongada). Renomeie (Sala, Quarto, Cozinha, Banheiro…) para a regra certa.", [a.id],
        [{ id: "nota-nome", texto: "Renomeie o ambiente em Propriedades › Nome." }]);
      if (ce.pendente) p("ESQ_CLASSE_PENDENTE", "aviso", "X", "\"" + a.nome + "\": classificação pendente no código de obras", ce.texto, [a.id],
        [{ id: "nota-classe", texto: "Confirme a classificação com a Prefeitura; até lá vale a regra mais exigente (já aplicada)." }]);
      /* pé-direito (art. 41) e área/dimensão mínimas (art. 72) */
      EC.conferirAmbiente(K, { id: a.id, nome: a.nome, tipoId: a.tipo.id, classe: ce.classe, area: a.area, pe: a.pe, peMedio: peMedioDe(a.id), pts: a.pts }, { uso: uso, nBanheiros: nBanheiros, dormitorios: dorms }).forEach(function (q) {
        p(q.codigo, q.gravidade, q.nivel, q.titulo, q.texto, [a.id], [{ id: "nota-" + q.codigo, texto: q.solucao }]);
      });
      /* poço de luz / claraboia (arts. 48 e 49) */
      if (def.descoberto) {
        var servidos = []; L.ambientes.forEach(function (b) { if (b.trechos.some(function (tr) { return tr.vizinho === a.id; })) servidos.push({ classe: EC.classeEfetiva(K, b.tipo.id, b.tipo.def.classe).classe }); });
        var paredesPoco = {}; a.trechos.forEach(function (tr) { paredesPoco[tr.paredeId] = 1; });
        EC.conferirPoco(K, { id: a.id, nome: a.nome, area: a.area, pts: a.pts, faces: Object.keys(paredesPoco).length || null }, servidos).forEach(function (q) {
          p(q.codigo, q.gravidade, q.nivel, q.titulo, q.texto, [a.id], [{ id: "nota-" + q.codigo, texto: q.solucao }]);
        });
      }
      if (!fr || !def.janela || !def.janela.famId) return;
      var area = 0, vent = 0, ids = [], ext = a.trechos.filter(EAm.externo), abre = [], incertos = [];
      if (ext.length) temExterna = true;
      ext.forEach(function (tr) { L.vaos.forEach(function (v) { if (noTrecho(v, tr) && (v.tipo === "janela" || v.correr)) { var ar = v.largura * v.altura; area += ar * R.fatorIluminacao(v.famId, C); vent += v.abre; ids.push(v.id); if (v.abreIncerto) incertos.push(v.id); abre.push(v.id + (v.abreIncerto ? " (abertura não declarada pela família)" : " abre " + f2(v.abre) + " m² de " + f2(ar) + " m²")); } }); });
      var exig = fr.valor * a.area, ventExig = exig * C.ventilacaoDaIluminacao.valor, fonte = fr.fonte, fracTxt = a.tipo.classe === "transitoria" ? "1/8" : "1/6";
      var banho = a.tipo.id === "banheiro" || a.tipo.id === "lavabo";
      if (!ids.length) {
        if (!def.janela.exige) return;
        if (banho) {
          var S = K.sanitario, ops1 = ext.length ? [{ id: "gerar", texto: "Lançar basculante na parede externa", ops: gerarPara(a.id) }] : [{ id: "nota-mec", texto: "Sem parede externa: especifique exaustor ou duto de ventilação no projeto." }];
          if (S && a.tipo.id === "lavabo") {
            p("ESQ_BANHO_VENT", "aviso", S.nivel, "\"" + a.nome + "\" sem janela", "Lavabo sem abertura para fora: " + S.lavaboArtificial + " (" + K.sigla + ", art. " + S.artAbertura + ", parágrafo único). Especifique o duto/poço ou exaustor no projeto. " + S.duto + ".", [a.id], ops1);
          } else if (S && uso === "residencial_unifamiliar") {
            /* AVISO, não erro (revisão 21/10/2026): o art. 51, parágrafo único, VIII (LC 739/2022) aceita ventilação artificial com laudo + ART */
            p("ESQ_BANHO_VENT", "aviso", "B", "\"" + a.nome + "\" sem janela para espaço descoberto", "Em residência unifamiliar o banheiro deve ter abertura para espaço descoberto (" + K.sigla + ", art. " + S.artAbertura + "); a ventilação indireta ou forçada por duto/chaminé do art. " + S.artIndireta + " é das edificações não residenciais e residenciais verticais. Sem janela, " + (S.laudoArtificial || "a ventilação artificial depende da Prefeitura") + ". " + S.confirmar + "; " + (S.seplan || "ponto a confirmar com a Prefeitura") + ".", [a.id],
              ops1.concat([{ id: "nota-laudo", texto: "Se não houver parede externa: especifique o exaustor e anexe laudo técnico + ART da ventilação artificial (art. " + S.artAbertura + ", parágrafo único, VIII) e confirme com a Seplan." }]));
          } else if (S) {
            p("ESQ_BANHO_VENT", "aviso", S.nivel, "\"" + a.nome + "\" sem janela", "Sanitário sem abertura para fora: nesta edificação (" + (EC.USOS[uso] || uso) + ") o art. " + S.artIndireta + " admite ventilação indireta ou forçada. " + S.duto + ".", [a.id], ops1);
          } else {
            p("ESQ_BANHO_VENT", "aviso", "B", "\"" + a.nome + "\" sem janela", "Banheiro/lavabo sem abertura para fora: precisa de ventilação mecânica (exaustor) ou indireta (duto/poço), se o código de obras do município admitir. " + fonte + ".", [a.id], ops1);
          }
          return;
        }
        p("ESQ_SEM_JANELA", "erro", "B", "\"" + a.nome + "\" sem janela", "Ambiente de permanência " + (a.tipo.classe || "") + " sem abertura: exigido " + f2(exig) + " m² (" + fracTxt + " de " + f2(a.area) + " m²). " + fonte + (K.padrao ? "" : "; abertura para espaço descoberto: art. 51") + ".", [a.id],
          ext.length ? [{ id: "gerar", texto: "Lançar a janela automática", ops: gerarPara(a.id) }] : [{ id: "nota-planta", texto: "O ambiente não tem parede externa: reveja a planta (pátio, poço de luz ou mudar o uso)." }]);
        return;
      }
      if (area < exig - 1e-6) p("ESQ_ILUMINACAO", "erro", "B", "\"" + a.nome + "\": janela pequena (" + f2(area) + " de " + f2(exig) + " m²)", "Iluminação ≥ " + fracTxt + " da área do piso, contada pela área do VÃO (\"área das aberturas\"). " + fonte + ".", [a.id].concat(ids),
        [{ id: "gerar", texto: "Completar a área com janela automática", ops: gerarPara(a.id) }]);
      /* esquadria que não declara como abre (importada / sem parte móvel): a ventilação é DESCONHECIDA, não zero → aviso, não erro (revisão 21/10/2026) */
      if (vent < ventExig - 1e-6 && incertos.length) p("ESQ_VENTILACAO", "aviso", "C", "\"" + a.nome + "\": ventilação não medida (" + incertos.join(", ") + ")", "A ventilação é a área que ABRE da esquadria (≥ " + Math.round(C.ventilacaoDaIluminacao.valor * 100) + " % da iluminação exigida = " + f2(ventExig) + " m²), mas a família de " + incertos.join(", ") + " não declara a parte móvel (família importada, fixa ou sem movimento cadastrado): o que abre não foi medido. Medido nas demais: " + f2(vent) + " m². " + C.ventilacaoDaIluminacao.fonte + ".", [a.id].concat(ids),
        [{ id: "nota-abre", texto: "Confira com o fabricante a área de abertura de " + incertos.join(", ") + "; se for fixa, troque por uma que abra (ou use Completar a ventilação)." }, { id: "gerar", texto: "Completar a ventilação com janela automática", ops: gerarPara(a.id) }]);
      else if (vent < ventExig - 1e-6) p("ESQ_VENTILACAO", "erro", "B", "\"" + a.nome + "\": ventilação " + f2(vent) + " de " + f2(ventExig) + " m²", "Ventilação ≥ " + Math.round(C.ventilacaoDaIluminacao.valor * 100) + " % da iluminação exigida (" + f2(exig) + " m²), medida pela área que ABRE da esquadria, pela geometria da família: " + abre.join("; ") + ". " + C.ventilacaoDaIluminacao.fonte + ".", [a.id].concat(ids),
        [{ id: "gerar", texto: "Completar a ventilação com janela automática", ops: gerarPara(a.id) }]);
      /* ART. 50: o ponto mais afastado do ambiente × o pé-direito */
      if (K.profundidade && a.pe > 0) {
        var abs = [];
        ext.forEach(function (tr) {
          var w = L.porParede[tr.paredeId]; if (!w) return;
          L.vaos.forEach(function (v) { if (noTrecho(v, tr) && (v.tipo === "janela" || v.correr)) abs.push({ a: EAm.ptParede(w, v.t - v.largura / 2, tr.lado * w.espessura / 2), b: EAm.ptParede(w, v.t + v.largura / 2, tr.lado * w.espessura / 2), interno: tr.poco === true }); });
        });
        var prof = EC.profundidade(K, a.pe, a.pts, abs);
        if (prof && !prof.ok) {
          var gp = gerarPara(a.id);
          p("ESQ_PROFUNDIDADE", K.gravidadeNovas, prof.nivel, "\"" + a.nome + "\": ponto mais afastado a " + f2(prof.maxima) + " m da abertura (máximo " + f2(prof.limite) + " m)",
            "Nenhum compartimento é considerado iluminado e ventilado quando o ponto mais afastado dista da abertura mais de " + f2(prof.fator) + " × o pé-direito (" + f2(a.pe) + " m) = " + f2(prof.limite) + " m, " + (prof.interno ? "para espaço interno" : "para espaço externo") + " (" + prof.citacao + ").", [a.id].concat(ids),
            gp.length ? [{ id: "gerar", texto: "Acrescentar janela mais perto do ponto mais afastado", ops: gp }] : [{ id: "nota-prof", texto: "Aproxime a abertura do fundo do ambiente (janela em outra parede) ou reduza a profundidade do ambiente a até " + f2(prof.limite) + " m da abertura." }]);
        }
      }
      /* peitoril — a faixa do ambiente com a trava do guarda-corpo no pavimento de cima (a MESMA do lançador: EsqAuto.faixaPeitoril) */
      var fpA = EAm.faixaPeitoril ? EAm.faixaPeitoril(L, a, def.janela.peitoril) : { pf: def.janela.peitoril, regra: null }, pf = fpA.pf;
      ext.forEach(function (tr) {
        L.vaos.forEach(function (v) {
          if (!noTrecho(v, tr) || v.tipo !== "janela" || !pf) return;
          if (v.peitoril < pf[0] - 1e-6 || v.peitoril > pf[1] + 1e-6) {
            var alvo = Math.min(pf[1], Math.max(pf[0], r4(C.verga.valor - v.altura)));
            p("ESQ_PEITORIL", "aviso", "C", "Janela " + v.id + " (" + a.nome + "): peitoril " + f2(v.peitoril) + " m", "A faixa do critério RA para " + a.tipo.rotulo.toLowerCase() + " é " + f2(pf[0]) + "–" + f2(pf[1]) + " m (prática de projeto, editável; NBR 15575-1:2013 13.2.6 recomenda ≤ 1,00 em sala e dormitório)" + (fpA.regra ? "; aqui " + fpA.regra : "") + ".", [v.id],
              [{ id: "peitoril", texto: "Peitoril em " + f2(alvo) + " m", ops: [{ op: "instancia", id: v.id, inst: { Peitoril: alvo } }] }]);
          }
        });
      });
    });

    /* ---------------- divisa: Código Civil 1.301 e, em Uberlândia, o art. 47 da LC 524/2011 (perpendicular do eixo) */
    var lc47 = K.divisa && K.divisa.referencia === "eixo" ? K.divisa : null;
    if (L.divisa) L.ambientes.forEach(function (a) {
      a.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        var w = L.porParede[tr.paredeId]; if (!w) return;
        L.vaos.forEach(function (v) {
          if (!noTrecho(v, tr)) return;
          var eh = v.tipo === "janela" || v.correr, de = lc47 ? EAm.distEixoDivisa(L, w, tr.lado, v.t) : null, f47 = de && de.dist < lc47.minimo - 1e-6, txt47 = "", base47 = "";
          if (f47) {
            base47 = K.sigla + ", art. " + lc47.art + ": nenhuma abertura a menos de " + f2(lc47.minimo) + " m da divisa, medido em planta na perpendicular do eixo da abertura — o eixo fica a " + f2(de.dist) + " m da divisa (" + de.ladoNome + "; nível B, " + EC.CONFERIR_UDI + ")" + (de.frente ? ". " + K.divisa.frenteViaPublica : "");
            txt47 = " Também fere a " + base47 + ".";
          }
          if (!eh) {
            /* porta externa que não é de correr: o art. 47 diz "abertura"; entra como aviso (a lei não separa porta de janela, ponto a confirmar) */
            if (f47 && v.tipo === "porta") p("ESQ_DIVISA_MUN", "aviso", "B", "Porta " + v.id + ": eixo a " + f2(de.dist) + " m da divisa", "Porta externa a menos de " + f2(lc47.minimo) + " m da divisa." + txt47 + " O texto diz \"abertura\" sem separar porta de janela: ponto a confirmar.", [v.id],
              [{ id: "nota-porta", texto: "Afaste a porta da divisa (eixo a " + f2(lc47.minimo) + " m ou mais) ou confirme com a Prefeitura se porta entra no art. " + lc47.art + "." }]);
            return;
          }
          var d = EAm.distDivisa(L, w, tr.lado, v.t - v.largura / 2, v.t + v.largura / 2, C);
          if (d.frente < C.divisaFrente.valor - 1e-6) {
            var e2 = semFamilia(est, v.id);
            p("ESQ_DIVISA", "erro", "A", "Janela " + v.id + " a " + f2(d.frente) + " m da divisa", "Abertura que vê a divisa (de frente ou oblíqua) precisa de ≥ " + f2(C.divisaFrente.valor) + " m (" + C.divisaFrente.fonte + "). O vizinho pode exigir o fechamento." + txt47, [v.id],
              [{ id: "relancar", texto: "Tirar a janela e relançar longe da divisa", ops: [{ op: "apagar", id: v.id }].concat(gerarPara(a.id, e2)) }, { id: "apagar", texto: "Só tirar a janela", ops: [{ op: "apagar", id: v.id }] }]);
          } else if (d.lado < C.divisaPerpendicular.valor - 1e-6) {
            /* o § 1º PROÍBE ("não poderão ser abertas"): erro, não aviso — e a correção relança longe da divisa */
            var e3 = semFamilia(est, v.id);
            p("ESQ_DIVISA_LADO", "erro", "A", "Janela " + v.id + ": ponta a " + f2(d.lado) + " m da divisa perpendicular", "Janela perpendicular à divisa (sem visão sobre ela) precisa de ≥ " + f2(C.divisaPerpendicular.valor) + " m (" + C.divisaPerpendicular.fonte + ")." + txt47, [v.id],
              [{ id: "relancar", texto: "Tirar a janela e relançar longe da divisa", ops: [{ op: "apagar", id: v.id }].concat(gerarPara(a.id, e3)) }, { id: "apagar", texto: "Só tirar a janela", ops: [{ op: "apagar", id: v.id }] }]);
          } else if (f47) {
            /* só a lei municipal pega (o Código Civil passa): erro, salvo a frente do lote (via pública), que a lei não esclarece */
            var e4 = semFamilia(est, v.id);
            p("ESQ_DIVISA_MUN", de.frente ? "aviso" : "erro", "B", "Janela " + v.id + ": eixo a " + f2(de.dist) + " m da divisa", "Fere a " + base47 + ".", [v.id],
              [{ id: "relancar", texto: "Tirar a janela e relançar longe da divisa", ops: [{ op: "apagar", id: v.id }].concat(gerarPara(a.id, e4)) }, { id: "apagar", texto: "Só tirar a janela", ops: [{ op: "apagar", id: v.id }] }]);
          }
        });
      });
    });
    /* sem divisa modelada: a distância à divisa NÃO foi conferida — pendência explícita, não "ok" */
    if (!L.divisa && temExterna && L.vaos.some(function (v) { return v.tipo === "janela" || v.correr; })) p("ESQ_DIVISA_PENDENTE", "aviso", lc47 ? "B" : "A", "Divisa do lote não modelada: distância das janelas à divisa sem conferir",
      "Sem o lote não dá para medir a distância das aberturas à divisa: Código Civil art. 1.301 (1,50 m; 0,75 m na perpendicular)" + (lc47 ? " e " + K.sigla + ", art. " + lc47.art + " (1,50 m na perpendicular do eixo da abertura)" : "") + " ficam PENDENTES.", [],
      [{ id: "nota-lote", texto: "Lance a divisa do terreno (Terreno › Divisa) e audite de novo." }]);

    /* ---------------- portas */
    var portas = L.vaos.filter(function (v) { return v.tipo === "porta"; });
    function ambsDaPorta(v) {
      var out = [];
      L.ambientes.forEach(function (a) { a.trechos.forEach(function (tr) { if (noTrecho(v, tr) && out.indexOf(a) < 0) out.push(a); }); });
      return out;
    }
    function acessivelAmb(a) { return !!o.acessivel || /\b(pne|pcd|acessivel)\b/.test(R.normalizar(a.nome)); }
    function colisoesDe(v, inst) {
      var w = L.porParede[v.parede]; if (!w || v.correr) return [];
      var vv = { t: v.t, folha: v.folha, maoDireita: inst ? inst.mao : v.maoDireita, abreFora: inst ? inst.fora : v.abreFora }, Q = quarto(EAm, w, vv), out = [];
      var alvoAmb = null; L.ambientes.forEach(function (a) { if (EAm.dentro(EAm.ptParede(w, v.t, Q.lado * (w.espessura / 2 + 0.2)), a.pts) && a.pav === v.pav) alvoAmb = a; });
      if (alvoAmb && Q.pts.some(function (q) { return !EAm.dentro(q, alvoAmb.pts) && EAm.foraDoLivre(L, q, v.pav); })) out.push({ tipo: "fora", nome: "a parede de \"" + alvoAmb.nome + "\"" });
      L.moveis.forEach(function (m) { if (m.pav !== v.pav || m.y >= 2.0) return; if (Q.pts.some(function (q) { return EAm.dentro(q, m.pts); }) || m.pts.some(Q.tem)) out.push({ tipo: "movel", id: m.id, nome: m.nome }); });
      portas.forEach(function (x) {
        if (x.id === v.id || x.correr) return; var w2 = L.porParede[x.parede]; if (!w2) return;
        var Q2 = quarto(EAm, w2, x);
        if (Q.pts.some(Q2.tem) || Q2.pts.some(Q.tem)) out.push({ tipo: "porta", id: x.id, nome: "a porta " + x.id });
      });
      return out;
    }
    portas.forEach(function (v) {
      var as = ambsDaPorta(v), dono = as.slice().sort(function (x, y) { return R.privacidade(x.tipo.id) - R.privacidade(y.tipo.id); })[0];
      if (!dono) return;
      var def = dono.tipo.def, acc = as.some(acessivelAmb), ehGiro = v.famId === "ra-porta-giro";
      var min = def.porta && def.porta.minimo ? def.porta.minimo / 100 : 0.6, vl = v.folha - C.descontoVaoLivre.valor;
      function trocarPara(folhaMin) { var P = R.PORTAS.filter(function (x) { return x.folha / 100 >= folhaMin - 1e-6; })[0]; return ehGiro && P ? [{ id: "tipo", texto: "Trocar para a folha de " + f2(P.folha / 100) + " m", ops: [{ op: "instancia", id: v.id, tipoId: P.tipoId }] }] : [{ id: "nota-tipo", texto: "Escolha um tipo mais largo em Propriedades." }]; }
      if (!v.correr && v.folha < min - 1e-6) p("ESQ_PORTA_LARG", "erro", "B", "Porta " + v.id + " (" + dono.nome + "): folha " + f2(v.folha) + " m < " + f2(min) + " m", "Mínimo do ambiente: " + C.portaMinimaFonte.fonte + ".", [v.id], trocarPara(Math.max(min, def.porta && def.porta.folha ? def.porta.folha / 100 : min)));   /* corrige para a folha típica do ambiente (C), não só o mínimo */
      if (acc && vl < C.vaoLivreAcessivel.valor - 1e-6) p("ESQ_PORTA_ACESS", "erro", "A", "Porta " + v.id + ": vão livre ≈ " + f2(vl) + " m < " + f2(C.vaoLivreAcessivel.valor) + " m", "Rota acessível: " + C.vaoLivreAcessivel.fonte + " (vão livre ≈ folha − " + f2(C.descontoVaoLivre.valor) + " m, " + C.descontoVaoLivre.fonte + ").", [v.id], trocarPara(C.vaoLivreAcessivel.valor + C.descontoVaoLivre.valor));
      var banho = as.filter(function (a) { return (a.tipo.id === "banheiro" || a.tipo.id === "lavabo") && acessivelAmb(a); })[0];
      if (banho && ehGiro) {
        var w = L.porParede[v.parede], trB = banho.trechos.filter(function (tr) { return noTrecho(v, tr); })[0];
        var abreParaDentro = trB && ((v.abreFora ? 1 : -1) === trB.lado);
        if (abreParaDentro && w) p("ESQ_BANHO_ACESS", "erro", "A", "Porta " + v.id + " do banheiro acessível abre para dentro", "NBR 9050:2020 7.5: a porta de eixo vertical do sanitário acessível abre para FORA (ou é de correr).", [v.id],
          [{ id: "inverter", texto: "Abrir para fora", ops: [{ op: "instancia", id: v.id, inst: { Abre_para_fora: !v.abreFora } }] }]);
      }
      var col = colisoesDe(v);
      if (col.length) {
        var sols = [];
        [{ mao: !v.maoDireita, fora: v.abreFora, t: "Espelhar a mão" }, { mao: v.maoDireita, fora: !v.abreFora, t: "Abrir para o outro lado" }, { mao: !v.maoDireita, fora: !v.abreFora, t: "Outro lado e outra mão" }].forEach(function (x, k) {
          if (sols.length) return;
          if (banho && x.fora !== v.abreFora) return;
          if (!colisoesDe(v, x).length) sols.push({ id: "inv" + k, texto: x.t, ops: [{ op: "instancia", id: v.id, inst: { Mao_direita: x.mao, Abre_para_fora: x.fora } }] });
        });
        if (!sols.length) sols.push({ id: "nota-mover", texto: "Nenhuma inversão resolve: arraste a porta na parede (cotas temporárias) ou mova o móvel." });
        p("ESQ_PORTA_COLISAO", "erro", "C", "Porta " + v.id + ": a folha bate em " + col.map(function (c) { return c.nome || c.id; }).join(", "), "A varredura da folha (quarto de círculo, raio = folha) não pode cruzar outra porta, móvel ou louça, nem sair do ambiente (critério RA).", [v.id].concat(col.filter(function (c) { return c.id; }).map(function (c) { return c.id; })), sols);
      }
    });
    /* ---------------- guarda-corpo (NBR 14718:2019): desnível que exige e não tem, altura/vão-luz do que existe (js/guardacorpo.js) */
    var GCm = dep("GuardaCorpo", "./guardacorpo.js");
    if (GCm) GCm.auditar({ estado: est, L: L, avaliarFam: aval, EAm: EAm, grupo: o.grupoGuarda, regiao: o.regiaoGuarda }).forEach(function (q) { p(q.codigo, q.gravidade, q.nivel, q.titulo, q.texto, q.pecas, q.solucoes); });
    /* ambiente sem porta */
    L.ambientes.forEach(function (a) {
      if (a.tipo.def.semPortaPropria || a.tipo.def.externo || a.tipo.def.porta === null) return;
      var tem = a.trechos.some(function (tr) { return portas.some(function (v) { return noTrecho(v, tr); }); });
      var internos = a.trechos.some(function (tr) { return tr.vizinho != null && tr.vizinho !== "?"; });
      if (!tem && !a.aberto) p("ESQ_SEM_PORTA", "erro", "C", "\"" + a.nome + "\" sem porta", "Nenhuma porta nas paredes do ambiente" + (internos ? "" : " (nem parede para outro ambiente: confira a separação)") + ".", [a.id],
        [{ id: "gerar", texto: "Lançar a porta automática", ops: gerarPara(a.id) }]);
    });
    probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) delete s.ops; }); });
    var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
    return { problemas: probs, porCodigo: porCod, ambientes: L.ambientes.map(function (a) { return { id: a.id, nome: a.nome, tipo: a.tipo.id, classe: a.tipo.classe, area: a.area }; }), criterios: C,
      codigo: { id: K.id, nome: K.nome, nivel: K.nivel, fonte: K.fonte, aviso: K.aviso, conferir: K.conferir, padrao: !!K.padrao, uso: uso, usoAssumido: o.uso == null } };
  }

  var EsqAuditor = { auditar: auditar };
  global.EsqAuditor = EsqAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = EsqAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
