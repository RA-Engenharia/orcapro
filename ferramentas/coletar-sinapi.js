#!/usr/bin/env node
/* =====================================================================
 * coletar-sinapi.js — a frota inteira recebe a SINAPI sem ERP e sem VPS
 *
 * O QUE ELE FAZ
 *   1. pergunta à CAIXA quais competências estão publicadas;
 *   2. baixa as que faltam no espelho (`app/data/`);
 *   3. gera os 27 estados de cada uma com os geradores oficiais da casa;
 *   4. grava comprimido, mantém uma JANELA de competências e regenera o
 *      manifesto que o app lê.
 *
 * Publicado no repositório, o espelho entrega para todo mundo na varredura
 * diária do dia seguinte — app instalado, PWA, qualquer UF.
 *
 * ⚠ POR QUE A JANELA, E NÃO SÓ A MAIS NOVA. Orçamento de licitação é preso à
 *   data-base do edital: quem abriu um processo em março tem de continuar
 *   orçando em março, mesmo em setembro. O app já sabia escolher competência
 *   (`trocarBaseSinapi`) e já recusava escolher uma que não possui — o que
 *   faltava era o acervo existir. Por isso a janela guarda os últimos meses,
 *   e não apenas o corrente.
 *
 * ⚠ O ENDEREÇO DA CAIXA NÃO É CHUTADO. A página de downloads monta a lista
 *   por JavaScript, e o nome do arquivo já mudou de padrão uma vez (o antigo,
 *   por UF, morre em 09/2023). O que é estável é a LISTA do SharePoint —
 *   `_api/web/lists/getbytitle('Downloads')`, categoria 888 —, a mesma que o
 *   fetcher da casa já consultava. Daí sai o nome e a URL do mês, sempre
 *   atuais. Adivinhar nome de arquivo daria 404 silencioso todo mês.
 *
 * ⚠ NADA É PUBLICADO SEM CONFERÊNCIA. Um pacote só entra no espelho depois
 *   de passar pelas checagens de `validar()`: competência certa, UF certa,
 *   contagem plausível e o analítico casado com o sintético. É melhor a
 *   coleta falhar barulhenta do que publicar base torta num documento que vai
 *   para licitação.
 *
 * USO
 *   node ferramentas/coletar-sinapi.js --listar
 *   node ferramentas/coletar-sinapi.js --comp 2026-07
 *   node ferramentas/coletar-sinapi.js --janela 5          (as 5 mais novas)
 *   node ferramentas/coletar-sinapi.js --janela 5 --podar  (e apaga as velhas)
 * ===================================================================== */
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var https = require("https");
var zlib = require("zlib");
var { execFileSync } = require("child_process");

var RAIZ = path.resolve(__dirname, "..");
var DADOS = path.join(RAIZ, "app", "data");
var GER = path.join(RAIZ, "ferramentas", "sinapi", "tools");
var UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

function log(m) { console.log("[coletar] " + m); }

/* ---------- HTTP com retomada ----------------------------------------
 * O ZIP da CAIXA tem ~16 MB e a conexão cai no meio com alguma frequência.
 * `Range` é aceito pelo servidor (206), então a retomada é de graça — e sem
 * ela a coleta falharia por motivo que não é dela. */
function baixar(url, destino, tentativas) {
  tentativas = tentativas || 8;
  var UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  for (var i = 1; i <= tentativas; i++) {
    try {
      execFileSync("curl", ["-sS", "--max-time", "180", "-L", "-A", UA,
        "-H", "Cookie: security=true", "-H", "Accept-Language: pt-BR,pt;q=0.9",
        "-C", "-", url, "-o", destino], { stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) { /* queda no meio: a próxima volta retoma de onde parou */ }
    var t = 0; try { t = fs.statSync(destino).size; } catch (e) {}
    if (t > 1000000) {                      // pacote real tem MB, não bytes
      try { execFileSync("unzip", ["-t", "-qq", destino], { stdio: "ignore" }); return t; }
      catch (e) { log("  baixa " + i + ": zip incompleto (" + t + " B), continuando"); }
    } else { log("  baixa " + i + ": " + t + " B"); }
  }
  throw new Error("não consegui baixar " + url);
}

function pegarJson(url) {
  var UA = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
  var s = execFileSync("curl", ["-sS", "--max-time", "90", "-L", "-A", UA,
    "-H", "Accept: application/json;odata=verbose", "-H", "Cookie: security=true", url],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(s);
}

/* ---------- o que a CAIXA tem publicado hoje -------------------------- */
function listarOficial() {
  var url = "https://www.caixa.gov.br/_api/web/lists/getbytitle('Downloads')/Items"
    + "?$select=Title,Modified,FileLeafRef,EncodedAbsUrl,FileSizeDisplay"
    + "&$filter=Categoria/ID%20eq%20888%20and%20FSObjType%20eq%200%20and%20OData__ModerationStatus%20eq%200"
    + "&$top=200&$orderby=Modified%20desc";
  var d = pegarJson(url);
  var itens = (d && d.d && d.d.results) || [];
  var out = {};
  itens.forEach(function (it) {
    var nome = it.FileLeafRef || "";
    if (!/formato-xlsx.*\.zip$/i.test(nome)) return;      // o PDF não serve para gerar
    var m = nome.match(/SINAPI-(\d{4})-(\d{2})-/);
    if (!m) return;
    var comp = m[1] + "-" + m[2];
    /* retificação vence a publicação original do mesmo mês: é a versão que a
       CAIXA passou a considerar válida */
    var ehRetif = /Retificacao/i.test(nome);
    if (!out[comp] || (ehRetif && !out[comp].retificacao)) {
      out[comp] = {
        comp: comp, nome: nome, retificacao: ehRetif,
        url: String(it.EncodedAbsUrl || "").replace(/^http:/, "https:"),
        publicadoEm: String(it.Modified || "").slice(0, 10),
        bytes: parseInt(it.FileSizeDisplay, 10) || 0
      };
    }
  });
  return Object.keys(out).sort().reverse().map(function (k) { return out[k]; });
}

/* ---------- o que o espelho já tem ------------------------------------ */
function competenciasNoEspelho() {
  var vistas = {};
  try {
    fs.readdirSync(DADOS).forEach(function (f) {
      var m = f.match(/^sinapi-([A-Z]{2})-(\d{4}-\d{2})\.json(\.gz)?$/);
      if (m) (vistas[m[2]] = vistas[m[2]] || {})[m[1]] = 1;
    });
  } catch (e) {}
  var out = {};
  /* só conta como PRESENTE a competência completa: 27 UFs. Meia competência
     no espelho faria o app oferecê-la e falhar em quem mora na UF que falta. */
  Object.keys(vistas).forEach(function (c) { out[c] = Object.keys(vistas[c]).length; });
  return out;
}

/* ---------- conferência antes de publicar ----------------------------- */
function validar(dir, comp) {
  var problemas = [];
  UFS.forEach(function (uf) {
    var fs1 = path.join(dir, "sinapi-" + uf + "-" + comp + ".json");
    var fa1 = path.join(dir, "sinapi-" + uf + "-analitico.json");
    if (!fs.existsSync(fs1)) { problemas.push(uf + ": sintético não gerado"); return; }
    if (!fs.existsSync(fa1)) { problemas.push(uf + ": analítico não gerado"); return; }
    var s, a;
    try { s = JSON.parse(fs.readFileSync(fs1, "utf8")); } catch (e) { problemas.push(uf + ": sintético ilegível"); return; }
    try { a = JSON.parse(fs.readFileSync(fa1, "utf8")); } catch (e) { problemas.push(uf + ": analítico ilegível"); return; }
    if (String(s.uf).toUpperCase() !== uf) problemas.push(uf + ": sintético diz UF " + s.uf);
    if (String(s.mes) !== comp) problemas.push(uf + ": sintético diz competência " + s.mes);
    if (!(s.dados && s.dados.length > 5000)) problemas.push(uf + ": sintético com só " + ((s.dados || []).length) + " itens");
    if (typeof s.desonerado !== "boolean") problemas.push(uf + ": sintético sem o regime declarado no topo");
    if (!(a.dados && a.dados.length > 5000)) problemas.push(uf + ": analítico com só " + ((a.dados || []).length) + " composições");
    /* o analítico tem de ser DO MESMO MÊS — preço de um mês com insumo de
       outro é exatamente o erro que este espelho existe para não cometer */
    var mesA = String(a.mes || "").replace(/^(\d{2})\/(\d{4})$/, "$2-$1");
    if (mesA !== comp) problemas.push(uf + ": analítico é de " + a.mes + ", não de " + comp);
  });
  return problemas;
}

function gzipar(origem, destino) {
  fs.writeFileSync(destino, zlib.gzipSync(fs.readFileSync(origem), { level: 9 }));
}

/* ---------- coleta de UMA competência --------------------------------- */
function coletar(item) {
  var comp = item.comp;
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sinapi-" + comp + "-"));
  try {
    var zip = path.join(tmp, "pacote.zip");
    log(comp + ": baixando " + item.nome + " (" + Math.round(item.bytes / 1048576) + " MB)");
    baixar(item.url, zip);

    execFileSync("unzip", ["-qo", "-j", zip, "-d", tmp]);
    var ref = fs.readdirSync(tmp).filter(function (f) { return /refer/i.test(f) && /\.xlsx$/i.test(f); })[0];
    if (!ref) throw new Error("o ZIP de " + comp + " não traz a Referência .xlsx");
    ref = path.join(tmp, ref);

    var saida = path.join(tmp, "saida");
    fs.mkdirSync(saida);
    log(comp + ": gerando os 27 estados (analítico)");
    execFileSync("node", [path.join(GER, "gerar-analitico-sinapi.js"), "ALL", "--mes", comp, "--ref", ref, "--out", saida],
      { stdio: ["ignore", "ignore", "inherit"] });
    log(comp + ": gerando os 27 estados (sintético)");
    execFileSync("node", [path.join(GER, "gerar-sintetico-sinapi.js"), UFS.join(","), "--mes", comp, "--regime", "onerada", "--ref", ref, "--out", saida],
      { stdio: ["ignore", "ignore", "inherit"] });

    var probs = validar(saida, comp);
    if (probs.length) {
      console.error("[coletar] " + comp + " RECUSADO — " + probs.length + " problema(s):");
      probs.slice(0, 12).forEach(function (p) { console.error("    " + p); });
      throw new Error(comp + ": pacote não passou na conferência");
    }

    /* grava comprimido. O analítico sai do gerador com o nome LEGADO (sem
       competência); no espelho ele precisa da competência no nome, senão as
       competências do acervo se sobrescreveriam e sobraria uma só. O app já
       procura por esse nome (`App._nomeAnalitico`). */
    var n = 0;
    UFS.forEach(function (uf) {
      gzipar(path.join(saida, "sinapi-" + uf + "-" + comp + ".json"),
             path.join(DADOS, "sinapi-" + uf + "-" + comp + ".json.gz"));
      gzipar(path.join(saida, "sinapi-" + uf + "-analitico.json"),
             path.join(DADOS, "sinapi-" + uf + "-" + comp + "-analitico.json.gz"));
      n += 2;
    });
    log(comp + ": " + n + " arquivos gravados no espelho");
    return true;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

/* ---------- poda: mantém só a janela ---------------------------------- */
function podar(manter) {
  var mantidas = {};
  manter.forEach(function (c) { mantidas[c] = 1; });
  var apagados = 0;
  fs.readdirSync(DADOS).forEach(function (f) {
    var m = f.match(/^sinapi-[A-Z]{2}-(\d{4}-\d{2})(-analitico)?\.json\.gz$/);
    if (!m || mantidas[m[1]]) return;
    fs.unlinkSync(path.join(DADOS, f)); apagados++;
  });
  if (apagados) log("poda: " + apagados + " arquivos de competência fora da janela removidos");
  return apagados;
}

/* ---------- principal -------------------------------------------------- */
function main() {
  var arg = {};
  process.argv.slice(2).forEach(function (a, i, all) {
    if (a.indexOf("--") === 0) arg[a.slice(2)] = (all[i + 1] && all[i + 1].indexOf("--") !== 0) ? all[i + 1] : true;
  });

  var oficiais = listarOficial();
  if (!oficiais.length) { console.error("[coletar] a CAIXA não devolveu nenhuma competência — nada foi feito."); process.exit(1); }
  var noEspelho = competenciasNoEspelho();

  if (arg.listar) {
    log("competências publicadas pela CAIXA (mais nova primeiro):");
    oficiais.slice(0, 14).forEach(function (o) {
      var tem = noEspelho[o.comp] || 0;
      log("  " + o.comp + "  publicado " + o.publicadoEm + "  " + Math.round(o.bytes / 1048576) + " MB" +
        (o.retificacao ? "  [retificação]" : "") + "   espelho: " + (tem ? tem + "/27 UFs" : "—"));
    });
    return;
  }

  var alvos;
  if (arg.comp) {
    alvos = oficiais.filter(function (o) { return o.comp === String(arg.comp); });
    if (!alvos.length) { console.error("[coletar] a CAIXA não publica a competência " + arg.comp); process.exit(1); }
  } else {
    var janela = parseInt(arg.janela, 10) || 5;
    alvos = oficiais.slice(0, janela);
  }

  var feitos = [], falhas = [];
  alvos.forEach(function (o) {
    if (noEspelho[o.comp] === 27 && !arg.forcar) { log(o.comp + ": já completa no espelho (27/27) — pulando"); feitos.push(o.comp); return; }
    try { coletar(o); feitos.push(o.comp); }
    catch (e) { falhas.push(o.comp + ": " + (e && e.message)); console.error("[coletar] " + o.comp + " FALHOU: " + (e && e.message)); }
  });

  if (arg.podar) podar(alvos.map(function (o) { return o.comp; }));

  /* o manifesto é regenerado por quem sabe olhar a pasta — nunca escrito aqui */
  try {
    execFileSync("node", [path.join(RAIZ, "ferramentas", "gerar-bases-status.js")], { stdio: "inherit" });
  } catch (e) { console.error("[coletar] falhou ao regenerar o manifesto: " + (e && e.message)); }

  log("competências no espelho: " + feitos.join(", "));
  if (falhas.length) { console.error("[coletar] " + falhas.length + " falha(s):"); falhas.forEach(function (f) { console.error("   " + f); }); process.exit(1); }
}

main();
