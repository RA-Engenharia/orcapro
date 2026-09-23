/* =====================================================================
 * OrçaPRO — Orçamento Inteligente de Obras
 * config.js — marca, versão, planos e parâmetros do produto
 * Tudo aqui é "white-label friendly": mude a marca em um lugar só.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CONFIG = {
    // ---- Identidade do produto (rebrandável por cliente) ----
    marca: {
      nome: "OrçaPRO IA",
      slogan: "Orçamento Inteligente de Obras",
      fabricante: "RA Engenharia",
      corPrimaria: "#0f2740",   // navy
      corSecundaria: "#2e6f9e", // aço
      corAcento: "#16a34a",     // verde (preço/venda)
      logoTexto: '<span class="marca-top">OrçaPRO<span class="logo-ia">IA</span></span>'   // selo IA estilizado (ver .logo-ia no CSS)
    },

    // IA na NUVEM (VPS): já vem pronta, sem o cliente configurar chave. A chave fica escondida no servidor.
    // As chamadas de IA enviam a licença (x-licenca) — só quem ativou usa a IA.
    iaBackend: "https://187-127-40-14.sslip.io",

    // Servidor de licença/ativação/atualização (a loja no VPS). Trava de máquina + auto-update.
    licencaServer: "https://187-127-40-14.sslip.io",

    // App WEB (PWA) — o mesmo sistema hospedado, p/ acessar do celular/tablet sem instalar.
    // Usado no link de acesso que o admin envia ao usuário (?lic=<chave>&u=<login>).
    appWebUrl: "https://ra-engenharia.github.io/orcapro/app/",

    /* MANIFESTO DA FROTA — a mesma verdade que o servidor local consulta para
       se atualizar sozinho (`server/static.js` → MANIFEST_URL). Está aqui
       porque o app TAMBÉM pergunta "existe versão nova?", e perguntava só ao
       VPS (`/api/versao`), que é alimentado à mão e ficou 8 versões atrás —
       oferecendo download de um pacote velho para quem já tinha algo mais
       novo. Com as duas fontes, vale sempre a MAIOR. */
    manifestoUrl: "https://raw.githubusercontent.com/RA-Engenharia/orcapro/main/download/latest.json",

    versao: "1.2.86",
    schemaVersao: 3, // usado nas migrações de persistência

    // Oferta de lançamento do Plus — data/hora que a condição termina (após isso, a urgência some sozinha)
    ofertaFim: "2026-07-11T23:59:59-03:00",

    // ---- Planos / Monetização (SaaS por assinatura) ----
    // O gate é por feature: o app checa CONFIG.plano(featureKey).
    planos: {
      FREE: {
        nome: "Free",
        limiteOrcamentos: 2,
        limiteItensPorOrcamento: 30,
        features: { sinapi: true, bdi: true, exportar: false, escopoIA: false, proposta: false }
      },
      PRO: {
        nome: "Pro",
        limiteOrcamentos: Infinity,
        limiteItensPorOrcamento: Infinity,
        features: { sinapi: true, bdi: true, exportar: true, escopoIA: true, proposta: true }
      }
    },

    // ---- Fonte de dados SINAPI ----
    // No modo demo carrega data/sinapi-sample.json. Em produção, aponte
    // para o JSON real exportado pelo sinapi-fetcher (mesmo formato).
    sinapi: {
      // Base REAL: 8.380 composições SINAPI MG 2026-05 (export do sinapi-fetcher do ERP).
      // Troque por outra competência/UF copiando o JSON para data/ e ajustando aqui.
      arquivoDemo: "data/sinapi-MG-2026-06.json",
      arquivoAmostra: "data/sinapi-sample.json", // fallback didático (30 itens)
      competenciaPadrao: "2026-06",
      ufPadrao: "MG"
    },

    /* ---- Chaves de desligar do cronograma (planejador, Onda 0, T12) ----
       A FROTA INTEIRA se desliga por versão (uma versão com `motor: false`);
       uma instalação só, pela chave local `orcapro:tela:crono-recursos:v1`
       (suporte). Quem lê é o App no boot (`_cronoRecursosBoot`) e entrega ao
       motor, que é puro. ⚠ `motor: false` = as datas que a versão 1.2.81
       calcula, sombra incluída (tudo ou nada: desligar metade de uma sombra
       composta mudaria a data). As outras só escondem portas da tela e
       impedem criar dado novo; nenhuma apaga dado. Espec §6.2. */
    cronoRecursos: {
      motor: true, rede: true, extras: true, cal: true, avanco: true,
      bases: true, seloTardio: true, historico: true, filtro: true, pilha: true, sino: true
    },

    /* ---- Chaves de desligar da leva "medição × centros de custo" ----
       (ESPEC-medicao-cc §1.10 e §11.3; tomada T-MC1 da `mc-4-0`).
       Mesma régua das `cronoRecursos`: a frota inteira por versão, uma
       instalação só pela chave local `orcapro:tela:medcc-recursos:v1`.
       Quem lê é o `Gestao._medcc(nome)`; MOTOR PURO NÃO LÊ NENHUMA DELAS.
       ⚠ NENHUMA CHAVE APAGA DADO (§11.3). Desligada, a porta some e dado
         novo não nasce; `lancarAvanco`, `avancoMedicao` e as entradas
         `o:"medicao"` já gravadas continuam valendo e sincronizando. Uma
         chave que apagasse seria pior que o defeito que ela desliga.
       ⚠ `medOrigem` é a contingência K36: se a 1.2.82 for publicada sem as
         emendas E-MC1/E-MC2 do planejador, o canal passa a gravar entradas
         DIGITADAS (sem `o` e sem `b`), porque um aparelho que não sabe ler
         `o:"medicao"` descartaria a entrada inteira e o realizado da obra
         sumiria lá. Nesta árvore as duas emendas estão no
         `js/cronoavanco.js`, então ela nasce ligada.
       ⚠ `ccIA` nasce DESLIGADA (§1.10): nenhuma chamada nesta leva.
       ⚠⚠ `medAvancoAuto` NASCE DESLIGADA NA 1.2.86, E NÃO PODE SER RELIGADA
         SEM CONSERTAR O CARIMBO. NÃO REMOVA ESTA LINHA SEM LER O ROTEIRO.
         Roteiro do defeito (revisão de publicação da 1.2.86, medido em
         bancada com o `App._cronoAvancoDaMedicao`, o `CronoBase.salvarAvanco`
         e o `Nuvem._merge` REAIS — tools/test-medavanco-dois-aparelhos.js):
           dois aparelhos EM DIA (mesmo registro de avanço no disco, mesma
           marca de sync) aprovam o MESMO boletim, cada um no seu relógio
           (14:00 e 14:31). O carimbo fraco (E-MC4, js/app.js
           `_cronoGravarAvanco`) é `max(carimbo do disco, marca de sync) + 1
           ms` — uma conta feita só com valores JÁ SINCRONIZADOS. Os dois
           saem com o MESMO `atualizadoEm` (2026-09-20T12:00:00.001Z) e
           conteúdos DIFERENTES (A: e3=40% e4=12% · B: e3=100% e4=36,5%,
           porque B tinha um boletim aprovado no campo que ainda não subiu).
           O `Nuvem._merge` trata carimbo igual como "mesma versão"
           (js/nuvem.js, `if (tl === tc) { byId[o.id] = o; return; }`) e fica
           com o LOCAL dos dois lados. Seis rodadas de sync depois cada
           aparelho continua mostrando o seu número, a tela conta ZERO
           conflito e ninguém é avisado — o avanço da obra diverge calado,
           para sempre.
         A chave desligada fecha o caminho INTEIRO: o único produtor de
         `carimboFraco` em js/ é `opts.gatilho` (js/app.js:19900), e o único
         chamador com `gatilho` é o `Gestao._medAvancoAposAprovar`, que só
         chega lá depois deste `_medcc("medAvancoAuto")`. O caminho MANUAL
         ([Puxar das medições] da faixa, js/app.js `_medccPuxar`) passa `{}` e
         carimba com `Util.agoraISO()`, que difere entre aparelhos — esse
         continua ligado, está correto, e é a PORTA que esta trava deixa
         aberta (ela fica sob `medAvanco`, que segue ligada).
         ⚠ NADA É APAGADO: `lancarAvanco` continua sendo gravado no boletim, e
           quem aprova lê um recado que NÃO promete lançamento (o ramo
           "o lançamento automático ao aprovar está desligado nesta
           instalação" do `_medAvancoAposAprovar`).
         O conserto de verdade fica para a 1.2.87: o carimbo precisa carregar
         algo do APARELHO (id do dispositivo, aleatório) para dois aparelhos
         nunca empatarem. Quem religar esta chave antes disso reprova a suíte
         `tools/test-medavanco-dois-aparelhos.js`, que é exatamente o ponto. */
    medccRecursos: {
      medAvanco: true, medAvancoAuto: false, medOrigem: true,
      ccGerar: true, ccAgente: true, ccDocumentos: true, ccSino: true, ccIA: false
    },

    // ---- Presets de BDI (fórmula Acórdão TCU 2622/2013) ----
    // Valores em % (ex.: 4 = 4%). I = soma dos impostos.
    bdiPresets: {
      conservador: { nome: "Conservador", AC: 4.0, S: 0.8, R: 1.5, G: 0.4, DF: 1.2, L: 7.0,  I: 8.65 },
      padrao:      { nome: "Padrão",       AC: 4.0, S: 0.8, R: 0.97, G: 0.4, DF: 1.2, L: 8.0,  I: 8.65 },
      agressivo:   { nome: "Agressivo",    AC: 3.0, S: 0.5, R: 0.5, G: 0.3, DF: 1.0, L: 12.0, I: 8.65 }
    },

    // ---- Backend (preparado para virar SaaS sem reescrever) ----
    // Quando 'firebase' estiver configurado, store.js usa nuvem; senão local.
    backend: {
      modo: "local",           // "local" | "firebase"
      sync: true,              // sincronização na nuvem LIGADA (validada 05/jul/2026)
      firebaseConfig: {
        apiKey: "AIzaSyBUebEPWde5kbZBYiDK4NAD3sPNBlpUj8o",
        authDomain: "orcapro-9595f.firebaseapp.com",
        projectId: "orcapro-9595f",
        storageBucket: "orcapro-9595f.firebasestorage.app",
        messagingSenderId: "157081125995",
        appId: "1:157081125995:web:22233d4c255e2f435edd2e"
      }
    }
  };

  // Helper de gate de plano: CONFIG.feature("exportar", planoUsuario) -> bool
  CONFIG.feature = function (featureKey, planoId) {
    var p = CONFIG.planos[planoId] || CONFIG.planos.FREE;
    return !!(p.features && p.features[featureKey]);
  };
  CONFIG.limite = function (limiteKey, planoId) {
    var p = CONFIG.planos[planoId] || CONFIG.planos.FREE;
    return p[limiteKey];
  };

  global.CONFIG = CONFIG;
})(window);
