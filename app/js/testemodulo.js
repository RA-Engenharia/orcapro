/* =====================================================================
 * testemodulo.js — TESTE DE 1 HORA POR MÓDULO (motor puro + relógio do navegador).
 *
 * PEDIDO DO ROGÉRIO (21/10/2026): "Todos os usuários que comprarem o sistema,
 * mesmo que comprem só o orçamento ou módulos específicos, terão todos os
 * módulos liberados com um cronômetro: cada módulo pode ser usado durante uma
 * hora para testar. Vencida a hora, tem que comprar; o módulo continua
 * aparecendo, mas pede a compra. [...] ele tem a opção de não ver mais essas
 * abas e mostrar só o que comprou."
 *
 * AS REGRAS (decisões do mesmo dia), nesta ordem:
 *   1. Só vale para licença PAGA e EM DIA (Licenca.status: ativo, fora do
 *      teste de 7 dias, sem suspensão por cobrança). Vitrine ?demo=1, teste
 *      grátis sem chave, licença vencida/suspensa: nada muda.
 *   2. O tempo e a regra vêm do SERVIDOR (vendas-config → testeModulos,
 *      server/teste-modulo.js). Sem a resposta dele (`ligado` falso, ou nunca
 *      respondeu) o programa fica EXATAMENTE como antes — é assim que a
 *      implantação liga com a flag desligada primeiro.
 *   3. O relógio só anda com USO ATIVO: a tela/o comando do módulo aberto, a
 *      janela visível e uma interação nos últimos `ociosoSegundos` (120 s).
 *      Ocioso não conta. Aviso aos 10 min e a 1 min do fim.
 *   4. O tempo é guardado no servidor por licença (e-mail da chave) e módulo
 *      — limpar o navegador não zera. Offline: conta aqui e sincroniza depois;
 *      vale o MAIOR dos dois. Sem servidor por mais de `offlineHoras`, o teste
 *      fica PAUSADO (não conta e não libera) — o que a pessoa comprou nunca é
 *      afetado.
 *   5. Durante o teste tudo funciona, mas o entregável (PDF, DXF, IFC,
 *      prancha, proposta) sai com a marca "Versão de teste". Vencida a hora:
 *      o trabalho continua salvo e visível, não edita nem exporta até comprar.
 *   6. "Mostrar só o que comprei" (por usuário, nas preferências sincronizadas)
 *      esconde os módulos não comprados — reversível.
 *   7. Para licenças pagas, este teste SUBSTITUI o de 7 dias do Modela/Blocok/
 *      Marmoraria (`substituiTeste7Dias`, o dono pode vetar no servidor). Quem
 *      já está no meio dos 7 dias mantém até o fim (js/modela.js).
 *
 * OS ESTADOS de um módulo (calcular → mods[id].estado):
 *   "fora"     o regime não vale (flag desligada, demo, licença não paga) → como antes
 *   "comprado" a pessoa tem o direito por compra/vitalícia/cortesia → nada muda
 *   "oculto"   "Mostrar só o que comprei" ligado e não comprado → escondido
 *   "pausado"  sem servidor há mais de offlineHoras → aparece, não conta, não libera
 *   "teste"    restam minutos → liberado (entregável com a marca)
 *   "vencido"  a hora acabou → aparece, só leitura, pede a compra
 *
 * ⚠ A TRAVA É NA FUNÇÃO, NÃO NO BOTÃO: App._trialBloqueado (salvar/exportar
 *   de toda tela), Gestao._bloqueado (gravações da Gestão), BimCmd.executar
 *   (todo comando da fita do BIM), App.persistir (orçamento da licença só do
 *   Modela) e marcarArquivo (os `baixar` dos entregáveis) perguntam AQUI.
 *
 * Motor puro (calcular, acumular, aplicarServidor, marcarConteudo) testado em
 * tools/test-teste-modulo.js; o resto é a fiação do navegador. ES5, IIFE.
 * ===================================================================== */
(function (global) {
  "use strict";

  var MIN = 60000;
  var KEY = "orcapro:teste1h:v1";
  /* cada tique soma no máximo isto: suspender o notebook ou travar a aba não vira minutos */
  var MAX_DELTA = 15000;
  var TIQUE_MS = 5000;
  var SYNC_MS = 60000;           // heartbeat: um POST por minuto de uso, no máximo
  var STATUS_MS = 5 * MIN;       // e o status (config + minutos do servidor) de 5 em 5 min
  /* o PADRÃO vale só para os campos que o servidor não mandou; `ligado` nunca nasce ligado aqui */
  var PADRAO = { ligado: false, minutos: 60, ociosoSegundos: 120, avisosMinutos: [10, 1], substituiTeste7Dias: true,
    aposTeste7Dias: true, offlineHoras: 72, pendenteMax: 5, planos: { orcamento: "anual", gestao: "plus_anual", bim: "bim_anual" } };

  var DISC = ["civil", "estrutura", "hidraulica", "eletrica", "metalica", "marcenaria"];
  var NOME_DISC = { civil: "Arquitetura & Civil", estrutura: "Estrutura", hidraulica: "Hidráulica & Sanitária", eletrica: "Elétrica & Dados", metalica: "Metálica & Mecânica", marcenaria: "Carpintaria & Marcenaria" };
  /* O REGISTRO dos módulos com trava de licença (o mapa completo está em docs/teste-modulos/IMPLANTACAO-VPS.md) */
  var MODULOS = [
    { id: "orcamento", nome: "Orçamentos", area: "orcamento", tipo: "plano",
      oque: "Orçamento com SINAPI, composições, BDI, cronograma e a proposta comercial." },
    { id: "gestao", nome: "Gestão de Obras", area: "gestao", tipo: "plano",
      oque: "Obras, contratos, medições, financeiro, compras, estoque, diário (RDO), equipe, ponto e frota." },
    { id: "bim", nome: "BIM", area: "bim", tipo: "plano",
      oque: "Abrir e compatibilizar IFC, conferir interferências e gerar o orçamento do modelo." }
  ];
  DISC.forEach(function (d) {
    MODULOS.push({ id: "modela:" + d, nome: "Modela · " + NOME_DISC[d], area: "bim", tipo: "disciplina", disciplina: d,
      oque: "A modelagem da disciplina " + NOME_DISC[d] + " no BIM: as ferramentas da fita, as pranchas e os documentos dela." });
  });
  MODULOS.push({ id: "blocok", nome: "Blocok — paredes prontas", area: "bim", tipo: "extra", extra: "blocok",
    oque: "Paginação das placas, executivo, memorial, orçamento e pranchas do sistema Blocok." });
  MODULOS.push({ id: "marmoraria", nome: "Marmoraria", area: "bim", tipo: "extra", extra: "marmoraria",
    oque: "Bancadas de pedra, executivo, plano de chapa, tabela de preços, orçamento e proposta do marmorista." });
  /* PRANCHA VIVA (21/10/2026, js/pranchavivamodulo.js): módulo à parte, como a Marmoraria */
  /* ⚠ soVisualiza: a Prancha Viva MOSTRA o modelo (folha → 3D), não o edita nem gera entregável do BIM. Em teste, ela mantém
     a tela do BIM de pé (é nela que roda), mas NÃO destrava comando que edita o modelado, comando comum nem a marca dos
     entregáveis. Roteiro do defeito (21/10/2026): com o módulo novo em teste e o Modela vencido, o "copiar" voltou a rodar
     (tools/test-teste-modulo.js "PLUS com o Modela vencido" reprovou). */
  MODULOS.push({ id: "pranchaviva", nome: "Prancha Viva", area: "bim", tipo: "extra", extra: "pranchaviva", soVisualiza: true,
    oque: "A prancha do projeto que abre o 3D no ponto tocado: corte na cota, disciplinas, medir, a peça com o item do orçamento e a etapa, e o pacote para o celular." });
  var POR_ID = {};
  MODULOS.forEach(function (m) { POR_ID[m.id] = m; });
  var IDS = MODULOS.map(function (m) { return m.id; });

  /* os ENTREGÁVEIS que levam a marca. ⚠ O arquivo do PROJETO (.opbim, .optpl, .json, .zip) não é entregável:
     é o trabalho da pessoa, e marcá-lo (ou recusá-lo) seria mexer no que ela salvou. */
  var ENTREGAVEL = /\.(pdf|dxf|ifc|svg|html?|dwg|xlsx|docx|pptx|png|jpe?g|csv)$/i;
  var PREFIXO = "VERSAO DE TESTE - ";
  var TEXTO_MARCA = "Versão de teste";

  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function obj(o) { return (o && typeof o === "object") ? o : {}; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function copia(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (e) { return {}; } }

  var TM = {
    MIN: MIN, KEY: KEY, PADRAO: PADRAO, MODULOS: MODULOS, IDS: IDS, DISC: DISC, MAX_DELTA: MAX_DELTA,
    PREFIXO: PREFIXO, TEXTO_MARCA: TEXTO_MARCA, ENTREGAVEL: ENTREGAVEL,
    modulo: function (id) { return POR_ID[String(id || "")] || null; },
    nome: function (id) { var m = POR_ID[id]; return m ? m.nome : String(id || ""); },
    idDisciplina: function (d) { return d === "marmoraria" || d === "blocok" ? d : (DISC.indexOf(d) >= 0 ? "modela:" + d : ""); },

    /* a config do servidor, com os limites de bom senso (número torto não vira hora infinita nem zero) */
    cfgDe: function (b) {
      b = obj(b);
      var c = copia(PADRAO);
      c.ligado = b.ligado === true;
      var mi = num(b.minutos); if (mi >= 1 && mi <= 24 * 60) c.minutos = mi;
      var oc = num(b.ociosoSegundos); if (oc >= 30 && oc <= 3600) c.ociosoSegundos = oc;
      if (arr(b.avisosMinutos).length) c.avisosMinutos = arr(b.avisosMinutos).map(num).filter(function (x) { return x > 0 && x < c.minutos; });
      if (b.substituiTeste7Dias === false) c.substituiTeste7Dias = false;
      if (b.aposTeste7Dias === false) c.aposTeste7Dias = false;
      var oh = num(b.offlineHoras); if (oh >= 1 && oh <= 24 * 30) c.offlineHoras = oh;
      var pm = num(b.pendenteMax); if (pm >= 2 && pm <= 240) c.pendenteMax = pm;
      var p = obj(b.planos);
      Object.keys(p).forEach(function (k) { if (/^[a-z0-9_]{2,60}$/.test(String(p[k]))) c.planos[k] = String(p[k]); });
      return c;
    },

    /* ==================================================================
     * A REGRA, PURA. Entrada:
     *   { agora, cfg (bruto do servidor), cfgEm (quando chegou), demo,
     *     licencaPaga, uso:{id:ms local}, srv:{id:minutos do servidor},
     *     direitos:{id:true}, soComprados, foraDoTeste:{id:true} }
     * Saída: { regime, pausado, motivo, cfg, mods:{id:{estado,usadoMs,restanteMs,limiteMs}} }
     * ================================================================== */
    calcular: function (e) {
      e = obj(e);
      var agora = num(e.agora) || Date.now(), cfg = this.cfgDe(e.cfg), cfgEm = num(e.cfgEm);
      var limite = cfg.minutos * MIN, out = { regime: false, pausado: false, motivo: "", cfg: cfg, mods: {} };
      var dir = obj(e.direitos), uso = obj(e.uso), srv = obj(e.srv), fora = obj(e.foraDoTeste), pend = obj(e.pendentes);
      function por(estado) { IDS.forEach(function (id) { out.mods[id] = { estado: estado, usadoMs: 0, restanteMs: limite, limiteMs: limite }; }); }
      if (!cfg.ligado || !cfgEm) { out.motivo = "desligado"; por("fora"); return out; }
      if (e.demo) { out.motivo = "demo"; por("fora"); return out; }
      if (!e.licencaPaga) { out.motivo = "licenca"; por("fora"); return out; }
      out.regime = true;
      /* config velha (sem servidor há mais de offlineHoras) ou do futuro (relógio voltado): o teste PAUSA */
      out.pausado = cfgEm > agora + MIN || agora > cfgEm + cfg.offlineHoras * 3600000;
      /* ⚠ o status responde mas o heartbeat não chega há mais de offlineHoras (endereço do /uso bloqueado, por
         exemplo): sem isto, limpar o navegador zeraria um tempo que o servidor nunca viu. Pausa — não tranca o comprado */
      var pv = num(e.pendMaisAntigo);
      if (pv > 0 && pv * MIN < agora - cfg.offlineHoras * 3600000) out.pausado = true;
      IDS.forEach(function (id) {
        var usado = Math.max(num(uso[id]), num(srv[id]) * MIN), rest = Math.max(0, limite - usado), est;
        if (dir[id]) est = "comprado";
        else if (fora[id]) est = "fora";
        else if (e.soComprados) est = "oculto";
        else if (out.pausado) est = "pausado";
        /* ⚠ MINUTOS SEM CONFIRMAÇÃO DO SERVIDOR (revisão adversarial R3): a partir de `pendenteMax` (5) o teste daquele
           módulo pausa até o heartbeat chegar. Roteiro do defeito: offline (ou com só o /uso bloqueado) o app contava
           sozinho por até 72 h; os minutos nunca chegavam ao servidor, e apagar a chave do localStorage e reabrir com
           internet devolvia a hora inteira — infinitas vezes. Agora cada limpeza rende no máximo 5 minutos. */
        else if (rest > 0 && num(pend[id]) >= cfg.pendenteMax) est = "pausado";
        else est = rest > 0 ? "teste" : "vencido";
        out.mods[id] = { estado: est, usadoMs: usado, restanteMs: rest, limiteMs: limite };
      });
      return out;
    },

    /* ==================================================================
     * O RELÓGIO, PURO. `st` é o estado guardado (é alterado e devolvido).
     * ctx: { agora, ativos:[ids], visivel, ultimaInteracao, calc (saída do calcular) }
     * Devolve { st, eventos:[{tipo:"inicio"|"aviso"|"fim", modulo, min?}] }.
     * ================================================================== */
    acumular: function (st, ctx) {
      st = st || {}; ctx = obj(ctx);
      var agora = num(ctx.agora) || Date.now(), calc = ctx.calc || { mods: {}, cfg: PADRAO }, cfg = calc.cfg || PADRAO;
      /* ⚠ O INTERVALO É DESTA ABA (ctx.antTab, na memória dela), NÃO o `ultTick` do disco (revisão adversarial R1).
         Roteiro do defeito: toda aba aberta gravava o `ultTick` a cada tique, contando ou não; uma aba escondida
         tiquetaqueando entre dois tiques da aba em uso cortava o intervalo pela metade — dez abas escondidas e a
         hora de teste virava dez. Agora: o intervalo vai do tique anterior DESTA aba, e nunca começa antes do último
         tique que CONTOU em qualquer aba (`ultConta`): duas janelas em uso ao mesmo tempo somam o tempo do relógio,
         não o dobro; a aba nova (F5) continua de onde a outra contou. Sem `antTab` (chamada antiga): o `ultTick`. */
      var temTab = Object.prototype.hasOwnProperty.call(ctx, "antTab");
      var ant = temTab ? num(ctx.antTab) : num(st.ultTick), antC = num(st.ultConta), eventos = [];
      st.uso = obj(st.uso); st.srv = obj(st.srv); st.pend = obj(st.pend); st.mins = obj(st.mins);
      st.inicio = obj(st.inicio); st.fim = obj(st.fim); st.avisos = obj(st.avisos);
      st.ultTick = agora;
      if (!calc.regime || calc.pausado) return { st: st, eventos: eventos };
      /* relógio voltado para trás, primeiro tique, ou parado demais: este tique não soma nada */
      var desde = Math.max(ant, antC > 0 && antC <= agora ? antC : 0);
      var delta = desde > 0 && agora > desde ? Math.min(agora - desde, MAX_DELTA) : 0;
      var contou = false;
      var ativo = !!ctx.visivel && (agora - num(ctx.ultimaInteracao)) <= cfg.ociosoSegundos * 1000;
      var vistos = {}, limite = cfg.minutos * MIN;
      arr(ctx.ativos).forEach(function (id) {
        if (vistos[id]) return; vistos[id] = 1;
        var m = calc.mods && calc.mods[id];
        if (!m || m.estado !== "teste" || !ativo || !delta) return;
        var base = Math.max(num(st.uso[id]), num(st.srv[id]) * MIN), novo = Math.min(limite, base + delta);
        st.uso[id] = novo; contou = true;
        if (!st.inicio[id]) { st.inicio[id] = agora; eventos.push({ tipo: "inicio", modulo: id }); }
        /* o heartbeat: cada MINUTO COMPLETO de uso vira um índice de minuto do relógio de parede
           (floor(agora/60000)) — o servidor guarda o CONJUNTO, então repetir o envio não soma duas vezes */
        var feitos = Math.floor(novo / MIN), reg = Math.max(num(st.mins[id]), num(st.srv[id]));
        if (feitos > reg) {
          var p = arr(st.pend[id]).slice(), idx = Math.floor(agora / MIN);
          for (var k = feitos - reg - 1; k >= 0; k--) { var mi = idx - k; if (p.indexOf(mi) < 0) p.push(mi); }
          st.pend[id] = p; st.mins[id] = feitos;
        }
        var rest = limite - novo, av = st.avisos[id] = obj(st.avisos[id]);
        /* só o aviso MAIS PERTO do fim: quem chega com 15 s sobrando (outro aparelho, servidor) não lê "faltam 10 min" */
        var novos = arr(cfg.avisosMinutos).filter(function (a) { return rest > 0 && rest <= a * MIN && !av[a]; });
        if (novos.length) {
          novos.forEach(function (a) { av[a] = 1; });
          eventos.push({ tipo: "aviso", modulo: id, min: Math.min.apply(null, novos) });
        }
        if (rest <= 0 && !st.fim[id]) { st.fim[id] = agora; eventos.push({ tipo: "fim", modulo: id }); }
      });
      if (contou) st.ultConta = agora;
      return { st: st, eventos: eventos };
    },

    /* a resposta do servidor ({uso:{id:minutos}}) entra pelo MAIOR: nunca encolhe o que já foi contado aqui */
    aplicarServidor: function (st, resp, enviados) {
      st = st || {}; st.srv = obj(st.srv); st.mins = obj(st.mins); st.uso = obj(st.uso); st.pend = obj(st.pend);
      /* o suporte ZEROU um módulo no servidor (com OK do dono): data mais nova que a última vista → o relógio
         local daquele módulo recomeça (sem isto, "vale o maior" manteria o tempo velho para sempre) */
      var z = obj(resp && resp.zerados);
      st.zeradoVisto = obj(st.zeradoVisto);
      Object.keys(z).forEach(function (id) {
        if (!POR_ID[id] || !(num(z[id]) > num(st.zeradoVisto[id]))) return;
        st.zeradoVisto[id] = num(z[id]);
        delete st.uso[id]; delete st.srv[id]; delete st.mins[id]; delete st.pend[id];
        if (st.inicio) delete st.inicio[id]; if (st.fim) delete st.fim[id]; if (st.avisos) delete st.avisos[id];
      });
      var u = obj(resp && resp.uso);
      Object.keys(u).forEach(function (id) {
        if (!POR_ID[id]) return;
        var m = Math.max(0, Math.floor(num(u[id])));
        if (m > num(st.srv[id])) st.srv[id] = m;
        if (num(st.srv[id]) > num(st.mins[id])) st.mins[id] = num(st.srv[id]);
        if (num(st.srv[id]) * MIN > num(st.uso[id])) st.uso[id] = num(st.srv[id]) * MIN;
      });
      /* o que foi ENVIADO e o servidor recebeu sai da fila (o resto fica para o próximo envio) */
      var env = obj(enviados);
      Object.keys(env).forEach(function (id) {
        st.pend[id] = arr(st.pend[id]).filter(function (x) { return arr(env[id]).indexOf(x) < 0; });
        if (!st.pend[id].length) delete st.pend[id];
      });
      return st;
    },

    /* ==================================================================
     * A MARCA NO ARQUIVO, PURA. Devolve { nome, dados } — texto conhecido
     * ganha a marca DENTRO dele; binário (PDF, planilha, imagem) só no nome
     * (o PDF que sai pela impressão leva a faixa do js/testemoduloui.js).
     * ================================================================== */
    marcarConteudo: function (nome, dados, mime) {
      nome = String(nome || "arquivo");
      if (nome.indexOf(PREFIXO) === 0) return { nome: nome, dados: dados, ja: true };   // já marcado por quem chamou antes
      var n2 = PREFIXO + nome, ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1] || "";
      ext = ext.toLowerCase();
      /* PDF (Uint8Array/ArrayBuffer): a marca vai DENTRO do arquivo (revisão R7) — com a marca só no nome, renomear o
         arquivo entregava o PDF limpo. Estrutura desconhecida (recursos indiretos, xref em fluxo): fica só o nome. */
      if (ext === "pdf" && typeof dados !== "string") { var pm = this.marcarPdf(dados); return { nome: n2, dados: pm || dados, soNome: !pm }; }
      if (typeof dados !== "string") return { nome: n2, dados: dados };
      /* já marcado por dentro (o documento da janela nova que, bloqueada, cai no `baixar`): não marca duas vezes */
      if (dados.indexOf('data-teste-marca="1"') >= 0) return { nome: n2, dados: dados };
      var d = dados, aviso = "VERSAO DE TESTE - OrcaPRO (teste de 1 hora do modulo; compre para tirar a marca)";
      if (ext === "dxf") {
        /* o TEXT entra no começo das ENTITIES, na layer VERSAO_DE_TESTE; a altura sai da extensão do desenho
           ($EXTMIN/$EXTMAX do cabeçalho, 4 % da largura) para ser legível em metro e em milímetro */
        var nl = d.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
        var lin = d.split(/\r?\n/), x0 = 0, y0 = 0, x1 = 0, h = 1;
        for (var i = 0; i < lin.length - 6; i++) {
          if (/^\s*\$EXTMIN\s*$/.test(lin[i])) { x0 = num(lin[i + 2]); y0 = num(lin[i + 4]); }
          if (/^\s*\$EXTMAX\s*$/.test(lin[i])) { x1 = num(lin[i + 2]); }
        }
        if (x1 > x0) h = Math.max((x1 - x0) * 0.04, 0.01);
        var ent = ["0", "TEXT", "8", "VERSAO_DE_TESTE", "62", "1", "10", String(x0), "20", String(y0), "30", "0", "40", String(Math.round(h * 1000) / 1000), "1", "VERSAO DE TESTE - OrcaPRO"].join(nl) + nl;
        var j = -1;
        for (var k = 0; k < lin.length - 1; k++) { if (/^\s*2\s*$/.test(lin[k]) && /^\s*ENTITIES\s*$/.test(lin[k + 1])) { j = k + 1; break; } }
        if (j >= 0) { lin.splice(j + 1, 0, ent.replace(new RegExp(nl + "$"), "")); d = lin.join(nl); }
        d = "999" + nl + aviso + nl + d;
        return { nome: n2, dados: d };
      }
      if (ext === "ifc" || /^ISO-10303-21;/.test(d)) {
        /* STEP aceita comentário (barra-asterisco) e a FILE_DESCRIPTION é uma lista: a marca vai nos dois */
        d = d.replace(/HEADER;/, "HEADER;\n/* " + aviso + " */");
        d = d.replace(/FILE_DESCRIPTION\s*\(\s*\(/, "FILE_DESCRIPTION(('VERSAO DE TESTE - OrcaPRO',");
        return { nome: n2, dados: d };
      }
      if (ext === "svg") {
        var marca = '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="64" font-weight="700" fill="#c0392b" fill-opacity="0.22" transform="rotate(-30)" transform-origin="center" data-teste-marca="1">VERSÃO DE TESTE</text>';
        d = d.lastIndexOf("</svg>") >= 0 ? d.slice(0, d.lastIndexOf("</svg>")) + marca + "</svg>" : d;
        return { nome: n2, dados: d };
      }
      if (ext === "html" || ext === "htm") {
        var faixa = '<div data-teste-marca="1" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:700 12px Arial,sans-serif;text-align:center;padding:3px">VERSÃO DE TESTE — OrçaPRO</div>';
        d = /<body[^>]*>/i.test(d) ? d.replace(/<body[^>]*>/i, function (b) { return b + faixa; }) : faixa + d;
        return { nome: n2, dados: d };
      }
      if (ext === "csv") return { nome: n2, dados: aviso + "\n" + d };
      return { nome: n2, dados: d };
    },

    /* ==================================================================
     * A MARCA DENTRO DO PDF, PURA (revisão adversarial R7). Os PDF do
     * sistema (js/svgpdf.js, js/marcenariasaida.js) são texto simples: cada
     * página é um dicionário com /Resources e /Contents. A marca entra por
     * ATUALIZAÇÃO INCREMENTAL (o arquivo original fica intacto; acrescenta-se
     * a fonte, a transparência, o texto diagonal e a faixa do alto e uma nova
     * tabela xref com /Prev). Devolve os bytes novos ou null (estrutura que
     * não dá para marcar com segurança).
     * ================================================================== */
    marcarPdf: function (dados) {
      var u = null;
      try {
        if (typeof ArrayBuffer !== "undefined" && dados instanceof ArrayBuffer) u = new Uint8Array(dados);
        else if (dados && dados.BYTES_PER_ELEMENT === 1 && typeof dados.subarray === "function") u = dados;
      } catch (e0) { u = null; }
      if (!u || u.length < 40) return null;
      try {
        var s = "";
        for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, Math.min(u.length, i + 8192)));
        if (!/^%PDF-1\.\d/.test(s)) return null;
        var sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s), it = s.lastIndexOf("trailer");
        if (!sx || it < 0) return null;
        var tr = s.slice(it, sx.index), tSize = /\/Size\s+(\d+)/.exec(tr), tRoot = /\/Root\s+(\d+\s+\d+\s+R)/.exec(tr), tInfo = /\/Info\s+(\d+\s+\d+\s+R)/.exec(tr);
        if (!tSize || !tRoot) return null;
        var objs = {}, re = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj/g, m;
        while ((m = re.exec(s))) objs[m[1]] = m[2];
        var pags = Object.keys(objs).filter(function (k) { var b = objs[k]; return /\/Type\s*\/Page(?![A-Za-z])/.test(b) && b.indexOf("stream") < 0; });
        if (!pags.length) return null;
        var prox = Math.floor(num(tSize[1])), nF = prox++, nG = prox++, nQ = prox++, novos = [], falhou = false;
        novos.push([nF, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]);
        novos.push([nG, "<< /Type /ExtGState /ca 0.16 /CA 0.16 >>"]);
        novos.push([nQ, "<< /Length 1 >>\nstream\nq\nendstream"]);
        var r2 = function (v) { return String(Math.round(v * 100) / 100); };
        pags.forEach(function (k) {
          if (falhou) return;
          var b = objs[k].replace(/^\s+|\s+$/g, "");
          var mb = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(b);
          var x0 = mb ? num(mb[1]) : 0, y0 = mb ? num(mb[2]) : 0, x1 = mb ? num(mb[3]) : 595, y1 = mb ? num(mb[4]) : 842, w = x1 - x0, h = y1 - y0;
          if (!(w > 0 && h > 0) || /\/Font\s+\d+\s+\d+\s+R/.test(b) || /\/ExtGState\s+\d+\s+\d+\s+R/.test(b)) { falhou = true; return; }
          var ri = b.search(/\/Resources\s*<</); if (ri < 0) { falhou = true; return; }
          /* "VERSÃO DE TESTE" em Helvetica-Bold = 9,391 em; na diagonal, 62 % do comprimento dela */
          var ang = Math.atan2(h, w), co = Math.cos(ang), si = Math.sin(ang), S = Math.sqrt(w * w + h * h) * 0.62 / 9.391, tw = S * 9.391;
          var ex = x0 + w / 2 - (tw / 2) * co + (S * 0.35) * si, ey = y0 + h / 2 - (tw / 2) * si - (S * 0.35) * co, corpo = Math.max(5, Math.min(9, w / 70));
          var cont = "Q\nq /GSvt gs 0.75 0.11 0.11 rg BT /FVt " + r2(S) + " Tf " + r2(co) + " " + r2(si) + " " + r2(-si) + " " + r2(co) + " " + r2(ex) + " " + r2(ey) + " Tm (VERS\xc3O DE TESTE) Tj ET Q\n" +
            "q 0.75 0.11 0.11 rg BT /FVt " + r2(corpo) + " Tf 1 0 0 1 " + r2(x0 + 8) + " " + r2(y1 - corpo - 4) + " Tm (VERS\xc3O DE TESTE - Or\xe7aPRO - teste de 1 hora do m\xf3dulo; compre para tirar a marca) Tj ET Q";
          var nW = prox++;
          novos.push([nW, "<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream"]);
          var cRef = /\/Contents\s+(\d+\s+\d+\s+R)/.exec(b), cArr = /\/Contents\s*\[([^\]]*)\]/.exec(b);
          if (cRef) b = b.replace(cRef[0], "/Contents [" + nQ + " 0 R " + cRef[1] + " " + nW + " 0 R]");
          else if (cArr) b = b.replace(cArr[0], "/Contents [" + nQ + " 0 R " + cArr[1] + " " + nW + " 0 R]");
          else { falhou = true; return; }
          ri = b.search(/\/Resources\s*<</);
          var abre = b.indexOf("<<", ri) + 2, resto = b.slice(abre);
          resto = /\/Font\s*<</.test(resto) ? resto.replace(/\/Font\s*<</, "/Font << /FVt " + nF + " 0 R") : " /Font << /FVt " + nF + " 0 R >>" + resto;
          resto = /\/ExtGState\s*<</.test(resto) ? resto.replace(/\/ExtGState\s*<</, "/ExtGState << /GSvt " + nG + " 0 R") : " /ExtGState << /GSvt " + nG + " 0 R >>" + resto;
          novos.push([Math.floor(num(k)), b.slice(0, abre) + resto]);
        });
        if (falhou) return null;
        var base = u.length, app = s.charAt(s.length - 1) === "\n" ? "" : "\n", offs = [];
        novos.forEach(function (o) { offs.push([o[0], base + app.length]); app += o[0] + " 0 obj\n" + o[1] + "\nendobj\n"; });
        var xr = base + app.length;
        app += "xref\n";
        offs.sort(function (a, b2) { return a[0] - b2[0]; }).forEach(function (o) { app += o[0] + " 1\n" + ("0000000000" + o[1]).slice(-10) + " 00000 n \n"; });
        app += "trailer\n<< /Size " + prox + " /Root " + tRoot[1] + (tInfo ? " /Info " + tInfo[1] : "") + " /Prev " + sx[1] + " >>\nstartxref\n" + xr + "\n%%EOF\n";
        var out = new Uint8Array(base + app.length); out.set(u, 0);
        for (var j = 0; j < app.length; j++) out[base + j] = app.charCodeAt(j) & 255;
        return out;
      } catch (e) { return null; }
    },
    /* o .ZIP de entregáveis de um módulo (DXF do executivo, os documentos): cada arquivo de dentro ganha a marca. Só
       ZIP sem compressão (o que o BimBcf.zipEscrever grava); outro formato: só o nome. */
    marcarZip: function (nome, dados) {
      var n2 = String(nome).indexOf(PREFIXO) === 0 ? String(nome) : PREFIXO + nome, Z = global.BimBcf, self = this, u = null;
      try { u = (dados && dados.BYTES_PER_ELEMENT === 1) ? dados : ((typeof ArrayBuffer !== "undefined" && dados instanceof ArrayBuffer) ? new Uint8Array(dados) : null); } catch (e0) { u = null; }
      if (!u || !Z || !Z.zipEscrever || typeof TextDecoder === "undefined") return { nome: n2, dados: dados };
      try {
        var r16 = function (p) { return u[p] | (u[p + 1] << 8); }, r32 = function (p) { return (u[p] | (u[p + 1] << 8) | (u[p + 2] << 16)) + u[p + 3] * 16777216; };
        var fim = -1; for (var i = u.length - 22; i >= 0 && i > u.length - 66000; i--) if (r32(i) === 0x06054b50) { fim = i; break; }
        if (fim < 0) return { nome: n2, dados: dados };
        var n = r16(fim + 10), p = r32(fim + 16), saida = {}, dec = new TextDecoder("utf-8");
        for (var k = 0; k < n; k++) {
          if (r32(p) !== 0x02014b50) return { nome: n2, dados: dados };
          var metodo = r16(p + 10), cs = r32(p + 20), nl = r16(p + 28), el = r16(p + 30), cl = r16(p + 32), off = r32(p + 42);
          var en = dec.decode(u.subarray(p + 46, p + 46 + nl));
          p += 46 + nl + el + cl;
          if (metodo !== 0 || r32(off) !== 0x04034b50) return { nome: n2, dados: dados };
          var ini = off + 30 + r16(off + 26) + r16(off + 28), bruto = u.subarray(ini, ini + cs), ext = ((en.match(/\.([a-z0-9]+)$/i) || [])[1] || "").toLowerCase();
          if (/^(dxf|svg|html?|csv|ifc)$/.test(ext)) saida[en] = self.marcarConteudo(en, dec.decode(bruto)).dados;
          else if (ext === "pdf") saida[en] = self.marcarPdf(bruto.slice(0)) || bruto.slice(0);
          else saida[en] = bruto.slice(0);
        }
        return { nome: n2, dados: Z.zipEscrever(saida) };
      } catch (e) { return { nome: n2, dados: dados }; }
    },
    /* o DOCUMENTO QUE ABRE NUMA JANELA NOVA para imprimir/salvar em PDF (memorial, pranchas, manual): a faixa vai no
       HTML (a faixa de impressão do testemoduloui é CSS da janela principal e não chega lá). null = não abrir
       (módulo vencido; a oferta já está na tela). Revisão adversarial R7. */
    marcarHtml: function (html, modulo) {
      var r = this.marcarArquivo("documento.html", String(html == null ? "" : html), "text/html", modulo || "");
      return r ? r.dados : null;
    },

    /* ==================================================================
     *                    A FIAÇÃO DO NAVEGADOR
     * ================================================================== */
    _ultimaInteracao: 0,
    _ler: function () { try { return JSON.parse(global.localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } },
    _gravar: function (st) { this._memo = null; try { global.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} },
    _lic: function () { return global.Licenca || null; },
    _chaveRef: function () { var L = this._lic(); try { var k = (L && L.chave && L.chave()) || ""; return k ? k.slice(-16) : ""; } catch (e) { return ""; } },
    /* o estado desta LICENÇA: trocar de chave não herda os minutos (nem a config) de outra */
    _estado: function () {
      var st = this._ler(), ref = this._chaveRef();
      if (String(st.chaveRef || "") !== ref) st = { chaveRef: ref };
      return st;
    },
    _demo: function () {
      try { if (/[?&]demo=1\b/.test((global.location && global.location.search) || "")) return true; } catch (e) {}
      try { return !!(global.App && global.App._demo); } catch (e2) { return false; }
    },
    licencaPaga: function () {
      var L = this._lic(); if (!L || !L.status) return false;
      try { var s = L.status() || {}; return !!(s.ativo && !s.trial && !s.suspensa && !s.expirada && L.chave && L.chave()); } catch (e) { return false; }
    },
    /* o que a pessoa já tem SEM o teste — perguntado a quem decide cada direito */
    _direitos: function () {
      var d = {}, G = global.Gestao, M = global.Modela, L = this._lic(), so = false, gest = false, base = null;
      try { so = !!(L && L.soModela && L.soModela()); } catch (e0) {}
      try { gest = !!(G && (G.podeGestaoComprada ? G.podeGestaoComprada() : (G.podeGestao && G.podeGestao()))); } catch (e1) {}
      try { base = M && M.statusBase ? M.statusBase() : null; } catch (e2) { base = null; }
      d.orcamento = !so;
      d.gestao = gest;
      var modelaAlgo = !!(base && base.liberado);
      DISC.forEach(function (x) { d["modela:" + x] = !!(base && base.liberado && arr(base.disciplinas).indexOf(x) >= 0); });
      var dono = function (k) { try { return global.localStorage.getItem(k) === "1"; } catch (e) { return false; } };
      d.blocok = dono("orcapro:blocok:owner") || !!(base && base.extras && base.extras.blocok) || this._blocokEmail();
      d.marmoraria = dono("orcapro:marmoraria:owner") || !!(base && base.extras && base.extras.marmoraria);
      d.pranchaviva = dono("orcapro:pranchaviva:owner") || !!(base && base.extras && base.extras.pranchaviva);
      /* o BIM: a Gestão comprada (plus/bim), a licença só do Modela, ou qualquer direito do Modela (a modelagem abre o BIM;
         a Prancha Viva abre o 3D do modelo) */
      d.bim = so || gest || modelaAlgo || d.blocok || d.marmoraria || d.pranchaviva;
      return d;
    },
    _blocokEmail: function () {
      try {
        if (typeof global.blocokEmailLiberado !== "function") return false;
        var r = [];
        try { var A = global.Auth; if (A && A.usuario && A.usuario() && A.usuario().email) r.push(A.usuario().email); } catch (e) {}
        try { var N = global.Nuvem; if (N && N.auth && N.auth.currentUser && N.auth.currentUser.email) r.push(N.auth.currentUser.email); } catch (e) {}
        return r.some(function (m) { return global.blocokEmailLiberado(m); });
      } catch (e2) { return false; }
    },
    /* o Modela fora do programa: o dono vetou a troca do teste de 7 dias (substituiTeste7Dias:false), ou o teste de
       7 dias já acabou e o dono não quer a hora depois dele (aposTeste7Dias:false) */
    _foraDoTeste: function (cfg) {
      var f = {}, M = global.Modela, enc = false;
      try { var s = M && M.statusBase ? M.statusBase() : null; enc = !!(s && s.teste && s.teste.encerrado); } catch (e) {}
      if (!cfg.substituiTeste7Dias || (!cfg.aposTeste7Dias && enc)) {
        DISC.forEach(function (x) { f["modela:" + x] = true; }); f.blocok = true; f.marmoraria = true; f.pranchaviva = true;
      }
      return f;
    },
    /* a parte da regra que NÃO depende dos direitos (o js/modela.js pergunta isto sem laço) */
    regimeInfo: function () {
      var st = this._estado(), cfg = this.cfgDe(st.cfg), agora = Date.now();
      var regime = !!(cfg.ligado && st.cfgEm && !this._demo() && this.licencaPaga());
      var pausado = regime && (num(st.cfgEm) > agora + MIN || agora > num(st.cfgEm) + cfg.offlineHoras * 3600000);
      return { regime: regime, pausado: pausado, substitui: cfg.substituiTeste7Dias, aposTeste7: cfg.aposTeste7Dias, cfg: cfg };
    },
    _pendentes: function (st) { var o = {}, p = obj(st && st.pend); Object.keys(p).forEach(function (id) { o[id] = arr(p[id]).length; }); return o; },
    _pendMaisAntigo: function (st) {
      var m = 0, p = obj(st && st.pend);
      Object.keys(p).forEach(function (id) { arr(p[id]).forEach(function (x) { x = num(x); if (x > 0 && (!m || x < m)) m = x; }); });
      return m;
    },
    soComprados: function () {
      var P = this._pref(); return !!(P && P.ler && P.ler());
    },
    _pref: function () { return global.TesteModuloPref || null; },
    _memo: null,
    status: function () {
      var t = Date.now(), m = this._memo;
      if (m && t - m.t < 1000 && t >= m.t) return m.s;
      /* ⚠ REENTRADA: os direitos perguntam à Gestão e ao Modela. Se algum deles (versão antiga, gancho novo)
         perguntar de volta aqui no meio do cálculo, a resposta é "fora" para tudo — o programa como era antes,
         nunca um laço infinito nem uma liberação por engano */
      if (this._dentro) return this.calcular({ agora: t, cfg: null, cfgEm: 0 });
      var st = this._estado(), cfg = this.cfgDe(st.cfg), ri = this.regimeInfo(), s;
      this._dentro = true;
      try {
        if (!ri.regime) s = this.calcular({ agora: t, cfg: st.cfg, cfgEm: st.cfgEm, demo: this._demo(), licencaPaga: this.licencaPaga() });
        else s = this.calcular({ agora: t, cfg: st.cfg, cfgEm: st.cfgEm, demo: false, licencaPaga: true, uso: st.uso, srv: st.srv, pendMaisAntigo: this._pendMaisAntigo(st), pendentes: this._pendentes(st),
          direitos: this._direitos(), soComprados: this.soComprados(), foraDoTeste: this._foraDoTeste(cfg) });
      } finally { this._dentro = false; }
      this._memo = { t: t, s: s };
      return s;
    },
    estado: function (id) { var m = this.status().mods[id]; return m ? m.estado : "fora"; },
    info: function (id) { return this.status().mods[id] || null; },
    /* liberado = pode usar agora (comprado ou em teste) · visivel = aparece no menu/fita (pede compra se vencido) */
    liberado: function (id) { var e = this.estado(id); return e === "comprado" || e === "teste"; },
    visivel: function (id) { var e = this.estado(id); return e === "comprado" || e === "teste" || e === "vencido" || e === "pausado"; },
    emTeste: function (id) { return this.estado(id) === "teste"; },
    bloqueado: function (id) { var e = this.estado(id); return e === "vencido" || e === "pausado"; },
    /* o que o js/modela.js usa: os estados das disciplinas e dos módulos à parte (sem o prefixo) */
    estadosModela: function () {
      var s = this.status(), o = {};
      DISC.forEach(function (d) { o[d] = (s.mods["modela:" + d] || {}).estado || "fora"; });
      o.blocok = (s.mods.blocok || {}).estado || "fora";
      o.marmoraria = (s.mods.marmoraria || {}).estado || "fora";
      o.pranchaviva = (s.mods.pranchaviva || {}).estado || "fora";
      return o;
    },

    /* ---------------- a tela aberta ---------------- */
    moduloDaView: function (view) {
      view = String(view || "");
      if (!view) return "";
      if (view === "orcamentos") return "orcamento";
      if (view === "bim") return "bim";
      if (view === "ajuda") return "";
      return "gestao";
    },
    _view: function () {
      var A = global.App; if (!A || A.tela === "login") return "";
      try { return A.view || (A.viewPadrao ? A.viewPadrao() : "orcamentos"); } catch (e) { return A.view || ""; }
    },
    moduloDaTela: function () { return this.moduloDaView(this._view()); },
    /* os módulos em uso AGORA: o da tela; no BIM, a disciplina escolhida na fita e os módulos cujo comando rodou
       nos últimos `ociosoSegundos` (com "Todas as disciplinas" o relógio só anda na disciplina que trabalhou) */
    _tocados: {},
    tocar: function (id) { if (POR_ID[id]) this._tocados[id] = Date.now(); },
    ativos: function () {
      var mod = this.moduloDaTela(), out = [];
      if (!mod) return out;
      if (mod !== "bim") { out.push(mod); return out; }
      var s = this.status(), cfg = s.cfg, agora = Date.now(), self = this, modelaAtivo = false;
      try {
        var D = global.BimDisciplinas, d = D && D.atual ? D.atual() : "";
        var idD = this.idDisciplina(d);
        if (idD) out.push(idD);
      } catch (e) {}
      Object.keys(this._tocados).forEach(function (id) { if (agora - self._tocados[id] <= cfg.ociosoSegundos * 1000 && out.indexOf(id) < 0) out.push(id); });
      out.forEach(function (id) { if (id !== "bim" && s.mods[id] && s.mods[id].estado === "teste") modelaAtivo = true; });
      /* ⚠ trabalhando numa disciplina em teste, quem anda é ela — o relógio do BIM não corre junto (senão o BIM
         venceria antes e trancaria a tela da disciplina que ainda tem minutos) */
      if (!modelaAtivo) out.unshift("bim");
      return out;
    },

    /* a marca "Versão de teste" vale para a ÁREA da tela: algum módulo dela em teste (ou vencido) já foi usado */
    marcaAtiva: function (area) {
      var s = this.status(); if (!s.regime) return false;
      area = area || ((this.modulo(this.moduloDaTela()) || {}).area || "");
      if (!area) return false;
      /* ⚠ O MÓDULO DA ÁREA COMPRADO (revisão adversarial R6): o cliente PLUS (BIM comprado) que testou a Civil por
         1 minuto exportava o IFC, a prancha geral e a impressão do BIM com "VERSÃO DE TESTE" PARA SEMPRE (o vencido
         usado contava). Com a área comprada, a marca só vale enquanto um módulo EM TESTE dela está em uso agora: a
         disciplina da fita ou um comando dele nos últimos `ociosoSegundos`. O que é comprado sai limpo. */
      var base = s.mods[area];
      if (base && base.estado === "comprado") {
        var at = []; try { at = this.ativos(); } catch (eA) { at = []; }
        return MODULOS.some(function (m) {
          var x = s.mods[m.id];
          return m.area === area && m.id !== area && !m.soVisualiza && x && x.estado === "teste" && x.usadoMs > 0 && at.indexOf(m.id) >= 0;
        });
      }
      return MODULOS.some(function (m) {
        var x = s.mods[m.id];
        return m.area === area && !m.soVisualiza && x && (x.estado === "teste" || x.estado === "vencido") && x.usadoMs > 0;
      });
    },
    /* o módulo da tela está vencido/pausado? (App._trialBloqueado pergunta isto) — no BIM, uma disciplina ainda
       liberada (comprada ou em teste) mantém a tela de pé: o que trava aí é o comando (guardaComando) */
    bloqueiaTela: function () {
      var mod = this.moduloDaTela(); if (!mod || !this.bloqueado(mod)) return "";
      if (mod === "bim") {
        var s = this.status(), algum = MODULOS.some(function (m) { return m.area === "bim" && m.id !== "bim" && s.mods[m.id] && (s.mods[m.id].estado === "teste" || s.mods[m.id].estado === "comprado"); });
        if (algum) return "";
      }
      return mod;
    },
    _oferta: function (id, motivo) {
      try { if (global.TesteModuloUI && TesteModuloUI.oferta) { TesteModuloUI.oferta(id, motivo); return true; } } catch (e) {}
      try { if (global.UI && UI.toast) UI.toast(motivo || ("O teste de " + this.nome(id) + " terminou."), "erro"); } catch (e2) {}
      return false;
    },
    /* ==================================================================
     * A PORTA DE TODO COMANDO DA FITA DO BIM (BimCmd.executar chama).
     * {ok:true} ou {ok:false, modulo, motivo}. Fora do regime: sempre ok.
     * ================================================================== */
    _abaDe: function (cmdId) {
      var R = global.BimRibbon; if (!R || !R.ABAS) return "";
      for (var i = 0; i < R.ABAS.length; i++) {
        var ps = arr(R.ABAS[i].paineis);
        for (var j = 0; j < ps.length; j++) {
          var cs = arr(ps[j].comandos);
          for (var k = 0; k < cs.length; k++) {
            if (cs[k].id === cmdId) return R.ABAS[i].id;
            var its = arr(cs[k].itens);
            for (var m = 0; m < its.length; m++) if (its[m].id === cmdId) return R.ABAS[i].id;
          }
        }
      }
      return "";
    },
    /* comandos de MÓDULO À PARTE declarados numa disciplina (o Blocok mora na aba Alvenaria, disciplina civil):
       o relógio e a trava são do módulo, não da disciplina */
    EDITA_MODELO: (function () {
      var o = {};
      ["mover-preciso", "copiar", "espelhar", "girar", "matriz", "alinhar", "deslocamento", "aparar-canto", "aparar-varios", "dividir-elemento",
       "fixar", "desafixar", "criar-similar", "escala", "elevar", "demolir", "criar-grupo", "colar-niveis", "editar-grupo", "desagrupar",
       "extrusao", "revolucao", "varredura", "unir", "subtrair", "empurrar", "editar-tipo", "combinar", "componente", "eixo"].forEach(function (k) { o[k] = 1; });
      return o;
    })(),
    CMD_MODULO: { "blocok-exec": "blocok", "blocok-pecas": "blocok", "blocok-docs": "blocok", "prancha-viva": "pranchaviva" },
    modulosDoComando: function (cmdId) {
      if (this.CMD_MODULO[cmdId]) return { aba: this._abaDe(cmdId), mods: [this.CMD_MODULO[cmdId]] };
      var D = global.BimDisciplinas, aba = this._abaDe(cmdId), de = null, self = this;
      try { de = D && D.disciplinasDe ? D.disciplinasDe(cmdId, aba) : null; } catch (e) { de = null; }
      var mods = (de && de !== "comum" && arr(de).length) ? arr(de).map(function (x) { return self.idDisciplina(x); }).filter(Boolean) : [];
      return { aba: aba, mods: mods };
    },
    guardaComando: function (cmdId, opts) {
      opts = opts || {};
      var s = this.status(); if (!s.regime) return { ok: true };
      var dc = this.modulosDoComando(cmdId), self = this;
      var est = function (id) { return (s.mods[id] || {}).estado || "fora"; };
      var livre = function (id) { var e = est(id); return e === "comprado" || e === "teste" || e === "fora"; };
      function recusa(id) {
        var m = est(id) === "pausado" ? "O teste de " + self.nome(id) + " está pausado: conecte à internet para continuar."
          : (est(id) === "oculto" ? self.nome(id) + " não faz parte das suas compras (você escolheu mostrar só o que comprou)."
          : "O teste de 1 hora de " + self.nome(id) + " terminou. O que você fez continua salvo; para editar e exportar, compre o módulo.");
        if (opts.mostrar !== false) self._oferta(id, m);
        return { ok: false, modulo: id, motivo: m };
      }
      if (dc.mods.length) {
        /* comando de disciplina: basta UMA das disciplinas dele liberada; o relógio anda na primeira em teste
           (a escolhida na fita, se for uma delas) — e não anda se alguma delas já é comprada */
        if (dc.mods.some(function (id) { return est(id) === "comprado" || est(id) === "fora"; })) return { ok: true };
        var emT = dc.mods.filter(function (id) { return est(id) === "teste"; });
        if (emT.length) {
          var atual = ""; try { atual = this.idDisciplina(global.BimDisciplinas.atual()); } catch (e) {}
          this.tocar(emT.indexOf(atual) >= 0 ? atual : emT[0]);
          return { ok: true };
        }
        return recusa(dc.mods[0]);
      }
      /* comando comum (arquivo, mover, vista…): vale se ALGUM módulo da área do BIM está liberado. Com tudo vencido,
         só a aba Vista continua (olhar o que foi feito; editar e exportar não) */
      var algum = MODULOS.some(function (m) { return m.area === "bim" && !m.soVisualiza && livre(m.id) && est(m.id) !== "fora"; }) || est("bim") === "fora";
      /* os comuns que EDITAM o modelo (Modificar, volume livre, grupos, tipo): com o BIM comprado mas nenhuma
         disciplina do Modela liberada, o modelador só continua de pé porque o teste venceu — mover e copiar o que foi
         modelado no teste seria editar sem comprar. Antes do teste de 1 hora o modelador nem aparecia para essa pessoa. */
      if (algum && this.EDITA_MODELO[cmdId]) {
        var modLivre = MODULOS.some(function (m) { return m.area === "bim" && m.id !== "bim" && !m.soVisualiza && (est(m.id) === "comprado" || est(m.id) === "teste" || est(m.id) === "fora"); });
        if (!modLivre) {
          var alvoM = MODULOS.filter(function (m) { return m.area === "bim" && m.id !== "bim" && !m.soVisualiza && (est(m.id) === "vencido" || est(m.id) === "pausado"); })[0];
          if (alvoM) return recusa(alvoM.id);
        }
      }
      if (algum || dc.aba === "vista") return { ok: true };
      var alvo = ["bim"].concat(MODULOS.filter(function (m) { return m.area === "bim"; }).map(function (m) { return m.id; }))
        .filter(function (id) { return est(id) === "vencido" || est(id) === "pausado"; })[0] || "bim";
      return recusa(alvo);
    },
    /* ==================================================================
     * A PORTA DE TODA EDIÇÃO DO MODELO (Gestao._bimAoEditar chama com as
     * operações NOVAS). Revisão adversarial R5: com o Modela vencido o
     * modelador fica de pé (só leitura) e a fita barra os comandos — mas o
     * painel de propriedades, o arrasto e o tipo editam o modelo sem passar
     * pelo BimCmd. {ok:true} ou {ok:false, modulo, motivo}.
     *   - o BIM inteiro vencido (bloqueiaTela) → nenhuma edição grava;
     *   - alguma disciplina/módulo do modelador livre → segue (a trava por
     *     comando é a do guardaComando);
     *   - o modelador só está de pé porque o teste venceu (BIM comprado,
     *     Modela vencido) → seguem só as operações do editor do BIM que essa
     *     pessoa já tinha antes do Modela (criar, mover, apagar, renomear,
     *     orçar); as do modelador (ajustar, tipo, instalação, volume…) param.
     * ================================================================== */
    OPS_CLASSICAS: { criar: 1, apagar: 1, mover: 1, renomear: 1, orcar: 1 },
    travaEdicao: function () {
      var s = this.status(); if (!s.regime || this.moduloDaTela() !== "bim") return null;
      var est = function (id) { return (s.mods[id] || {}).estado || "fora"; };
      var tela = this.bloqueiaTela();
      if (tela) return { modulo: tela, classicas: false };
      var livre = MODULOS.some(function (m) { var e = est(m.id); return m.area === "bim" && m.id !== "bim" && !m.soVisualiza && (e === "comprado" || e === "teste" || e === "fora"); });
      if (livre) return null;
      var alvo = MODULOS.filter(function (m) { var e = est(m.id); return m.area === "bim" && m.id !== "bim" && !m.soVisualiza && (e === "vencido" || e === "pausado"); })[0];
      return alvo ? { modulo: alvo.id, classicas: true } : null;
    },
    guardaEdicao: function (novas, opts) {
      opts = opts || {};
      var tr = this.travaEdicao(); if (!tr) return { ok: true };
      novas = arr(novas); if (!novas.length) return { ok: true };   // desfazer (a lista encolheu) só tira
      var self = this;
      if (tr.classicas && novas.every(function (o) { return !!(o && self.OPS_CLASSICAS[o.op]); })) return { ok: true };
      var e = this.estado(tr.modulo);
      var m = e === "pausado" ? "O teste de " + this.nome(tr.modulo) + " está pausado: conecte à internet para continuar. A edição foi desfeita; nada foi gravado."
        : "O teste de 1 hora de " + this.nome(tr.modulo) + " terminou: a edição foi desfeita e nada foi gravado. O que você já fez continua salvo; para editar, compre o módulo.";
      if (opts.mostrar !== false) this._oferta(tr.modulo, m);
      return { ok: false, modulo: tr.modulo, motivo: m };
    },
    /* a porta das GRAVAÇÕES de uma tela (Gestao._bloqueado, App._trialBloqueado): o módulo bloqueado ou "" */
    guardaGravacao: function () { var s = this.status(); if (!s.regime) return ""; return this.bloqueiaTela(); },

    /* ==================================================================
     * O ARQUIVO QUE SAI (os `baixar` dos entregáveis chamam isto).
     *   modulo: o módulo DONO do entregável (ex.: "modela:hidraulica"), ou ""
     *   para o que é da área inteira (prancha geral, IFC do modelo).
     * Devolve { nome, dados } (com ou sem a marca) ou null = NÃO SALVAR
     * (o módulo dono venceu; a oferta já está na tela).
     * ================================================================== */
    marcarArquivo: function (nome, dados, mime, modulo) {
      nome = String(nome || "");
      var s = this.status();
      /* ⚠ o .ZIP que sai do `baixar` de um MÓDULO é o pacote dos entregáveis dele (os DXF do executivo, os documentos
         da hidráulica): ficava fora da regra e saía limpo até com o módulo vencido (revisão R7). O .zip da área
         (projeto, pacote da obra) continua sendo trabalho da pessoa. */
      var ehZip = !!modulo && /\.zip$/i.test(nome);
      if (!s.regime || !(ENTREGAVEL.test(nome) || ehZip)) return { nome: nome, dados: dados };
      if (modulo) {
        var e = this.estado(modulo);
        if (e === "vencido" || e === "pausado") { this._oferta(modulo, e === "pausado" ? "O teste de " + this.nome(modulo) + " está pausado: conecte à internet." : "O teste de 1 hora de " + this.nome(modulo) + " terminou: o entregável sai depois da compra. O seu trabalho continua salvo."); return null; }
        if (e === "teste") { this._registrar("exportacao", modulo, { arquivo: nome.slice(0, 80) }); return ehZip ? this.marcarZip(nome, dados) : this.marcarConteudo(nome, dados, mime); }
        /* ⚠ o entregável de um módulo COMPRADO passa limpo — e o `baixar` da área que ele chama depois (o
           Gestao._opBaixar) não pode marcá-lo só porque outra disciplina da área está em teste */
        if (e === "comprado" || e === "fora") { this._liberado = { nome: nome, t: Date.now() }; return { nome: nome, dados: dados }; }
      }
      if (!modulo && this._liberado && this._liberado.nome === nome && Date.now() - this._liberado.t < 3000) return { nome: nome, dados: dados };
      /* o entregável da ÁREA com a tela inteira vencida (Gestão vencida; BIM e Modela vencidos): não sai (R7) */
      if (!modulo) { var tb = this.guardaGravacao(); if (tb) { this._oferta(tb, "O teste de 1 hora de " + this.nome(tb) + " terminou: o entregável sai depois da compra. O seu trabalho continua salvo."); return null; } }
      if (this.marcaAtiva((this.modulo(modulo) || {}).area || "")) return this.marcarConteudo(nome, dados, mime);
      return { nome: nome, dados: dados };
    },

    /* ---------------- relógio ---------------- */
    _visivel: function () {
      try { var d = global.document; if (d && d.visibilityState && d.visibilityState !== "visible") return false; } catch (e) {}
      return true;
    },
    tique: function () {
      var s = this.status(); if (!s.regime) return null;
      var st = this._estado(), agT = Date.now();
      var r = this.acumular(st, { agora: agT, antTab: num(this._ultTickTab), ativos: this.ativos(), visivel: this._visivel(), ultimaInteracao: this._ultimaInteracao, calc: s });
      this._ultTickTab = agT;
      this._gravar(r.st);
      var self = this;
      r.eventos.forEach(function (ev) { self._evento(ev); });
      try { if (global.TesteModuloUI && TesteModuloUI.pintar) TesteModuloUI.pintar(); } catch (e) {}
      if (Object.keys(r.st.pend || {}).length && Date.now() - num(this._ultSync) >= SYNC_MS) this.sincronizar();
      this._detectarCompra();
      return r;
    },
    _evento: function (ev) {
      this._registrar(ev.tipo, ev.modulo, ev.min ? { min: ev.min } : null);
      try { if (global.TesteModuloUI && TesteModuloUI.aoEvento) TesteModuloUI.aoEvento(ev); } catch (e) {}
    },
    /* AUDITORIA: o registro local (os 60 últimos) + a fila para o servidor (/api/teste-modulo/uso leva junto) */
    _registrar: function (tipo, modulo, extra) {
      var st = this._estado(), e = { tipo: String(tipo), modulo: String(modulo || ""), em: Date.now() };
      if (extra) e.extra = extra;
      st.log = arr(st.log); st.log.push(e); if (st.log.length > 60) st.log = st.log.slice(-60);
      st.filaEv = arr(st.filaEv); st.filaEv.push(e); if (st.filaEv.length > 100) st.filaEv = st.filaEv.slice(-100);
      this._gravar(st);
      try { if (global.Auditoria && Auditoria.registrar) Auditoria.registrar("teste-modulo", tipo, { modulo: modulo, extra: extra || null }); } catch (eA) {}
      return e;
    },
    /* comprou depois de testar: o módulo que tinha minutos usados virou "comprado" */
    _detectarCompra: function () {
      var s = this.status(); if (!s.regime) return;
      var st = this._estado(), mudou = false, self = this;
      st.compra = obj(st.compra);
      IDS.forEach(function (id) {
        var m = s.mods[id];
        if (m && m.estado === "comprado" && (num(st.uso[id]) > 0 || num((st.srv || {})[id]) > 0) && !st.compra[id]) {
          st.compra[id] = Date.now(); mudou = true;
          setTimeout(function () { self._registrar("compra", id, null); }, 0);
        }
      });
      if (mudou) this._gravar(st);
    },

    /* ---------------- servidor ---------------- */
    _servidor: function () { return (typeof global.CONFIG !== "undefined" && global.CONFIG && global.CONFIG.licencaServer) ? String(global.CONFIG.licencaServer).replace(/\/$/, "") : ""; },
    _cab: function (json) {
      var h = {}; if (json) h["Content-Type"] = "application/json";
      var L = this._lic(); try { var k = L && L.chave ? L.chave() : ""; if (k) h["x-licenca"] = k; } catch (e) {}   // header, nunca na URL
      return h;
    },
    _device: function () { var L = this._lic(); try { return (L && L.deviceId && L.deviceId()) || ""; } catch (e) { return ""; } },
    _aplicarStatus: function (d) {
      if (!d || d.ok !== true) return false;
      var st = this._estado();
      st.cfg = obj(d.cfg); st.cfgEm = Date.now();
      this.aplicarServidor(st, d, null);
      this._gravar(st);
      return true;
    },
    atualizar: function (cb) {
      cb = cb || function () {};
      var self = this, srv = this._servidor();
      if (!srv || typeof global.fetch === "undefined" || !this.licencaPaga()) { cb({ ok: false, offline: true }); return; }
      try {
        global.fetch(srv + "/api/teste-modulo/status?deviceId=" + encodeURIComponent(this._device()), { headers: this._cab(false), cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) { var ok = self._aplicarStatus(d); self._avisarMudanca(); cb({ ok: ok }); }, function () { cb({ ok: false, offline: true }); });
      } catch (e) { cb({ ok: false, offline: true }); }
    },
    /* o heartbeat: os índices de minuto pendentes + os eventos de auditoria. Idempotente no servidor (conjunto). */
    sincronizar: function (cb) {
      cb = cb || function () {};
      var self = this, srv = this._servidor();
      this._ultSync = Date.now();
      var st = this._estado(), env = copia(st.pend || {}), evs = arr(st.filaEv).slice();
      if (!srv || typeof global.fetch === "undefined" || (!Object.keys(env).length && !evs.length)) { cb({ ok: false, vazio: true }); return; }
      try {
        global.fetch(srv + "/api/teste-modulo/uso", { method: "POST", headers: this._cab(true), body: JSON.stringify({ deviceId: this._device(), minutos: env, eventos: evs, agora: Date.now() }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d || d.ok !== true) { cb({ ok: false }); return; }
            var s2 = self._estado();
            if (d.cfg) { s2.cfg = obj(d.cfg); s2.cfgEm = Date.now(); }
            self.aplicarServidor(s2, d, env);
            /* os eventos enviados saem da fila (os que chegaram depois do envio ficam) */
            s2.filaEv = arr(s2.filaEv).filter(function (x) { return !evs.some(function (y) { return y.em === x.em && y.tipo === x.tipo && y.modulo === x.modulo; }); });
            self._gravar(s2); self._avisarMudanca();
            cb({ ok: true });
          }, function () { cb({ ok: false, offline: true }); });
      } catch (e) { cb({ ok: false, offline: true }); }
    },
    _antes: "",
    _avisarMudanca: function () {
      this._memo = null;
      try { if (global.Modela) global.Modela._memo = null; if (global.Modela) global.Modela._memoBase = null; } catch (e) {}
      var foto = ""; try { var s = this.status(); foto = JSON.stringify(IDS.map(function (id) { return s.mods[id].estado; })); } catch (e2) {}
      if (foto === this._antes) return false;
      this._antes = foto;
      try { if (typeof global.CustomEvent === "function" && global.dispatchEvent) global.dispatchEvent(new global.CustomEvent("orcapro:teste-modulo", { detail: this.status() })); } catch (e3) {}
      return true;
    },
    /* a preferência mudou, ou um módulo venceu: o menu e a fita se redesenham */
    redesenhar: function () {
      this._memo = null;
      try { if (global.Modela) { global.Modela._memo = null; global.Modela._memoBase = null; } } catch (e) {}
      this._avisarMudanca();
      try { if (global.App && App.render && App.tela !== "login") App.render(); } catch (e2) {}
    },

    _ligado: false,
    ligar: function () {
      if (this._ligado || typeof window === "undefined" || !global.document) return;
      this._ligado = true;
      var self = this;
      var marcar = function () { self._ultimaInteracao = Date.now(); };
      ["pointerdown", "keydown", "wheel", "touchstart", "input"].forEach(function (t) { try { global.document.addEventListener(t, marcar, true); } catch (e) {} });
      var ultMov = 0;
      try { global.document.addEventListener("pointermove", function () { var t = Date.now(); if (t - ultMov > 3000) { ultMov = t; marcar(); } }, true); } catch (e) {}
      try { global.document.addEventListener("visibilitychange", function () { if (global.document.visibilityState === "visible") self.atualizar(); else self.sincronizar(); }); } catch (e) {}
      try { global.addEventListener("pagehide", function () { self.sincronizar(); }); } catch (e) {}
      setInterval(function () { try { self.tique(); } catch (e) {} }, TIQUE_MS);
      setInterval(function () { try { self.atualizar(); } catch (e) {} }, STATUS_MS);
      setTimeout(function () { try { self.atualizar(); } catch (e) {} }, 3000);
    }
  };

  global.TesteModulo = TM;
  /* ⚠ A JANELA DESTACADA (⧉) TAMBÉM TEM RELÓGIO (revisão adversarial R2). Antes ela não ligava: a Gestão em teste
     aberta só numa janela destacada editava e gravava com o estado "teste" para sempre. As janelas dividem o
     localStorage; o que impede duas janelas de contarem em dobro é o intervalo por aba + `ultConta` do `acumular`
     (R1). Uma corrida de gravação entre duas janelas no mesmo instante perde, no máximo, um tique (a favor do cliente). */
  try {
    if (typeof window !== "undefined" && global.setTimeout) global.setTimeout(function () { try { TM.ligar(); } catch (e) {} }, 1500);
  } catch (eL) {}
  if (typeof module !== "undefined" && module.exports) module.exports = TM;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
