# Propostas e pacotes de orçamento

Esta pasta guarda propostas comerciais montadas fora do app (HTML + PDF) e o
**pacote de orçamento** (`*.orcapro.json`) que sobe o mesmo orçamento para o
OrçaPRO já cadastrado: etapas, itens, BDI, condições comerciais, cliente e obra.

## Como subir um orçamento para o OrçaPRO

Três caminhos, todos caem na mesma rotina do app (`app/js/pacote.js`):

1. **Link (subir direto).** Abra o app com o parâmetro `?importar=` apontando
   para o JSON publicado. Exemplo com o pacote da MY Engenharia:

   ```
   https://ra-engenharia.github.io/orcapro/app/?importar=../propostas/2026-09-02-MY-Engenharia-mao-de-obra-PC-2026-0902-01.orcapro.json
   ```

   No OrçaPRO instalado no computador (localhost) use a URL completa do GitHub
   Pages no lugar do caminho relativo. O app baixa o pacote, mostra o que vem
   (orçamento, total, cliente, obra) e pede confirmação antes de gravar.
   Se você ainda não estiver logado, ele espera o login e continua.

2. **Arquivo.** No app, `💾 Backup › Restaurar de um backup (.json)` e escolha
   o `*.orcapro.json`. O app reconhece o pacote e abre a mesma confirmação.

3. **Console.** `Pacote.aplicar(dump)` com o JSON já carregado.

### Regras de mesclagem

- Mescla por `id`; o registro mais novo (`atualizadoEm`) vence. Nada é apagado.
- Reimportar o mesmo arquivo não duplica nada (os ids são determinísticos).
- Gerar o pacote de novo produz um carimbo mais novo: ao reimportar, ele
  **substitui** o que estiver no app com o mesmo id, inclusive edições feitas
  lá. Edite no gerador ou no app, não nos dois.
- Um pacote só pode trazer `clientes` e `obras` além do orçamento. Qualquer
  outra entidade reprova o arquivo.
- Item sem preço ou sem quantidade reprova o arquivo (zero não é preço).

## Gerar um pacote

`orcapro_pacote.py` é a biblioteca; `gerar-proposta-my-engenharia.py` é o
exemplo completo (gera HTML da proposta + pacote). Na raiz do repositório:

```
python3 propostas/gerar-proposta-my-engenharia.py
```

Para um orçamento novo, copie o exemplo e troque cliente, obra, itens e preços.
Os preços de referência saem de `app/data/sinapi-<UF>-analitico.json`
(parcela `custoMO` de cada composição), nunca de números inventados.
