# Propostas, pacotes de orçamento e o modelo RA Engenharia

Esta pasta guarda propostas comerciais montadas fora do app (HTML + PDF + Excel),
o **pacote de orçamento** (`*.orcapro.json`) que sobe o mesmo orçamento para o
OrçaPRO já cadastrado, e o **modelo de proposta** padrão da RA Engenharia
(`modelo-proposta-ra-engenharia.json`).

## 1. Modelo de proposta RA Engenharia (o template)

Arquivo: `modelo-proposta-ra-engenharia.json` (gerado por `gerar-modelo-ra.py`).
É um modelo do motor "Modelos de proposta" do app, com:

- capa com as curvas da marca, logo, cliente, número e data da proposta;
- "Quem somos" e "O que fazemos" (cartões);
- escopo lido do orçamento (Incluso / Não incluso dos Dados do orçamento);
- investimento por etapa, condições de pagamento, condições gerais, aceite;
- página de contato com **links clicáveis no PDF**: telefone, WhatsApp, e-mail,
  site, Instagram, e os botões "Falar no WhatsApp" e "Abrir a planilha desta
  proposta (Excel)";
- rodapé com os contatos da empresa em todas as páginas internas, também clicável.

### Como trazer o modelo para o app

- **Link:** `https://ra-engenharia.github.io/orcapro/app/?importar=../propostas/modelo-proposta-ra-engenharia.json`
- **Arquivo:** Orçamentos › Modelos de proposta › "Trazer de um arquivo", ou
  `💾 Backup › Restaurar` (o mesmo campo reconhece o modelo).

Depois ele aparece em `Gerar Proposta › Com qual desenho?`. Para outro usuário
do sistema usar, basta enviar o `.json` ou o link acima; ele edita textos, cores e
páginas em Modelos de proposta.

### O que preencher uma vez em ⚙ Empresa

Razão social, CNPJ, responsável técnico, endereço, **telefone, WhatsApp
(só números, com DDD), e-mail, site e Instagram** e o **logo** (PNG). O modelo
completa os contatos da página "Fale conosco" e do rodapé a partir daí.

### O botão da planilha

Em `Dados do orçamento › Link da planilha desta proposta` cole a URL do Excel.
Sem URL, o botão não aparece. Para propostas geradas por esta pasta, o gerador
publica o `.xlsx` no GitHub Pages e já grava o link no pacote.

### Onde o motor ganhou recursos (app/js/proptpl.js)

- estilo: `corDestaque2` (2ª cor), `ornamento: "curvas"`, `rodape: "contatos"`,
  `fundoInternas: "claro"`;
- blocos: novo `servicos` (O que fazemos); `capa.mostrarNumero`;
  `texto.usarComercial`; `contato` com whatsapp, e-mail, endereço, botões e
  `mostrarFoto`;
- links viram `<a href>` no HTML, e o navegador os guarda no PDF;
- `PropTpl.css(formato)` fixa o tamanho do papel (A4 ou vertical). Antes, uma
  máquina com papel padrão Carta imprimia cada página A4 em duas;
- a escala de título/texto do editor agora multiplica o tamanho de cada bloco
  (antes igualava todos os títulos ao tamanho do texto).

Também há o modelo de fábrica neutro "Engenharia moderno" com o mesmo desenho,
sem os textos da RA.

### O logo dentro do modelo

O logo padrão vem de ⚙ Empresa (vale para todos os documentos). O modelo pode
carregar um **logo próprio**, e aí ele vence — é o que faz o modelo chegar
montado na conta de quem recebe, em vez de imprimir `[LOGO]` na capa.

- O modelo da RA já vem com o logo dentro (`propostas/logo-ra-engenharia.png`,
  30 KB em base64).
- Para trocar: Modelos de proposta › o modelo › **Cor e letra** › *Enviar um
  logo para este modelo*. O botão ao lado devolve o modelo ao logo do ⚙ Empresa.
- A imagem é reduzida para 900 px de largura antes de ser gravada (o registro
  mora no `localStorage`), e SVG entra pelo seletor e sai PNG.
- **Logo nas páginas escuras**: capa, "quem somos" e encerramento têm fundo
  escuro, e um logo azul-marinho some neles sem dar erro. O modelo da RA usa
  *Deixar branco* (versão negativa). Há também *pastilha branca*, que preserva
  as cores.

### O mesmo logo em ⚙ Empresa

O logo do modelo vale só para a proposta feita com ele. **Laudo, relatórios,
Excel e a proposta padrão leem o de ⚙ Empresa** — sem ele, metade dos
documentos sai marcada e a outra metade com `[LOGO]`.

Três caminhos:

1. **Ao trazer o modelo**, se a conta ainda não tem logo, a tela de importação
   oferece usar o do modelo também em ⚙ Empresa (marcado por padrão, porque não
   há nada para sobrescrever). Se já houver um logo, nada é trocado em silêncio.
2. **Modelos de proposta › Cor e letra › "Usar também em ⚙ Empresa"**. Com um
   logo diferente já cadastrado, o app mostra o antes/depois e pede confirmação:
   trocar ali muda todos os documentos da conta.
3. **À mão:** ⚙ Empresa › Logo › escolher `propostas/logo-ra-engenharia.png`.

## Montar o modelo com a IA

Em Modelos de proposta, o botão **Montar com a IA** faz oito perguntas sobre a
empresa (o que faz, o que vende, para quem, tom, o que não pode faltar,
diferenciais, quantas fotos, onde o cliente lê) e monta a estrutura do
documento.

- **Com IA disponível** (licença ativa e internet), o servidor escreve os
  textos. A resposta passa por conferência: página de tipo desconhecido é
  descartada com aviso, e a página de Investimento é acrescentada se faltar —
  é ela que leva os preços.
- **Sem IA** (sem licença, sem internet, servidor fora), o modelo é montado
  **no próprio computador** a partir das respostas, com as palavras que você
  escreveu. O botão nunca termina sem entregar um modelo.
- **Nada é gravado sem você ver**: a tela de conferência mostra as páginas na
  ordem, diz de onde veio a estrutura e o que foi descartado.
- A IA não inventa fato sobre a empresa: o que ninguém respondeu vira
  `[preencher: …]`, listado depois na tela "agora anexe cada coisa".
- Preço, prazo, pagamento e garantia não são perguntados: vêm do orçamento.

Quem responde "nenhuma foto por enquanto" recebe um modelo que já sai completo:
as páginas cheias usam o fundo da marca com os traços, em vez do retângulo
listrado de "falta foto".

## Cronograma, validade e o funil comercial

### Cronograma na proposta

Novo bloco **Cronograma**: as etapas distribuídas em períodos, com barras. A
conta é `Orcamento.cronograma()` — a mesma da aba Cronograma e do Excel, para
não existir um segundo cronograma da mesma obra.

- *Mostrar o valor previsto em cada mês* liga os valores por período.
- *Quantos períodos mostrar* permite à proposta usar outra régua sem mexer no
  orçamento: `6` com o rótulo `Semana` vira S1…S6, útil em obra de poucas
  semanas (o orçamento traz 1 mês e a tabela sairia com uma coluna só).

### Validade com data

O campo **Validade (dias)** (Dados do orçamento) é o que permite calcular a
data. A frase antiga continua, para condições fora do comum, e é usada quando
os dias forem zero.

- A contagem parte do **dia do envio** quando ele existe; antes disso, de hoje.
  Reimprimir em outubro uma proposta enviada em setembro não renova o prazo.
- O documento imprime "Válida até 23/09/2026", com "vence em X dias" nos
  últimos três dias e "VENCIDA" depois.

### Enviada, aceita, recusada

Na barra do editor, ao lado de *Gerar Proposta*:

- **Marcar como enviada** — data e canal (WhatsApp, e-mail, em mãos, reunião).
- **Resposta do cliente** — aceita, recusada ou ainda sem resposta, com motivo.
  O histórico é append-only: reenviar registra o novo envio e limpa a resposta
  anterior, porque o que está com o cliente passou a ser a versão nova.

Isso conserta o painel: a **conversão** passa a ser *aceitas ÷ enviadas ao
cliente*. Antes ela media a aprovação interna do gestor — quem não usa
aprovação interna via 0% para sempre, e quem usa via 100% sem nenhuma venda.
A carteira também passa a avisar **propostas enviadas sem resposta** há mais
de 15 dias, que é onde costuma estar o dinheiro na mesa.

## Mandar pelo WhatsApp, cobrar e padronizar

- **WhatsApp em um clique** (barra do editor): abre a conversa com o cliente e
  o texto pronto — nome, número da proposta, valor, validade e prazo. O número
  sai do cadastro do cliente ou do contato do orçamento. *O PDF você anexa na
  conversa*: `wa.me` não aceita anexo por link, e prometer isso seria mentira.
  Ao abrir, o app oferece marcar a proposta como enviada hoje.
- **Cobrar quem sumiu**: passados 5 dias do envio sem resposta, o mesmo botão
  vira *Cobrar (Nd)* e o texto muda para uma cobrança educada, que menciona a
  validade (ou se oferece para revalidar, quando já venceu).
- **Padrão comercial da empresa** (Dados do orçamento): *Salvar como padrão*
  guarda pagamento, prazo, validade, garantia, incluso e não incluso; *Usar o
  padrão* preenche o formulário de qualquer outro orçamento. Ele **preenche e
  não grava** — quem confere e salva é você, para não apagar em silêncio um
  texto ajustado para aquele cliente.
- **Legenda por foto** na galeria: "Residência em Uberlândia — 320 m² — 2025"
  vende; três fotos mudas o cliente folheia sem parar.
- **Carimbo VENCIDA**: o PDF sai do computador e vive por conta própria. Com
  *Carimbar VENCIDA quando a validade passar* (Cor e letra), quem recebe o
  arquivo velho vê na hora que aquele preço expirou.

## Adicionais opcionais e o aceite pelo WhatsApp

### Etapa como "adicional"

Na planilha, cada etapa tem um botão que a marca como **adicional opcional**.
A etapa marcada ganha o selo *adicional* e sai do valor fechado da proposta:

- o **total do orçamento não muda** — Excel, medição, cronograma e curva ABC
  continuam vendo a obra inteira. Quem separa é só o papel que vai ao cliente;
- na proposta, os adicionais saem num bloco à parte, com subtotal próprio e o
  aviso de que **não estão incluídos no valor total**;
- desmarcar devolve a etapa ao valor fechado, sem perder nada.

Serve para o "e se eu quiser também…": o cliente vê o preço do extra sem que
ele infle o valor que ele está comparando com o concorrente.

### Aceite pelo WhatsApp

O bloco de assinatura pode trazer o botão **Aceitar esta proposta pelo
WhatsApp** (Modelos de proposta › a página de aceite). No PDF ele é um link
`wa.me` para o número da empresa, com o texto já escrito ("Aceito a proposta
PC-…"). Não substitui a assinatura — fica ao lado dela, para o cliente que
responde do celular e não vai imprimir nada.

⚠ O aceite online com registro no sistema (portal do cliente, link rastreado)
depende de servidor, que não vive neste repositório.

## O "Montar com a IA" e o servidor

O botão sempre chamou `POST {iaBackend}/ia/modelo-proposta`, e **o servidor
responde 404: essa rota nunca foi implementada no VPS**. Por isso ele nunca
funcionou de verdade — no app publicado ele funciona hoje porque monta a
estrutura no próprio navegador quando a IA não responde.

Para ganhar os textos escritos pela IA, falta subir a rota no servidor.
`propostas/servidor-ia-modelo-proposta.js` traz ela pronta: o contrato que o
app espera, o prompt com as regras (não inventar fato, não escrever preço nem
prazo), a limpeza da resposta e o cuidado de nunca devolver 500 — um 500 vira
"erro de rede" na tela e manda o usuário procurar defeito na internet dele.

## 2. Como subir um orçamento para o OrçaPRO

Três caminhos, todos caem na mesma rotina do app (`app/js/pacote.js`):

1. **Link.** `https://ra-engenharia.github.io/orcapro/app/?importar=../propostas/<arquivo>.orcapro.json`
   No OrçaPRO instalado no computador use a URL completa do GitHub Pages.
2. **Arquivo.** `💾 Backup › Restaurar de um backup (.json)`.
3. **Console.** `Pacote.aplicar(dump)`.

Regras: mescla por `id`, o mais novo vence, nada é apagado, reimportar não
duplica, só `clientes` e `obras` entram além do orçamento, item sem preço ou
quantidade reprova.

## 3. Gerar proposta, pacote e Excel

`orcapro_pacote.py` é a biblioteca; `gerar-proposta-my-engenharia.py` é o exemplo
completo (HTML da proposta + pacote + `.xlsx`). Na raiz do repositório:

```
python3 propostas/gerar-proposta-my-engenharia.py
python3 propostas/gerar-modelo-ra.py
```

Preços de referência saem de `app/data/sinapi-<UF>-analitico.json` (parcela
`custoMO`), nunca de números inventados.
