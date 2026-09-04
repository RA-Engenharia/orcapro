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

## derivar-analitico-desonerado.py — o analítico desonerado, sem o .xlsx

O caminho oficial acima roda no Windows e depende da Referência baixada. Este
script produz **o mesmo arquivo** a partir de dados que já circulam:

| o que | de onde |
|---|---|
| estrutura + coeficientes | `app/data/sinapi-<UF>-analitico.json` (o onerado) |
| preços unitários | `sinapi-<UF>-2026-06-desonerada.json` (o sintético do servidor) |

Ele repete as duas regras do gerador oficial: a **atribuição São Paulo**
(insumo sem coleta na UF usa o preço de SP, com `precoAtribuidoSP`) e a
**repartição MO/MAT/EQ recursiva** (sub-composição é quebrada nas razões dela
própria; hora-homem é 100 % MO e não é recursada).

### Por que dá para confiar

```
python3 ferramentas/derivar-analitico-desonerado.py --conferir PA
```

Roda a mesma derivação com os preços **onerados** e compara com o analítico
onerado publicado, que veio do `.xlsx`. Em PA, SP, BA e RS:

```
custoUnitario  10454/10454  (100,00%)   pior R$ 0,00
custoMO        10454/10454  (100,00%)   pior R$ 0,00
custoMAT / custoEQ                      100,00%
```

MG dá 99,98 % (duas composições com 1 centavo de arredondamento). Ou seja: a
derivação **reproduz o gerador oficial**, não aproxima.

E o efeito do regime confere com o oficial: comparando o delta do arquivo
derivado com o delta `CCD − CSD` dos dois sintéticos da CAIXA, **97,5 % (MG) e
98,2 % (PA)** das composições ficam dentro de 2 centavos, com mediana de
diferença **0,0000**.

### A divergência que NÃO é defeito

Conferido contra o custo oficial da CCD, o arquivo derivado bate em ~60 % das
composições dentro de 2 centavos. Parece pouco — até medir o **arquivo oficial
onerado contra a CSD oficial**: 61,2 % (MG) e 60,0 % (PA), pior caso R$ 0,15.
É a mesma faixa.

O motivo está escrito no próprio gerador: o `custoUnitario` da composição é a
**soma dos insumos**, não o custo arredondado da CSD/CCD — de propósito, porque
o custo oficial diverge quando algum insumo está sem preço. O derivado herda
essa característica porque usa o mesmo método.

### Onde os arquivos ficam

Os 27 estados estão em `app/data/sinapi-<UF>-desonerada-analitico.json.gz`
(~0,9 MB cada, 26 MB no total). O app tenta o `.json.gz` antes do `.json`, e é
esse o arquivo que ele busca.

O OrçaPRO **instalado** não recebe `data/` pelo pacote de atualização — é o que
preserva a base do cliente. Por isso a 1.2.35 deu ao app um **espelho público**:

    local (data/)  →  servidor (/analitico/)  →  espelho (CONFIG.appWebUrl + /data/)

O espelho entra **sempre por último**, então não troca nada que já funciona: só
cobre o buraco de quando o servidor ainda não recebeu uma competência — ou um
regime inteiro, como foi o caso do desonerado, que nunca existiu lá. Ele também
**não atravessa regime**: o nome é montado com o mesmo `deso` do resto da lista.

O analítico é dado oficial e estático, e é só o desdobramento em insumos —
preço continua vindo da base que a pessoa instalou. Subir os arquivos para
`/analitico/` no servidor continua valendo (é mais rápido para o cliente e
funciona sem internet aberta), mas deixou de ser condição para o recurso
existir.

### A porta de entrada (1.2.38)

O regime estava certo no modal, mas o **botão** não aparecia: `SINAPI_DES` entrou
no multi-base como fonte separada, e sete lugares perguntavam `=== "SINAPI"` para
decidir "este item tem analítico oficial?" — planilha, Excel, laudo, relatório,
reparo de fontes e a composição própria. Todos diziam *não* ao desonerado. Agora
a pergunta é uma só, `Orcamento.ehSinapi(fonte)`, verdadeira para os dois regimes;
`baseFonte` continua guardando `SINAPI_DES`, que põe a etiqueta **desonerado** sob
o código e escreve "SINAPI 06/2026/PA (desonerado)" nas bases usadas. Também caiu
um atalho `if (Analitico.carregado) abrir()` que rodava antes da troca de regime.

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
