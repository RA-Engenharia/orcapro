# OrçaPRO — notas para quem for mexer no código

Orçamento de obras com bases oficiais de preço. PWA **estático**: JavaScript
puro em módulos IIFE (`(function(global){...})(window)`), **sem build, sem
bundler, sem `package.json`**. Os arquivos em `app/js/*.js` são carregados
por `<script>` na ordem de `app/index.html`.

Estilo do código: `var` (não `let`/`const`), funções nomeadas, e comentários
que explicam **por que**, não o quê — em particular marcando com `⚠` as
armadilhas que já custaram dado de cliente. Vale a pena ler esses blocos
antes de mexer: quase todo um deles é cicatriz de um defeito real.

## Convenção de commit

Toda entrega bate a versão em **três lugares ao mesmo tempo**:

- `app/js/config.js` → `versao: "1.1.X"`
- `app/sw.js` → `var CACHE = 'orcapro-app-v1.1.X'` (sem isto o PWA serve o cache velho)
- `download/latest.json` → `versao` + `notas` (as notas vão sem acento, em prosa corrida)

Mensagem no padrão: `PWA e latest.json na v1.1.X — <assunto>`.

## Arquitetura das bases de preço

- **SINAPI** vive no módulo `Sinapi` (índice próprio, não duplica).
- **Bases extras** (SICRO, SEINFRA, SETOP, ORSE, SUDECAP, GOINFRA, PROPRIA…)
  vivem em `app/js/bases.js`, no array `EXTRA`. Busca unificada nas ativas.
- `app/js/basescat.js` é o **catálogo**: qual arquivo abrir, quais eixos
  (região, regime) cada banco tem, competência do pacote.
- `app/js/basesui.js` + `UI.renderTabelas` (`app/js/ui.js`) desenham a tela.
- Persistência em IndexedDB via `Store.salvarBasesExtras`.

**Bases regionalizadas** (SETOP, GOINFRA) guardam o preço em
`item.precos{Regiao: valor}` e projetam `custoUnitario` a partir da região
escolhida. Importar essas bases como lista plana **apaga as regiões todas** —
foi o que motivou `Bases.mesclarPrecosRegiao`.

Três invariantes que `bases.js` defende e não devem ser afrouxadas:

1. `ativaUsuario` (escolha, vai para o disco) **não é** `inativaPorUf`
   (circunstância da sessão, nunca gravada). Misturar as duas apagava base
   de cliente que abrisse o app em outra UF.
2. `persistir()` **recusa** gravação que zere uma base (`perdaDeBase`) ou que
   derrube muitos itens de uma vez (`quedaBrusca`). Só passa com
   `permitirRemocao: true`, e só quando o usuário confirmou na tela.
3. Em `registrar()`, `regioesMeta` segue a regra da **chave presente**, não do
   valor: quem troca o acervo inteiro manda `regioesMeta: null` de propósito.

## SETOP × SICOR-MG (v1.1.204)

A SETOP é o **único banco cuja fonte fechou a porta**. O pacote traz
`08/2023`, a última competência publicada em download aberto; de 2024 em
diante Minas migrou a tabela para o **SICOR-MG**, no portal do DER-MG, atrás
de login — cadastro gratuito em
<https://portal.der.mg.gov.br/portal-servicos-frontend/login>.

Coletor anônimo não passa. **Guardar credencial do cliente foi descartado** e
não deve ser reaberto sem decisão explícita: o app é estático e o navegador
não faz fetch cross-origin no portal de qualquer jeito; guardar senha gov.br
de cliente é responsabilidade que ninguém pediu; e sessão/captcha quebrariam
o coletor em silêncio.

Solução em produção: **o usuário traz a planilha que ele baixou logado**.
Em *Tabelas de preço* → bloco *"Atualizar a SETOP-MG (SICOR)"*. Ele declara
região + regime + competência, confere uma amostra, e o app mescla **só
aquela região**.

Código: `Bases.mesclarPrecosRegiao` / `projetarRegiao` / `mesclarRegiao`
(puras, testáveis em Node) e `App.importarSicor` / `_preverSicor` /
`_aplicarSicor`.

Comportamentos que existem por um motivo — **não "simplificar"**:

- **Regime não se mistura.** Desonerada e onerada são dois conjuntos de preço
  para os mesmos códigos; a mescla para e exige substituição confirmada.
- **Custo 0 ou inválido não grava.** Total de seção e cabeçalho repetido
  zerariam preço bom que já estava lá. Entram no contador `semCusto`.
- **Item sem preço na região vai a zero, visível.** Manter o valor antigo
  deixaria preço de outra região passando por este, sem nada na tela.
- **Conferência antes de aplicar.** O detector *escolhe* uma coluna de preço;
  se a publicação vier com as seis regiões lado a lado ele não tem como saber
  qual pegou.
- **`regioesMeta` (procedência por região).** Central de 2026 + Norte de 2023
  são duas competências; chamar o conjunto de "2026" faz orçar o Norte com
  preço velho.

**Em aberto:** ninguém abriu a planilha real do SICOR ainda — o egress do
ambiente bloqueia `der.mg.gov.br`. O desenho assume **um arquivo por região**,
que é como MG sempre publicou. Se vier com as seis regiões em colunas lado a
lado, falta um seletor de coluna; a tela de conferência é o que revela o caso.

## Rodar e verificar

Não há suíte de testes no repositório. As funções puras de `bases.js` têm
`module.exports` e rodam direto no Node.

Para dirigir o app de verdade — sobe o próprio servidor, gera a planilha de
teste a partir da base instalada e limpa tudo no fim. Só precisa do
Playwright (local ou global), que **não** é dependência do projeto:

```bash
node tools/e2e/setop-sicor.js
```

Armadilhas que custam tempo se você descobrir sozinho:

- Chromium do ambiente fica em `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (o caminho sem sufixo `-1194` **não existe**).
- Boot novo abre o **portão do teste grátis** (`#tg-nome`, `#tg-fone`,
  `#tg-email`, `#tg-ok`) e entra direto no app — **não há tela de login** depois dele.
- O **tour de onboarding** (`#tour-overlay`) engole cliques e reabre se você
  só fechar. Marque `localStorage['orcapro:tour:v1']` **antes** do primeiro
  script rodar (`addInitScript`).
- **Toasts empilham**: `querySelector('.toast')` devolve o mais **velho**.
  Leia o último e limpe `#toasts` antes de cada ação que você for verificar.
- `Bases.obter(fonte, codigo)` — nessa ordem. Invertido devolve `null` calado.
- `carregarSetop`/`carregarInclusa` reabrem *Tabelas* sozinhos no `.then()`,
  o que **limpa o `<input type=file>`** que você acabou de preencher. Espere
  esse re-render assentar antes de mexer nos campos.

## Trabalho em andamento

> Instantâneo desta sessão — pode ser podado quando entrar na `main`.

Branch `claude/composicoes-serie-cadastro-sg2g1d`, dois commits sobre a
`main`: `f0c835b` (a funcionalidade) e `96d8f5b` (concordância nos avisos).
Validado no navegador de ponta a ponta, 44 verificações, zero erro de
runtime. **Sem PR aberto** — não foi pedido.
