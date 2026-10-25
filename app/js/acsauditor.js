/* =====================================================================
 * acsauditor.js — AUDITOR DE ACESSIBILIDADE (NBR 9050:2020, NBR 16537:2024, Lei 13.146/2015, Decretos 5.296/2004 e 9.451/2018) — 21/10/2026.
 * Motor PURO, ES5, Node-testável. Os números vêm do js/incregras.js (ACS.*), lidos dos exemplares da RA (licenciados).
 *
 * Não há lançamento automático de acessibilidade (decisão de projeto da pesquisa): o auditor APONTA e PROPÕE — cada achado no formato do
 * js/problemacard.js (o que é + Corrigir quando dá para corrigir com segurança — trocar a porta, inverter a abertura, ajustar a rampa —
 * + Mostrar no 3D). Onde a NBR 9050 e a IT 08 do CBMMG divergem, vale a MAIS RESTRITIVA e o texto diz qual item mandou.
 *
 * QUANDO É OBRIGATÓRIA: uso público ou coletivo (Lei 13.146 art. 56; Decreto 5.296 arts. 8 e 11; Lei 10.098 art. 11) — tudo;
 *   multifamiliar (A-2): as áreas de uso COMUM (Decreto 9.451/2018); residência unifamiliar (A-1): não obrigatória — só com "projeto
 *   acessível" (o cliente pediu); sem a divisão: um erro de dado (ACS_OBRIGATORIEDADE) e nada auditado até informar.
 *
 *   AcsAuditor.auditar({ estado, avaliarFam, dados: { divisao, acessivel, usoPublico } }) → { problemas[], porCodigo{}, escopo, resumo }
 * CÓDIGOS: ACS_ROTA_AUSENTE · ACS_PORTA_VAO · ACS_CIRCULACAO_LARGURA · ACS_DESNIVEL · ACS_RAMPA_INCLINACAO · ACS_SANIT_QUANTIDADE · ACS_SANIT_GIRO
 *   (critico) · ACS_PORTA_ESPACO · ACS_RAMPA_LARGURA_PATAMAR · ACS_RAMPA_CORRIMAO · ACS_ESCADA_DEGRAU · ACS_ESCADA_LARGURA · ACS_CORRIMAO_ESCADA · ACS_CIRC_VERTICAL_UMA_FORMA ·
 *   ACS_SANIT_PORTA · ACS_SANIT_LAVATORIO · ACS_PISO_TATIL_ALERTA · ACS_PORTA_BARRA_ANTIPANICO · ACS_VAGA_PCD · ACS_MULTIFAMILIAR_UH (alto) ·
 *   ACS_SANIT_PECAS · ACS_DESNIVEL (chanfro) (medio) · ACS_NAO_OBRIGATORIA · ACS_PENDENCIAS (info/pendente) · ACS_OBRIGATORIEDADE (critico: sem a divisão)
 * Teste: node tools/test-inc-acs.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("IncRegras", "./incregras.js"); }
  function IA() { return dep("IncAuto", "./incauto.js"); }
  function AUD() { return dep("IncAuditor", "./incauditor.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function dist(a, b) { var dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function distSeg(p, a, b) { var e = sub(b, a), l2 = dot(e, e), k = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), e) / l2)) : 0; return dist(p, add(a, e, k)); }
  function distBorda(p, P) { var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  var GRAV = { critico: "erro", alto: "aviso", medio: "aviso", info: "aviso", pendente: "aviso" };
  var COMUM = { circulacao: 1, escada: 1, garagem: 1, area_gourmet: 1 };
  var FORA = { tecnico: 1, poco: 1 };

  function auditar(o) {
    o = o || {};
    var R = RG(), A = IA(), AU = AUD(), E = EA(), ESQ = ER(), est = o.estado, aval = o.avaliarFam, dados = o.dados || {}, probs = [];
    var div = txt(dados.divisao).toUpperCase(), ob = R.acsObrigatoria(div), flag = !!(dados.acessivel || o.acessivel);
    var desconto = ESQ && ESQ.CRITERIOS && ESQ.CRITERIOS.descontoVaoLivre ? ESQ.CRITERIOS.descontoVaoLivre.valor : 0.05;
    function p(cod, peso, titulo, texto, fonte, pecas, solucoes, nivel) {
      probs.push({ tipo: cod, codigo: cod, gravidade: GRAV[peso] || "aviso", peso: peso, nivel: nivel || "A", nivelRotulo: R.rotuloNivel(nivel || "A"), titulo: titulo, texto: texto + (fonte ? " (" + fonte + ")" : ""), fonte: fonte || "", pecas: arr(pecas).map(String), solucoes: arr(solucoes) });
    }
    function nota(id, t) { return { id: "nota-" + id, texto: t }; }
    if (ob.obrigatoria === false && !flag) {
      p("ACS_NAO_OBRIGATORIA", "info", "Acessibilidade não obrigatória nesta edificação", ob.motivo + ". Marque \"projeto acessível\" em Dados da edificação para auditar como acessível.", "Lei 13.146/2015 art. 56; Decreto 5.296/2004 art. 8", [], [nota("flag", "Em Incêndio e acessibilidade › Dados da edificação, marque \"Projeto acessível (NBR 9050)\".")]);
      return fechar(null);
    }
    /* sem a divisão: um ERRO de dado, e nada mais (revisão 21/10/2026). Antes auditava tudo como obrigatório e a casa sem a divisão
       recebia "porta do banheiro < 0,80" e "fora da rota acessível" — falsos numa A-1, onde a lei não obriga. Sem a divisão, não passa. */
    if (ob.obrigatoria == null && !flag) {
      var Lsg = A.leitura(est, aval, dados), sg = A.sugerirDivisao(Lsg), sols = sg.sugestoes.map(function (x) {
        var d = R.divisoes().filter(function (y) { return y.divisao === x.divisao; })[0] || {};
        return { id: "div-" + x.divisao, texto: "Definir a divisão como " + x.divisao + " — " + (d.descricao || "") + " (confiança " + x.confianca + ")", muda: x.motivo + ". " + (x.divisao === "A-1" ? "Residência unifamiliar: acessibilidade não obrigatória." : "Multifamiliar: áreas de uso comum acessíveis.") + " Desfaz em Dados da edificação.", dados: { divisao: x.divisao } };
      });
      p("ACS_OBRIGATORIEDADE", "critico", "Obrigatoriedade da acessibilidade sem a divisão de ocupação", ob.motivo + ". Nada foi auditado: informe a divisão (uso coletivo: tudo; multifamiliar: áreas comuns; residência unifamiliar: não obrigatória) ou marque \"projeto acessível\"." + (sols.length ? "" : " " + sg.motivo), "Lei 13.146/2015 art. 56; Decreto 5.296/2004 art. 8", Lsg.ambientes.slice(0, 4).map(function (a) { return a.id; }),
        sols.length ? sols : [nota("div", "Informe a divisão em Incêndio e acessibilidade › Dados da edificação.")], "X");
      return fechar(null);
    }
    var L = A.leitura(est, aval, dados), comum = ob.obrigatoria === "comum" && !flag;
    var ambPor = {}; L.ambientes.forEach(function (a) { ambPor[a.id] = a; });
    function noEscopo(a) { if (!a || FORA[a.tipo.id]) return false; if (!comum) return true; return !!COMUM[a.tipo.id] || /\b(comum|portaria|hall|salao|recepcao|lazer)\b/.test(a.norm); }
    var escopo = L.ambientes.filter(noEscopo);
    var publico = !!dados.usoPublico;
    var pavs = {}; L.ambientes.forEach(function (a) { pavs[a.pav] = 1; });
    var nPav = Object.keys(pavs).length;

    /* ---------------- PORTAS: vão livre, espaço ao lado da maçaneta, sanitário */
    var vaoMin = R.ACS.vaoLivre(), esp = R.ACS.espacoMacaneta();
    var portas = L.vaos.filter(function (v) { return v.tipo === "porta"; });
    function ladosDaPorta(v) {
      var out = [];
      L.ambientes.forEach(function (a) { a.trechos.forEach(function (tr) { if (tr.paredeId === v.parede && v.t >= tr.t0 - 0.05 && v.t <= tr.t1 + 0.05 && !out.some(function (x) { return x.a.id === a.id; })) out.push({ a: a, tr: tr }); }); });
      return out;
    }
    function trocar(v, folhaMin) {
      var PT = ESQ && ESQ.PORTAS ? ESQ.PORTAS : [], P = PT.filter(function (x) { return x.folha / 100 >= folhaMin - 1e-6; })[0];
      return v.famId === "ra-porta-giro" && P ? [{ id: "tipo", texto: "Trocar para a folha de " + f2(P.folha / 100) + " m (vão livre ≈ " + f2(P.folha / 100 - desconto) + " m)", ops: [{ op: "instancia", id: v.id, tipoId: P.tipoId }] }] : [nota("tipo", "Troque por porta com vão livre ≥ " + f2(vaoMin.valor) + " m (folha ≥ " + f2(folhaMin) + " m).")];
    }
    var portaInfo = {};
    portas.forEach(function (v) {
      var ls = ladosDaPorta(v); if (!ls.some(function (x) { return noEscopo(x.a); })) return;
      var vl = (v.correr ? v.largura : v.folha) - desconto;
      portaInfo[v.id] = { v: v, lados: ls, vl: vl };
      if (vl < vaoMin.valor - 0.02 - 1e-6)   /* tolerância de −20 mm do 6.11.2.4 */
        p("ACS_PORTA_VAO", "critico", "Porta " + v.id + ": vão livre ≈ " + f2(vl) + " m (mínimo " + f2(vaoMin.valor) + " m)", "Rota acessível: vão livre ≥ 0,80 × 2,10 m (tolerância −20 mm). Vão livre ≈ folha − " + f2(desconto) + " m (critério RA). Ambientes: " + ls.map(function (x) { return "\"" + x.a.nome + "\""; }).join(" e ") + ".", vaoMin.fonte, [v.id], trocar(v, vaoMin.valor + desconto));
      /* espaço ao lado da maçaneta: 0,60 m do lado para onde a folha ABRE (o usuário puxa), 0,30 m do outro (empurra) */
      if (!v.correr) {
        var falta = espacoMacaneta(v, ls, esp);
        if (falta.length) {
          var outra = espacoMacaneta({ id: v.id, t: v.t, largura: v.largura, folha: v.folha, abreFora: v.abreFora, maoDireita: !v.maoDireita }, ls, esp);
          p("ACS_PORTA_ESPACO", "alto", "Porta " + v.id + ": falta espaço ao lado da maçaneta", falta.map(function (f) { return "\"" + f.amb + "\": " + f2(f.tem) + " m de " + f2(f.req) + " m (" + (f.puxa ? "lado para onde a folha abre" : "lado de empurrar") + ")"; }).join("; ") + ". Sem o espaço, só com abertura automática.", esp.fonte, [v.id],
            !outra.length ? [{ id: "mao", texto: "Espelhar a mão da porta (a maçaneta vai para o lado com espaço)", ops: [{ op: "instancia", id: v.id, inst: { Mao_direita: !v.maoDireita } }] }] : [nota("esp", "Desloque a porta na parede (afaste a maçaneta do canto) ou preveja automação.")]);
        }
      }
    });

    /* ---------------- CIRCULAÇÃO: largura pelo comprimento (6.11.1) */
    escopo.filter(function (a) { return a.tipo.id === "circulacao"; }).forEach(function (a) {
      var dm = AU.dimensoes(a), req = R.ACS.corredor(dm.comprimento, publico);
      if (dm.largura < req.valor - 0.005) p("ACS_CIRCULACAO_LARGURA", "critico", "\"" + a.nome + "\": largura " + f2(dm.largura) + " m (mínimo " + f2(req.valor) + " m para " + f2(dm.comprimento) + " m de extensão)", "Corredor de uso " + (publico ? "público: 1,50 m" : "comum: 0,90 m até 4 m, 1,20 m até 10 m, 1,50 m acima de 10 m") + "." + (dm.irregular ? " Forma irregular: largura pela caixa do lado mais longo — conferir." : "") + " Existente impraticável: bolsão de giro 180° a cada 15 m e largura ≥ 0,90 m (6.11.1.1).", req.fonte, [a.id], [nota("larg", "Alargue o corredor para " + f2(req.valor) + " m (mova a parede).")]);
    });

    /* ---------------- DESNÍVEL entre ambientes ligados por porta (6.3.4) */
    var rampas = arr(est && est.caixas).filter(function (c) { return c && c.tipo === "rampa" && c.rampa; });
    var dLivre = R.ACS.desnivelLivre(), dCh = R.ACS.desnivelChanfro();
    Object.keys(portaInfo).forEach(function (id) {
      var pi = portaInfo[id]; if (pi.lados.length < 2) return;
      var a = pi.lados[0].a, b = pi.lados[1].a, dh = Math.abs(num(a.base, 0) - num(b.base, 0));
      if (dh <= dLivre.valor + 1e-6) return;
      var cP = E.ptParede(L.porParede[pi.v.parede], pi.v.t, 0), temRampa = rampas.some(function (r) { return dist([num(r.cx, 0), num(r.cz, 0)], cP) <= num(r.comprimento, 0) / 2 + 2.0; });
      if (temRampa) return;
      if (dh <= dCh.valor + 1e-6) p("ACS_DESNIVEL", "medio", "Porta " + id + ": desnível de " + f2(dh * 1000) + " mm entre \"" + a.nome + "\" e \"" + b.nome + "\"", "Desnível de 5 a 20 mm: chanfro com inclinação máxima 1:2 (50 %).", dCh.fonte, [id], [nota("ch", "Especifique o chanfro (soleira chanfrada) na porta.")]);
      else p("ACS_DESNIVEL", "critico", "Porta " + id + ": degrau de " + f2(dh * 100) + " cm entre \"" + a.nome + "\" e \"" + b.nome + "\"", "Desnível acima de 20 mm é degrau: na rota acessível precisa de rampa (Tabela 4) ou equipamento (em reforma, até 75 mm a 12,5 %).", "NBR 9050:2020 6.3.4.1, 6.3.4.2", [id, a.id, b.id], [nota("rp", "Lance uma rampa (Arquitetura › Rampa) vencendo " + f2(dh) + " m, ou nivele os pisos.")]);
    });

    /* ---------------- RAMPAS (6.6) e ESCADAS (6.8, 6.9) */
    var T4 = R.ACS.rampaTabela4(), tatil = [];
    rampas.forEach(function (c) {
      var par = c.rampa.par || {}, i0 = num(par.inclinacao, 0), H = num(par.desnivel, 0), nSeg = Math.max(1, arr(c.rampa.lances).length), hSeg = H / nSeg;
      var fx = T4.faixas.filter(function (f) { return i0 <= f.iMax + 1e-6; })[0];
      if (!fx) p("ACS_RAMPA_INCLINACAO", "critico", "Rampa " + c.id + ": " + f2(i0) + " % (máximo 8,33 %)", "Rampa nova até 8,33 % (Tabela 4); de 8,33 a 12,5 % só em reforma, esgotadas as soluções (Tabela 5).", T4.fonte, [c.id], [{ id: "inc", texto: "Inclinação 8,33 % (os segmentos e patamares se refazem)", ops: [{ op: "ajustar", id: c.id, campos: { rampa: { inclinacao: 8.33 } } }] }]);
      else if (hSeg > fx.hMax + 1e-6 || (fx.segMax && nSeg > fx.segMax)) p("ACS_RAMPA_INCLINACAO", "critico", "Rampa " + c.id + ": segmento vence " + f2(hSeg) + " m a " + f2(i0) + " % (máximo " + f2(fx.hMax) + " m)", "Tabela 4: até " + f2(fx.iMax) + " % cada segmento vence até " + f2(fx.hMax) + " m" + (fx.segMax ? ", no máximo " + fx.segMax + " segmentos" : "") + ".", T4.fonte, [c.id], [nota("seg", "Divida em mais segmentos com patamar (Propriedades da rampa) ou reduza a inclinação.")]);
      var lg = R.ACS.rampaLargura(), pt = R.ACS.rampaPatamar(), sol = [];
      if (num(par.largura, 0) < lg.valor - 0.005) sol.push("largura " + f2(num(par.largura, 0)) + " m < " + f2(lg.valor) + " m");
      if (nSeg > 1 && num(par.patamar, 0) < pt.valor - 0.005) sol.push("patamar " + f2(num(par.patamar, 0)) + " m < " + f2(pt.valor) + " m");
      if (sol.length) p("ACS_RAMPA_LARGURA_PATAMAR", "alto", "Rampa " + c.id + ": " + sol.join("; "), "Largura livre ≥ 1,20 m (1,50 recomendada); patamar ≥ 1,20 m no início, no fim e entre segmentos.", lg.fonte + "; " + pt.fonte, [c.id], [{ id: "aj", texto: "Largura 1,20 m e patamar 1,20 m", ops: [{ op: "ajustar", id: c.id, campos: { rampa: { largura: Math.max(1.2, num(par.largura, 0)), patamar: Math.max(1.2, num(par.patamar, 0)) } } }] }]);
      corrimaoDuplo(c, "ACS_RAMPA_CORRIMAO", R.ACS.rampaCorrimao());
      if (i0 >= 5 - 1e-6) tatil.push(c.id);
    });
    arr(est && est.caixas).filter(function (c) { return c && c.tipo === "escada" && c.escada; }).forEach(function (c) {
      var k = c.escada.calc || {}, e = num(k.e, 0), pp = num(k.p, 0), Pm = R.ACS.escadaPiso(), Em = R.ACS.escadaEspelho(), Fm = R.ACS.escadaFormula(), bl = R.ESC.blondel(), fora = [];
      if (pp && (pp < Pm.min - 1e-6 || pp > Pm.max + 1e-6)) fora.push("piso " + f2(pp * 100) + " cm (0,28 a 0,32 m)");
      if (e && (e < Em.min - 1e-6 || e > Em.max + 1e-6)) fora.push("espelho " + f2(e * 100) + " cm (0,16 a 0,18 m)");
      if (e && pp && (pp + 2 * e < Fm.min - 1e-6 || pp + 2 * e > Math.min(Fm.max, bl.max) + 1e-6)) fora.push("p + 2e = " + f2((pp + 2 * e) * 100) + " cm (0,63 a " + f2(Math.min(Fm.max, bl.max)) + " m — a IT 08 de MG limita a 0,64)");
      if (fora.length) p("ACS_ESCADA_DEGRAU", "alto", "Escada " + c.id + ": " + fora.join("; "), "Degraus da rota: piso, espelho e a fórmula de Blondel (a mais restritiva entre a NBR 9050 e a IT 08).", Pm.fonte + "; " + Em.fonte + "; " + bl.fonte, [c.id], AU.solucaoDegrau(R, c, nota));
      var pt = R.ACS.escadaPatamar();
      if (num(c.escada.par && c.escada.par.desnivel, 0) > pt.desnivel + 1e-6 && arr(c.escada.lances).length <= 1) p("ACS_ESCADA_DEGRAU", "alto", "Escada " + c.id + ": sem patamar em " + f2(num(c.escada.par.desnivel, 0)) + " m de desnível", "Patamar no mínimo a cada 3,20 m de desnível e em toda mudança de direção (≥ 1,20 m).", pt.fonte, [c.id], [nota("pat", "Faça a escada em U ou em L com patamar.")]);
      /* 6.8.3 (revisão 21/10/2026): o auditor conferia degrau, patamar e corrimão, mas não a largura mínima da escada na rota acessível */
      var lgE = R.ACS.escadaLargura(), larE = num(c.escada.par && c.escada.par.largura, 0);
      if (larE > 0 && larE < lgE.valor - 0.005) p("ACS_ESCADA_LARGURA", "alto", "Escada " + c.id + ": largura " + f2(larE) + " m (mínimo " + f2(lgE.valor) + " m na rota acessível)", "A largura segue o fluxo de pessoas; em rota acessível, no mínimo " + f2(lgE.valor) + " m, com guia de balizamento onde não houver parede.", lgE.fonte, [c.id], [{ id: "larg", texto: "Largura " + f2(lgE.valor) + " m", ops: [{ op: "ajustar", id: c.id, campos: { escada: { largura: lgE.valor } } }] }]);
      corrimaoDuplo(c, "ACS_CORRIMAO_ESCADA", R.ACS.escadaCorrimao());
      tatil.push(c.id);
    });
    function corrimaoDuplo(c, cod, ref) {
      var gs = arr(est && est.caixas).filter(function (g) { return g && g.tipo === "guarda" && g.guarda && g.guarda.host && String(g.guarda.host.id) === String(c.id); });
      var ok = gs.filter(function (g) { var pr = g.guarda.par || {}; return Math.abs(num(pr.c1Altura, -9) - ref.alto) <= 0.02 && Math.abs(num(pr.c2Altura, -9) - ref.baixo) <= 0.02; });
      var lados = {}; ok.forEach(function (g) { lados[g.guarda.host.lado || g.id] = 1; });
      if (Object.keys(lados).length < 2) p(cod, "alto", (c.tipo === "rampa" ? "Rampa " : "Escada ") + c.id + ": corrimão duplo (0,92 e 0,70 m) em " + Object.keys(lados).length + " lado(s)", "Corrimão nos DOIS lados, em duas alturas (0,92 m e 0,70 m), contínuo, prolongando ≥ 0,30 m; seção 38–45 mm atende a NBR 9050 (30–45) e a IT 08 (38–60).", ref.fonte + "; CBMMG IT 08 5.8.2.3", [c.id].concat(gs.map(function (g) { return g.id; })), (function () { var o2 = c.tipo === "escada" || gs.length ? AU.opsCorrimao(est, c) : []; return o2.length ? [{ id: "corrimao", texto: "Corrimão duplo (0,92 e 0,70 m) nos dois lados", ops: o2 }] : [nota("cd", "Edite o tipo do guarda-corpo: Corrimão 1 a 0,92 m e Corrimão 2 a 0,70 m, nos dois lados.")]; })());
    }
    if (nPav > 1 && !rampas.length && !L.ambientes.some(function (a) { return /elevador|plataforma/.test(a.norm); }))
      p("ACS_CIRC_VERTICAL_UMA_FORMA", "alto", "Circulação vertical só por escada", "A circulação vertical é acessível com no mínimo DUAS formas de deslocamento (escada + rampa, ou escada + elevador/plataforma).", "NBR 9050:2020 6.3", [], [nota("cv", "Preveja rampa ou elevador/plataforma (poço: nomeie o ambiente \"Elevador\").")]);
    if (tatil.length && (ob.obrigatoria || flag) && !arr(est && est.familias).some(function (f) { return f && /tatil|podotatil/i.test(txt(f.famId)); }))
      p("ACS_PISO_TATIL_ALERTA", "pendente", "Piso tátil de alerta não modelado (" + tatil.length + " escada/rampa)", "Alerta no início e no término de escada e de rampa com i ≥ 5 %: " + R.ACS.alertaTatil().texto + "; contraste LRV ≥ 30.", R.ACS.alertaTatil().fonte, tatil, [nota("tt", "Especifique o piso tátil de alerta nas posições da norma (SINAPI 104658: piso podotátil de concreto, por m²).")]);

    /* ---------------- SANITÁRIO ACESSÍVEL */
    var banhos = escopo.filter(function (a) { return a.tipo.id === "banheiro" || a.tipo.id === "lavabo"; });
    var porPav = {}; banhos.forEach(function (a) { (porPav[a.pav] = porPav[a.pav] || []).push(a); });
    var giro = R.ACS.giro();
    function obstDe(a) { return L.moveis.filter(function (m) { return m.pav === a.pav && m.pts && m.pts.some(function (q) { return E.dentro(q, a.pts); }); }); }
    /* cabe o círculo de giro de Ø 1,50 m (a manobra pode usar 0,10 m sob a bacia e 0,30 m sob o lavatório)? */
    function cabeGiro(a, obst) {
      var r = giro.valor / 2, achou = null, b = bbox(a.pts);
      for (var x = b[0] + r; x <= b[2] - r + 1e-9 && !achou; x += 0.05) for (var z = b[1] + r; z <= b[3] - r + 1e-9 && !achou; z += 0.05) {
        var c = [x, z]; if (!E.dentro(c, a.pts) || distBorda(c, a.pts) < r - 1e-6) continue;
        var livre = obst.every(function (m) { var tol = /lavatorio/i.test(txt(m.famId)) ? 0.30 : /bacia|vaso/i.test(txt(m.famId)) ? 0.10 : 0; return E.dentro(c, m.pts) ? false : distBorda(c, m.pts) >= r - tol - 1e-6; });
        if (livre) achou = c;
      }
      return !!achou;
    }
    /* Corrigir de "nenhum sanitário acessível": marca como acessível (nome "… PNE") o banheiro do pavimento onde o giro JÁ cabe e que não tem
       lavatório de coluna, e vira para fora as portas dele que abrem para dentro — assim a marcação não faz nascer outro erro. Sem banheiro que
       sirva, fica a nota (aumentar o ambiente é decisão de projeto). */
    function opsMarcarAcessivel(lista) {
      var cs = lista.filter(function (a) { var ob2 = obstDe(a); return cabeGiro(a, ob2) && !ob2.some(function (m) { return /lavatorio-coluna|lavatorio_coluna/.test(txt(m.famId)); }); }).sort(function (a, b) { return b.area - a.area; });
      if (!cs.length) return null;
      var a = cs[0], ops = [{ op: "ajustarAmbiente", id: a.id, campos: { nome: String(a.nome).slice(0, 72) + " PNE" } }];
      portas.forEach(function (v) {
        var tr = ladosDaPorta(v).filter(function (x) { return x.a.id === a.id; })[0]; if (!tr || v.correr) return;
        if ((v.abreFora ? 1 : -1) === tr.tr.lado) ops.push({ op: "instancia", id: v.id, inst: { Abre_para_fora: !v.abreFora } });
      });
      return { ambiente: a, ops: ops };
    }
    Object.keys(porPav).forEach(function (pv) {
      if (!porPav[pv].some(function (a) { return a.acessivel; })) {
        var mk = opsMarcarAcessivel(porPav[pv]);
        p("ACS_SANIT_QUANTIDADE", "critico", (L.pavs[pv] ? L.pavs[pv].nome : "Pavimento") + ": nenhum sanitário acessível", "Pelo menos um sanitário acessível (5 % de cada peça, mínimo 1; uso público novo: 1 por sexo por pavimento, com entrada independente). Nenhum dos " + porPav[pv].length + " banheiro(s) do pavimento está marcado como acessível (PNE/PcD no nome).", R.ACS.sanitarioQuantidade().fonte + "; Decreto 5.296/2004 art. 22; Lei 10.098 art. 11", porPav[pv].map(function (a) { return a.id; }),
          mk ? [{ id: "pne", texto: "Marcar \"" + mk.ambiente.nome + "\" como sanitário acessível (PNE)", muda: "O giro de Ø 1,50 m cabe; " + (mk.ops.length > 1 ? "a porta passa a abrir para fora." : "a porta já abre para fora."), ops: mk.ops }] : [nota("q", "Projete um sanitário acessível (giro Ø 1,50 m, transferência, barras, porta de 0,80 abrindo para fora) e nomeie-o \"Banheiro PNE\".")]);
      }
    });
    if (!banhos.length && ob.obrigatoria === true) p("ACS_SANIT_QUANTIDADE", "alto", "Nenhum sanitário modelado", "A lei pede ao menos um banheiro acessível na edificação de uso coletivo.", "Lei 10.098/2000 art. 11, parágrafo único", [], [nota("q0", "Modele o sanitário acessível.")]);
    banhos.filter(function (a) { return a.acessivel; }).forEach(function (a) {
      var obst = obstDe(a), achou = cabeGiro(a, obst);
      if (!achou) p("ACS_SANIT_GIRO", "critico", "\"" + a.nome + "\": não cabe o giro de Ø 1,50 m", "O sanitário acessível precisa do círculo de 1,50 m livre (a manobra pode usar até 0,10 m sob a bacia e 0,30 m sob o lavatório) e da área de transferência 0,80 × 1,20 m ao lado da bacia (esta não é medida aqui — conferir).", giro.fonte + "; " + R.ACS.sanitarioDimensao().fonte, [a.id].concat(obst.map(function (m) { return m.id; })), [nota("giro", "Aumente o ambiente ou reposicione as louças até caber o Ø 1,50 m.")]);
      portas.forEach(function (v) {
        var ls = ladosDaPorta(v), tr = ls.filter(function (x) { return x.a.id === a.id; })[0]; if (!tr || v.correr) return;
        var abreLado = v.abreFora ? 1 : -1;
        if (abreLado === tr.tr.lado) p("ACS_SANIT_PORTA", "alto", "Porta " + v.id + " do sanitário acessível abre para dentro", "A porta de eixo vertical do sanitário acessível abre para FORA, com puxador horizontal interno ≥ 0,40 m.", R.ACS.sanitarioPorta().fonte, [v.id], [{ id: "inv", texto: "Abrir para fora", ops: [{ op: "instancia", id: v.id, inst: { Abre_para_fora: !v.abreFora } }] }]);
      });
      var lav = obst.filter(function (m) { return /lavatorio-coluna|lavatorio_coluna/.test(txt(m.famId)); });
      if (lav.length) p("ACS_SANIT_LAVATORIO", "alto", "\"" + a.nome + "\": lavatório com coluna", "No sanitário acessível o lavatório é sem coluna (ou coluna suspensa, ou sobre tampo), superfície a 0,78–0,80 m e torneira de alavanca/sensor.", "NBR 9050:2020 7.5 d), e), 7.8", lav.map(function (m) { return m.id; }), [nota("lav", "Troque pelo lavatório suspenso (Hidráulica › Aparelho › Lavatório suspenso).")]);
      var barras = arr(est && est.familias).filter(function (f) { return f && /barra/i.test(txt(f.famId)) && E.dentro([num(f.x, 0), num(f.z, 0)], a.pts); });
      p("ACS_SANIT_PECAS", "pendente", "\"" + a.nome + "\": conferir bacia, barras e alarme", (barras.length ? barras.length + " barra(s) modelada(s); " : "Barras de apoio não modeladas; ") + "bacia a 0,43–0,45 m sem abertura frontal, barras lateral (≥ 0,80 m a 0,75 m) e vertical (≥ 0,70 m), barra do fundo (≥ 0,80 m), alarme a 0,40 m do piso — o modelo não traz essas cotas para o motor medir.", "NBR 9050:2020 7.7.1, 7.7.2.2, 5.6.4.1", [a.id], [nota("pec", "Especifique as barras (SINAPI 100868 reta inox 80 cm; 100867 reta 70 cm) e a bacia na altura da norma; confira o alarme.")]);
    });

    /* ---------------- ROTA ACESSÍVEL: do acesso a todos os ambientes do escopo, por portas de vão ≥ 0,80 sem degrau */
    var saidasT = arr(L.saidas[0]).filter(function (s) { return s.v; });
    var ini = {}; saidasT.forEach(function (s) { var vl = (s.v.correr ? s.v.largura : s.v.folha) - desconto; if (vl >= vaoMin.valor - 0.02 - 1e-6) ini[s.amb.id] = 1; });
    var adj = {}; L.ambientes.forEach(function (a) { adj[a.id] = []; arr(a.abertos).forEach(function (b) { adj[a.id].push(b); }); });
    portas.forEach(function (v) {
      var ls = ladosDaPorta(v); if (ls.length < 2) return;
      var vl = (v.correr ? v.largura : v.folha) - desconto, a = ls[0].a, b = ls[1].a, dh = Math.abs(num(a.base, 0) - num(b.base, 0));
      var cP = E.ptParede(L.porParede[v.parede], v.t, 0), rampa = rampas.some(function (r) { return dist([num(r.cx, 0), num(r.cz, 0)], cP) <= num(r.comprimento, 0) / 2 + 2.0; });
      if (vl >= vaoMin.valor - 0.02 - 1e-6 && (dh <= dCh.valor + 1e-6 || rampa)) { adj[a.id].push(b.id); adj[b.id].push(a.id); }
    });
    var vis = {}, fila = Object.keys(ini); fila.forEach(function (k) { vis[k] = 1; });
    while (fila.length) { var k = fila.shift(); arr(adj[k]).forEach(function (n) { if (!vis[n]) { vis[n] = 1; fila.push(n); } }); }
    var semRota = escopo.filter(function (a) { return a.pav === 0 && !vis[a.id]; });
    if (!saidasT.length) p("ACS_ROTA_AUSENTE", "critico", "Sem acesso pela rua", "Não há porta em parede externa no pavimento de acesso: a rota acessível não começa.", "Lei 10.098/2000 art. 11; NBR 9050:2020 6.2", [], [nota("ac", "Modele a porta de entrada (vão livre ≥ 0,80 m, sem degrau).")]);
    else if (!Object.keys(ini).length) p("ACS_ROTA_AUSENTE", "critico", "Entrada sem vão livre de 0,80 m", "Nenhuma porta de entrada tem vão livre ≥ 0,80 m: ninguém em cadeira de rodas entra.", vaoMin.fonte, saidasT.map(function (s) { return s.id; }), trocar(saidasT[0].v, vaoMin.valor + desconto));
    else if (semRota.length) p("ACS_ROTA_AUSENTE", "critico", semRota.length + " ambiente(s) fora da rota acessível", "Sem itinerário livre de barreiras (porta de vão livre ≥ 0,80 m, sem degrau) desde a entrada até: " + semRota.map(function (a) { return "\"" + a.nome + "\""; }).join(", ") + ".", "Lei 10.098/2000 art. 11; Decreto 5.296/2004 art. 19; NBR 9050:2020 6.1", semRota.map(function (a) { return a.id; }), [nota("rota", "Corrija as portas estreitas e os degraus apontados acima (ACS_PORTA_VAO, ACS_DESNIVEL) e audite de novo.")]);
    var acima = escopo.filter(function (a) { return a.pav > 0; });
    if (acima.length && !rampas.length && !L.ambientes.some(function (a) { return /elevador|plataforma/.test(a.norm); }))
      p("ACS_ROTA_AUSENTE", "critico", acima.length + " ambiente(s) em pavimento sem acesso acessível", "Os pavimentos de cima só têm escada: sem rampa nem elevador/plataforma, não há rota acessível até eles.", "Decreto 5.296/2004 art. 20; NBR 9050:2020 6.3", acima.map(function (a) { return a.id; }).slice(0, 8), [nota("elev", "Preveja elevador/plataforma ou rampa.")]);

    /* ---------------- rota de fuga, vagas, multifamiliar, pendências */
    if (ob.obrigatoria === true && saidasT.length) p("ACS_PORTA_BARRA_ANTIPANICO", "pendente", "Portas da rota de fuga acessível: barra antipânico", "As portas de corredores, acessos, áreas de resgate, escadas de emergência e descargas das rotas de fuga acessíveis têm barra antipânico (NBR 11785): " + saidasT.map(function (s) { return s.id; }).join(", ") + ".", "NBR 9050:2020 6.4.1.1", saidasT.map(function (s) { return s.id; }), [nota("bap", "Especifique a barra antipânico (SINAPI insumo 39615 — só o material).")]);
    if ((ob.obrigatoria === true || comum) && L.ambientes.some(function (a) { return a.tipo.id === "garagem"; }))
      p("ACS_VAGA_PCD", "pendente", "Vagas PcD: conferir", "2 % das vagas para PcD (mínimo 1), perto dos acessos, faixa adicional ≥ 1,20 m, ≤ 50 m do acesso. As vagas não estão modeladas; a dimensão da vaga (Res. Contran 304/2008) não foi lida — sem fonte.", "Lei 13.146/2015 art. 47 §1; NBR 9050:2020 6.14", L.ambientes.filter(function (a) { return a.tipo.id === "garagem"; }).map(function (a) { return a.id; }), [nota("vg", "Demarque as vagas PcD (2 %, mínimo 1) na garagem.")], "X");
    if (div === "A-2") p("ACS_MULTIFAMILIAR_UH", "pendente", "Multifamiliar: unidades adaptáveis", "As unidades devem ser ADAPTÁVEIS (leiaute alterável sem mexer em estrutura e instalações) ou, em alvenaria estrutural/paredes de concreto, ≥ 3 % internamente acessíveis (mín. 1). Dispensas: ≤ 1 dormitório e 35 m²; 2 dormitórios e 41 m².", "Decreto 9.451/2018 arts. 3 a 6 e 9", [], [nota("uh", "Declare no memorial como as unidades atendem (adaptáveis ou 3 % acessíveis).")]);
    p("ACS_PENDENCIAS", "pendente", "Itens da NBR 9050 que o motor não mede", "Iluminância da rota (150 lux a 1,00 m — 6.1.2), manobra com deslocamento (Figura 8, não transcrita), área de transferência ao lado da bacia, ferragens (alavanca a 0,80–1,10 m, ≤ 36 N), piso tátil direcional (NBR 16537 7.3), área de resgate (6.4.2), elevador (NBR NM 313, não lida) e a dimensão da vaga PcD (Res. Contran 304/2008, não lida).", "NBR 9050:2020; NBR 16537:2024", [], [nota("pend", "Confira estes itens no projeto executivo.")], "X");
    return fechar(L);

    function bbox(P) { var b = [Infinity, Infinity, -Infinity, -Infinity]; P.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; }
    function espacoMacaneta(v, ls, ref) {
      var out = [], sH = v.maoDireita ? 1 : -1, latch = v.t - sH * v.largura / 2, dirL = -sH, ladoAbre = v.abreFora ? 1 : -1;
      ls.forEach(function (x) {
        var puxa = x.tr.lado === ladoAbre, req = puxa ? ref.valor : ref.aFavor;
        /* a face do ambiente em volta da porta (trechos contíguos da mesma parede e do mesmo lado) */
        var t0 = x.tr.t0, t1 = x.tr.t1, mud = true, trs = x.a.trechos.filter(function (q) { return q.paredeId === x.tr.paredeId && q.lado === x.tr.lado; });
        while (mud) { mud = false; trs.forEach(function (q) { if (q.t1 >= t0 - 0.03 && q.t0 < t0 - 1e-6) { t0 = q.t0; mud = true; } if (q.t0 <= t1 + 0.03 && q.t1 > t1 + 1e-6) { t1 = q.t1; mud = true; } }); }
        var tem = dirL > 0 ? t1 - latch : latch - t0;
        var outros = L.vaos.filter(function (u) { return u.id !== v.id && u.parede === v.parede; });
        outros.forEach(function (u) { var e0 = u.t - u.largura / 2, e1 = u.t + u.largura / 2; if (dirL > 0 && e0 >= latch - 1e-6) tem = Math.min(tem, e0 - latch); if (dirL < 0 && e1 <= latch + 1e-6) tem = Math.min(tem, latch - e1); });
        if (tem < req - 0.01) out.push({ amb: x.a.nome, tem: Math.max(0, tem), req: req, puxa: puxa });
      });
      return out;
    }
    function fechar(Lx) {
      probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) delete s.ops; }); });
      var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
      return { problemas: probs, porCodigo: porCod, escopo: { obrigatoria: ob.obrigatoria, motivo: ob.motivo, projetoAcessivel: flag, comum: !!(Lx && comum) },
        resumo: { erros: probs.filter(function (q) { return q.gravidade === "erro"; }).length, avisos: probs.filter(function (q) { return q.gravidade === "aviso" && q.peso !== "info" && q.peso !== "pendente"; }).length, info: probs.filter(function (q) { return q.peso === "info" || q.peso === "pendente"; }).length } };
    }
  }

  var AcsAuditor = { auditar: auditar };
  global.AcsAuditor = AcsAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = AcsAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
