/* =====================================================================
 * incauditor.js — AUDITOR DE INCÊNDIO (Minas Gerais, CBMMG) — 21/10/2026. Motor PURO, ES5, Node-testável.
 *
 * Molde do tools/hid-auditar-projeto.js / js/esqauditor.js: confere o modelo PRONTO (lançado à mão ou pelo js/incauto.js) com as regras do
 * js/incregras.js, SEM confiar no lançador — a distância de caminhamento, a cobertura dos extintores e a da sinalização são REFEITAS
 * aqui na rede de caminhamento (js/incgeo.js). Regra do dono (problema sempre com solução): cada achado sai no formato do
 * js/problemacard.js — o que é, "Corrigir: …" (as ops prontas, num lote com Ctrl+Z) e "Mostrar no 3D". Solução sem ação = nota.
 *
 *   IncAuditor.auditar({ estado, avaliarFam, dados }) → { problemas[], porCodigo{}, classe, medidas, resumo }
 *     problema = { codigo, gravidade: "erro"|"aviso", peso: "critico"|"alto"|"medio"|"info"|"pendente", nivel (A/N/C/X), titulo, texto, fonte, pecas[], solucoes[] }
 *
 * CÓDIGOS (peso): classificação INC_OCUPACAO_AUSENTE (critico) · INC_ALTURA_AREA_AUSENTE (alto) · INC_CARGA_ASSUMIDA (medio) · INC_PSCIP_TIPO (info) ·
 *   INC_A1_ISENTA (info) · INC_NAO_PROJETADO (info: medida exigida pela IT 01 que este motor não projeta)
 * SAÍDAS (IT 08): INC_SAI_SEM_SAIDA · INC_SAI_SEM_CAMINHO · INC_SAI_DISTANCIA · INC_SAI_NUM_SAIDAS · INC_SAI_LARGURA · INC_SAI_PORTA_VAO ·
 *   INC_SAI_PORTA_SENTIDO (critico) · INC_SAI_ENTRE_SAIDAS · INC_SAI_PORTA_ROLO · INC_SAI_BARRA_ANTIPANICO · INC_SAI_ESCADA_DEGRAU · INC_SAI_ESCADA_PATAMAR ·
 *   INC_SAI_ESCADA_LARGURA · INC_SAI_CORRIMAO · INC_SAI_GUARDA · INC_SAI_RAMPA (alto)
 * EXTINTORES (IT 16): INC_EXT_AUSENTE_PAVIMENTO · INC_EXT_DISTANCIA (critico) · INC_EXT_ENTRADA · INC_EXT_ALTURA · INC_EXT_ESCADA · INC_EXT_CAPACIDADE ·
 *   INC_EXT_ABC_PAVIMENTO · INC_EXT_SEM_SINAL · INC_EXT_RISCO_ESPECIAL (alto) · INC_EXT_SINAL_PISO (medio)
 * ILUMINAÇÃO (IT 13): INC_ILUM_AUSENTE (critico) · INC_ILUM_ESPACAMENTO (> 15 m entre vizinhas) · INC_ILUM_COBERTURA (> 10,6 m) · INC_ILUM_PORTA (alto) · INC_ILUM_TENSAO · INC_ILUM_FLUXO (medio) ·
 *   INC_ILUM_ISENCAO (info) · INC_ILUM_NBR10898 (pendente)
 * SINALIZAÇÃO (IT 15): INC_SIN_SAIDA_PORTA · INC_SIN_ROTA_15M (alto) · INC_SIN_DIMENSAO · INC_SIN_ALTURA · INC_SIN_PAVIMENTO_ESCADA (medio) ·
 *   INC_SIN_ISENCAO_TERREO (info)
 * CORRIGIR (revisão 23/10/2026): cada achado de erro/aviso leva uma solução com `ops` (muda o modelo, UM lote com Ctrl+Z) ou `dados` (muda só
 *   Dados da edificação: divisão e atividade; IncAuto.aplicarDados) — o teste (bloco 10 de tools/test-inc-acs.js) aplica cada uma e confere que o
 *   achado some e nenhum erro/aviso novo nasce. Sem correção automática só o que é geometria (mover parede, rampa nova, elevador) — vem com a
 *   nota. O que o modelo NÃO representa (barra antipânico, fluxo da luminária não declarado, piso tátil) é PENDÊNCIA, não aviso: nada o apaga.
 *   `o.ops` (a lista de ops do modelo) é opcional: com ela, a saída nova leva junto a placa S12 e a luminária (IncAuto.gerar sobre o estado novo).
 * Teste: node tools/test-inc-acs.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function RG() { return dep("IncRegras", "./incregras.js"); }
  function GEO() { return dep("IncGeo", "./incgeo.js"); }
  function IA() { return dep("IncAuto", "./incauto.js"); }
  function EA() { return dep("EsqAuto", "./esqauto.js"); }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function dist(a, b) { var dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  var GRAV = { critico: "erro", alto: "aviso", medio: "aviso", info: "aviso", pendente: "aviso" };

  /* largura e comprimento de um ambiente pela caixa orientada no lado mais longo (corredor reto); fração de área < 0,85 = forma irregular */
  function dimensoes(a) {
    var P = arr(a.pts), best = null;
    for (var i = 0; i < P.length; i++) { var q = P[(i + 1) % P.length], l = dist(P[i], q); if (!best || l > best.l) best = { l: l, u: [(q[0] - P[i][0]) / (l || 1), (q[1] - P[i][1]) / (l || 1)] }; }
    if (!best) return { largura: 0, comprimento: 0, irregular: true };
    var u = best.u, v = [-u[1], u[0]], s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    P.forEach(function (p) { var s = dot(p, u), t = dot(p, v); s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); });
    var A = s1 - s0, B = t1 - t0;
    return { largura: Math.min(A, B), comprimento: Math.max(A, B), irregular: num(a.area, A * B) / Math.max(1e-6, A * B) < 0.85 };
  }
  /* "3-A:20-B:C" → 3 ; sem A → 0 ; texto que não diz → null */
  function capA(s) { var m = /(\d+)\s*-\s*A/i.exec(txt(s)); if (m) return Number(m[1]); return /B\s*:?\s*C|-B/i.test(txt(s)) ? 0 : null; }

  function auditar(o) {
    o = o || {};
    var R = RG(), G = GEO(), A = IA(), E = EA(), ESQ = ER(), est = o.estado, aval = o.avaliarFam, dados = o.dados || {};
    var L = A.leitura(est, aval, dados), div = txt(dados.divisao).toUpperCase(), med = A.medidasDoModelo(L, div), K = R.classificar(dados, med), probs = [];
    var desconto = ESQ && ESQ.CRITERIOS && ESQ.CRITERIOS.descontoVaoLivre ? ESQ.CRITERIOS.descontoVaoLivre.valor : 0.05;
    function p(cod, peso, nivel, titulo, texto, fonte, pecas, solucoes) {
      probs.push({ tipo: cod, codigo: cod, gravidade: GRAV[peso] || "aviso", peso: peso, nivel: nivel || "A", nivelRotulo: R.rotuloNivel(nivel || "A"), titulo: titulo, texto: texto + (fonte ? " (" + fonte + ")" : ""), fonte: fonte || "", pecas: arr(pecas).map(String), solucoes: arr(solucoes) });
    }
    function nota(id, t) { return { id: "nota-" + id, texto: t }; }
    function gerar(so, estX) { var g = A.gerar({ estado: estX || est, avaliarFam: aval, dados: dados, so: so, loteId: "corr" }); return g.ok ? g.ops : []; }
    /* uma SAÍDA NOVA nasce sem placa S12, sem luminária junto da porta e muda a rota: o Corrigir leva junto o que ela exige (senão aplicar
       trocava um erro por três). Precisa da lista de ops do modelo (o.ops) para ler o estado COM a porta; sem ela, fica só a porta. */
    function comSinalizacao(opsNovas) {
      var E2 = global.BimEdit;
      if (!opsNovas.length || !arr(o.ops).length || !E2 || !E2.aplicar) return opsNovas;
      try {
        var est2 = E2.aplicar(JSON.parse(JSON.stringify(o.ops.concat(opsNovas))));
        return opsNovas.concat(gerar(["saida", "luminaria", "orientacao"], est2));
      } catch (eS) { return opsNovas; }
    }
    function semIds(ids) { var e = {}; Object.keys(est || {}).forEach(function (k) { e[k] = est[k]; }); e.familias = arr(est && est.familias).filter(function (f) { return f && ids.indexOf(String(f.id)) < 0; }); return e; }
    var ambPor = {}; L.ambientes.forEach(function (a) { ambPor[a.id] = a; });

    /* ---------------- CLASSIFICAÇÃO */
    K.pendencias.forEach(function (q) {
      if (q.codigo === "INC_OCUPACAO_AUSENTE") {
        var sg = A.sugerirDivisao(L), sols = sg.sugestoes.map(function (x) {
          var d = R.divisoes().filter(function (y) { return y.divisao === x.divisao; })[0] || {};
          return { id: "div-" + x.divisao, texto: "Definir a divisão como " + x.divisao + " — " + (d.descricao || "") + " (confiança " + x.confianca + ")", muda: x.motivo + "." + (x.divisao === "A-1" ? " A residência unifamiliar é isenta das medidas (CBMMG IT 01 A.4.1); desfaz em Dados da edificação." : " Passa a valer a tabela da divisão; desfaz em Dados da edificação."), dados: { divisao: x.divisao } };
        });
        p(q.codigo, "critico", "X", "Divisão de ocupação não informada", q.texto + " Nenhuma medida foi auditada: informe a divisão e audite de novo (residência unifamiliar, A-1, é isenta — IT 01 A.4.1)." + (sols.length ? "" : " " + sg.motivo), q.fonte, L.ambientes.slice(0, 4).map(function (a) { return a.id; }),
          sols.length ? sols : [nota("div", "Informe a divisão (ex.: A-1 residência, D-1 escritório, C-1 comércio) em Incêndio › Dados da edificação.")]);
      }
      else if (q.codigo === "INC_ALTURA_AREA_AUSENTE") p(q.codigo, "alto", "X", "Altura ou área da edificação sem dado", q.texto, q.fonte, L.ambientes.slice(0, 4).map(function (a) { return a.id; }), [nota("alt", "Informe a altura e a área total em Dados da edificação (ou modele os pavimentos e ambientes).")]);
      else if (q.codigo === "INC_CARGA_ASSUMIDA" || q.codigo === "INC_CARGA_AUSENTE") p(q.codigo, "medio", "C", "Carga de incêndio assumida", q.texto, q.fonte, [],
        K.cargaAssumida ? [{ id: "carga", texto: "Adotar a atividade \"" + K.cargaAssumida.descricao + "\" (" + K.cargaAssumida.qfi + " MJ/m², a maior da divisão)", muda: "Fixa a carga assumida em Dados da edificação (lado seguro); troque pela atividade real quando a souber.", dados: { atividade: K.cargaAssumida.i } }] : [nota("qfi", "Escolha a atividade (IT 09, Tabela A.1) em Dados da edificação: o risco e o extintor seguem dela.")]);
    });
    /* sem a divisão: SÓ a pendência (revisão 21/10/2026). Antes as medidas saíam "exigidas pelo lado seguro" e uma casa sem a divisão
       recebia "sem extintor", "sem iluminação", "sem placa" — erros falsos (A-1 é isenta) com um Corrigir que lançava e cobrava. O erro
       de classificação continua bloqueando: nada passa sem a divisão. */
    if (!K.divisao) return fechar();
    if (K.isentaA1) {
      p("INC_A1_ISENTA", "info", "A", "Residência unifamiliar (A-1): isenta", "A residência exclusivamente unifamiliar é isenta das medidas de segurança contra incêndio e pânico (extintor, iluminação, sinalização e saídas não são exigidos pelo CBMMG). Áreas comuns de condomínio (guarita, salão de festas) seguem a regra normal.", "CBMMG IT 01 A.4.1", [], [nota("a1", "Se a edificação tiver outro uso, mude a divisão em Dados da edificação.")]);
      return fechar();
    }
    p("INC_PSCIP_TIPO", "info", "A", "Nível de risco " + K.nivel.nivel + " · processo " + K.pscip.tipo, "Divisão " + (K.divisao || "?") + ", altura " + f2(K.altura) + " m, área " + f2(K.area) + " m², população " + (K.populacao != null ? Math.ceil(K.populacao - 1e-9) : "?") + ", carga " + (K.qfi != null ? K.qfi + " MJ/m² (risco " + K.risco.rotulo.toLowerCase() + ")" : "?") + ". " + K.nivel.motivos.join("; ") + ". Documento: " + K.pscip.documento + ". Não avaliado: " + K.nivel.naoAvaliado + ".", K.nivel.fonte + "; " + K.pscip.fonte, [], [nota("pscip", "Composição do PSCIP: IT 03 (não lida pela RA) — conferir a lista de documentos.")]);
    /* medidas que a tabela exige e este motor não projeta (IT 01 Anexo A) */
    if (K.divisao) {
      ["Alarme de Incêndio", "Detecção de Incêndio", "Hidrantes e Mangotinhos", "Chuveiros Automáticos", "Brigada de Incêndio", "Controle de Materiais de Acabamento e de Revestimento", "Compartimentação Horizontal", "Compartimentação Vertical", "Segurança Estrutural contra Incêndio", "Acesso de Viaturas", "Plano de Intervenção de Incêndio", "Controle de Fumaça"].forEach(function (nm) {
        var m = R.medida(K.divisao, K.altura, nm, { area: K.area, populacao: K.populacao != null ? K.populacao : NaN, ate2005: !!dados.ate2005 }); if (!m.exige) return;
        p("INC_NAO_PROJETADO", "info", "X", nm + ": exigida pela tabela" + (m.nota ? " (com nota)" : ""), "A IT 01 exige \"" + nm + "\" (célula " + m.celula + (m.nota ? "; " + m.nota : "") + "). Este motor não a projeta" + (/Hidrantes|Chuveiros/.test(nm) ? ": use Hidráulica › Incêndio (hidrantes/chuveiros)" : " (IT específica não lida pela RA)") + " — a nota da célula decide se vale para esta edificação.", m.fonte, [], [nota("np-" + nm.length, "Projete a medida pela IT específica ou confirme pela nota que ela não se aplica.")]);
      });
    }

    var nomePav = function (ip) { return L.pavs[ip] ? L.pavs[ip].nome : "pavimento " + (ip + 1); };
    med.pavimentos.forEach(function (ip) {
      var Rd = L.rede(ip); if (!Rd) return;
      var sai = arr(L.saidas[ip]), celAmb = Rd.lista.filter(function (c) { return !!ambPor[Rd.amb[c]]; });
      var Ppav = 0; L.ambientes.forEach(function (a) { if (a.pav === ip) { var q = med.porAmb[a.id]; if (q && q.p != null) Ppav += q.p; } });
      var C = K.divisao ? R.capacidade(K.divisao) : null;

      /* =========================== SAÍDAS */
      if (K.exige.saidas.exige) {
        var fontesS = sai.map(function (s) { return s.interno; }).filter(Boolean);
        if (!fontesS.length) {
          p("INC_SAI_SEM_SAIDA", "critico", "A", nomePav(ip) + " sem saída", ip === 0 ? "Nenhuma porta em parede externa: o pavimento não tem saída para o exterior." : "Nenhuma escada (ambiente \"Escada\" ou escada modelada) chega a este pavimento: a distância até a saída não pôde ser medida.", "CBMMG IT 08 5.5", L.ambientes.filter(function (a) { return a.pav === ip; }).map(function (a) { return a.id; }).slice(0, 4),
            (function () { var opsS0 = ip === 0 ? portaNova(L, { pav: ip, id: "-" }, null) : []; return opsS0.length ? [{ id: "porta0", texto: "Lançar a porta de saída (0,90 m, abrindo para fora) numa parede externa, com a placa e a luminária", ops: comSinalizacao(opsS0) }] : [nota("sem", ip === 0 ? "Lance a porta de entrada numa parede externa (Arquitetura › Porta)." : "Modele a escada (ou o ambiente \"Escada\") que liga este pavimento à saída.")]; })());
        } else {
          var dS = G.distancias(Rd, fontesS);
          /* ambiente sem caminho até a saída */
          var presos = {}; G.semCaminho(Rd, dS, function (c) { return !!ambPor[Rd.amb[c]]; }).forEach(function (c) { presos[Rd.amb[c]] = (presos[Rd.amb[c]] || 0) + 1; });
          Object.keys(presos).forEach(function (id) {
            var a = ambPor[id], n = Rd.lista.filter(function (c) { return Rd.amb[c] === id; }).length; if (presos[id] < n * 0.5) return;
            var g = E.gerar({ estado: est, avaliarFam: aval, ambientes: [id], loteId: "inc-porta-" + id });
            var opsP = g.ok ? g.ops.filter(function (x) { return /porta/.test(txt(x.famId)); }) : [];
            p("INC_SAI_SEM_CAMINHO", "critico", "A", "\"" + a.nome + "\" sem caminho até a saída", "Do ambiente não se chega a nenhuma saída pela rede de portas e circulações (" + presos[id] + " de " + n + " pontos presos).", "CBMMG IT 08 5.5 (rota de saída)", [id],
              opsP.length ? [{ id: "porta", texto: "Lançar a porta do ambiente", ops: opsP }] : [nota("pr", "Abra uma porta do ambiente para a circulação.")]);
          });
          /* distância máxima de caminhamento (Tabela 5) */
          var maisL = G.maisLonge(Rd, dS, function (c) { return !!ambPor[Rd.amb[c]]; }), nSai = sai.length;
          var DM = R.distanciaMaxima({ tipo: K.tipo.tipo, divisao: K.divisao || "D-1", terreo: ip === 0, varias: nSai >= 2, chuveiros: K.chuveiros, deteccao: K.deteccao });
          var distOk = true;
          if (maisL && DM && maisL.d > DM.valor + 1e-6) {
            distOk = false;
            var aW = ambPor[maisL.amb], opsS = portaNova(L, aW, maisL.p);
            p("INC_SAI_DISTANCIA", "critico", "A", nomePav(ip) + ": caminhamento de " + f2(maisL.d) + " m até a saída (máximo " + DM.valor + " m)", "O ponto mais distante (em \"" + (aW ? aW.nome : "?") + "\") fica a " + f2(maisL.d) + " m de percurso da saída mais próxima; a Tabela 5 dá " + DM.valor + " m para edificação tipo " + DM.tipo + " (" + K.tipo.fonte + "), " + DM.linha + ", " + DM.coluna + ". A malha mede até ~5 % a mais que a geodésica (lado seguro)." + (K.tipo.informado ? "" : " TRRF e compartimentação não informados: tipo assumido."), DM.fonte, [maisL.amb].concat(sai.map(function (s) { return s.id; }).filter(function (x) { return !/^escada:/.test(x); })),
              (opsS.length ? [{ id: "saida", texto: "Acrescentar uma saída para o exterior perto do ponto (decisão do RT), com a placa e a luminária", ops: comSinalizacao(opsS) }] : []).concat([nota("dist", "Ou: prever detecção (IT 14) / chuveiros (IT 18), que aumentam o limite da Tabela 5, e informar em Dados da edificação.")]));
          }
          /* número de saídas (Tabela 6) */
          var NS = K.divisao ? R.saidas(K.divisao, K.altura) : null;
          if (NS && !NS.pendente && ip === 0 && nSai < NS.n) {
            var podeF = NS.dispensavelAte36 && K.altura <= 36 && distOk;
            var aF = maisL ? ambPor[maisL.amb] : null, opsN = portaNova(L, aF, maisL ? maisL.p : null);
            p("INC_SAI_NUM_SAIDAS", podeF ? "medio" : "critico", "A", nomePav(ip) + ": " + nSai + " saída(s) — a Tabela 6 pede " + NS.n + " (" + NS.escada + ")", "Divisão " + K.divisao + " até " + (K.altura <= 12 ? "12" : "30") + " m: " + NS.n + " saída(s), escada " + NS.escada + "." + (podeF ? " A nota F permite desconsiderar o número mínimo até 36 m quando as distâncias e as UP são atendidas (atendidas aqui) — fica como aviso." : ""), NS.fonte, sai.map(function (s) { return s.id; }),
              (opsN.length ? [{ id: "saida2", texto: "Acrescentar a segunda saída para o exterior, com a placa e a luminária", ops: comSinalizacao(opsN) }] : []).concat([nota("ns", "Crie a saída/escada adicional em lado oposto (≥ 10 m da outra).")]));
          }
          if (NS && !NS.pendente && NS.n >= 2 && sai.length >= 2) {
            var dmin = R.distanciaEntreSaidas();
            for (var i = 0; i < sai.length; i++) for (var j = i + 1; j < sai.length; j++) if (sai[i].centro && sai[j].centro && dist(sai[i].centro, sai[j].centro) < dmin.valor - 1e-6)
              p("INC_SAI_ENTRE_SAIDAS", "alto", "A", "Saídas " + sai[i].id + " e " + sai[j].id + " a " + f2(dist(sai[i].centro, sai[j].centro)) + " m uma da outra", "Com duas ou mais saídas exigidas, a distância mínima entre elas é " + dmin.valor + " m.", dmin.fonte, [sai[i].id, sai[j].id], [nota("es", "Afaste as saídas (lados opostos do pavimento).")]);
          }
          /* LARGURA: circulação e portas da rota */
          if (C && K.populacao != null) {
            var Nac = R.unidades(Ppav, C.acessos), larg = Math.max(R.larguraMinima(K.divisao).valor, Nac * R.UP().valor), restrito = Ppav <= 20 + 1e-9;
            if (restrito) larg = Math.max(R.larguraRestrita().valor, Nac * R.UP().valor);
            L.ambientes.filter(function (a) { return a.pav === ip && a.tipo.id === "circulacao"; }).forEach(function (a) {
              var dm = dimensoes(a);
              if (dm.largura < larg - 0.005) p("INC_SAI_LARGURA", "critico", "A", "\"" + a.nome + "\": largura " + f2(dm.largura) + " m (mínimo " + f2(larg) + " m)", "Acesso da rota de saída: N = P/C = " + Math.ceil(Ppav - 1e-9) + "/" + C.acessos + " → " + Nac + " UP × 0,55 m, nunca menos que " + f2(restrito ? R.larguraRestrita().valor : R.larguraMinima(K.divisao).valor) + " m" + (restrito ? " (acesso restrito, ≤ 20 pessoas)" : "") + "." + (dm.irregular ? " Forma irregular: largura medida pela caixa do lado mais longo — conferir." : ""), (restrito ? R.larguraRestrita().fonte : R.larguraMinima(K.divisao).fonte) + "; " + R.UP().fonte, [a.id], [nota("larg", "Alargue o corredor para " + f2(larg) + " m (mova a parede) ou reduza a população declarada.")]);
            });
            /* portas: saída final (N do pavimento dividido pelas saídas) e portas de sala com > 50 pessoas */
            sai.filter(function (s) { return s.v; }).forEach(function (s) {
              var Np = R.unidades(Ppav / Math.max(1, sai.length), C.portas), req = R.portaVao(Np), vl = s.v.folha - desconto;
              if (vl < req.valor - 0.005) p("INC_SAI_PORTA_VAO", "alto", "A", "Porta de saída " + s.id + ": vão livre ≈ " + f2(vl) + " m (mínimo " + f2(req.valor) + " m)", "N = " + Math.ceil(Ppav / Math.max(1, sai.length) - 1e-9) + " pessoas / " + C.portas + " → " + Np + " UP. Vão livre ≈ folha − " + f2(desconto) + " m (critério RA).", req.fonte, [s.id], trocarPorta(s.v, req.valor + desconto));
              if (s.v.folha > R.duasFolhasAcima().valor + 1e-6 && !/duas|2f/.test(txt(s.v.famId))) p("INC_SAI_PORTA_VAO", "alto", "A", "Porta " + s.id + " com mais de " + f2(R.duasFolhasAcima().valor) + " m numa folha só", "Porta de rota acima de 1,20 m deve ter duas folhas.", R.duasFolhasAcima().fonte, [s.id], [nota("2f", "Troque por porta de duas folhas.")]);
              if (s.v.correr) p("INC_SAI_PORTA_ROLO", "alto", "A", "Porta de saída " + s.id + " de correr", "Porta de enrolar ou de correr é vedada na rota de saída (exceto porta de segurança para o logradouro, aberta no funcionamento, com placa).", "CBMMG IT 08 5.5.4.8", [s.id], trocarPorGiro(s));
              /* SENTIDO: a porta de saída abre para FORA (exceto A-1/A-2 para o logradouro, 5.5.4.2) */
              var abreLado = s.v.abreFora ? 1 : -1, paraDentro = abreLado === s.lado;
              if (paraDentro && !/^A-(1|2)$/.test(K.divisao) && !s.v.correr) p("INC_SAI_PORTA_SENTIDO", "critico", "A", "Porta de saída " + s.id + " abre para dentro", "As portas das rotas de saída abrem no sentido do trânsito de saída (para fora).", "CBMMG IT 08 5.5.4.1", [s.id], [{ id: "inverter", texto: "Inverter: abrir para fora", ops: [{ op: "instancia", id: s.id, inst: { Abre_para_fora: !s.v.abreFora } }] }]);
            });
            L.ambientes.filter(function (a) { return a.pav === ip; }).forEach(function (a) {
              var q = med.porAmb[a.id]; if (!q || q.p == null || q.p <= 50) return;
              portasDe(L, a).forEach(function (pt) {
                if (pt.v.correr || pt.tr.vizinho == null) return;
                var abreLado = pt.v.abreFora ? 1 : -1;
                if (abreLado === pt.tr.lado) p("INC_SAI_PORTA_SENTIDO", "critico", "A", "Porta " + pt.v.id + " de \"" + a.nome + "\" (" + Math.round(q.p) + " pessoas) abre para dentro", "Sala com capacidade acima de 50 pessoas: a porta abre no sentido da saída.", "CBMMG IT 08 5.5.4.1", [pt.v.id, a.id], [{ id: "inverter", texto: "Inverter: abrir para a circulação", ops: [{ op: "instancia", id: pt.v.id, inst: { Abre_para_fora: !pt.v.abreFora } }] }]);
                var Np2 = R.unidades(q.p, C.portas), rq = R.portaVao(Np2), vl2 = pt.v.folha - desconto;
                if (vl2 < rq.valor - 0.005) p("INC_SAI_PORTA_VAO", "alto", "A", "Porta " + pt.v.id + " de \"" + a.nome + "\": vão livre ≈ " + f2(vl2) + " m (mínimo " + f2(rq.valor) + " m)", Math.round(q.p) + " pessoas → " + Np2 + " UP.", rq.fonte, [pt.v.id], trocarPorta(pt.v, rq.valor + desconto));
              });
            });
            if (K.grupo === "F" && Ppav > 200) p("INC_SAI_BARRA_ANTIPANICO", "pendente", "A", "Grupo F com " + Math.round(Ppav) + " pessoas: barra antipânico nas portas de saída (o modelo não a representa)", "Exigida barra antipânico (NBR 11785) nas portas de saída; a porta do modelo não tem esse acessório, então o motor não confere — especifique no memorial.", "CBMMG IT 08 5.5.4.7", sai.map(function (s) { return s.id; }), [nota("bap", "Especifique a barra antipânico nas portas de saída (SINAPI insumo 39615 — só o material; a instalação: cotar).")]);
          }
        }
      }
      /* escadas e rampas deste pavimento */
      arr(est && est.caixas).forEach(function (c) {
        if (!c || (c.tipo !== "escada" && c.tipo !== "rampa")) return;
        var b0 = c.tipo === "escada" ? num(c.escada && c.escada.par && c.escada.par.base, 0) : num(c.rampa && c.rampa.par && c.rampa.par.base, 0);
        if (L.pavDe(b0 + 0.05) !== ip) return;
        if (c.tipo === "escada") auditarEscada(c, ip); else auditarRampa(c, ip);
      });

      /* =========================== EXTINTORES */
      if (K.exige.extintores.exige) {
        var exP = L.extintores.filter(function (e) { return e.pav === ip; });
        var opsExt = null, opsE = function () { if (!opsExt) opsExt = gerar(["extintor"]); return opsExt; };
        if (!exP.length) p("INC_EXT_AUSENTE_PAVIMENTO", "critico", "A", nomePav(ip) + " sem extintor", "Cada pavimento deve ter no mínimo uma unidade extintora de pó ABC que atenda à distância máxima e à capacidade.", "CBMMG IT 16 6.2.1", L.ambientes.filter(function (a) { return a.pav === ip; }).map(function (a) { return a.id; }).slice(0, 3), [{ id: "lancar", texto: "Lançar os extintores do pavimento", ops: opsE() }]);
        else {
          var rk = K.risco.risco, tA = R.extintor(rk, "A"), tB = R.extintor(rk, "B"), capMin = Number((/(\d+)/.exec(tA.capacidade) || [0, 2])[1]);
          /* alcance de cada extintor: pela capacidade A do rótulo (alto: 3-A 15 m / 4-A 20 m); sem rótulo → a distância da linha mínima */
          var fontes = [], baixos = [];
          exP.forEach(function (e) {
            var ca = capA(e.cap), alc = tA.distancia;
            if (ca != null && ca > 0) { var alt = tA.alternativas.filter(function (x) { return Number((/(\d+)/.exec(x.capacidade) || [0, 0])[1]) <= ca; }); if (alt.length) alc = Math.max.apply(null, alt.map(function (x) { return x.distancia; })); else { baixos.push(e); return; } }
            if (ca === 0) { baixos.push(e); return; }
            fontes.push({ e: e, alc: alc });
          });
          var temGar = celAmb.some(function (c) { return ambPor[Rd.amb[c]].tipo.id === "garagem"; });
          var cobertas = {}; fontes.forEach(function (f) { var cl = G.celula(Rd, add(f.e.p, f.e.dir, 0.15), 0.6); if (!cl) return; var a = Math.min(f.alc, temGar ? tB.distancia : f.alc), d = G.distancias(Rd, [cl], a); celAmb.forEach(function (c) { if (d[c] <= a) cobertas[c] = 1; }); });
          var desc = celAmb.filter(function (c) { return !cobertas[c]; });
          if (desc.length) {
            var porA = {}; desc.forEach(function (c) { porA[Rd.amb[c]] = (porA[Rd.amb[c]] || 0) + 1; });
            p("INC_EXT_DISTANCIA", "critico", "A", nomePav(ip) + ": " + f2(desc.length * Rd.h * Rd.h) + " m² sem extintor a ≤ " + (temGar ? Math.min(tA.distancia, tB.distancia) : tA.distancia) + " m de percurso", "Risco " + K.risco.rotulo.toLowerCase() + " (" + (K.qfi != null ? K.qfi + " MJ/m², " : "") + K.risco.fonte + "): classe A " + tA.capacidade + " a ≤ " + tA.distancia + " m" + (temGar ? "; classe B " + tB.capacidade + " a ≤ " + tB.distancia + " m na garagem" : "") + ", medida pelo PERCURSO real (contornando paredes). Descobertos: " + Object.keys(porA).map(function (id) { return "\"" + (ambPor[id] || {}).nome + "\""; }).join(", ") + ".", tA.fonte + (temGar ? "; " + tB.fonte : ""), Object.keys(porA), [{ id: "lancar", texto: "Lançar os extintores que faltam", ops: opsE() }]);
          }
          if (!exP.some(function (e) { return /ABC/i.test(e.classe + " " + e.agente + " " + e.cap); }) && !(exP.some(function (e) { return capA(e.cap) > 0 && !/BC/i.test(e.classe); }) && exP.some(function (e) { return /BC/i.test(e.classe); }))) {
            var alvoE = exP.filter(function (e) { return e.famId === "inc-extintor"; })[0];
            p("INC_EXT_ABC_PAVIMENTO", "alto", "A", nomePav(ip) + ": sem extintor de pó ABC", "Cada pavimento precisa de ≥ 1 unidade de pó ABC (ou o par classe A + classe B/C); garagem e edificação sem brigada: pó ABC obrigatório.", "CBMMG IT 16 6.2.1, 6.2.1.2", exP.map(function (e) { return e.id; }),
              alvoE ? [{ id: "abc", texto: "Trocar " + alvoE.id + " por pó ABC", ops: [{ op: "instancia", id: alvoE.id, tipoId: rk === "baixo" ? "abc4" : "abc6-3a" }] }] : [nota("abc", "Especifique um extintor de pó ABC no pavimento.")]);
          }
          baixos.forEach(function (e) {
            p("INC_EXT_CAPACIDADE", "alto", "A", "Extintor " + e.id + ": capacidade " + (e.cap || "?") + " abaixo de " + tA.capacidade, "Risco " + K.risco.rotulo.toLowerCase() + ": a unidade extintora de classe A é " + tA.capacidade + " (" + tA.alternativas.map(function (x) { return x.capacidade + " a " + x.distancia + " m"; }).join(" ou ") + "). Este não conta para a cobertura de classe A.", tA.fonte, [e.id],
              e.famId === "inc-extintor" ? [{ id: "cap", texto: "Trocar por pó ABC " + (capMin <= 2 ? "4 kg (2-A)" : "6 kg (3-A)"), ops: [{ op: "instancia", id: e.id, tipoId: capMin <= 2 ? "abc4" : "abc6-3a" }] }] : [nota("cap", "Troque pelo extintor da capacidade da tabela.")]);
          });
          /* a ≤ 10 m de cada entrada do pavimento */
          var entMax = R.EXT.entrada();
          sai.forEach(function (s) {
            if (!s.interno) return;
            var dE = G.distancias(Rd, [s.interno], entMax.valor);
            var ok = exP.some(function (e) { var cl = G.celula(Rd, add(e.p, e.dir, 0.15), 0.6); return cl && dE[cl.i] <= entMax.valor; });
            if (!ok) p("INC_EXT_ENTRADA", "alto", "A", "Nenhum extintor a ≤ " + entMax.valor + " m da entrada " + s.id, "Deve haver no mínimo um extintor a até " + entMax.valor + " m (percurso) da porta de entrada principal / entrada do pavimento.", entMax.fonte, [s.id], [{ id: "lancar", texto: "Lançar o extintor junto da entrada", ops: opsE() }]);
          });
          exP.forEach(function (e) {
            var amb = ambPor[e.amb];
            if (e.alca != null && (e.alca > R.EXT.alca().valor + 1e-6 || (e.baseExt != null && e.baseExt < R.EXT.base().valor - 1e-6)))
              p("INC_EXT_ALTURA", "alto", "A", "Extintor " + e.id + ": alça a " + f2(e.alca) + " m, base a " + f2(e.baseExt) + " m", "Alça até " + f2(R.EXT.alca().valor) + " m do piso e a parte de baixo a ≥ " + f2(R.EXT.base().valor) + " m.", R.EXT.alca().fonte, [e.id], [{ id: "alt", texto: "Alça a 1,50 m", ops: [{ op: "instancia", id: e.id, inst: { Altura_alca: 1.5 } }] }]);
            if (amb && amb.tipo.id === "escada") {
              var e2 = semIds([e.id]);
              p("INC_EXT_ESCADA", "alto", "A", "Extintor " + e.id + " dentro da escada", "Extintores não devem ser instalados em escadas.", "CBMMG IT 16 5.2.2.3", [e.id], [{ id: "mover", texto: "Tirar da escada e relançar fora", ops: [{ op: "apagar", id: e.id }].concat(gerar(["extintor"], e2)) }]);
            }
            if (K.exige.sinalizacao.exige) {
              var temE5 = L.placas.some(function (q) { return q.pav === ip && q.funcao === "equipamento" && dist(q.p, e.p) <= 0.6 && (q.baseH >= (e.alca || 1.2) - 0.05); });
              if (!temE5) p("INC_EXT_SEM_SINAL", "alto", "A", "Extintor " + e.id + " sem placa E5", "Equipamento sinalizado imediatamente acima, com a base da placa a 1,80 m.", R.SIN.equipamento().fonte, [e.id], [{ id: "e5", texto: "Lançar a placa E5 acima do extintor", ops: [placaSobre(e, "extintor-20x20", R.SIN.equipamento().valor)] }]);
              if (amb && amb.tipo.id === "garagem" && !L.placas.some(function (q) { return q.pav === ip && q.funcao === "piso" && dist(q.p, e.p) <= 1.2; }))
                p("INC_EXT_SINAL_PISO", "medio", "A", "Extintor " + e.id + " em garagem sem sinalização de piso", "Em garagem, depósito, fabricação e grande varejo a sinalização de piso E12 (1,00 × 1,00 m) é obrigatória.", R.SIN.piso().fonte, [e.id], [{ id: "e12", texto: "Lançar o E12 no piso", ops: [placaSobre(e, "piso-E12", 0)] }]);
            }
          });
          /* risco especial (sala elétrica, gerador, casa de bombas…): extintor do lado de fora a ≤ 5 m da porta */
          L.ambientes.filter(function (a) { return a.pav === ip && a.especial; }).forEach(function (a) {
            var pts = portasDe(L, a); if (!pts.length) return;
            var c0 = E.ptParede(L.porParede[pts[0].v.parede], pts[0].v.t, 0);
            var ok = exP.some(function (e) { return e.amb !== a.id && dist(e.p, c0) <= R.EXT.riscoEspecial().valor + 1e-6; });
            if (!ok) p("INC_EXT_RISCO_ESPECIAL", "alto", "A", "\"" + a.nome + "\" (risco especial) sem extintor do lado de fora", "Locais fechados de risco especial têm o extintor no lado EXTERNO, junto da entrada (a unidade geral pode servir se estiver a ≤ 5 m).", "CBMMG IT 16 5.2.2.10, 5.2.2.11", [a.id], [{ id: "lancar", texto: "Lançar o extintor junto da porta, do lado de fora", ops: opsE() }]);
          });
        }
      }

      /* =========================== ILUMINAÇÃO */
      if (K.exige.iluminacao.exige) {
        if (K.iluminacaoIsenta) { if (ip === med.pavimentos[0]) p("INC_ILUM_ISENCAO", "info", "A", "Iluminação de emergência isenta", K.iluminacaoIsenta.texto, K.iluminacaoIsenta.fonte, [], [nota("is", "Nada a lançar; a isenção fica registrada.")]); }
        else {
          var lum = L.luminariasEm.filter(function (l) { return l.pav === ip; });
          var opsLum = null, opsL = function () { if (!opsLum) opsLum = gerar(["luminaria"]); return opsLum; };
          var alvoL = Rd.lista.filter(function (c) { var a = ambPor[Rd.amb[c]]; return a && !A.SEM_LUZ[a.tipo.id]; });
          if (!lum.length) p("INC_ILUM_AUSENTE", "critico", "A", nomePav(ip) + " sem iluminação de emergência", "A coluna \"Iluminação de Emergência\" do Anexo A exige o sistema (" + K.exige.iluminacao.fonte + ").", "CBMMG IT 01 Anexo A; IT 13", [], [{ id: "lancar", texto: "Lançar as luminárias de emergência", ops: opsL() }]);
          else {
            /* IT 13 5.4 — "a distância máxima entre dois pontos de iluminação de aclaramento deve ser de 15 m ponto a ponto" (revisão 21/10/2026).
               A leitura é a do TEXTO: o limite é o ESPAÇAMENTO entre luminárias vizinhas, medido pelo percurso. A leitura antiga ("nenhum ponto
               a mais de 7,5 m") só equivale a ela ao longo de um corredor; numa sala ela reprovava a malha regular de 15 m (o centro do quadrado
               fica a 15/√2 = 10,6 m dos quatro pontos) — aviso falso num projeto legal e luminária a mais no orçamento.
               (1) ESPAÇAMENTO (A): as luminárias do pavimento se ligam em cadeia por passos de até 15 m (árvore geradora mínima pelo percurso);
                   passo maior que 15 m = falha. Tolerância de 0,50 m: a malha mede até ~5 % a mais que o percurso real.
               (2) COBERTURA (C): nenhum ponto a mais de 15/√2 = 10,6 m de uma luminária — o maior afastamento que a malha de 15 m deixa;
                   sem isso uma sala grande com UM ponto passaria (não há "dois pontos" para medir). */
            var sp = R.ILUM.distancia().valor, raioL = sp / Math.SQRT2, tolE = 0.5, cobL = {}, celsL = [];
            lum.forEach(function (l) { var cl = G.celula(Rd, add(l.p, l.dir, 0.15), 0.6); celsL.push(cl); if (!cl) return; var d = G.distancias(Rd, [cl], raioL); alvoL.forEach(function (c) { if (d[c] <= raioL) cobL[c] = 1; }); });
            var descL = alvoL.filter(function (c) { return !cobL[c]; });
            if (descL.length) { var porL = {}; descL.forEach(function (c) { porL[Rd.amb[c]] = 1; });
              p("INC_ILUM_COBERTURA", "alto", "C", nomePav(ip) + ": " + f2(descL.length * Rd.h * Rd.h) + " m² a mais de " + f2(raioL) + " m da luminária de emergência", "Com 15 m entre pontos (IT 13 5.4) nenhum ponto fica a mais de 15/√2 = " + f2(raioL) + " m de uma luminária (critério RA, conferir). Descobertos: " + Object.keys(porL).map(function (id) { return "\"" + (ambPor[id] || {}).nome + "\""; }).join(", ") + ".", R.ILUM.distancia().fonte, Object.keys(porL), [{ id: "lancar", texto: "Lançar as luminárias que faltam", ops: opsL() }]); }
            var arestas = [];
            celsL.forEach(function (ci, i) { if (!ci) return; var d = G.distancias(Rd, [ci], 4 * sp); celsL.forEach(function (cj, j) { if (j > i && cj && isFinite(d[cj.i])) arestas.push([d[cj.i], i, j]); }); });
            arestas.sort(function (x, y) { return x[0] - y[0]; });
            var paiL = lum.map(function (x, i) { return i; }), raizL = function (i) { while (paiL[i] !== i) { paiL[i] = paiL[paiL[i]]; i = paiL[i]; } return i; };
            arestas.forEach(function (e) {
              var a0 = raizL(e[1]), b0 = raizL(e[2]); if (a0 === b0) return; paiL[a0] = b0;
              if (e[0] > sp + tolE) p("INC_ILUM_ESPACAMENTO", "alto", "A", nomePav(ip) + ": luminárias " + lum[e[1]].id + " e " + lum[e[2]].id + " a " + f2(e[0]) + " m de percurso (máximo " + sp + " m)", "A distância máxima entre dois pontos de iluminação de aclaramento é " + sp + " m ponto a ponto; entre estas duas (as vizinhas mais próximas dos dois grupos) não há outra luminária.", R.ILUM.distancia().fonte, [lum[e[1]].id, lum[e[2]].id], [{ id: "lancar", texto: "Lançar as luminárias que faltam", ops: opsL() }]);
            });
            sai.filter(function (s) { return s.v; }).forEach(function (s) {
              if (!lum.some(function (l) { return dist(add(l.p, l.dir, 0.15), s.interno) <= A.CRIT.pertoPorta.valor + 0.4; }))
                p("INC_ILUM_PORTA", "alto", "N", "Porta de saída " + s.id + " sem luminária de emergência junto", "Uma luminária junto de cada porta de saída destinada a ser usada na emergência (" + R.ILUM.nbr10898.portaDeSaida.item + ").", R.ILUM.nbr10898.norma + " (cópia não licenciada — conferir)", [s.id], [{ id: "lancar", texto: "Lançar a luminária junto da porta", ops: opsL() }]);
            });
            lum.forEach(function (l) {
              if (l.h < R.ILUM.alturaTensao.valor - 1e-6 && (l.tensao == null || l.tensao > R.ILUM.tensao().valor + 1e-6))
                p("INC_ILUM_TENSAO", "medio", "A", "Luminária " + l.id + " a " + f2(l.h) + " m: tensão " + (l.tensao == null ? "não declarada" : l.tensao + " V"), "Abaixo de 2,5 m de altura a luminária trabalha com até 30 V (ou DR 30 mA + disjuntor 10 A).", R.ILUM.tensao().fonte, [l.id], l.famId === "inc-luminaria" ? [{ id: "tens", texto: "Luminária de " + R.ILUM.tensao().valor + " V", ops: [{ op: "instancia", id: l.id, inst: { Tensao_V: R.ILUM.tensao().valor } }] }] : [nota("tens", "Especifique luminária de 30 V ou preveja DR de 30 mA + disjuntor de 10 A no circuito.")]);
            });
            /* fluxo do bloco: um aviso por pavimento com as luminárias que não declaram ≥ 300 lm (não um por peça: aviso repetido ensina a ignorar) */
            var semFluxo = lum.filter(function (l) { return l.fluxo < R.ILUM.nbr10898.fluxoBlocoMin_lm.valor; }), fluxoNaoDecl = semFluxo.every(function (l) { return !l.fluxo; });
            /* fluxo NÃO declarado (0) = o modelo não traz o dado: o motor não mede, não reprova — pendência (a ficha do produto decide). Fluxo
               declarado e abaixo de 300 lm = aviso. */
            if (semFluxo.length) p("INC_ILUM_FLUXO", fluxoNaoDecl ? "pendente" : "medio", "N", nomePav(ip) + ": " + semFluxo.length + " luminária(s) " + (fluxoNaoDecl ? "sem fluxo declarado" : "com fluxo < " + R.ILUM.nbr10898.fluxoBlocoMin_lm.valor + " lm"), "Bloco autônomo com fluxo ≥ " + R.ILUM.nbr10898.fluxoBlocoMin_lm.valor + " lm, ou estudo luminotécnico que comprove a iluminância mínima (" + R.ILUM.nbr10898.fluxoBlocoMin_lm.item + "). A composição da SINAPI (97599) não declara o fluxo: " + semFluxo.map(function (l) { return l.id + (l.fluxo ? " " + l.fluxo + " lm" : ""); }).join(", ") + ".", R.ILUM.nbr10898.norma + " (cópia não licenciada; MG adota a 2013 — conferir)", semFluxo.map(function (l) { return l.id; }), [nota("flx", "Confira o fluxo na ficha do produto comprado (ou faça o estudo luminotécnico) e informe em Propriedades › Fluxo_lm.")]);
            var N10 = R.ILUM.nbr10898;
            if (ip === med.pavimentos[0]) p("INC_ILUM_NBR10898", "pendente", "N", "Iluminância e autonomia: conferir na NBR 10898", "Os números 3 lx (plano) / 5 lx (escada, desnível, equipamento), autonomia ≥ " + N10.autonomiaMin_h.valor + " h e comutação ≤ " + N10.comutacaoMax_s.valor + " s são da NBR 10898:2023 (cópia não licenciada; MG adota a de 2013, sem texto). O motor não afirma \"atende\" nisso.", "CBMMG IT 13 (Portaria 71/2023); " + N10.norma + " " + [N10.iluminanciaPlano_lx.item, N10.autonomiaMin_h.item].join(", "), [], [nota("10898", "Obter o exemplar (convênio Confea) e conferir com a ficha das luminárias.")]);
          }
        }
      }

      /* =========================== SINALIZAÇÃO */
      if (K.exige.sinalizacao.exige) {
        var pl = L.placas.filter(function (q) { return q.pav === ip; });
        var opsO = null, opsOr = function () { if (!opsO) opsO = gerar(["orientacao"]); return opsO; };
        sai.filter(function (s) { return s.v; }).forEach(function (s) {
          var verga = s.v.peitoril + s.v.altura, ps = pl.filter(function (q) { return q.funcao === "saida" && dist(q.p, s.centro) <= s.v.largura / 2 + 0.4; });
          if (!ps.length) { p("INC_SIN_SAIDA_PORTA", "alto", "A", "Porta de saída " + s.id + " sem placa SAÍDA", "Sinalização de saída acima da porta, a no máximo 0,10 m da verga (ou na folha, base a 1,80 m).", R.SIN.baseSaida().fonte, [s.id], [{ id: "s12", texto: "Lançar a placa S12 acima da porta", ops: gerar(["saida"]) }]); return; }
          ps.forEach(function (q) {
            var okA = (q.baseH >= verga - 0.01 && q.baseH <= verga + R.SIN.baseSaida().valor + 0.01) || Math.abs(q.baseH - R.SIN.altura().valor) <= 0.05;
            if (!okA) p("INC_SIN_ALTURA", "medio", "A", "Placa " + q.id + ": base a " + f2(q.baseH) + " m (verga a " + f2(verga) + " m)", "A placa de saída fica acima da porta, a no máximo 0,10 m da verga (ou na folha, base a 1,80 m).", R.SIN.baseSaida().fonte, [q.id, s.id], [{ id: "alt", texto: "Base a " + f2(verga + 0.05) + " m", ops: [{ op: "instancia", id: q.id, inst: { Altura_base: r4(verga + 0.05) } }] }]);
          });
        });
        pl.forEach(function (q) {
          if (q.funcao === "piso" || q.funcao === "saida") return;
          if (Math.abs(q.baseH - R.SIN.altura().valor) > 0.05) p("INC_SIN_ALTURA", "medio", "A", "Placa " + q.id + ": base a " + f2(q.baseH) + " m", "Placas de orientação, equipamento e pavimento com a base a 1,80 m do piso.", R.SIN.altura().fonte, [q.id], [{ id: "alt", texto: "Base a 1,80 m", ops: [{ op: "instancia", id: q.id, inst: { Altura_base: R.SIN.altura().valor } }] }]);
          var amb = ambPor[q.amb], Lr = amb ? Math.min(30, Math.max.apply(null, amb.pts.map(function (v) { return dist(v, q.p); }))) : q.leitura, Lu = q.funcao === "orientacao" ? q.leitura : Math.max(q.leitura, q.funcao === "equipamento" ? 4 : Math.min(15, Lr)), Am = R.placaAreaMinima(Lu);
          if (q.larg * q.alt < Am.area - 1e-6) p("INC_SIN_DIMENSAO", "medio", "A", "Placa " + q.id + ": " + f2(q.larg) + " × " + f2(q.alt) + " m pequena para " + f2(Am.L) + " m de leitura", "Área ≥ L²/2000 = " + f2(Am.area) + " m².", Am.fonte, [q.id], q.larg * q.alt < 0.08 && Am.area <= 0.08 ? [{ id: "maior", texto: "Trocar pela de 0,40 × 0,20 m", ops: [{ op: "instancia", id: q.id, tipoId: q.funcao === "orientacao" ? "rota-40x20" : "saida-40x20", inst: { Distancia_leitura: r4(Am.L) } }] }] : [nota("dim", "Especifique placa com área ≥ " + f2(Am.area) + " m² (sem item nas bases lidas: cotar).")]);
        });
        pl.filter(function (q) { return q.funcao === "saida"; }).forEach(function (q) {
          var amb = ambPor[q.amb], Lr = amb ? Math.min(30, Math.max.apply(null, amb.pts.map(function (v) { return dist(v, q.p); }))) : q.leitura, Am = R.placaAreaMinima(Math.max(q.leitura, Lr));
          if (q.larg * q.alt < Am.area - 1e-6) p("INC_SIN_DIMENSAO", "medio", "A", "Placa " + q.id + ": " + f2(q.larg) + " × " + f2(q.alt) + " m pequena para " + f2(Am.L) + " m de leitura", "Área ≥ L²/2000 = " + f2(Am.area) + " m².", Am.fonte, [q.id], Am.area <= 0.08 ? [{ id: "maior", texto: "Trocar pela de 0,40 × 0,20 m", ops: [{ op: "instancia", id: q.id, tipoId: "saida-40x20", inst: { Distancia_leitura: r4(Am.L) } }] }] : [nota("dim", "Especifique placa com área ≥ " + f2(Am.area) + " m² (sem item nas bases lidas: cotar).")]);
        });
        /* orientação: todo ponto da ROTA a ≤ 15 m de uma placa de saída/orientação (ou isenção do térreo) */
        var fontesS2 = sai.map(function (s) { return s.interno; }).filter(Boolean);
        if (fontesS2.length) {
          var dS2 = G.distancias(Rd, fontesS2), mx = 0; celAmb.forEach(function (c) { if (isFinite(dS2[c])) mx = Math.max(mx, dS2[c]); });
          var isen = R.SIN.isencao(), raioO = R.SIN.orientacao().valor;
          if (ip === 0 && mx < isen.valor) p("INC_SIN_ISENCAO_TERREO", "info", "A", "Orientação da rota dispensada (percurso " + f2(mx) + " m < " + isen.valor + " m)", "Térreo com saída direta ao logradouro e percurso menor que 15 m: dispensa a sinalização de orientação, DESDE QUE a saída seja visível de todos os pontos (o motor não mede a visibilidade — conferir).", isen.fonte, [], [nota("vis", "Confira se a saída é visível de todo o pavimento; se não for, lance a orientação.")]);
          else {
            var rota = Rd.lista.filter(function (c) { var a = ambPor[Rd.amb[c]]; return a && (A.ROTA[a.tipo.id] || sai.some(function (s) { return s.amb && s.amb.id === a.id; })); });
            var sinais = pl.filter(function (q) { return q.funcao === "saida" || q.funcao === "orientacao"; });
            /* cada placa orienta até onde é LEGÍVEL: min(15 m, √(2000 · A)) — IT 15 6.1.3 b) e Anexo A */
            var cob = {}; sinais.forEach(function (q) { var cl = G.celula(Rd, add(q.p, q.dir, 0.15), 0.6); if (!cl) return; var rq = Math.min(raioO, Math.sqrt(2000 * q.larg * q.alt)), d = G.distancias(Rd, [cl], rq); rota.forEach(function (c) { if (d[c] <= rq) cob[c] = 1; }); });
            var descO = rota.filter(function (c) { return !cob[c]; });
            if (descO.length) { var porO = {}; descO.forEach(function (c) { porO[Rd.amb[c]] = 1; });
              p("INC_SIN_ROTA_15M", "alto", "A", nomePav(ip) + ": trecho da rota a mais de " + raioO + " m de uma placa", "Orientação das rotas: de qualquer ponto da rota a distância de percurso até a sinalização é ≤ " + raioO + " m; em toda mudança de direção e escada (a próxima visível, limite 30 m). Sem placa: " + Object.keys(porO).map(function (id) { return "\"" + (ambPor[id] || {}).nome + "\""; }).join(", ") + ".", R.SIN.orientacao().fonte, Object.keys(porO), [{ id: "lancar", texto: "Lançar a sinalização de orientação", ops: opsOr() }]); }
          }
        }
        if (med.pavimentos.length > 1) L.ambientes.filter(function (a) { return a.pav === ip && a.tipo.id === "escada"; }).forEach(function (a) {
          if (!pl.some(function (q) { return q.funcao === "pavimento" && q.amb === a.id; })) {
            var cs = A.candidatos(L, est, aval, ip, function (b) { return b.id === a.id; }, 1.8, 1.95), c = cs[0];
            p("INC_SIN_PAVIMENTO_ESCADA", "medio", "A", "Escada \"" + a.nome + "\" sem o número do pavimento (S17)", "Identificação do pavimento a 1,80 m, junto à parede sobre o patamar, visível na subida e na descida.", "CBMMG IT 15 6.1.3 c)", [a.id], c ? [{ id: "s17", texto: "Lançar a placa S17", ops: [{ op: "familia", id: "inc-pl-s17-" + a.id, famId: "inc-placa", tipoId: "pavimento-15x15", x: r4(add(c.P, c.dir, 0.005)[0]), y: r4(a.base), z: r4(add(c.P, c.dir, 0.005)[1]), rotY: c.rotY, inst: { Altura_base: 1.8, Distancia_leitura: 4 } }] }] : [nota("s17", "Fixe a placa S17 na parede do patamar.")]);
          }
        });
      }
    });
    return fechar();

    /* ---------------- ajudantes que precisam do escopo */
    function placaSobre(e, tipo, hB) {
      return { op: "familia", id: "inc-pl-" + e.id, famId: "inc-placa", tipoId: tipo, x: r4(e.p[0] + e.dir[0] * (tipo === "piso-E12" ? 0.02 : 0)), y: r4(L.ambientes.filter(function (a) { return a.id === e.amb; }).map(function (a) { return a.base; })[0] || 0), z: r4(e.p[1] + e.dir[1] * (tipo === "piso-E12" ? 0.02 : 0)), rotY: e.rotY, inst: { Altura_base: hB, Distancia_leitura: 4 } };
    }
    function trocarPorta(v, folhaMin) {
      var PT = ESQ && ESQ.PORTAS ? ESQ.PORTAS : [], P = PT.filter(function (x) { return x.folha / 100 >= folhaMin - 1e-6; })[0];
      return v.famId === "ra-porta-giro" && P ? [{ id: "tipo", texto: "Trocar para a folha de " + f2(P.folha / 100) + " m", ops: [{ op: "instancia", id: v.id, tipoId: P.tipoId }] }] : [nota("tipo", "Troque por porta com folha ≥ " + f2(folhaMin) + " m (duas folhas acima de 1,20 m).")];
    }
    /* porta de correr/enrolar na rota: sai e entra uma de giro de 0,90 m abrindo para FORA, no mesmo vão da parede */
    function trocarPorGiro(s) {
      var v = s.v, ESQa = ESQ && ESQ.PORTAS ? ESQ.PORTAS : [], P = ESQa.filter(function (x) { return x.folha === 90; })[0];
      if (!P || !v || !v.parede || s.lado == null) return [nota("rolo", "Troque por porta de abrir no sentido da saída.")];
      return [{ id: "giro", texto: "Trocar por porta de giro de 0,90 m abrindo para fora", ops: [{ op: "apagar", id: v.id }, { op: "familia", id: "inc-giro-" + v.id, famId: "ra-porta-giro", tipoId: P.tipoId, host: { id: v.parede, t: r4(v.t) }, inst: { Abre_para_fora: s.lado === -1, Mao_direita: false } }] }];
    }
    function solDegrau(c) { return solucaoDegrau(R, c, nota); }
    function auditarEscada(c, ip) {
      var k = c.escada.calc || {}, par = c.escada.par || {}, eM = R.ESC.espelho(), bl = R.ESC.blondel(), e = num(k.e, 0), pp = num(k.p, 0);
      if (e && (e < eM.min - eM.tol - 1e-6 || e > eM.max + eM.tol + 1e-6 || 2 * e + pp < bl.min - 1e-6 || 2 * e + pp > bl.max + 1e-6))
        p("INC_SAI_ESCADA_DEGRAU", "alto", "A", "Escada " + c.id + ": espelho " + f2(e * 100) + " cm, piso " + f2(pp * 100) + " cm (2h + b = " + f2((2 * e + pp) * 100) + " cm)", "Espelho de 16 a 18 cm (±0,5) e 63 ≤ 2h + b ≤ 64 cm (a NBR 9050 aceita até 65: use 63–64 para atender as duas).", eM.fonte + "; " + bl.fonte, [c.id], solDegrau(c));
      var lm = R.ESC.lancoMax(), lances = arr(c.escada.lances);
      if (num(par.desnivel, 0) > lm.valor + 1e-6 && lances.length <= 1) p("INC_SAI_ESCADA_PATAMAR", "alto", "A", "Escada " + c.id + ": lanço de " + f2(num(par.desnivel, 0)) + " m sem patamar", "O lanço vence no máximo " + f2(lm.valor) + " m entre patamares.", lm.fonte, [c.id], [nota("pat", "Divida em dois lances (escada em U ou em L) com patamar.")]);
      var Pp = 0; L.ambientes.forEach(function (a) { if (a.pav >= ip) { var q = med.porAmb[a.id]; if (q && q.p != null) Pp += q.p; } });
      var C2 = K.divisao ? R.capacidade(K.divisao) : null, larg = R.larguraMinima(K.divisao || "D-1").valor;
      if (C2 && C2.escadas) larg = Math.max(larg, R.unidades(Pp, C2.escadas) * R.UP().valor);
      /* IT 08 5.7.7.2 (revisão 21/10/2026): até 50 pessoas atendidas pela escada, grupos A, B, D, G e J-1 com altura ≤ 6,0 m — qualquer tipo
         de escada com 0,90 m. Antes o auditor pedia 1,10 m e reprovava a escada legal do sobrado comercial pequeno. */
      var ne50 = null;
      if ((/^(A|B|D|G)$/.test(K.grupo) || K.divisao === "J-1") && K.altura <= 6 + 1e-9 && med.populacao != null && Pp <= 50 + 1e-9) {
        var pNE = R.param("in.it08.escadas_rampas_guardas", "escada_NE_ate_50_pessoas"), lNE = Number((/largura\s*([\d,]+)\s*m/.exec(String(pNE.valor)) || [0, "0"])[1].replace(",", "."));
        if (lNE > 0) { ne50 = { valor: lNE, fonte: pNE.fonte }; larg = Math.min(larg, lNE); }
      }
      if (num(par.largura, 0) < larg - 0.005 && !(Pp <= 20 && num(par.largura, 0) >= R.larguraRestrita().valor - 0.005)) p("INC_SAI_ESCADA_LARGURA", "alto", "A", "Escada " + c.id + ": largura " + f2(num(par.largura, 0)) + " m (mínimo " + f2(larg) + " m)", "Escada da rota: N × 0,55 m, nunca menos que " + f2(ne50 ? ne50.valor : R.larguraMinima(K.divisao || "D-1").valor) + " m" + (ne50 ? " (até 50 pessoas, grupo " + K.grupo + ", altura ≤ 6 m)" : "") + " (escada de acesso restrito ≤ 20 pessoas: 0,80 m).", ne50 ? ne50.fonte : R.larguraMinima(K.divisao || "D-1").fonte, [c.id], [{ id: "larg", texto: "Largura " + f2(larg) + " m", ops: [{ op: "ajustar", id: c.id, campos: { escada: { largura: r4(larg) } } }] }]);
      var gs = arr(est && est.caixas).filter(function (g) { return g && g.tipo === "guarda" && g.guarda && g.guarda.host && String(g.guarda.host.id) === String(c.id); });
      var cm = R.ESC.corrimao(), lados = {}; gs.forEach(function (g) { var h1 = num(g.guarda.par && g.guarda.par.c1Altura, null); if (h1 != null) lados[g.guarda.host.lado || g.id] = h1; });
      var nLados = Object.keys(lados).length, fora = Object.keys(lados).filter(function (k2) { return lados[k2] < cm.min - 1e-6 || lados[k2] > cm.max + 1e-6; });
      if (nLados < 2 || fora.length) p("INC_SAI_CORRIMAO", "alto", "A", "Escada " + c.id + ": corrimão " + (nLados < 2 ? "em " + nLados + " lado(s)" : "fora de 0,80–0,92 m"), "Corrimão nos dois lados, a 0,80–0,92 m, contínuo, prolongando ≥ 20 cm; seção 38–45 mm atende também a NBR 9050.", cm.fonte, [c.id].concat(gs.map(function (g) { return g.id; })), (function () { var o2 = opsCorrimao(est, c); return o2.length ? [{ id: "corrimao", texto: "Corrimão dos dois lados (0,92 m e 0,70 m)", ops: o2 }] : [nota("cor", "Lance o guarda-corpo com corrimão dos dois lados (Editar tipo › Corrimão 1 a 0,92 m).")]; })());
      var gd = R.ESC.guarda();
      gs.forEach(function (g) { var h = num(g.guarda.par && g.guarda.par.altura, null); if (h != null && h < gd.escadaInterna - 1e-6) p("INC_SAI_GUARDA", "alto", "A", "Guarda-corpo " + g.id + " da escada com " + f2(h) + " m", "Guarda de 1,05 m (0,92 m em escada interna; 1,30 m em escada aberta externa).", gd.fonte, [g.id], [{ id: "gd", texto: "Guarda a 1,05 m", ops: [{ op: "ajustar", id: g.id, campos: { guarda: { altura: gd.geral } } }] }]); });
    }
    function auditarRampa(c, ip) {
      var par = c.rampa.par || {}, iMx = R.rampaMaxima(K.divisao || "A-2", false), i0 = num(par.inclinacao, 0), pat = num(par.patamar, 0), patMin = R.ESC.rampaPatamar();
      if (i0 > iMx.valor + 1e-6) p("INC_SAI_RAMPA", "alto", "A", "Rampa " + c.id + ": " + f2(i0) + " % (máximo " + f2(iMx.valor) + " % para o grupo " + (K.grupo || "?") + ")", "Declividade máxima da rampa da rota de saída pelo grupo de ocupação.", iMx.fonte, [c.id], [{ id: "inc", texto: "Inclinação " + f2(Math.min(iMx.valor, 8.33)) + " %", ops: [{ op: "ajustar", id: c.id, campos: { rampa: { inclinacao: Math.min(iMx.valor, 8.33) } } }] }]);
      if (arr(c.rampa.lances).length > 1 && pat < patMin.valor - 1e-6) p("INC_SAI_RAMPA", "alto", "A", "Rampa " + c.id + ": patamar de " + f2(pat) + " m", "Patamar ≥ " + f2(patMin.valor) + " m, em nível.", patMin.fonte, [c.id], [{ id: "pat", texto: "Patamar 1,20 m", ops: [{ op: "ajustar", id: c.id, campos: { rampa: { patamar: 1.2 } } }] }]);
    }
    function fechar() {
      probs.forEach(function (q) { q.solucoes.forEach(function (s) { if (s.ops && !s.ops.length) delete s.ops; }); });
      var porCod = {}; probs.forEach(function (q) { porCod[q.codigo] = (porCod[q.codigo] || 0) + 1; });
      return { problemas: probs, porCodigo: porCod, classe: K, medidas: { altura: med.altura, area: med.area, populacao: med.populacao, terrea: med.terrea, pavimentos: med.pavimentos },
        resumo: { erros: probs.filter(function (q) { return q.gravidade === "erro"; }).length, avisos: probs.filter(function (q) { return q.gravidade === "aviso" && q.peso !== "info" && q.peso !== "pendente"; }).length, info: probs.filter(function (q) { return q.peso === "info" || q.peso === "pendente"; }).length,
          extintores: L.extintores.length, placas: L.placas.length, luminarias: L.luminariasEm.length } };
    }
  }

  /* degrau fora de Blondel/NBR 9050: a regra "Blondel RA" da escada (2e + p entre 63 e 64 cm) refaz o piso — só oferece se a conta fecha
     (espelho 16–18 ± tol, piso 28–32, 2e + p dentro da IT 08). Sem fechar: nota. */
  function solucaoDegrau(R, c, nota) {
    var BAq = global.BimArq, par = c.escada && c.escada.par || {}, eM2 = R.ESC.espelho(), bl2 = R.ESC.blondel(), np = R.ACS.escadaPiso();
    if (BAq && BAq.escadaCalc && par.regra !== "blondel") {
      var k2 = BAq.escadaCalc(par.desnivel, { n: par.n, emax: par.emax, pmin: par.pmin, piso: par.piso, tipoId: par.tipoId, larguraMin: par.larguraMin, largura: par.largura, regra: "blondel" });
      if (k2 && k2.ok && k2.e >= eM2.min - eM2.tol - 1e-6 && k2.e <= eM2.max + eM2.tol + 1e-6 && 2 * k2.e + k2.p >= bl2.min - 1e-6 && 2 * k2.e + k2.p <= bl2.max + 1e-6 && k2.p >= np.min - 1e-6 && k2.p <= np.max + 1e-6)
        return [{ id: "blondel", texto: "Regra Blondel RA: espelho " + f2(k2.e * 100) + " cm, piso " + f2(k2.p * 100) + " cm", muda: "O piso passa a " + f2(k2.p * 100) + " cm (2h + b = " + f2((2 * k2.e + k2.p) * 100) + " cm).", ops: [{ op: "ajustar", id: c.id, campos: { escada: { regra: "blondel" } } }] }];
    }
    return [nota("deg", "Ajuste o tipo da escada (espelho máximo/piso mínimo) em Propriedades › Editar tipo.")];
  }
  /* CORRIMÃO dos dois lados a 0,92 e 0,70 m (IT 08 5.8.2 e NBR 9050 6.9.2): ajusta os guarda-corpos que já guardam a escada/rampa e cria
     os dos lados que faltam (escada com o caminho gravado). Serve ao auditor de incêndio e ao de acessibilidade. */
  function opsCorrimao(est, c) {
    var BAq = global.BimArq, ops = [], tem = {};
    arr(est && est.caixas).forEach(function (g) {
      if (!g || g.tipo !== "guarda" || !g.guarda || !g.guarda.host || String(g.guarda.host.id) !== String(c.id)) return;
      tem[g.guarda.host.lado] = 1; ops.push({ op: "ajustar", id: g.id, campos: { guarda: { c1Altura: 0.92, c2Altura: 0.70 } } });
    });
    if (c.tipo === "escada" && BAq && BAq.guardasDaEscada && BAq.paraOp && c.escada && c.escada.caminhos) {
      arr(BAq.guardasDaEscada(c, c.id, {})).forEach(function (g) {
        var lado = g.guarda.host.lado; if (tem[lado]) return;
        g.guarda.par.c1Altura = 0.92; g.guarda.par.c2Altura = 0.70;
        ops.push({ op: "criar", id: "inc-gd-" + c.id + "-" + lado, caixa: BAq.paraOp(g) });
      });
    }
    return ops;
  }
  /* as portas de um ambiente: [{ v, tr }] */
  function portasDe(L, a) {
    var out = [];
    L.vaos.forEach(function (v) { if (v.tipo !== "porta") return; a.trechos.forEach(function (tr) { if (tr.paredeId === v.parede && v.t >= tr.t0 - 0.05 && v.t <= tr.t1 + 0.05 && !out.some(function (x) { return x.v.id === v.id; })) out.push({ v: v, tr: tr }); }); });
    return out;
  }
  /* uma porta NOVA para o exterior no ambiente (ou no ambiente com parede externa mais perto do ponto): 0,90, abrindo para fora */
  function portaNova(L, a, ponto) {
    var E = EA(), cands = [];
    L.ambientes.forEach(function (b) {
      if (a && b.pav !== a.pav) return;
      b.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        var w = L.porParede[tr.paredeId]; if (!w) return;
        var ocup = L.vaos.filter(function (v) { return v.parede === w.id; }).map(function (v) { return [v.t - v.largura / 2 - 0.3, v.t + v.largura / 2 + 0.3]; });
        for (var t = tr.t0 + 0.8; t <= tr.t1 - 0.8 + 1e-9; t += 0.5) {
          if (ocup.some(function (q) { return t + 0.55 > q[0] && t - 0.55 < q[1]; })) continue;
          var P = E.ptParede(w, t, 0), d = ponto ? dist(P, ponto) : 0;
          cands.push({ b: b, w: w, tr: tr, t: t, d: d + (a && b.id === a.id ? 0 : 3) });
        }
      });
    });
    cands.sort(function (x, y) { return x.d - y.d; });
    var c = cands[0]; if (!c) return [];
    return [{ op: "familia", id: "inc-saida-" + c.b.id, famId: "ra-porta-giro", tipoId: "p90", host: { id: c.w.id, t: r4(c.t) }, inst: { Abre_para_fora: c.tr.lado === -1, Mao_direita: false } }];
  }

  var IncAuditor = { auditar: auditar, dimensoes: dimensoes, capA: capA, portasDe: portasDe, portaNova: portaNova, opsCorrimao: opsCorrimao, solucaoDegrau: solucaoDegrau };
  global.IncAuditor = IncAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = IncAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
