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
      nome: "OrçaPRO",
      slogan: "Orçamento Inteligente de Obras",
      fabricante: "RA Engenharia",
      corPrimaria: "#0f2740",   // navy
      corSecundaria: "#2e6f9e", // aço
      corAcento: "#16a34a",     // verde (preço/venda)
      logoTexto: "OrçaPRO"      // troque por <img> quando tiver logo
    },

    // Servidor de IA do OrçaPRO (orcapro-ia.js). Cada licença usa a própria chave.
    iaBackend: "http://localhost:3041",

    // Servidor de licença/ativação/atualização (a loja no VPS). Trava de máquina + auto-update.
    licencaServer: "https://187-127-40-14.sslip.io",

    versao: "1.0.0",
    schemaVersao: 2, // usado nas migrações de persistência

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
      arquivoDemo: "data/sinapi-MG-2026-05.json",
      arquivoAmostra: "data/sinapi-sample.json", // fallback didático (30 itens)
      competenciaPadrao: "2026-05",
      ufPadrao: "MG"
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
      firebaseConfig: null     // cole o objeto firebaseConfig aqui na hora do SaaS
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
