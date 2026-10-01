#!/usr/bin/env node
/* =====================================================================
 * sinapi-vps.js — a SINAPI chega sozinha ao servidor OrçaPRO, todo mês
 *
 * Roda no VPS, pelo cron, uma vez por dia. Usa o MESMO coletor do espelho
 * (`coletar-sinapi.js`), apontado para a pasta que o servidor serve
 * (`/opt/orcapro-analitico/data`). O servidor é a PRIMEIRA fonte que o app
 * consulta na varredura diária; publicada a competência aqui, todo cliente
 * — app instalado e PWA, qualquer UF — recebe no dia seguinte.
 *
 * ⚠ POR QUE ISTO EXISTE (01/10/2026). Havia dois caminhos e os dois pararam
 *   calados:
 *     · o VPS era alimentado À MÃO e ficou na 06/2026 desde 24/07;
 *     · o coletor do GitHub Actions (dias 13 e 20) não chegou a iniciar em
 *       setembro: "account is locked due to a billing issue". Falhou em 3 s.
 *   A CAIXA publicou a 08/2026 em 11/09 e ela não chegou a cliente nenhum por
 *   três semanas, num recurso que é vendido como automático. Este programa
 *   não depende do GitHub nem do computador de ninguém estar ligado.
 *
 * ⚠ FALHA QUE NINGUÉM VÊ É O DEFEITO, não o detalhe. Por isso ele manda
 *   e-mail (pelo smtp-envio.js da loja, para a própria caixa da RA):
 *     · competência nova publicada no servidor → aviso de confirmação;
 *     · a coleta falhou, ou o servidor continua atrás da CAIXA → alarme,
 *       repetido a cada execução (uma por dia) até alguém resolver;
 *     · o ESPELHO (GitHub Pages) ficou atrás do servidor → alarme semanal.
 *       Foi exatamente esse atraso que passou despercebido em setembro.
 *
 * ⚠ RETIFICAÇÃO. A CAIXA às vezes republica um mês já saído (o nome do
 *   arquivo ganha "Retificacao"). O estado guarda o NOME do arquivo de cada
 *   competência coletada; se a CAIXA passar a oferecer outro nome para o
 *   mesmo mês, a competência é coletada de novo (--forcar). Sem isto, a
 *   versão corrigida nunca entraria, porque o mês "já estava completo".
 *
 * ⚠ O ANALÍTICO DE NOME ANTIGO (`sinapi-<UF>-analitico.json.gz`, sem
 *   competência) acompanha a competência MAIS NOVA. É ele que o app pede
 *   quando a base viva está à frente da que veio no instalador
 *   (`atualizacao.js`, `app.js trocarBaseSinapi`); deixá-lo num mês velho
 *   daria preço de um mês com insumo de outro.
 *
 * USO (no VPS)
 *   node sinapi-vps.js                 coleta o que faltar e avisa
 *   node sinapi-vps.js --testar-aviso  só manda um e-mail de teste
 *   node sinapi-vps.js --sem-email     faz tudo, mas não manda e-mail
 *
 * Variáveis (todas opcionais): SINAPI_DADOS, SINAPI_ESTADO, SINAPI_JANELA,
 *   ORCAPRO_CONFIG, ORCAPRO_SMTP, SINAPI_AVISO_PARA, SINAPI_ESPELHO.
 * ===================================================================== */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var https = require("https");
var { execFileSync } = require("child_process");

var DADOS = process.env.SINAPI_DADOS || "/opt/orcapro-analitico/data";
var ESTADO = process.env.SINAPI_ESTADO || "/opt/orcapro-sinapi/estado.json";
/* 9 = a corrente + 8 anteriores (pedido do Rogério, 01/10/2026: "até 8 meses
   anteriores, para o cliente que queira usar a antiga"). O app pede a
   competência antiga ao servidor PRIMEIRO; sem ela aqui, só o espelho atende. */
var JANELA = parseInt(process.env.SINAPI_JANELA, 10) || 9;
/* a desonerada das N mais novas: é a mais nova que o app instala (SINAPI_DES),
   e a anterior fica para quem ainda não abriu o app desde a troca */
var DES_N = parseInt(process.env.SINAPI_DES_N, 10) || 2;
/* de onde o app BAIXA a desonerada (rota /bases/, .json cru) */
var BASES = process.env.SINAPI_BASES || "/opt/orcapro-bases/data";
var CONFIG = process.env.ORCAPRO_CONFIG || "/opt/orcapro-loja/server/vendas-config.json";
var SMTP = process.env.ORCAPRO_SMTP || "/opt/orcapro-loja/server/smtp-envio.js";
var ESPELHO = process.env.SINAPI_ESPELHO || "https://ra-engenharia.github.io/orcapro/app/data/bases-status.json";
var COLETOR = path.join(__dirname, "coletar-sinapi.js");
var UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

var arg = {};
process.argv.slice(2).forEach(function (a) { if (a.indexOf("--") === 0) arg[a.slice(2)] = true; });

function agora() { return new Date().toISOString(); }
function log(m) { console.log("[sinapi-vps " + agora().slice(0, 19) + "] " + m); }
function fmt(c) { var m = String(c || "").match(/^(\d{4})-(\d{2})$/); return m ? m[2] + "/" + m[1] : (c || "—"); }

function lerEstado() { try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch (e) { return {}; } }
function gravarEstado(e) {
  var tmp = ESTADO + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(e, null, 2));
  fs.renameSync(tmp, ESTADO);
}

function coletor(args) {
  return execFileSync("node", [COLETOR].concat(args).concat(["--dados", DADOS]),
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], timeout: 45 * 60 * 1000 });
}

/* competências COMPLETAS na pasta: 27 preços e 27 analíticos do mesmo mês */
function completas() {
  var p = {}, a = {};
  fs.readdirSync(DADOS).forEach(function (f) {
    var m = f.match(/^sinapi-([A-Z]{2})-(\d{4}-\d{2})(-analitico)?\.json\.gz$/);
    if (!m) return;
    var alvo = m[3] ? a : p;
    (alvo[m[2]] = alvo[m[2]] || {})[m[1]] = 1;
  });
  return Object.keys(p).filter(function (c) {
    return Object.keys(p[c]).length === 27 && a[c] && Object.keys(a[c]).length === 27;
  }).sort();
}

function md5(f) { return crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex"); }

/* o analítico de nome antigo passa a ser o da competência mais nova */
function alinharLegado(comp) {
  var trocados = 0;
  UFS.forEach(function (uf) {
    var origem = path.join(DADOS, "sinapi-" + uf + "-" + comp + "-analitico.json.gz");
    var destino = path.join(DADOS, "sinapi-" + uf + "-analitico.json.gz");
    if (fs.existsSync(destino) && md5(origem) === md5(destino)) return;
    var tmp = path.join(DADOS, ".sinapi-" + uf + "-analitico.json.gz.tmp");
    fs.copyFileSync(origem, tmp);
    fs.renameSync(tmp, destino);
    trocados++;
  });
  return trocados;
}

function pegarJson(url) {
  return new Promise(function (resolve, reject) {
    var req = https.get(url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } }, function (res) {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      var s = ""; res.setEncoding("utf8");
      res.on("data", function (d) { s += d; });
      res.on("end", function () { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.setTimeout(30000, function () { req.destroy(new Error("tempo esgotado")); });
  });
}

function avisar(assunto, linhas) {
  if (arg["sem-email"]) { log("(sem e-mail) " + assunto); return Promise.resolve(false); }
  var cfg;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8")).emailSmtp; } catch (e) { cfg = null; }
  if (!cfg || !cfg.usuario) { log("AVISO NÃO ENVIADO (sem emailSmtp no config): " + assunto); return Promise.resolve(false); }
  var para = process.env.SINAPI_AVISO_PARA || cfg.usuario;
  var texto = linhas.join("\n");
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var html = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">' + esc(texto) + "</div>";
  return require(SMTP).enviar(cfg, { para: para, assunto: assunto, texto: texto, html: html })
    .then(function () { log("e-mail enviado: " + assunto); return true; })
    .catch(function (e) { log("FALHOU ao mandar e-mail (" + (e && e.message) + "): " + assunto); return false; });
}

function main() {
  var est = lerEstado();
  est.coletadas = est.coletadas || {};
  est.avisos = est.avisos || {};
  var erros = [], novas = [];

  if (arg["testar-aviso"]) {
    return avisar("[OrçaPRO] Teste do aviso da SINAPI", [
      "Este é um teste do aviso automático da coleta da SINAPI no servidor OrçaPRO.",
      "", "Se este e-mail chegou, os alarmes de falha também chegam.",
      "Servidor: " + DADOS, "Hora (UTC): " + agora()
    ]).then(function (ok) { if (!ok) process.exitCode = 1; });
  }

  /* 1) o que a CAIXA publica */
  var lista = null;
  try { lista = JSON.parse(coletor(["--listar", "--json"])); }
  catch (e) { erros.push("não consegui ler a lista da CAIXA: " + String((e && (e.stderr || e.message)) || e).slice(0, 400)); }

  if (lista) {
    var oficiais = lista.oficiais || [];
    var alvos = oficiais.slice(0, JANELA);
    var presDes = lista.presentesDes || {};
    alvos.forEach(function (o, idx) {
      var presente = lista.presentes[o.comp] === 27;
      var querDes = idx < DES_N;
      var faltaDes = querDes && presDes[o.comp] !== 27;
      var ja = est.coletadas[o.comp];
      /* primeira execução com a competência já na pasta (posta à mão em
         01/10/2026): registra o nome atual como base, sem recoletar */
      if (presente && !ja) est.coletadas[o.comp] = ja = { nome: o.nome, em: agora(), origem: "já estava na pasta" };
      var retif = presente && ja && ja.nome !== o.nome;
      if (presente && !retif && !faltaDes) return;
      var motivo = retif ? "a CAIXA republicou (" + o.nome + ") — coletando de novo"
        : (!presente ? "nova — coletando" : "falta a desonerada — gerando");
      log(o.comp + ": " + motivo);
      try {
        coletor(["--comp", o.comp, "--sem-manifesto"].concat(retif ? ["--forcar"] : []).concat(querDes ? ["--desonerada", "1"] : []));
        if (!presente || retif) {
          est.coletadas[o.comp] = { nome: o.nome, em: agora(), publicadoEm: o.publicadoEm };
          novas.push({ comp: o.comp, retif: retif, publicadoEm: o.publicadoEm, des: querDes });
        }
      } catch (e) {
        erros.push(o.comp + ": a coleta falhou — " + String((e && (e.stderr || e.message)) || e).trim().split("\n").slice(-6).join(" | ").slice(0, 600));
      }
    });
  }

  /* 1b) a desonerada vai para onde o app a BAIXA: /bases/ serve .json cru de
     BASES. Grava só o que mudou, em nome temporário + rename (a pasta está
     no ar). A de meses antigos fica: quem está na versão anterior do app
     ainda pede pelo nome do mês que conhece. */
  var desServidor = null;
  try {
    var porComp = {};
    fs.readdirSync(DADOS).forEach(function (f) {
      var m = f.match(/^sinapi-([A-Z]{2})-(\d{4}-\d{2})-desonerada\.json\.gz$/);
      if (m) (porComp[m[2]] = porComp[m[2]] || []).push(m[1]);
    });
    var compsDes = Object.keys(porComp).filter(function (c) { return porComp[c].length === 27; }).sort().reverse().slice(0, DES_N);
    var gravadas = 0;
    compsDes.forEach(function (c) {
      UFS.forEach(function (uf) {
        var bruto = require("zlib").gunzipSync(fs.readFileSync(path.join(DADOS, "sinapi-" + uf + "-" + c + "-desonerada.json.gz")));
        var alvo = path.join(BASES, "sinapi-" + uf + "-" + c + "-desonerada.json");
        if (fs.existsSync(alvo) && crypto.createHash("md5").update(fs.readFileSync(alvo)).digest("hex") === crypto.createHash("md5").update(bruto).digest("hex")) return;
        var j = JSON.parse(bruto.toString("utf8"));
        if (j.desonerado !== true || String(j.mes) !== c || String(j.uf).toUpperCase() !== uf) throw new Error(uf + " " + c + ": o pacote não é a desonerada que diz ser");
        var tmp = path.join(BASES, ".sinapi-" + uf + "-" + c + "-desonerada.json.tmp");
        fs.writeFileSync(tmp, bruto);
        fs.renameSync(tmp, alvo);
        gravadas++;
      });
    });
    if (gravadas) log("desonerada: " + gravadas + " arquivos atualizados em " + BASES);
    var noAr = {};
    fs.readdirSync(BASES).forEach(function (f) {
      var m = f.match(/^sinapi-([A-Z]{2})-(\d{4}-\d{2})-desonerada\.json$/);
      if (m) (noAr[m[2]] = noAr[m[2]] || {})[m[1]] = 1;
    });
    desServidor = Object.keys(noAr).filter(function (c) { return Object.keys(noAr[c]).length === 27; }).sort().pop() || null;
  } catch (e) { erros.push("desonerada: não consegui publicar em " + BASES + " — " + e.message); }

  /* 2) o analítico de nome antigo acompanha a mais nova completa */
  var comps = [];
  try { comps = completas(); } catch (e) { erros.push("não consegui ler a pasta " + DADOS + ": " + e.message); }
  var servidor = comps[comps.length - 1] || null;
  if (servidor) {
    try { var t = alinharLegado(servidor); if (t) log("analítico de nome antigo alinhado à " + servidor + " em " + t + " UFs"); }
    catch (e) { erros.push("não consegui alinhar o analítico antigo à " + servidor + ": " + e.message); }
  }
  var caixa = lista && lista.oficiais && lista.oficiais[0] ? lista.oficiais[0].comp : null;
  if (caixa && servidor && caixa > servidor) erros.push("o servidor está na " + fmt(servidor) + " e a CAIXA já publicou a " + fmt(caixa) + ".");
  if (caixa && (!desServidor || caixa > desServidor)) erros.push("a SINAPI DESONERADA do servidor está na " + fmt(desServidor) + " e a CAIXA já publicou a " + fmt(caixa) + ".");

  /* 3) o espelho (GitHub Pages) — o atraso que passou batido em setembro */
  return pegarJson(ESPELHO).then(function (j) { return (j && j.sinapi && j.sinapi.competencia) || null; }, function (e) { return "erro: " + e.message; })
    .then(function (espelho) {
      est.ultimaExecucao = agora();
      est.caixa = caixa; est.servidor = servidor; est.espelho = espelho; est.desonerada = desServidor;
      est.ok = !erros.length;
      est.erros = erros;
      var envios = [];

      if (novas.length) {
        envios.push(avisar("[OrçaPRO] SINAPI " + novas.map(function (n) { return fmt(n.comp); }).join(", ") + " no ar no servidor", [
          "A coleta automática publicou no servidor OrçaPRO:",
          ""].concat(novas.map(function (n) {
            return "  · " + fmt(n.comp) + (n.retif ? " (RETIFICAÇÃO da CAIXA — substituiu a versão anterior)" : "") + " — publicada pela CAIXA em " + (n.publicadoEm || "?") + ", 27 UFs, preço e analítico" + (n.des ? ", onerada e desonerada" : "") + ".";
          })).concat(["",
          "Os clientes recebem na varredura diária do app (ou no botão Verificar atualização, em Tabelas de Preço).",
          "",
          "Espelho do app (GitHub Pages): " + (espelho || "?") + (espelho && servidor && String(espelho) < servidor ? "  ← ATRASADO: o acervo de competências que o usuário escolhe vem dele. Rodar o coletor do GitHub Actions (Coletar SINAPI)." : ""),
        ])));
      }

      if (erros.length) {
        envios.push(avisar("[OrçaPRO] FALHA na coleta da SINAPI", [
          "A coleta automática da SINAPI no servidor OrçaPRO NÃO terminou bem:", ""]
          .concat(erros.map(function (e) { return "  · " + e; }))
          .concat(["",
            "CAIXA: " + fmt(caixa) + "   Servidor: " + fmt(servidor) + "   Espelho: " + (espelho || "?"),
            "",
            "Enquanto isso, os clientes continuam na " + fmt(servidor) + ". Este aviso se repete a cada execução (uma por dia) até a coleta voltar.",
            "Para rodar à mão no VPS: cd /opt/orcapro-sinapi/ferramentas && node sinapi-vps.js",
            "Registro: /opt/orcapro-sinapi/cron.log"])));
      }

      /* espelho atrás do servidor há mais de 5 dias: aviso semanal */
      if (espelho && servidor && /^\d{4}-\d{2}$/.test(String(espelho)) && espelho < servidor) {
        var desde = (est.coletadas[servidor] && est.coletadas[servidor].em) || agora();
        var dias = (Date.now() - Date.parse(desde)) / 864e5;
        var ultimo = est.avisos.espelho ? Date.parse(est.avisos.espelho) : 0;
        if (dias > 5 && (Date.now() - ultimo) / 864e5 > 7) {
          est.avisos.espelho = agora();
          envios.push(avisar("[OrçaPRO] Espelho da SINAPI atrasado (" + espelho + " × servidor " + servidor + ")", [
            "O servidor OrçaPRO já tem a SINAPI " + fmt(servidor) + ", mas o espelho do app (GitHub Pages) continua na " + fmt(espelho) + ".",
            "",
            "A atualização automática dos clientes NÃO depende do espelho (o app pergunta ao servidor primeiro).",
            "O que fica faltando é a lista de competências que o usuário escolhe no orçamento (acervo) e o caminho de quem não alcança o servidor.",
            "",
            "Causa provável: o coletor do GitHub Actions não rodou. Em setembro foi a conta do GitHub bloqueada por cobrança.",
            "Para resolver: https://github.com/RA-Engenharia/orcapro/actions/workflows/coletar-sinapi.yml → Run workflow."]));
        }
      }

      gravarEstado(est);
      log("CAIXA " + (caixa || "?") + " · servidor " + (servidor || "?") + " · desonerada " + (desServidor || "?") + " · espelho " + (espelho || "?") +
        (novas.length ? " · NOVAS: " + novas.map(function (n) { return n.comp; }).join(",") : "") +
        (erros.length ? " · ERROS: " + erros.length : " · ok"));
      return Promise.all(envios).then(function () { if (erros.length) process.exitCode = 1; });
    });
}

main();
