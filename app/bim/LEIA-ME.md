# OrçaPRO BIM — Visualizador 3D (IFC) · Fase 0

Visualizador BIM offline, in-browser. Abre modelos **IFC** (exportados do Revit/pyRevit) em 3D, sem instalar nada e sem internet.

## O que já funciona (Fase 0)
- Carregar IFC (botão, arrastar-soltar, ou exemplo embutido).
- Render 3D via WebGL (Three.js) — geometria parseada por web-ifc (WASM), offline.
- **Modo de voo** (WASD + mouse, Q/E sobe/desce, Shift acelera) + Órbita.
- Duplo-clique num elemento → propriedades reais do IFC (Nome, Classe, GlobalId, Tag).
- Árvore de disciplinas/tipos em PT-BR (Viga, Pilar, Parede, Laje…).
- Enquadrar modelo; HUD com contagem de elementos/triângulos.

## Próximas fases
- **Fase 1 — 4D:** ligar cada elemento a uma etapa do cronograma + timeline planejado × real (puxando o avanço do RDO).
- **Fase 2 — 5D:** ligar elementos ao orçamento (quantitativos + custo).
- **Fase 3 — Compatibilização:** clash entre disciplinas.
- **Fase 4+ — 6D/7D.**
- **Exportador pyRevit:** botão que exporta o IFC já preparado (códigos de etapa/orçamento embutidos) p/ ligação 4D/5D automática.

## Bibliotecas embutidas (vendor/, offline)
- three.js r0.150.1 — MIT
- web-ifc 0.0.44 (+ web-ifc.wasm) — MPL-2.0
- OrbitControls (three examples) — MIT
