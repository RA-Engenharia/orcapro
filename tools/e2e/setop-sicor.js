/* =====================================================================
 * setop-sicor.js — dirige o app DE VERDADE e valida a atualização da
 * SETOP pela planilha do SICOR-MG (v1.1.204).
 *
 * Não é teste unitário: sobe um servidor estático, abre o Chromium, passa
 * pelo portão do teste grátis, instala a SETOP do pacote, importa uma
 * planilha e confere o que sobrou na base — inclusive depois de recarregar.
 *
 * Rodar:   node tools/e2e/setop-sicor.js
 * Precisa: Playwright instalado (local ou global) + um Chromium que ele ache.
 *          Nada disso está no repositório — o projeto não tem package.json
 *          e este script é ferramenta de desenvolvimento, não dependência.
 *
 * A planilha de teste é GERADA da própria base do app: 40 códigos reais com
 * preço trocado, 3 serviços novos, e 2 linhas-lixo (total de seção e
 * cabeçalho repetido) para provar que o filtro pega as duas.
 * ===================================================================== */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const RAIZ = path.resolve(__dirname, "..", "..");
const APP = path.join(RAIZ, "app");
const PORTA = 8899;

/* Playwright pode estar local ou global — tenta os dois antes de desistir. */
function acharPlaywright() {
  try { return require("playwright"); } catch (e) {}
  const globais = [
    "/opt/node22/lib/node_modules/playwright",
    path.join(os.homedir(), ".npm-global/lib/node_modules/playwright"),
    "/usr/lib/node_modules/playwright", "/usr/local/lib/node_modules/playwright"
  ];
  for (const g of globais) { try { return require(g); } catch (e) {} }
  console.error("Playwright não encontrado. Instale com: npm i -D playwright");
  process.exit(2);
}

/* O executável do Chromium do ambiente traz sufixo de build (chromium-1194);
   o caminho sem sufixo NÃO existe. Se nada casar, deixa o Playwright decidir. */
function acharChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const exe = path.join(base, d, "chrome-linux", "chrome");
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) {}
  return undefined;
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".gz": "application/gzip" };

function subirServidor() {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    const alvo = path.join(APP, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    if (!alvo.startsWith(APP)) { res.writeHead(403).end(); return; }
    fs.readFile(alvo, (err, buf) => {
      if (err) { res.writeHead(404).end("nao encontrado"); return; }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(alvo)] || "application/octet-stream",
        "Cache-Control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise(ok => srv.listen(PORTA, "127.0.0.1", () => ok(srv)));
}

/* planilha sintética a partir dos códigos REAIS da base instalada */
function gerarPlanilha(destino) {
  const j = JSON.parse(fs.readFileSync(path.join(APP, "data", "setop-MG-current.json"), "utf8"));
  const L = ["CODIGO;DESCRICAO;UNIDADE;CUSTO UNITARIO"];
  j.dados.slice(0, 40).forEach(d => {
    const novo = (Number(d.precos.Central) || 1) * 2 + 0.37;   // bem diferente do preço de 2023
    L.push([d.codigo, '"' + String(d.descricao).replace(/"/g, "") + '"', d.unidade,
      novo.toFixed(2).replace(".", ",")].join(";"));
  });
  L.push('SIC-NOVO-1;"SERVICO CRIADO NA REVISAO 2026";m2;1.234,56');
  L.push('SIC-NOVO-2;"OUTRO SERVICO NOVO 2026";un;89,90');
  L.push('SIC-NOVO-3;"TERCEIRO SERVICO NOVO";m3;12,00');
  L.push(';"TOTAL DA SECAO";;');                      // sem código e sem custo: morre no conversor
  L.push("CODIGO;DESCRICAO;UNIDADE;CUSTO UNITARIO");  // cabeçalho repetido: custo 0, morre na mescla
  fs.writeFileSync(destino, L.join("\n"), "utf8");
  return { total: L.length };
}

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) console.log("  ok   " + nome);
  else { falhas++; console.log("  FALHA " + nome + (extra ? "  << " + extra : "")); }
};

(async () => {
  const { chromium } = acharPlaywright();
  const srv = await subirServidor();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orcapro-e2e-"));
  const CSV = path.join(tmp, "sicor-central-2026-04.csv");
  gerarPlanilha(CSV);
  console.log("servidor em http://127.0.0.1:" + PORTA + "  ·  planilha em " + CSV);

  const browser = await chromium.launch({ executablePath: acharChromium() });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const erros = [];
  page.on("pageerror", e => erros.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") erros.push("console.error: " + m.text().slice(0, 200)); });

  // o tour cobre a tela e engole cliques; fechar depois não basta, ele reabre
  await page.addInitScript(() => { try { localStorage.setItem("orcapro:tour:v1", "1"); } catch (e) {} });

  const limparToasts = () => page.evaluate(() => { const t = document.getElementById("toasts"); if (t) t.innerHTML = ""; });
  const ultimoToast = () => page.evaluate(() => {
    const ts = document.querySelectorAll(".toast");
    return ts.length ? ts[ts.length - 1].textContent : "";
  });
  const abrirTabelas = async () => {
    await page.evaluate(() => App.abrirTabelas());
    await page.waitForSelector("#sicor-regiao", { timeout: 15000 });
    await page.waitForTimeout(300);
  };

  console.log("\n--- 1) boot ---");
  await page.goto("http://127.0.0.1:" + PORTA + "/index.html", { waitUntil: "domcontentloaded" });
  if (await page.locator("#tg-nome").count()) {      // portão do teste grátis: entra direto, sem login
    await page.fill("#tg-nome", "Teste E2E");
    await page.fill("#tg-fone", "31999990000");
    await page.fill("#tg-email", "e2e@teste.com");
    if (await page.locator("#tg-ok").count()) await page.check("#tg-ok");
    await page.click('button:has-text("Liberar meu teste")');
  }
  await page.waitForFunction(() => window.App && typeof App.abrirTabelas === "function"
    && window.Bases && document.querySelector("#sidebar"), { timeout: 40000 });
  ok("app abriu com o módulo Bases vivo", true);

  console.log("\n--- 2) o bloco do SICOR aparece ---");
  await abrirTabelas();
  const tela = await page.innerHTML(".modal");
  ok("título do bloco", tela.includes("Atualizar a SETOP-MG"));
  ok("link do cadastro", tela.includes("portal.der.mg.gov.br/portal-servicos-frontend/login"));
  ok("explica o porquê", tela.includes("exige cadastro"));
  ok("avisa que a SETOP não está instalada", tela.includes("ainda não está instalada"));

  console.log("\n--- 3) guarda: sem arquivo ---");
  await limparToasts();
  await page.click('[data-acao="importar-sicor"]');
  await page.waitForTimeout(700);
  ok("recusa sem arquivo", /Escolha o arquivo/.test(await ultimoToast()));

  console.log("\n--- 4) instala a SETOP do pacote ---");
  await page.selectOption("#setop-regiao", "Triangulo");
  await page.selectOption("#setop-regime", "desonerada");
  await page.click('[data-acao="carregar-setop"]');
  await page.waitForFunction(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP"); return b && b.total > 3000;
  }, { timeout: 60000 });
  const base = await page.evaluate(() => Bases.lista().find(x => x.fonte === "SETOP"));
  ok("3.977 itens", base.total === 3977, "total=" + base.total);
  ok("o botão legado grava sel", base.sel && base.sel.regiao === "Triangulo" && base.sel.regime === "desonerada");
  ok("ainda sem procedência", base.regioesMeta === null);
  const antes = await page.evaluate(() => {
    const it = Bases.obter("SETOP", "ED-50392");     // ⚠ obter(fonte, codigo), nessa ordem
    return { central: it.precos.Central, tri: it.precos.Triangulo };
  });
  await page.waitForTimeout(1500);   // o app reabre Tabelas sozinho e limparia o input de arquivo

  console.log("\n--- 5) guarda: competência fora do formato ---");
  await abrirTabelas();
  await page.selectOption("#sicor-regiao", "Central");
  await page.fill("#sicor-comp", "abril/26");
  await page.setInputFiles("#sicor-file", CSV);
  await limparToasts();
  await page.click('[data-acao="importar-sicor"]');
  await page.waitForTimeout(700);
  ok("recusa competência inválida", /AAAA-MM/.test(await ultimoToast()));

  console.log("\n--- 6) conferência antes de aplicar ---");
  await page.fill("#sicor-comp", "2026-04");
  await page.selectOption("#sicor-regime", "desonerada");
  await page.click('[data-acao="importar-sicor"]');
  await page.waitForFunction(() => /Confira antes de atualizar/.test(document.body.textContent), { timeout: 20000 });
  const prev = await page.innerText(".modal");
  // 46 linhas: 1 cabeçalho + 40 reais + 3 novos + 1 total-de-seção + 1 cabeçalho repetido.
  // O conversor larga o cabeçalho de cima e o "TOTAL DA SECAO" (sem código E sem custo) => 44.
  // Dessas, 43 têm preço; o cabeçalho repetido entra com 0 e quem o barra é a mescla.
  ok("conta as linhas", /44 linhas/.test(prev) && /43 com preço/.test(prev));
  ok("mostra o destino", /Central/.test(prev) && /desonerada/.test(prev) && /2026-04/.test(prev));
  ok("amostra com código real", /ED-5039/.test(prev));
  ok("avisa sobre colunas lado a lado", /seis regiões em colunas lado a lado/.test(prev));

  console.log("\n--- 7) aplica ---");
  await limparToasts();
  await page.click('.modal button:has-text("Confirmar e atualizar")');
  await page.waitForFunction(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP");
    return b && b.regioesMeta && b.regioesMeta.Central;
  }, { timeout: 20000 });
  const toast = await ultimoToast();
  console.log("       " + toast);
  ok("toast diz região e competência", /Central/.test(toast) && /2026-04/.test(toast), toast);
  ok("40 atualizados, 3 novos", /40 atualizados/.test(toast) && /3 novos/.test(toast), toast);
  ok("lixo ignorado, no singular", /1 linha sem preço ignorada/.test(toast), toast);

  const dep = await page.evaluate(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP");
    const it = Bases.obter("SETOP", "ED-50392"), novo = Bases.obter("SETOP", "SIC-NOVO-1");
    return { total: b.total, meta: b.regioesMeta, sel: b.sel,
      central: it.precos.Central, tri: it.precos.Triangulo, cu: it.custoUnitario,
      novoCusto: novo && novo.custoUnitario, novoTri: novo && novo.precos.Triangulo,
      cabRepetido: Bases.obter("SETOP", "CODIGO"),
      totalSecao: Bases.extras().find(x => x.fonte === "SETOP")
        .itens.filter(i => /TOTAL DA SECAO/i.test(i.descricao || "")).length };
  });
  ok("cabeçalho repetido NÃO entrou", dep.cabRepetido === null);
  ok('"TOTAL DA SECAO" NÃO entrou', dep.totalSecao === 0);
  ok("3.977 → 3.980", dep.total === 3980, "total=" + dep.total);
  ok("Central atualizada", dep.central === 1.37, "central=" + dep.central);
  ok("Triângulo PRESERVADA", dep.tri === antes.tri, "tri=" + dep.tri + " antes=" + antes.tri);
  ok("custoUnitario projetado na Central", dep.cu === 1.37);
  ok("item novo entrou", dep.novoCusto === 1234.56);
  ok("item novo não tem Triângulo", dep.novoTri === undefined);
  ok("procedência gravada", dep.meta.Central.competencia === "2026-04" && dep.meta.Central.regime === "desonerada");

  console.log("\n--- 8) a tela mostra a procedência ---");
  await abrirTabelas();
  const t8 = await page.innerText(".modal");
  ok("na linha da tabela", /atualizado por você: Central 2026-04/.test(t8));
  ok("no bloco", /Central · 2026-04 · desonerada/.test(t8));

  console.log("\n--- 9) regime não se mistura ---");
  await page.selectOption("#sicor-regiao", "Sul");
  await page.selectOption("#sicor-regime", "onerada");
  await page.fill("#sicor-comp", "2026-04");
  await page.setInputFiles("#sicor-file", CSV);
  await page.click('[data-acao="importar-sicor"]');
  await page.waitForFunction(() => /Confira antes de atualizar/.test(document.body.textContent), { timeout: 20000 });
  await page.click('.modal button:has-text("Confirmar e atualizar")');
  await page.waitForFunction(() => /Regime diferente/.test(document.body.textContent), { timeout: 20000 });
  ok("barrou a mistura", /Regime diferente do que está instalado/.test(await page.innerText(".modal")));
  const antesCancel = await page.evaluate(() => Bases.lista().find(x => x.fonte === "SETOP").total);
  await page.click('.modal button:has-text("Cancelar")');
  await page.waitForTimeout(500);
  const posCancel = await page.evaluate(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP");
    return { total: b.total, regime: b.sel.regime, temSul: !!(b.regioesMeta && b.regioesMeta.Sul) };
  });
  ok("cancelar não mexeu na base",
    posCancel.total === antesCancel && posCancel.regime === "desonerada" && !posCancel.temSul);

  console.log("\n--- 10) sobrevive ao reload ---");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.Bases && document.querySelector("#sidebar"), { timeout: 40000 });
  await page.waitForFunction(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP"); return b && b.total > 3000;
  }, { timeout: 40000 });
  const pos = await page.evaluate(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP"), it = Bases.obter("SETOP", "ED-50392");
    return { total: b.total, meta: b.regioesMeta, central: it.precos.Central, tri: it.precos.Triangulo };
  });
  ok("base sobreviveu", pos.total === 3980);
  ok("procedência sobreviveu", pos.meta && pos.meta.Central && pos.meta.Central.competencia === "2026-04");
  ok("preços das duas regiões sobreviveram", pos.central === 1.37 && pos.tri === antes.tri);

  console.log("\n--- 11) reinstalar o pacote apaga a procedência ---");
  await abrirTabelas();
  await page.selectOption("#setop-regiao", "Triangulo");
  await page.click('[data-acao="carregar-setop"]');
  await page.waitForFunction(() => {
    const b = Bases.lista().find(x => x.fonte === "SETOP"); return b && b.total === 3977;
  }, { timeout: 60000 });
  const limpo = await page.evaluate(() => Bases.lista().find(x => x.fonte === "SETOP"));
  ok("voltou ao pacote", limpo.total === 3977);
  ok("procedência apagada (a tela não pode mentir)", limpo.regioesMeta === null);
  await abrirTabelas();
  ok("não anuncia mais a competência velha", !/atualizado por você/.test(await page.innerText(".modal")));

  console.log("\n--- erros de runtime ---");
  const graves = erros.filter(e => !/favicon|manifest|sw\.js|Failed to load resource/i.test(e));
  if (graves.length) { graves.slice(0, 8).forEach(e => console.log("  ! " + e)); falhas += graves.length; }
  else console.log("  nenhum");

  await browser.close();
  srv.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + (falhas ? falhas + " FALHAS" : "TUDO OK"));
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error("EXPLODIU: " + (e && e.stack || e)); process.exit(1); });
