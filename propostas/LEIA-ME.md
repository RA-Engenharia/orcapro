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
