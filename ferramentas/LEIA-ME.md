# Ferramentas que rodam FORA deste repositório

O que está aqui não é código do app: são scripts para rodar no repositório do
**app instalável** (`orcapro-app`, o que tem `tools/`, `server/` e `instalador/`),
que é onde vivem os geradores de base e o empacotador.

## patch-analitico-regime.js — o analítico nos dois regimes

### O problema

A SINAPI tem dois regimes de encargo social, e a Referência mensal da CAIXA
traz os dois no mesmo arquivo:

| abas | regime | quem lia |
|---|---|---|
| `CSD` / `ISD` | **sem** desoneração (onerado) | os dois geradores |
| `CCD` / `ICD` | **com** desoneração (desonerado) | só o sintético |
| `Analítico` | estrutura: composição → insumo + coeficiente. **Nacional, sem regime** | os dois |

`gerar-sintetico-sinapi.js` ganhou `--regime` na v1.1.204 — por isso existe
`sinapi-<UF>-<COMP>-desonerada.json` e dá para orçar no regime desonerado.

`gerar-analitico-sinapi.js` **não ganhou**: lê `wb.Sheets['ISD']` e
`wb.Sheets['CSD']` cravados e grava sempre `sinapi-<UF>-analitico.json`.
Resultado: existia preço desonerado e **nenhum detalhamento desonerado**, e o
app servia o desdobramento do regime oposto sem avisar.

No PA, composição **104658** (piso podotátil): **187,05** desonerada,
**189,69** onerada. A planilha mostrava a primeira e o modal de insumos a
segunda.

### Não precisa de outro download

A desoneração muda o **encargo social da hora** de mão de obra, não quantas
horas entram no serviço. Por isso o coeficiente é o mesmo nos dois regimes e a
aba `Analítico` serve aos dois. Conferido com o dado real de 2026-06/PA,
recompondo a 104658 com os coeficientes nacionais:

```
             coef        onerado   desonerado
SERVENTE     1,2790        26,88     25,66
PEDREIRO     0,6390        32,75     31,10
PISO         6,4375        18,31     18,31   (material: idêntico)
REJUNTE      0,2400         5,57      5,57
ARGAMASSA    8,6200         1,76      1,76

total       189,69  = o analítico publicado, exato
total       187,07  ~ os 187,05 oficiais da CCD
```

Os 2 centavos são arredondamento de subcomposição (SERVENTE e PEDREIRO são
composições, arredondadas a 2 casas antes de multiplicar pelo coeficiente) —
a mesma característica que o gerador já documenta no onerado, onde ele soma
os insumos em vez de usar o custo oficial da CSD.

### Como aplicar

Na **raiz do repositório do app** (a pasta com `tools/` e `data/`):

```
node patch-analitico-regime.js
```

- confere as 12 âncoras **antes** de trocar qualquer uma. Se o seu arquivo
  estiver diferente do que eu li, ele **não mexe em nada** e diz o que não
  bateu — meia aplicação deixaria sem compilar o script que produz o dado de
  27 estados;
- guarda o original em `tools/gerar-analitico-sinapi.js.bak`;
- rodar de novo não faz nada (detecta que já foi aplicado).

Depois:

```
node tools/gerar-analitico-sinapi.js ALL --mes 2026-06 --regime desonerada --gzip
```

Sem `--regime`, **nada muda**: continua saindo `sinapi-<UF>-analitico.json`
onerado, com o mesmo conteúdo de hoje. O sufixo `-desonerada` só aparece no
regime não padrão, exatamente como o sintético já faz.

Por fim, publicar os `.json` (e `.json.gz`) em `/analitico/` no servidor.

### O que o patch muda

1. `REGIMES` (o mesmo mapa do sintético) e `conferirRegime()`, que lê
   "COM/SEM DESONERAÇÃO" no cabeçalho da planilha antes de gerar. Foi essa
   conferência que pegou o flag invertido da v1.1.204 — sigla parecida,
   regime oposto;
2. `lerISD`/`lerCSD`/`gerarUF` passam a receber o regime e abrir a aba dele;
3. o pacote passa a **declarar** `desonerado: true|false`;
4. `--regime` na linha de comando e o sufixo no nome do arquivo.

### O lado do app (já publicado, 1.2.33)

- procura `sinapi-<UF>-<COMP>-desonerada-analitico.json` quando os **itens**
  do orçamento vêm da base desonerada;
- **nunca** atravessa regime na lista de alternativas: sem o desonerado
  publicado, ele diz que o detalhamento desse regime não existe, em vez de
  abrir o do outro;
- `Analitico` recusa carregar arquivo que se declara do regime que não foi
  pedido (é para isso que serve o campo novo);
- o item passa a gravar o regime da base de onde veio, então o orçamento sabe
  dizer se ficou **misto** — que a Lei 14.133 manda declarar.
