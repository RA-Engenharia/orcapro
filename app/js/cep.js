/* =====================================================================
 * cep.js — ENDEREÇO PELO CEP (ViaCEP) e MUNICÍPIOS/UF (IBGE Localidades) — motor puro
 *
 * FONTES (respostas reais de 20/11/2026 em tools/dados/apis/, ambas com CORS aberto — chamada direta do navegador):
 *   • ViaCEP     https://viacep.com.br/ws/{cep}/json/  → logradouro, bairro, localidade, uf, ibge (código do município)
 *                CEP inexistente volta HTTP 200 com {"erro":"true"} — NÃO é falha de rede, é "não encontrei".
 *   • IBGE       https://servicodados.ibge.gov.br/api/v1/localidades/estados  e  /estados/{UF}/municipios
 *
 * FREIO / OFFLINE:
 *   – nada é chamado ao abrir tela: só depois de CEP com 8 dígitos (a UI espera ~600 ms sem digitar) ou ao pedir a lista de cidades da UF;
 *   – cache local por 30 dias (CEP, lista de UF, municípios por UF) em localStorage, sempre em try/catch;
 *   – a mesma consulta em andamento não dispara outra; falha de rede devolve mensagem amigável e a pessoa digita à mão (nada trava).
 * ES5. Testes: tools/test-cep.js (só fixture).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TTL_MS = 30 * 24 * 3600 * 1000;
  var CH = "orcapro:cep:";
  var UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
  var _voo = {};

  function s(v) { return v == null ? "" : String(v); }
  function arm(ctx) { try { return (ctx && ctx.storage) || global.localStorage || null; } catch (e) { return null; } }
  function lerCache(chave, ctx, agora) {
    var a = arm(ctx); if (!a) return null;
    try { var o = JSON.parse(a.getItem(CH + chave) || "null"); return o && agora - o.em < TTL_MS ? o : null; } catch (e) { return null; }
  }
  function gravarCache(chave, dados, ctx, agora) { var a = arm(ctx); if (!a) return; try { a.setItem(CH + chave, JSON.stringify({ em: agora, d: dados })); } catch (e) {} }

  function normalizar(cep) { var d = s(cep).replace(/\D/g, ""); return d.length === 8 ? d : ""; }
  function formatar(cep) { var d = normalizar(cep); return d ? d.slice(0, 5) + "-" + d.slice(5) : s(cep); }
  function urlViaCep(cep) { return "https://viacep.com.br/ws/" + normalizar(cep) + "/json/"; }
  /* sem acento, minúsculo, espaço único: "São José d'Oeste" casa com "sao jose d oeste" digitado sem acento */
  function chaveNome(n) { return s(n).normalize ? s(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/^ | $/g, "") : s(n).toLowerCase(); }

  function parseViaCep(j) {
    if (!j || typeof j !== "object") return { ok: false, erro: "Resposta inesperada do ViaCEP." };
    if (j.erro === true || j.erro === "true") return { ok: false, naoEncontrado: true, erro: "CEP não encontrado no ViaCEP. Confira o número ou preencha o endereço à mão." };
    if (!j.cep) return { ok: false, erro: "Resposta inesperada do ViaCEP." };
    return { ok: true, cep: formatar(j.cep), logradouro: s(j.logradouro), complemento: s(j.complemento), bairro: s(j.bairro), cidade: s(j.localidade), uf: s(j.uf).toUpperCase(), ibge: s(j.ibge),
      fonte: { nome: "ViaCEP", url: urlViaCep(j.cep) } };
  }

  function chamar(url, ctx) {
    var P = ctx.Promise || global.Promise;
    var f = ctx.fetch || (global.fetch ? function (u) { return global.fetch(u); } : null);
    if (!f) return P.reject(new Error("sem fetch"));
    return P.resolve().then(function () { return f(url); }).then(function (r) { if (!r || !r.ok) throw new Error("HTTP " + (r && r.status)); return r.json(); });
  }
  /* uma consulta por chave por vez; cache antes da rede */
  function comCache(chave, url, ctx, transformar, msgFalha) {
    ctx = ctx || {};
    var P = ctx.Promise || global.Promise, agora = ctx.agora != null ? ctx.agora : new Date().getTime();
    var c = lerCache(chave, ctx, agora);
    if (c) return P.resolve({ dados: c.d, deCache: true, em: c.em });
    if (_voo[chave]) return _voo[chave];
    _voo[chave] = chamar(url, ctx).then(function (j) {
      var d = transformar(j);
      if (d && d.ok !== false) gravarCache(chave, d, ctx, agora);
      delete _voo[chave];
      return { dados: d, deCache: false, em: agora };
    }).then(null, function (e) {
      delete _voo[chave];
      var er = new Error(msgFalha + " (" + (e && e.message ? e.message : "falha") + ")"); er.semRede = true; throw er;
    });
    return _voo[chave];
  }

  /* consultarCep("38400-000") → Promise<{ok, cep, logradouro, bairro, cidade, uf, ibge, fonte, deCache}> */
  function consultarCep(cep, ctx) {
    var n = normalizar(cep), P = (ctx && ctx.Promise) || global.Promise;
    if (!n) return P.resolve({ ok: false, erro: "CEP precisa ter 8 dígitos." });
    return comCache("cep:" + n, urlViaCep(n), ctx, parseViaCep, "Sem conexão com o ViaCEP — preencha o endereço à mão").then(function (r) {
      var d = r.dados; d.deCache = r.deCache; return d;
    });
  }

  function urlMunicipios(uf) { return "https://servicodados.ibge.gov.br/api/v1/localidades/estados/" + s(uf).toUpperCase() + "/municipios"; }
  /* municipios("MG") → Promise<{ok, uf, lista:[{ibge, nome}], fonte}> — guarda só [id, nome] (a resposta crua é ~170 KB por UF) */
  function municipios(uf, ctx) {
    uf = s(uf).toUpperCase();
    var P = (ctx && ctx.Promise) || global.Promise;
    if (UFS.indexOf(uf) < 0) return P.resolve({ ok: false, erro: "UF inválida." });
    return comCache("mun:" + uf, urlMunicipios(uf), ctx, function (j) {
      var lista = (Object.prototype.toString.call(j) === "[object Array]" ? j : []).map(function (m) { return { ibge: s(m.id), nome: s(m.nome) }; }).filter(function (m) { return m.ibge && m.nome; });
      if (!lista.length) return { ok: false, erro: "O IBGE não devolveu municípios para " + uf + "." };
      lista.sort(function (a, b) { return chaveNome(a.nome) < chaveNome(b.nome) ? -1 : (chaveNome(a.nome) > chaveNome(b.nome) ? 1 : 0); });
      return { ok: true, uf: uf, lista: lista, fonte: { nome: "IBGE — Localidades", url: urlMunicipios(uf) } };
    }, "Sem conexão com o IBGE — digite a cidade à mão").then(function (r) { return r.dados; });
  }
  /* código IBGE de um município por nome (sem acento/caixa) dentro da lista da UF; vazio se não achar ou se houver dois iguais */
  function ibgeDe(lista, nome) {
    var k = chaveNome(nome), achados = (lista || []).filter(function (m) { return chaveNome(m.nome) === k; });
    return achados.length === 1 ? achados[0].ibge : "";
  }

  global.Cep = { UFS: UFS, TTL_MS: TTL_MS, normalizar: normalizar, formatar: formatar, urlViaCep: urlViaCep, urlMunicipios: urlMunicipios, parseViaCep: parseViaCep,
    consultarCep: consultarCep, municipios: municipios, ibgeDe: ibgeDe, chaveNome: chaveNome, _reset: function () { _voo = {}; } };
  if (typeof module !== "undefined" && module.exports) module.exports = global.Cep;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
