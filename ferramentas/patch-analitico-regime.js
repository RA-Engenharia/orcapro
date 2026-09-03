#!/usr/bin/env node
/* =====================================================================
 * patch-analitico-regime.js — ensina o gerador do ANALÍTICO a produzir os
 * DOIS regimes, como o irmão sintético já faz desde a v1.1.204.
 *
 * ONDE RODAR: na raiz do repositório do app (a pasta que tem `tools/` e
 * `data/`), UMA vez:
 *
 *     node patch-analitico-regime.js
 *
 * Ele altera `tools/gerar-analitico-sinapi.js` e guarda o original em
 * `tools/gerar-analitico-sinapi.js.bak`. Rodar de novo não faz nada (ele
 * detecta que já foi aplicado).
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * `gerar-sintetico-sinapi.js` tem `--regime`: onerada lê CSD/ISD,
 * desonerada lê CCD/ICD. Por isso existe `sinapi-PA-2026-06-desonerada.json`
 * e o app sabe orçar no regime desonerado.
 *
 * `gerar-analitico-sinapi.js` NÃO tem: ele lê `wb.Sheets['ISD']` e
 * `wb.Sheets['CSD']` cravados no código e grava sempre
 * `sinapi-<UF>-analitico.json`. Ou seja, existe preço desonerado e NENHUM
 * detalhamento desonerado — o app ficava com o desdobramento do regime
 * oposto, calado. No PA, a composição 104658 vale 187,05 desonerada e
 * 189,69 onerada: o modal de insumos mostrava a segunda em cima da primeira.
 *
 * NÃO É PRECISO OUTRO DOWNLOAD. A aba "Analítico" da Referência é só a
 * ESTRUTURA (composição -> insumo + coeficiente), nacional e sem regime — a
 * desoneração muda o encargo social da hora de mão de obra, não a quantidade
 * de horas. O regime mora nas abas de PREÇO. Conferido com o dado real:
 * recompondo a 104658 com os coeficientes nacionais e os preços de cada
 * regime, dá 189,69 (bate exato com o analítico publicado) e 187,07 contra
 * os 187,05 oficiais — 2 centavos de arredondamento de subcomposição, a
 * mesma característica que o gerador já documenta no onerado.
 *
 * DEPOIS DE APLICAR
 *     node tools/gerar-analitico-sinapi.js ALL --mes 2026-06 --regime desonerada --gzip
 *     (publicar os .json/.json.gz em /analitico/ no servidor)
 *
 * O app (1.2.33+) procura `sinapi-<UF>-<COMP>-desonerada-analitico.json` e
 * NUNCA cai no arquivo do outro regime: sem o desonerado publicado, ele diz
 * ao usuário que o detalhamento desse regime não existe, em vez de mostrar
 * o do regime errado.
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ALVO = path.join(process.cwd(), 'tools', 'gerar-analitico-sinapi.js');

/* Cada troca é [rótulo, texto exato de origem, texto de destino]. O script
   EXIGE que cada origem apareça exatamente UMA vez: zero significa que o seu
   arquivo é diferente do que eu li, e aí não mexo em nada — arquivo de
   gerador alterado às cegas produz 27 estados errados sem avisar. */
const TROCAS = [
  ['mapa de regimes + conferência do cabeçalho',
`// --- classificador de categoria/tipoInsumo ---------------------------------`,
`/* ⚠ QUAL ABA E QUAL REGIME — lido do cabecalho da propria planilha:
 *   CSD/ISD → "RELATORIO ... ENCARGOS SOCIAIS SEM DESONERACAO" → ONERADO
 *   CCD/ICD → "RELATORIO ... ENCARGOS SOCIAIS COM DESONERACAO" → DESONERADO
 * Mesmo mapa do gerar-sintetico-sinapi.js — de proposito: um so vocabulario
 * para os dois geradores. A aba "Analitico" (estrutura) NAO tem regime. */
const REGIMES = {
    onerada:    { comp: 'CSD', insu: 'ISD', desonerado: false },
    desonerada: { comp: 'CCD', insu: 'ICD', desonerado: true }
};

/* CONFERE O REGIME NO TEXTO DA PLANILHA antes de gerar 27 estados. Copiado do
   irmao sintetico, onde foi ele que pegou o flag invertido da v1.1.204: a
   sigla e parecida e o regime e oposto. Nao se grava regime no escuro. */
function conferirRegime(wb, reg) {
    const sh = wb.Sheets[reg.comp];
    if (!sh) throw new Error('aba ' + reg.comp + ' ausente');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    let cab = '';
    for (let i = 0; i < Math.min(rows.length, 6); i++) cab += ' ' + rows[i].join(' ');
    cab = cab.toUpperCase();
    const temCom = cab.indexOf('COM DESONERA') >= 0;
    const temSem = cab.indexOf('SEM DESONERA') >= 0;
    if (reg.desonerado && !(temCom && !temSem)) throw new Error('aba ' + reg.comp + ' nao se declara COM DESONERACAO — nao gero no escuro');
    if (!reg.desonerado && !temSem) throw new Error('aba ' + reg.comp + ' nao se declara SEM DESONERACAO — nao gero no escuro');
    log('regime conferido no cabecalho de ' + reg.comp + ': ' + (reg.desonerado ? 'COM' : 'SEM') + ' desoneracao');
}

// --- classificador de categoria/tipoInsumo ---------------------------------`],

  ['lerISD passa a aceitar a aba do regime',
`function lerISD(wb, uf) {
    const sh = wb.Sheets['ISD'];
    if (!sh) throw new Error('aba ISD ausente');`,
`function lerISD(wb, uf, reg) {
    reg = reg || REGIMES.onerada;
    const sh = wb.Sheets[reg.insu];
    if (!sh) throw new Error('aba ' + reg.insu + ' ausente');`],

  ['erro do ISD nomeia a aba certa',
`    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no ISD');`,
`    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada na aba ' + reg.insu);`],

  ['erro da coluna SP nomeia a aba certa',
`    if (spCol < 0) throw new Error('coluna SP não encontrada no ISD (atribuição São Paulo)');`,
`    if (spCol < 0) throw new Error('coluna SP não encontrada na aba ' + reg.insu + ' (atribuição São Paulo)');`],

  ['lerCSD passa a aceitar a aba do regime',
`function lerCSD(wb, uf) {
    const sh = wb.Sheets['CSD'];
    if (!sh) throw new Error('aba CSD ausente');`,
`function lerCSD(wb, uf, reg) {
    reg = reg || REGIMES.onerada;
    const sh = wb.Sheets[reg.comp];
    if (!sh) throw new Error('aba ' + reg.comp + ' ausente');`],

  ['erro do CSD nomeia a aba certa',
`    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada no CSD');`,
`    if (ufCol < 0) throw new Error('UF ' + uf + ' não encontrada na aba ' + reg.comp);`],

  ['gerarUF recebe o regime',
`function gerarUF(wb, uf, mes, mapaCat) {
    const isd = lerISD(wb, uf);
    const csd = lerCSD(wb, uf);`,
`function gerarUF(wb, uf, mes, mapaCat, reg) {
    reg = reg || REGIMES.onerada;
    const isd = lerISD(wb, uf, reg);
    const csd = lerCSD(wb, uf, reg);`],

  ['o pacote passa a DECLARAR o regime',
`        mes: mesFmt, uf: uf, tipo: 'analitico', count: dados.length,
        fonte: 'SINAPI Analitico ' + mes, dados: dados`,
`        mes: mesFmt, uf: uf, tipo: 'analitico', desonerado: reg.desonerado, count: dados.length,
        /* ⚠ O CAMPO \`desonerado\` E A TRAVA DO LADO DO APP: o Analitico recusa
           carregar um arquivo que se declara do regime que ele nao pediu.
           Arquivo antigo nao tem o campo e continua valendo como onerado. */
        fonte: 'SINAPI Analitico ' + mes + (reg.desonerado ? ' (desonerado)' : ''), dados: dados`],

  ['--regime na linha de comando',
`    let mes = getArg('--mes') || '2026-05';`,
`    let mes = getArg('--mes') || '2026-05';
    const regNome = (getArg('--regime') || 'onerada').toLowerCase();
    const reg = REGIMES[regNome];
    if (!reg) throw new Error('regime desconhecido: ' + regNome + ' (use onerada | desonerada)');
    /* sufixo so no regime NAO padrao, igual ao sintetico: o arquivo sem
       sufixo continua sendo o onerado que o pacote distribui e o app aponta */
    const sufixo = reg.desonerado ? '-desonerada' : '';`],

  ['lê as abas do regime escolhido e confere antes de gerar',
`    const wb = XLSX.readFile(refPath, { sheets: ['ISD', 'CSD', 'Analítico'] });`,
`    const wb = XLSX.readFile(refPath, { sheets: [reg.insu, reg.comp, 'Analítico'] });
    conferirRegime(wb, reg);`],

  ['o log diz o regime',
`    log('=== gerar-analitico-sinapi | alvo=' + alvo + ' mes=' + mes + ' ===');`,
`    log('=== gerar-analitico-sinapi | alvo=' + alvo + ' mes=' + mes + ' regime=' + ((getArg('--regime') || 'onerada').toLowerCase()) + ' ===');`],

  ['gera e grava com o regime no nome',
`            const pacote = gerarUF(wb, uf, mes, mapaCat);
            if (pacote.count === 0) throw new Error('0 composições');
            const outPath = path.join(outDir, 'sinapi-' + uf + '-analitico.json');`,
`            const pacote = gerarUF(wb, uf, mes, mapaCat, reg);
            if (pacote.count === 0) throw new Error('0 composições');
            const outPath = path.join(outDir, 'sinapi-' + uf + sufixo + '-analitico.json');`]
];

function main() {
    if (!fs.existsSync(ALVO)) {
        console.error('Não achei ' + ALVO);
        console.error('Rode este script na RAIZ do repositório do app (a pasta que tem tools/ e data/).');
        process.exit(1);
    }
    let s = fs.readFileSync(ALVO, 'utf8');

    if (s.indexOf('const REGIMES = {') >= 0 && s.indexOf("getArg('--regime')") >= 0) {
        console.log('Já aplicado: o gerador do analítico já conhece --regime. Nada a fazer.');
        return;
    }

    /* Confere TODAS as âncoras antes de trocar QUALQUER uma: meia aplicação
       deixaria o gerador sem compilar, e é o arquivo que produz o dado de
       27 estados. Ou entra inteiro, ou não entra. */
    const faltando = [];
    for (const [rotulo, de] of TROCAS) {
        const n = s.split(de).length - 1;
        if (n !== 1) faltando.push('  · ' + rotulo + '  (encontrado ' + n + 'x, esperava 1)');
    }
    if (faltando.length) {
        console.error('NÃO APLIQUEI NADA. Seu arquivo é diferente do que eu li:');
        faltando.forEach(l => console.error(l));
        console.error('\nProvavelmente o gerador já mudou. Me mande o tools/gerar-analitico-sinapi.js atual que eu refaço o patch.');
        process.exit(2);
    }

    for (const [, de, para] of TROCAS) s = s.split(de).join(para);

    fs.writeFileSync(ALVO + '.bak', fs.readFileSync(ALVO));
    fs.writeFileSync(ALVO, s);
    console.log('OK — ' + TROCAS.length + ' trechos alterados em tools/gerar-analitico-sinapi.js');
    console.log('     original guardado em tools/gerar-analitico-sinapi.js.bak');
    console.log('');
    console.log('Agora:');
    console.log('  node tools/gerar-analitico-sinapi.js ALL --mes 2026-06 --regime desonerada --gzip');
    console.log('  (o onerado continua igual: sem --regime, nada muda no que já existe)');
}

main();
