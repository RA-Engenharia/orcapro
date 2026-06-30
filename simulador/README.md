# 🏗️ OrçaPRO — Simulador de Obras 3D

**Simulador de gestão de obras** (roda em tablet, celular e desktop). Você assume a
gestão de uma construtora: compra o lote, monta o canteiro, contrata a equipe,
compra/contrata ferramentas e equipamentos, gerencia o estoque de materiais e executa a
obra etapa por etapa — tudo visualizado em **3D** e dentro do prazo e do orçamento.

É uma ferramenta de **treino e demonstração** das mesmas decisões que o OrçaPRO ajuda a
orçar na vida real (lote, mão de obra, materiais, equipamentos, cronograma e margem).

## Como usar

1. **Selecione o cenário de obra** (do mais simples ao mais complexo).
2. **Compre o lote** com áreas-padrão de loteamento do Brasil (5×25, 10×20, 12×30…),
   compatível com o cenário.
3. **Contrate os projetos** técnicos (arquitetônico, estrutural, fundação,
   hidrossanitário, elétrico, incêndio/PPCI, interiores).
4. **Monte o canteiro** (tapume, barracão/almoxarifado, área de vivência, baias de
   agregados, escritório, caixa d'água…). Tapume + barracão são obrigatórios para começar.
5. **Contrate a equipe**: engenheiro, mestre de obras, pedreiro, servente, carpinteiro,
   armador, eletricista, encanador, pintor, azulejista, gesseiro, operador e apoio.
   Mais profissionais e um Mestre de Obras **aumentam a produtividade** de cada etapa.
6. **Compre/contrate ferramentas e equipamentos**: do kit manual e furadeira à betoneira,
   serra mármore, rompedor, andaime, escoramento, plataforma elevatória, caminhão munck,
   guindaste e grua. O aluguel é cobrado só nas etapas em que o equipamento é usado.
7. **Compre os materiais** (cimento, areia, brita, aço, blocos, concreto, telha, tubos,
   fios, tinta, porcelanato, esquadrias…) para o estoque do canteiro.
8. **Execute as etapas** na ordem (serviços preliminares → fundação → estrutura →
   alvenaria → laje → cobertura → instalações → reboco → revestimento → esquadrias →
   forro → pintura → entrega). O simulador verifica equipe, ferramentas, materiais e projetos.

Conclua a etapa final (**Entrega**) dentro do prazo para receber o valor de venda,
obter até **3 estrelas de desempenho** e liberar o próximo cenário. O caixa da construtora
é acumulado entre os cenários.

## Cenários de obra

| # | Obra | Tipo | Pavimentos |
|---|------|------|------------|
| 1 | Casa Térrea Popular | Residencial | 1 |
| 2 | Sobrado de Médio Padrão | Residencial | 2 |
| 3 | Casa de Alto Padrão | Residencial | 2 |
| 4 | Edifício Residencial | Predial | 4 |
| 5 | Edifício Comercial | Predial | 6 |
| 6 | Galpão Industrial | Industrial | 1 |
| 7 | Complexo Industrial | Industrial | 1 |

## Controles (touch / mouse)

- **Arrastar** com 1 dedo → girar a câmera ao redor da obra.
- **Pinça** com 2 dedos (ou roda do mouse) → aproximar/afastar.
- Os botões do **dock inferior** abrem os painéis de gestão.

## Tecnologia

- HTML + CSS + JavaScript puro (sem build), otimizado para tablet (touch, viewport-fit).
- **Three.js** (embutido em `vendor/three.min.js`, com fallback CDN) para a cena 3D.
- Progresso salvo automaticamente no `localStorage` do dispositivo.

## Estrutura

```
simulador/
├── index.html        # entrada
├── css/jogo.css      # estilo tablet-first
├── js/
│   ├── dados.js      # lotes, funções, insumos, ferramentas, projetos, etapas, cenários
│   ├── estado.js     # estado do simulador + save/load
│   ├── cena3d.js     # cena 3D (Three.js): constrói a obra em blocos
│   └── jogo.js       # controlador: telas, módulos, execução de etapas, avaliação
└── vendor/three.min.js
```

Abra `simulador/index.html` no navegador — não precisa de servidor.
