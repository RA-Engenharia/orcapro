#!/usr/bin/env node
/* =====================================================================
 * gerar-bases-status.js — o manifesto do ESPELHO de bases
 *
 * O repositório já é um espelho completo: `app/data/` carrega a SINAPI das
 * 27 UFs e os analíticos, e o GitHub Pages serve tudo com CORS aberto. O
 * que faltava era o app SABER disso: ele lia `data/` como pasta local (a
 * base que veio no instalador) e, para atualizar, só sabia perguntar ao
 * servidor OrçaPRO.
 *
 * Isso deixava um buraco em quem usa o app INSTALADO: o pacote de
 * atualização da frota exclui `data/` de propósito (robocopy /E copiaria
 * por cima da base do cliente, inclusive de uma base própria ou mais nova),
 * então uma competência nova NUNCA chegava por esse caminho. Sobravam o VPS
 * e o fetcher local — e quando o VPS parou de ser alimentado, a frota
 * inteira ficou sem rota nenhuma.
 *
 * Este manifesto é a rota que faltava. Ele é GERADO a partir do que existe
 * de fato em `app/data/`, nunca escrito à mão: manifesto que promete um
 * arquivo inexistente é pior que manifesto nenhum — o app tentaria baixar,
 * falharia e reportaria "servidor fora do ar" para um problema que é de
 * conteúdo.
 *
 * Uso:  node ferramentas/gerar-bases-status.js [--conferir]
 *   sem argumento:  regrava app/data/bases-status.json
 *   --conferir:     só compara e sai != 0 se o manifesto estiver desatualizado
 *                   (é o modo para rodar antes de publicar)
 * ===================================================================== */
"use strict";
var fs = require("fs");
var path = require("path");

var RAIZ = path.resolve(__dirname, "..");
var DIR = path.join(RAIZ, "app", "data");
var SAIDA = path.join(DIR, "bases-status.json");

function ler() {
  try { return fs.readdirSync(DIR); } catch (e) { return []; }
}

/* Uma UF só entra na lista se o arquivo REALMENTE existe e tem tamanho de
   pacote de verdade. Um JSON truncado a 200 bytes passaria num `existsSync`
   e quebraria só na máquina do cliente. */
function valido(nome) {
  try { return fs.statSync(path.join(DIR, nome)).size > 100000; } catch (e) { return false; }
}

function main() {
  var arquivos = ler();

  /* competências presentes: sinapi-<UF>-<AAAA-MM>.json */
  var porComp = {};
  arquivos.forEach(function (f) {
    var m = f.match(/^sinapi-([A-Z]{2})-(\d{4}-\d{2})\.json$/);
    if (!m || !valido(f)) return;
    (porComp[m[2]] = porComp[m[2]] || []).push(m[1]);
  });
  var comps = Object.keys(porComp).sort();
  var maisNova = comps[comps.length - 1] || "";

  var analiticoUfs = arquivos
    .filter(function (f) { return /^sinapi-([A-Z]{2})-analitico\.json(\.gz)?$/.test(f) && valido(f); })
    .map(function (f) { return f.match(/^sinapi-([A-Z]{2})-/)[1]; });
  var desonUfs = arquivos
    .filter(function (f) { return /^sinapi-([A-Z]{2})-desonerada-analitico\.json(\.gz)?$/.test(f) && valido(f); })
    .map(function (f) { return f.match(/^sinapi-([A-Z]{2})-/)[1]; });

  var uniq = function (a) { var o = {}; a.forEach(function (x) { o[x] = 1; }); return Object.keys(o).sort(); };

  var manifesto = {
    /* ⚠ MESMO FORMATO do /api/bases-status do servidor OrçaPRO, de propósito:
       o app compara as duas fontes com o mesmo código. Campo que o espelho
       não sabe responder fica FORA — `publicadoEm` é a data em que a CAIXA
       publicou, e isso quem sabe é quem coletou, não quem espelha. */
    sinapi: {
      competencia: maisNova,
      ufs: uniq(porComp[maisNova] || [])
    },
    sinapiDesoneradaUfs: uniq(desonUfs),
    analiticoUfs: uniq(analiticoUfs),
    /* histórico: serve para o app não pedir uma competência que o espelho
       não tem mais, se algum dia arquivos velhos forem removidos */
    competencias: comps
  };

  var texto = JSON.stringify(manifesto, null, 2) + "\n";

  if (process.argv.indexOf("--conferir") >= 0) {
    var atual = "";
    try { atual = fs.readFileSync(SAIDA, "utf8"); } catch (e) {}
    if (atual === texto) {
      console.log("OK  bases-status.json confere com app/data/ (" + maisNova + ", " + manifesto.sinapi.ufs.length + " UFs)");
      process.exit(0);
    }
    console.error("FALHA  bases-status.json esta desatualizado — rode: node ferramentas/gerar-bases-status.js");
    console.error("esperado:\n" + texto);
    process.exit(1);
  }

  fs.writeFileSync(SAIDA, texto);
  console.log("gravado " + path.relative(RAIZ, SAIDA));
  console.log("  competencia mais nova: " + (maisNova || "(nenhuma)"));
  console.log("  UFs com sintetico:     " + manifesto.sinapi.ufs.length);
  console.log("  UFs com analitico:     " + manifesto.analiticoUfs.length);
  console.log("  UFs com desonerada:    " + manifesto.sinapiDesoneradaUfs.length);
  console.log("  competencias no ar:    " + comps.join(", "));
}

main();
