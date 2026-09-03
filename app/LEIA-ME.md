# ⚠ Esta pasta é GERADA. Não edite nada aqui.

O conteúdo de `app/` é publicado por `tools/sync-pwa.js`, que copia o app do
repositório **orcapro-app**. Qualquer arquivo mexido aqui — por edição direta ou
por PR — é **sobrescrito no próximo sync**, sem aviso.

## O que aconteceu em 03/09/2026

O app estava sendo publicado por dois caminhos:

| caminho | código | o que publica |
|---|---|---|
| `orcapro-app` | `js/` | pacote + release no GitHub + PWA + `latest.json` |
| aqui, por PR | `app/js/` | só o PWA |

As duas linhas partiram da 1.2.30 e divergiram sozinhas: lá foi para a 1.2.31
(cronograma), aqui para a 1.2.32 (proposta comercial). Nenhuma tinha a outra.

Pior: o **`latest.json` é o que move a frota**, e a publicação por PR não o
toca. Ele ficou em 1.2.30 o dia inteiro — ou seja, **quem abria o PWA e quem
instalava o app estavam com códigos diferentes**, sem erro em lugar nenhum.

Quando a fusão começou, um oitavo PR foi mergeado numerado 1.2.33 — o mesmo
número que a fusão tinha acabado de usar. Duas 1.2.33 diferentes no mesmo dia.

E o código daqui **nunca tinha passado pelas suítes do orcapro-app**: seis
reprovaram na fusão, cinco por teste desatualizado e uma por defeito real
(`Icones.get("enviar")` sem o ícone correspondente — o botão saía sem ícone, e
como `get` devolve `""` para nome desconhecido, ninguém via).

## Onde trabalhar

No repositório **orcapro-app**, em `js/`. De lá sai tudo junto: o pacote que o
cliente instala, a release, o PWA daqui e o `latest.json` que move a frota.

`tools/check-landing.js` (no orcapro-app) reprova o empacotamento se esta pasta
tiver código que aquele repositório não tem — justamente para a próxima release
não apagar trabalho que foi mergeado aqui.
