/* =====================================================================
 * bim.js — Visualizador BIM in-app (módulo ES). window.BIM.
 * Adapta a lógica provada do bim/bim.html (viewer autônomo da NF8n, 33d47fb):
 * web-ifc StreamAllMeshes → BufferGeometry Three (glue própria), voo+órbita,
 * pick por duplo-clique. Aqui vira um módulo montável na aba BIM da Gestão,
 * com camada 4D (recolore/oculta por estado — dirigido por BIM4D via gestao.js).
 *
 * Contrato consumido por gestao.js (aba BIM):
 *   BIM.montar(host, { onLoaded(elementos:[{id,tipo,nome}]), onPick(info) })
 *   BIM.abrirArquivo(File)  ·  BIM.carregarExemplo()
 *   BIM.aplicarEstado({construidos,emAndamento,futuros})  ·  BIM.mostrarTudo()
 * ===================================================================== */
import * as THREE from 'three';
import { OrbitControls } from '../bim/vendor/OrbitControls.js';
import { IfcAPI } from 'web-ifc';

var S = null; // estado do viewer montado

/* =====================================================================
 * B0 — IDENTIDADE DURAVEL DO ELEMENTO (motor em js/bimid.js)
 *
 * `uid` (mid + ':' + expressID) NAO sobrevive: `mid` e a ordem de abertura
 * naquela sessao, e `expressID` e o numero da linha no IFC, que muda em toda
 * reexportacao. Quem GRAVA vinculo passa a gravar `chave`.
 *
 * A obra corrente vive AQUI, fora do `S`: o viewer e remontado ao trocar de
 * aba e ao perder o contexto WebGL, e a obra nao muda por causa disso.
 *
 * ⚠ E a obra entra na ancora porque o vinculo e GRAVADO por obra
 * (`Store.obter(eid(), 'bim_edicoes', obraId)`). Ancora dizendo obra A dentro
 * do registro da obra B nao casa na proxima abertura: vinculo orfao, calado.
 * ===================================================================== */
var OBRA_ID = '';

/* =====================================================================
 * B1 — CACHE DO MODELO (js/bimcache.js) E FEDERACAO DA OBRA (js/bimfed.js)
 *
 * FED e o mapa que a casca entrega: "nesta obra, o arquivo de conteudo X (ou
 * de nome Y) e o modelo Z". Ele existe para o viewer NAO precisar do Store —
 * a fronteira do produto diz que quem fala com o Store e a casca.
 *
 * ⚠ E e ele que fecha o buraco declarado no B0: sem federacao, o modeloId era
 * derivado do nome, e renomear o arquivo orfanava todo vinculo salvo. Com o
 * mapa, o casamento e por CONTEUDO primeiro.
 * ===================================================================== */
var FED = null;

/* ⚠ TETO DA COLETA PARA O CACHE. Guardar a geometria crua custa memoria
 * DURANTE a abertura, alem do que a cena ja ocupa. Num modelo em que quase
 * nada se repete isso quase dobra o pico — e o produto ja carrega o IFC
 * inteiro na memoria (D6). Passando do teto, o modelo abre normalmente e
 * simplesmente NAO e guardado: perder o cache e lentidao na proxima abertura,
 * estourar a memoria e o Revit do usuario travando junto com a aba. */
var TETO_COLETA = 200 * 1024 * 1024;
var cacheSeq = 0;

/* ⚠ A GUARDA UNICA. Um modelo restaurado do cache NAO existe no WASM, e o
 * `mid` dele e string. Se qualquer caminho de leitura IFC escapar desta
 * guarda, `GetLine(mid, …)` recebe uma string que o embind converte para 0 —
 * e le a linha do PRIMEIRO IFC de verdade que estiver aberto. O usuario
 * clicaria numa peca e veria, sem erro nenhum, as propriedades de outra peca,
 * de outro arquivo. E o mesmo motivo pelo qual `removerModelo` so chama
 * `CloseModel` quando o mid e numero. */
function semWasm(mo) { return !!(mo && (mo.sintetico || mo.doCache)); }

function idModelo(nome, arquivoId, abertos) {
  if (typeof window === 'undefined') return '';
  /* a federacao manda; o derivado do B0 e o ultimo recurso (obra sem registro
     ainda, ou arquivo que a obra nunca viu) */
  if (FED && window.BimFed) return window.BimFed.resolver(FED, nome, arquivoId, abertos);
  return window.BimId ? window.BimId.modeloId(OBRA_ID, nome) : '';
}

/* ⚠ O NOME QUE SERVE DE IDENTIDADE NAO E SEMPRE O NOME QUE APARECE. O modelo
 * do editor se chama "Criados no OrcaPRO (3)" — a contagem esta DENTRO do
 * nome, entao criar a quarta parede mudava o nome, mudava o modeloId e mudava
 * a chave de todas as pecas que ja existiam. Identidade que muda quando o
 * usuario trabalha e o oposto do que o B0 existe para dar. */
function nomeDeIdentidade(mo) {
  if (mo && mo.editor) return 'Criados no OrcaPRO';
  return mo ? mo.nome : '';
}

/* as vagas que os OUTROS modelos abertos ocupam, com o conteudo de cada uma —
 * e o que impede o segundo "ESTRUTURA.ifc" de herdar a ancora do primeiro */
function vagasOcupadas(exceto) {
  var out = {};
  if (!S || !S.modelos) return out;
  for (var i = 0; i < S.modelos.length; i++) {
    var m = S.modelos[i];
    if (m === exceto || !m.modeloId) continue;
    out[m.modeloId] = m.versaoId || '';
  }
  return out;
}
function idElemento(modeloId, el) {
  if (typeof window === 'undefined' || !window.BimId) return { chave: '', globalId: '', instavel: true };
  return window.BimId.doElemento(modeloId, el);
}
/* GlobalId, nome e tag da linha IFC, numa leitura so. flatten=false de
   proposito: sao atributos diretos de IfcRoot/IfcElement, e resolver
   referencias recursivamente aqui — uma vez por elemento, dentro do stream —
   custaria o carregamento inteiro.

   ⚠ O `Name` entra porque e o nome do Revit ("Parede basica:ALV 14
   CHAPISCO:987654"), aquele pelo qual o engenheiro acha a peca e conversa com
   o projetista. Sem guarda-lo, o modelo restaurado do cache passava a chamar
   TODAS as paredes de "Parede" — a peca continuava certa e o unico jeito de
   identifica-la sumia. E a leitura ja estava paga. */
function lerIdentidadeIfc(api, mid, expressID) {
  try {
    var ln = api.GetLine(mid, expressID, false);
    return {
      globalId: (ln && ln.GlobalId && ln.GlobalId.value) || '',
      nomeIfc: (ln && ln.Name && ln.Name.value) || '',
      tag: (ln && ln.Tag && ln.Tag.value) || ''
    };
  } catch (_) { return { globalId: '', nomeIfc: '', tag: '' }; }
}
/* ⚠ UMA funcao carimba, e os tres caminhos de carga a chamam. Se cada um
   carimbasse do seu jeito, o vinculo do IFC e o do editor divergiriam — e o
   caminho menos usado seria o que ninguem veria quebrar. E ela tambem roda na
   troca de obra: recarimbar e re-derivar do zero, nao remendar. */
function recarimbarIdentidade() {
  if (!S || !S.modelos) return;
  var B = (typeof window !== 'undefined') ? window.BimId : null;
  /* ⚠ DOIS PASSOS, DE PROPOSITO. Calcular e atribuir no mesmo laco faria o
     segundo modelo enxergar a vaga do primeiro JA trocada, e a resolucao
     dependeria da ordem da lista — a mesma cena daria ancoras diferentes
     conforme a ordem de abertura. */
  var novos = S.modelos.map(function (mo) { return idModelo(nomeDeIdentidade(mo), mo.versaoId, vagasOcupadas(mo)); });
  S.modelos.forEach(function (mo, i) {
    mo.modeloId = novos[i];
    if (mo.sintetico && !mo.versaoId) mo.versaoId = 'sintetico';
    (mo.elementos || []).forEach(function (e) {
      /* o que nasce no OrcaPRO nao veio de IFC: GlobalId proprio, com prefixo,
         para nunca herdar o vinculo de uma peca do projetista */
      if (!e.globalId && mo.sintetico && B) e.globalId = B.sintetico((mo.editor ? 'edit' : 'p3d') + '_' + e.id);
      var r = idElemento(mo.modeloId, e);
      e.chave = r.chave; e.chaveInstavel = r.instavel;
    });
  });
}

// 🧱 Blocok — allowlist de e-mails com acesso (feito p/ a Argecon primeiro; fácil de estender).
// No escopo do MÓDULO (não dentro de montar) p/ já estar definido quando a toolbar é construída.
// rogeriosouza... = o dono (RA Engenharia) — sempre liberado pra testar.
/* ⚠ AQUI HAVIA DOIS E-MAILS EM TEXTO PURO — UM DELES DE CLIENTE.
 *
 * `js/` é copiado INTEIRO para os 38 pacotes e para a página pública: o
 * endereço do cliente estava legível em
 * https://ra-engenharia.github.io/orcapro/app/js/bim.js, para qualquer um com
 * o link, em toda release desde que a lista existe.
 *
 * A guarda é legítima — é portão de recurso de cliente pagante, e removê-la
 * trancaria o acesso dele. O que não pode é a guarda SER o endereço da pessoa.
 * Agora são hashes salgados do mesmo endereço: exatamente as mesmas pessoas
 * passam, e ninguém fica publicado.
 *
 * ⚠ Isto NÃO é proteção de segredo — hash de e-mail conhecido é quebrável por
 * tentativa. É proteção de DADO PESSOAL: o endereço deixa de ser legível e de
 * ser indexável. Para quem tenta burlar o portão, a barreira continua sendo a
 * mesma de antes (o login), nem mais nem menos.
 *
 * Mesma família de `orcamento-leilah` em js/basescat.js (v1.2.17): guarda que
 * protege pelo NOME de alguém publica esse alguém.
 *
 * Para liberar mais um e-mail: `node -e` com o `Util.sha256hex` de js/util.js
 * sobre BLOCOK_SAL + e-mail em minúsculas, e acrescentar o hash aqui. */
var BLOCOK_SAL = 'orcapro:blocok:v1:';
var BLOCOK_HASHES = [
  '0414090e312090f655c6feac87873e7addd3767dd8cb37c87134a54a3b3059ef',
  '606cee692085607e07856ca12ec08f9525167d82a21fc48e1f67366ba5607e7e'
];
function blocokEmailLiberado(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  var U = (typeof window !== 'undefined' && window.Util) ? window.Util : (typeof Util !== 'undefined' ? Util : null);
  /* sem o hasher não dá para decidir — e decidir errado aqui tranca cliente
     pagante fora do que ele comprou. Recusa e deixa a trava da máquina
     (`orcapro:blocok:owner`) responder, que é o caminho do instalador. */
  if (!U || !U.sha256hex) return false;
  try { return BLOCOK_HASHES.indexOf(U.sha256hex(BLOCOK_SAL + e)) >= 0; } catch (_) { return false; }
}

function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

var TIPOS = {
  IFCWALL: 'Parede', IFCWALLSTANDARDCASE: 'Parede', IFCSLAB: 'Laje', IFCBEAM: 'Viga', IFCCOLUMN: 'Pilar',
  IFCDOOR: 'Porta', IFCWINDOW: 'Janela', IFCROOF: 'Cobertura', IFCSTAIR: 'Escada', IFCSTAIRFLIGHT: 'Lance de escada',
  IFCRAILING: 'Guarda-corpo', IFCFURNISHINGELEMENT: 'Mobiliário', IFCPLATE: 'Chapa', IFCMEMBER: 'Perfil/Montante',
  IFCFLOWTERMINAL: 'Louça/terminal', IFCFLOWSEGMENT: 'Tubo/duto', IFCFLOWFITTING: 'Conexão', IFCBUILDINGELEMENTPROXY: 'Elemento genérico',
  IFCCOVERING: 'Revestimento', IFCSPACE: 'Ambiente', IFCFOOTING: 'Fundação', IFCPILE: 'Estaca', IFCCURTAINWALL: 'Fachada cortina'
};

// Códigos de tipo IFC p/ ler os carimbos do exportador pyRevit (OrcaPRO_Etapa/OrcaPRO_CodOrc)
// via relacionamento de property set. web-ifc 0.0.44 NÃO exporta essas constantes → hardcode
// dos códigos de tipo (estáveis no schema). Traversal: IfcRelDefinesByProperties → IfcPropertySet
// (HasProperties) → IfcPropertySingleValue(Name='OrcaPRO_Etapa').
var IFC_RELDEFINESBYPROPERTIES = 4186316022, IFC_PROPERTYSINGLEVALUE = 3650150729;
// IfcSIUnit — p/ normalizar BaseQuantities (que vêm na unidade do arquivo, ex.: mm) em metros.
var IFC_SIUNIT = 448429030;
// IfcBuildingStorey + IfcRelContainedInSpatialStructure — p/ a ferramenta 🏢 Pavimentos
// (códigos conferidos no vendor bim/vendor/web-ifc-api.js, estáveis no schema)
var IFC_BUILDINGSTOREY = 3124254112, IFC_RELCONTAINEDINSPATIALSTRUCTURE = 3242617779;
// v1.1.82 — família/tipo (IfcRelDefinesByType) + propriedades completas (todos os psets):
// códigos conferidos no vendor (web-ifc-api.js): RELDEFINESBYTYPE 10025, PROPERTYSET 10063,
// ELEMENTQUANTITY 10091, ENUMERATED/LIST/BOUNDED/COMPLEX p/ o painel não descartar nada.
var IFC_RELDEFINESBYTYPE = 781010003, IFC_PROPERTYSET = 1451395588, IFC_ELEMENTQUANTITY = 1883228015;
var IFC_RELASSIGNSTOGROUP = 1307041759, IFC_SYSTEM = 2254336722, IFC_DISTRIBUTIONSYSTEM = 3205830791; // v1.1.98 — SISTEMA do IFC (Esgoto/Água…) p/ colorir por sistema
var IFC_PROP_ENUM = 4166981789, IFC_PROP_LIST = 2752243245, IFC_PROP_BOUNDED = 871118103, IFC_PROP_COMPLEX = 2542286263;
/* TOPOLOGIA DA REDE — porta a porta. É o que permite dizer qual conexão entra
 * em cada extremidade de cada tubo, e encadear os trechos na ordem em que a
 * rede corre. Valores lidos do `var IFC... = <numero>` do vendor.
 * ⚠ NÃO copiar os números citados na prosa do comentário acima: "RELDEFINESBYTYPE
 *   10025" é NÚMERO DE LINHA do vendor, não código de tipo. Quem seguir aquilo
 *   ao pé da letra hardcoda 10025 e o traversal devolve zero, em silêncio. */
var IFC_DISTRIBUTIONPORT = 3041715199, IFC_RELCONNECTSPORTTOELEMENT = 4201705270, IFC_RELCONNECTSPORTS = 3190031847;

function montar(host, opts) {
  opts = opts || {};
  // RE-HOME: se já existe um viewer vivo, NÃO cria outro (senão vaza WebGLRenderer + loop RAF +
  // listeners a cada App.render() → "Too many active WebGL contexts"). Reaproveita a MESMA
  // instância, só re-parenta o DOM no novo host e preserva o modelo/estado 4D já carregado.
  if (S && S.alive) {
    S.opts = opts;
    host.innerHTML = '';
    host.style.position = 'relative';
    host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';
    /* ⚠ QUEM NASCE PENDURADO NO HOST TEM DE ENTRAR AQUI. Já aconteceu duas vezes:
     * sisPanel e blocokPanel ficavam presos no host morto e sumiam de vez ao sair
     * e voltar para a aba BIM. Na v1.2.2 quase aconteceu de novo com as três peças
     * novas da mira — guiaH, guiaV e a lupa: o recurso funcionava na primeira
     * visita e sumia calado a partir da segunda, que é o pior jeito de falhar.
     * Os traços dos notáveis não entram na lista porque nascem sob demanda; eles
     * se re-penduram sozinhos em `posicionarNotaveis`. */
    [(S.xr && S.xr.video), S.bar, S.barToggle, S.hud, S.over, S.loading, S.renderer.domElement, S.hint, S.cortePanel, S.corteLPanel, S.snapPanel, S.snapMarca, S.guiaH, S.guiaV, S.lupaEl, S.ctecCfg, S.ctecModal, S.plantaCfg, S.pavPanel, S.visPanel, S.sisPanel, S.blocokPanel, S.p3dPanel, S.editPanel, S.editDist, S.xrPanel, S.xrHud, S.reqPanel].forEach(function (el) { if (el) host.appendChild(el); });
    if (S._onDragOver) { host.addEventListener('dragover', S._onDragOver); host.addEventListener('drop', S._onDrop); } // re-registra drop no host novo
    S.host = host;
    // painel flutuante volta ABERTO com a barra recolhida = caixa presa sem fechador
    // (o usuário voltava ao BIM e "não conseguia mais fechar"). Entra sempre limpo.
    try { if (S._fecharPaineis && S.bar && S.bar.style.display === 'none') S._fecharPaineis(null); } catch (eP) {}
    setTimeout(function () { if (S && S._resize) S._resize(); if (S && S._ajustarTop) S._ajustarTop(); if (S && S._aplicarTema) S._aplicarTema(); }, 0); // tema re-aplicado (o fundo acima é só o default até aqui)
    return;
  }
  // CONTEXTO PERDIDO: o viewer antigo morreu (S.alive=false) mas os listeners globais e o
  // renderer continuavam pendurados — cada remount vazava keydown/keyup/mousemove/resize
  // (teclado disparando em dobro) + um WebGLRenderer morto. Desmonta ANTES de criar o novo.
  if (S && !S.alive) desmontarMorto();
  host.innerHTML = '';
  host.style.position = 'relative';
  host.style.background = 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)';

  // v1.1.82 — ícones SVG line-art (estilo Revit) no lugar dos emojis: stroke currentColor,
  // 14px, herdam a cor do tema. ico(nome) devolve a tag inline.
  function ico(n) {
    var P = {
      abrir: '<path d="M2 5h4l2 2h6v6H2z"/><path d="M2 5V3h5"/>',
      lixo: '<path d="M4 5h8M6 5V3h4v2M5 5l1 8h4l1-8"/>',
      ultra: '<path d="M8 2l1.6 4.2L14 8l-4.4 1.8L8 14l-1.6-4.2L2 8l4.4-1.8z"/>',
      orbita: '<circle cx="8" cy="8" r="3.4"/><path d="M2.2 10.5C1 8 4 4 8 3.4M13.8 5.5C15 8 12 12 8 12.6"/>',
      voo: '<path d="M2 9l12-5-4 6 4 4-6-2-3 3z"/>',
      medir: '<path d="M2 12L12 2l2 2L4 14z"/><path d="M5 11l1 1M7 9l1 1M9 7l1 1M11 5l1 1"/>',
      area: '<path d="M3 4l10-1 -1 9-9 1z"/><path d="M3 4l9 8"/>',
      angulo: '<path d="M3 13L13 3M3 13h10"/><path d="M7 13a5 5 0 0 0-1.5-3.5"/>',
      snap: '<path d="M4 2v6a4 4 0 0 0 8 0V2"/><path d="M4 2h2M10 2h2"/>',
      cotas: '<path d="M2 8h12M2 6v4M14 6v4M6 8l-2-1.5M6 8l-2 1.5M10 8l2-1.5M10 8l2 1.5"/>',
      planta: '<rect x="3" y="3" width="10" height="10"/><path d="M3 8h5v5"/>',
      corte: '<path d="M2 10L14 4"/><circle cx="4" cy="12" r="1.6"/><circle cx="8" cy="11" r="1.6"/><path d="M9 9l5 3"/>',
      p3d: '<path d="M8 2l5 3v6l-5 3-5-3V5z"/><path d="M8 8l5-3M8 8L3 5M8 8v6"/>',
      editar: '<path d="M3 13l1-3 7-7 2 2-7 7z"/><path d="M10 4l2 2"/>',
      pav: '<path d="M2 12h12M2 9h12M2 6h12"/><path d="M4 12V4h8v8"/>',
      ver: '<path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/>',
      foto: '<rect x="2" y="4" width="12" height="9" rx="1.5"/><circle cx="8" cy="8.5" r="2.6"/><path d="M5 4l1-1.5h4L11 4"/>',
      fit: '<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>',
      tema: '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4v11.2M8 8l4-4M8 8l4 4"/>',
      parede: '<path d="M2 12V6h12v6z"/><path d="M6 6v3M10 9v3M2 9h12"/>',
      laje: '<path d="M2 9l6-3 6 3-6 3z"/><path d="M2 9v2l6 3 6-3V9"/>',
      pilar: '<rect x="6" y="3" width="4" height="10"/><path d="M4 3h8M4 13h8"/>',
      mover: '<path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2"/>',
      nota: '<path d="M8 14V7"/><circle cx="8" cy="4.6" r="2.6"/>',
      xr: '<path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h9A1.5 1.5 0 0 1 14 6.5v3A1.5 1.5 0 0 1 12.5 11h-2.2L8 9 5.7 11H3.5A1.5 1.5 0 0 1 2 9.5z"/><circle cx="5" cy="8" r="0.7"/><circle cx="11" cy="8" r="0.7"/>',
      grafico: '<path d="M2 2v11a1 1 0 0 0 1 1h11"/><path d="M6 11V7M9 11V4M12 11V6"/>',
      sistemas: '<path d="M8 2s4 4.6 4 7.4A4 4 0 0 1 4 9.4C4 6.6 8 2 8 2z"/><path d="M6.4 9.6a1.7 1.7 0 0 0 1.7 1.7"/>'
    };
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px">' + (P[n] || '') + '</svg>';
  }

  /* ⚠ `accept=".ifc"` IMPEDE ABRIR IFC NO CELULAR — o contrário do que promete.
   *
   * O atributo `accept` só sabe filtrar por dois caminhos: tipo MIME registrado
   * ou extensão. No computador o navegador entende a extensão e o diálogo abre
   * normal. No Android o Chrome traduz `accept` para tipos MIME antes de chamar
   * o seletor do sistema — e `.ifc` não tem MIME registrado em lugar nenhum.
   * Resultado: o seletor abre com TUDO em cinza, ou não abre. No iOS o app
   * Arquivos faz o mesmo. Para quem está com o celular na mão, isso é
   * exatamente "toco em + IFC e não acontece nada".
   *
   * Mesma história do `.dxf` do 2D→3D — as duas únicas entradas do app cuja
   * extensão o sistema operacional não conhece. `.xlsx`, `.csv`, `.json` e
   * `image/*` têm MIME e por isso nunca deram problema.
   *
   * Então: no toque, o seletor abre SEM filtro (mostra tudo, e o cliente
   * encontra o arquivo dele) e a validação passa a ser NOSSA, na hora em que o
   * arquivo chega — que é onde ela devia estar desde sempre. Ver o `change`
   * mais abaixo: ele aceitava qualquer arquivo escolhido e mandava direto para
   * o interpretador de IFC, sem olhar o nome; só o arrastar-e-soltar filtrava. */
  function ehToque() {
    try { return !(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); }
    catch (e) { return false; }
  }
  function aceitaIFC() { return ehToque() ? '' : ' accept=".ifc"'; }

  // toolbar compacta
  var bar = document.createElement('div');
  /* ⚠ z-index 4, NÃO 3 — o dock mora aqui dentro e empatava com o HUD.
   * O HUD ("Elementos · Triângulos", canto inferior direito) também era 3 e é
   * criado DEPOIS da fita: empate em z-index se resolve por ordem no DOM, e
   * quem vem depois pinta por cima. Como o dock é filho da fita, o `z-index:6`
   * dele só vale entre os filhos DELA — perdia junto. Numa janela baixa, onde
   * a fila do dock alcança a altura do HUD, a última aba parava de receber
   * toque e o cliente relatava "clico e não abre".
   * 4 é o mínimo que resolve: tudo o que precisa continuar por cima da fita
   * (rótulos de medida, controles de planta e corte, botão de recolher) já é
   * 4 ou 5 e é criado depois, então segue ganhando o empate como sempre. */
  bar.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:4;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))';
  bar.innerHTML =
    '<button class="btn sm primary" data-b="abrir">' + ico('abrir') + '+ IFC</button>' +
    '<button class="btn sm" data-b="exemplo">Exemplo</button>' +
    '<button class="btn sm" data-b="limpar" title="Remove todos os modelos carregados">' + ico('lixo') + '</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn sm" data-b="ultra" title="Qualidade ultra: nitidez máxima (usa mais GPU)">' + ico('ultra') + 'Ultra</button>' +
    '<button class="btn sm on" data-b="orbita" style="background:#16a34a;color:#fff">' + ico('orbita') + 'Órbita</button>' +
    '<button class="btn sm" data-b="voo">' + ico('voo') + 'Voo</button>' +
    '<button class="btn sm" data-b="medir" title="Trena: clique em 2 pontos do modelo pra medir a distância">' + ico('medir') + 'Medir</button>' +
    '<button class="btn sm" data-b="area" title="Área e perímetro: clique os cantos (3+) e feche clicando de novo no 1º ponto">' + ico('area') + 'Área</button>' +
    '<button class="btn sm" data-b="angulo" title="Ângulo entre 3 pontos: 1º ponto, vértice, 2º ponto">' + ico('angulo') + 'Ângulo</button>' +
    '<button class="btn sm" data-b="snap" title="Snap das medições: agarrar em vértice, meio de aresta ou aresta">' + ico('snap') + '</button>' +
    '<button class="btn sm" data-b="limpar-medidas" title="Apagar todas as cotas medidas" style="display:none">' + ico('cotas') + 'Cotas</button>' +
    /* Cotar rede: o comprimento JÁ VEM no IFC (BaseQuantities). Estes quatro
       botões só mostram o que o projetista publicou — nenhum deles calcula. */
    '<button class="btn sm" data-b="cota" title="Cotar rede: toque num tubo e o comprimento dele aparece em cima da peça — o número vem do IFC, não é medido na tela">' + ico('cotas') + 'Cotar</button>' +
    '<button class="btn sm" data-b="cota-iguais" title="Cotar todos os trechos iguais ao último tocado (mesma família, ou mesmo tipo quando o IFC não trouxer família)">' + ico('camadas') + 'Iguais</button>' +
    '<button class="btn sm" data-b="cota-todas" title="Cotar a rede inteira que estiver à vista">' + ico('sistemas') + 'Toda a rede</button>' +
    '<button class="btn sm" data-b="cota-numerar" title="Numera os tubos seguindo o encadeamento da rede (R01-T001, R01-T002...) e mostra o numero em cima de cada peca">' + ico('cotas') + 'Numerar</button>' +
    '<button class="btn sm" data-b="cota-planilha" title="Baixa a relacao dos tubos por ramal: numero, comprimento e a conexao de cada extremidade">' + ico('relatorios') + 'Planilha</button>' +
    '<button class="btn sm" data-b="req-bim" title="Levanta as pecas do modelo por familia, casa com o banco de insumos e monta a requisicao de material">' + ico('requisicoes') + 'Requisitar</button>' +
    '<button class="btn sm" data-b="cota-limpar" title="Apagar as cotas da rede">' + ico('lixo') + 'Limpar cotas</button>' +
    '<button class="btn sm" data-b="planta" title="Planta baixa: corta o modelo numa altura e vê de cima">' + ico('planta') + 'Planta</button>' +
    '<button class="btn sm" data-b="corte" title="Corte livre: plano de corte horizontal, vertical ou em qualquer ângulo">' + ico('corte') + 'Corte</button>' +
    '<button class="btn sm" data-b="p3d" title="Reconstruir 3D a partir da planta baixa em DXF (assistido: o sistema propõe as paredes, você confirma)">' + ico('p3d') + '2D→3D</button>' +
    '<button class="btn sm" data-b="editar" title="Editor: criar paredes, lajes e pilares SINTÉTICOS, mover, apagar e anotar — salvo com a obra">' + ico('editar') + 'Editar</button>' +
    '<button class="btn sm" data-b="pav" title="Pavimentos declarados no IFC: isolar um andar ou gerar a planta dele">' + ico('pav') + 'Pav.</button>' +
    '<button class="btn sm" data-b="vis" title="Visibilidade: isolar ou ocultar o elemento selecionado (duplo-clique seleciona)">' + ico('ver') + 'Ver</button>' +
    '<button class="btn sm" data-b="xr" title="Realidade Mista/Virtual: andar dentro do modelo em escala real (1:1) ou escolhida, medir, ver por disciplina e gerar QR para o celular">' + ico('xr') + 'RA/RV</button>' +
    '<button class="btn sm" data-b="sistema" title="Colorir a tubulação por sistema hidrossanitário (água fria, água quente, esgoto, pluvial, gás, incêndio, ventilação) com cores editáveis — vale na Planta baixa e no RA/RV">' + ico('sistemas') + 'Sistemas</button>' +
    (blocokLiberado() ? '<button class="btn sm" data-b="blocok" title="Plantas Executivas Blocok: lê as paredes do IFC e gera a prancha de cada parede com as placas 90×90 numeradas e paginadas + tabela de material (placas + insumos calculados) + carga na fundação">' + ico('parede') + 'Blocok</button>' : '') +
    '<button class="btn sm" data-b="foto" title="Salvar foto PNG do modelo com carimbo de data">' + ico('foto') + 'Foto</button>' +
    '<button class="btn sm" data-b="fit">' + ico('fit') + 'Enquadrar</button>' +
    '<button class="btn sm" data-b="tema" title="Cor da interface do BIM: OrçaPRO → Revit → Claro">' + ico('tema') + '</button>' +
    /* ⚠ SEM `accept` NO CELULAR — ver aceitaIFC() logo abaixo. */
    '<input type="file" data-b="file"' + aceitaIFC() + ' multiple style="display:none">';
  host.appendChild(bar);

  // v1.1.121 — DOCK LATERAL: as ferramentas saem da fita corrida (lista solta que
  // tampava a vista) e viram GRUPOS por categoria numa aba vertical à esquerda.
  // Passar o mouse (ou tocar) num grupo expande o leque com as ferramentas dele.
  // O dock é filho do BAR em position:absolute — não entra no bar.offsetHeight
  // (o _ajustarTop segue medindo só a fita do topo) e os botões continuam
  // descendentes do bar (dispatch de clique e querySelector de estado intactos).
  function icoG(n) { return ico(n).replace('width="13" height="13"', 'width="17" height="17"').replace('margin-right:3px', 'margin-right:0'); }
  var dock = document.createElement('div');
  // overflow-y:auto: em viewport baixa (celular deitado) o dock ROLA em vez de ser
  // clipado pelo overflow:hidden do card — os leques abrem em position:fixed (fora
  // do clip), então a rolagem não os corta. maxHeight dinâmico no aplicarEstiloToggle.
  dock.style.cssText = 'position:absolute;left:10px;top:calc(100% + 2px);display:flex;flex-direction:column;gap:6px;z-index:6;pointer-events:auto;overflow-y:auto;overflow-x:hidden;padding-right:2px';
  var GRUPOS_DOCK = [
    { rot: 'Medição', ic: 'medir', bs: ['medir', 'area', 'angulo', 'snap', 'limpar-medidas'] },
    /* grupo PRÓPRIO, não um apêndice de Medição: cotar rede não mede nada —
       lê o que o projeto já traz. Misturar os dois faria o encanador achar
       que o número saiu de um clique dele. */
    { rot: 'Cotar rede', ic: 'cotas', bs: ['cota', 'cota-iguais', 'cota-todas', 'cota-numerar', 'cota-planilha', 'cota-limpar'] },
    { rot: 'Requisitar', ic: 'requisicoes', bs: ['req-bim'] },
    { rot: 'Cortes & Plantas', ic: 'planta', bs: ['planta', 'corte', 'pav'] },
    { rot: 'Visibilidade', ic: 'ver', bs: ['vis', 'sistema', 'foto'] },
    { rot: 'Edição & 2D→3D', ic: 'editar', bs: ['editar', 'p3d', 'blocok'] },
    { rot: 'Imersivo RA/RV', ic: 'xr', bs: ['xr'] }
  ];
  // Análise & Orçamento: painéis da página (quantitativo, clash, 4D…) abrem por AQUI,
  // sem rolar a página — a Gestão injeta o abridor via opts.onPainel.
  var PAINEIS_DOCK = [['modelos', 'Modelos carregados'], ['4d', 'Simulação 4D'], ['clash', 'Compatibilização (clash)'], ['qto', 'Quantitativos'], ['familias', 'Banco de famílias'], ['6d', '6D/7D Ciclo de vida']];
  // Ambiente com mouse de verdade? (touch NÃO deve ganhar hover: o tap emite
  // mouseenter sintético ANTES do click e o leque abria-e-fechava no mesmo toque)
  var dockHover = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  var flyTimer = null;
  /* ⚠ "DENTRO DA JANELA" NÃO BASTA — E O CULPADO NÃO É QUEM EU PENSEI.
   *
   * O leque é `position:fixed`, o que o faz escapar do `overflow:hidden` do
   * card. Só que `position:fixed` NÃO tira ninguém do contexto de
   * empilhamento: o cabeçalho do app tem `z-index:20` num ramo acima, e
   * quando o leque abre por cima dele é o CABEÇALHO que pinta na frente —
   * `z-index:60` no leque não vale nada de dentro do card. O toque vai parar
   * no cabeçalho e o botão do leque não recebe nada.
   *
   * Cheguei a escrever esta função procurando um cabeçalho `position:fixed`
   * para descontar. Não existe: ele é `relative`, no topo do documento. O que
   * descreve a área utilizável não é a janela nem o cabeçalho — é o PRÓPRIO
   * VISUALIZADOR, que já nasce abaixo de tudo isso. Prender leque e dock à
   * interseção do host com a janela resolve os dois casos sem adivinhar quem
   * está por cima.
   *
   * Vale para o dock e para o leque, e por isso é uma conta só. */
  /* Dois fundos, de propósito:
   *   `fundoHost` — onde o DOCK tem de parar: ele é filho do card e o
   *     `overflow:hidden` do card o corta no fim do visualizador.
   *   `fundo` — até onde o LEQUE pode ir: ele é `position:fixed`, não sofre
   *     esse corte, e o que existe abaixo do visualizador é conteúdo de página
   *     sem `z-index`, que não pinta por cima dele. Limitá-lo ao fim do
   *     visualizador era mais apertado que o necessário e escondia botões
   *     atrás de rolagem à toa — no celular deitado, 91 px a mais de espaço. */
  function faixaVisivel() {
    var alturaJ = window.innerHeight || document.documentElement.clientHeight || 800;
    var r;
    try { r = ((S && S.host) || host).getBoundingClientRect(); } catch (_) { r = null; }
    if (!r || !r.height) return { topo: 0, fundo: alturaJ, fundoHost: alturaJ };
    return { topo: Math.max(0, r.top), fundo: alturaJ, fundoHost: Math.min(alturaJ, r.bottom) };
  }
  function fecharFlys() { if (flyTimer) { clearTimeout(flyTimer); flyTimer = null; } dock.querySelectorAll('.bim-fly').forEach(function (f) { f.style.display = 'none'; }); }
  function agendarFechar() { if (flyTimer) clearTimeout(flyTimer); flyTimer = setTimeout(fecharFlys, 320); } // delay cobre o vão head→leque (fix do gate: mouseleave fechava no caminho)
  function abrirFly(head, fly) {
    fecharFlys();
    // position:fixed = escapa do overflow do card/dock; ancorado no head na hora de abrir
    var r = head.getBoundingClientRect();
    fly.style.display = 'flex';
    var fx = faixaVisivel();
    var larguraJ = window.innerWidth || 400;
    /* leque mais alto que a faixa visível ROLA dentro dela — em vez de vazar
       por cima do cabeçalho ou por baixo da dobra */
    fly.style.maxHeight = Math.max(120, Math.floor(fx.fundo - fx.topo - 16)) + 'px';
    var h = Math.min(fly.offsetHeight || 200, fx.fundo - fx.topo - 16);
    /* ⚠ COM O DOCK DEITADO O LEQUE NÃO PODE ABRIR AO LADO. Ao lado de uma aba
       da fila fica em cima da aba seguinte, e a última abriria fora da tela.
       Deitado ele desce (ou sobe, se não houver espaço embaixo) e se alinha
       pela esquerda da aba, preso dentro da janela. */
    if (dock.getAttribute('data-dir') === 'row') {
      var w = fly.offsetWidth || 172;
      fly.style.left = Math.round(Math.max(8, Math.min(r.left, larguraJ - w - 8))) + 'px';
      var abaixo = r.bottom + 4;
      var cabeAbaixo = abaixo + h + 8 <= fx.fundo;
      fly.style.top = Math.round(cabeAbaixo ? abaixo : Math.max(fx.topo + 8, r.top - h - 4)) + 'px';
      return;
    }
    fly.style.left = (r.right + 4) + 'px';
    fly.style.top = Math.round(Math.max(fx.topo + 8, Math.min(r.top, fx.fundo - h - 8))) + 'px';
  }
  function montarGrupo(g) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;flex:0 0 auto';
    var head = document.createElement('button');
    head.className = 'btn sm';
    head.setAttribute('data-grp', g.rot);
    head.title = g.rot;
    head.style.cssText = 'width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:11px;padding:0;box-shadow:0 2px 10px rgba(0,0,0,.35)';
    head.innerHTML = icoG(g.ic);
    var fly = document.createElement('div');
    fly.className = 'bim-fly';
    fly.style.cssText = 'position:fixed;display:none;flex-direction:column;gap:4px;padding:8px;border-radius:11px;min-width:172px;max-height:70vh;overflow-y:auto;box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:60';
    fly.innerHTML = '<div class="bim-fly-tit" style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.75;padding:0 4px 2px">' + g.rot + '</div>';
    if (g.bs) g.bs.forEach(function (k) {
      var b = bar.querySelector('[data-b="' + k + '"]');
      if (!b) return; // ex.: blocok não liberado
      b.style.width = '100%';
      b.style.justifyContent = 'flex-start';
      fly.appendChild(b);
    });
    if (g.pp) g.pp.forEach(function (par) {
      var pb = document.createElement('button');
      pb.className = 'btn sm';
      pb.setAttribute('data-pp', par[0]);
      pb.style.cssText = 'width:100%;justify-content:flex-start';
      pb.innerHTML = ico('grafico') + par[1];
      fly.appendChild(pb);
    });
    wrap.appendChild(head); wrap.appendChild(fly);
    if (dockHover) {
      // Desktop: hover abre; sair agenda fechar com DELAY (320ms cobre o vão até o
      // leque — achado do gate: fechava no meio do caminho); entrar de novo cancela.
      wrap.addEventListener('mouseenter', function () { abrirFly(head, fly); });
      wrap.addEventListener('mouseleave', agendarFechar);
      // clique no head NUNCA fecha em desktop (hover já abriu; fechar aqui parecia
      // botão quebrado — achado do gate). Ele só garante aberto.
      head.addEventListener('click', function (ev) { ev.stopPropagation(); abrirFly(head, fly); });
    } else {
      // Touch: o TOQUE é o único alternador (sem hover sintético no meio)
      head.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var aberto = fly.style.display === 'flex';
        if (aberto) fecharFlys(); else abrirFly(head, fly);
      });
    }
    dock.appendChild(wrap);
  }
  GRUPOS_DOCK.forEach(montarGrupo);
  if (opts && opts.onPainel) montarGrupo({ rot: 'Análise & Orçamento', ic: 'grafico', pp: PAINEIS_DOCK });
  bar.appendChild(dock);
  // ferramenta clicada OU painel pedido → fecha o leque (a ação já está em curso)
  // (usa S.opts quando existir: o re-home troca os callbacks sem reconstruir o dock)
  dock.addEventListener('click', function (e) {
    var pb = e.target.closest('[data-pp]');
    var oAtual = (S && S.opts) || opts;
    if (pb && oAtual && oAtual.onPainel) { fecharFlys(); oAtual.onPainel(pb.getAttribute('data-pp')); return; }
    if (e.target.closest('[data-b]')) { if (flyTimer) clearTimeout(flyTimer); flyTimer = setTimeout(fecharFlys, 60); }
  });
  // toque fora do dock fecha o leque aberto (no touch não há mouseleave);
  // guardado em S e removido no desmonte (senão acumula 1 listener por remount)
  var dockDocClick = function (e) { if (!dock.contains(e.target)) fecharFlys(); };
  document.addEventListener('click', dockDocClick, true);
  function dockRepintar(T) {
    dock.querySelectorAll('.bim-fly').forEach(function (f) { f.style.background = T.painel; f.style.border = '1px solid ' + T.borda; f.style.color = T.texto; });
  }

  // v1.1.86 — RECOLHER a barra de ferramentas: ela cresceu (quebra em 2+ linhas) e tampava a
  // vista. Um botão discreto no canto esconde/mostra todos os botões; o estado fica salvo.
  var barToggle = document.createElement('button');
  barToggle.className = 'btn sm';
  barToggle.title = 'Mostrar ou esconder a barra de ferramentas (deixa a vista limpa)';
  // v1.1.114 — CELULAR: o toggle era pequeno e ficava no TOPO do viewer; rolando a página
  // pra ver o 3D ele saía da tela e o cliente "perdia" as ferramentas (relato real).
  // Em tela pequena vira um FAB verde GRANDE e fixo no pé do viewer (sempre à vista),
  // e a barra aberta ganha rolagem própria (não tampa mais metade da vista).
  // DINÂMICO (gate v1.1.114): recalculado no resize — celular aberto em landscape (>640px)
  // ou janela de PC estreitada trocam de modo na hora, sem reabrir a aba BIM.
  var ehTelaPequena = (host.clientWidth || window.innerWidth || 1024) <= 640;
  var barraAberta = !ehTelaPequena;
  try { var _pref = localStorage.getItem('orcapro:bim:barra'); if (_pref) barraAberta = _pref !== 'recolhida'; } catch (_) {}
  function aplicarEstiloToggle() {
    ehTelaPequena = (host.clientWidth || window.innerWidth || 1024) <= 640;
    if (ehTelaPequena) {
      // FIXED (viewport): o viewer costuma ser mais alto que a tela do celular — ancorado no
      // host, o botão sumia ao rolar (relato real do cliente). Fixo, está SEMPRE à mão enquanto
      // a aba BIM existir (é filho do host: sai junto quando troca de módulo). O toast
      // ⚠ O balão "Instalar como app" (#opr-install) MORAVA neste canto e o FAB subia
      // pra cima dele. Ele deixou de existir: virou botão fixo na barra de cima
      // (js/ui.js), porque flutuando não aparecia no iOS e podia ser dispensado para
      // sempre. A leitura abaixo fica de propósito — devolve 14 (o lugar natural do
      // FAB) quando não acha nada, e volta a ceder espaço se algum dia outro balão
      // usar esse id.
      // z-index 40: acima de tudo do viewer (z≤7) e ABAIXO de modal (z-50), busca (z-70) e
      // toasts (z-100) — o FAB nunca cobre a UI do app (achado do gate).
      var inst = document.getElementById('opr-install');
      var bb = (inst && inst.offsetHeight) ? (inst.offsetHeight + 26) : 14;
      barToggle.style.cssText = 'position:fixed;right:12px;bottom:' + bb + 'px;z-index:40;padding:12px 18px;font-size:14.5px;font-weight:800;border:0;border-radius:999px;background:#16a34a;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.5);cursor:pointer';
      // v1.1.121: SEM overflow/maxHeight aqui — o overflow:auto CLIPAVA o dock lateral
      // (filho absoluto abaixo da caixa do bar). A fita agora tem só ~9 botões (2 linhas);
      // quem organiza o resto é o dock por grupos.
      bar.style.maxHeight = ''; bar.style.overflowY = ''; bar.style.paddingBottom = '';
    } else {
      barToggle.style.cssText = 'position:absolute;right:10px;top:8px;z-index:5;padding:5px 9px;font-size:12px;opacity:.94;box-shadow:0 2px 8px rgba(0,0,0,.35)';
      bar.style.maxHeight = ''; bar.style.overflowY = ''; bar.style.paddingBottom = '';
    }
    // Viewport baixa (celular deitado/janela curta): o dock ROLA dentro do canvas em
    // vez de ser clipado pelo overflow:hidden do card (achado do gate — os últimos
    // grupos, incluindo Análise & Orçamento, ficavam inclicáveis).
    /* ⚠ A CONTA TINHA DE SER SOBRE A PARTE VISÍVEL, NÃO SOBRE O CANVAS INTEIRO.
     *
     * Medido no celular deitado (812×375): o visualizador fica com 173 px de
     * altura e COMEÇA em y = −35, porque a página está rolada; e o cabeçalho
     * fixo do app ocupa os primeiros ~48 px da tela. A conta antiga usava
     * `clientHeight` do canvas — 173 px, como se todos eles estivessem à vista
     * — e ainda tinha um piso de 120 px que ignorava o que sobrava de fato.
     * Resultado: das seis abas do dock, DUAS ficavam sob o cabeçalho fixo e
     * três abaixo da dobra. Quem toca onde vê a aba acerta outro elemento —
     * é o "clico na aba e não abre" relatado no celular.
     *
     * Agora a faixa é a interseção do canvas com o que realmente aparece:
     * abaixo do cabeçalho fixo e acima do fim da janela. O dock é empurrado
     * para dentro dela e rola ali dentro, com todas as abas alcançáveis. */
    try {
      var rH = ((S && S.host) || host).getBoundingClientRect();
      var rB = bar.getBoundingClientRect();
      /* mesma conta do leque — `faixaVisivel` mede o cabeçalho FIXO em vez de
         cravar 48 px, porque ele muda de altura entre celular, tablete e o
         modo foco, que o esconde por inteiro */
      var fxD = faixaVisivel();
      var visTopo = Math.max(rH.top, fxD.topo);
      var visFundo = Math.min(rH.bottom, fxD.fundoHost);
      var abaixoDaBarra = Math.max(visTopo, rB.bottom + 2);
      var disponivel = Math.floor(visFundo - abaixoDaBarra - 8);
      /* empurra o dock para dentro da faixa visível (o `top` é relativo à
         barra, que é o offsetParent) */
      dock.style.top = Math.round(abaixoDaBarra - rB.top) + 'px';
      /* SEM piso artificial: 120 px onde só cabem 60 devolve o mesmo defeito
         que esta correção fecha. Abaixo de 44 px não cabe nem uma aba — aí o
         dock some, e o cliente usa a fita do topo, que continua inteira. */
      /* ⚠ COLUNA QUE ROLA NÃO RESOLVE NO CELULAR DEITADO — só troca o defeito.
       * Com a faixa visível corrigida, o toque passou a acertar o alvo certo;
       * mas em 812×375 sobram 115 px de altura para SEIS abas de 48 px. Ficavam
       * duas à vista e quatro atrás de uma rolagem sem barra nem seta: para
       * quem está com o celular na mão, "não consigo abrir" continua valendo.
       *
       * Deitado sobra o que falta em pé: LARGURA. Seis abas em fila dão 288 px
       * num visualizador de 800 — cabem todas, sem rolagem nenhuma. Então
       * quando a altura não comporta a coluna e a largura comporta a fila, o
       * dock deita. O leque acompanha (ver abrirFly). */
      var nGrupos = dock.children.length || 6;
      var precisaAltura = nGrupos * 48;
      var precisaLargura = nGrupos * 48 + 20;
      /* ⚠ O DOCK NUNCA PODE SUMIR. Escrevi antes um `display:none` para quando
       * não coubesse, com a nota "o cliente usa a fita do topo". Está errado:
       * `montarGrupo` MOVE os botões da fita para dentro dos leques
       * (`fly.appendChild(b)`) — some o dock, somem as 14 ferramentas, sem
       * outro caminho. Medido numa janela de 1000×439: o dock desaparecia por
       * inteiro. Um dock apertado é ruim; um dock ausente é a ferramenta
       * inalcançável, que é justamente o defeito relatado.
       * Sem piso de altura na decisão: a fila precisa de 46 px, e quando nem
       * isso cabe ela ainda é a menos ruim das opções. */
      var deitar = disponivel < precisaAltura && (rH.width || 0) >= precisaLargura;
      dock.setAttribute('data-dir', deitar ? 'row' : 'col');
      if (deitar) {
        dock.style.display = 'flex';
        dock.style.flexDirection = 'row';
        dock.style.maxHeight = '';
        dock.style.height = '46px';
        dock.style.overflowY = 'hidden';
        dock.style.overflowX = 'auto';
        /* ⚠ LARGURA POR CONTEÚDO, NÃO ESTICADA ATÉ A DIREITA.
         * A primeira versão fazia `right:10px` para a fila ocupar a largura
         * toda, e com isso ela alcançava o HUD do canto inferior direito.
         * Seis abas ocupam 288 px — num visualizador de 800 não há motivo
         * para atravessá-lo. O `maxWidth` é o que permite a fila ROLAR de
         * lado num aparelho estreito, sem esbarrar em quem mora à direita. */
        dock.style.right = '';
        dock.style.maxWidth = Math.max(96, Math.floor((rH.width || 0) - 20)) + 'px';
      } else {
        dock.style.flexDirection = 'column';
        dock.style.height = '';
        dock.style.overflowY = 'auto';
        dock.style.overflowX = 'hidden';
        dock.style.right = '';
        dock.style.maxWidth = '';   // some com o teto da fila ao voltar para a coluna
        dock.style.display = 'flex';
        dock.style.maxHeight = Math.max(44, disponivel) + 'px';   // ao menos uma aba, sempre
      }
    } catch (eD) {}
    barToggle.innerHTML = barraAberta ? (ehTelaPequena ? '' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + ' Fechar ferramentas' : '⤢ Esconder') : '' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ferramentas';
  }
  function setBarra(aberta) {
    barraAberta = !!aberta;
    bar.style.display = aberta ? 'flex' : 'none';
    barToggle.innerHTML = aberta ? (ehTelaPequena ? '' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + ' Fechar ferramentas' : '⤢ Esconder') : '' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ferramentas';
    try { localStorage.setItem('orcapro:bim:barra', aberta ? 'aberta' : 'recolhida'); } catch (_) {}
    // página rolada longe do viewer: abrir a barra sem trazê-la à vista parecia "não fez nada"
    if (aberta && ehTelaPequena && host.scrollIntoView) { try { host.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} }
    if (S && S._ajustarTop) S._ajustarTop();
  }
  var fabObs = null;
  try {
    // reposiciona quando o toast #opr-install entra/sai; guardado em S e DESCONECTADO no
    // desmonte (senão acumulava 1 observer por ctx-lost — achado do gate)
    fabObs = new MutationObserver(aplicarEstiloToggle);
    fabObs.observe(document.body, { childList: true });
  } catch (eF) {}
  barToggle.addEventListener('click', function () { setBarra(!barraAberta); });
  host.appendChild(barToggle);
  aplicarEstiloToggle();
  window.addEventListener('resize', aplicarEstiloToggle);
  /* ⚠ E TAMBÉM AO ROLAR. Desde que a faixa do dock passou a ser a parte
     VISÍVEL do visualizador, ela muda quando a página rola — o cabeçalho fixo
     cobre mais ou menos do canvas conforme a rolagem. Só no `resize`, o dock
     ficaria calculado para a posição de antes e as abas voltariam a cair fora.
     Em rAF porque scroll dispara a cada quadro no toque. */
  var dockRaf = 0;
  function aoRolar() {
    if (dockRaf) return;
    dockRaf = requestAnimationFrame(function () { dockRaf = 0; aplicarEstiloToggle(); });
  }
  /* ⚠ guardado em `S` lá embaixo, junto de `_fabEstilo` — AQUI o `S` ainda é
     null (só é preenchido depois, na montagem da cena) e `S._dockRolar = …`
     estourava "Cannot set properties of null", derrubando o viewer inteiro. */
  window.addEventListener('scroll', aoRolar, true);
  setBarra(barraAberta); // aplica o estado salvo (S._ajustarTop roda depois no setup)

  // v1.1.82 — TEMA de cores da interface do BIM (escolha do usuário; 'revit' = o look do Revit)
  var TEMAS = {
    orcapro: { nome: 'OrçaPRO', ativo: '#16a34a', bar: 'linear-gradient(180deg,rgba(15,39,64,.9),rgba(15,39,64,0))', painel: 'rgba(15,39,64,.97)', borda: '#24435f', texto: '#dbe8f5', fundo: 'radial-gradient(120% 120% at 50% 0%, #16324f 0%, #0b1a2b 70%)' },
    revit: { nome: 'Revit', ativo: '#1858A8', bar: 'linear-gradient(180deg,rgba(59,68,75,.96),rgba(59,68,75,0))', painel: 'rgba(42,49,56,.97)', borda: '#565f66', texto: '#e8eaec', fundo: 'radial-gradient(120% 120% at 50% 0%, #4a5158 0%, #2e343a 70%)' },
    claro: { nome: 'Claro', ativo: '#0e7490', bar: 'linear-gradient(180deg,rgba(235,241,247,.95),rgba(235,241,247,0))', painel: 'rgba(248,250,252,.98)', borda: '#c4d0dc', texto: '#1a2b3c', fundo: 'radial-gradient(120% 120% at 50% 0%, #e6edf4 0%, #c9d6e3 70%)' }
  };
  var temaId = 'orcapro';
  try { var t0 = localStorage.getItem('orcapro:bim:tema'); if (t0 && TEMAS[t0]) temaId = t0; } catch (_) {}
  function corAtiva() { return TEMAS[temaId].ativo; }
  function aplicarTema() {
    var T = TEMAS[temaId];
    var h2 = (S && S.host) || host; // re-home troca o host — o closure original aponta pro morto
    h2.style.background = (S && S._estiloOn && S._estiloOn()) ? '#fff' : T.fundo; // estilo desenho segura o branco
    bar.style.background = T.bar;
    bar.style.color = T.texto;
    [S.editPanel, S.snapPanel, S.pavPanel, S.visPanel, S.editDist, S.p3dPanel].forEach(function (pn) {
      if (!pn) return;
      pn.style.background = T.painel; pn.style.borderColor = T.borda; pn.style.color = T.texto;
      // re-pinta os toggles ativos DOS PAINÉIS também (chain/orto/ângulo/sub-ferramenta)
      pn.querySelectorAll && pn.querySelectorAll('button').forEach(function (b3) { if (b3.style.background && b3.style.background !== '') b3.style.background = corAtiva(); });
    });
    // re-pinta os botões da toolbar que estavam com a cor ativa antiga (estado ligado sobrevive à troca)
    bar.querySelectorAll('button').forEach(function (b2) { if (b2.style.background && b2.style.background !== '') b2.style.background = corAtiva(); });
    dockRepintar(T); // leques do dock lateral acompanham o tema
    try { localStorage.setItem('orcapro:bim:tema', temaId); } catch (_) {}
  }
  function trocarTema() {
    temaId = temaId === 'orcapro' ? 'revit' : (temaId === 'revit' ? 'claro' : 'orcapro');
    aplicarTema();
    if (S && S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Tema: ' + TEMAS[temaId].nome);
  }
  /* v1.1.127 — a casca (bimshell) precisa MANDAR o tema, não só ciclar: quando o
   * ambiente está no claro do Revit, a cena tem de acompanhar, senão fica uma
   * janela navy no meio de uma interface clara. */
  function definirTema(id) {
    if (!TEMAS[id]) return false;
    temaId = id;
    try { localStorage.setItem('orcapro:bim:tema', id); } catch (_) {}
    aplicarTema();
    return true;
  }
  /* a exposição em S fica LOGO DEPOIS da criação do S (mais abaixo): aqui em
   * cima S ainda vai ser reatribuído, e a referência se perderia. */

  // v1.1.96 — COLORIR POR SISTEMA HIDROSSANITÁRIO (padrão brasileiro, editável pelo usuário).
  // Vale no 3D, na Planta baixa e no imersivo RA/RV de uma vez só, porque o hook está no
  // matBase() — a "aparência-base" única de toda malha; quando o modo está ligado, matBase
  // devolve o material da COR DO SISTEMA no lugar do material original do IFC.
  var SIS_ORDEM = ['agua_fria', 'agua_quente', 'esgoto', 'pluvial', 'gas', 'incendio', 'ventilacao', 'outros'];
  var SIS_PADRAO = {
    agua_fria:   { nome: 'Água fria',        cor: '#2563eb' },
    agua_quente: { nome: 'Água quente',      cor: '#f97316' },
    esgoto:      { nome: 'Esgoto / sanitário', cor: '#7c4a12' },
    pluvial:     { nome: 'Águas pluviais',   cor: '#16a34a' },
    gas:         { nome: 'Gás',              cor: '#eab308' },
    incendio:    { nome: 'Incêndio (PPCI)',  cor: '#dc2626' },
    ventilacao:  { nome: 'Ventilação',       cor: '#7c3aed' },
    outros:      { nome: 'Outros / não classificado', cor: '#8aa0b6' }
  };
  var sisCores = {}; SIS_ORDEM.forEach(function (k) { sisCores[k] = SIS_PADRAO[k].cor; });
  try { var _sc0 = JSON.parse(localStorage.getItem('orcapro:bim:sistemas') || '{}'); SIS_ORDEM.forEach(function (k) { if (_sc0[k] && /^#[0-9a-f]{6}$/i.test(_sc0[k])) sisCores[k] = _sc0[k]; }); } catch (_) {}
  function salvarSisCores() { try { localStorage.setItem('orcapro:bim:sistemas', JSON.stringify(sisCores)); } catch (_) {} }
  var sisColor = { on: false };
  var sisMatCache = {};
  // classifica um elemento por nome/família/tipo/tag num sistema hidrossanitário.
  // Ordem = prioridade: incêndio/gás/exaustão (HVAC) primeiro; "ventilação" simples cai em
  // esgoto (coluna de ventilação sanitária, uso dominante num app hidrossanitário); "água
  // quente" antes de "água fria" (ambas contêm "água"); resto vira "outros".
  function classificaSistemaTxt(s) {
    // "hidrossanitário" é rótulo GUARDA-CHUVA (cobre água fria + esgoto + pluvial…); sem neutralizar,
    // o "sanit" dentro dele cairia em esgoto (marrom). Tira o termo antes de classificar o resto.
    s = String(s || '').toLowerCase().replace(/hidr[oa]ss?anit\w*/g, ' ');
    if (/inc[eê]ndio|hidrante|sprinkler|combate a inc|\bppci\b|\bspk\b/.test(s)) return 'incendio';
    if (/\bg[aá]s\b|\bglp\b|\bgnv\b|g[aá]s natural|combust[ií]v/.test(s)) return 'gas';
    if (/exaust|\bduto\b|\bduct\b|\bhvac\b|\bavac\b|climatiz|ar[ -]?condic/.test(s)) return 'ventilacao';
    if (/pluvial|[aá]guas? ?pluvia|rainwater|\bstorm\b|calha/.test(s)) return 'pluvial';
    if (/esgoto|\besg\b|sanit[aá]ri|sewage|\bwaste\b|\bfoul\b|ventila[çc]/.test(s)) return 'esgoto';
    if (/[aá]gua ?quente|\baq\b|hot ?water|domestichotwater|\bquente\b/.test(s)) return 'agua_quente';
    if (/[aá]gua ?fria|\baf\b|cold ?water|domesticcoldwater|[aá]gua ?pot[aá]vel|[aá]gua|\bwater\b/.test(s)) return 'agua_fria';
    return 'outros';
  }
  function sisTxtEl(e) { return (e.nome || '') + ' ' + (e.familia || '') + ' ' + (e.tipo || '') + ' ' + (e.tag || ''); }
  // v1.1.98 — classifica um elemento pelo SISTEMA do IFC (Esgoto/Água…, sinal correto) e, só se não
  // houver sistema reconhecido, cai no NOME do elemento (que costuma ser genérico "Tubo/duto").
  function classificaEl(e) {
    var k = classificaSistemaTxt(e.sistemaIfc || '');
    if (k === 'outros') k = classificaSistemaTxt(sisTxtEl(e));
    return k;
  }
  // material da cor do sistema, respeitando a transparência do modelo; "outros" fica cinza
  // translúcido pra a tubulação colorida SALTAR na vista (destaque estilo MEP).
  function sisMat(chave, alpha) {
    var cor = sisCores[chave] || sisCores.outros;
    var op = (chave === 'outros' ? 0.30 : 1) * (alpha == null ? 1 : Math.max(0.05, Math.min(1, alpha)));
    op = Math.round(op / 0.05) * 0.05; // quantiza a opacidade: o slider de transparência não cria um material novo por passo (limita o cache a ~8 sistemas × ~20 níveis)
    var transp = op < 0.985;
    var key = chave + '@' + op.toFixed(2) + '@' + cor;
    if (!sisMatCache[key]) sisMatCache[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(cor), roughness: 0.55, metalness: 0.05, transparent: transp, opacity: op, depthWrite: !transp, side: THREE.DoubleSide });
    return sisMatCache[key];
  }
  function limparSisMatCache() { Object.keys(sisMatCache).forEach(function (k) { try { sisMatCache[k].dispose(); } catch (_) {} }); sisMatCache = {}; }
  // roda a classificação uma vez e grava no elemento (e.sistema) e no mesh (userData._sisK,
  // lido rápido pelo matBase a cada repintura).
  function construirSisIdx() {
    (S.elementos || []).forEach(function (e) {
      var k = classificaEl(e);
      e.sistema = k;
      var m = S.meshPorUid[e.uid]; if (m) m.userData._sisK = k;
    });
  }
  /* =====================================================================
   * B3 — OS DOIS CAMPOS QUE A REGRA PRECISA E QUE NAO EXISTIAM
   *
   * ⚠ `pavimento` NUNCA foi campo de elemento. O dado mora no MODELO
   * (`mo.pavimentos[].eids`), e o unico resolvedor era privado, com um
   * consumidor so. Uma regra "do Terreo" devolveria zero — falso vazio, sem
   * erro, e o coordenador concluiria que a obra nao tem nada naquele andar.
   *
   * ⚠ E `sistema` so nascia quando o usuario ligava "Cores por sistema" uma
   * vez: a classificacao rodava dentro de `construirSisIdx`, que so roda
   * naquele modo. Mesmo falso vazio.
   *
   * Aqui os dois sao carimbados na carga, de uma vez. `sistema` continua sendo
   * a CHAVE (e o que `matBase` e a paleta usam); `sistemaNome` e o rotulo
   * legivel, que e o que uma regra escrita por gente compara.
   * ===================================================================== */
  function carimbarConsulta() {
    if (!S || !S.modelos) return 0;
    var porUid = {}, n = 0;
    try {
      pavLista().forEach(function (p) {
        for (var u in p.uids) { if (Object.prototype.hasOwnProperty.call(p.uids, u)) porUid[u] = p.nome; }
      });
    } catch (_) {}
    S.modelos.forEach(function (mo) {
      (mo.elementos || []).forEach(function (e) {
        e.pavimento = porUid[e.uid] || '';
        var k = classificaEl(e);
        e.sistema = k;
        e.sistemaNome = (SIS_PADRAO[k] && SIS_PADRAO[k].nome) || '';
        n++;
      });
    });
    return n;
  }
  /* os valores que EXISTEM no modelo para um campo — o editor de regra oferece
     em vez de exigir que o usuario adivinhe a grafia do projetista */
  function valoresDe(campo) {
    var c = String(campo || ''), cnt = {};
    (S.elementos || []).forEach(function (e) {
      var v = c.indexOf('.') < 0 ? e[c] : ((e[c.split('.')[0]] || {})[c.split('.')[1]]);
      if (v == null || String(v).trim() === '') return;
      var s = String(v);
      cnt[s] = (cnt[s] || 0) + 1;
    });
    return Object.keys(cnt).sort().map(function (v) { return { valor: v, n: cnt[v] }; });
  }

  function sistemasPresentes() {
    var cnt = {};
    (S.elementos || []).forEach(function (e) { var k = e.sistema || classificaEl(e); cnt[k] = (cnt[k] || 0) + 1; });
    return cnt;
  }

  // aplica DEPOIS que S e todos os painéis nasceram (este bloco roda antes da criação do S)
  setTimeout(function () { if (S && S.alive) { S._aplicarTema = aplicarTema; aplicarTema(); } }, 0);

  var hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:3;background:rgba(15,39,64,.85);border:1px solid #24435f;border-radius:8px;padding:6px 10px;font-size:12px;color:#bcd0e4';
  hud.innerHTML = 'Elementos: <b data-h="el">0</b> · Triângulos: <b data-h="tri">0</b>';
  host.appendChild(hud);

  var over = document.createElement('div');
  over.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2;pointer-events:none';
  over.innerHTML = '<div style="pointer-events:auto;text-align:center;background:rgba(15,39,64,.82);border:2px dashed #2e6f9e;border-radius:16px;padding:28px 34px;max-width:420px;color:#dbe8f5"><div style="font-size:34px">' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + '</div><h3 style="margin:8px 0 6px">Arraste um <b>.IFC</b> aqui</h3><p style="color:#a9c1d8;font-size:13px;margin:4px 0">Exporte do Revit/pyRevit e solte — abre em 3D, offline. Ou clique em <b>Carregar exemplo</b>.</p></div>';
  host.appendChild(over);

  var loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;background:rgba(11,26,43,.86);display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:5;color:#dbe8f5';
  loading.innerHTML = '<div style="width:40px;height:40px;border:4px solid #24435f;border-top-color:#16a34a;border-radius:50%;animation:bimsp 1s linear infinite"></div><div data-l="txt">Lendo o IFC…</div>';
  host.appendChild(loading);
  if (!document.getElementById('bim-spin-style')) { var st = document.createElement('style'); st.id = 'bim-spin-style'; st.textContent = '@keyframes bimsp{to{transform:rotate(360deg)}}'; document.head.appendChild(st); }

  // ---- Three ----
  var scene = new THREE.Scene(); scene.background = null;
  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000); camera.position.set(20, 18, 22);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // qualidade de cor "de render": sRGB + tone mapping cinematográfico por padrão
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (_) {}
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  // sombras suaves (qualidade de render + imersão RA/RV) e WebXR habilitado no renderer
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch (_) {}
  try { renderer.xr.enabled = true; } catch (_) {}
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (S) { S.alive = false; if (S.raf) cancelAnimationFrame(S.raf); } try { over.style.display = 'flex'; over.querySelector('div').innerHTML = '<div style="font-size:30px">🧊</div><h3 style="margin:8px 0">O 3D ficou pesado demais</h3><p style="color:#a9c1d8;font-size:13px">A memória de vídeo esgotou (modelos grandes / Ultra). Recarregue a aba BIM com menos modelos, ou desligue o ' + (typeof Icones !== 'undefined' ? Icones.get('escopo', 15) : '') + ' Ultra.</p>'; } catch (_) {} }, false);
  var hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.55); scene.add(hemi); // reduzido: o ambiente PMREM abaixo faz o preenchimento
  var dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(30, 50, 20); scene.add(dir);
  // v1.1.89 — ILUMINAÇÃO BASEADA EM IMAGEM (PMREM): reflexos suaves + shading premium em TODO
  // MeshStandardMaterial (o "look de render" dos melhores visualizadores). Custo ~zero por frame
  // (a env é pré-computada 1×). Os desenhos técnicos (corte/planta) usam material UNLIT (MeshBasic)
  // e NÃO são afetados. Um estúdio procedural (sala + luzes-área) vira a environment map.
  try {
    var _pmrem = new THREE.PMREMGenerator(renderer);
    var _envScn = new THREE.Scene();
    var _room = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 24), new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 1, metalness: 0, color: 0x9fb0c4 }));
    _envScn.add(_room);
    var _areaLuz = function (cor, w, h, d, x, y, z, ganho) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.material.color.setHex(cor).multiplyScalar(ganho); m.position.set(x, y, z); return m; };
    _envScn.add(_areaLuz(0xffffff, 16, 1, 16, 0, 8.5, 0, 3.0));    // teto claro (luz principal difusa)
    _envScn.add(_areaLuz(0xdfeaf7, 1, 10, 12, -11.5, 2, -3, 1.6)); // parede fria à esquerda
    _envScn.add(_areaLuz(0xfff0dc, 1, 10, 12, 11.5, 2, 4, 1.3));   // parede quente à direita
    _envScn.add(_areaLuz(0xc4d0dd, 16, 1, 16, 0, -8.5, 0, 0.6));   // piso claro (bounce de baixo)
    var _envRT = _pmrem.fromScene(_envScn, 0.04);
    scene.environment = _envRT.texture;
    _room.geometry.dispose(); _envScn.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    _pmrem.dispose();
  } catch (eEnv) { /* sem env: cai no shading direto — nunca impede o viewer */ }
  // sombra da luz principal (ligada só quando o usuário entra no imersivo — custa GPU no modelo grande)
  try { dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.near = 1; dir.shadow.camera.far = 400; dir.shadow.bias = -0.0005; var _ds = dir.shadow.camera; _ds.left = -80; _ds.right = 80; _ds.top = 80; _ds.bottom = -80; _ds.updateProjectionMatrix(); } catch (_) {}
  var fill = new THREE.DirectionalLight(0xbfd8ee, 0.35); fill.position.set(-40, 25, -30); scene.add(fill); // luz de preenchimento (sombra menos chapada)
  var grid = new THREE.GridHelper(200, 40, 0x2e6f9e, 0x1c3a58); grid.material.opacity = .5; grid.material.transparent = true; scene.add(grid);
  // ---- sombra de contato (blob radial macio sob o modelo — "assenta" o prédio no chão, barato p/ mobile) ----
  var _chaoTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d');
    var rg = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    rg.addColorStop(0, 'rgba(0,0,0,.42)'); rg.addColorStop(.55, 'rgba(0,0,0,.20)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    var t = new THREE.CanvasTexture(c); return t;
  })();
  var _chao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: _chaoTex, transparent: true, depthWrite: false, opacity: .9 }));
  _chao.rotation.x = -Math.PI / 2; _chao.renderOrder = -1; _chao.raycast = function () {}; scene.add(_chao);
  var orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true; orbit.dampingFactor = .08;
  // web-ifc já entrega a geometria em Y-up (converte o Z-up do IFC) → NÃO rotacionar (rotacionar tombava o modelo)
  var modelRoot = new THREE.Group(); modelRoot.rotation.x = 0; scene.add(modelRoot);

  var matAndamento = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x7a4a06, transparent: true, opacity: .9, metalness: .05, roughness: .8, side: THREE.DoubleSide });
  var selMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x0a5a2a, metalness: .1, roughness: .7 });
  var clashMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x5a0a0a, metalness: .1, roughness: .6 });

  S = { host: host, opts: opts, scene: scene, camera: camera, renderer: renderer, orbit: orbit, modelRoot: modelRoot,
        _definirTema: definirTema,   /* a casca manda o tema da cena (v1.1.127) */
        bar: bar, hud: hud, over: over, loading: loading,
        api: new IfcAPI(), apiReady: false, modelID: -1, meshPorId: {}, elementos: [],
        modelos: [], meshPorUid: {}, ultra: false, _tickExtra: [], _tickPos: [],
        fly: { on: false, keys: {}, speed: 14, yaw: 0, pitch: 0 }, selected: null, prevMat: null,
        matAndamento: matAndamento, selMat: selMat, clashMat: clashMat, _clashSel: [], matCache: {}, raf: 0, alive: true };
  var Sm = S; // instância DESTE mount — guard de identidade p/ closures assíncronas (FileReader/fetch em voo de um viewer morto não podem poluir o viewer novo)
  S.barToggle = barToggle; S._setBarra = setBarra; // recolher/expandir a barra (entra no re-home)
  S._fabObserver = fabObs; S._fabEstilo = aplicarEstiloToggle; S._dockRolar = aoRolar; // FAB mobile: desconectados no desmonte (gate v1.1.114)
  S._dockDocClick = dockDocClick; // fechar-leque-no-toque-fora: removido no desmonte (senão acumula por remount)

  /* ⚠ `S.host`, NÃO o `host` do fecho. Esta função nasce na PRIMEIRA `montar` e
   * fica presa ao host daquela vez. Quando o app re-renderiza a aba BIM (todo
   * `App.render()` refaz o HTML), o viewer é re-parentado num host NOVO e
   * `S.host` é atualizado — mas este fecho continuava medindo o host velho, já
   * fora do documento, cujo clientWidth é 0. Com o `if (w && h)` isso virava um
   * no-op SILENCIOSO: da segunda visita em diante, redimensionar a janela (e o
   * botão novo de esconder a lateral) não mexia mais no canvas, e o modelo
   * ficava esticado. Defeito antigo que o botão novo só tornou visível. */
  function resize() {
    var alvo = (S && S.host) || host;
    var w = alvo.clientWidth, h = alvo.clientHeight;
    if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  S._resize = resize; window.addEventListener('resize', resize); resize();

  // ---- voo ----
  var canvasEl = renderer.domElement, fly = S.fly, _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function setMode(voo) {
    if (S._cancelTween) S._cancelTween(); // qualquer troca de modo (Voo/Órbita e — via setMode(false) — Planta/Corte/Caminhar) cancela o voo cinematográfico pendente
    fly.on = voo; orbit.enabled = !voo;
    bar.querySelector('[data-b="voo"]').classList.toggle('on', voo);
    bar.querySelector('[data-b="voo"]').style.background = voo ? corAtiva() : '';
    bar.querySelector('[data-b="voo"]').style.color = voo ? '#fff' : '';
    bar.querySelector('[data-b="orbita"]').style.background = voo ? '' : corAtiva();
    bar.querySelector('[data-b="orbita"]').style.color = voo ? '' : '#fff';
    if (!voo && document.pointerLockElement) document.exitPointerLock();
  }
  S._setMode = setMode;
  canvasEl.addEventListener('click', function () { if (fly.on && !document.pointerLockElement) canvasEl.requestPointerLock(); });
  S._onKeyDown = function (e) { fly.keys[e.code] = true; if (e.code === 'Escape') { if (S._lupaFechar && S.lupa && S.lupa.on) { S._lupaFechar(); return; } /* 🔍 a lupa sai PRIMEIRO: ela desliga a órbita, e sair da ferramenta antes deixaria a câmera travada */ if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { if (S && S.host && S.host.contains(e.target)) e.target.blur(); return; } if (S.ctecModal && S.ctecModal.style.display === 'flex' && S._fecharCtecModal) { S._fecharCtecModal(); return; } if (S.plantaCfg && S.plantaCfg.style.display !== 'none') { S.plantaCfg.style.display = 'none'; return; } /* painel flutuante só é fechado pelo Esc quando NENHUMA ferramenta está em uso —
   senão o Esc de sair da trena/voo era gasto fechando um painel que o usuário nem olhava */
if (S._fecharPaineis && !(fly.on || (S.medir && S.medir.on) || (S.area && S.area.on) || (S.ang && S.ang.on) || (S.planta && S.planta.on) || (S.corteL && S.corteL.on) || (S.edit && S.edit.on)) && [S.visPanel, S.pavPanel, S.snapPanel, S.xrPanel].some(function (p) { return p && p.style.display === 'flex'; })) { S._fecharPaineis(null); return; } if (S.xr && S.xr.on && S._sairImersivo) { S._sairImersivo(); return; } if (S._ctecCancelar && S._ctecCancelar(true)) return; if (fly.on) setMode(false); if (S.medir && S.medir.on) S._setMedir(false); if (S.area && S.area.on && S._setArea) S._setArea(false); if (S.ang && S.ang.on && S._setAng) S._setAng(false); if (S.planta && S.planta.on) S._setPlanta(false); if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false); if (S.edit && S.edit.on) { if (S.edit.p1 && S._editFimCadeia) { S._editFimCadeia(); return; } if (S._setEdit) S._setEdit(false); } } };
  S._onKeyUp = function (e) { fly.keys[e.code] = false; };
  S._onMouseMove = function (e) { if (!fly.on || !document.pointerLockElement) return; fly.yaw -= e.movementX * 0.0022; fly.pitch -= e.movementY * 0.0022; fly.pitch = Math.max(-1.5, Math.min(1.5, fly.pitch)); };
  window.addEventListener('keydown', S._onKeyDown); window.addEventListener('keyup', S._onKeyUp); document.addEventListener('mousemove', S._onMouseMove);
  function flyStep(dt) {
    var e = new THREE.Euler(fly.pitch, fly.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(e);
    camera.getWorldDirection(_fwd); _right.crossVectors(_fwd, _up).normalize();
    var s = fly.speed * (fly.keys['ShiftLeft'] || fly.keys['ShiftRight'] ? 3 : 1) * dt;
    if (fly.keys['KeyW']) camera.position.addScaledVector(_fwd, s);
    if (fly.keys['KeyS']) camera.position.addScaledVector(_fwd, -s);
    if (fly.keys['KeyD']) camera.position.addScaledVector(_right, s);
    if (fly.keys['KeyA']) camera.position.addScaledVector(_right, -s);
    if (fly.keys['KeyE']) camera.position.addScaledVector(_up, s);
    if (fly.keys['KeyQ']) camera.position.addScaledVector(_up, -s);
  }

  var clock = new THREE.Clock();
  // corpo de 1 quadro: reusado pelo rAF normal E pelo setAnimationLoop do WebXR (sessão VR/AR)
  function renderFrame(dt) {
    if (S._xrWalk) S._xrWalk(dt);          // locomoção do imersivo (andar) — tem prioridade
    else if (fly.on) flyStep(dt); else orbit.update();
    for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](dt); } catch (_) {} }
    renderer.render(scene, camera);
    /* ⚠ GANCHO DEPOIS DO RENDER, e a ordem é o que faz ele existir.
     * Quem precisa COPIAR o quadro desenhado (a lupa do toque) tem de rodar
     * com o buffer ainda válido. O renderer é criado sem `preserveDrawingBuffer`
     * (ligá-lo custa desempenho em toda a frota), então o conteúdo do canvas só
     * pode ser lido DENTRO da mesma tarefa do render — é a mesma restrição que
     * a Foto da vista já contorna. Um `_tickExtra` (que roda ANTES) copiaria o
     * quadro anterior, e a lupa mostraria a cena com um quadro de atraso: no
     * arraste do dedo, justamente o que se está mirando sai defasado. */
    for (var tp = 0; tp < S._tickPos.length; tp++) { try { S._tickPos[tp](dt); } catch (_) {} }
  }
  function tick() { if (!S || !S.alive) return; if (S._xrActive) { S.raf = 0; return; } var dt = Math.min(clock.getDelta(), 0.1); renderFrame(dt); S.raf = requestAnimationFrame(tick); }
  S._renderFrame = renderFrame; S._retomarTick = function () { if (S && S.alive && !S._xrActive && !S.raf) tick(); };
  tick();

  // ---- pick ----
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  // O Raycaster do three NÃO testa object.visible (só layers): sem filtro, o raio acerta elemento
  // OCULTO (modelo desligado no painel, 4D com "futuros" escondidos) na frente do visível — cota da
  // trena e seleção silenciosamente ERRADAS. Na planta, o clipping é só GPU: o raycast CPU ainda
  // acerta o telhado acima do corte. Este filtro resolve as duas famílias.
  function cadeiaVisivel(o) { for (var n = o; n; n = n.parent) { if (n.visible === false) return false; if (n === modelRoot) break; } return true; }
  // três clipa fragmentos onde plane.distanceToPoint(p) < 0 — o mesmo teste aqui mantém CPU==GPU
  // p/ QUALQUER plano ativo (planta baixa OU corte livre), não só o horizontal.
  function foraDoClip(p) {
    var pls = renderer.clippingPlanes || [];
    for (var i = 0; i < pls.length; i++) if (pls[i].distanceToPoint(p) < -1e-6) return true;
    return false;
  }
  function primeiroHit(hits) {
    for (var i = 0; i < hits.length; i++) {
      if (!cadeiaVisivel(hits[i].object)) continue;
      if (foraDoClip(hits[i].point)) continue; // clipado é só GPU; o raycast CPU ainda o acerta
      return hits[i];
    }
    return null;
  }
  canvasEl.addEventListener('dblclick', function (e) {
    if (!S || !S.alive) return;
    if (fly.on) return;
    if (S.edit && S.edit.on && S.edit.sub) return; // desenhando: duplo-clique não seleciona nem abre painel
    if (ctec.ativo) return; // riscando a linha de corte, clique é ponto — não seleção (ANTES de area/ang: mesma ordem do pointerup)
    if (S.medir && S.medir.on) return; // no modo trena o duplo-clique é medição, não seleção
    if (area.on) { if (area.pts.length >= 3) fecharArea(); return; } // no modo área o duplo-clique FECHA o polígono
    if (ang.on) return; // no modo ângulo o clique é ponto — não seleção
    if (S._limparRaioX) S._limparRaioX(); // nova seleção reseta o raio-X (senão o ghostMat vaza pro prevMat)
    var r = canvasEl.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
    if (S.selected) { S.selected.material = S.prevMat; S.selected = null; }
    if (hit && hit.object.userData && hit.object.userData.expressID != null) {
      S.selected = hit.object; S.prevMat = S.selected.material; S.selected.material = selMat;
      contornoSelecao(hit.object); // v1.1.89 — contorno nítido na seleção
      if (!fly.on && !xr.on && !planta.on && !corteL.on) enquadrarObj(new THREE.Box3().setFromObject(hit.object), 2.6); // foco cinematográfico — NÃO na planta/corte (quebraria a moldura travada)
      if (opts.onPick) opts.onPick(propsDe(hit.object.userData.mid != null ? hit.object.userData.mid : S.modelID, hit.object.userData.expressID, hit.object.userData.tipo));
    } else if (opts.onPick) { contornoSelecao(null); opts.onPick(null); }
  });

  // ---- navegação cinematográfica: tween suave de câmera (fly-to / enquadrar) ----
  var _cvT = null; // tween ativo
  function cancelTween() { _cvT = null; } // trocar de modo (voo/planta/corte/caminhar/enquadrar) cancela o voo pendente — senão o tween sobrescreve a câmera do modo novo por ~0,55s (gate v1.1.89)
  S._cancelTween = cancelTween;
  function voarCam(destPos, destTgt, dur) {
    if (!destPos) return;
    _cvT = { p0: camera.position.clone(), p1: destPos.clone(), t0: orbit.target.clone(), t1: (destTgt || orbit.target).clone(), dur: Math.max(0.15, dur || 0.6), e: 0 };
  }
  S._tickExtra.push(function (dt) {
    if (!_cvT) return;
    _cvT.e += dt; var k = Math.min(1, _cvT.e / _cvT.dur);
    var s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
    camera.position.lerpVectors(_cvT.p0, _cvT.p1, s);
    orbit.target.lerpVectors(_cvT.t0, _cvT.t1, s);
    if (k >= 1) _cvT = null;
  });
  // enquadra um box (elemento ou modelo) com voo suave, mantendo a direção de visão atual
  function enquadrarObj(box, fator) {
    if (!box || box.isEmpty()) return;
    var c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    var raio = Math.max(sz.x, sz.y, sz.z, 0.5) * 0.5;
    var dist = (raio / Math.tan((camera.fov * Math.PI / 180) / 2)) * (fator || 1.6);
    var dir = camera.position.clone().sub(orbit.target); if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.55, 0.8); dir.normalize();
    // afrouxa o near ao aproximar de elemento pequeno em modelo grande (near travado em maxDim/1000 cortaria a frente) — só DIMINUI, nunca aumenta (não some o resto do modelo)
    var near = Math.max(0.01, (dist - raio) * 0.5); if (near < camera.near) { camera.near = near; camera.updateProjectionMatrix(); }
    voarCam(c.clone().add(dir.multiplyScalar(dist)), c, 0.55);
  }
  S._enquadrarObj = enquadrarObj; S._voarCam = voarCam;

  // ---- contorno nítido na seleção (lê claro em qualquer fundo, estilo visualizador pro) ----
  var _selLn = null, _selLnMat = null;
  function contornoSelecao(mesh) {
    if (_selLn) { scene.remove(_selLn); if (_selLn.geometry) _selLn.geometry.dispose(); _selLn = null; }
    if (!mesh || !mesh.geometry) return;
    if (mesh.geometry.attributes && mesh.geometry.attributes.position && mesh.geometry.attributes.position.count > 60000) return; // malha densa: sem contorno (EdgesGeometry travaria)
    var arr = arestasDe(mesh.geometry); if (!arr.length) return;
    if (!_selLnMat) _selLnMat = new THREE.LineBasicMaterial({ color: 0x2effa0, depthTest: false, transparent: true, opacity: 0.95 });
    var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    var ln = new THREE.LineSegments(bg, _selLnMat);
    ln.matrixAutoUpdate = false; ln.matrix.copy(mesh.matrixWorld); ln.renderOrder = 1000; ln.raycast = function () {};
    scene.add(ln); _selLn = ln;
  }
  S._contornoSelecao = contornoSelecao;
  // o contorno é um overlay independente na cena (depthTest:false): compõe a visibilidade do elemento
  // selecionado a cada frame (some quando ele fica invisível no 4D, no toggle de modelo, isolar etc.) — regra de ouro
  S._tickExtra.push(function () { if (_selLn) _selLn.visible = !!(S.selected && cadeiaVisivel(S.selected)); });

  // ---- toolbar ----
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-b]'); if (!b) return; var k = b.getAttribute('data-b');
    if (k === 'abrir') bar.querySelector('[data-b="file"]').click();
    else if (k === 'exemplo') carregarExemplo();
    else if (k === 'limpar') limparTudo();
    else if (k === 'tema') trocarTema();
    else if (k === 'ultra') setUltra(!S.ultra);
    // Órbita/Voo SEMPRE encerram as ferramentas (exclusividade nos 2 sentidos); Medir pode
    // coexistir com Planta/Corte (medir na planta e na face do corte é o uso pedido)
    else if (k === 'orbita') { sairFerramentas(); setMode(false); }
    else if (k === 'voo') { sairFerramentas(); setMode(true); }
    else if (k === 'medir') setMedir(!medir.on);
    else if (k === 'area') setArea(!area.on);
    else if (k === 'angulo') setAng(!ang.on);
    else if (k === 'snap') toggleSnapPanel();
    else if (k === 'planta') setPlanta(!planta.on);
    else if (k === 'corte') setCorteL(!corteL.on);
    else if (k === 'p3d') toggleP3dPanel();
    else if (k === 'editar') setEdit(!edit.on);
    else if (k === 'pav') togglePavPanel();
    else if (k === 'vis') toggleVisPanel();
    else if (k === 'xr') toggleXRPanel();
    else if (k === 'sistema') { if (sisColor.on && sisPanel.style.display === 'none') { pintarSisPanel(); sisPanel.style.display = 'flex'; fecharPaineis(sisPanel); } else setSisColor(!sisColor.on); } // modo ligado + legenda fechada por outro painel → reabre a legenda (não desliga as cores)
    else if (k === 'blocok') toggleBlocokPanel();
    else if (k === 'foto') tirarFoto();
    else if (k === 'limpar-medidas') { if (S._limparMedidas) S._limparMedidas(); }
    else if (k === 'req-bim') { if (S._reqAbrir) S._reqAbrir(); }
    else if (k === 'cota') { setCota(!cota.on, 'clicado'); }
    else if (k === 'cota-iguais') {
      if (!cota.chave) { UI0('Toque primeiro num tubo — aí eu cotô todos os iguais a ele.', 'info'); }
      else setCota(true, 'iguais');
    }
    else if (k === 'cota-todas') { setCota(true, 'todas'); }
    else if (k === 'cota-numerar') {
      var pacN = numerarRede();
      if (pacN) {
        var r = pacN.resumo;
        cota.indice = null;                         // o rotulo tem de renascer com o numero
        setCota(true, 'todas');
        UI0(r.numerados + ' tubos numerados em ' + r.ramais + ' ramal(is) · ' + fmtDist(r.metrosNumerados) +
            (r.avulsos ? ' · ' + r.avulsos + ' avulso(s) sem ligacao no IFC' : ''), 'ok');
      }
    }
    else if (k === 'cota-planilha') {
      var pacP = (S._numeracao && S._numeracao()) || numerarRede();
      if (pacP) {
        if (typeof BimTuboXLS === 'undefined') UI0('Gerador de planilha nao carregado.', 'erro');
        else BimTuboXLS.gerar(pacP, {
          nome: 'Tubos por ramal',
          ok: function () { UI0('Planilha gerada: ' + pacP.linhas.length + ' tubos.', 'ok'); },
          erro: function (e) { UI0('Nao consegui gerar a planilha: ' + (e && e.message || e), 'erro'); }
        });
      }
    }
    else if (k === 'cota-limpar') { cota.fixados = {}; cota.chave = null; cotaLimpar(); setCota(false); }
    else if (k === 'fit') { if (planta.on) enquadrarTopo(); else if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(new THREE.Box3().setFromObject(modelRoot), 1.5); else enquadrar(); } // na planta re-centra a vista de topo (não sai); no 3D enquadra suave (cinematográfico)
  });

  /* ------------------------------------------------------------------
   * PONTES PARA A FITA.
   * A ribbon chama estas quatro por nome (js/gestao.js, _bimCascaAcoes).
   * Elas existiam aqui dentro há versões, mas NÃO estavam na API pública:
   * o registro devolvia false e o botão respondia "ainda não está
   * disponível nesta versão" — Voo, Enquadrar tudo, Visibilidade e
   * Pavimentos, todos mudos na fita, todos funcionando no viewer.
   * ------------------------------------------------------------------ */
  S._setVoo = function (on) { sairFerramentas(); setMode(on == null ? !fly.on : !!on); };
  S._fit = function () {
    if (planta.on) enquadrarTopo();
    else if (S._enquadrarObj && !fly.on && !xr.on) S._enquadrarObj(new THREE.Box3().setFromObject(modelRoot), 1.5);
    else enquadrar();
  };
  S._togglePav = togglePavPanel;
  S._toggleVis = toggleVisPanel;
  // MATRIZ MODOS×SAÍDAS (manter em dia ao criar modo novo — regra aprendida no gate v1.1.64):
  //                    medir/area/ang  planta  corteL  ctec(desenho)  isolamento(pav/vis)
  // botão Órbita/Voo    sai            sai     sai     cancela        fica (só visibilidade)
  // Esc                 sai            sai     sai     cancela 1º     fica
  // focarClash          sai            sai     sai     cancela        clash força visible=true nos dele
  // carregarIFC         —              sai     sai     —              restaura (modelo novo nasce visível)
  // removerModelo       limpa          re-ancora re-ancora cancela    restaura se isolado
  // limparTudo          limpa          sai     sai     cancela        restaura
  // fit (Enquadrar)     —              sai     —       —              fica
  // entrar em planta    —              ·       sai     —              fica (planta do pavimento USA isolamento)
  // entrar em corteL    —              sai     ·       cancela-se-via-planta  fica
  // medir/area/ang      exclusivos ENTRE SI    —       —              coexistem com planta/corte
  // aplicarEstado(4D)/mostrarTudo (externos)                          limpam o marcador de isolamento
  // Órbita/Voo SEMPRE encerram o editor INTEIRO (setEdit(false) já limpa a cadeia via editTirarProv);
  // o "Esc encerra só o traço" vive APENAS no handler de Escape — aqui um return deixaria o editor
  // armado com o voo ligado (clique em pointerlock criaria parede acidental persistida)
  function sairFerramentas() { if (S._fecharCtecModal && ctecModal.style.display === 'flex') S._fecharCtecModal(); ctecCancelar(); if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (planta.on) setPlanta(false); if (corteL.on) setCorteL(false); if (S.edit && S.edit.on && S._setEdit) S._setEdit(false); if (cota.on) setCota(false); if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } // fecha o modal do resultado + cobre o estágio "config aberta"
  bar.querySelector('[data-b="file"]').addEventListener('change', function (e) {
    var fs2 = Array.prototype.slice.call(e.target.files || []);
    /* ⚠ A VALIDAÇÃO VIVE AQUI, não no `accept`. Com o filtro do seletor
       desligado no celular (ver aceitaIFC), é este teste que impede mandar uma
       foto para o interpretador de IFC. E ele fazia falta mesmo antes: o
       arrastar-e-soltar filtrava por `.ifc`, o seletor não filtrava nada —
       bastava o cliente trocar o filtro para "Todos os arquivos", coisa que
       todo diálogo do Windows oferece. */
    var bons = fs2.filter(function (f) { return /\.ifc$/i.test(f.name || ''); });
    var maus = fs2.filter(function (f) { return !/\.ifc$/i.test(f.name || ''); });
    bons.forEach(function (f) { abrirArquivo(f); });
    if (maus.length) {
      /* diz o nome do arquivo: "não é IFC" sem dizer qual, com vários
         selecionados, não ajuda ninguém a achar o errado */
      var nm = maus.map(function (f) { return f.name; }).slice(0, 3).join(', ');
      var msg = maus.length === 1
        ? 'O arquivo “' + nm + '” não é um modelo IFC. O BIM abre arquivos terminados em .ifc.'
        : maus.length + ' arquivos não são IFC (' + nm + (maus.length > 3 ? '…' : '') + '). O BIM abre arquivos terminados em .ifc.';
      try { if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg, 'erro'); else alert(msg); } catch (_) {}
    }
    e.target.value = '';
  });
  function onDragOver(e) { e.preventDefault(); }
  function onDrop(e) { e.preventDefault(); Array.prototype.slice.call(e.dataTransfer.files || []).forEach(function (f) { if (/\.ifc$/i.test(f.name)) abrirArquivo(f); }); }
  host.addEventListener('dragover', onDragOver); host.addEventListener('drop', onDrop);
  S._onDragOver = onDragOver; S._onDrop = onDrop; // guardados p/ re-registrar no host novo (re-home)
  function setUltra(on) {
    S.ultra = !!on;
    renderer.setPixelRatio(S.ultra ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMappingExposure = S.ultra ? 1.22 : 1.12;
    dir.intensity = S.ultra ? 1.25 : 1.1; fill.intensity = S.ultra ? 0.5 : 0.35;
    var bu = bar.querySelector('[data-b="ultra"]'); if (bu) { bu.style.background = S.ultra ? '#7c3aed' : ''; bu.style.color = S.ultra ? '#fff' : ''; }
    resize();
  }
  S._setUltra = setUltra;

  function propsDe(mid, expressID, tipoCache) {
    var moS = modeloDe(mid);
    /* ⚠ B1: modelo restaurado do cache tambem nao existe no wasm. Ele NAO cai
       no ramo sintetico (nao foi criado aqui: veio de IFC e tem GlobalId de
       verdade), e nao pode cair no ramo do wasm. Tudo que a tela mostra ja
       esta no cache — o unico que falta e a lista completa de propriedades,
       que o `propsCompletas` trata a parte e declara. */
    if (moS && moS.doCache) {
      var elC = null;
      for (var q4 = 0; q4 < moS.elementos.length; q4++) if (moS.elementos[q4].id === expressID) { elC = moS.elementos[q4]; break; }
      var cbC = (moS.carimbos && moS.carimbos[expressID]) || {};
      var qC = (moS.qto && moS.qto[expressID]) || null;
      var famC = (moS.familias && moS.familias[expressID]) || null;
      return { id: expressID, mid: mid, uid: mid + ':' + expressID,
        /* o nome do Revit primeiro; o rotulo da disciplina so se ele faltar */
        nome: (elC && (elC.nomeIfc || elC.nome)) || '—', tipo: (elC && elC.tipo) || tipoCache || '',
        globalId: (elC && elC.globalId) || '', tag: (elC && elC.tag) || '',
        familia: famC ? famC.familia : ((elC && elC.familia) || ''),
        etapa: cbC.etapa || (elC && elC.etapa) || '', codOrc: cbC.codOrc || (elC && elC.codOrc) || '',
        fase: cbC.fase || (elC && elC.fase) || '', qto: qC,
        area: qC && qC.area, comprimento: qC && qC.comprimento };
    }
    if (moS && moS.sintetico) { // sintético não existe no wasm (GetLine com mid string sondaria o modelo 0 REAL)
      var elS = null; for (var q3 = 0; q3 < moS.elementos.length; q3++) if (moS.elementos[q3].id === expressID) { elS = moS.elementos[q3]; break; }
      var qS = (moS.qto && moS.qto[expressID]) || {};
      // v1.1.82: mesmo CONTRATO do ramo IFC (uid/mid/tipo real/qto) — Propriedades/Salvar família
      // funcionam também pro que foi criado no OrçaPRO (editor ✏️ e 2D→3D)
      return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: (elS && elS.nome) || 'Parede',
        tipo: (elS && elS.tipo) || 'IFCWALL', globalId: moS.editor ? 'criado no OrçaPRO' : '2D→3D', tag: '',
        familia: (elS && elS.nome) || '', etapa: '', codOrc: '', fase: '',
        qto: qS, area: qS.area, comprimento: qS.comprimento };
    }
    try {
      var line = S.api.GetLine(mid, expressID, true);
      var nome = (line.Name && line.Name.value) || '—';
      var tipo = tipoCache || nomeTipo(S.api.GetLineType(mid, expressID));
      var gid = (line.GlobalId && line.GlobalId.value) || '—';
      var moP = modeloDe(mid);
      var cb = (moP && moP.carimbos && moP.carimbos[expressID]) || {};
      var famP = (moP && moP.familias && moP.familias[expressID]) || null;
      var qtoP = (moP && moP.qto && moP.qto[expressID]) || null;
      return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: nome, tipo: tipo, globalId: gid, tag: (line.Tag && line.Tag.value) || '',
        familia: famP ? famP.familia : ((line.ObjectType && line.ObjectType.value) || ''),
        etapa: cb.etapa || '', codOrc: cb.codOrc || '', fase: cb.fase || '', qto: qtoP };
    } catch (e) { return { id: expressID, mid: mid, uid: mid + ':' + expressID, nome: '—', tipo: tipoCache || '', globalId: '', familia: '', etapa: '', codOrc: '', fase: '', qto: null }; }
  }
  function nomeTipo(num) { var raw = ''; try { if (S.api.GetNameFromTypeCode) raw = S.api.GetNameFromTypeCode(num); } catch (_) {} return raw || ('IFC#' + num); }

  // grid + sombra de contato acompanham a pegada atual de modelRoot (chamado por enquadrar E por removerModelo, sem mexer na câmera)
  function reposicionarChao() {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    grid.position.y = box.min.y;
    var fp = Math.max(size.x, size.z) * 1.3 || 20; // folga de 30% na pegada
    _chao.scale.set(fp, fp, 1); _chao.position.set(center.x, box.min.y + 0.01, center.z);
  }
  S._reposicionarChao = reposicionarChao;
  function enquadrar() {
    if (S._cancelTween) S._cancelTween(); // fit instantâneo cancela voo pendente (senão o tween sobrescreve)
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 10, dist = maxDim * 1.6;
    camera.position.set(center.x + dist * .7, center.y + dist * .6, center.z + dist * .7);
    camera.near = maxDim / 1000; camera.far = maxDim * 100; camera.updateProjectionMatrix();
    orbit.target.copy(center); orbit.update();
    fly.yaw = Math.atan2(camera.position.x - center.x, camera.position.z - center.z); fly.pitch = -0.35;
    reposicionarChao();
  }
  S._enquadrar = enquadrar;

  // ============================================================
  // Dica flutuante (usada pela trena e pela planta baixa)
  // ============================================================
  var hint = document.createElement('div');
  hint.setAttribute('data-bim', 'hint'); // âncora estável p/ testes/depuração
  hint.style.cssText = 'position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:4;display:none;pointer-events:none;background:rgba(34,197,94,.94);color:#04240f;font-weight:600;font-size:12.5px;padding:7px 15px;border-radius:20px;box-shadow:0 6px 16px rgba(0,0,0,.35);max-width:90%;text-align:center';
  host.appendChild(hint);
  S.hint = hint; // guardado p/ re-parentar no re-home (senão some ao revisitar a aba)
  /* ⚠ O BALÃO MOSTRAVA O CÓDIGO DO ÍCONE, NÃO O ÍCONE.
   * As mensagens são montadas com `Icones.get(...)`, que devolve MARCAÇÃO SVG
   * como texto. Com `textContent` o navegador escapa tudo, e o usuário lia
   * `<svg class="ic-svg" data-ic="medir" viewBox="0 0 24 24" ...` na frente da
   * dica — em toda ferramenta de medição.
   * O conserto NÃO é trocar por `innerHTML` e pronto: parte do texto que passa
   * por aqui vem de nome de elemento do IFC, que é conteúdo do ARQUIVO do
   * cliente. Injetar isso como HTML seria abrir a tela para o que vier no
   * modelo. Então: o SVG do começo (que é nosso, do `Icones`) entra como
   * marcação; TODO o resto entra como texto, escapado. */
  /* O balão de dica recebe texto COM ícone do próprio app no meio (`Icones.get`
   * devolve um <svg>). Jogar tudo por `innerHTML` seria abrir a tarja para
   * qualquer coisa que um dia chegue aqui vinda de um modelo; jogar tudo por
   * `textContent` é o que fazia o cliente ver `<svg viewBox=...>` escrito na
   * tela — foi o print que abriu esta versão.
   *
   * ⚠ E O CONSERTO PRECISA VALER PARA TODOS OS ÍCONES, não só o primeiro. A
   *   primeira tentativa ancorava em `^` e só desescapava o ícone do começo:
   *   passou no teste (que usava uma mensagem de um ícone só) e deixou o defeito
   *   de pé nas dezenas de mensagens reais que têm ícone NO MEIO da frase —
   *   "Elemento oculto. <svg…> Restaurar tudo…". Meio conserto num defeito
   *   visível é pior que nenhum: dá o assunto por encerrado.
   *
   * A varredura abaixo alterna: texto vira nó de texto, cada <svg>…</svg> vira
   * marcação, quantos forem, em qualquer posição. */
  S._hint = function (msg) {
    if (!msg) { hint.style.display = 'none'; return; }
    while (hint.firstChild) hint.removeChild(hint.firstChild);
    var s = String(msg), ini = 0, m;
    /* ⚠ REGENERA O ÍCONE PELO NOME, NUNCA RECOLA O TRECHO CASADO.
     * A regex é a mesma de `UI._rotuloHtml` (js/ui.js), de propósito: casar o
     * ícone e devolver `m[0]` por innerHTML seria o buraco que aquele arquivo
     * já descreve — basta o nome do pavimento trazer `<svg class="ic-svg">
     * <animate onbegin="…">` e o script roda na origem do app, com acesso a
     * todo o `raerp:*`. Aqui o pior que pode acontecer é sair um ícone da
     * nossa própria biblioteca. */
    var re = /<svg class="ic-svg" data-ic="([A-Za-z0-9_-]+)"[^>]*width="(\d+)"[^>]*>[\s\S]*?<\/svg>/g;
    while ((m = re.exec(s))) {
      if (m.index > ini) hint.appendChild(document.createTextNode(s.slice(ini, m.index)));
      if (typeof Icones !== 'undefined' && Icones.tem && Icones.tem(m[1])) {
        var sp = document.createElement('span');
        sp.style.cssText = 'display:inline-flex;vertical-align:-2px;margin:0 4px 0 0';
        sp.innerHTML = Icones.get(m[1], Number(m[2]) || 15);   // gerado por nós, agora
        hint.appendChild(sp);
      }
      ini = m.index + m[0].length;
    }
    if (ini < s.length) hint.appendChild(document.createTextNode(s.slice(ini)));
    hint.style.display = 'block';
  };

  // ============================================================
  // TRENA (medição) — clique em 2 pontos do modelo e mede a distância real
  // ============================================================
  var medir = { on: false, pts: [], objs: [], down: null, prov: null };
  S.medir = medir;

  // A geometria do web-ifc já vem NORMALIZADA em METROS (o próprio web-ifc aplica o fator da
  // unidade do arquivo). Logo, a distância entre 2 pontos do mundo JÁ é em metros — NÃO se aplica
  // o fator de unidade aqui (isso é só p/ os BaseQuantities do QTO, que vêm em unidade nativa).
  function fmtDist(m) { return m >= 1 ? m.toFixed(2).replace('.', ',') + ' m' : Math.round(m * 100) + ' cm'; }
  function labelSprite(txt) {
    var cv = document.createElement('canvas'), fs = 46, pad = 14;
    var g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
    cv.width = Math.ceil(g.measureText(txt).width) + pad * 2; cv.height = fs + pad * 2;
    g = cv.getContext('2d'); g.font = 'bold ' + fs + 'px Arial';
    g.fillStyle = 'rgba(11,26,43,.94)'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.strokeRect(2, 2, cv.width - 4, cv.height - 4);
    g.fillStyle = '#c7f9d8'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(txt, pad, cv.height / 2 + 2);
    var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.userData._ratio = cv.width / cv.height; sp.userData._sc = 0.028; sp.renderOrder = 999; return sp;
  }
  function pontoMarca(p) {
    var s = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false }));
    s.position.copy(p); s.userData._sc = 0.006; s.renderOrder = 998; return s;
  }
  // marcas e etiquetas ficam do MESMO tamanho na tela em qualquer zoom/escala de modelo:
  // reescala por distância da câmera a cada frame (vãos pequenos — porta, parede — continuam legíveis)
  function rescaleObj(o) {
    var sc = o.userData && o.userData._sc; if (!sc) return;
    var d = camera.position.distanceTo(o.position) * sc;
    if (o.userData._ratio) o.scale.set(d * o.userData._ratio, d, 1); else o.scale.setScalar(d);
  }
  S._tickExtra.push(function () { for (var i = 0; i < medir.objs.length; i++) rescaleObj(medir.objs[i]); });

  /* =====================================================================
   * COTAR REDE — o comprimento que o IFC já traz, em cima da peça.
   *
   * PEDIDO: no canteiro, abrir o projeto e saber o comprimento de cada
   * trecho SEM levantar cota na mão com a trena.
   *
   * ⚠ ESTE CÓDIGO NÃO MEDE NADA. Ele lê `qto.comprimento`, que
   *   `lerQuantitativos` extraiu das BaseQuantities do arquivo e converteu
   *   para metros pela unidade declarada no próprio IFC. Se o projeto não
   *   publicou a quantidade, aqui não sai número — sai o aviso de que não
   *   sai. Um comprimento estimado pela caixa do elemento seria a DIAGONAL
   *   num ramal com caimento: plausível, errado, e em cima da peça que
   *   alguém vai serrar.
   *
   * ⚠ E RECUSA O COMPRIMENTO ANÔNIMO. `compFonte === 'anonima'` é uma
   *   quantidade de comprimento que ninguém batizou — serve para somar num
   *   quantitativo que o engenheiro confere, não para carimbar sobre o tubo,
   *   onde não há contexto para desconfiar.
   *
   * ⚠ SEM `setInterval`. Não existe um único no arquivo, e `desmontarMorto`
   *   não tem linha para timer: um relógio de 6 Hz com closure sobre `S`
   *   sobreviveria ao `S = null` e seguraria cena, renderer e geometrias do
   *   viewer morto para sempre. O ritmo vem do próprio quadro, acumulando
   *   `dt` — que é como o resto do arquivo já faz.
   * ===================================================================== */
  var cota = {
    on: false, modo: 'clicado',      // clicado | iguais | todas
    fixados: {},                     // uid -> 1 (modo clicado)
    chave: null,                     // critério do modo "iguais"
    objs: [],                        // sprites vivos
    porUid: {},                      // uid -> sprite
    indice: null, indiceMarca: -1,
    acum: 0, ultimoCusto: 0, periodo: 0.18,
    semQto: 0, cortadas: 0
  };
  /* teto: sprite é draw call + textura. 1.500 tubos ingênuos ≈ 87 MB de VRAM.
     No dedo o teto é menor porque a tela também é. */
  function cotaTeto() { return ehTelaPequena ? 22 : 48; }
  var COTA_MAX_INDICE = 1500;

  function cotaEhRede(e) {
    var t = String(e.tipo || '').toUpperCase();
    return t === 'IFCFLOWSEGMENT' || t === 'IFCFLOWFITTING' || t === 'IFCFLOWTERMINAL' ||
      t === 'IFCPIPESEGMENT' || t === 'IFCDUCTSEGMENT';
  }
  function cotaComprimento(e) {
    var q = e && e.qto;
    if (!q || !(q.comprimento > 0)) return 0;
    if (q.compFonte === 'anonima') return 0;   // ver o cartão acima
    return q.comprimento;
  }
  /* índice frio: só quem TEM número e âncora. Refeito quando entra/sai modelo. */
  /* ⚠ A MARCA DO CACHE TEM DE COBRIR O QUE MUDA A LISTA, NAO SO O NUMERO DE
   * MODELOS. A primeira versao invalidava por `S.modelos.length`: o editor
   * criando peca, o 4D removendo (`_remEd`) e o proprio carregamento
   * terminando depois do primeiro calculo NAO mexem nesse numero, e o indice
   * ficava congelado. Pego no navegador: cinco tubos entraram na lista e o
   * modo continuou dizendo 'nao achei tubulacao'. */
  function cotaMarca() {
    var nEl = (S.elementos && S.elementos.length) || 0;
    var nRem = S._remEd ? Object.keys(S._remEd).length : 0;
    return S.modelos.length + ':' + nEl + ':' + nRem;
  }
  function cotaIndice() {
    if (cota.indice && cota.indiceMarca === cotaMarca()) return cota.indice;
    var lista = [], sem = 0;
    elementosVivos().forEach(function (e) {
      if (!cotaEhRede(e)) return;
      if (!e.aabb) return;
      var L = cotaComprimento(e);
      if (!L) { sem++; return; }
      if (L < 0.3) return;                     // conexão curta: rótulo maior que a peça
      var a = e.aabb;
      lista.push({
        uid: e.uid, L: L,
        /* âncora pelo aabb JÁ CALCULADO no carregamento (bim.js, load) — refazer
           a união das malhas por elemento seria varrer o modelo inteiro por
           elemento, quadrático, no instante do toque. */
        x: (a.min[0] + a.max[0]) / 2, y: a.max[1], z: (a.min[2] + a.max[2]) / 2,
        chave: (e.familia && String(e.familia).trim()) || String(e.tipo || ''),
        temFamilia: !!(e.familia && String(e.familia).trim())
      });
    });
    cota.semQto = sem; cota.indice = lista; cota.indiceMarca = cotaMarca();
    return lista;
  }
  function cotaLimpar() {
    cota.objs.forEach(function (sp) {
      scene.remove(sp);
      /* ⚠ NÃO usar `limparMarca`: ele dá dispose na geometry, e a de Sprite é
         COMPARTILHADA pelo three — some a de todo mundo. */
      try { if (sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } } catch (_) {}
    });
    cota.objs = []; cota.porUid = {}; cota.cortadas = 0;
  }
  function cotaAlvos() {
    var ix = cotaIndice();
    if (cota.modo === 'todas') return ix;
    if (cota.modo === 'iguais' && cota.chave != null) {
      return ix.filter(function (r) { return r.chave === cota.chave; });
    }
    return ix.filter(function (r) { return cota.fixados[r.uid]; });
  }
  /* uma passada: escolhe QUEM aparece e mantém os sprites em dia. */
  function cotaPassada() {
    if (!cota.on || !S || !S.alive) return;
    var alvos = cotaAlvos(), teto = cotaTeto();
    var vis = [], v = new THREE.Vector3();
    for (var i = 0; i < alvos.length; i++) {
      var r = alvos[i];
      /* respeita o que está desligado: modelo fora, pavimento isolado, 4D,
         plano de corte. Sem isto o botão cota tubo que a tela não mostra. */
      var m = S.meshPorUid && S.meshPorUid[r.uid];
      if (m && (m.visible === false || !cadeiaVisivel(m))) continue;
      v.set(r.x, r.y, r.z);
      if (foraDoClip(v)) continue;
      v.project(camera);
      if (v.z > 1 || v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) continue;  // fora da tela
      vis.push({ r: r, sx: v.x, sy: v.y, d: v.z, fixo: !!cota.fixados[r.uid] });
    }
    /* fixado primeiro, depois o mais perto da câmera — se sobrar espaço */
    vis.sort(function (a, b) { return (b.fixo - a.fixo) || (a.d - b.d); });
    /* grade: duas cotas nunca ocupam a mesma casa. É o que impede a sopa de
       números quando a rede inteira está ligada. */
    var grade = {}, escolhidos = [];
    for (var k = 0; k < vis.length && escolhidos.length < teto; k++) {
      var c = vis[k];
      /* ⚠ grade AFROUXADA de 9 para 6 colunas: com o numero na frente o
         rotulo ficou ~60% mais largo, e a grade antiga deixava dois se
         encavalarem. O corte maior aparece em cota.cortadas, que o
         resumo declara. */
      var gx = Math.round(c.sx * 6), gy = Math.round(c.sy * 14), gk = gx + '|' + gy;
      if (grade[gk] && !c.fixo) continue;
      grade[gk] = 1; escolhidos.push(c);
    }
    cota.cortadas = alvos.length - escolhidos.length;
    /* sincroniza os sprites com o conjunto escolhido */
    var querer = {};
    escolhidos.forEach(function (c) { querer[c.r.uid] = c.r; });
    Object.keys(cota.porUid).forEach(function (uid) {
      if (querer[uid]) return;
      var sp = cota.porUid[uid];
      scene.remove(sp);
      try { if (sp.material) { if (sp.material.map) sp.material.map.dispose(); sp.material.dispose(); } } catch (_) {}
      var ix2 = cota.objs.indexOf(sp); if (ix2 >= 0) cota.objs.splice(ix2, 1);
      delete cota.porUid[uid];
    });
    Object.keys(querer).forEach(function (uid) {
      var jaTem = cota.porUid[uid];
      if (jaTem) {
        /* mesmo uid, texto novo (renumerou) -> refaz; senao fica o antigo */
        var esperado = (numeroDe(uid) ? numeroDe(uid) + ' · ' : '') + fmtDist(querer[uid].L);
        if (jaTem.userData && jaTem.userData._txt === esperado) return;
        scene.remove(jaTem);
        try { if (jaTem.material) { if (jaTem.material.map) jaTem.material.map.dispose(); jaTem.material.dispose(); } } catch (_) {}
        var ixv = cota.objs.indexOf(jaTem); if (ixv >= 0) cota.objs.splice(ixv, 1);
        delete cota.porUid[uid];
      }
      var r2 = querer[uid];
      /* ⚠ o rotulo guarda o TEXTO que desenhou. O laco decide por uid, e sem
         isto renumerar a rede deixaria o numero velho na tela: mesmo uid,
         sprite reaproveitado, texto congelado. */
      var txt = (numeroDe(uid) ? numeroDe(uid) + ' · ' : '') + fmtDist(r2.L);
      var sp = labelSprite(txt);
      sp.userData._txt = txt;
      /* com muitas cotas, `depthTest:false` (o padrão de labelSprite, certo
         para UMA cota da trena) faz todas atravessarem a parede e virarem
         sopa. Só a fixada pelo toque continua sempre visível. */
      if (!cota.fixados[uid] && sp.material) { sp.material.depthTest = true; sp.renderOrder = 0; }
      sp.position.set(r2.x, r2.y + 0.06, r2.z);
      scene.add(sp); rescaleObj(sp);
      cota.objs.push(sp); cota.porUid[uid] = sp;
    });
  }
  /* =====================================================================
   * NUMERAR A REDE — R01-T001, seguindo o encadeamento.
   *
   * ⚠ A FONTE É `elementosVivos()`, NUNCA `cota.indice`.
   *   Aquele índice descarta tubo abaixo de 30 cm porque o rótulo ficaria
   *   maior que a peça — estética de sprite. Medido no projeto real: 732 dos
   *   1.725 tubos, 42,4%. Usá-lo aqui entregaria uma folha com 993 tubos e
   *   1.580,55 m sob um cabeçalho dizendo 1.725 e 1.667,20 m, e quebraria o
   *   encadeamento: R01-T013 seguido de R01-T015 com uma peça de 17 cm entre
   *   os dois na parede. Filtro de tela não decide papel de obra.
   * ===================================================================== */
  var num = { pacote: null, marca: null, porUid: {} };
  /* fator de comprimento do arquivo, memoizado: a bitola sai em unidade do
     projeto, igual as quantidades */
  var _fLen = {};
  function fatorLen(mid) {
    if (_fLen[mid] != null) return _fLen[mid];
    /* ⚠ B1: o fator de unidade do arquivo vem do cache; sondar o WASM com mid
       string devolveria a unidade de outro arquivo, e a bitola sairia em
       milimetro onde era metro */
    var moF = modeloDe(mid);
    if (semWasm(moF)) { _fLen[mid] = +(moF.fatorLenCache) || 1; return _fLen[mid]; }
    var b = 1;
    try { var x = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (x != null) b = x; } catch (_) {}
    _fLen[mid] = b; return b;
  }
  function numerarRede() {
    if (!S || !S.alive) return null;
    if (typeof BimTubo === 'undefined') { UI0('Motor de numeração não carregado.', 'erro'); return null; }
    var pecas = {}, mids = {};
    elementosVivos().forEach(function (e) {
      if (!e || !e.uid) return;
      mids[e.mid] = 1;
      var Le = cotaComprimento(e);
      pecas[e.uid] = {
        id: e.id, uid: e.uid, tipo: e.tipo, nome: e.nome, familia: e.familia,
        sistema: e.sistema || '', pavimento: e.pavimento || '',
        L: Le, compFonte: (e.qto && e.qto.compFonte) || '',
        /* so para TUBO com medida: a bitola custa 4 GetLine por peca, e nao
           faz falta em conexao — o que vai para a lista de corte e o tubo */
        dnMm: (Le > 0 && BimTubo.ehTubo(e) && e.mid != null) ? lerBitolaMm(e.mid, e.id, fatorLen(e.mid)) : 0
      };
    });
    /* topologia de TODOS os modelos abertos, unida — a rede pode vir federada */
    var topo = { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
    Object.keys(mids).forEach(function (mid) {
      var t;
      try { t = lerTopologiaRede(isNaN(+mid) ? mid : +mid); } catch (_) { return; }
      if (!t) return;
      Object.keys(t.portaDe).forEach(function (p) { topo.portaDe[p] = t.portaDe[p]; });
      Object.keys(t.ligacao).forEach(function (p) { topo.ligacao[p] = t.ligacao[p]; });
      Object.keys(t.portasDe).forEach(function (u) { topo.portasDe[u] = (topo.portasDe[u] || []).concat(t.portasDe[u]); });
      Object.keys(t.dirPorta).forEach(function (p) { topo.dirPorta[p] = t.dirPorta[p]; });
      topo.nPortas += t.nPortas; topo.nLigacoes += t.nLigacoes;
    });
    if (!topo.nLigacoes) {
      UI0('Este IFC não publica a ligação entre as peças. Dá para listar os tubos, não para encadeá-los.', 'erro');
      return null;
    }
    var pac = BimTubo.numerar(pecas, topo);
    pac.topo = { portas: topo.nPortas, ligacoes: topo.nLigacoes };
    num.pacote = pac; num.marca = cotaMarca(); num.porUid = {};
    pac.linhas.forEach(function (l) { num.porUid[l.uid] = l.n; });
    return pac;
  }
  function numeroDe(uid) { return (num.marca === cotaMarca()) ? (num.porUid[uid] || '') : ''; }
  S._numerarRede = numerarRede;
  S._numeracao = function () { return (num.marca === cotaMarca()) ? num.pacote : null; };

  /* aviso curto; cai no toast da Gestão quando existir, senão fica só no viewer */
  function UI0(msg, tipo) {
    try { if (typeof UI !== 'undefined' && UI.toast) { UI.toast(msg, tipo || 'info'); return; } } catch (_) {}
    try { if (S && S._hint) S._hint(msg); } catch (_) {}
  }
  function cotaResumo() {
    var alvos = cotaAlvos(), soma = 0;
    alvos.forEach(function (r) { soma += r.L; });
    var t = alvos.length + ' trecho(s) · ' + fmtDist(soma);
    if (cota.cortadas > 0) t += ' · mostrando as ' + (alvos.length - cota.cortadas) + ' mais legíveis';
    if (cota.semQto > 0) t += ' · ' + cota.semQto + ' sem comprimento no IFC';
    return t;
  }
  function setCota(on, modo) {
    if (!S) return;
    if (on && (fly.on || xr.on)) { UI0('Saia do modo Voo/RA-RV para cotar a rede.', 'erro'); return; }
    if (on) { sairFerramentasMenosCota(); }
    cota.on = !!on;
    if (modo) cota.modo = modo;
    if (!cota.on) { cotaLimpar(); }
    else {
      var ix = cotaIndice();
      if (!ix.length) {
        cota.on = false;
        UI0(cota.semQto > 0
          ? 'Este IFC não traz o comprimento das peças (' + cota.semQto + ' sem quantidade). Quem exportou precisa marcar "exportar quantidades base".'
          : 'Não achei tubulação neste modelo.', 'erro');
      } else if (cota.modo === 'todas' && ix.length > COTA_MAX_INDICE) {
        cota.on = false;
        UI0('São ' + ix.length + ' trechos — demais para mostrar de uma vez. Isole um pavimento ou um sistema e tente de novo.', 'erro');
      } else {
        cota.acum = cota.periodo;   // primeira passada no próximo quadro
        UI0(cotaResumo() + ' · comprimento do trecho como foi modelado', 'ok');
      }
    }
    var b = bar.querySelector('[data-b="cota"]');
    if (b) { b.classList.toggle('on', cota.on); b.style.background = cota.on ? '#16a34a' : ''; b.style.color = cota.on ? '#fff' : ''; }
    if (!cota.on) cotaLimpar();
    atualizarCursor();
  }
  /* desliga as OUTRAS ferramentas sem chamar sairFerramentas (que desligaria a
     cota que estamos ligando — laço) */
  function sairFerramentasMenosCota() {
    if (medir.on) setMedir(false);
    if (area.on) setArea(false);
    if (ang.on) setAng(false);
    if (S.edit && S.edit.on && S._setEdit) S._setEdit(false);
  }
  S._setCota = setCota;
  S._cotaIndice = function () { var ix = cotaIndice(); return { total: ix.length, semQto: cota.semQto, amostra: ix.slice(0, 3) }; };
  S._cotaEstado = function () { return { on: cota.on, modo: cota.modo, n: cota.objs.length, cortadas: cota.cortadas, semQto: cota.semQto, fixados: Object.keys(cota.fixados).length, chave: cota.chave, periodo: cota.periodo, custo: cota.ultimoCusto }; };

  S._tickExtra.push(function (dt) {
    if (!cota.on) return;
    for (var i = 0; i < cota.objs.length; i++) rescaleObj(cota.objs[i]);
    cota.acum += (dt || 0.016);
    if (cota.acum < cota.periodo) return;
    cota.acum = 0;
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    cotaPassada();
    if (t0) {
      cota.ultimoCusto = performance.now() - t0;
      /* auto-freio: a passada custou caro (modelo grande, aparelho fraco)?
         espaça em vez de engasgar o quadro — mesma lição do snap. */
      cota.periodo = cota.ultimoCusto > 8 ? 0.5 : 0.18;
    }
  });
  function btnCotas() { var b = bar.querySelector('[data-b="limpar-medidas"]'); if (b) b.style.display = medir.objs.length ? '' : 'none'; if (S && S._ajustarTop) S._ajustarTop(); } // botão entra/sai -> a barra (flex-wrap) pode mudar de altura
  function addMed(o) { scene.add(o); medir.objs.push(o); rescaleObj(o); }
  function desenharMedida(a, b) {
    // na PLANTA mede-se a distância HORIZONTAL (projeção XZ) — é o que a planta representa;
    // em 3D livre, a distância real. A ETIQUETA declara "(horizontal)" pra não haver
    // diferença semântica silenciosa entre os dois modos.
    var dxz = Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));
    var horizontal = !!planta.on, d = horizontal ? dxz : a.distanceTo(b);
    if (d < 2e-3) return false; // pontos coincidentes (duplo-clique/acidente) -> ignora
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false })); line.renderOrder = 997;
    var lab = labelSprite(fmtDist(d) + (horizontal ? ' (horizontal)' : '')); lab.position.copy(a.clone().add(b).multiplyScalar(0.5));
    var mA = pontoMarca(a), mB = pontoMarca(b);
    addMed(mA); addMed(mB); addMed(line); addMed(lab); btnCotas();
    medir.ultima = { valor: d, horizontal: horizontal }; // introspecção (UI futura + testes)
    return true;
  }
  function limparMarca(o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
  function tirarProv() { if (!medir.prov) return; var i = medir.objs.indexOf(medir.prov); if (i >= 0) { limparMarca(medir.prov); medir.objs.splice(i, 1); } medir.prov = null; }
  function limparMedidas() { medir.prov = null; area.pts = []; area.tmp = []; ang.pts = []; ang.tmp = []; medir.objs.forEach(limparMarca); medir.objs = []; medir.pts = []; btnCotas(); }
  S._limparMedidas = limparMedidas;
  // cursor único p/ as 3 ferramentas de medição (trena/área/ângulo)
  function atualizarCursor() { canvasEl.style.cursor = (medir.on || area.on || ang.on) ? 'crosshair' : ''; }
  function setMedir(on) {
    medir.on = !!on;
    if (on) { setMode(false); if (area.on) setArea(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); } // pode coexistir com Planta/Corte; exclusivo entre medições e editor
    else { medir.pts = []; tirarProv(); btnCotas(); esconderSnapMarca(); } // sai: descarta 1º ponto pendente
    var bm = bar.querySelector('[data-b="medir"]'); if (bm) { bm.style.background = on ? corAtiva() : ''; bm.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena na planta: clique em 2 pontos — a cota é a distância horizontal.' : '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.') : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setMedir = setMedir;
  // captura por CLIQUE-SEM-ARRASTE (não atrapalha a órbita: se arrastou, é rotação).
  // O MESMO caminho serve a trena e o desenho da linha do corte técnico — ambos com snap.
  var _ultimosHits = []; // objetos DISTINTOS visíveis/não-clipados do último raio (o snap de ✚ interseção usa até 2)
  function raycastEm(clientX, clientY) {
    var rc = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hits = ray.intersectObjects(modelRoot.children, true);
    _ultimosHits = [];
    /* ⚠ ATÉ TRÊS, não dois. O ponto que o projetista quer costuma ser onde
       TRÊS coisas se encontram — tubo entrando na parede junto da laje, viga
       apoiada no pilar contra a alvenaria. Com o teto em 2, o terceiro
       elemento ficava fora da varredura e o canto que estava na tela
       simplesmente não existia como candidato. */
    for (var hh = 0; hh < hits.length && _ultimosHits.length < 3; hh++) {
      if (!cadeiaVisivel(hits[hh].object) || foraDoClip(hits[hh].point)) continue;
      var repetido = false;
      for (var uh = 0; uh < _ultimosHits.length; uh++) if (_ultimosHits[uh].object === hits[hh].object) { repetido = true; break; }
      if (repetido) continue; // OBJETOS distintos (canto parede×viga×laje)
      _ultimosHits.push(hits[hh]);
    }
    return _ultimosHits[0] || null;
  }
  S._raycastEm = raycastEm; S._aplicarSnapRef = function (h, r) { return aplicarSnap(h, r); }; S._foraDoClipRef = foraDoClip; // hooks p/ E2E

  /* =====================================================================
   * B2 — AGREGACAO DE GEOMETRIA (motor puro em js/bimagreg.js)
   *
   * MEDIDO no modelo real da RA antes de existir esta funcao: 950 draw calls
   * para 452 pecas, com mediana de 12 triangulos por chamada. A placa de video
   * nao faz nada; e tudo custo de chamada.
   *
   * ⚠ E O DESENHO QUE EVITA REESCREVER O PRODUTO INTEIRO. Uma malha por peca e
   * invariante da qual dependem ~140 pontos deste arquivo: clique, trena,
   * encaixe, isolar, raio-X, cor por disciplina e por sistema, 4D, conflito.
   * Reescrever os 140 e o caminho que a tabela de riscos marca com
   * probabilidade ALTA de quebrar justamente a trena e o corte tecnico.
   *
   * Em vez disso, as malhas por peca CONTINUAM existindo e continuam sendo a
   * verdade — elas so param de ser DESENHADAS. Isso e feito por CAMADA, nao por
   * `visible`, e a diferenca importa:
   *
   *   peca (proxy) ....... layers.set(1)  -> a camera (layer 0) nao desenha
   *   malha mesclada ..... layers.set(0)  -> e o que aparece na tela
   *   raycaster .......... layers.set(1)  -> o clique so ve as pecas
   *
   * Conferido no three r150 vendorizado, nao suposto: a camera ignora a camada
   * 1; `Box3.setFromObject` NAO olha camada (entao enquadrar, corte e planta
   * seguem iguais); e o `.visible` de cada peca continua sendo do produto, o
   * que mantem `cadeiaVisivel` funcionando sem uma linha de mudanca.
   *
   * Sobra espelhar duas coisas na malha mesclada: quem esta oculto e de que cor
   * cada peca esta. Isso e feito uma vez por quadro, por ASSINATURA — e nao
   * tocando nos 48 pontos que escrevem `.visible` e nos 19 que trocam
   * `.material`. Um ponto esquecido ali seria uma peca que some da tela sem
   * motivo, e o esquecimento nao teria como ser notado.
   * ===================================================================== */
  /* ⚠ LIGADA POR PADRAO, E DESLIGAVEL DE UM JEITO QUE SOBREVIVE AO RELOAD.
   * A tabela de riscos manda manter o caminho antigo alcancavel, e uma bandeira
   * so em memoria nao serve de rollback: se a agregacao estragasse a cena, o
   * primeiro reflexo do usuario e recarregar a pagina — e ela voltaria ligada.
   * Gravada em preferencia, `BIM.agregacao(false)` resolve de vez, e a linha
   * cabe num recado de suporte. */
  var AGREG = { on: true };
  try { AGREG.on = localStorage.getItem('orcapro:bim:agregar') !== '0'; } catch (_) {}
  /* o clique passa a olhar so a camada das pecas desde a montagem — sem isto,
     abrir um modelo com a bandeira ja ligada deixaria o raio sem alvo */
  if (AGREG.on) ray.layers.set(1);

  function _corDoMaterial(mat) {
    if (!mat) return [1, 1, 1, 1];
    var c = mat.color || { r: 1, g: 1, b: 1 };
    var a = (mat.transparent && typeof mat.opacity === 'number') ? mat.opacity : 1;
    return [c.r, c.g, c.b, a];
  }

  function agregarModelo(mo) {
    if (!AGREG.on || !mo || mo._agreg || typeof window === 'undefined' || !window.BimAgreg) return false;
    var geos = {}, insts = [];
    for (var i = 0; i < mo.grupo.children.length; i++) {
      var m = mo.grupo.children[i];
      if (!m.isMesh || m.userData.expressID == null || !m.geometry || !m.geometry.index) continue;
      var pa = m.geometry.attributes.position, na = m.geometry.attributes.normal;
      if (!pa || !na) continue;
      var k = m.uuid;
      geos[k] = { pos: pa.array, nor: na.array, idx: m.geometry.index.array };
      /* a matriz do OBJETO (o grupo do modelo e identidade): a mesma que a
         abertura aplicou com applyMatrix4 */
      insts.push({ e: m.userData.expressID, g: k, m: m.matrix.elements, cor: _corDoMaterial(m.userData.matOrig || m.material), ref: m });
    }
    if (!insts.length) return false;

    var plano = BimAgreg.planejar({ instancias: insts, geometrias: geos });
    /* ⚠ TODOS OS MODELOS DA OBRA USAM A MESMA ORIGEM. Origens diferentes por
       modelo desalinhariam a federacao — que e o D7 acontecendo por dentro. */
    if (!S._origemAgreg) S._origemAgreg = BimAgreg.origemDe(plano);
    var origem = S._origemAgreg;

    var grupo = new THREE.Group();
    grupo.userData.agregadoDe = mo.mid;
    var partes = [];
    for (var b = 0; b < plano.buckets.length; b++) {
      var bucket = plano.buckets[b];
      var built = BimAgreg.construir(bucket, geos, origem);
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(built.pos, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(built.nor, 3));
      /* RGBA: o alfa por vertice e o que deixa raio-X e transparencia por peca
         continuarem funcionando sem material por peca */
      var cores = new Float32Array(built.pos.length / 3 * 4);
      bg.setAttribute('color', new THREE.BufferAttribute(cores, 4));
      bg.setIndex(new THREE.BufferAttribute(built.idx, 1));
      var mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, metalness: .05, roughness: .85, side: THREE.DoubleSide, depthWrite: true });
      var malha = new THREE.Mesh(bg, mat);
      malha.position.set(origem[0], origem[1], origem[2]);
      malha.layers.set(0);
      malha.userData.agregado = true;
      malha.frustumCulled = false;   /* a caixa cobre o modelo inteiro; culling aqui so custa */
      grupo.add(malha);
      partes.push({ malha: malha, faixas: built.faixas, idxCheio: built.idx, cores: cores, bucket: bucket });
    }
    /* ⚠ FORA DO modelRoot, DE PROPOSITO — e isto foi aprendido quebrando.
       Onze lugares deste arquivo varrem `modelRoot.children` e tratam os filhos
       de cada grupo como PECAS: isolar pavimento, contar visiveis, raio-X. Com
       o grupo mesclado ali dentro, `todasMalhas` apagava as malhas mescladas
       junto (elas nao tem expressID, entao a conta dava "nao pertence") e
       isolar um pavimento escondia o modelo inteiro. Medido: 2 triangulos na
       tela onde o caminho antigo mostrava 394.
       Pendurar no `scene` e espelhar a transformacao do modelRoot resolve os
       onze de uma vez, e o proximo varredor que alguem escrever ja nasce
       imune. */
    scene.add(grupo);
    mo._agreg = { grupo: grupo, partes: partes, origem: origem, assinatura: null };

    /* as pecas saem da camera, mas continuam no raio e no bbox */
    for (var q = 0; q < mo.grupo.children.length; q++) if (mo.grupo.children[q].isMesh) mo.grupo.children[q].layers.set(1);
    _reaplicarAparencia(mo._agreg);   /* pinta ja: chamar o sync daqui recursaria */
    return true;
  }

  function desagregarModelo(mo) {
    if (!mo || !mo._agreg) return;
    try {
      mo._agreg.partes.forEach(function (p) {
        if (p.malha.geometry) p.malha.geometry.dispose();
        if (p.malha.material) p.malha.material.dispose();
      });
      scene.remove(mo._agreg.grupo);
    } catch (_) {}
    mo._agreg = null;
    for (var q = 0; q < mo.grupo.children.length; q++) if (mo.grupo.children[q].isMesh) mo.grupo.children[q].layers.set(0);
  }

  /* ⚠ ESPELHAMENTO POR ASSINATURA, uma vez por quadro. A alternativa era marcar
     "sujo" nos 48 + 19 pontos que mexem em visibilidade e material — e o ponto
     esquecido seria uma peca que some ou fica da cor errada, sem erro nenhum.
     A assinatura le dois campos por peca; num modelo de 40 mil pecas isso e
     algumas decimas de milissegundo, pago uma vez por quadro. */
  /* ⚠ MISTURA DE OPACO COM TRANSPARENTE NO MESMO MATERIAL — o limite honesto
   * da agregacao, e ele foi MEDIDO, nao previsto. O raio-X deixa a peca alvo
   * OPACA e o resto FANTASMA. Numa malha mesclada ha um material so: ligar
   * `transparent` nele tira o depth-write de todo o conjunto, inclusive da peca
   * em destaque, e o resultado sai diferente — 4,18% dos pixels, medido no
   * modelo real da RA contra o caminho antigo.
   *
   * Transparencia UNIFORME (o controle do painel de modelos) nao tem esse
   * problema: todo mundo transparente ordena igual. O que quebra e a MISTURA.
   *
   * Entao, enquanto ela existir, aquele modelo volta a desenhar peca a peca —
   * que e o rollback que a tabela de riscos prescreve, aplicado sozinho e so
   * onde faz falta. O raio-X e modo de inspecao: paga as chamadas enquanto
   * esta ligado e devolve o ganho ao sair. */
  function _lerEstadoDoModelo(mo) {
    var filhos = mo.grupo.children, sig = 0, porMat = {}, misto = false;
    for (var k = 0; k < filhos.length; k++) {
      var m = filhos[k];
      if (!m.isMesh) continue;
      sig = (sig * 33 + (m.visible === false ? 1 : 2)) | 0;
      sig = (sig * 33 + (m.material ? m.material.id : 0)) | 0;
      if (m.visible === false || misto) continue;
      /* ⚠ A MISTURA QUE IMPORTA E DENTRO DE UM MESMO MATERIAL, nao no modelo.
         Quase todo IFC tem vidro junto com concreto — isso e NORMAL e cada um
         vira um bucket proprio, uniforme. O que a malha mesclada nao consegue
         representar e o mesmo material com umas pecas opacas e outras
         fantasma, que e exatamente o que o raio-X faz. A primeira versao desta
         regra olhava o modelo inteiro e suspendia a agregacao em qualquer
         arquivo com vidro — quer dizer, quase sempre. */
      var base = m.userData.matOrig ? m.userData.matOrig.id : 0;
      var op = (m.material && m.material.transparent) ? m.material.opacity : 1;
      if (porMat[base] === undefined) porMat[base] = op;
      else if (Math.abs(porMat[base] - op) > 0.001) misto = true;
    }
    return { sig: sig, misto: misto };
  }

  function sincronizarAgregado() {
    if (!AGREG.on || !S || !S.modelos) return;
    for (var i = 0; i < S.modelos.length; i++) {
      var mo = S.modelos[i];
      var est = _lerEstadoDoModelo(mo);

      if (est.misto) {
        /* suspende: enquanto durar a mistura, este modelo desenha peca a peca */
        if (mo._agreg) { desagregarModelo(mo); mo._agregSuspenso = 1; }
        continue;
      }
      if (mo._agregSuspenso) { mo._agregSuspenso = 0; agregarModelo(mo); }

      var ag = mo._agreg;
      if (!ag) continue;
      /* segue o modelRoot: o imersivo o move e escala, e o corte tecnico
         depende de a malha estar onde a peca esta */
      ag.grupo.position.copy(modelRoot.position);
      ag.grupo.quaternion.copy(modelRoot.quaternion);
      ag.grupo.scale.copy(modelRoot.scale);
      ag.grupo.visible = modelRoot.visible !== false && mo.grupo.visible !== false;
      if (est.sig === ag.assinatura) continue;
      ag.assinatura = est.sig;
      _reaplicarAparencia(ag);
    }
  }

  /* ⚠ A PECA EM DESTAQUE E DESENHADA POR ELA MESMA. Os materiais de realce do
   * produto (selecao, 4D em andamento, conflito) tem `emissive` — eles BRILHAM.
   * Cor por vertice nao expressa emissao, e aproximar somando a cor deixaria o
   * destaque mais apagado do que o usuario conhece: medido, 0,74% dos pixels de
   * diferenca, todos em cima da peca selecionada.
   * Em vez de aproximar, a peca volta para a camada da camera e desenha com o
   * material de verdade, e o mesclado a omite. Custa uma chamada por peca em
   * destaque — normalmente uma — e o realce sai exato. */
  function _ehRealce(mat) {
    return !!(mat && mat.emissive && (mat.emissive.r > 0.002 || mat.emissive.g > 0.002 || mat.emissive.b > 0.002));
  }

  function _reaplicarAparencia(ag) {
    for (var p = 0; p < ag.partes.length; p++) {
      var parte = ag.partes[p], fx = parte.faixas, ocultos = {};
      var algumTransp = false;
      for (var f = 0; f < fx.length; f++) {
        var faixa = fx[f], ref = faixa.ref;
        if (!ref) continue;
        if (_ehRealce(ref.material)) {
          /* sai do mesclado e volta a ser desenhada por si */
          ocultos[faixa.e] = 1;
          if (ref.visible !== false) ref.layers.set(0); else ref.layers.set(1);
          continue;
        }
        ref.layers.set(1);
        if (ref.visible === false) { ocultos[faixa.e] = 1; continue; }
        var c = _corDoMaterial(ref.material);
        if (c[3] < 1) algumTransp = true;
        var ini = faixa.iniVert * 4, fim = ini + faixa.nVert * 4;
        for (var v = ini; v < fim; v += 4) { parte.cores[v] = c[0]; parte.cores[v + 1] = c[1]; parte.cores[v + 2] = c[2]; parte.cores[v + 3] = c[3]; }
      }
      parte.malha.geometry.attributes.color.needsUpdate = true;
      /* ⚠ so transparente quando ha o que ser transparente: material com
         transparent ligado sempre paga ordenacao e perde depth-write */
      if (parte.malha.material.transparent !== algumTransp) {
        parte.malha.material.transparent = algumTransp;
        parte.malha.material.depthWrite = !algumTransp;
        parte.malha.material.needsUpdate = true;
      }
      var r = BimAgreg.indicesVisiveis(fx, parte.idxCheio, ocultos, parte.idxVis);
      parte.idxVis = r.idx;
      var attr = parte.malha.geometry.index;
      if (attr.array !== r.idx) parte.malha.geometry.setIndex(new THREE.BufferAttribute(r.idx, 1));
      parte.malha.geometry.index.needsUpdate = true;
      parte.malha.geometry.setDrawRange(0, r.nIdx);
    }
  }

  function ligarAgregacao(on) {
    var novo = !!on;
    if (novo === AGREG.on) return AGREG.on;
    AGREG.on = novo;
    try { localStorage.setItem('orcapro:bim:agregar', novo ? '1' : '0'); } catch (_) {}
    if (novo) {
      /* o clique passa a olhar SO a camada das pecas */
      ray.layers.set(1);
      S.modelos.forEach(function (mo) { agregarModelo(mo); });
    } else {
      ray.layers.set(0); ray.layers.enable(1);
      S._origemAgreg = null;
      S.modelos.forEach(function (mo) { desagregarModelo(mo); });
    }
    return AGREG.on;
  }
  S._agregar = agregarModelo; S._desagregar = desagregarModelo; S._ligarAgregacao = ligarAgregacao;
  S._agregEstado = function () {
    if (!AGREG.on) return { on: false };
    var malhas = 0, tri = 0;
    S.modelos.forEach(function (mo) {
      if (!mo._agreg) return;
      mo._agreg.partes.forEach(function (p) { malhas++; tri += p.idxCheio.length / 3; });
    });
    return { on: true, malhasMescladas: malhas, triangulos: tri, origem: S._origemAgreg };
  };
  /* o espelhamento anda com o quadro — e o mesmo gancho que a lupa e as cotas usam */
  S._tickExtra.push(function () { sincronizarAgregado(); });
  /* ⚠ `cota.on` PRECISA estar aqui. O `pointerup` sai cedo quando nenhuma
     ferramenta consome clique (a porteira logo abaixo), e sem esta linha o
     botao Cotar ficaria MUDO: sem raycast, sem erro, sem log. */
  function ferramentaClique() { return medir.on || area.on || ang.on || ctec.ativo || cota.on || (S.edit && S.edit.on); } // quem consome clique-sem-arraste (editor SEM sub-ferramenta = clique mostra parâmetros)
  // GUARD ÚNICO anti-ponto-fantasma (gate v1.1.69): quando um clique FECHA uma medição/linha
  // (área, ângulo, trena, corte técnico), o pointerup IRMÃO do duplo-clique chegaria <400ms
  // depois NO MESMO LUGAR e plantaria o 1º ponto da próxima medição — silenciosamente errada.
  // Temporal+ESPACIAL (<20px): não pune usuário rápido clicando em outro canto.
  var toolFechou = null, _upAtual = null;
  function marcarFechamento() { toolFechou = _upAtual ? { x: _upAtual.x, y: _upAtual.y, t: performance.now() } : { x: -1e9, y: -1e9, t: performance.now() }; }
  canvasEl.addEventListener('pointerdown', function (e) {
    if (!S || !S.alive) return;
    if (ferramentaClique()) medir.down = (e.button === 0) ? { x: e.clientX, y: e.clientY } : null;
    /* 🔍 toque-e-segure abre a lupa (só no DEDO, só com ferramenta de ponto
       ativa). No mouse não faz falta: lá o cursor não tapa o alvo e o
       marcador de snap já segue o `pointermove`. */
    if (e.pointerType === 'touch' && ferramentaClique() && medir.down && S._lupaAgendar) S._lupaAgendar(e);
    /* ⚠ SEGUNDO DEDO = "quero navegar", não "quero mirar". Encostar o outro dedo
       com a lupa aberta é pinça de zoom: fecha a mira e devolve a órbita na
       hora, em vez de deixar a câmera travada esperando um `pointerup` que pode
       nunca vir no ponteiro certo. */
    if (S.lupa && S.lupa.on && S.lupa.id != null && e.pointerId !== S.lupa.id && S._lupaFechar) S._lupaFechar();
  });
  /* ⚠ SAÍDA DE EMERGÊNCIA. A lupa desliga a órbita enquanto mira. Se o sistema
   * cancelar o toque no meio (ligação chegando, notificação, gesto do sistema
   * na borda), não vem `pointerup` — e a câmera ficaria TRAVADA, com uma lupa
   * pendurada na tela e nenhum jeito de sair a não ser recarregar. Cancelar
   * fecha e devolve a órbita. */
  canvasEl.addEventListener('pointercancel', function (e) {
    if (!S || !S.alive) return;
    medir.down = null;
    if (S._lupaSoltar) S._lupaSoltar(e);
  });
  canvasEl.addEventListener('pointerup', function (e) {
    if (!S || !S.alive) return;
    /* ⚠ A LUPA SOLTA ANTES DA PORTEIRA, e isto não é estilo: é o conserto de uma
     * TRAVA PERMANENTE. A lupa desliga a órbita enquanto mira. Com a soltura
     * depois do `return` de cima, bastava um SEGUNDO DEDO na tela: o
     * `pointerdown` dele sobrescrevia `medir.down`, o dedo dono da lupa
     * levantava e zerava `medir.down`, e quando o segundo levantava a porteira
     * `!medir.down` barrava — `_lupaSoltar` nunca rodava. Resultado: lupa
     * pendurada na tela e câmera 3D travada PARA SEMPRE, sem jeito de sair a
     * não ser recarregar a página. E `pointercancel` não salva: o OrbitControls
     * põe `touchAction:'none'` no canvas, então a pinça não é cancelada pelo
     * navegador — ela chega como dois ponteiros normais. */
    var alvoLupa = S._lupaSoltar ? S._lupaSoltar(e) : null;
    if (!ferramentaClique() || e.button !== 0) { medir.down = null; return; } // só botão esquerdo/toque
    if (!alvoLupa && !medir.down) return;
    /* 🔍 LUPA: se ela estava aberta, o ponto é o da MIRA, não o do dedo — e o
       arraste que a mira fez NÃO pode ser lido como órbita (é o teste logo
       abaixo, que descartaria o ponto justamente de quem mirou com cuidado). */
    var dx = 0, dy = 0;
    if (medir.down) { dx = e.clientX - medir.down.x; dy = e.clientY - medir.down.y; }
    medir.down = null;
    if (!alvoLupa && dx * dx + dy * dy > 100) return; // arrastou (>10px) -> era órbita; tolerância p/ toque (tablet)
    if (alvoLupa) { e = { clientX: alvoLupa.x, clientY: alvoLupa.y, button: 0, detail: 1, pointerType: 'touch' }; }
    if (toolFechou && performance.now() - toolFechou.t < 400) {
      var fdx = e.clientX - toolFechou.x, fdy = e.clientY - toolFechou.y;
      // irmão do duplo-clique: o navegador marca com detail>=2 (contagem de cliques); o critério
      // espacial <6px cobre double-tap de toque. Clique intencional (outra posição/1º clique) passa.
      if (e.detail >= 2 || fdx * fdx + fdy * fdy < 36) return;
    }
    _upAtual = { x: e.clientX, y: e.clientY };
    var hit = raycastEm(e.clientX, e.clientY);
    if (S.edit && S.edit.on && S.edit.sub) { editClique(e, hit); return; } // editor: aceita hit OU plano do chão
    if (S.edit && S.edit.on && !S.edit.sub) { // editor SEM ferramenta: clique simples mostra os parâmetros (estilo Revit)
      if (hit && _ultimosHits[0]) {
        var udP = _ultimosHits[0].object.userData;
        if (opts.onPick) opts.onPick(propsDe(udP.mid !== undefined ? udP.mid : S.modelID, udP.expressID, udP.tipo));
      }
      return;
    }
    /* COTAR REDE — antes do snap de propósito: aqui não se marca ponto, se
       escolhe uma PEÇA. Passar pelo snap acenderia a marca verde de vértice,
       que promete uma medição que este modo não faz. */
    if (cota.on) {
      if (!hit) { S._hint('Toque em cima de um tubo para ver o comprimento dele.'); return; }
      var udC = hit.object.userData || {};
      if (udC.expressID == null) { S._hint('Isso não é uma peça do modelo.'); return; }
      var uidC = (udC.mid != null ? udC.mid : S.modelID) + ':' + udC.expressID;
      var reg = null, ixC = cotaIndice();
      for (var ic = 0; ic < ixC.length; ic++) if (ixC[ic].uid === uidC) { reg = ixC[ic]; break; }
      if (!reg) {
        /* ⚠ NÃO INVENTAR. Sem quantidade no IFC, o modo diz isso e oferece a
           trena — nunca estima pela caixa do elemento, que num ramal com
           caimento devolve a DIAGONAL. */
        var elC = null;
        elementosVivos().forEach(function (x) { if (x.uid === uidC) elC = x; });
        S._hint(elC && !cotaEhRede(elC)
          ? 'Essa peça não é tubulação — o modo Cotar rede vale para tubo, duto e conexão.'
          : 'Este tubo não tem comprimento publicado no IFC. Use a trena para medir.');
        marcarFechamento(); return;
      }
      /* segundo toque no mesmo tubo tira a cota — é como o cliente desfaz */
      if (cota.fixados[uidC]) delete cota.fixados[uidC]; else cota.fixados[uidC] = 1;
      cota.chave = reg.chave;          // alimenta o modo "Iguais"
      if (cota.modo !== 'clicado') cota.modo = 'clicado';
      cota.acum = cota.periodo;        // redesenha no próximo quadro
      S._hint(fmtDist(reg.L) + ' · ' + (reg.temFamilia ? reg.chave : 'sem família no IFC — “Iguais” usa o tipo'));
      marcarFechamento(); return;
    }
    if (!hit) { S._hint((ctec.ativo ? '📝' : area.on ? '▱' : ang.on ? '∠' : '📏') + ' Clique em cima de uma superfície do modelo.'); return; }
    var sn = aplicarSnap(hit, raioToque(e)); mostrarSnapMarca(sn, e.clientX, e.clientY);
    if (ctec.ativo) { ctecClique(sn.p.clone()); return; } // linha do corte técnico tem prioridade
    if (area.on) { areaClique(sn.p.clone()); return; }
    if (ang.on) { angClique(sn.p.clone()); return; }
    medir.pts.push({ p: sn.p.clone() });
    if (medir.pts.length === 2) {
      tirarProv(); // a marca definitiva do 1º ponto é desenhada por desenharMedida (evita marca dupla)
      var ok = desenharMedida(medir.pts[0].p, medir.pts[1].p); medir.pts = [];
      marcarFechamento(); // duplo-clique no 2º ponto não planta o 1º ponto da próxima cota
      S._hint(ok ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Medido! Clique 2 pontos pra medir de novo, ou Esc pra sair.' : '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Pontos muito próximos — clique 2 pontos distintos.');
    } else {
      var m0 = pontoMarca(medir.pts[0].p); addMed(m0); medir.prov = m0; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Agora clique no 2º ponto.');
    }
  });
  // hover do snap: feedback ao vivo de onde a trena vai "agarrar" (throttle p/ não pesar o raycast)
  var _snapHoverT = 0;
  canvasEl.addEventListener('pointermove', function (e) {
    if (!S || !S.alive) return;
    /* 🔍 com a lupa aberta o dedo move a MIRA, e mais nada acontece neste
       handler: nem preview de parede, nem o hover normal do snap. */
    if (S._lupaMover && S._lupaMover(e)) return;
    // v1.1.82 — preview vivo da parede (rubber-band + cota junto ao cursor, estilo Revit)
    if (S.edit && S.edit.on && S.edit.sub === 'parede' && S.edit.p1 && S._editPreviewMove) {
      S._editPreviewMove(e);
    }
    if (!ferramentaClique() || !snap.on) return;
    var t = performance.now(); if (t - _snapHoverT < 60) return; _snapHoverT = t;
    var hit = raycastEm(e.clientX, e.clientY);
    if (!hit) { esconderSnapMarca(); return; }
    mostrarSnapMarca(aplicarSnap(hit, raioToque(e)), e.clientX, e.clientY);
  });

  // ============================================================
  // ▱ ÁREA (polígono) e ∠ ÂNGULO — mesmas garantias da trena: todo ponto
  // produzido passa pelo raycast filtrado (visível + fora do clip) e pelo snap.
  // ÁREA na planta = projeção HORIZONTAL (XZ, o que a planta representa);
  // em 3D = plano médio do polígono (vetor-área de Newell) — se os pontos
  // fugirem do plano, o rótulo declara "≈ plano médio" (nunca número mudo).
  // ============================================================
  var area = { on: false, pts: [], tmp: [] };
  var ang = { on: false, pts: [], tmp: [] };
  S.area = area; S.ang = ang;
  // remove SÓ os provisórios (marcas/segmentos do polígono em andamento) sem tocar nas medidas prontas
  function limparTmp(t) { t.forEach(function (o) { var i = medir.objs.indexOf(o); if (i >= 0) medir.objs.splice(i, 1); limparMarca(o); }); t.length = 0; }
  function fmtArea(a) { return (a >= 1 ? a.toFixed(2) : a.toFixed(3)).replace('.', ',') + ' m²'; }
  // área+perímetro do polígono. horizontal=true -> projeção XZ (shoelace). Senão, vetor-área de
  // Newell: |Σ cross|/2 é a área da projeção no plano médio — exata p/ polígono plano, aproximação
  // declarada p/ não-plano (aprox=true quando o desvio ao plano passa de 2% do lado típico).
  function areaCalc(pts) {
    var n = pts.length, i, p, q;
    if (planta.on) {
      var a2 = 0, perH = 0;
      for (i = 0; i < n; i++) {
        p = pts[i]; q = pts[(i + 1) % n];
        a2 += p.x * q.z - q.x * p.z;
        perH += Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.z - p.z) * (q.z - p.z));
      }
      return { area: Math.abs(a2) / 2, per: perH, aprox: false, horizontal: true, normal: new THREE.Vector3(0, 1, 0) };
    }
    var nx = 0, ny = 0, nz = 0, per = 0, cx = 0, cy = 0, cz = 0;
    for (i = 0; i < n; i++) {
      p = pts[i]; q = pts[(i + 1) % n];
      nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
      per += p.distanceTo(q); cx += p.x; cy += p.y; cz += p.z;
    }
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-9) return null; // colinear/degenerado
    cx /= n; cy /= n; cz /= n;
    var desv = 0;
    for (i = 0; i < n; i++) { var dv = Math.abs(((pts[i].x - cx) * nx + (pts[i].y - cy) * ny + (pts[i].z - cz) * nz) / nl); if (dv > desv) desv = dv; }
    var areaV = nl / 2;
    return { area: areaV, per: per, aprox: desv > Math.max(0.01, Math.sqrt(areaV) * 0.02), horizontal: false, normal: new THREE.Vector3(nx / nl, ny / nl, nz / nl) };
  }
  S._areaCalc = areaCalc; // hook de teste (oráculo Node/E2E)
  // preenchimento translúcido: triangula no plano do polígono (base ortonormal da normal)
  function preencherPoligono(pts, normal) {
    try {
      var nv = normal.clone().normalize();
      var ref = Math.abs(nv.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      var bu = new THREE.Vector3().crossVectors(ref, nv).normalize();
      var bv = new THREE.Vector3().crossVectors(nv, bu);
      var p2 = pts.map(function (pp) { return new THREE.Vector2(pp.dot(bu), pp.dot(bv)); });
      var tris = THREE.ShapeUtils.triangulateShape(p2, []);
      if (!tris.length) return null;
      var pos = new Float32Array(pts.length * 3);
      pts.forEach(function (pp, i2) { pos[i2 * 3] = pp.x; pos[i2 * 3 + 1] = pp.y; pos[i2 * 3 + 2] = pp.z; });
      var idx = [];
      tris.forEach(function (t2) { idx.push(t2[0], t2[1], t2[2]); });
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setIndex(idx);
      var mh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, depthTest: false, side: THREE.DoubleSide }));
      mh.renderOrder = 996;
      return mh;
    } catch (_) { return null; } // polígono auto-intersectado etc.: fica só o contorno + rótulo
  }
  function setArea(on) {
    area.on = !!on;
    if (on) { setMode(false); if (medir.on) setMedir(false); if (ang.on) setAng(false); if (edit && edit.on) setEdit(false); } // coexiste com Planta/Corte; exclusivo entre medições e editor
    else { limparTmp(area.tmp); area.pts = []; esconderSnapMarca(); btnCotas(); }
    var b = bar.querySelector('[data-b="area"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? ('▱ Área: clique os cantos (3+)' + (planta.on ? ' na planta' : '') + ' e feche clicando de novo no 1º ponto (ou duplo-clique).') : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setArea = setArea;
  function areaClique(p) {
    // fechar: clique perto (na TELA) do 1º ponto, com 3+ pontos marcados.
    // Vetores locais novos — REGRA do gate v1.1.65: nunca passar pra project() um scratch que carrega candidato.
    if (area.pts.length >= 3) {
      var rc2 = canvasEl.getBoundingClientRect();
      var v0 = new THREE.Vector3().copy(area.pts[0]).project(camera);
      var vp = new THREE.Vector3().copy(p).project(camera);
      var ddx = (v0.x - vp.x) / 2 * rc2.width, ddy = (v0.y - vp.y) / 2 * rc2.height;
      if (ddx * ddx + ddy * ddy < 18 * 18) { fecharArea(); return; }
    }
    area.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0x38bdf8); addMed(m); area.tmp.push(m);
    if (area.pts.length > 1) {
      var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([area.pts[area.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
      seg.renderOrder = 997; addMed(seg); area.tmp.push(seg);
    }
    S._hint(area.pts.length < 3 ? ('▱ Ponto ' + area.pts.length + ' — siga marcando os cantos.') : ('▱ ' + area.pts.length + ' pontos — feche clicando no 1º ponto (ou duplo-clique).'));
  }
  function fecharArea() {
    if (!area.on || area.pts.length < 3) { S._hint('▱ Marque pelo menos 3 pontos antes de fechar.'); return; }
    marcarFechamento(); // engole o pointerup irmão do duplo-clique (ponto fantasma)
    // dedupe: duplo-clique de fechar dispara pointerup 2x no mesmo lugar -> pontos consecutivos coincidentes
    var pts = [];
    area.pts.forEach(function (pp) { if (!pts.length || pp.distanceTo(pts[pts.length - 1]) > 2e-3) pts.push(pp); });
    if (pts.length > 1 && pts[pts.length - 1].distanceTo(pts[0]) < 2e-3) pts.pop();
    limparTmp(area.tmp); area.pts = [];
    if (pts.length < 3) { S._hint('▱ Pontos coincidentes — marque 3+ cantos distintos.'); return; }
    var res = areaCalc(pts);
    if (!res || res.area < 1e-4) { S._hint('▱ Pontos colineares — não formam área. Recomece.'); return; }
    // desenho final: contorno fechado + preenchimento + marcas + rótulo no centro
    var loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.concat([pts[0]])), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
    loop.renderOrder = 997; addMed(loop);
    pts.forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0x38bdf8); addMed(mk); });
    var fill = preencherPoligono(pts, res.normal); if (fill) addMed(fill);
    var c = new THREE.Vector3(); pts.forEach(function (pp) { c.add(pp); }); c.multiplyScalar(1 / pts.length);
    var sufixo = res.horizontal ? ' (horizontal)' : (res.aprox ? ' ≈ plano médio' : '');
    var lab = labelSprite('▱ ' + fmtArea(res.area) + ' · per ' + fmtDist(res.per) + sufixo);
    lab.position.copy(c); addMed(lab); btnCotas();
    medir.ultimaArea = { area: res.area, perimetro: res.per, horizontal: res.horizontal, aproximada: res.aprox, pontos: pts.length };
    S._hint('▱ Área medida! Clique os cantos da próxima, ou Esc pra sair.');
  }
  function setAng(on) {
    ang.on = !!on;
    if (on) { setMode(false); if (medir.on) setMedir(false); if (area.on) setArea(false); if (edit && edit.on) setEdit(false); }
    else { limparTmp(ang.tmp); ang.pts = []; esconderSnapMarca(); btnCotas(); }
    var b = bar.querySelector('[data-b="angulo"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
    atualizarCursor();
    S._hint(on ? '∠ Ângulo: clique o 1º ponto, depois o VÉRTICE, depois o 2º ponto.' : (planta.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte no painel.' : ''));
  }
  S._setAng = setAng;
  function angClique(p) {
    ang.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0xf59e0b); addMed(m); ang.tmp.push(m);
    if (ang.pts.length > 1) {
      var seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ang.pts[ang.pts.length - 2], p]), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      seg.renderOrder = 997; addMed(seg); ang.tmp.push(seg);
    }
    if (ang.pts.length === 1) { S._hint('∠ Agora clique o VÉRTICE do ângulo.'); return; }
    if (ang.pts.length === 2) { S._hint('∠ Agora clique o 2º ponto.'); return; }
    var P1 = ang.pts[0], V = ang.pts[1], P2 = ang.pts[2];
    marcarFechamento(); // 3º ponto pode vir de duplo-clique — engole o irmão
    limparTmp(ang.tmp); ang.pts = [];
    var u = P1.clone().sub(V), v = P2.clone().sub(V);
    if (u.length() < 2e-3 || v.length() < 2e-3) { S._hint('∠ Pontos coincidentes — recomece: 1º ponto, vértice, 2º ponto.'); return; }
    var rad = u.angleTo(v), deg = rad * 180 / Math.PI;
    // desenho final: os 2 lados + arco no plano u,v + rótulo na bissetriz
    [[V, P1], [V, P2]].forEach(function (par) {
      var l2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(par), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      l2.renderOrder = 997; addMed(l2);
    });
    [P1, V, P2].forEach(function (pp) { var mk = pontoMarca(pp); mk.material.color.set(0xf59e0b); addMed(mk); });
    var eixo = new THREE.Vector3().crossVectors(u, v), r = Math.min(u.length(), v.length()) * 0.35;
    if (eixo.lengthSq() > 1e-12) { // 0°/180° não têm plano definido -> sem arco (só rótulo)
      eixo.normalize();
      var arcPts = [], un = u.clone().normalize();
      for (var t2 = 0; t2 <= 16; t2++) arcPts.push(V.clone().add(un.clone().applyAxisAngle(eixo, rad * t2 / 16).multiplyScalar(r)));
      var arco = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      arco.renderOrder = 997; addMed(arco);
    }
    var bis = u.clone().normalize().add(v.clone().normalize());
    if (bis.lengthSq() < 1e-9) bis = (eixo.lengthSq() > 1e-12 ? new THREE.Vector3().crossVectors(eixo, u).normalize() : new THREE.Vector3(0, 1, 0)); else bis.normalize();
    var lab = labelSprite('∠ ' + deg.toFixed(1).replace('.', ',') + '°');
    lab.position.copy(V).add(bis.multiplyScalar(Math.max(r * 1.4, 0.05)));
    addMed(lab); btnCotas();
    medir.ultimoAngulo = { graus: deg };
    S._hint('∠ ' + deg.toFixed(1).replace('.', ',') + '° — clique 3 pontos pra medir outro, ou Esc pra sair.');
  }

  // ============================================================
  // PLANTA BAIXA — plano de corte horizontal com altura ajustável
  // ============================================================
  var planta = { on: false, plane: null, y0: 0, y1: 1 };
  S.planta = planta;
  var cortePanel = document.createElement('div');
  cortePanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:220px';
  cortePanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Altura do corte</b><span data-c="v" style="color:#7fe0a3;font-weight:700">—</span></div>' +
    '<input type="range" data-c="alt" min="0" max="1000" value="620" style="width:100%;accent-color:#22c55e">' +
    '<div style="font-size:11px;color:#9fb2c8">Esconde o que está acima do corte — a planta baixa do pavimento. A ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena funciona aqui (cota horizontal).</div>' +
    '<button class="btn sm primary" data-c="planta2d" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Planta baixa técnica (2D)</button>' +
    '<button class="btn sm" data-c="estilo" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Estilo desenho (branco)</button>' +
    '<button class="btn sm" data-c="cortetec" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Gerar corte técnico (A–A)</button>';
  host.appendChild(cortePanel);
  S.cortePanel = cortePanel; // guardado p/ re-parentar no re-home (senão o slider some ao revisitar a aba)
  function setAlturaCorte(frac) {
    if (!planta.plane) return;
    var y = planta.y0 + (planta.y1 - planta.y0) * frac; planta.plane.constant = y;
    var rot = cortePanel.querySelector('[data-c="v"]'); if (rot) rot.textContent = fmtDist(Math.max(0, y - planta.y0)) + ' do piso'; // mundo já em metros
  }
  function setPlanta(on) {
    planta.on = !!on;
    var bp = bar.querySelector('[data-b="planta"]');
    if (on) {
      if (corteL.on) setCorteL(false); // planta e corte livre disputam o MESMO clippingPlanes
      setMode(false); // trena PODE ficar ligada (medir na planta é o uso pedido)
      var box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) { planta.on = false; S._hint('Carregue um modelo primeiro.'); return; }
      var min = box.min, max = box.max, c = box.getCenter(new THREE.Vector3());
      planta.y0 = min.y; planta.y1 = max.y;
      planta.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y); // normal -Y: mantém o que está ABAIXO
      renderer.localClippingEnabled = true; renderer.clippingPlanes = [planta.plane];
      orbit.enableRotate = false; // planta: só translada/zoom (vista de topo travada)
      enquadrarTopo();
      cortePanel.style.display = 'flex';
      cortePanel.querySelector('[data-c="alt"]').value = 620; setAlturaCorte(0.62); // ~altura de peitoril
      if (bp) { bp.style.background = corAtiva(); bp.style.color = '#fff'; }
      if (!estiloD.on && !sisColor.on) setEstiloDesenho(true); // planta "como deve ser": entra já em modo desenho (branco + arestas). MAS se o usuário ligou "colorir por sistema", a planta sai COLORIDA (é o pedido: cores do sistema na planta baixa)
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta baixa. Ajuste a altura do corte e gere a ' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' planta técnica com cotas no painel. Toque em ' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' de novo pra sair.');
    } else {
      ctecCancelar(); // desenho/config do corte técnico só faz sentido NA planta (incondicional: pega a config aberta)
      plantaCfg.style.display = 'none'; // config da planta técnica idem
      if (estiloD.on) setEstiloDesenho(false); // devolve as cores do modelo
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false; planta.plane = null;
      orbit.enableRotate = true; // volta a permitir órbita livre
      cortePanel.style.display = 'none';
      if (bp) { bp.style.background = ''; bp.style.color = ''; }
      enquadrar(); S._hint(medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
    }
  }
  S._setPlanta = setPlanta;
  // vista de topo travada (reusada por setPlanta ao entrar E pelo Enquadrar dentro da planta)
  function enquadrarTopo() {
    if (S._cancelTween) S._cancelTween(); // fit-na-planta cancela voo pendente (senão o tween puxa a câmera pra fora do topo)
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    var c = box.getCenter(new THREE.Vector3());
    var sizeXZ = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 10;
    camera.position.set(c.x, box.max.y + sizeXZ * 1.15, c.z);
    orbit.target.set(c.x, box.min.y, c.z); orbit.update();
  }
  S._enquadrarTopo = enquadrarTopo;
  // modelo removido com a planta ativa: re-ancora y0/y1 no bbox restante (senão o slider ganha zona morta)
  function replanejarCorte() {
    if (!planta.on || !planta.plane) return;
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) { setPlanta(false); return; }
    planta.y0 = box.min.y; planta.y1 = box.max.y;
    var sl = cortePanel.querySelector('[data-c="alt"]');
    setAlturaCorte((sl ? +sl.value : 620) / 1000);
  }
  S._replanejarCorte = replanejarCorte;
  cortePanel.querySelector('[data-c="alt"]').addEventListener('input', function () { setAlturaCorte(this.value / 1000); });
  cortePanel.querySelector('[data-c="cortetec"]').addEventListener('click', function () { ctecIniciar(); });
  cortePanel.querySelector('[data-c="planta2d"]').addEventListener('click', function () { fecharPaineis(); ctecCancelar(); plantaCfg.style.display = 'flex'; }); // planta técnica e corte A–A são modais centrais no mesmo z — não empilham
  cortePanel.querySelector('[data-c="estilo"]').addEventListener('click', function () { setEstiloDesenho(!estiloD.on); });

  // ============================================================
  // ✂️ CORTE LIVRE — plano de corte em QUALQUER orientação, ao vivo
  // (horizontal, vertical N–S/L–O ou ângulo custom: azimute 0–360° + inclinação 0–90°).
  // Diferente da planta, a órbita fica LIVRE: o usuário gira em volta do corte.
  // ============================================================
  var corteL = { on: false, plane: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), az: 0, inc: 0, inv: false, d0: 0, d1: 1 };
  S.corteL = corteL;
  var corteLPanel = document.createElement('div');
  corteLPanel.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:240px';
  corteLPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Plano de corte</b><span data-k="v" style="color:#7fe0a3;font-weight:700">—</span></div>' +
    '<div style="display:flex;gap:5px"><button class="btn sm" data-k="ph" style="flex:1">Horizontal</button><button class="btn sm" data-k="pns" style="flex:1">N–S</button><button class="btn sm" data-k="plo" style="flex:1">L–O</button></div>' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Ângulo (azimute) <span data-k="azv">0°</span></label>' +
    '<input type="range" data-k="az" min="0" max="359" value="0" style="width:100%;accent-color:#22c55e">' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Inclinação (0=vertical, 90=horizontal) <span data-k="incv">0°</span></label>' +
    '<input type="range" data-k="inc" min="0" max="90" value="0" style="width:100%;accent-color:#22c55e">' +
    '<label style="display:flex;justify-content:space-between;font-size:11px;color:#9fb2c8">Posição do corte <span data-k="posv">50%</span></label>' +
    '<input type="range" data-k="pos" min="0" max="1000" value="500" style="width:100%;accent-color:#22c55e">' +
    '<button class="btn sm" data-k="inv" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('ciclo', 15) : '') + ' Inverter lado visível</button>' +
    '<div style="font-size:11px;color:#9fb2c8">O modelo some do lado cortado conforme você move. Gire a órbita normalmente. A ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena funciona na face do corte.</div>';
  host.appendChild(corteLPanel);
  S.corteLPanel = corteLPanel;
  function corteNormal() {
    var az = corteL.az * Math.PI / 180, inc = corteL.inc * Math.PI / 180;
    return new THREE.Vector3(Math.sin(az) * Math.cos(inc), Math.sin(inc), Math.cos(az) * Math.cos(inc));
  }
  function aplicarCorteL() {
    if (!corteL.on) return;
    var n = corteNormal();
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) { setCorteL(false); return; }
    // faixa da posição = projeção dos 8 cantos do bbox na normal
    var d0 = Infinity, d1 = -Infinity, c = new THREE.Vector3();
    for (var i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      var d = n.dot(c); if (d < d0) d0 = d; if (d > d1) d1 = d;
    }
    corteL.d0 = d0; corteL.d1 = d1;
    var frac = (+corteLPanel.querySelector('[data-k="pos"]').value) / 1000;
    var s = d0 + (d1 - d0) * frac;
    // mantém n·p <= s (plano normal -n, constant s); invertido mantém n·p >= s
    if (corteL.inv) { corteL.plane.normal.copy(n); corteL.plane.constant = -s; }
    else { corteL.plane.normal.copy(n).negate(); corteL.plane.constant = s; }
    renderer.localClippingEnabled = true; renderer.clippingPlanes = [corteL.plane];
    corteLPanel.querySelector('[data-k="v"]').textContent = fmtDist(Math.max(0, s - d0));
    corteLPanel.querySelector('[data-k="azv"]').textContent = corteL.az + '°';
    corteLPanel.querySelector('[data-k="incv"]').textContent = corteL.inc + '°';
    corteLPanel.querySelector('[data-k="posv"]').textContent = Math.round(frac * 100) + '%';
  }
  function setCorteL(on) {
    corteL.on = !!on;
    var bc = bar.querySelector('[data-b="corte"]');
    if (on) {
      if (planta.on) setPlanta(false); // disputam o clippingPlanes
      setMode(false); // órbita LIVRE (trena pode ficar)
      var box = new THREE.Box3().setFromObject(modelRoot);
      if (box.isEmpty()) { corteL.on = false; S._hint('Carregue um modelo primeiro.'); return; }
      corteLPanel.style.display = 'flex';
      if (bc) { bc.style.background = corAtiva(); bc.style.color = '#fff'; }
      aplicarCorteL();
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Corte livre: escolha a direção e arraste a posição — o modelo abre ao vivo. Esc sai.');
    } else {
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false;
      corteLPanel.style.display = 'none';
      if (bc) { bc.style.background = ''; bc.style.color = ''; }
      S._hint(medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Trena: clique em 2 pontos do modelo pra medir. Esc sai.' : '');
    }
  }
  S._setCorteL = setCorteL; S._aplicarCorteL = aplicarCorteL;
  corteLPanel.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-k');
    if (k === 'az') corteL.az = +e.target.value;
    else if (k === 'inc') corteL.inc = +e.target.value;
    else if (k !== 'pos') return;
    aplicarCorteL();
  });
  corteLPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]'); if (!b) return; var k = b.getAttribute('data-k');
    function preset(az, inc) { corteL.az = az; corteL.inc = inc; corteLPanel.querySelector('[data-k="az"]').value = az; corteLPanel.querySelector('[data-k="inc"]').value = inc; aplicarCorteL(); }
    if (k === 'ph') preset(0, 90);
    else if (k === 'pns') preset(0, 0);
    else if (k === 'plo') preset(90, 0);
    else if (k === 'inv') { corteL.inv = !corteL.inv; b.style.background = corteL.inv ? corAtiva() : ''; b.style.color = corteL.inv ? '#fff' : ''; aplicarCorteL(); }
  });

  // ============================================================
  // 🧲 SNAP — a trena (e a linha do corte técnico) "agarram" em pontos notáveis:
  // vértice (fim de linha) > meio de aresta > aresta mais próxima > superfície livre.
  // Configurável por tipo, persistido; indicador visual mostra ONDE e O QUE agarrou.
  // ============================================================
  var snap = { on: true, v: true, m: true, a: true, i: true, c: true, raio: 14 };
  try { var _sv = JSON.parse(localStorage.getItem('orcapro:bim:snap') || 'null'); if (_sv) { snap.on = !!_sv.on; snap.v = !!_sv.v; snap.m = !!_sv.m; snap.a = !!_sv.a; snap.i = _sv.i !== false; snap.c = _sv.c !== false; }  /* ⚠ `!== false`: quem já usava o sistema tem preferência gravada SEM a chave nova — com `!!` o centro nasceria desligado justamente para quem pediu o recurso */ } catch (_) {}
  function salvarSnap() { try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i, c: snap.c })); } catch (_) {} }
  S.snap = snap;
  var snapPanel = document.createElement('div');
  snapPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:210px';
  snapPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('ima', 15) : '') + ' Snap da trena</b><button class="btn sm" data-s="on" style="padding:2px 9px">ON</button></div>' +
    '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
    '<button class="btn sm" data-s="v" style="flex:1" title="Agarra no fim de linha (canto/vértice)">▪ Vértice</button>' +
    '<button class="btn sm" data-s="m" style="flex:1" title="Agarra no meio da aresta">● Meio</button>' +
    '<button class="btn sm" data-s="a" style="flex:1" title="Agarra no ponto mais próximo da aresta">◆ Aresta</button>' +
    '<button class="btn sm" data-s="i" style="flex:1" title="Agarra no CRUZAMENTO real de duas arestas (canto parede×viga)">✚ Interseção</button>' +
    '<button class="btn sm" data-s="c" style="flex:1" title="Agarra no EIXO de uma boca redonda: ponta de tubo, furo, pilar circular">⊕ Centro</button></div>' +
    '<div style="font-size:11px;color:#9fb2c8">Aproxime o clique de um canto/aresta: a cota agarra no ponto exato (o marcador mostra o tipo). Sem alvo por perto, mede na superfície livre.</div>';
  host.appendChild(snapPanel);
  S.snapPanel = snapPanel;

  // v1.1.96 — LEGENDA/PERSONALIZAÇÃO das cores por sistema hidrossanitário
  /* =================================================================
   * REQUISITAR PELO MODELO — do IFC para o pedido de material
   *
   * O modelo já diz, peça a peça, o que o projetista especificou:
   * "ESG_Serie Normal_Luva Simples", "UT_Bacia com caixa acoplada". Quem está
   * na obra precisa disso virando pedido de compra, e não de uma busca item a
   * item no banco de insumos.
   *
   * ⚠ O CASAMENTO NÃO ACONTECE AQUI. Ele mora em js/bimpeca.js, que é puro e
   * entra no gate — um casador que decide o que o cliente COMPRA não pode ser
   * código sem teste, e js/bim.js é módulo ES que o Node não consegue exigir.
   * Este bloco só junta as pontas: lê os elementos, pede a bitola à geometria,
   * mostra o resultado e deixa a PESSOA decidir. Nada é escolhido sozinho.
   * ================================================================= */
  var reqPanel = document.createElement('div');
  reqPanel.style.cssText = 'position:absolute;left:10px;top:56px;z-index:5;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:11px;padding:12px 14px;color:#dbe8f5;font-size:12px;width:min(620px,93vw);max-height:78%;overflow:auto';
  host.appendChild(reqPanel);
  S.reqPanel = reqPanel;
  var reqEstado = null;

  function reqLevantar() {
    if (typeof BimPeca === 'undefined') { UI0('Motor de peças não carregado.', 'erro'); return null; }
    /* ⚠ FASE. O carimbo do plugin diz o que e OBRA NOVA, o que vai ser
     * DEMOLIDO e o que ja EXISTE. Requisicao e pedido de material a COMPRAR:
     * pedir tubo para o que vai ser derrubado, ou para o que ja esta na
     * parede, e material comprado a toa. Sem fase carimbada, o elemento
     * conta como novo — que e o comportamento de antes e o unico honesto
     * quando o modelo nao diz. */
    var els = (S.elementos || []).filter(function (e) {
      var f = String((e && e.fase) || '').toLowerCase();
      return !(f === 'demolir' || f === 'demolicao' || f === 'existente');
    });
    if (!els.length) { UI0('Carregue um modelo primeiro.', 'info'); return null; }

    /* ⚠ A BITOLA VEM DA GEOMETRIA, e é ela que decide a compra.
       Medido no projeto hidrossanitário real: sem ela, 106 de 119 famílias
       ficam ambíguas — o Revit escreve "Luva Simples série normal" sem dizer
       o DN, e a base tem a mesma luva em 40/50/75/100/150 mm, com 10x de
       diferença de preço. Ler custa uma passada; não ler custa a peça errada
       chegando no canteiro. */
    var entrada = els.map(function (e) {
      var q = e.qto || {}, quant = 0, un = '', fq = '';
      if (q.comprimento > 0) { quant = q.comprimento; un = 'm'; fq = q.compFonte || 'ifc'; }
      else if (q.area > 0) { quant = q.area; un = 'm2'; fq = 'ifc'; }
      else if (q.volume > 0) { quant = q.volume; un = 'm3'; fq = 'ifc'; }
      var bit = 0;
      try {
        if (e.mid != null && typeof BimTubo !== 'undefined' && BimTubo.ehTubo && BimTubo.ehTubo(e)) {
          bit = lerBitolaMm(e.mid, e.id, fatorLen(e.mid)) || 0;
        }
      } catch (eB) {}
      return { tipo: e.tipo, familia: e.familia, sistemaIfc: e.sistemaIfc, nome: e.nome,
               bitolaMm: bit, quantidade: quant, unidade: un, fonteQtd: fq, uid: e.uid, n: 1 };
    });

    /* ⚠ E A BITOLA DA CONEXÃO SAI DA REDE, não da geometria dela.
     * Joelho, luva e tê são exportados como malha facetada, sem perfil
     * circular: no modelo hidrossanitário real são 4.201 peças sem bitola
     * contra 1.725 tubos com. Mas TUBO NUNCA É VIZINHO DE TUBO — conferido no
     * arquivo, 0 pares tubo-tubo em 1.722 tubos com vizinho —, então toda
     * conexão encosta em tubo de bitola conhecida.
     * Medido: a propagação leva a cobertura de 1.725 para 3.003 peças.
     *
     * ⚠ E ela se recusa a resolver a REDUÇÃO. Bucha, tê de redução e redução
     * excêntrica ligam bitolas diferentes por definição; dar DN único a elas é
     * comprar a peça errada. A primeira versão fez isso com 111 peças, porque
     * decidia com um lado ainda desconhecido. Agora o nome vale como prova e
     * elas guardam o PAR. */
    var topos = {};
    (S.modelos || []).forEach(function (mo) {
      try { topos[mo.mid] = lerTopologiaRede(mo.mid); } catch (eT) {}
    });
    var topoUnida = { portaDe: {}, portasDe: {}, ligacao: {} };
    Object.keys(topos).forEach(function (mid) {
      var t = topos[mid] || {};
      /* ⚠ as portas são numeradas POR MODELO e colidem entre IFCs federados —
         o mesmo motivo pelo qual o `uid` do elemento carrega o mid. */
      Object.keys(t.portaDe || {}).forEach(function (p) { topoUnida.portaDe[mid + ':' + p] = t.portaDe[p]; });
      Object.keys(t.portasDe || {}).forEach(function (u) {
        topoUnida.portasDe[u] = (t.portasDe[u] || []).map(function (p) { return mid + ':' + p; });
      });
      Object.keys(t.ligacao || {}).forEach(function (p) { topoUnida.ligacao[mid + ':' + p] = mid + ':' + t.ligacao[p]; });
    });
    try {
      var mapaBit = BimPeca.bitolasPorTopologia(entrada, topoUnida);
      BimPeca.aplicarTopologia(entrada, mapaBit);
    } catch (eP) { /* topologia é bônus: sem ela o levantamento segue pela geometria */ }

    return BimPeca.levantar(entrada);
  }

  /* Candidatos vindos do banco de insumos do app.
     ⚠ SÓ INSUMO. Sub-composição vendida como insumo poria "CONCRETO FCK
     25MPA, M3, R$587" num pedido de COMPRA de material. */
  var reqPeso = null;

  /* ⚠ A BASE CARREGA SOB DEMANDA, e o painel tem de puxá-la — não mandar a
   * pessoa abrir outra tela primeiro. `Insumos._idx` nasce VAZIO e só enche
   * quando alguém chama `Insumos.carregar`; a tela do Banco de Insumos faz
   * isso, o painel do BIM não fazia. O sintoma era o pior possível: o painel
   * abria, dizia "0 casadas · 182 sem candidato" e a requisição saía com
   * R$ 0,00 — parecendo que a base não tem os itens, quando ela nem tinha
   * sido lida. */
  function reqCarregarBase() {
    try {
      if (typeof Insumos === 'undefined') return Promise.resolve(0);
      if (Insumos.carregado && (Insumos._idx || []).length) return Promise.resolve(Insumos._idx.length);
      if (typeof Gestao === 'undefined' || !Gestao._analiticoAtivo) return Promise.resolve(0);
      var a = Gestao._analiticoAtivo();
      if (!a || !a.url) return Promise.resolve(0);
      return Insumos.carregar(a.url, a.uf, a.live).then(function () { return (Insumos._idx || []).length; });
    } catch (e) { return Promise.resolve(0); }
  }

  function reqCandidatos(peca) {
    /* ⚠ O CATALOGO E `Insumos._idx`, NAO `Insumos.todos()`.
     * A primeira versao chamava `Insumos.todos()`, que NAO EXISTE em lugar
     * nenhum do repo — o guard `if (Insumos.todos)` engolia o erro e a lista
     * vinha vazia. Efeito: o painel montava, dizia "182 pecas · 0 casadas ·
     * 182 sem candidato", e a requisicao saia com 182 linhas pendentes e
     * R$ 0,00. O recurso inteiro era inerte no navegador, e a medicao que eu
     * tinha (23 familias casadas) era de codigo rodando em Node contra o
     * arquivo da base — nunca pelo caminho do app.
     * Guard que esconde funcao inexistente e pior que erro: nao ha vermelho
     * em lugar nenhum, so um resultado vazio que parece "a base nao tem". */
    var todos = [];
    try {
      if (typeof Insumos !== 'undefined') {
        if (!Insumos.carregado && Insumos.carregar) { /* a base carrega sozinha na tela do banco; aqui so avisamos */ }
        todos = Insumos._idx || [];
      }
    } catch (e) { todos = []; }
    var termos = peca.termos;
    if (!todos.length || !termos.length) return [];
    var pont = [];
    for (var i = 0; i < todos.length; i++) {
      var it = todos[i];
      if (String(it.tipo || '').toLowerCase() === 'composicao') continue;
      var d = String(it.descricao || '').toLowerCase();
      var c = 0;
      for (var t = 0; t < termos.length; t++) if (d.indexOf(termos[t]) >= 0) c++;
      if (c) pont.push({ c: c, item: it });
    }
    pont.sort(function (a, b) { return b.c - a.c; });
    return pont.slice(0, 300).map(function (x) { return { item: x.item, fonte: x.item.fonte || '' }; });
  }

  function reqPintar() {
    if (!reqEstado) return;
    var pecas = reqEstado.pecas;
    var cont = { ok: 0, escolher: 0, sem: 0 };
    pecas.forEach(function (x) { cont[x.escolhido ? 'ok' : (x.v.candidatos.length ? 'escolher' : 'sem')]++; });

    var subs = {};
    pecas.forEach(function (x) { var k = x.p.subsistema || x.p.disciplina || 'sem classificação'; subs[k] = (subs[k] || 0) + x.p.n; });
    var chips = Object.keys(subs).sort(function (a, b) { return subs[b] - subs[a]; }).map(function (k) {
      var on = reqEstado.filtro === k;
      return '<button class="btn sm" data-rq-sub="' + esc(k) + '"' + (on ? ' style="background:#2e6f9e;color:#fff"' : '') + '>' + esc(k) + ' <b>' + subs[k] + '</b></button>';
    }).join(' ');

    var visiveis = pecas.filter(function (x) {
      return !reqEstado.filtro || (x.p.subsistema || x.p.disciplina || 'sem classificação') === reqEstado.filtro;
    });

    var linhas = visiveis.map(function (x) {
      var p = x.p, v = x.v;
      var medida = BimPeca.resumoDim(p.dims, p.bitolaPar);
      var opcoes = v.candidatos.slice(0, 6).map(function (c, j) {
        var sel = x.escolhido && x.escolhido.codigo === c.item.codigo;
        /* dentro de <option> não cabe SVG — o navegador desenha texto puro.
           Então o aviso vai em PALAVRA, e não em glifo: é a mesma razão das
           duas exceções que o tools/test-sem-emoji.js documenta para
           placeholder e title, sem precisar abrir uma terceira. */
        return '<option value="' + j + '"' + (sel ? ' selected' : '') + '>' +
          (c.dim === 'confere' ? '[medida confere] ' : c.dim === 'diverge' ? '[OUTRA MEDIDA] ' : '') +
          esc(String(c.item.descricao).slice(0, 70)) + '  ·  R$ ' + (Number(c.item.custoUnitario) || 0).toFixed(2) +
          '</option>';
      }).join('');
      return '<tr>' +
        '<td style="padding:5px 4px;vertical-align:top;border-top:1px solid #24435f">' +
          '<div><b>' + esc(String(p.familia || p.rotulo || '(sem nome no modelo)').slice(0, 54)) + '</b></div>' +
          '<div style="color:#9fb2c8;font-size:11px">' + p.n + ' pç · ' +
            (p.fonteQtd === 'contagem' ? 'por contagem'
              : p.fonteQtd === 'parcial'
                ? ('<span style="color:#e0a458">' + p.quantidade.toFixed(2) + ' ' + p.unidade + ' — INCOMPLETO, ' + p.faltamMedida + ' peça(s) sem medida no IFC</span>')
                : (p.quantidade.toFixed(2) + ' ' + p.unidade + ' medidos no IFC')) +
            (medida !== 'sem medida' ? ' · ' + esc(medida) : '') + '</div>' +
        '</td>' +
        '<td style="padding:5px 4px;vertical-align:top;min-width:260px;border-top:1px solid #24435f">' +
          (opcoes
            ? '<select data-rq-sel="' + x.idx + '" style="width:100%;font-size:11px"><option value="">— deixar pendente —</option>' + opcoes + '</select>'
            : '<span style="color:#e0a458">sem candidato na base</span>') +
          '<div style="color:#9fb2c8;font-size:11px;margin-top:3px">' + esc(v.porque) + '</div>' +
        '</td>' +
        '<td style="padding:5px 4px;vertical-align:top;text-align:right;border-top:1px solid #24435f">' +
          (x.escolhido
            ? '<span style="color:#6fd08a">✓</span>'
            : '<button class="btn sm" data-rq-novo="' + x.idx + '" title="Criar como insumo próprio, com a descrição e a unidade que vieram do modelo">+ insumo</button>') +
        '</td></tr>';
    }).join('');

    reqPanel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<b style="flex:1">Requisitar pelo modelo</b>' +
        '<button class="btn sm" data-rq="fechar" title="Fechar">' + ico('fechar') + '</button></div>' +
      '<div style="color:#9fb2c8">' + pecas.length + ' peças distintas · ' +
        '<span style="color:#6fd08a">' + cont.ok + ' casadas</span> · ' + cont.escolher + ' a escolher · ' +
        '<span style="color:#e0a458">' + cont.sem + ' sem candidato</span></div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
        '<button class="btn sm" data-rq-sub=""' + (reqEstado.filtro ? '' : ' style="background:#2e6f9e;color:#fff"') + '>tudo</button>' + chips + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tbody>' + linhas + '</tbody></table>' +
      /* ATENÇÃO: o aviso do total parcial nasce aqui e segue para a requisição: ela
         dispara aprovação POR VALOR, e item sem preço puxa o total para baixo
         — o pedido pode passar por baixo do limite de quem precisava aprovar */
      ((cont.sem + cont.escolher)
        ? '<div style="color:#e0a458">O que ficar sem item entra como <b>linha pendente, sem preço</b> — o total sai parcial e precisa ser completado antes de mandar aprovar.</div>'
        : '') +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn sm primary" data-rq="gerar">Gerar requisição' +
          (reqEstado.filtro ? ' (' + visiveis.length + ' de ' + pecas.length + ')' : '') + '</button>' +
        '<button class="btn sm" data-rq="fechar">Cancelar</button></div>';
  }

  function reqAbrir() {
    var lev = reqLevantar();
    if (!lev) return;
    /* espera a base antes de casar: sem ela todo mundo sai pendente */
    if (typeof Insumos !== 'undefined' && !(Insumos._idx || []).length) {
      UI0('Carregando o banco de insumos...', 'info');
      reqCarregarBase().then(function (n) {
        if (!n) { UI0('Nao consegui carregar o banco de insumos. Abra o app pelo Iniciar-OrcaPRO e tente de novo.', 'erro'); return; }
        reqAbrir();
      });
      return;
    }
    /* ⚠ O PESO DOS TERMOS SAI DA BASE, e e calculado UMA vez.
       "pvc" esta em 19,3% dos insumos e "joelho" em 1,9%: contando os dois
       igual, um CAP e um TUBO empatam com um JOELHO por compartilharem
       "serie" e "normal", e a peca certa some no meio de dez erradas. */
    try {
      if (!reqPeso && typeof Insumos !== 'undefined' && Insumos._idx) {
        reqPeso = BimPeca.pesosDe((Insumos._idx || []).filter(function (it) {
          return String(it.tipo || '').toLowerCase() !== 'composicao';
        }).map(function (it) { return { item: it }; }));
      }
    } catch (ePz) { reqPeso = null; }
    var pecas = lev.pecas.map(function (p, i) {
      var v = BimPeca.casar(p, reqCandidatos(p), { peso: reqPeso });
      /* ⚠ SÓ PRÉ-SELECIONA QUANDO O MOTOR DISSE "ok". Em ambíguo e pendente a
         escolha fica em branco: pré-marcar o primeiro candidato de um empate
         é escolher pelo usuário sem ele saber — e num empate de bitola isso
         é a peça errada com cara de conferida. */
      return { idx: i, p: p, v: v, escolhido: (v.status === 'ok' && v.candidatos[0]) ? v.candidatos[0].item : null };
    });
    reqEstado = { pecas: pecas, filtro: '' };
    fecharPaineis(reqPanel);
    reqPanel.style.display = 'flex';
    reqPintar();
  }

  reqPanel.addEventListener('change', function (ev) {
    var sel = ev.target && ev.target.closest ? ev.target.closest('[data-rq-sel]') : null;
    if (!sel || !reqEstado) return;
    var x = reqEstado.pecas[+sel.getAttribute('data-rq-sel')];
    if (!x) return;
    var j = sel.value;
    x.escolhido = (j === '') ? null : ((x.v.candidatos[+j] || {}).item || null);
    reqPintar();
  });

  reqPanel.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!b || !reqEstado) return;
    var sub = b.getAttribute('data-rq-sub');
    if (sub !== null) { reqEstado.filtro = sub; reqPintar(); return; }
    var novo = b.getAttribute('data-rq-novo');
    if (novo !== null) {
      var xn = reqEstado.pecas[+novo];
      if (xn) {
        /* ⚠ o preço NÃO é chutado aqui — quem digita é o usuário, na tela do
           insumo próprio. Herdar o preço de um item apenas parecido poria o
           preço de OUTRA peça dentro do acervo autoral do cliente, com cara
           de dado conferido — e lá ele fica para sempre.
           (sem aspas duplas nesta prosa: o tools/test-sem-emoji.js tira as
           strings ANTES dos comentários, e uma aspa aqui parte o bloco ao
           meio, fazendo o resto passar por código.) */
        try { window.dispatchEvent(new CustomEvent('orcapro:insumo-do-bim', { detail: BimPeca.paraInsumoProprio(xn.p) })); } catch (e2) {}
      }
      return;
    }
    var k = b.getAttribute('data-rq');
    if (k === 'fechar') { reqPanel.style.display = 'none'; reqEstado = null; return; }
    if (k === 'gerar') {
      /* ⚠ O BOTAO GERA O QUE ESTA A VISTA. Ele mandava o modelo INTEIRO
         mesmo com um chip de subsistema ligado: a pessoa clicava em "esgoto",
         via 40 linhas, clicava em Gerar e recebia uma requisicao com as 182 —
         incluindo agua fria e pluvial que ela nao pediu. Filtro que filtra so
         a tela e armadilha, nao filtro. */
      var visiveis = reqEstado.pecas.filter(function (x) {
        return !reqEstado.filtro || (x.p.subsistema || x.p.disciplina || 'sem classificação') === reqEstado.filtro;
      });
      var escolhas = {};
      visiveis.forEach(function (x) { escolhas[x.p.chave] = x.escolhido; });
      var pac = BimPeca.paraRequisicao(visiveis.map(function (x) { return x.p; }), escolhas);
      try { window.dispatchEvent(new CustomEvent('orcapro:requisicao-do-bim', { detail: pac })); } catch (e3) {}
      reqPanel.style.display = 'none'; reqEstado = null;
    }
  });

  S._reqAbrir = reqAbrir;

  var sisPanel = document.createElement('div');
  sisPanel.style.cssText = 'position:absolute;left:10px;bottom:14px;z-index:4;display:none;flex-direction:column;gap:6px;background:rgba(15,39,64,.95);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:238px;max-height:72%;overflow:auto';
  host.appendChild(sisPanel);
  S.sisPanel = sisPanel;
  function pintarSisPanel() {
    var cnt = sistemasPresentes();
    var linhas = SIS_ORDEM.filter(function (k) { return cnt[k]; }).map(function (k) {
      return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
        '<input type="color" data-sk="' + k + '" value="' + sisCores[k] + '" style="width:26px;height:22px;border:0;background:none;padding:0;cursor:pointer">' +
        '<span style="flex:1">' + esc(SIS_PADRAO[k].nome) + '</span>' +
        '<b style="color:#9fb2c8;font-weight:600">' + cnt[k] + '</b></label>';
    }).join('');
    sisPanel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Sistemas hidrossanitários</b>' +
      '<button class="btn sm" data-sx="fechar" style="padding:2px 8px" title="Desligar as cores por sistema">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
      (linhas || '<div style="color:#9fb2c8;line-height:1.4">Nenhum sistema hidráulico reconhecido pelos nomes dos elementos. As cores aparecem quando o IFC tiver tubulação nomeada (água fria, esgoto, pluvial, gás, incêndio…).</div>') +
      '<div style="display:flex;gap:6px;margin-top:2px"><button class="btn sm" data-sx="padrao" style="flex:1" title="Voltar às cores padrão">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Cores padrão</button></div>' +
      '<div style="font-size:11px;color:#9fb2c8;line-height:1.4">Estas cores também valem na <b>Planta baixa</b> e no <b>RA/RV</b>. Clique numa cor pra trocar.</div>';
  }
  // legenda compacta (chips) para o overlay do imersivo — pintada dentro do xrHud
  function montarLegendaChips() {
    var cnt = sistemasPresentes();
    var chips = SIS_ORDEM.filter(function (k) { return cnt[k]; }).map(function (k) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(11,26,43,.72);border-radius:12px;padding:3px 8px;margin:2px"><span style="width:11px;height:11px;border-radius:3px;background:' + sisCores[k] + '"></span>' + esc(SIS_PADRAO[k].nome) + '</span>';
    }).join('');
    return chips ? '<div data-h="sisleg" style="position:absolute;left:8px;top:8px;max-width:62%;pointer-events:none;display:flex;flex-wrap:wrap;font-size:11px;color:#eaf2fb">' + chips + '</div>' : '';
  }
  S._montarLegendaChips = function () { return sisColor.on ? montarLegendaChips() : ''; };
  function repintarSisBase() { S.modelos.forEach(function (mo) { refreshModelo(mo); }); if (S._reaplicarEstilo) S._reaplicarEstilo(); if (S._sisImersivoSync) S._sisImersivoSync(); }
  function setSisColor(on) {
    on = !!on;
    if (on && S._estiloOn && S._estiloOn() && S._setEstiloDesenho) S._setEstiloDesenho(false); // exclusivo do estilo-desenho P&B do corte técnico
    sisColor.on = on;
    if (on) construirSisIdx();
    S.modelos.forEach(function (mo) { refreshModelo(mo); }); // repinta a base respeitando 4D/seleção/clash
    if (S.selected) S.prevMat = matBase(S.selected); // seleção fica com selMat: ressincroniza o material a restaurar (senão desselecionar volta a cor do estado anterior). matBase já lê o sisColor.on novo
    if (S._reaplicarEstilo) S._reaplicarEstilo();
    var b = bar.querySelector('[data-b="sistema"]');
    if (b) { b.classList.toggle('on', on); b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; }
    pintarSisPanel();
    // no imersivo NÃO abre o painel lateral (tampa a vista) — a legenda vai como chips no HUD
    if (!(S.xr && S.xr.on)) { sisPanel.style.display = on ? 'flex' : 'none'; if (on) fecharPaineis(sisPanel); }
    if (S._sisImersivoSync) S._sisImersivoSync();
    if (S._hint) S._hint(on ? '' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Colorido por sistema hidrossanitário. Toque nas cores da legenda pra personalizar.' : 'Cores originais do modelo restauradas.');
  }
  S._setSistema = setSisColor;
  S._sisColorOn = function () { return !!sisColor.on; };
  S._sisClassificar = function (texto) { return classificaSistemaTxt(texto); };
  // modelo que ENTRAR/mudar com o modo já ligado (IFC federado, edição) pega a cor por sistema —
  // simétrico ao S._reaplicarEstilo; chamado pelo notifyModelos após qualquer mudança de modelos.
  S._reaplicarSistema = function () { if (!sisColor.on) return; construirSisIdx(); S.modelos.forEach(function (mo) { refreshModelo(mo); }); };
  S._sisInfo = function () { // E2E/diagnóstico: estado + classificação + cor efetiva do material por sistema
    var pres = sistemasPresentes(), cores = {}, amostra = {};
    SIS_ORDEM.forEach(function (k) { cores[k] = sisCores[k]; });
    (S.elementos || []).forEach(function (e) {
      var k = e.sistema || classificaEl(e);
      if (amostra[k]) return;
      var m = S.meshPorUid[e.uid];
      amostra[k] = { uid: e.uid, nome: e.nome, matCor: (m && m.material && m.material.color) ? '#' + m.material.color.getHexString() : null };
    });
    return { on: !!sisColor.on, presentes: pres, cores: cores, amostra: amostra };
  };
  sisPanel.addEventListener('input', function (e) {
    var ci = e.target.closest && e.target.closest('input[data-sk]'); if (!ci) return;
    var k = ci.getAttribute('data-sk'); if (!/^#[0-9a-f]{6}$/i.test(ci.value)) return;
    sisCores[k] = ci.value; salvarSisCores(); limparSisMatCache();
    if (sisColor.on) repintarSisBase();
  });
  sisPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sx]'); if (!b) return; var k = b.getAttribute('data-sx');
    if (k === 'fechar') setSisColor(false);
    else if (k === 'padrao') { SIS_ORDEM.forEach(function (kk) { sisCores[kk] = SIS_PADRAO[kk].cor; }); salvarSisCores(); limparSisMatCache(); pintarSisPanel(); if (sisColor.on) repintarSisBase(); }
  });

  // ============================================================
  // 🧱 BLOCOK — PLANTAS EXECUTIVAS (paginação de painéis 90×90 cm)
  // Lê as PAREDES de qualquer IFC, extrai comprimento×altura×espessura pela OBB 2D
  // (motor blocok.js), pagina as placas NUMERADAS (recortes de borda + desconto de
  // vãos) e gera: prancha executiva SVG de CADA parede + mapa de localização + tabela
  // de material (placas por espessura) + INSUMOS calculados (produção das placas +
  // assentamento pela junta escolhida) + carga própria na fundação (peso líquido).
  // ⚠️ EXCLUSIVO do cliente Argecon (feito p/ ele primeiro) — gate por e-mail logado.
  // ============================================================
  function getBK() { return (typeof Blocok !== 'undefined' && Blocok) || (typeof window !== 'undefined' && window.Blocok) || null; }
  function blocokLiberado() {
    try {
      // desbloqueio PERMANENTE desta máquina (dono/teste): sobrevive a updates (localStorage não é
      // sobrescrito pelo pacote de atualização). Ligado pelo LIBERAR-BLOCOK.html do instalador.
      try { if (typeof localStorage !== 'undefined' && localStorage.getItem('orcapro:blocok:owner') === '1') return true; } catch (_) {}
      var norm = function (e) { return String(e || '').trim().toLowerCase(); };
      var A = (typeof window !== 'undefined' && window.Auth) ? window.Auth : (typeof Auth !== 'undefined' ? Auth : null);
      var emLocal = (A && A.usuario && A.usuario()) ? norm(A.usuario().email) : '';           // login local
      var N = (typeof window !== 'undefined' && window.Nuvem) ? window.Nuvem : null;
      var emNuvem = (N && N.auth && N.auth.currentUser) ? norm(N.auth.currentUser.email) : '';  // login da nuvem
      return blocokEmailLiberado(emLocal) || (!!emNuvem && blocokEmailLiberado(emNuvem));
    } catch (_) { return false; }
  }
  var blocokCfg = { espForcada: 'auto', pesoPorEsp: { 10: 46, 13: 46, 15: 46, 20: 46 }, insCfg: null, moCfg: null, logCfg: null, descontarVaos: true };
  function ensureInsCfg() { if (!blocokCfg.insCfg) { var bk = getBK(); blocokCfg.insCfg = bk ? bk.insumoDefaults() : {}; } return blocokCfg.insCfg; }
  function ensureMoCfg() { if (!blocokCfg.moCfg) { var bk = getBK(); blocokCfg.moCfg = bk ? bk.maoDeObraDefaults() : {}; } return blocokCfg.moCfg; }
  function ensureLogCfg() { if (!blocokCfg.logCfg) { var bk = getBK(); blocokCfg.logCfg = bk ? bk.logisticaDefaults() : {}; } return blocokCfg.logCfg; }
  function ehParedeTipo(t) { t = String(t || '').toUpperCase(); return t.indexOf('WALL') >= 0 || t === 'PAREDE'; }
  function ehVaoTipo(t) { t = String(t || '').toUpperCase(); return t.indexOf('DOOR') >= 0 || t.indexOf('WINDOW') >= 0 || t === 'PORTA' || t === 'JANELA'; }
  function fmtB(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2).replace('.', ','); }
  // pavimento de uma parede: 1) membership declarada no IFC (IfcRelContainedInSpatialStructure via
  // pavLista) 2) por elevação (maior y0 ≤ base) 3) "Pavimento único".
  function pavDaParede(uid, yBase) {
    try {
      var lst = (S._pavLista) ? S._pavLista() : [];
      if (!lst.length) return 'Pavimento único';
      for (var i = 0; i < lst.length; i++) { if (lst[i].uids && lst[i].uids[uid]) return lst[i].nome; }
      var melhor = null;
      lst.forEach(function (pv) { if (pv.y0 != null && pv.y0 <= yBase + 0.5 && (!melhor || pv.y0 > melhor.y0)) melhor = pv; });
      return (melhor && melhor.nome) || lst[0].nome || 'Pavimento único';
    } catch (_) { return 'Pavimento único'; }
  }

  // extrai as paredes VISÍVEIS: pontos XZ (mundo) por parede → OBB 2D (comprimento×
  // espessura + linha de base) + altura pelo Y da malha; detecta vãos pela AABB das
  // portas/janelas projetada na linha da parede.
  function extrairParedesBlocok() {
    var BK = getBK(); if (!BK) return { paredes: [], vaosDet: 0 };
    modelRoot.updateMatrixWorld(true);
    var acc = {}, ordem = [], tmpV = new THREE.Vector3();
    todasMalhas(function (m) {
      var ud = m.userData || {}; if (ud.expressID == null || !m.geometry) return;
      if (!ehParedeTipo(ud.tipo)) return;
      if (m.visible === false || !cadeiaVisivel(m)) return; // respeita isolar/pavimento/4D
      var uid = ud.mid + ':' + ud.expressID, a = acc[uid];
      if (!a) { a = acc[uid] = { pts: [], yMin: Infinity, yMax: -Infinity, tipo: ud.tipo }; ordem.push(uid); }
      var pos = m.geometry.attributes && m.geometry.attributes.position; if (!pos) return;
      var step = Math.max(1, Math.floor(pos.count / 260));
      for (var i = 0; i < pos.count; i += step) {
        tmpV.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        a.pts.push([tmpV.x, tmpV.z]);
        if (tmpV.y < a.yMin) a.yMin = tmpV.y; if (tmpV.y > a.yMax) a.yMax = tmpV.y;
      }
    });
    // portas/janelas (AABB de mundo já calculada no load) + nomes por uid
    var vaos = [], nomePorUid = {};
    (S.modelos || []).forEach(function (mo) {
      (mo.elementos || []).forEach(function (e) {
        nomePorUid[e.uid] = e.nome;
        if (ehVaoTipo(e.tipo) && e.aabb) {
          var mn = e.aabb.min, mx = e.aabb.max;
          vaos.push({ cx: (mn[0] + mx[0]) / 2, cz: (mn[2] + mx[2]) / 2, y0: mn[1], y1: mx[1], sx: mx[0] - mn[0], sz: mx[2] - mn[2] });
        }
      });
    });
    // PASSO 1 — paredes válidas, cada uma com seu frame de base (p1 + eixo ux/uz) p/ atribuir vãos
    var raw = [];
    ordem.forEach(function (uid) {
      var a = acc[uid]; if (a.pts.length < 6) return;
      var obb = BK.obb2dXZ(a.pts); if (!obb) return;
      var L = obb.comprimento, esp = obb.espessura, H = (a.yMax - a.yMin);
      if (L < 0.3 || H < 0.3) return;             // fragmento/degenerada: fora
      if (esp < 0.03) esp = 0.10;                 // espessura implausível → mínima Blocok
      var dx = obb.p2[0] - obb.p1[0], dz = obb.p2[1] - obb.p1[1], dl = Math.sqrt(dx * dx + dz * dz) || 1;
      raw.push({ uid: uid, obb: obb, L: L, esp: esp, H: H, yMin: a.yMin, p1: obb.p1, ux: dx / dl, uz: dz / dl, vlist: [] });
    });
    // PASSO 2 — atribui cada vão à parede DONA (motor puro Blocok.distribuirVaos, Node-testável):
    // menor distância perpendicular → evita descontar a mesma abertura de paredes paralelas próximas
    // (fachada dupla, geminada como 2 IfcWall, shaft, gesso). Desconto desligado → nenhum vão entra.
    var vaosDet = BK.distribuirVaos(raw, blocokCfg.descontarVaos ? vaos : []);
    // PASSO 3 — pagina cada parede com os vãos que lhe pertencem + marca o pavimento
    var paredes = [], np = 0;
    raw.forEach(function (w) {
      var espCm = (blocokCfg.espForcada === 'auto') ? BK.espBlocok(w.esp) : +blocokCfg.espForcada;
      var pag = BK.paginar({ comprimento: w.L, altura: w.H, vaos: w.vlist });
      np++;
      paredes.push({ id: 'P' + np, uid: w.uid, nome: nomePorUid[w.uid] || ('Parede ' + np), comprimento: w.L, altura: w.H, espessura: espCm, espM: w.esp, pag: pag, p1: w.obb.p1, p2: w.obb.p2, vaos: w.vlist, pavimento: pavDaParede(w.uid, w.yMin) });
    });
    return { paredes: paredes, vaosDet: vaosDet };
  }
  S._extrairParedesBlocok = extrairParedesBlocok;

  // prancha executiva SVG de UMA parede (elevação com placas numeradas + recortes cotados + vãos)
  function svgParedeBlocok(pd) {
    var pag = pd.pag, L = pag.comprimento, H = pag.altura, pad = 30;
    var sc = Math.min(720 / L, 300 / H); if (!isFinite(sc) || sc <= 0) sc = 40;
    var iw = L * sc, ih = H * sc, W = iw + pad * 2, Ht = ih + pad * 2 + 20;
    function X(x) { return pad + x * sc; }
    function Y(y) { return pad + (H - y) * sc; } // base embaixo (WebGL/desenho: Y pra cima)
    var s = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + Ht.toFixed(0) + '" width="100%" style="max-width:' + Math.min(760, W).toFixed(0) + 'px;height:auto;background:#fff;border:1px solid #ccc;border-radius:6px">';
    s += '<rect x="' + X(0).toFixed(1) + '" y="' + Y(H).toFixed(1) + '" width="' + iw.toFixed(1) + '" height="' + ih.toFixed(1) + '" fill="#fbfdff" stroke="#123" stroke-width="1.4"/>';
    (pd.vaos || []).forEach(function (v) {
      s += '<rect x="' + X(v.x).toFixed(1) + '" y="' + Y(v.y + v.h).toFixed(1) + '" width="' + (v.w * sc).toFixed(1) + '" height="' + (v.h * sc).toFixed(1) + '" fill="#e8ecef" stroke="#8a97a3" stroke-dasharray="4 3"/>';
      if (v.w * sc > 30 && v.h * sc > 18) s += '<text x="' + X(v.x + v.w / 2).toFixed(1) + '" y="' + Y(v.y + v.h / 2).toFixed(1) + '" font-size="10" fill="#5a6a78" text-anchor="middle" dominant-baseline="middle">VÃO</text>';
    });
    var fs = Math.max(8, Math.min(15, sc * 0.28));
    pag.placas.forEach(function (p) {
      var px = X(p.x), py = Y(p.y + p.h), pw = p.w * sc, ph = p.h * sc, rec = p.tipo === 'recorte';
      s += '<rect x="' + px.toFixed(1) + '" y="' + py.toFixed(1) + '" width="' + pw.toFixed(1) + '" height="' + ph.toFixed(1) + '" fill="' + (rec ? '#fdecc8' : '#e6f0fb') + '" stroke="#2b4a6b" stroke-width="0.7"/>';
      if (pw > 15 && ph > 13) {
        s += '<text x="' + (px + pw / 2).toFixed(1) + '" y="' + (py + ph / 2).toFixed(1) + '" font-size="' + fs.toFixed(1) + '" font-weight="bold" fill="#12314f" text-anchor="middle" dominant-baseline="middle">' + p.n + '</text>';
        if (rec && pw > 42 && ph > 30) s += '<text x="' + (px + pw / 2).toFixed(1) + '" y="' + (py + ph - 3).toFixed(1) + '" font-size="8" fill="#8a5a10" text-anchor="middle">' + Math.round(p.w * 100) + '×' + Math.round(p.h * 100) + '</text>';
      }
    });
    s += '<text x="' + (pad + iw / 2).toFixed(1) + '" y="' + (Ht - 5).toFixed(1) + '" font-size="11" fill="#333" text-anchor="middle">L = ' + fmtB(L) + ' m · H = ' + fmtB(H) + ' m · esp ' + pd.espessura + ' cm</text>';
    return s + '</svg>';
  }

  // mapa de localização das paredes (planta esquemática, P1..Pn nas linhas de base)
  function svgMapaBlocok(paredes) {
    if (!paredes.length) return '';
    var xs = [], zs = [];
    paredes.forEach(function (pd) { xs.push(pd.p1[0], pd.p2[0]); zs.push(pd.p1[1], pd.p2[1]); });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
    var w = (maxX - minX) || 1, h = (maxZ - minZ) || 1, pad = 26;
    var sc = Math.min(680 / w, 420 / h); if (!isFinite(sc) || sc <= 0) sc = 20;
    var W = w * sc + pad * 2, H = h * sc + pad * 2;
    function X(x) { return pad + (x - minX) * sc; }
    function Y(z) { return pad + (z - minZ) * sc; }
    var s = '<svg viewBox="0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0) + '" width="100%" style="max-width:' + Math.min(720, W).toFixed(0) + 'px;height:auto;background:#fff;border:1px solid #ccc;border-radius:6px">';
    paredes.forEach(function (pd) {
      var x1 = X(pd.p1[0]), y1 = Y(pd.p1[1]), x2 = X(pd.p2[0]), y2 = Y(pd.p2[1]), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#1858a8" stroke-width="4" stroke-linecap="round"/>';
      s += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="10" fill="#fff" stroke="#1858a8"/>';
      s += '<text x="' + mx.toFixed(1) + '" y="' + my.toFixed(1) + '" font-size="10" font-weight="bold" fill="#123" text-anchor="middle" dominant-baseline="middle">' + esc(pd.id) + '</text>';
    });
    return s + '</svg>';
  }

  function gerarBlocok(opts) {
    opts = opts || {};
    if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok é um recurso exclusivo (liberado por licença).'); return null; }
    var BK = getBK();
    if (!BK) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Motor Blocok não carregou (js/blocok.js).'); return null; }
    if (!(S.modelos && S.modelos.length)) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Abra um IFC primeiro — o Blocok lê as paredes do modelo.'); return null; }
    var ext = extrairParedesBlocok(), paredes = ext.paredes;
    if (!paredes.length) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Nenhuma parede visível reconhecida (IfcWall). Verifique se o andar/disciplina está ligado.'); return { paredes: [], material: null, carga: null, insumos: null }; }
    var mat = BK.material(paredes, { pesoPorEsp: blocokCfg.pesoPorEsp });
    var carga = BK.cargaFundacao(paredes, { pesoPorEsp: blocokCfg.pesoPorEsp });
    var ins = BK.insumos(paredes, ensureInsCfg());
    var dados = { paredes: paredes, material: mat, carga: carga, insumos: ins, vaosDet: ext.vaosDet };
    if (!opts.semJanela) abrirRelatorioBlocok(dados);
    if (S._hint) S._hint('🧱 ' + paredes.length + ' paredes · ' + mat.totalPlacas + ' placas · ' + fmtB(mat.pesoTotalT) + ' t. Prancha aberta em nova aba.');
    return dados;
  }
  S.blocok = gerarBlocok;
  S._blocokLiberado = blocokLiberado;

  // 📊 planilha Excel multi-abas (Resumo, por pavimento, romaneio, material, insumos, MO, cargas, logística)
  function gerarPlanilhaBlocok() {
    if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Recurso exclusivo (liberado por licença).'); return null; }
    var BK = getBK(); if (!BK) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Motor Blocok não carregou.'); return null; }
    var XLS = (typeof window !== 'undefined' && window.BlocokXLS) || null;
    if (!XLS) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Módulo de planilha não carregou (js/blocokxls.js).'); return null; }
    if (!(S.modelos && S.modelos.length)) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Abra um IFC primeiro.'); return null; }
    var ext = extrairParedesBlocok(), paredes = ext.paredes;
    if (!paredes.length) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Nenhuma parede visível reconhecida (IfcWall).'); return null; }
    var pesoCfg = { pesoPorEsp: blocokCfg.pesoPorEsp }, ic = ensureInsCfg();
    var mat = BK.material(paredes, pesoCfg);
    var pacote = {
      obra: (S.opts && (S.opts.obraNome || S.opts.obra)) || 'Obra', data: new Date().toLocaleDateString('pt-BR'),
      paredes: paredes, material: mat, insumos: BK.insumos(paredes, ic), carga: BK.cargaFundacao(paredes, pesoCfg),
      maoObra: BK.maoDeObra(mat, ensureMoCfg()), logistica: BK.logistica(mat, ensureLogCfg()),
      moCfg: ensureMoCfg(), pesoCfg: pesoCfg,
      juntaNome: (ic.junta && ic.junta.tipo === 'argamassa') ? 'argamassa polimérica (junta preenchida)' : (ic.junta && ic.junta.tipo === 'seca') ? 'encaixe seco' : 'cola/adesivo polimérico (cordão)',
      premissas: { faceCm: ic.faceCm, cimento: ic.mix && ic.mix.cimento, areia: ic.mix && ic.mix.areia, pedrisco: ic.mix && ic.mix.pedrisco, aditivo: ic.mix && ic.mix.aditivo }
    };
    if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Gerando a planilha Excel (' + paredes.length + ' paredes, ' + mat.totalPlacas + ' placas)…');
    XLS.gerar(pacote, {
      nome: 'Blocok — ' + pacote.obra + ' — ' + pacote.data.replace(/\//g, '-'),
      ok: function () { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Planilha Excel baixada — abas por pavimento + romaneio + material + insumos + mão de obra + cargas + logística.'); },
      erro: function (e) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Não gerou a planilha (' + e + ').'); }
    });
    return pacote;
  }
  S.blocokPlanilha = gerarPlanilhaBlocok;

  function abrirRelatorioBlocok(d) {
    var w = null; try { w = window.open('', '_blank'); } catch (_) {}
    if (!w) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' O navegador bloqueou a nova aba — libere pop-ups pra ver as pranchas Blocok.'); return; }
    var obra = (S.opts && (S.opts.obraNome || S.opts.obra)) || 'Obra', hoje = new Date().toLocaleDateString('pt-BR');
    var m = d.material, cg = d.carga;
    function card(v, l) { return '<div class="cd"><b>' + v + '</b><span>' + esc(l) + '</span></div>'; }
    var cards = card(d.paredes.length, 'paredes') + card(m.totalPlacas, 'placas 90×90') + card(m.totalInteiras, 'inteiras') + card(m.totalRecortes, 'recortes') + card(fmtB(m.areaPlacas) + ' m²', 'área de placa') + card(fmtB(m.pesoTotalT) + ' t', 'peso p/ compra');
    var trEsp = m.porEspessura.map(function (e) { return '<tr><td>' + e.espessura + ' cm</td><td>' + e.placas + '</td><td>' + e.inteiras + '</td><td>' + e.recortes + '</td><td>' + fmtB(e.area) + '</td><td>' + fmtB(e.peso) + '</td></tr>'; }).join('');
    var ins = d.insumos || { producao: [], montagem: [], areaCheia: 0, areaInstalada: 0, juntaTipo: '' };
    function trInsumo(i) { return '<tr><td>' + esc(i.nome) + '</td><td>' + fmtB(i.total) + '</td><td>' + esc(i.unid) + '</td></tr>'; }
    var trProd = (ins.producao || []).map(trInsumo).join('');
    var juntaNome = ins.juntaTipo === 'argamassa' ? 'argamassa polimérica (junta preenchida)' : (ins.juntaTipo === 'seca' ? 'encaixe seco (sem argamassa)' : 'adesivo/argamassa polimérica (cordão)');
    var trMont = (ins.montagem || []).length ? (ins.montagem || []).map(trInsumo).join('') : '<tr><td colspan="3" style="text-align:left;color:#5a6a78">Junta seca — sem consumo de argamassa/adesivo.</td></tr>';
    var trCg = cg.linhas.map(function (l, ix) { var pd = d.paredes[ix]; return '<tr><td>' + esc(pd ? pd.id : ('P' + (ix + 1))) + '</td><td>' + fmtB(l.comprimento) + '</td><td>' + l.espessura + '</td><td>' + l.placas + '</td><td>' + fmtB(l.pesoKg) + '</td><td>' + fmtB(l.cargaKgM) + '</td><td>' + fmtB(l.cargaKNm) + '</td></tr>'; }).join('');
    var pranchas = d.paredes.map(function (pd) {
      var pg = pd.pag;
      return '<div class="pr"><h3>' + esc(pd.id) + ' — ' + esc(pd.nome) + '</h3><div class="meta">' + fmtB(pd.comprimento) + ' × ' + fmtB(pd.altura) + ' m · esp ' + pd.espessura + ' cm · ' + pg.total + ' placas (' + pg.inteiras + ' inteiras + ' + pg.recortes + ' recortes)' + (pd.vaos && pd.vaos.length ? ' · ' + pd.vaos.length + ' vão(s)' : '') + '</div>' + svgParedeBlocok(pd) + '</div>';
    }).join('');
    var mapa = svgMapaBlocok(d.paredes);
    var css = '*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;color:#12314f;background:#f4f7fb}'
      + 'header{background:linear-gradient(135deg,#0f2740,#1858a8);color:#fff;padding:20px 26px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}'
      + 'header h1{margin:0;font-size:21px}header .sub{opacity:.85;font-size:13px;margin-top:3px}'
      + '.wrap{max-width:1000px;margin:0 auto;padding:18px 22px 20px}.cards{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}'
      + '.cd{background:#fff;border:1px solid #dbe4ee;border-radius:10px;padding:10px 14px;min-width:96px;flex:1}.cd b{display:block;font-size:20px;color:#1858a8}.cd span{font-size:11px;color:#5a6a78;text-transform:uppercase;letter-spacing:.4px}'
      + 'h2{font-size:15px;border-bottom:2px solid #1858a8;padding-bottom:5px;margin:26px 0 12px}'
      + 'table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}th,td{border:1px solid #d5dfea;padding:6px 9px;text-align:right}th{background:#eaf1f8}td:first-child,th:first-child{text-align:left}'
      + '.conf{color:#b26a00;font-style:italic}.leg{display:flex;flex-wrap:wrap;gap:16px;font-size:11.5px;color:#5a6a78;margin:8px 0}.leg span{display:inline-flex;align-items:center;gap:5px}.sw{width:14px;height:14px;border-radius:3px;border:1px solid #2b4a6b;display:inline-block}'
      + '.pr{background:#fff;border:1px solid #dbe4ee;border-radius:10px;padding:14px;margin:14px 0;page-break-inside:avoid}.pr h3{margin:0 0 3px;font-size:14px;color:#1858a8}.pr .meta{font-size:12px;color:#5a6a78;margin-bottom:8px}'
      + 'footer{max-width:1000px;margin:0 auto;padding:8px 22px 40px;font-size:11px;color:#7a8a99;line-height:1.55}'
      + '.pbtn{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-size:13px;cursor:pointer}'
      + '@media print{.pbtn,.noprint{display:none}body{background:#fff}}';
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plantas Executivas Blocok — ' + esc(obra) + '</title><style>' + css + '</style></head><body>'
      + '<header><div><h1>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas — Sistema Blocok</h1><div class="sub">' + esc(obra) + ' · ' + hoje + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · gerado no OrçaPRO BIM':'') + '</div></div><button class="pbtn noprint" onclick="window.print()">' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Imprimir / PDF</button></header>'
      + '<div class="wrap">'
      + '<div class="cards">' + cards + '</div>'
      + '<div class="leg"><span><i class="sw" style="background:#e6f0fb"></i> placa inteira 90×90 cm</span><span><i class="sw" style="background:#fdecc8"></i> recorte (dimensão em cm)</span><span><i class="sw" style="background:#e8ecef;border-style:dashed"></i> vão (porta/janela)</span></div>'
      + (mapa ? '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('planta', 15) : '') + ' Mapa de localização das paredes</h2>' + mapa : '')
      + '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('estoque', 15) : '') + ' Material — placas por espessura</h2><table><thead><tr><th>Espessura</th><th>Placas</th><th>Inteiras</th><th>Recortes</th><th>Área (m²)</th><th>Peso (kg)</th></tr></thead><tbody>' + trEsp + '<tr style="font-weight:bold;background:#eef4fa"><td>Total</td><td>' + m.totalPlacas + '</td><td>' + m.totalInteiras + '</td><td>' + m.totalRecortes + '</td><td>' + fmtB(m.areaPlacas) + '</td><td>' + fmtB(m.pesoTotalKg) + '</td></tr></tbody></table>'
      + '<h2>🏭 Insumos de produção das placas <span style="font-size:11px;color:#5a6a78;font-weight:400">(fábrica — por placa cheia produzida: ' + fmtB(ins.areaCheia) + ' m²)</span></h2><table><thead><tr><th>Insumo</th><th>Quantidade</th><th>Unid.</th></tr></thead><tbody>' + trProd + '</tbody></table>'
      + '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Insumos de montagem/assentamento <span style="font-size:11px;color:#5a6a78;font-weight:400">(obra — junta: ' + esc(juntaNome) + ' · por ' + fmtB(ins.areaInstalada) + ' m² instalados)</span></h2><table><thead><tr><th>Insumo</th><th>Quantidade</th><th>Unid.</th></tr></thead><tbody>' + trMont + '</tbody></table>'
      + '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Carga própria das paredes na fundação</h2><table><thead><tr><th>Parede</th><th>Comp. (m)</th><th>Esp. (cm)</th><th>Placas</th><th>Peso (kg)</th><th>Carga (kg/m)</th><th>Carga (kN/m)</th></tr></thead><tbody>' + trCg + '<tr style="font-weight:bold;background:#eef4fa"><td>Total</td><td>—</td><td>—</td><td>' + m.totalPlacas + '</td><td>' + fmtB(cg.pesoTotalKg) + '</td><td>—</td><td>—</td></tr></tbody></table>'
      + '<h2>' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Pranchas executivas por parede</h2>' + pranchas
      + '</div>'
      + '<footer><b>Observações e premissas (honestidade técnica):</b><br>'
      + '1) Os insumos são uma <b>estimativa técnica calculada</b> a partir da geometria do painel (2 faces de micro concreto + núcleo EPS + junta de assentamento) com um <b>traço de referência editável</b>: produção por placa cheia produzida, assentamento por m² instalado conforme a <b>junta escolhida</b>. Ajuste traço/junta/peso no painel se a sua fábrica usar valores próprios.<br>'
      + '2) Comprimento, altura e espessura de cada parede são extraídos da geometria do IFC (OBB 2D no plano); paredes fora de esquadro, curvas ou fragmentadas podem exigir conferência manual.<br>'
      + '3) Vãos de porta/janela são detectados automaticamente pela posição no modelo — confira nas pranchas (só some a placa 100% dentro do vão).<br>'
      + '4) A carga na fundação é o <b>peso próprio LÍQUIDO</b> das paredes (área de placa efetivamente instalada — o retalho do recorte é descartado, não pesa na parede). Já o card <b>“peso p/ compra”</b> soma <b>placas cheias</b> (o que você adquire/transporta). Não inclui laje, cobertura nem sobrecarga de uso — some às demais cargas no dimensionamento estrutural.<br>'
      + '5) Placas numeradas em fiadas da <b>base para o topo</b>, da <b>esquerda para a direita</b>. ' + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?'Gerado no OrçaPRO BIM.':'') + '</footer>'
      + '</body></html>';
    try { w.document.write(html); w.document.close(); } catch (_) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Não deu pra montar a prancha na nova aba.'); }
  }

  // painel flutuante do Blocok (espessura + peso + insumos editáveis + desconto de vãos)
  var blocokPanel = document.createElement('div');
  blocokPanel.style.cssText = 'position:absolute;left:10px;bottom:14px;z-index:4;display:none;flex-direction:column;gap:7px;background:rgba(15,39,64,.96);border:1px solid #24435f;border-radius:11px;padding:12px 13px;color:#dbe8f5;font-size:12px;width:264px;max-height:80%;overflow:auto';
  host.appendChild(blocokPanel);
  S.blocokPanel = blocokPanel;
  var INP = 'width:58px;background:#0b1a2b;border:1px solid #24435f;color:#dbe8f5;border-radius:5px;padding:2px 5px';
  function linhaNum(rot, attrs, val, unid) {
    return '<label style="display:flex;align-items:center;gap:5px;margin-top:3px"><span style="flex:1;color:#9fb2c8;font-size:11px">' + rot + '</span><input type="number" min="0" step="0.1" ' + attrs + ' value="' + val + '" style="' + INP + '"><span style="color:#9fb2c8;font-size:10px;width:40px">' + unid + '</span></label>';
  }
  function pintarBlocokPanel() {
    var c = ensureInsCfg();
    var espOpts = ['auto', 10, 13, 15, 20].map(function (v) { return '<option value="' + v + '"' + (String(blocokCfg.espForcada) === String(v) ? ' selected' : '') + '>' + (v === 'auto' ? 'Automática (espessura real)' : v + ' cm') + '</option>'; }).join('');
    var juntaOpts = [['cola', 'Cola/adesivo polimérico (cordão)'], ['argamassa', 'Argamassa polimérica (junta preenchida)'], ['seca', 'Encaixe seco (sem argamassa)']].map(function (o) { return '<option value="' + o[0] + '"' + (c.junta.tipo === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    var juntaExtra = (c.junta.tipo === 'cola') ? linhaNum('Consumo do adesivo', 'data-bkj="cola"', c.junta.colaKgM2, 'kg/m²')
      : (c.junta.tipo === 'argamassa') ? linhaNum('Espessura da junta', 'data-bkj="gap"', c.junta.gapCm, 'cm') : '';
    var pesos = [10, 13, 15, 20].map(function (e) { return '<label style="display:flex;align-items:center;gap:5px;margin-top:3px"><span style="width:36px;color:#9fb2c8">' + e + ' cm</span><input type="number" min="1" step="0.5" data-bkp="peso" data-esp="' + e + '" value="' + blocokCfg.pesoPorEsp[e] + '" style="' + INP + '"><span style="color:#9fb2c8;font-size:11px">kg/placa</span></label>'; }).join('');
    var traco = linhaNum('Cimento CP-V', 'data-bkm="cimento"', c.mix.cimento, 'kg/m³')
      + linhaNum('Areia industrial', 'data-bkm="areia"', c.mix.areia, 'm³/m³')
      + linhaNum('Pedrisco', 'data-bkm="pedrisco"', c.mix.pedrisco, 'm³/m³')
      + linhaNum('Aditivo polimérico', 'data-bkm="aditivo"', c.mix.aditivo, 'kg/m³')
      + linhaNum('Face de micro concreto', 'data-bkf="face"', c.faceCm, 'cm');
    var mc = ensureMoCfg(), lc = ensureLogCfg();
    var molog = linhaNum('Rendimento', 'data-bkmo="placasDiaEquipe"', mc.placasDiaEquipe, 'placas/dia')
      + linhaNum('Equipes', 'data-bkmo="nEquipes"', mc.nEquipes, 'equipe')
      + linhaNum('Pessoas/equipe', 'data-bkmo="pessoasEquipe"', mc.pessoasEquipe, 'pess.')
      + linhaNum('Jornada', 'data-bkmo="jornadaH"', mc.jornadaH, 'h/dia')
      + linhaNum('Custo MO', 'data-bkmo="custoHh"', mc.custoHh, 'R$/Hh')
      + linhaNum('Capac./viagem', 'data-bklg="pesoViagemKg"', lc.pesoViagemKg, 'kg')
      + linhaNum('Placas/pallet', 'data-bklg="placasPallet"', lc.placasPallet, 'un');
    blocokPanel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok</b><button class="btn sm" data-bk="fechar" style="padding:2px 8px">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>'
      + '<div style="font-size:11px;color:#9fb2c8;line-height:1.35">Lê as paredes do IFC → pranchas 90×90 numeradas + material + <b>insumos calculados</b> + carga na fundação.</div>'
      + '<label style="display:flex;flex-direction:column;gap:2px"><span style="color:#9fb2c8">Espessura Blocok</span><select data-bk="esp" style="background:#0b1a2b;border:1px solid #24435f;color:#dbe8f5;border-radius:5px;padding:3px 5px">' + espOpts + '</select></label>'
      + '<label style="display:flex;flex-direction:column;gap:2px;margin-top:2px"><span style="color:#9fb2c8">Junta de assentamento</span><select data-bk="junta" style="background:#0b1a2b;border:1px solid #24435f;color:#dbe8f5;border-radius:5px;padding:3px 5px">' + juntaOpts + '</select></label>' + juntaExtra
      + '<details style="border-top:1px solid #24435f;padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#cfe0f2">Traço do micro concreto (avançado)</summary>' + traco + '</details>'
      + '<details style="border-top:1px solid #24435f;padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#cfe0f2">Peso por placa (compra)</summary>' + pesos + '</details>'
      + '<details style="border-top:1px solid #24435f;padding-top:5px"><summary style="cursor:pointer;font-size:11px;color:#cfe0f2">Mão de obra & logística (planilha)</summary>' + molog + '</details>'
      + '<label style="display:flex;align-items:center;gap:6px;margin-top:2px"><input type="checkbox" data-bk="vaos"' + (blocokCfg.descontarVaos ? ' checked' : '') + '> descontar vãos (portas/janelas)</label>'
      + '<button class="btn sm primary" data-bk="gerar" style="margin-top:2px">' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Gerar plantas executivas</button>'
      + '<button class="btn sm" data-bk="planilha" style="margin-top:2px">' + (typeof Icones !== 'undefined' ? Icones.get('graficos', 15) : '') + ' Gerar planilha (Excel)</button>'
      + '<div style="font-size:10px;color:#8296ab;line-height:1.3">Planilha com abas por pavimento, romaneio de placas, material, insumos, mão de obra, cargas e logística. Insumos <b>calculados</b> (traço editável).</div>';
  }
  function toggleBlocokPanel() {
    if (!blocokLiberado()) { if (S._hint) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Plantas Executivas Blocok é um recurso exclusivo (liberado por licença).'); return; }
    var abrir = (blocokPanel.style.display === 'none' || !blocokPanel.style.display);
    if (abrir) { pintarBlocokPanel(); fecharPaineis(blocokPanel); blocokPanel.style.display = 'flex'; }
    else blocokPanel.style.display = 'none';
    var b = bar.querySelector('[data-b="blocok"]'); if (b) { b.style.background = abrir ? corAtiva() : ''; b.style.color = abrir ? '#fff' : ''; }
  }
  S._toggleBlocok = toggleBlocokPanel;
  blocokPanel.addEventListener('change', function (e) {
    var t = e.target; if (!t.getAttribute) return;
    var k = t.getAttribute('data-bk'), kp = t.getAttribute('data-bkp'), kj = t.getAttribute('data-bkj'), kf = t.getAttribute('data-bkf'), km = t.getAttribute('data-bkm'), kmo = t.getAttribute('data-bkmo'), klg = t.getAttribute('data-bklg');
    var c = ensureInsCfg();
    if (k === 'esp') blocokCfg.espForcada = (t.value === 'auto') ? 'auto' : +t.value;
    else if (k === 'vaos') blocokCfg.descontarVaos = !!t.checked;
    else if (k === 'junta') { c.junta.tipo = t.value; pintarBlocokPanel(); } // re-renderiza p/ mostrar o campo da junta escolhida
    else if (kj === 'cola') c.junta.colaKgM2 = Math.max(0, +t.value || 0);
    else if (kj === 'gap') c.junta.gapCm = Math.max(0, +t.value || 0);
    else if (kf === 'face') c.faceCm = Math.max(0.3, +t.value || 1.5);
    else if (km) c.mix[km] = Math.max(0, +t.value || 0);
    else if (kmo) ensureMoCfg()[kmo] = Math.max(0, +t.value || 0);
    else if (klg) ensureLogCfg()[klg] = Math.max(0, +t.value || 0);
    else if (kp === 'peso') { var esp = t.getAttribute('data-esp'), val = +t.value; if (val > 0) blocokCfg.pesoPorEsp[esp] = val; }
  });
  blocokPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bk]'); if (!b) return; var k = b.getAttribute('data-bk');
    if (k === 'fechar') toggleBlocokPanel();
    else if (k === 'gerar') gerarBlocok({});
    else if (k === 'planilha') gerarPlanilhaBlocok();
  });

  function pintarSnapPanel() {
    var cfg = { on: snap.on, v: snap.v, m: snap.m, a: snap.a, i: snap.i, c: snap.c };
    ['on', 'v', 'm', 'a', 'i', 'c'].forEach(function (kk) {
      var b = snapPanel.querySelector('[data-s="' + kk + '"]'); if (!b) return;
      b.style.background = cfg[kk] ? corAtiva() : ''; b.style.color = cfg[kk] ? '#fff' : '';
      if (kk === 'on') b.textContent = cfg.on ? 'ON' : 'OFF';
    });
    var bs = bar.querySelector('[data-b="snap"]'); if (bs) { bs.style.background = snap.on ? corAtiva() : ''; bs.style.color = snap.on ? '#fff' : ''; bs.style.outline = (snapPanel.style.display === 'flex') ? '2px solid #7fe0a3' : ''; }
  }
  pintarSnapPanel();
  function toggleSnapPanel() { var abrir = (snapPanel.style.display === 'none' || !snapPanel.style.display); fecharPaineis(abrir ? snapPanel : null); snapPanel.style.display = abrir ? 'flex' : 'none'; pintarSnapPanel(); } // repinta -> botão mostra painel aberto
  snapPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-s]'); if (!b) return; var kk = b.getAttribute('data-s');
    if (kk === 'on') snap.on = !snap.on; else snap[kk] = !snap[kk];
    if (!snap.on) esconderSnapMarca();
    salvarSnap(); pintarSnapPanel();
  });
  // marcador HTML (não entra na cena 3D: não é clipado nem raycastado)
  var snapMarca = document.createElement('div');
  snapMarca.style.cssText = 'position:absolute;z-index:5;display:none;pointer-events:none;transform:translate(-50%,-50%)';
  snapMarca.innerHTML = '<div data-sm="ico" style="width:12px;height:12px;border:2px solid #22c55e;margin:0 auto"></div><div data-sm="rot" style="font-size:10px;font-weight:700;color:#7fe0a3;text-shadow:0 1px 2px rgba(0,0,0,.8);text-align:center;margin-top:2px"></div>';
  host.appendChild(snapMarca);
  S.snapMarca = snapMarca;
  var SNAP_VIS = { vertice: { cor: '#22c55e', borda: '0', rot: 'vértice' }, meio: { cor: '#f59e0b', borda: '50%', rot: 'meio' }, aresta: { cor: '#38bdf8', borda: '0', rot: 'aresta' }, intersecao: { cor: '#e879f9', borda: '0', rot: '✚ interseção' }, centro: { cor: '#facc15', borda: '50%', rot: '⊕ centro' } };
  // o marcador é ANCORADO NO MUNDO e re-projetado a cada frame (achado do usuário: posicionado
  // uma única vez, ficava "pendurado" na tela enquanto o damping da câmera ainda deslizava —
  // o ponto mostrado parecia longe/bugado em relação ao ponto real)
  var snapVivo = null; // { p: Vector3, tipo }

  // ============================================================
  // ┿ TRAÇOS FINOS nos cantos, começos e meios à volta do cursor
  //
  // Traços de 1 px marcando canto, começo, meio e centro dos objetos ao redor
  // do cursor, enquanto uma ferramenta de ponto está ativa.
  //
  // O marcador mostra UM ponto: o que venceu. Isso responde "onde vai agarrar"
  // mas não responde "o que existe aqui" — e é a segunda pergunta de quem acha
  // que o snap pegou no lugar errado. Vendo os candidatos, move-se dois pixels
  // e pega-se o que se queria, em vez de tentar de novo às cegas.
  //
  // São 1 px de verdade e no máximo 8: mais que isso vira sujeira sobre o
  // modelo, e tela limpa é requisito desta mesma tela.
  // ============================================================
  var NOTAVEL_MAX = 8;
  var NOTAVEL_MIN_SEP = 9;   // px entre dois traços: o próprio traço tem 11 px de vao
  var notavelPool = [], notavelPts = [];
  function notavelEl(i) {
    var vivo = (S && S.host) || host;   // nunca o `host` do fecho: ele morre na 2ª visita à aba
    if (notavelPool[i]) {
      /* re-pendura sozinho depois de o viewer trocar de host (App.render refaz o
         HTML da aba). Sem isto os traços ficariam presos no host descartado — o
         mesmo jeito de sumir calado que já pegou o sisPanel e o blocokPanel. */
      if (notavelPool[i].parentNode !== vivo) vivo.appendChild(notavelPool[i]);
      return notavelPool[i];
    }
    var d = document.createElement('div');
    d.setAttribute('data-bim', 'notavel');
    d.style.cssText = 'position:absolute;z-index:3;display:none;pointer-events:none;width:11px;height:11px;transform:translate(-50%,-50%);opacity:.75';
    vivo.appendChild(d); notavelPool[i] = d; return d;
  }
  function notaveisEsconder() { notavelPts = []; for (var i = 0; i < notavelPool.length; i++) notavelPool[i].style.display = 'none'; }
  function notaveisDefinir(lista) {
    notavelPts = [];
    if (!lista || !lista.length || !snap.on) { notaveisEsconder(); return; }
    /* mais perto primeiro, e sem repetir o mesmo canto que dezenas de arestas
       vizinhas devolvem — senão os 8 lugares vão todos para o mesmo ponto.
       ⚠ A DEDUPLICAÇÃO É POR TELA, não pelo mundo. Deduplicar em 3D deixava
       passar pontos legitimamente distintos que se PROJETAM no mesmo pixel — as
       duas faces de uma parede fina vistas de canto, por exemplo. Na primeira
       versão os 8 traços saíram empilhados em 2 lugares: tecnicamente corretos
       e visualmente inúteis, que é justamente o oposto do que foi pedido. O que
       importa aqui é o olho, então a régua tem de ser a do olho. */
    var rc = canvasEl.getBoundingClientRect();
    var ord = lista.slice().sort(function (a, b) { return a.d - b.d; }), aceitos = [];
    for (var i = 0; i < ord.length && notavelPts.length < NOTAVEL_MAX; i++) {
      var q = _snP.copy(ord[i].v).project(camera);
      if (q.z > 1 || q.z < -1) continue;
      var sx = (q.x + 1) / 2 * rc.width, sy = (1 - q.y) / 2 * rc.height;
      /* ⚠ DISTÂNCIA, não balde de grade. Arredondar para uma grade de 6 px
         separa 92 e 94 em baldes vizinhos e os dois traços saem colados assim
         mesmo — foi o que apareceu na tela. Com no máximo 8 aceitos, comparar
         um a um custa nada e não tem borda de balde. */
      var colado = false;
      for (var ai = 0; ai < aceitos.length; ai++) {
        var ddx = aceitos[ai][0] - sx, ddy = aceitos[ai][1] - sy;
        if (ddx * ddx + ddy * ddy < NOTAVEL_MIN_SEP * NOTAVEL_MIN_SEP) { colado = true; break; }
      }
      if (colado) continue;
      aceitos.push([sx, sy]); notavelPts.push(ord[i]);
    }
    posicionarNotaveis();
  }
  function posicionarNotaveis() {
    /* ⚠ `S.host`: o `host` do fecho MORRE na 2ª visita à aba (ver `resize`). Medir o host descartado devolve zeros e a sobreposição sai deslocada da origem do palco — lupa longe do dedo, guias fora do ponto. */
    var rc = canvasEl.getBoundingClientRect(), hr = ((S && S.host) || host).getBoundingClientRect(), i;
    for (i = 0; i < notavelPool.length; i++) if (i >= notavelPts.length) notavelPool[i].style.display = 'none';
    for (i = 0; i < notavelPts.length; i++) {
      var el = notavelEl(i), n = notavelPts[i];
      var q = _snP.copy(n.v).project(camera);
      if (q.z > 1 || q.z < -1) { el.style.display = 'none'; continue; }
      el.style.left = ((q.x + 1) / 2 * rc.width + (rc.left - hr.left)) + 'px';
      el.style.top = ((1 - q.y) / 2 * rc.height + (rc.top - hr.top)) + 'px';
      /* ⚠ a COR só muda quando o tipo muda, e o tipo não muda entre quadros.
         Remontar a string do gradiente e reescrever `background` nos 8 traços a
         cada quadro era trabalho puro, para sempre, mesmo com nada se mexendo. */
      if (el._corBim !== n.tipo) {
        var cor = (SNAP_VIS[n.tipo] || { cor: '#22c55e' }).cor;
        /* cruz de 1 px em duas faixas — sem borda, sem sombra: fino de verdade */
        el.style.background = 'linear-gradient(' + cor + ',' + cor + ') center/11px 1px no-repeat,'
          + 'linear-gradient(' + cor + ',' + cor + ') center/1px 11px no-repeat';
        el._corBim = n.tipo;
      }
      el.style.display = 'block';
    }
  }

  function posicionarSnapMarca() {
    if (notavelPts.length) posicionarNotaveis();
    if (!snapVivo) return;
    var rc = canvasEl.getBoundingClientRect(), hr = ((S && S.host) || host).getBoundingClientRect();   // host VIVO (idem)
    var q = snapVivo.p.clone().project(camera);
    if (q.z > 1 || q.z < -1) { snapMarca.style.display = 'none'; return; } // atrás da câmera/fora do frustum
    var x = (q.x + 1) / 2 * rc.width + (rc.left - hr.left), y = (1 - q.y) / 2 * rc.height + (rc.top - hr.top);
    snapMarca.style.left = x + 'px'; snapMarca.style.top = y + 'px'; snapMarca.style.display = 'block';
    /* as guias seguem o MESMO ponto do mundo, reprojetado a cada quadro — se
       fossem posicionadas uma vez só, ficariam penduradas na tela enquanto o
       amortecimento da câmera ainda desliza, que é o defeito que esta função
       já corrige para o marcador. */
    var vg = SNAP_VIS[snapVivo.tipo];
    if (snapVivo.tipo) guiasEm(x, y, vg ? vg.cor : '#22c55e');
    else guiasEsconder();   /* sem ponto agarrado não há alinhamento a mostrar: guia aí seria promessa falsa */
  }
  S._tickExtra.push(function () { posicionarSnapMarca(); });
  function mostrarSnapMarca(sn) {
    notaveisDefinir(sn && sn.notaveis);
    if (!sn || !sn.tipo) {
      snapVivo = null; guiasEsconder();
      /* ⚠ ELEMENTO PESADO: o snap não é pulado à toa — gerar as arestas de uma
         malha densa (terreno, mobiliário importado) trava o hover. Mas até aqui
         ele PULAVA CALADO: nenhuma marca, nenhum aviso, e quem media concluia
         que "o snap não pega direito". Um limite técnico legítimo virava queixa
         de imprecião. Agora ele diz o que houve; inventar ponto continua fora. */
      if (sn && sn.pesado && snap.on) {
        var icoP = snapMarca.querySelector('[data-sm="ico"]');
        icoP.style.borderColor = '#94a3b8'; icoP.style.borderRadius = '50%'; icoP.style.transform = '';
        var rotP = snapMarca.querySelector('[data-sm="rot"]');
        rotP.textContent = 'sem snap (peça pesada)'; rotP.style.color = '#94a3b8';
        snapVivo = { p: sn.p.clone(), tipo: null };
        posicionarSnapMarca();
        return;
      }
      snapMarca.style.display = 'none';
      return;
    }
    var vis = SNAP_VIS[sn.tipo], ico = snapMarca.querySelector('[data-sm="ico"]');
    ico.style.borderColor = vis.cor; ico.style.borderRadius = vis.borda;
    ico.style.transform = (sn.tipo === 'aresta' || sn.tipo === 'intersecao') ? 'rotate(45deg)' : '';
    snapMarca.querySelector('[data-sm="rot"]').textContent = vis.rot;
    snapMarca.querySelector('[data-sm="rot"]').style.color = vis.cor;
    snapVivo = { p: sn.p.clone(), tipo: sn.tipo };
    posicionarSnapMarca();
  }
  function esconderSnapMarca() { snapVivo = null; snapMarca.style.display = 'none'; guiasEsconder(); notaveisEsconder(); }

  // ============================================================
  // ┼ LINHAS-GUIA FINAS — onde o ponto vai cair, atravessando a tela
  //
  // O marcador de snap é um quadradinho de 12px. Num modelo cheio ele se
  // perde no meio da geometria: o ponto agarrado até estava certo, mas não
  // dava para VER onde tinha caído antes de soltar o clique — e isso se lê
  // como imprecião.
  //
  // Duas linhas de 1px atravessando a tela pelo ponto resolvem porque dão
  // ALINHAMENTO: a pessoa enxerga que o ponto está na mesma altura do topo
  // da parede, ou na mesma prumada do eixo do tubo. É o que o CAD faz há
  // trinta anos, e é barato — duas divs, sem custo de GPU.
  // ============================================================
  var guiaH = document.createElement('div'), guiaV = document.createElement('div');
  guiaH.setAttribute('data-bim', 'guia-h');
  guiaH.style.cssText = 'position:absolute;left:0;right:0;height:0;border-top:1px dashed rgba(34,197,94,.55);z-index:4;display:none;pointer-events:none';
  guiaV.setAttribute('data-bim', 'guia-v');
  guiaV.style.cssText = 'position:absolute;top:0;bottom:0;width:0;border-left:1px dashed rgba(34,197,94,.55);z-index:4;display:none;pointer-events:none';
  host.appendChild(guiaH); host.appendChild(guiaV);
  S.guiaH = guiaH; S.guiaV = guiaV;
  function guiasEsconder() { guiaH.style.display = 'none'; guiaV.style.display = 'none'; }
  function guiasEm(x, y, cor) {
    guiaH.style.borderTopColor = cor; guiaV.style.borderLeftColor = cor;
    guiaH.style.top = y + 'px'; guiaV.style.left = x + 'px';
    guiaH.style.display = 'block'; guiaV.style.display = 'block';
  }

  // ============================================================
  // 🔍 LUPA — mirar no dedo sem o dedo tapar o alvo
  //
  // O PROBLEMA, no celular e no tablet: para colocar um ponto você toca — e
  // o dedo cobre exatamente o pixel que você quer. Pior, o `pointerup` só
  // aceita o ponto se você NÃO arrastou (>10px vira órbita), então não dá
  // nem para ajustar a mira: é acertar de primeira, às cegas. E o marcador
  // de snap, que mostraria onde vai agarrar, só aparecia no `pointermove` —
  // que no toque não existe antes do toque.
  //
  // COMO FUNCIONA: toque e SEGURE (~350 ms). A lupa abre ACIMA do dedo,
  // ampliando 3× a região sob ele, com a cruz no centro. A partir daí,
  // arrastar move a MIRA (a câmera fica parada), o snap roda a cada quadro
  // e o que vai ser agarrado aparece dentro da lupa. Solta: o ponto entra
  // onde a cruz estava.
  //
  // ⚠ POR QUE TOQUE-E-SEGURE, e não "arrastar mira sempre": arrastar com um
  //   dedo é ORBITAR, e sempre foi. Roubar esse gesto quebraria a navegação
  //   de quem já usa. O toque simples continua funcionando igual — a lupa é
  //   para quem precisa de precisão, e ela se anuncia sozinha.
  // ============================================================
  var LUPA_Z = 3.0, LUPA_D = 132, LUPA_ESPERA = 350;
  var lupa = { on: false, x: 0, y: 0, timer: null, id: null, sn: null };
  S.lupa = lupa;
  var lupaEl = document.createElement('div');
  lupaEl.setAttribute('data-bim', 'lupa');   // âncora do teste e do suporte
  lupaEl.style.cssText = 'position:absolute;z-index:9;display:none;pointer-events:none;width:' + LUPA_D + 'px;height:' + LUPA_D + 'px;' +
    'border-radius:50%;overflow:hidden;border:3px solid rgba(34,197,94,.95);box-shadow:0 6px 22px rgba(0,0,0,.45);transform:translate(-50%,-50%);background:#0f2740';
  var lupaCv = document.createElement('canvas');
  lupaCv.width = LUPA_D; lupaCv.height = LUPA_D;
  lupaCv.style.cssText = 'width:100%;height:100%;display:block';
  lupaEl.appendChild(lupaCv);
  host.appendChild(lupaEl);
  S.lupaEl = lupaEl;
  var lupaCtx = lupaCv.getContext('2d');

  function lupaDesenhar() {
    if (!lupa.on || !lupaCtx) return;
    var rc = canvasEl.getBoundingClientRect();
    var dpr = (canvasEl.width / Math.max(1, rc.width)) || 1;   // canvas em pixels do aparelho
    var cx = (lupa.x - rc.left) * dpr, cy = (lupa.y - rc.top) * dpr;
    var lado = (LUPA_D / LUPA_Z) * dpr;
    lupaCtx.clearRect(0, 0, LUPA_D, LUPA_D);
    try {
      lupaCtx.drawImage(canvasEl, cx - lado / 2, cy - lado / 2, lado, lado, 0, 0, LUPA_D, LUPA_D);
    } catch (e) { return; }   // buffer indisponível: melhor lupa vazia que exceção no laço de render
    var m = LUPA_D / 2;
    /* a cruz da mira: fina, para não esconder o que se está mirando */
    lupaCtx.strokeStyle = 'rgba(255,255,255,.85)'; lupaCtx.lineWidth = 1;
    lupaCtx.beginPath();
    lupaCtx.moveTo(m - 16, m); lupaCtx.lineTo(m - 4, m);
    lupaCtx.moveTo(m + 4, m); lupaCtx.lineTo(m + 16, m);
    lupaCtx.moveTo(m, m - 16); lupaCtx.lineTo(m, m - 4);
    lupaCtx.moveTo(m, m + 4); lupaCtx.lineTo(m, m + 16);
    lupaCtx.stroke();
    /* e ONDE vai agarrar: o mesmo código de cor do marcador, dentro da lupa */
    if (lupa.sn && lupa.sn.tipo) {
      var vis = SNAP_VIS[lupa.sn.tipo] || { cor: '#22c55e', rot: '' };
      var q = lupa.sn.p.clone().project(camera);
      var sx = (q.x + 1) / 2 * rc.width + rc.left, sy = (1 - q.y) / 2 * rc.height + rc.top;
      var lx = m + (sx - lupa.x) * LUPA_Z, ly = m + (sy - lupa.y) * LUPA_Z;
      lupaCtx.strokeStyle = vis.cor; lupaCtx.lineWidth = 2;
      if (lupa.sn.tipo === 'meio') { lupaCtx.beginPath(); lupaCtx.arc(lx, ly, 7, 0, 6.284); lupaCtx.stroke(); }
      else { lupaCtx.strokeRect(lx - 6, ly - 6, 12, 12); }
      lupaCtx.fillStyle = vis.cor; lupaCtx.font = 'bold 11px Arial'; lupaCtx.textAlign = 'center';
      lupaCtx.fillText(vis.rot, m, LUPA_D - 9);
    }
  }
  S._tickPos.push(function () { lupaDesenhar(); });

  function lupaPosicionar() {
    var hr = ((S && S.host) || host).getBoundingClientRect();   // host VIVO (idem)
    /* ACIMA do dedo — e desce para baixo quando não cabe em cima, senão a
       lupa sairia da tela justamente perto da borda de cima, que é onde mais
       se mede (topo de parede, laje). */
    var offset = LUPA_D * 0.78;
    var y = lupa.y - hr.top - offset;
    if (y - LUPA_D / 2 < 4) y = lupa.y - hr.top + offset;
    lupaEl.style.left = (lupa.x - hr.left) + 'px';
    lupaEl.style.top = y + 'px';
  }
  function lupaAtualizarSnap() {
    var hit = raycastEm(lupa.x, lupa.y);
    if (!hit) { lupa.sn = null; esconderSnapMarca(); return; }
    /* ⚠ O MESMO RAIO QUE A SOLTURA VAI USAR. Aqui era 26 e a soltura sintetiza um
       evento `pointerType:'touch'`, que cai em `raioToque` = 30. Dois raios = a lupa
       podia MOSTRAR um ponto e a cota GRAVAR outro — exatamente a queixa que esta
       versão veio consertar, reintroduzida dentro do próprio conserto. */
    var sn = aplicarSnap(hit, raioToque({ pointerType: 'touch' }));
    lupa.sn = sn && sn.tipo ? { p: sn.p.clone(), tipo: sn.tipo } : { p: hit.point.clone(), tipo: null };
    mostrarSnapMarca(sn);   /* mesmo sem tipo: os traços finos dos notáveis continuam úteis, e o aviso de elemento pesado precisa aparecer TAMBÉM dentro da lupa */
  }
  function lupaAbrir(x, y, pid) {
    lupa.on = true; lupa.x = x; lupa.y = y; lupa.id = pid;
    lupaEl.style.display = 'block';
    if (orbit) orbit.enabled = false;        // enquanto mira, a câmera fica parada
    lupaPosicionar(); lupaAtualizarSnap();
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Arraste para ajustar a mira. Solte para marcar o ponto.');
  }
  function lupaFechar(semDica) {
    if (!lupa.on) return;
    lupa.on = false; lupa.id = null; lupa.sn = null;
    lupaEl.style.display = 'none';
    if (orbit) orbit.enabled = true;
    /* ⚠ e a dica da lupa NÃO pode ficar no ar. "Arraste para ajustar a mira,
       solte para marcar o ponto" mandando fazer uma coisa que já não é possível
       é pior que balão nenhum — principalmente quando a lupa fechou sozinha
       (segundo dedo, cancelamento do sistema). Quem soltou um PONTO passa
       `semDica`: ali a próxima mensagem já vem do fluxo da medição. */
    if (!semDica && S._hint) S._hint('');
  }
  S._lupaFechar = lupaFechar;
  S._ferramentaClique = ferramentaClique;   // o hook de estado precisa dizer POR QUE a lupa nao abriu
  function lupaCancelarEspera() { if (lupa.timer) { clearTimeout(lupa.timer); lupa.timer = null; } }

  /* Os três ganchos que o `pointerdown/move/up` lá de cima chama. Ficam aqui,
     junto do resto da lupa, porque o handler nasce ANTES deste bloco (o
     `canvasEl` é criado no começo) e chamá-los por `S._` é o que a casa já faz
     para o preview da parede. */
  S._lupaAgendar = function (e) {
    lupaCancelarEspera();
    var x = e.clientX, y = e.clientY, pid = e.pointerId;
    lupa.timer = setTimeout(function () {
      lupa.timer = null;
      if (!S || !S.alive || !ferramentaClique()) return;
      if (!medir.down) return;                    // já soltou: foi toque simples
      lupaAbrir(x, y, pid);
    }, LUPA_ESPERA);
  };
  var _lupaSnapT = 0;
  S._lupaMover = function (e) {
    if (lupa.on) {
      if (lupa.id != null && e.pointerId !== lupa.id) return;
      lupa.x = e.clientX; lupa.y = e.clientY;
      lupaPosicionar();
      /* ⚠ O MESMO estrangulamento do hover do mouse (60 ms). A mira roda um
         raycast + varredura completa de snap; sem teto, cada evento de dedo
         arrastando pagava tudo de novo, e o dedo emite muito mais eventos que
         o mouse justamente no aparelho mais fraco. A posição da lupa segue o
         dedo a cada evento (é barato); só o snap espera. */
      var _tl = performance.now();
      if (_tl - _lupaSnapT >= 60) { _lupaSnapT = _tl; lupaAtualizarSnap(); }
      e.preventDefault();                          // não deixa virar rolagem da página
      return true;                                 // avisa o handler: este movimento é MIRA, não órbita
    }
    /* ainda esperando o tempo do toque-e-segure: mexeu muito = quis orbitar */
    if (lupa.timer && medir.down) {
      var dx = e.clientX - medir.down.x, dy = e.clientY - medir.down.y;
      if (dx * dx + dy * dy > 144) lupaCancelarEspera();   // >12px
    }
    return false;
  };
  /* Devolve o ponto mirado (e fecha a lupa), ou null se a lupa não estava
     aberta. Quem chama decide o que fazer com o ponto. */
  S._lupaSoltar = function (e) {
    lupaCancelarEspera();
    if (!lupa.on) return null;
    if (lupa.id != null && e && e.pointerId !== lupa.id) return null;
    var alvo = { x: lupa.x, y: lupa.y, sn: lupa.sn };
    lupaFechar(true);   // o fluxo da medição escreve a próxima dica
    return alvo;
  };
  // cache de arestas por geometria (espaço LOCAL); WeakMap → some junto com a geometria no GC
  var arestasCache = new WeakMap();
  function arestasDe(geo) {
    var c = arestasCache.get(geo);
    if (!c) { try { var e = new THREE.EdgesGeometry(geo, 25); c = e.attributes.position.array.slice(); e.dispose(); } catch (_) { c = new Float32Array(0); } arestasCache.set(geo, c); }
    return c;
  }
  S._arestasDe = arestasDe; // reusado pelo corte técnico (linhas pretas do desenho)

  // ============================================================
  // ⊕ CENTRO — "onde começa o tubo"
  //
  // Identificar onde COMEÇA um tubo não era possível. Numa parede o vértice
  // resolve — o canto É um vértice da malha.
  // Para o TUBO não resolvia, e não era imprecisão: o ponto que o projetista
  // quer (o eixo do tubo, no topo da ponta) SIMPLESMENTE NÃO EXISTIA na lista
  // de candidatos. A boca do tubo é um anel de arestas; havia vértice em toda
  // a volta do anel e nenhum no meio dele. Clicar "no começo do tubo" agarrava
  // um vértice qualquer da borda — a tal «mostrando em pontos que não é».
  //
  // O centro do anel não é invenção: é o baricentro de uma laçada FECHADA e
  // PLANA de arestas reais da malha. Sem laçada fechada, nenhum centro é
  // oferecido — a régua da casa vale aqui igual: não existe ponto, não
  // aparece ponto.
  //
  // Custo: calculado UMA vez por geometria e guardado no WeakMap (some junto
  // com a geometria no GC), como as arestas. Por quadro é só testar N pontos.
  // ============================================================
  var centrosCache = new WeakMap();
  var CENTRO_MIN_VERT = 6;    // 4 seria a face retangular de uma parede: isso é "meio de face", não centro
  var CENTRO_MAX = 64;        // teto de SAÍDA por geometria
  /* tetos de TRABALHO — os que de fato impedem o travamento (ver a nota grande
     em `_acharAneis`). CENTRO_MAX só limita a saída, e no pior caso a saída é
     vazia: era exatamente onde a busca ficava solta. */
  var CENTRO_MAX_ARESTAS = 12000;   // segmentos do EdgesGeometry: acima disto nem monta o grafo
  var CENTRO_MAX_NOS = 6000;       // nós distintos (100 tubos mesclados cabem; terreno nao)
  var CENTRO_MAX_VOLTA = 160;      // lados de um anel: 160 já é absurdo em modelo de obra
  var CENTRO_ORCAMENTO = 15000;    // passos totais: com estes tres, o PIOR terreno medido custa 32 ms
  function centrosDe(geo) {
    var c = centrosCache.get(geo);
    if (c) return c;
    c = [];
    try {
      var np = (geo.attributes && geo.attributes.position) ? geo.attributes.position.count : 0;
      if (np <= SNAP_MAX_VERT) c = _acharAneis(arestasDe(geo));
    } catch (_) { c = []; }
    centrosCache.set(geo, c);
    return c;
  }
  /* Valida a laçada e devolve o baricentro, ou null. É a régua que impede o
     ⊕ centro de virar chute: sem ela, QUALQUER ciclo fechado do modelo viraria
     um "centro" — inclusive a laçada torta que passa pelas duas bocas do tubo.
     Plana (4 mm), com raio de verdade, e com nós suficientes para ser boca e
     não face de parede. Devolve {x,y,z} puro: quem chama embrulha no Vector3. */
  function _aneiCentro(nos, laco) {
    if (!laco || laco.length < CENTRO_MIN_VERT) return null;
    var cx = 0, cy = 0, cz = 0, j;
    for (j = 0; j < laco.length; j++) { var pj = nos[laco[j]]; cx += pj.x; cy += pj.y; cz += pj.z; }
    cx /= laco.length; cy /= laco.length; cz /= laco.length;
    var p0 = nos[laco[0]], p1 = nos[laco[Math.floor(laco.length / 3)]], p2 = nos[laco[Math.floor(2 * laco.length / 3)]];
    var ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
    var bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.z - p0.z;
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    var mn = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!mn) return null;
    nx /= mn; ny /= mn; nz /= mn;
    var raioMed = 0, raios = [];
    for (j = 0; j < laco.length; j++) {
      var q = nos[laco[j]];
      if (Math.abs((q.x - cx) * nx + (q.y - cy) * ny + (q.z - cz) * nz) > 0.004) return null;  // 4 mm de planeza
      var r = Math.sqrt((q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy) + (q.z - cz) * (q.z - cz));
      raios.push(r); raioMed += r;
    }
    raioMed /= laco.length;
    if (raioMed < 0.002) return null;   // anel degenerado (todos os pontos no mesmo lugar)
    /* ⚠ TEM DE SER REDONDO, não só fechado e plano.
     *
     * O contorno da face de uma laje em L (ou em U) também é uma laçada fechada,
     * plana e com 6+ vértices — e o baricentro dela cai NO VAZIO, fora da laje.
     * O snap ofereceria, com peso alto, um ponto que não existe em lugar nenhum
     * do modelo. É exatamente a invenção de ponto que a casa não faz, e seria
     * pior do que o defeito que este recurso veio consertar: ali o ponto estava
     * na borda errada, aqui estaria no ar.
     *
     * Num círculo todo vértice fica à MESMA distância do centro. Num L, não.
     * 25% de variação aceita polígono regular, tubo achatado e furo oval leve;
     * recusa contorno de laje, que varia muito mais. */
    var desvio = 0;
    for (j = 0; j < raios.length; j++) desvio = Math.max(desvio, Math.abs(raios[j] - raioMed));
    if (desvio / raioMed > 0.25) return null;
    return { x: cx, y: cy, z: cz };
  }
  /* Uma tentativa de laçada: sai de `ini` pelo vizinho `primeiro` e segue
     sempre o vizinho que MELHOR CONTINUA a direção atual (a longitudinal de um
     tubo sai a ~90° e nunca é a melhor continuação). Devolve a lista de nós se
     fechou, ou null. */
  function _andarLaco(nos, ini, primeiro, vistos, orc) {
    var laco = [ini, primeiro], noLaco = {}, ant = ini, atual = primeiro, fechou = false, k;
    if (vistos[primeiro]) return null;
    noLaco[ini] = 1; noLaco[primeiro] = 1;
    /* ⚠ CENTRO_MAX_VOLTA, não 512. Uma boca de tubo tem dezenas de lados; um anel
       de 128 lados já é absurdo em modelo de obra. O teto alto só servia para
       gastar trabalho antes de desistir numa malha que não tem anel nenhum. */
    for (k = 0; k < CENTRO_MAX_VOLTA; k++) {
      if (orc && --orc.passos < 0) return null;   // orçamento estourado: desiste sem travar
      var n = nos[atual], prox = null, melhorCos = -2;
      for (var vi = 0; vi < n.viz.length; vi++) {
        var cand = n.viz[vi];
        if (cand === ant) continue;
        if (cand === ini && laco.length >= CENTRO_MIN_VERT) { fechou = true; break; }
        /* ⚠ MAPA, não `laco.indexOf`. O indexOf é O(k) DENTRO do passo, e com ele
           uma caminhada de k passos custa k². Num terreno era o segundo fator do
           travamento de dezenas de segundos. */
        if (vistos[cand] || noLaco[cand]) continue;
        var a = nos[ant], b = n, cc = nos[cand];
        var u1 = b.x - a.x, u2 = b.y - a.y, u3 = b.z - a.z;
        var v1 = cc.x - b.x, v2 = cc.y - b.y, v3 = cc.z - b.z;
        var mu = Math.sqrt(u1 * u1 + u2 * u2 + u3 * u3), mv = Math.sqrt(v1 * v1 + v2 * v2 + v3 * v3);
        var cos = (mu && mv) ? (u1 * v1 + u2 * v2 + u3 * v3) / (mu * mv) : -2;
        if (cos > melhorCos) { melhorCos = cos; prox = cand; }
      }
      if (fechou) return laco;
      if (!prox) return null;
      laco.push(prox); noLaco[prox] = 1; ant = atual; atual = prox;
    }
    return null;
  }
  /* Recebe o array plano de arestas (x1,y1,z1,x2,y2,z2, ...) em espaço LOCAL e
     devolve os baricentros das laçadas fechadas e planas. */
  function _acharAneis(arr) {
    if (!arr || arr.length < CENTRO_MIN_VERT * 6) return [];
    /* ⚠⚠ O TETO QUE FALTAVA, E QUE QUASE FOI PUBLICADO SEM.
     *
     * Esta busca roda DENTRO do hover do snap, síncrona. Quando a malha não tem
     * anel nenhum, nenhum nó entra em `vistos`, o laço externo tenta TODOS os
     * nós, cada um com todos os vizinhos como primeira saída — e o custo cresce
     * ~quadrático. Medido no fonte de produção contra um terreno triangulado:
     *
     *     441 vértices →  0,3 s        3.721 vértices → 24 s
     *   1.681 vértices →  3,7 s        6.561 vértices → 59 s
     *
     * Isso é a ABA INTEIRA travada — o OrçaPRO é uma página só: Gestão,
     * Orçamento e Financeiro param junto, sem barra e sem Esc.
     *
     * ⚠ E `SNAP_MAX_VERT` (90.000) NÃO PROTEGE: ele conta VÉRTICES da malha, e o
     *   custo daqui é o número de ARESTAS que sobram do EdgesGeometry num grafo
     *   CONECTADO. O travamento começa 200× abaixo daquele limite. Guarda que
     *   mede a grandeza errada é guarda que não existe.
     *
     * Os anéis que interessam são PEQUENOS e LOCAIS: uma boca de tubo tem
     * dezenas de nós, um flange com furos tem centenas. Terreno, telhado
     * facetado e família de alto poli não têm boca redonda nenhuma — desistir
     * neles não perde recurso, e é o que estes tetos fazem, barato e cedo. */
    if (arr.length / 6 > CENTRO_MAX_ARESTAS) return [];
    var nos = {}, ordem = [], i, k;
    function chave(x, y, z) { return (Math.round(x * 1e4) / 1e4) + '|' + (Math.round(y * 1e4) / 1e4) + '|' + (Math.round(z * 1e4) / 1e4); }
    function no(x, y, z) {
      var ch = chave(x, y, z);
      if (!nos[ch]) { nos[ch] = { x: x, y: y, z: z, viz: [] }; ordem.push(ch); }
      return ch;
    }
    for (i = 0; i + 5 < arr.length; i += 6) {
      var ca = no(arr[i], arr[i + 1], arr[i + 2]), cb = no(arr[i + 3], arr[i + 4], arr[i + 5]);
      if (ca === cb) continue;
      if (nos[ca].viz.indexOf(cb) < 0) nos[ca].viz.push(cb);
      if (nos[cb].viz.indexOf(ca) < 0) nos[cb].viz.push(ca);
    }
    /* ⚠ SEGUIR A CURVA, não só "grau 2". Num tubo bem facetado o EdgesGeometry
       descarta as arestas longitudinais (ângulo < 25°) e cada vértice do anel
       fica com grau 2 — fácil. Num tubo GROSSEIRO (12 lados, 30° entre faces)
       as longitudinais entram e o mesmo vértice vira grau 3. Exigir grau 2
       faria o centro funcionar no tubo fino e sumir no grosso, que é o pior
       dos mundos: o recurso existe mas o usuário não confia nele. Por isso a
       caminhada escolhe o vizinho que MELHOR CONTINUA a direção atual — a
       longitudinal sai a ~90° e nunca é a melhor continuação. */
    /* ⚠ O PRIMEIRO PASSO NÃO PODE SER ARBITRÁRIO — e era, e isso REPROVOU na
       geometria de verdade depois de passar no teste de bancada. Num tubo de
       12 lados o vértice do anel tem TRÊS vizinhos: os dois do anel e a
       longitudinal que desce. Como no primeiro passo ainda não há direção
       anterior para comparar, a escolha caía no primeiro da lista — se fosse a
       longitudinal, a caminhada descia para a outra boca e nunca fechava. O
       tubo de 16 e 32 lados funcionava (lá a longitudinal nem entra no
       EdgesGeometry), o de 8 e 12 não: o recurso "às vezes". Agora cada
       vizinho é TENTADO como primeiro passo, e vale o que fechar. */
    if (ordem.length > CENTRO_MAX_NOS) return [];
    var vistos = {}, saida = [], orc = { passos: CENTRO_ORCAMENTO };
    for (var oi = 0; oi < ordem.length && saida.length < CENTRO_MAX; oi++) {
      if (orc.passos < 0) break;              // orçamento estourado: entrega o que achou
      var ini = ordem[oi];
      if (vistos[ini] || nos[ini].viz.length < 2) continue;
      /* ⚠ E NÃO BASTA "a primeira que fechar". Saindo pela longitudinal, a
         caminhada desce até a outra boca, dá a volta e VOLTA — fecha uma
         laçada de 14 nós que passa pelos dois anéis. Ela é fechada e é
         inválida (não é plana), e aceitá-la fazia o nó inteiro ser descartado
         com um `continue`, sem nunca tentar as outras saídas: o tubo de 8 e 12
         lados ficava sem centro. Vale a MAIS CURTA que passa na validação — o
         anel é sempre o ciclo mais apertado que sai do vértice. */
      var laco = null;
      for (var si = 0; si < nos[ini].viz.length; si++) {
        var tent = _andarLaco(nos, ini, nos[ini].viz[si], vistos, orc);
        if (!tent || !_aneiCentro(nos, tent)) continue;
        if (!laco || tent.length < laco.length) laco = tent;
      }
      /* ⚠ NÓ QUE FALHOU NÃO SE TENTA DE NOVO — e este era o fator quadrático.
         Se NENHUMA saída de `ini` fecha um anel válido, `ini` não está em anel
         que esta caminhada ache; marcá-lo custa uma entrada e poupa tentar de
         novo a partir de cada vizinho depois. Antes, `vistos` só era preenchido
         em caso de SUCESSO — ou seja, na malha sem anel nenhum (o pior caso)
         ele ficava vazio e todo nó era tentado do zero. */
      if (!laco) { vistos[ini] = 1; continue; }
      var ctr = _aneiCentro(nos, laco);
      if (!ctr) continue;
      for (var j = 0; j < laco.length; j++) vistos[laco[j]] = 1;
      saida.push(new THREE.Vector3(ctr.x, ctr.y, ctr.z));
    }
    return saida;
  }
  S._acharAneis = _acharAneis;   // hook de teste: a laçada é a parte que erra sozinha
  // scratches DISTINTOS: _snP é EXCLUSIVO do px() (project() muta in-place) — nunca pode ser o mesmo
  // vetor que carrega um candidato (senão o ponto snapado sai em NDC, não em metros). _snM/_snCl
  // são reusados nos loops (o candidato aceito é clonado dentro de testar()).
  var _snA = new THREE.Vector3(), _snB = new THREE.Vector3(), _snM = new THREE.Vector3(), _snCl = new THREE.Vector3(), _snP = new THREE.Vector3(), _snCt = new THREE.Vector3(), _snL = new THREE.Line3();
  var SNAP_MAX_VERT = 90000; // malha densa (terreno/mobiliário) trava o hover ao gerar EdgesGeometry -> pula snap
  // PESOS de desempate (achado do usuário: prioridade ABSOLUTA fazia um vértice a 13px "roubar"
  // de uma aresta a 2px do cursor — o snap agarrava LONGE de onde se clicava). Agora ganha o
  // candidato mais PRÓXIMO em distância efetiva; o peso só desempata tipos ~equidistantes.
  var SNAP_PESO = { intersecao: 1.5, centro: 1.4, vertice: 1.35, meio: 1.15, aresta: 1.0 };
  /* ⚠ O TETO DO DESEMPATE — e é MENOR do que parece, então segue a conta.
   *
   * O peso é uma RAZÃO: um candidato de peso P vence quando `d/P` é o menor,
   * logo o mais que ele pode ganhar estando ATRÁS é `raio - raio/P`.
   *   mouse (raio 14): vértice rouba no máximo 3,6 px · interseção 4,7 px
   *   toque (raio 30): vértice rouba até     7,8 px · interseção 10,0 px
   *
   * Ou seja: NO MOUSE o peso já se auto-limita, e esta folga praticamente não
   * dispara. A conta acima diz que ela NÃO é o conserto do lado do mouse — quem
   * resolve ali são os outros três: o ⊕ centro que não existia, os 3 objetos do
   * raio e o aviso de peça pesada. Fica registrado para ninguém "consertar"
   * de novo por aqui.
   *
   * NO TOQUE ela vale: 10 px de roubo com o dedo é exatamente «mostrando em
   * pontos que não é», e a folga corta isso para 7,5 px. O conserto de fato do
   * toque, porém, é a lupa — ver antes de soltar. */
  function snapFolga(raio) { return Math.max(6, raio * 0.25); }
  // pontos mais próximos entre dois segmentos 3D (Ericson) — devolve {d, p} (p = ponto médio do par)
  function segSeg3D(a1, a2, b1, b2) {
    var d1x = a2.x - a1.x, d1y = a2.y - a1.y, d1z = a2.z - a1.z;
    var d2x = b2.x - b1.x, d2y = b2.y - b1.y, d2z = b2.z - b1.z;
    var rx = a1.x - b1.x, ry = a1.y - b1.y, rz = a1.z - b1.z;
    var A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
    var F = d2x * rx + d2y * ry + d2z * rz, s, t;
    if (A <= 1e-12 && E <= 1e-12) { s = 0; t = 0; }
    else if (A <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, F / E)); }
    else {
      var C = d1x * rx + d1y * ry + d1z * rz;
      if (E <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -C / A)); }
      else {
        var B = d1x * d2x + d1y * d2y + d1z * d2z, den = A * E - B * B;
        s = den > 1e-12 ? Math.max(0, Math.min(1, (B * F - C * E) / den)) : 0;
        t = Math.max(0, Math.min(1, (B * s + F) / E));
        s = Math.max(0, Math.min(1, (B * t - C) / A));
      }
    }
    var px1 = a1.x + d1x * s, py1 = a1.y + d1y * s, pz1 = a1.z + d1z * s;
    var qx1 = b1.x + d2x * t, qy1 = b1.y + d2y * t, qz1 = b1.z + d2z * t;
    var dd = Math.sqrt((px1 - qx1) * (px1 - qx1) + (py1 - qy1) * (py1 - qy1) + (pz1 - qz1) * (pz1 - qz1));
    return { d: dd, p: new THREE.Vector3((px1 + qx1) / 2, (py1 + qy1) / 2, (pz1 + qz1) / 2) };
  }
  function aplicarSnap(hit, raioPx) {
    if (!snap.on || !hit || !hit.object || !hit.object.geometry) return { p: hit.point, tipo: null };
    var raio = raioPx || snap.raio, rc = canvasEl.getBoundingClientRect();
    function px(v) { var q = _snP.copy(v).project(camera); return { x: (q.x + 1) / 2 * rc.width, y: (1 - q.y) / 2 * rc.height }; }
    var alvoPx = px(hit.point), melhor = null, maisPerto = null, notaveis = [];
    function testar(v, tipo) {
      var p2 = px(v), dx = p2.x - alvoPx.x, dy = p2.y - alvoPx.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > raio) return;
      if (foraDoClip(v)) return; // vértice/aresta do lado CLIPADO (invisível) do corte NÃO pode ser snapado -> cota errada
      var dEff = d / (SNAP_PESO[tipo] || 1);
      if (!melhor || dEff < melhor.dEff) melhor = { p: v.clone(), tipo: tipo, d: d, dEff: dEff };
      if (!maisPerto || d < maisPerto.d) maisPerto = { p: v.clone(), tipo: tipo, d: d, dEff: dEff };
      /* pontos notáveis à vista, para os traços finos do item 6 — só canto,
         começo, meio e centro; aresta é linha inteira, não é um "ponto". */
      if (tipo !== 'aresta' && notaveis.length < 24) notaveis.push({ v: v.clone(), tipo: tipo, d: d });
    }
    // arestas PRÓXIMAS do cursor (candidatas ao ✚ interseção) — dos até 2 objetos do raio
    var proximas = [], pulouPesado = false;
    function varrerObjeto(obj) {
      if (!obj || !obj.geometry) return;
      var g = obj.geometry, np = (g.attributes && g.attributes.position) ? g.attributes.position.count : 0;
      /* ⚠ elemento pesado: sem snap nesse objeto — e ANTES isso era um silêncio.
         O marcador simplesmente não aparecia, e quem estava medindo concluía que
         o snap "não pega direito" nesse pedaço do modelo. Falhar calado é o que
         transforma um limite técnico legítimo em queixa de imprecisão. Agora a
         marca diz por quê; inventar um ponto que não existe continua fora. */
      if (np > SNAP_MAX_VERT) { if (obj === hit.object) pulouPesado = true; return; }   /* ⚠ só o objeto ATINGIDO. A bandeira era única para a chamada toda: bastava o terreno estar ATRÁS da parede para o marcador dizer "sem snap (peça pesada)" em cima de uma parede leve, que tinha snap perfeito. Aviso errado é pior que aviso nenhum. */
      var arr = arestasDe(g); if (!arr.length) return;
      var mw = obj.matrixWorld;
      if (snap.c !== false) {
        var ctr = centrosDe(g);
        for (var ci = 0; ci < ctr.length; ci++) testar(_snCt.copy(ctr[ci]).applyMatrix4(mw), 'centro');
      }
      for (var i = 0; i < arr.length; i += 6) {
        _snA.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
        _snB.set(arr[i + 3], arr[i + 4], arr[i + 5]).applyMatrix4(mw);
        if (snap.v) { testar(_snA, 'vertice'); testar(_snB, 'vertice'); }
        if (snap.m) { testar(_snM.addVectors(_snA, _snB).multiplyScalar(0.5), 'meio'); }
        _snL.set(_snA, _snB);
        var cl = _snL.closestPointToPoint(hit.point, true, _snCl);
        if (snap.a) testar(cl, 'aresta');
        if (snap.i !== false && proximas.length < 14) {
          var pc = px(cl), ddx = pc.x - alvoPx.x, ddy = pc.y - alvoPx.y;
          if (ddx * ddx + ddy * ddy <= (raio + 6) * (raio + 6)) proximas.push({ a: _snA.clone(), b: _snB.clone() });
        }
      }
    }
    varrerObjeto(hit.object);
    // demais objetos do raio: o canto parede×viga vive na FRONTEIRA entre elementos
    for (var oh = 1; oh < _ultimosHits.length; oh++) if (_ultimosHits[oh].object !== hit.object) varrerObjeto(_ultimosHits[oh].object);
    // ✚ INTERSEÇÃO REAL: pares de arestas próximas cujos pontos-mais-próximos em 3D distam < 1 cm
    // (cruzamento genuíno no espaço, não coincidência visual de projeção — nunca inventa ponto)
    if (snap.i !== false) {
      for (var ii = 0; ii < proximas.length; ii++) for (var jj = ii + 1; jj < proximas.length; jj++) {
        var r3 = segSeg3D(proximas[ii].a, proximas[ii].b, proximas[jj].a, proximas[jj].b);
        if (r3.d < 0.01) testar(r3.p, 'intersecao');
      }
    }
    /* A FOLGA: o tipo nobre só ganha se estiver perto. Um vértice a 27 px não
       leva o clique de uma aresta a 20 px — era exatamente o "ponto que não é". */
    if (melhor && maisPerto && melhor.tipo !== maisPerto.tipo && melhor.d > maisPerto.d + snapFolga(raio)) melhor = maisPerto;
    return melhor
      ? { p: melhor.p, tipo: melhor.tipo, notaveis: notaveis, pesado: pulouPesado }
      : { p: hit.point, tipo: null, notaveis: notaveis, pesado: pulouPesado };
  }
  function raioToque(e) { return (e && e.pointerType === 'touch') ? 30 : snap.raio; } // dedo tem ~mais incerteza

  // ============================================================
  // 📝 CORTE TÉCNICO — o usuário risca a linha A–A' NA PLANTA e o viewer gera a
  // vista de corte em preto-e-branco estilo desenho técnico, NA ESCALA escolhida
  // (px/m derivado de 96dpi), com carimbo e escala gráfica. Câmera ortográfica
  // perpendicular à linha; clipping no próprio plano de corte. Faces cortadas saem
  // HACHURADAS (caps por stencil: saldo backface−frontface ≠ 0 = interior de sólido).
  // ============================================================
  var ctec = { ativo: false, pts: [], objs: [] };
  S._tickExtra.push(function () { for (var i = 0; i < ctec.objs.length; i++) rescaleObj(ctec.objs[i]); });
  function ctecLimparDesenho() { ctec.objs.forEach(limparMarca); ctec.objs = []; ctec.pts = []; }
  function ctecIniciar() {
    if (!planta.on) { setPlanta(true); if (!planta.on) return; } // linha se risca NA planta
    if (S.plantaCfg) S.plantaCfg.style.display = 'none'; // config da planta técnica não pode ficar cobrindo os cliques A/B
    if (edit && edit.on) setEdit(false); // corte técnico e editor disputariam o mesmo clique
    ctecLimparDesenho(); ctec.ativo = true;
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Clique o 1º ponto da linha de corte (A) sobre a planta.');
  }
  function ctecCancelar(pergunta) {
    var tinha = ctec.ativo || ctecCfg.style.display !== 'none' || ctec.objs.length;
    ctec.ativo = false; ctecLimparDesenho(); ctecCfg.style.display = 'none';
    if (tinha && !pergunta) S._hint('');
    return !!tinha;
  }
  S._ctecCancelar = ctecCancelar;
  function ctecClique(p) {
    ctec.pts.push(p);
    var m = pontoMarca(p); m.material.color.set(0x38bdf8);
    scene.add(m); ctec.objs.push(m); rescaleObj(m);
    var rot = labelSprite(ctec.pts.length === 1 ? 'A' : "A'"); rot.position.copy(p).add(new THREE.Vector3(0, 0.02, 0));
    scene.add(rot); ctec.objs.push(rot); rescaleObj(rot);
    if (ctec.pts.length === 1) { S._hint("" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Agora clique o 2º ponto (A')."); return; }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ctec.pts[0], ctec.pts[1]]), new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false }));
    line.renderOrder = 997; scene.add(line); ctec.objs.push(line);
    ctec.ativo = false;
    marcarFechamento(); // duplo-clique no A' não vaza o irmão pra trena/área coexistente
    ctecCfg.style.display = 'flex'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Configure o corte e clique Gerar.');
  }
  // painel de configuração do corte
  var ctecCfg = document.createElement('div');
  ctecCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:260px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  ctecCfg.innerHTML =
    '<b>' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Gerar corte técnico</b>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Tipo de vista <select data-t="tipo" class="inp" style="width:130px"><option value="corte">Corte (A–A)</option><option value="fachada">Fachada/Elevação</option></select></label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-t="esc" class="inp" style="width:130px"><option value="50">1:50</option><option value="75">1:75</option><option value="100" selected>1:100</option><option value="200">1:200</option></select></label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Profundidade de visão <input data-t="prof" class="inp" type="number" min="0.5" step="0.5" value="10" style="width:70px"> m</label>' +
    '<label style="display:flex;gap:6px;align-items:center;font-size:12px"><input data-t="inv" type="checkbox"> Olhar para o outro lado</label>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Auxílio visual de coordenação, não substitui o projeto executivo. Faces cortadas saem <b>hachuradas</b>; superfícies curvas/tubos podem sair sem contorno. Confira sempre pela escala gráfica.</div>' +
    '<div style="display:flex;gap:6px"><button class="btn sm primary" data-t="gerar" style="flex:1">Gerar</button><button class="btn sm" data-t="cancelar" style="flex:1">Cancelar</button></div>';
  host.appendChild(ctecCfg);
  S.ctecCfg = ctecCfg;
  // modal do resultado
  var ctecModal = document.createElement('div');
  ctecModal.style.cssText = 'position:absolute;inset:0;z-index:7;display:none;align-items:center;justify-content:center;background:rgba(4,12,22,.82)';
  ctecModal.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:9px;max-width:92%;max-height:92%;background:#0f2740;border:1px solid #24435f;border-radius:12px;padding:13px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;color:#dbe8f5;font-size:13px"><b data-r="titulo">Corte técnico</b>' +
    '<span><button class="btn sm" data-r="ajustar" title="Mudar escala/tipo/profundidade sem redesenhar a linha">🔧 Ajustar</button> <button class="btn sm" data-r="imprimir">' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Imprimir</button> <button class="btn sm" data-r="baixar">' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG</button> <button class="btn sm" data-r="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></span></div>' +
    '<div style="overflow:auto;background:#fff;border-radius:6px;text-align:center"><img data-r="img" style="max-width:100%;display:block;margin:0 auto"></div></div>';
  host.appendChild(ctecModal);
  S.ctecModal = ctecModal;
  // série de escalas padrão de arquitetura (denominadores que existem em escalímetro)
  var SERIE_ESC = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500];
  function gerarCorteTec(o) {
    // o: {ax,az,bx,bz, escala, tipo:'corte'|'fachada', prof, inv} — coords do MUNDO (metros)
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return null;
    var dx = o.bx - o.ax, dz = o.bz - o.az, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.05) return null;
    var vx = dz / L, vz = -dx / L; if (o.inv) { vx = -vx; vz = -vz; } // direção do olhar (perpendicular à linha)
    var margem = Math.max(0.4, L * 0.03), yMin = box.min.y, yMax = box.max.y;
    var wM = L + margem * 2, hM = (yMax - yMin) + margem * 2;
    var escBase = o.escala || 100, PPM96 = 96 / 25.4;
    // cap honesto pelo que a GPU aguenta. Se a escala pedida estourar, SOBE pra próxima escala da
    // SÉRIE PADRÃO que caiba (escala inteira, medível com escalímetro) e recomputa px/m EXATO a
    // partir dela — assim o carimbo declara a MESMA escala que os pixels representam.
    var MAXPX = Math.min(4096, (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096);
    var escalaEf = escBase, pxM = PPM96 * (1000 / escalaEf);
    if (Math.max(wM, hM) * pxM > MAXPX) {
      escalaEf = null;
      for (var si = 0; si < SERIE_ESC.length; si++) { if (SERIE_ESC[si] >= escBase && Math.max(wM, hM) * (PPM96 * (1000 / SERIE_ESC[si])) <= MAXPX) { escalaEf = SERIE_ESC[si]; break; } }
      // modelo gigante (nem a maior escala da série cabe): escala contínua, arredondada PRA CIMA
      // (denominador maior -> desenho menor -> cabe garantido) e pxM recomputado EXATO dela -> carimbo==pixels
      if (escalaEf == null) { escalaEf = Math.ceil(PPM96 * 1000 / (MAXPX / Math.max(wM, hM))); pxM = PPM96 * (1000 / escalaEf); }
      else pxM = PPM96 * (1000 / escalaEf);
    }
    var ajustada = escalaEf !== escBase;
    var W = Math.round(wM * pxM), H = Math.round(hM * pxM);
    var cx = (o.ax + o.bx) / 2, cz = (o.az + o.bz) / 2, cy = (yMin + yMax) / 2;
    var diag = box.getSize(new THREE.Vector3()).length();
    var recuo = (o.tipo === 'fachada') ? diag : 0.02; // epsilon > 0 no near evita z-fighting da aresta no plano
    // plano de corte REAL (só no corte; a fachada olha de fora, não corta): além de clipar as
    // massas exatamente na linha A–A, é a referência dos passes de stencil da HACHURA
    var secPlane = (o.tipo === 'fachada') ? null : new THREE.Plane(new THREE.Vector3(vx, 0, vz), -(vx * cx + vz * cz));
    var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + ((o.tipo === 'fachada') ? diag * 2 : Math.max(0.5, +o.prof || 10)));
    cam.position.set(cx - vx * recuo, cy, cz - vz * recuo);
    cam.up.set(0, 1, 0); cam.lookAt(cx, cy, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    // snapshot do estado do renderer ANTES do try — o finally SEMPRE restaura (mesmo se um passo lançar)
    var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
    var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
    var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
    var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
    var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
    try {
      renderer.clippingPlanes = secPlane ? [secPlane] : []; renderer.localClippingEnabled = false;
      renderer.toneMapping = THREE.NoToneMapping; // P&B fiel (sem ACES escurecer os cinzas)
      scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
      // PASSE 1 — massas cinza-claro sobre branco; polygonOffset empurra as faces no depth p/ as
      // arestas coplanares do passe 2 vencerem sem z-fighting.
      matMassa = new THREE.MeshBasicMaterial({ color: 0xededed, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.overrideMaterial = matMassa;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      // PASSE 1.5 — HACHURA nas faces cortadas (caps por stencil, só no corte):
      // com o plano ativo, conta backfaces (+1) e frontfaces (−1) do que sobrou além do plano;
      // onde o saldo ≠ 0 o plano atravessa o INTERIOR de um sólido → pinta o quad hachurado 45°.
      if (secPlane) {
        renderer.autoClear = false;
        // câmera EXCLUSIVA do stencil com far cobrindo o MODELO INTEIRO (achado do gate): o far
        // da câmera do desenho (= profundidade de visão) descartava backfaces distantes e
        // desbalanceava a paridade — hachura sumia em laje cortada profunda e aparecia FALSA em
        // parede em vista atravessando o far. L/R/T/B idênticos -> os pixels casam 1:1.
        var camSt = cam.clone(); camSt.far = recuo + diag * 2 + 1; camSt.updateProjectionMatrix();
        stBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide,
          stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
        stFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide,
          stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
        scene.overrideMaterial = stBack; renderer.render(scene, camSt);
        scene.overrideMaterial = stFront; renderer.render(scene, camSt);
        scene.overrideMaterial = null;
        // textura de hachura 45° com espaçamento constante NO PAPEL (~2 mm × escala, em metros de mundo)
        var hcv = document.createElement('canvas'); hcv.width = hcv.height = 32;
        var hg = hcv.getContext('2d');
        hg.fillStyle = '#dfdfdf'; hg.fillRect(0, 0, 32, 32);
        hg.strokeStyle = '#141414'; hg.lineWidth = 2.4;
        hg.beginPath(); hg.moveTo(-4, 36); hg.lineTo(36, -4); hg.moveTo(-20, 20); hg.lineTo(20, -20); hg.moveTo(12, 52); hg.lineTo(52, 12); hg.stroke();
        hatchTex = new THREE.CanvasTexture(hcv);
        hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping; hatchTex.minFilter = THREE.LinearFilter;
        var esp = 0.0028 * escalaEf; // período da hachura em metros de mundo (~2 mm no papel em qualquer escala)
        hatchTex.repeat.set(wM / esp, hM / esp);
        // depthFunc Always + depthWrite TRUE (achado do gate): o quad GRAVA depth na região
        // hachurada — arestas de geometria ATRÁS do corte não riscam a hachura no PASSE 2
        // (as do contorno, clipadas exatamente no plano, ficam mais perto que o quad e vencem)
        capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
          stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
        capGeo = new THREE.PlaneGeometry(wM, hM);
        var capQuad = new THREE.Mesh(capGeo, capMat);
        capQuad.position.set(cx + vx * 1e-3, cy, cz + vz * 1e-3); // um fio ALÉM do plano (lado mantido pelo clip)
        capQuad.lookAt(cx + vx * 2, cy, cz + vz * 2);
        var capScene = new THREE.Scene(); capScene.add(capQuad);
        renderer.render(capScene, camSt);
      }
      // PASSE 2 — arestas pretas (cache local + matrixWorld de cada malha)
      edgesRoot = new THREE.Group(); matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
      modelRoot.children.forEach(function (g) {
        (g.children || []).forEach(function (m) {
          if (!m.geometry || !cadeiaVisivel(m)) return;
          var arr = arestasDe(m.geometry); if (!arr.length) return;
          var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          var ls = new THREE.LineSegments(bg, matLinha);
          ls.matrixAutoUpdate = false; ls.matrix.copy(m.matrixWorld);
          edgesRoot.add(ls);
        });
      });
      scene.add(edgesRoot); modelRoot.visible = false; renderer.autoClear = false;
      renderer.render(scene, cam);
      buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    } finally {
      // restaura o viewer SEMPRE — uma exceção no meio não pode congelar/vazar estado do renderer
      scene.overrideMaterial = null; renderer.autoClear = prevAuto; modelRoot.visible = true;
      if (edgesRoot) { scene.remove(edgesRoot); edgesRoot.children.forEach(function (ls) { if (ls.geometry) ls.geometry.dispose(); }); }
      if (matLinha) matLinha.dispose(); if (matMassa) matMassa.dispose();
      if (stBack) stBack.dispose(); if (stFront) stFront.dispose();
      if (capMat) capMat.dispose(); if (capGeo) capGeo.dispose(); if (hatchTex) hatchTex.dispose();
      escondidos.forEach(function (c) { c.visible = true; });
      renderer.setRenderTarget(null); try { rt.dispose(); } catch (_) {}
      renderer.clippingPlanes = prevClip; renderer.localClippingEnabled = prevLocal;
      renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTone;
    }
    if (!buf) return null;
    // composição 2D: flip vertical (WebGL lê de baixo pra cima) + moldura + carimbo + escala gráfica
    var faixa = 46, cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H + faixa;
    var g2 = cnv.getContext('2d'), img = g2.createImageData(W, H);
    for (var y = 0; y < H; y++) { var srcY = (H - 1 - y) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y * W * 4); }
    g2.putImageData(img, 0, 0);
    g2.fillStyle = '#fff'; g2.fillRect(0, H, W, faixa);
    g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, W - 2, H + faixa - 2); g2.beginPath(); g2.moveTo(1, H); g2.lineTo(W - 1, H); g2.stroke();
    // escala gráfica de 1 m à direita (reserva a faixa antes do carimbo pra não colidir)
    g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < W * 0.45, barW = temBarra ? pxM + 26 : 0;
    if (temBarra) { g2.fillRect(W - pxM - 12, H + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', W - pxM - 12, H + 37); }
    // carimbo: encolhe a fonte até caber na largura livre (evita clip/transbordo em desenho estreito)
    var titulo = (o.tipo === 'fachada' ? 'FACHADA' : 'CORTE A–A') + '  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  ' + (((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') || 'Desenho técnico') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · OrçaPRO BIM':'') + '  ·  ' + new Date().toLocaleDateString('pt-BR');
    var livre = W - 16 - barW, fs = 15;
    g2.font = 'bold ' + fs + 'px Arial';
    while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
    if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; } // fallback mínimo
    g2.fillStyle = '#111'; g2.fillText(titulo, 10, H + 29);
    return { url: cnv.toDataURL('image/png'), w: W, h: H + faixa, escala: escalaEf, pxPorMetro: pxM, ajustada: ajustada, larguraMM: (H + faixa ? W / 96 * 25.4 : 0), alturaMM: (H + faixa) / 96 * 25.4 };
  }
  S._gerarCorteTec = gerarCorteTec;
  ctecCfg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return; var k = b.getAttribute('data-t');
    if (k === 'cancelar') { ctecCancelar(); return; }
    if (k !== 'gerar') return;
    var a = ctec.pts[0], p2 = ctec.pts[1]; if (!a || !p2) { ctecCancelar(); return; }
    var res = gerarCorteTec({
      ax: a.x, az: a.z, bx: p2.x, bz: p2.z,
      escala: +ctecCfg.querySelector('[data-t="esc"]').value,
      tipo: ctecCfg.querySelector('[data-t="tipo"]').value,
      prof: +ctecCfg.querySelector('[data-t="prof"]').value,
      inv: ctecCfg.querySelector('[data-t="inv"]').checked
    });
    ctecCfg.style.display = 'none';
    if (!res) { ctecIniciar(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Linha muito curta — clique o 1º ponto da linha de corte (A) de novo.'); return; } // re-arma (senão a ferramenta fica morta)
    ctecModal._ajustar = null; ctecModal._nomeArq = null; // modal é compartilhado com a planta técnica: limpa os hooks dela
    ctecModal._res = res; // guarda p/ imprimir em mm físicos
    ctecModal.querySelector('[data-r="img"]').src = res.url;
    ctecModal.querySelector('[data-r="titulo"]').textContent = (ctecCfg.querySelector('[data-t="tipo"]').value === 'fachada' ? 'Fachada' : 'Corte A–A') + ' — ESC 1:' + res.escala + (res.ajustada ? ' (ajustada p/ caber)' : '');
    ctecModal.style.display = 'flex'; S._hint('');
  });
  S._fecharCtecModal = function () { ctecModal.style.display = 'none'; ctecLimparDesenho(); };
  ctecModal.addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return; var k = b.getAttribute('data-r');
    var url = ctecModal.querySelector('[data-r="img"]').src, res = ctecModal._res || {};
    if (k === 'fechar') { S._fecharCtecModal(); }
    else if (k === 'ajustar') {
      ctecModal.style.display = 'none';
      if (ctecModal._ajustar) { ctecModal._ajustar(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Ajuste e clique Gerar.'); } // planta técnica reabre a config DELA
      else { ctecCfg.style.display = 'flex'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Ajuste e clique Gerar (a linha A–A foi mantida).'); } // pts preservados
    }
    else if (k === 'baixar') { var aEl = document.createElement('a'); aEl.href = url; aEl.download = ctecModal._nomeArq || 'corte-tecnico.png'; aEl.click(); }
    else if (k === 'imprimir') {
      // imprime na DIMENSÃO FÍSICA (mm) pra a escala do carimbo valer no papel — max-width:100% encolheria
      var w = null; try { w = window.open('', '_blank'); } catch (_) {}
      if (!w) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' O navegador bloqueou a janela de impressão — use ' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG e imprima o arquivo em 100%.'); return; }
      try {
        var ttlImp = esc((ctecModal.querySelector('[data-r="titulo"]').textContent || 'Desenho técnico')) + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' — OrçaPRO BIM':'');
        w.document.write('<!doctype html><meta charset="utf-8"><title>' + ttlImp + '</title>' +
          '<style>@page{size:auto;margin:8mm}body{margin:0;font-family:Arial}.av{font-size:12px;color:#444;margin:6px 2px}@media print{.av{display:none}}</style>' +
          '<p class="av">Imprima em <b>100%</b> (sem “ajustar à página”) para a escala do carimbo valer. A escala gráfica de 1 m serve de conferência.</p>' +
          '<img src="' + url + '" style="width:' + (res.larguraMM || 200).toFixed(1) + 'mm;height:' + (res.alturaMM || 150).toFixed(1) + 'mm;display:block" onload="setTimeout(function(){window.print()},300)">');
        w.document.close();
      } catch (_) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Não deu pra abrir a impressão — use ' + (typeof Icones !== 'undefined' ? Icones.get('baixar', 15) : '') + ' PNG.'); }
    }
  });

  // ============================================================
  // 📄 PLANTA BAIXA TÉCNICA — desenho 2D de verdade (estilo Revit):
  // corte horizontal na altura do slider, paredes cortadas HACHURADAS
  // (mesmo stencil por paridade do corte técnico), arestas pretas, fundo
  // branco, escala exata e COTAS AUTOMÁTICAS em cadeia nos 2 eixos
  // (motor BimPlanta — parede fora de esquadro fica FORA e é declarada).
  // ✏️ Estilo desenho: a própria vista ao vivo vira "planta de verdade"
  // (massas cinza + arestas pretas + fundo branco) enquanto navega.
  // ============================================================
  var estiloD = { on: false, mat: null, matLinha: null };
  S._estiloOn = function () { return !!estiloD.on; };
  function nVerts(geo) { return (geo && geo.attributes && geo.attributes.position) ? geo.attributes.position.count : 0; }
  // silencioso=true: re-aplicação automática (modelo novo / refreshModelo / alpha) — não repinta hint nem outline
  function setEstiloDesenho(on, silencioso) {
    if (on && S._limparRaioX) S._limparRaioX(); // estilo desenho reescreve todos os materiais → tira o raio-X antes (senão o ghostMat vira o "material antes do estilo")
    estiloD.on = !!on;
    var bt = cortePanel.querySelector('[data-c="estilo"]');
    var h2 = (S && S.host) || host; // re-home troca o host — o closure original aponta pro morto
    if (on) {
      if (!estiloD.mat) estiloD.mat = new THREE.MeshBasicMaterial({ color: 0xe9e9e9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      if (!estiloD.matLinha) estiloD.matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
      todasMalhas(function (m) {
        if (!m.geometry) return;
        // salva o material ORIGINAL só na 1ª passada (idempotente); mas FORÇA o cinza SEMPRE que
        // reaplicar — senão refreshModelo/transparência/4D deixariam a cor original de volta com o
        // estilo ainda ligado (o _matAntesEstilo guarda o que restaurar; o material vivo é o cinza).
        if (!('_matAntesEstilo' in m.userData)) {
          if (m === S.selected) m.userData._matAntesEstilo = S.prevMat || m.material;
          else m.userData._matAntesEstilo = m.material;
        }
        if (m === S.selected) S.prevMat = estiloD.mat; // desselecionar devolve o cinza, não a cor
        else if (m.material !== estiloD.mat) m.material = estiloD.mat;
        // arestas pretas: pula malha densa (mesmo guard do snap) — EdgesGeometry em terreno de 90k
        // vértices trava a UI; a massa cinza continua, só sem contorno
        if (!m.userData._edgeLn && nVerts(m.geometry) <= SNAP_MAX_VERT) {
          var arr = arestasDe(m.geometry);
          if (arr.length) {
            var bge = new THREE.BufferGeometry(); bge.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            var ln = new THREE.LineSegments(bge, estiloD.matLinha);
            ln.raycast = function () {}; // aresta é decoração — nunca rouba o clique/snap da parede
            m.add(ln); m.userData._edgeLn = ln;
          }
        }
        if (m.userData._edgeLn) m.userData._edgeLn.visible = true;
      });
      h2.style.background = '#fff';
      _chao.visible = false; // fundo branco: o blob da sombra de contato viraria borrão cinza (some no fundo escuro normal)
      if (bt) bt.style.outline = '2px solid ' + corAtiva();
      if (!silencioso) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Estilo desenho: massas + arestas no fundo branco (as cores voltam ao sair).');
    } else {
      _chao.visible = true;
      todasMalhas(function (m) {
        if ('_matAntesEstilo' in m.userData) {
          if (m === S.selected) { if (S.prevMat === estiloD.mat) S.prevMat = m.userData._matAntesEstilo; }
          else m.material = m.userData._matAntesEstilo;
          delete m.userData._matAntesEstilo;
        }
        if (m.userData._edgeLn) m.userData._edgeLn.visible = false;
      });
      if (bt) bt.style.outline = '';
      if (S._aplicarTema) S._aplicarTema(); // devolve o fundo do tema atual
    }
  }
  S._setEstiloDesenho = setEstiloDesenho;
  S._reaplicarEstilo = function () { if (estiloD.on) setEstiloDesenho(true, true); }; // modelo novo/refresh entra no estilo, sem spam de hint
  // esconde/mostra as arestas do estilo (thumbnail e foto de 1 elemento não podem sair com wireframe)
  S._edgesEstilo = function (mostrar) { if (!estiloD.on) return; todasMalhas(function (m) { if (m.userData._edgeLn) m.userData._edgeLn.visible = !!mostrar; }); };

  var plantaCfg = document.createElement('div');
  plantaCfg.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:270px;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  plantaCfg.innerHTML =
    '<b>' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Planta baixa técnica</b>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-q="esc" class="inp" style="width:130px"><option value="50" selected>1:50</option><option value="75">1:75</option><option value="100">1:100</option><option value="200">1:200</option></select></label>' +
    '<label style="display:flex;gap:6px;align-items:center"><input data-q="cotas" type="checkbox" checked> Cotas automáticas nas paredes</label>' +
    '<label style="display:flex;justify-content:space-between;align-items:center">Profundidade abaixo do corte <input data-q="prof" class="inp" type="number" min="0.5" step="0.5" value="3" style="width:64px"> m</label>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' As cotas saem dos alinhamentos das faces das paredes retas nos eixos do modelo. Parede fora de esquadro fica sem cota automática (declarada no desenho) — use a ' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' trena.</div>' +
    '<div style="display:flex;gap:6px"><button class="btn sm primary" data-q="gerar" style="flex:1">Gerar</button><button class="btn sm" data-q="cancelar" style="flex:1">Cancelar</button></div>';
  host.appendChild(plantaCfg);
  S.plantaCfg = plantaCfg;

  // cadeias de cota (parciais + total) desenhadas em volta do desenho, estilo prancha
  function desenharCotas(g2, cad, geo) {
    var mmpx = 96 / 25.4;
    function mm(v) { return Math.round(v * mmpx); }
    function px(x) { return geo.padL + (x - geo.x0) * geo.pxM; }
    function py(z) { return (z - geo.z0) * geo.pxM; }
    function tick(x, y) { g2.beginPath(); g2.moveTo(x - 3.5, y + 3.5); g2.lineTo(x + 3.5, y - 3.5); g2.stroke(); }
    g2.lineWidth = 1;
    if (cad.x) {
      var y1 = geo.H + mm(6), y2 = geo.H + mm(12);
      g2.strokeStyle = '#888'; // linhas de chamada
      cad.x.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(px(t), geo.H + 2); g2.lineTo(px(t), y2 + mm(1.5)); g2.stroke(); });
      g2.strokeStyle = '#111'; g2.fillStyle = '#111';
      g2.beginPath(); g2.moveTo(px(cad.x.total.a) - 6, y1); g2.lineTo(px(cad.x.total.b) + 6, y1); g2.stroke();
      cad.x.ticks.forEach(function (t) { tick(px(t), y1); });
      cad.x.segs.forEach(function (s) {
        var w = px(s.b) - px(s.a), t = BimPlanta.fmtM(s.v);
        g2.font = '10px Arial'; var tw = g2.measureText(t).width;
        if (tw > w - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > w - 2) return; } // sem espaço: fica só o tick
        g2.fillText(t, (px(s.a) + px(s.b)) / 2 - tw / 2, y1 - 3);
      });
      g2.beginPath(); g2.moveTo(px(cad.x.total.a) - 6, y2); g2.lineTo(px(cad.x.total.b) + 6, y2); g2.stroke();
      tick(px(cad.x.total.a), y2); tick(px(cad.x.total.b), y2);
      g2.font = 'bold 11px Arial'; var tt = BimPlanta.fmtM(cad.x.total.v), ttw = g2.measureText(tt).width;
      g2.fillText(tt, (px(cad.x.total.a) + px(cad.x.total.b)) / 2 - ttw / 2, y2 - 3);
    }
    if (cad.z) {
      var x1 = geo.padL - mm(6), x2 = geo.padL - mm(12);
      g2.strokeStyle = '#888';
      cad.z.ticks.forEach(function (t) { g2.beginPath(); g2.moveTo(geo.padL - 2, py(t)); g2.lineTo(x2 - mm(1.5), py(t)); g2.stroke(); });
      g2.strokeStyle = '#111'; g2.fillStyle = '#111';
      g2.beginPath(); g2.moveTo(x1, py(cad.z.total.a) - 6); g2.lineTo(x1, py(cad.z.total.b) + 6); g2.stroke();
      cad.z.ticks.forEach(function (t) { tick(x1, py(t)); });
      cad.z.segs.forEach(function (s) {
        var h = py(s.b) - py(s.a), t = BimPlanta.fmtM(s.v);
        g2.font = '10px Arial'; var tw = g2.measureText(t).width;
        if (tw > h - 4) { g2.font = '8px Arial'; tw = g2.measureText(t).width; if (tw > h - 2) return; }
        g2.save(); g2.translate(x1 - 3, (py(s.a) + py(s.b)) / 2 + tw / 2); g2.rotate(-Math.PI / 2); g2.fillText(t, 0, 0); g2.restore();
      });
      g2.beginPath(); g2.moveTo(x2, py(cad.z.total.a) - 6); g2.lineTo(x2, py(cad.z.total.b) + 6); g2.stroke();
      tick(x2, py(cad.z.total.a)); tick(x2, py(cad.z.total.b));
      g2.save(); g2.font = 'bold 11px Arial'; var tz = BimPlanta.fmtM(cad.z.total.v), tzw = g2.measureText(tz).width;
      g2.translate(x2 - 3, (py(cad.z.total.a) + py(cad.z.total.b)) / 2 + tzw / 2); g2.rotate(-Math.PI / 2); g2.fillText(tz, 0, 0); g2.restore();
    }
  }

  function gerarPlantaTec(o) {
    // o: {y (altura do corte no MUNDO, metros), escala, cotas, prof, rotAlt}
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return null;
    var minX = box.min.x, maxX = box.max.x, minZ = box.min.z, maxZ = box.max.z;
    var margem = Math.max(0.4, Math.max(maxX - minX, maxZ - minZ) * 0.03);
    var wM = (maxX - minX) + margem * 2, hM = (maxZ - minZ) + margem * 2;
    var escBase = o.escala || 50, PPM96 = 96 / 25.4;
    // mesmo cap honesto do corte técnico: se a escala pedida estoura a GPU, sobe pra próxima da
    // série padrão (medível com escalímetro) e recomputa px/m EXATO — carimbo == pixels
    var MAXPX = Math.min(4096, (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096);
    var escalaEf = escBase, pxM = PPM96 * (1000 / escalaEf);
    if (Math.max(wM, hM) * pxM > MAXPX) {
      escalaEf = null;
      for (var si = 0; si < SERIE_ESC.length; si++) { if (SERIE_ESC[si] >= escBase && Math.max(wM, hM) * (PPM96 * (1000 / SERIE_ESC[si])) <= MAXPX) { escalaEf = SERIE_ESC[si]; break; } }
      if (escalaEf == null) { escalaEf = Math.ceil(PPM96 * 1000 / (MAXPX / Math.max(wM, hM))); pxM = PPM96 * (1000 / escalaEf); }
      else pxM = PPM96 * (1000 / escalaEf);
    }
    var ajustada = escalaEf !== escBase;
    var W = Math.round(wM * pxM), H = Math.round(hM * pxM);
    var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    var recuo = 0.02, prof = Math.max(0.5, +o.prof || 3);
    var secPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), o.y); // mantém o que está ABAIXO do corte
    var cam = new THREE.OrthographicCamera(-wM / 2, wM / 2, hM / 2, -hM / 2, 0.01, recuo + prof);
    cam.position.set(cx, o.y + recuo, cz);
    cam.up.set(0, 0, -1); // norte pra cima (X do modelo pra direita)
    cam.lookAt(cx, o.y - 1, cz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    var prevClip = renderer.clippingPlanes, prevLocal = renderer.localClippingEnabled;
    var prevClear = renderer.getClearColor(new THREE.Color()).clone(), prevAlpha = renderer.getClearAlpha();
    var prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
    var rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: true }), buf = null, edgesRoot = null, matMassa = null, matLinha = null, escondidos = [];
    var stBack = null, stFront = null, capMat = null, capGeo = null, hatchTex = null;
    try {
      renderer.clippingPlanes = [secPlane]; renderer.localClippingEnabled = false;
      renderer.toneMapping = THREE.NoToneMapping; // P&B fiel
      scene.children.forEach(function (c) { if (c !== modelRoot && c.visible !== false) { escondidos.push(c); c.visible = false; } });
      // PASSE 1 — massas cinza-claro sobre branco
      matMassa = new THREE.MeshBasicMaterial({ color: 0xededed, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.overrideMaterial = matMassa;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      // PASSE 1.5 — HACHURA nas paredes cortadas (paridade de stencil, mesma técnica do corte
      // técnico; câmera do stencil com far cobrindo o modelo INTEIRO abaixo do corte)
      renderer.autoClear = false;
      var camSt = cam.clone(); camSt.far = recuo + Math.max(0.5, o.y - box.min.y) + 1; camSt.updateProjectionMatrix();
      stBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.BackSide,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp });
      stFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.FrontSide,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp });
      scene.overrideMaterial = stBack; renderer.render(scene, camSt);
      scene.overrideMaterial = stFront; renderer.render(scene, camSt);
      scene.overrideMaterial = null;
      var hcv = document.createElement('canvas'); hcv.width = hcv.height = 32;
      var hg = hcv.getContext('2d');
      hg.fillStyle = '#dfdfdf'; hg.fillRect(0, 0, 32, 32);
      hg.strokeStyle = '#141414'; hg.lineWidth = 2.4;
      hg.beginPath(); hg.moveTo(-4, 36); hg.lineTo(36, -4); hg.moveTo(-20, 20); hg.lineTo(20, -20); hg.moveTo(12, 52); hg.lineTo(52, 12); hg.stroke();
      hatchTex = new THREE.CanvasTexture(hcv);
      hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping; hatchTex.minFilter = THREE.LinearFilter;
      var esp = 0.0028 * escalaEf; // ~2 mm no papel em qualquer escala
      hatchTex.repeat.set(wM / esp, hM / esp);
      capMat = new THREE.MeshBasicMaterial({ map: hatchTex, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp });
      capGeo = new THREE.PlaneGeometry(wM, hM);
      var capQuad = new THREE.Mesh(capGeo, capMat);
      capQuad.rotation.x = Math.PI / 2; // XY -> XZ, normal pra baixo (lado mantido pelo clip)
      capQuad.position.set(cx, o.y - 1e-3, cz); // um fio ALÉM do plano, no lado mantido
      var capScene = new THREE.Scene(); capScene.add(capQuad);
      renderer.render(capScene, camSt);
      // PASSE 2 — arestas pretas
      edgesRoot = new THREE.Group(); matLinha = new THREE.LineBasicMaterial({ color: 0x111111 });
      modelRoot.children.forEach(function (g) {
        (g.children || []).forEach(function (m) {
          if (!m.geometry || !cadeiaVisivel(m)) return;
          var arr = arestasDe(m.geometry); if (!arr.length) return;
          var bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          var ls = new THREE.LineSegments(bg, matLinha);
          ls.matrixAutoUpdate = false; ls.matrix.copy(m.matrixWorld);
          edgesRoot.add(ls);
        });
      });
      scene.add(edgesRoot); modelRoot.visible = false; renderer.autoClear = false;
      renderer.render(scene, cam);
      buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    } finally {
      // restaura o viewer SEMPRE (mesma disciplina do corte técnico)
      scene.overrideMaterial = null; renderer.autoClear = prevAuto; modelRoot.visible = true;
      if (edgesRoot) { scene.remove(edgesRoot); edgesRoot.children.forEach(function (ls) { if (ls.geometry) ls.geometry.dispose(); }); }
      if (matLinha) matLinha.dispose(); if (matMassa) matMassa.dispose();
      if (stBack) stBack.dispose(); if (stFront) stFront.dispose();
      if (capMat) capMat.dispose(); if (capGeo) capGeo.dispose(); if (hatchTex) hatchTex.dispose();
      escondidos.forEach(function (c) { c.visible = true; });
      renderer.setRenderTarget(null); try { rt.dispose(); } catch (_) {}
      renderer.clippingPlanes = prevClip; renderer.localClippingEnabled = prevLocal;
      renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTone;
    }
    if (!buf) return null;
    // COTAS AUTOMÁTICAS — só paredes VISÍVEIS que o corte atravessa (motor puro BimPlanta)
    var cad = null;
    if (o.cotas && typeof BimPlanta !== 'undefined') {
      var els = [];
      S.modelos.forEach(function (mo) {
        if (mo.visivel === false) return;
        (mo.elementos || []).forEach(function (el) {
          if (!el.aabb) return;
          var m = S.meshPorUid[el.uid];
          if (!m || !m.visible || !cadeiaVisivel(m)) return;
          els.push({ tipo: el.tipo, aabb: el.aabb });
        });
      });
      cad = BimPlanta.cadeias(BimPlanta.paredesDoCorte(els, o.y));
    }
    var temCotas = !!(cad && (cad.x || cad.z));
    // avisos honestos numa FAIXA reservada no topo (nunca por cima do desenho)
    var avisos = [];
    if (cad && cad.diagonais) avisos.push('⚠ ' + cad.diagonais + ' parede(s) fora de esquadro/curtas sem cota automática — meça com a trena');
    if (o.cotas && !temCotas) avisos.push('' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Nenhuma parede reta atravessa o corte — sem cotas automáticas');
    var padTop = avisos.length ? (avisos.length * 15 + 8) : 0;
    var padL = (cad && cad.z) ? Math.round(17 * PPM96) : 0; // 17 mm p/ cadeia vertical
    var padB = (cad && cad.x) ? Math.round(17 * PPM96) : 0;
    var faixa = 46, totalW = padL + W, totalH = padTop + H + padB + faixa, yBase = padTop + H + padB;
    var cnv = document.createElement('canvas'); cnv.width = totalW; cnv.height = totalH;
    var g2 = cnv.getContext('2d');
    g2.fillStyle = '#fff'; g2.fillRect(0, 0, totalW, totalH);
    var img = g2.createImageData(W, H);
    for (var y2f = 0; y2f < H; y2f++) { var srcY = (H - 1 - y2f) * W * 4; img.data.set(buf.subarray(srcY, srcY + W * 4), y2f * W * 4); }
    g2.putImageData(img, padL, padTop); // putImageData ignora transform — posiciona direto abaixo da faixa de avisos
    if (cad) { g2.save(); g2.translate(0, padTop); desenharCotas(g2, cad, { padL: padL, H: H, pxM: pxM, x0: minX - margem, z0: minZ - margem }); g2.restore(); }
    // faixa de avisos no topo
    if (avisos.length) {
      g2.font = '11px Arial'; g2.fillStyle = '#b45309';
      for (var ai = 0; ai < avisos.length; ai++) g2.fillText(avisos[ai], 8, 16 + ai * 15);
    }
    // moldura + divisória do carimbo + escala gráfica + carimbo (mesma régua do corte técnico)
    g2.strokeStyle = '#111'; g2.lineWidth = 2; g2.strokeRect(1, 1, totalW - 2, totalH - 2);
    g2.beginPath(); g2.moveTo(1, yBase); g2.lineTo(totalW - 1, yBase); g2.stroke();
    g2.fillStyle = '#111'; var temBarra = pxM >= 8 && pxM < totalW * 0.45, barW = temBarra ? pxM + 26 : 0;
    if (temBarra) { g2.fillRect(totalW - pxM - 12, yBase + 16, pxM, 6); g2.font = '10px Arial'; g2.fillText('1 m', totalW - pxM - 12, yBase + 37); }
    var rotAlt = o.rotAlt || (fmtDist(Math.max(0, o.y - box.min.y)) + ' do piso');
    var titulo = 'PLANTA BAIXA (corte a ' + rotAlt + ')  ·  ESC 1:' + escalaEf + (ajustada ? ' (ajustada)' : '') + '  ·  ' + (((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') || 'Desenho técnico') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?' · OrçaPRO BIM':'') + '  ·  ' + new Date().toLocaleDateString('pt-BR');
    var livre = totalW - 16 - barW, fs = 15;
    g2.font = 'bold ' + fs + 'px Arial';
    while (fs > 8 && g2.measureText(titulo).width > livre) { fs--; g2.font = 'bold ' + fs + 'px Arial'; }
    if (g2.measureText(titulo).width > livre) { titulo = 'ESC 1:' + escalaEf + (ajustada ? ' (aj.)' : ''); g2.font = 'bold 11px Arial'; }
    g2.fillStyle = '#111'; g2.fillText(titulo, 10, yBase + 29);
    return { url: cnv.toDataURL('image/png'), w: totalW, h: totalH, escala: escalaEf, pxPorMetro: pxM, ajustada: ajustada, cotas: temCotas, diagonais: cad ? cad.diagonais : 0, larguraMM: totalW / 96 * 25.4, alturaMM: totalH / 96 * 25.4 };
  }
  S._gerarPlantaTec = gerarPlantaTec;
  plantaCfg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]'); if (!b) return; var k = b.getAttribute('data-q');
    if (k === 'cancelar') { plantaCfg.style.display = 'none'; return; }
    if (k !== 'gerar') return;
    if (!planta.on || !planta.plane) { plantaCfg.style.display = 'none'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Abra a Planta primeiro — o corte usa a altura do slider.'); return; }
    var res = gerarPlantaTec({
      y: planta.plane.constant,
      escala: +plantaCfg.querySelector('[data-q="esc"]').value,
      cotas: plantaCfg.querySelector('[data-q="cotas"]').checked,
      prof: +plantaCfg.querySelector('[data-q="prof"]').value,
      rotAlt: (cortePanel.querySelector('[data-c="v"]') || {}).textContent
    });
    plantaCfg.style.display = 'none';
    if (!res) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('nota', 15) : '') + ' Carregue um modelo primeiro.'); return; }
    ctecModal._res = res;
    ctecModal._nomeArq = 'planta-baixa.png';
    ctecModal._ajustar = function () { plantaCfg.style.display = 'flex'; };
    ctecModal.querySelector('[data-r="img"]').src = res.url;
    ctecModal.querySelector('[data-r="titulo"]').textContent = 'Planta baixa — ESC 1:' + res.escala + (res.ajustada ? ' (ajustada p/ caber)' : '') + (res.cotas ? ' · cotas automáticas' : '');
    ctecModal.style.display = 'flex'; S._hint('');
  });

  // ============================================================
  // 🏢 PAVIMENTOS — lê os IfcBuildingStorey do arquivo e permite isolar um andar
  // ou gerar a planta baixa DELE (isola + corta a 1,20 m do piso do pavimento).
  // Isolamento é SÓ visibilidade (mesh.visible) — 4D/mostrarTudo (externos)
  // sobrescrevem e limpam o marcador. Merge por NOME entre modelos federados
  // (o engenheiro pensa em andares, não em arquivos).
  // ============================================================
  var pav = { isolado: null, manual: false }; // manual = isolamento via 👁 (sem nome de pavimento)
  S.pav = pav;
  // COMPOSIÇÃO COM O 4D (achado do gate — família "camada nova reintroduz o que o filtro matou"):
  // aplicarEstado guarda os "futuros" em S._fut4d; toda escrita de visibilidade do 🏢/👁 compõe
  // com ele (visível = pertence ao alvo E não é futuro) — senão isolar um pavimento ressuscitaria
  // paredes que o cronograma ainda não construiu, com o rótulo de avanço ainda na tela.
  function ehFuturo4d(m) {
    var f = S._fut4d; if (!f) return false;
    var id = m.userData.expressID;
    return !!(f[m.userData.mid + ':' + id] || f[id]);
  }
  // irmão de ehFuturo4d: elemento "em andamento" (âmbar) no estágio 4D corrente — usado no restore do raio-X
  function ehAndamento4d(m) {
    var a = S._and4d; if (!a) return false;
    var id = m.userData.expressID;
    return !!(a[m.userData.mid + ':' + id] || a[id]);
  }
  S._ehAndamento4d = ehAndamento4d;
  // malhas que o usuário REALMENTE vê (grupo do modelo ligado + mesh visível)
  function visiveisEfetivos() {
    var v = 0;
    modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
    return v;
  }
  var pavPanel = document.createElement('div');
  pavPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:250px;max-height:55%;overflow:auto';
  host.appendChild(pavPanel);
  S.pavPanel = pavPanel;
  function todasMalhas(fn) { modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
  // lista mesclada por nome (entre modelos), ordenada pela altura real (y0 do AABB dos membros)
  function pavLista() {
    var mapa = {}, ordem = [];
    S.modelos.forEach(function (mo) {
      (mo.pavimentos || []).forEach(function (pv) {
        var k = pv.nome.trim().toLowerCase();
        if (!mapa[k]) { mapa[k] = { nome: pv.nome.trim(), uids: {}, y0: null, yMax: null, elev: null, n: 0 }; ordem.push(mapa[k]); }
        pv.eids.forEach(function (eid) { if (!mapa[k].uids[mo.mid + ':' + eid]) { mapa[k].uids[mo.mid + ':' + eid] = 1; mapa[k].n++; } });
        // FRAMES DISTINTOS (achado do gate): y0 é MUNDO (AABB dos membros); elev é LOCAL do
        // arquivo (datum próprio, ignora placement) — NUNCA entram na mesma régua. elev fica
        // num campo separado e serve SÓ de desempate de ordenação entre pavimentos sem malha.
        if (pv.y0 != null) {
          if (mapa[k].y0 == null || pv.y0 < mapa[k].y0) mapa[k].y0 = pv.y0;
          if (mapa[k].yMax == null || pv.y0 > mapa[k].yMax) mapa[k].yMax = pv.y0;
        }
        if (pv.elev != null && (mapa[k].elev == null || pv.elev < mapa[k].elev)) mapa[k].elev = pv.elev;
      });
    });
    // merge por nome com cotas REALMENTE diferentes (blocos em desnível) -> marca p/ avisar na planta
    ordem.forEach(function (pv) { pv.spread = (pv.y0 != null && pv.yMax != null && (pv.yMax - pv.y0) > 1.5); });
    // ordena pela altura de MUNDO; sem geometria vai pro fim (ordenado entre si pelo elev local)
    ordem.sort(function (a, b) {
      var ka = (a.y0 == null) ? 1 : 0, kb = (b.y0 == null) ? 1 : 0;
      if (ka !== kb) return ka - kb;
      if (ka === 1) return (a.elev == null ? 1e9 : a.elev) - (b.elev == null ? 1e9 : b.elev);
      return a.y0 - b.y0;
    });
    return ordem;
  }
  S._pavLista = pavLista;
  function pavRender() {
    var lst = pavLista();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Pavimentos</b><button class="btn sm" data-p="todos" title="Mostrar todos os pavimentos de novo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos</button></div>';
    if (!lst.length) {
      html += '<div style="font-size:11px;color:#9fb2c8">Este IFC não declara pavimentos (IfcBuildingStorey). Use a ' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta com o slider de altura.</div>';
    } else {
      var base = null;
      lst.forEach(function (pv) { if (pv.y0 != null && (base == null || pv.y0 < base)) base = pv.y0; });
      lst.forEach(function (pv) {
        var atv = pav.isolado === pv.nome;
        var nivel = (pv.y0 != null && base != null) ? ' <span style="color:#9fb2c8;font-size:11px">nível +' + fmtDist(Math.max(0, pv.y0 - base)) + '</span>' : '';
        html += '<div style="display:flex;align-items:center;gap:5px;border:1px solid ' + (atv ? corAtiva() : 'transparent') + ';border-radius:7px;padding:2px 4px">' +
          '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(pv.nome) + ' · ' + pv.n + ' elementos">' + esc(pv.nome) + nivel + '</span>' +
          '<button class="btn sm" data-p="iso" data-n="' + esc(pv.nome) + '" title="Isolar este pavimento">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + '</button>' +
          '<button class="btn sm" data-p="pl" data-n="' + esc(pv.nome) + '" title="Planta baixa deste pavimento">' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + '</button></div>';
      });
      html += '<div style="font-size:11px;color:#9fb2c8">Isolar mostra só o que o IFC declara nesse andar — o que não está em pavimento nenhum também some. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos restaura.</div>';
    }
    pavPanel.innerHTML = html;
    var bp2 = bar.querySelector('[data-b="pav"]'); if (bp2) { bp2.style.background = pav.isolado ? corAtiva() : ''; bp2.style.color = pav.isolado ? '#fff' : ''; bp2.style.outline = (pavPanel.style.display === 'flex') ? '2px solid #7fe0a3' : ''; }
  }
  S._pavRender = pavRender;
  function restaurarVisibilidade() {
    pav.isolado = null; pav.manual = false;
    if (S._limparRaioX) S._limparRaioX(); // ↺ também tira o raio-X (materiais fantasma → originais)
    todasMalhas(function (m) { m.visible = !ehFuturo4d(m) && !ehRemovidoEd(m); }); // restaurar NÃO ressuscita futuros do 4D nem removidos da edição
    pavRender();
  }
  S._restaurarVis = restaurarVisibilidade;
  function isolarPavimento(nome) {
    var lst = pavLista(), alvo = null;
    for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
    if (!alvo) return false;
    todasMalhas(function (m) { m.visible = !!alvo.uids[m.userData.mid + ':' + m.userData.expressID] && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = alvo.nome; pav.manual = false; pavRender();
    if (visiveisEfetivos() === 0) S._hint('🏢 "' + alvo.nome + '" isolado, mas nada visível — o pavimento pertence a um modelo desligado (religue no painel Modelos) ou não tem geometria/está no futuro do 4D. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos restaura.');
    else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Pavimento "' + alvo.nome + '" isolado. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos (painel 🏢) restaura.');
    return true;
  }
  S._isolarPavimento = isolarPavimento;
  function plantaPavimento(nome) {
    var lst = pavLista(), alvo = null;
    for (var i = 0; i < lst.length; i++) if (lst[i].nome === nome) { alvo = lst[i]; break; }
    if (!alvo) return false;
    isolarPavimento(alvo.nome);
    if (!planta.on) setPlanta(true);
    if (!planta.on) return false; // bbox vazio
    // corte a 1,20 m do piso do PAVIMENTO (altura de peitoril), limitado à faixa do modelo
    var y = (alvo.y0 != null ? alvo.y0 : planta.y0) + 1.2;
    y = Math.max(planta.y0 + 0.05, Math.min(planta.y1 - 0.001, y));
    var frac = (y - planta.y0) / ((planta.y1 - planta.y0) || 1);
    var sl = cortePanel.querySelector('[data-c="alt"]'); if (sl) sl.value = Math.round(frac * 1000);
    setAlturaCorte(frac);
    // rótulo honesto: merge com cotas diferentes / pavimento sem geometria têm ressalva explícita
    var aviso = '';
    if (alvo.y0 == null) aviso = ' ' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Este pavimento não tem geometria própria — o corte ficou na base do modelo.';
    else if (alvo.spread) aviso = ' ' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Há "' + alvo.nome + '" em cotas diferentes entre os modelos — parte pode ficar acima do corte (ajuste no slider).';
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('regua', 15) : '') + ' Planta do pavimento "' + alvo.nome + '".' + aviso + ' Ajuste fino no slider; ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Todos (painel 🏢) traz o prédio de volta.');
    return true;
  }
  S._plantaPavimento = plantaPavimento;
  pavPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return; var k = b.getAttribute('data-p');
    if (k === 'todos') { restaurarVisibilidade(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('niveis', 15) : '') + ' Todos os pavimentos visíveis.'); }
    else if (k === 'iso') isolarPavimento(b.getAttribute('data-n'));
    else if (k === 'pl') plantaPavimento(b.getAttribute('data-n'));
  });
  function togglePavPanel() {
    var abrir = (pavPanel.style.display === 'none' || !pavPanel.style.display);
    fecharPaineis(abrir ? pavPanel : null);
    pavPanel.style.display = abrir ? 'flex' : 'none';
    if (abrir) pavRender(); else { var bp3 = bar.querySelector('[data-b="pav"]'); if (bp3) bp3.style.outline = ''; }
  }

  // ============================================================
  // 👁 VISIBILIDADE — isolar/ocultar o elemento selecionado (duplo-clique) ou
  // todos do mesmo tipo. Só mexe em mesh.visible (materiais intactos).
  // ============================================================
  var visPanel = document.createElement('div');
  visPanel.style.cssText = 'position:absolute;right:10px;top:52px;z-index:4;display:none;flex-direction:column;gap:6px;background:rgba(15,39,64,.94);border:1px solid #24435f;border-radius:11px;padding:11px 13px;color:#dbe8f5;font-size:12px;width:220px';
  visPanel.innerHTML =
    // ✕ próprio (padrão dos outros painéis): sem ele, o único jeito de fechar era o
    // botão "Ver" lá dentro do leque do dock — e com a barra recolhida o painel ficava
    // órfão na tela, sem nenhum fechador alcançável.
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Visibilidade</b>' +
      '<button class="btn sm" data-v="fechar" title="Fechar este painel" style="padding:2px 8px;line-height:1.2">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
    '<button class="btn sm" data-v="iso" title="Esconde tudo, menos o elemento selecionado">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Isolar seleção</button>' +
    '<button class="btn sm" data-v="occ" title="Esconde o elemento selecionado">' + (typeof Icones !== 'undefined' ? Icones.get('olhoFechado', 15) : '') + ' Ocultar seleção</button>' +
    '<button class="btn sm" data-v="tipo" title="Mostra só os elementos do MESMO tipo do selecionado (ex.: todas as paredes)">' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Só este tipo</button>' +
    '<button class="btn sm" data-v="rx" title="Raio-X: deixa o resto translúcido (não some) e destaca o elemento. Enxergue o que está atrás/dentro.">' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X da seleção</button>' +
    '<button class="btn sm" data-v="rxt" title="Raio-X por tipo: destaca todos deste tipo (ex.: toda a hidráulica) e translucidez o resto — bom pra ver onde há cano antes de furar.">' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X deste tipo</button>' +
    '<button class="btn sm" data-v="tudo" title="Volta a mostrar tudo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo</button>' +
    '<div style="font-size:11px;color:#9fb2c8">Dê <b>dois cliques</b> num elemento do modelo pra selecionar antes.</div>';
  host.appendChild(visPanel);
  S.visPanel = visPanel;
  function selInfo() { return (S.selected && S.selected.userData && S.selected.userData.expressID != null) ? { mid: S.selected.userData.mid, eid: S.selected.userData.expressID, tipo: S.selected.userData.tipo } : null; }
  function isolarSelecao() {
    var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
    todasMalhas(function (m) { m.visible = (m.userData.mid === si.mid && m.userData.expressID === si.eid) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = null; pav.manual = true; pavRender(); // isolamento manual substitui o de pavimento (e é restaurável)
    if (visiveisEfetivos() === 0) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Isolado, mas nada visível — o modelo desse elemento está desligado no painel Modelos. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta o modelo.');
    else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Elemento isolado. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo (painel 👁) volta o modelo.');
  }
  S._isolarSelecao = isolarSelecao;
  function ocultarSelecao() {
    var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
    // devolve o material e desseleciona ANTES de esconder — senão o selMat fica preso no mesh oculto
    if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; contornoSelecao(null); if (opts.onPick) { try { opts.onPick(null); } catch (_) {} } } // contornoSelecao(null): senão o contorno verde fica flutuando sobre o vazio (gate v1.1.89)
    todasMalhas(function (m) { if (m.userData.mid === si.mid && m.userData.expressID === si.eid) m.visible = false; });
    pav.manual = true; // remover/carregar modelo restaura (nada fica escondido "pra sempre" sem marcador)
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olhoFechado', 15) : '') + ' Elemento oculto. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo (painel 👁) traz de volta.');
  }
  S._ocultarSelecao = ocultarSelecao;
  function isolarTipo() {
    var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento do modelo primeiro.'); return; }
    todasMalhas(function (m) { m.visible = (m.userData.tipo === si.tipo) && !ehFuturo4d(m) && !ehRemovidoEd(m); });
    pav.isolado = null; pav.manual = true; pavRender();
    if (visiveisEfetivos() === 0) S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Só "' + rotuloDisciplina(si.tipo) + '", mas nada visível — o modelo está desligado no painel Modelos. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
    else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('quebracabeca', 15) : '') + ' Mostrando só "' + rotuloDisciplina(si.tipo) + '". ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta o modelo.');
  }
  S._isolarTipo = isolarTipo;
  // ---- 🫥 RAIO-X: deixa o resto translúcido (não oculto) para ver o que está DENTRO/ATRÁS
  //      (ex.: onde passa cano/eletroduto antes de furar a parede) — material fantasma, restaurável.
  var xray = { on: false, ghosted: [] };
  var _ghostMat = null;
  function ghostMat() { if (!_ghostMat) _ghostMat = new THREE.MeshStandardMaterial({ color: 0x93a7bd, transparent: true, opacity: .1, depthWrite: false, metalness: 0, roughness: 1, side: THREE.DoubleSide }); return _ghostMat; }
  function limparRaioX() { if (!xray.on) return; xray.ghosted.forEach(function (m) { m.material = ehAndamento4d(m) ? S.matAndamento : matBase(m); }); xray.ghosted = []; xray.on = false; } // devolve o âmbar do 4D a quem estava "em andamento" (senão o restore mostra como concluído)
  S._limparRaioX = limparRaioX;
  function aplicarRaioX(ehAlvo, msg) {
    limparRaioX();
    xray.on = true; // ANTES do loop: senão o aborto abaixo chama limparRaioX() com xray.on=false e ele sai no early-return, deixando o modelo translúcido travado (gate v1.1.89)
    var nAlvo = 0;
    todasMalhas(function (m) {
      if (m.userData.expressID == null) return;
      if (ehFuturo4d(m) || ehRemovidoEd(m) || !m.visible) return; // não fantasmiza futuro/removido/já-oculto
      if (ehAlvo(m)) { nAlvo++; return; } // alvo permanece sólido
      m.material = ghostMat(); xray.ghosted.push(m);
    });
    if (!nAlvo) { limparRaioX(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Nada correspondeu ao alvo do raio-X.'); return; } // agora restaura de verdade
    S._hint(msg);
  }
  function raioXSelecao() {
    var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento primeiro.'); return; }
    aplicarRaioX(function (m) { return m.userData.mid === si.mid && m.userData.expressID === si.eid; }, '' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X: elemento em destaque, resto translúcido. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
    if (S.selected) contornoSelecao(S.selected);
  }
  function raioXTipo() {
    var si = selInfo(); if (!si) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('olho', 15) : '') + ' Dê dois cliques num elemento primeiro.'); return; }
    aplicarRaioX(function (m) { return m.userData.tipo === si.tipo; }, '' + (typeof Icones !== 'undefined' ? Icones.get('camadas', 15) : '') + ' Raio-X de "' + rotuloDisciplina(si.tipo) + '": resto translúcido — bom pra ver onde há cano/eletroduto antes de furar. ' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Restaurar tudo volta.');
  }
  S._raioXSelecao = raioXSelecao; S._raioXTipo = raioXTipo;
  visPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return; var k = b.getAttribute('data-v');
    if (k === 'fechar') { visPanel.style.display = 'none'; var bvF = bar.querySelector('[data-b="vis"]'); if (bvF) bvF.style.outline = ''; return; }
    if (k === 'iso') isolarSelecao();
    else if (k === 'occ') ocultarSelecao();
    else if (k === 'tipo') isolarTipo();
    else if (k === 'rx') raioXSelecao();
    else if (k === 'rxt') raioXTipo();
    else if (k === 'tudo') { restaurarVisibilidade(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Tudo visível de novo.'); }
  });
  function toggleVisPanel() {
    var abrir = (visPanel.style.display === 'none' || !visPanel.style.display);
    fecharPaineis(abrir ? visPanel : null);
    visPanel.style.display = abrir ? 'flex' : 'none';
    var bv = bar.querySelector('[data-b="vis"]'); if (bv) bv.style.outline = abrir ? '2px solid #7fe0a3' : '';
  }
  // um painel flutuante por vez (snap/pav/vis disputam os cantos da tela)
  function fecharPaineis(exceto) {
    // abrir um painel flutuante fecha o editor (senão o painel nasce ATRÁS dele, invisível)
    if (exceto && edit && edit.on && typeof setEdit === 'function') setEdit(false);
    /* ⚠ o reqPanel entra aqui TAMBEM: painel que abre por cima de outro e
       nao fecha vira caixa presa sem fechador — o mesmo defeito que o
       comentario logo abaixo do re-home descreve. */
    [snapPanel, pavPanel, visPanel, xrPanel, sisPanel, blocokPanel, reqPanel].forEach(function (pn) { if (pn && pn !== exceto) pn.style.display = 'none'; });
    if (blocokPanel !== exceto) { var bbk = bar.querySelector('[data-b="blocok"]'); if (bbk) { bbk.style.background = ''; bbk.style.color = ''; } }
    pintarSnapPanel();
    var bp4 = bar.querySelector('[data-b="pav"]'); if (bp4 && pavPanel.style.display !== 'flex') bp4.style.outline = '';
    var bv2 = bar.querySelector('[data-b="vis"]'); if (bv2 && visPanel.style.display !== 'flex') bv2.style.outline = '';
  }
  S._fecharPaineis = fecharPaineis;

  /* ✕ EM TODOS OS PAINÉIS FLUTUANTES (v1.1.126).
   * O visPanel ganhou o seu no cabeçalho, mas snap/pav/sis/blocok continuavam dependendo
   * do botão que os abriu — que mora dentro do leque do dock e some com a barra recolhida.
   * No celular ainda por cima não existe Esc. Um fechador absoluto no canto de cada painel
   * resolve todos de uma vez, sem tocar no HTML (que alguns montam dinamicamente). */
  function porFechadorNoPainel(pn) {
    if (!pn || pn.querySelector('[data-pnl-fechar]')) return;
    var x = document.createElement('button');
    x.className = 'btn sm';
    x.setAttribute('data-pnl-fechar', '1');
    x.title = 'Fechar este painel';
    x.textContent = '✕';
    x.style.cssText = 'position:absolute;right:7px;top:7px;z-index:2;padding:1px 7px;line-height:1.25;font-size:12px;opacity:.9';
    x.addEventListener('click', function (ev) { ev.stopPropagation(); pn.style.display = 'none'; fecharPaineis(null); });
    // espaço p/ o ✕ não cair em cima do título do painel
    pn.style.paddingRight = '30px';
    pn.appendChild(x);
  }
  [snapPanel, pavPanel, sisPanel, blocokPanel].forEach(function (pn) {
    if (!pn) return;
    porFechadorNoPainel(pn);
    /* Painéis que montam a lista na hora de abrir (pavimentos, sistemas, Blocok) fazem
     * innerHTML = ... e APAGAM o ✕ junto — o fechador sumia justo depois do primeiro uso.
     * O observer devolve o botão sempre que o conteúdo é reescrito. */
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { porFechadorNoPainel(pn); }).observe(pn, { childList: true });
    }
  });

  // toolbar com flex-wrap pode ter 2+ linhas em tela estreita: hint/painéis ancoram ABAIXO da
  // altura REAL da barra (o top:52px fixo cobriria a 2ª linha de botões)
  function ajustarTopFlutuantes() {
    // barra recolhida (offsetHeight 0): ancora os painéis abaixo do toggle — que no CELULAR
    // agora vive no PÉ do viewer, então lá os painéis podem colar no topo (t=8).
    var bh = (bar && bar.offsetHeight) || 0;
    var t = bh ? bh + 8 : (ehTelaPequena ? 8 : 44);
    [hint, snapPanel, pavPanel, visPanel, xrPanel].forEach(function (el) { if (el) el.style.top = t + 'px'; });
    /* v1.1.126: os painéis voltam para a DIREITA (o right:10px do próprio cssText).
     * Em left:64px eles ficavam embaixo do leque do dock (que abre em ~56px com 172px
     * de largura e z-index 60): no PC, passar o mouse na direção do painel fazia o leque
     * saltar na frente e os botões pararem de responder — parecia painel travado.
     * O dock mora à esquerda; à direita não há disputa. */
    /* z-index 7: a gaveta de análise (#bim-drawer) mora em z=6 e encosta na borda
     * direita — com os painéis em z=4 o ✕ e os botões ficavam ATRÁS dela, e o painel
     * voltava a parecer travado. Achado do gate de 25/07. */
    [snapPanel, pavPanel, visPanel, xrPanel].forEach(function (el) { if (el) { el.style.left = "auto"; el.style.right = "10px"; el.style.zIndex = "7"; } });
  }
  S._ajustarTop = ajustarTopFlutuantes;
  ajustarTopFlutuantes();
  window.addEventListener('resize', ajustarTopFlutuantes);

  // ============================================================
  // 📸 FOTO — captura o canvas (render síncrono + toDataURL, funciona com
  // preserveDrawingBuffer:false) e compõe carimbo. O fundo é gradiente CSS
  // (não sai na captura) -> pinta um fundo sólido só durante o render.
  // ============================================================
  // v1.1.82 — thumbnail de UM elemento (banco de famílias / quantitativo ilustrado): salva a
  // visibilidade REAL de cada malha + câmera, isola as malhas do elemento, enquadra pelo AABB,
  // renderiza síncrono (preserveDrawingBuffer=false: render+toDataURL na MESMA task), reduz p/
  // maxPx e RESTAURA tudo (visibilidade por malha — não usa restaurarVisibilidade, que apagaria
  // um isolamento que o usuário tinha feito). Devolve dataURL jpeg ou null.
  function thumbFamilia(uid, maxPx) {
    try {
      if (!S.modelos.length) return null;
      var px = uid.lastIndexOf(':'); if (px < 0) return null;
      var midStr = uid.slice(0, px), eidRaw = uid.slice(px + 1);
      var alvoEid = /^\d+$/.test(eidRaw) ? +eidRaw : eidRaw; // ids do editor são strings 'eN'
      var alvoMid = /^\d+$/.test(midStr) ? +midStr : midStr;
      var mo = modeloDe(alvoMid); if (!mo) return null;
      var elA = (mo.elementos || []).filter(function (e) { return e.id === alvoEid; })[0];
      var aabb = elA && elA.aabb; if (!aabb) return null;
      // snapshot: visibilidade por MALHA (não usa restaurarVisibilidade — apagaria isolamento do usuário)
      // + MATERIAL ORIGINAL das malhas do alvo (seleção verde/4D âmbar/clash não podem sair na foto)
      var visAntes = [], matAntes = [];
      cadaMalha(function (m) {
        visAntes.push([m, m.visible]);
        var ehAlvo = (m.userData.mid === alvoMid && m.userData.expressID === alvoEid);
        m.visible = ehAlvo;
        if (ehAlvo && m.userData.matOrig && m.material !== m.userData.matOrig) { matAntes.push([m, m.material]); m.material = m.userData.matOrig; }
      });
      var gAntes = []; modelRoot.children.forEach(function (g) { gAntes.push([g, g.visible]); g.visible = true; });
      if (S._edgesEstilo) S._edgesEstilo(false); // estilo desenho ligado: sem wireframe preto na foto da família
      // grid, cotas, pins e avatares vivem FORA do modelRoot — esconde (menos as LUZES, senão a foto sai preta)
      var cenaAntes = [];
      scene.children.forEach(function (c) { if (c !== modelRoot && !c.isLight && c.visible) { cenaAntes.push(c); c.visible = false; } });
      var camPos = camera.position.clone(), camNear = camera.near, camFar = camera.far, tgt = orbit.target.clone();
      var clipAntes = renderer.clippingPlanes; renderer.clippingPlanes = [];
      var prevBg = scene.background, thumb = null;
      try {
        var cx = (aabb.min[0] + aabb.max[0]) / 2, cy = (aabb.min[1] + aabb.max[1]) / 2, cz = (aabb.min[2] + aabb.max[2]) / 2;
        var dim = Math.max(aabb.max[0] - aabb.min[0], aabb.max[1] - aabb.min[1], aabb.max[2] - aabb.min[2]) || 1;
        var dist = dim * 1.9;
        camera.position.set(cx + dist * 0.72, cy + dist * 0.5, cz + dist * 0.72);
        camera.near = dim / 100; camera.far = dim * 50; camera.updateProjectionMatrix();
        camera.lookAt(cx, cy, cz);
        scene.background = new THREE.Color(0xf3f6fa); // fundo claro: legível no impresso
        renderer.render(scene, camera); // preserveDrawingBuffer=false → drawImage na MESMA task
        var srcCnv = renderer.domElement, lado = Math.min(srcCnv.width, srcCnv.height);
        var out = document.createElement('canvas'); var mp = maxPx || 220; out.width = mp; out.height = mp;
        out.getContext('2d').drawImage(srcCnv, (srcCnv.width - lado) / 2, (srcCnv.height - lado) / 2, lado, lado, 0, 0, mp, mp);
        thumb = out.toDataURL('image/jpeg', 0.85);
      } catch (_) { thumb = null; }
      // restaura TUDO
      scene.background = prevBg;
      renderer.clippingPlanes = clipAntes;
      matAntes.forEach(function (par) { par[0].material = par[1]; });
      visAntes.forEach(function (par) { par[0].visible = par[1]; });
      gAntes.forEach(function (par) { par[0].visible = par[1]; });
      cenaAntes.forEach(function (c) { c.visible = true; });
      camera.position.copy(camPos); camera.near = camNear; camera.far = camFar; camera.updateProjectionMatrix();
      orbit.target.copy(tgt); orbit.update();
      return thumb;
    } catch (e) { return null; }
  }

  S._thumbFamilia = thumbFamilia;
  S._propsCompletas = function (uid) { // uid 'mid:eid' → grupos de propriedades
    try {
      var px = uid.lastIndexOf(':'); if (px < 0) return [];
      var midStr = uid.slice(0, px), eidRaw2 = uid.slice(px + 1);
      var eid2 = /^\d+$/.test(eidRaw2) ? +eidRaw2 : eidRaw2; // 'eN' do editor é string
      return propsCompletas(/^\d+$/.test(midStr) ? +midStr : midStr, eid2);
    } catch (e) { return []; }
  };

  function tirarFoto() {
    if (!S.modelos.length) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Carregue um modelo primeiro.'); return null; }
    var prevBg = scene.background, url;
    var vLn = _selLn ? _selLn.visible : null; // o contorno verde de seleção é overlay de UI: não sai no PNG entregável
    try {
      scene.background = new THREE.Color(estiloD.on ? 0xffffff : 0x0d1f33); // estilo desenho: foto sai no branco
      if (_selLn) _selLn.visible = false;
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
    } catch (_) { url = null; } finally { scene.background = prevBg; if (_selLn && vLn !== null) _selLn.visible = vLn; }
    if (!url) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui capturar a imagem.'); return null; }
    var img = new Image();
    img.onload = function () {
      try {
        var faixa = 44, cnv = document.createElement('canvas');
        cnv.width = img.width; cnv.height = img.height + faixa;
        var g2 = cnv.getContext('2d');
        g2.drawImage(img, 0, 0);
        g2.fillStyle = '#0b1a2b'; g2.fillRect(0, img.height, cnv.width, faixa);
        // carimbo HONESTO: conta ELEMENTOS efetivamente visíveis (isolamento/4D/modelo desligado
        // reduzem) e declara "vista filtrada" quando não é o modelo inteiro
        var tot = 0; S.modelos.forEach(function (mo) { tot += mo.nEl || 0; });
        var visSet = {};
        modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible && m.userData.expressID != null) visSet[m.userData.mid + ':' + m.userData.expressID] = 1; }); });
        var nv = Object.keys(visSet).length;
        // planta/corte escondem via clippingPlanes (GPU) sem tocar mesh.visible -> também é vista parcial
        var cortado = (renderer.clippingPlanes || []).length > 0;
        var rotEl = nv < tot ? (nv + ' de ' + tot + ' elementos (vista filtrada)') : (cortado ? (tot + ' elementos (vista cortada)') : (tot + ' elementos'));
        g2.fillStyle = '#7fe0a3'; g2.font = 'bold 16px Segoe UI, Arial';
        g2.fillText((((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') ? ((typeof Empresa!=='undefined'&&Empresa.nomeDoc&&Empresa.nomeDoc())||'') + ' · ' : '') + ((typeof Empresa!=='undefined'&&Empresa.creditoTexto&&Empresa.creditoTexto())?'OrçaPRO BIM · ':'') + new Date().toLocaleString('pt-BR') + ' · ' + rotEl + (pav.isolado ? ' · pavimento: ' + pav.isolado : ''), 12, img.height + 28);
        var a2 = document.createElement('a'); a2.href = cnv.toDataURL('image/png'); a2.download = 'bim-foto.png'; a2.click();
        S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Foto salva (bim-foto.png).');
      } catch (_) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui montar o arquivo da foto.'); }
    };
    img.src = url;
    return url; // p/ testes (dataURL do render puro)
  }
  S._tirarFoto = tirarFoto;

  // ============================================================
  // 🥽 RA/RV — Realidade Mista e Virtual (v1.1.84)
  // Andar dentro do modelo em escala REAL (1:1) ou escolhida, medir na
  // escala, cortar a altura de visão, filtrar por DISCIPLINA e — no
  // Android/Chrome — colocar o projeto no ambiente com a câmera (RA).
  // O modo "Caminhar" funciona em QUALQUER aparelho (não exige WebXR),
  // então iPhone/iPad entram por ele. Tudo restaura ao sair.
  // ============================================================
  var EYE = 1.6; // altura dos olhos ao caminhar (m)
  var xr = { on: false, mode: null, escala: 1, session: null, hitSrc: null, reticle: null,
             placed: false, travado: false, prevClip: null, clip: null, prevLocal: false,
             cam: null, look: { yaw: 0, pitch: 0 }, joy: { x: 0, z: 0 }, ori: false, oriBase: null,
             oriQuat: null, oriOk: false, oriYawOff: 0, // v1.1.92 — giroscópio por QUATERNION (device-orientation real)
             boxOrig: null, posOrig: null, // bbox/posição do modelo em escala 1 (âncora da escala)
             modelSnap: null, medir: { on: false, pts: [], objs: [] }, discOcultas: {} };
  S.xr = xr;

  // painel de controle (fica sobre o canvas; entra no re-home)
  var xrPanel = document.createElement('div');
  xrPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:5;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.96);border:1px solid #24435f;border-radius:12px;padding:12px 13px;color:#dbe8f5;font-size:12px;width:250px;max-height:78vh;overflow:auto';
  host.appendChild(xrPanel);
  S.xrPanel = xrPanel;
  // HUD imersivo (joystick + sair + mira) — some quando não está no modo
  var xrHud = document.createElement('div');
  xrHud.style.cssText = 'position:absolute;inset:0;z-index:6;display:none;pointer-events:none';
  // O toggle de ferramentas some enquanto o HUD imersivo está ativo (celular E desktop —
  // no celular o FAB sobreporia a barra de disciplina/medir/sair; no PC evita botão órfão
  // sobre o HUD; mudança intencional de comportamento no PC, v1.1.114).
  try {
    new MutationObserver(function () {
      if (S && S.barToggle) S.barToggle.style.visibility = (xrHud.style.display !== 'none') ? 'hidden' : '';
    }).observe(xrHud, { attributes: true, attributeFilter: ['style'] });
  } catch (eMo) {}
  host.appendChild(xrHud);
  S.xrHud = xrHud;

  function xrSupport(modo) { return !!(navigator.xr && navigator.xr.isSessionSupported) ? navigator.xr.isSessionSupported(modo).catch(function () { return false; }) : Promise.resolve(false); }

  function pintarXRPanel() {
    var box = new THREE.Box3().setFromObject(modelRoot);
    var vazio = box.isEmpty();
    var discs = disciplinasPresentes();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Realidade Mista / Virtual</b><button class="btn sm" data-x="fechar" title="Fechar painel">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>';
    if (vazio) { html += '<div style="font-size:11px;color:#9fb2c8">Carregue um modelo primeiro.</div>'; xrPanel.innerHTML = html; return; }
    if (!xr.on) {
      html += '<div style="font-size:11px;color:#9fb2c8">Veja o projeto no ambiente ou ande dentro dele. Escolha o modo:</div>' +
        '<button class="btn sm primary" data-x="camera" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Câmera + Projeto (ver no seu ambiente)</button>' +
        '<button class="btn sm" data-x="caminhar" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Caminhar no projeto (fundo liso)</button>' +
        '<button class="btn sm" data-x="ar" style="width:100%" disabled>' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA com âncora (Android) <span data-x="arst" style="color:#9fb2c8">(verificando…)</span></button>' +
        '<button class="btn sm" data-x="vr" style="width:100%" disabled>' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' VR imersivo <span data-x="vrst" style="color:#9fb2c8">(verificando…)</span></button>' +
        '<div style="font-size:11px;color:#9fb2c8;line-height:1.35">📷 <b>funciona no iPhone e Android</b>: liga a câmera e o projeto aparece no ambiente real — mova o celular pra olhar, joystick pra chegar perto (precisa HTTPS: use o link ' + (typeof Icones !== 'undefined' ? Icones.get('nuvem', 15) : '') + ' da nuvem). ' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA com âncora (fixa no chão) só no Android/ARCore.</div>';
    } else {
      var em = xr.mode === 'ar' ? '' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA no ambiente' : xr.mode === 'vr' ? '' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' VR imersivo' : xr.mode === 'camera' ? '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Câmera + Projeto' : '' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Caminhando';
      html += '<div style="font-size:11px;color:#7fe0a3"><b>' + em + '</b> ativo</div>';
      // escala — no AR de mesa (hit-test) e agora TAMBÉM no câmera/caminhar (1:1 real OU miniatura na sala)
      if (xr.mode === 'ar') {
        var ESCS = [['1', '1:1 (real)'], ['0.04', '1:25'], ['0.02', '1:50'], ['0.01', '1:100'], ['0.005', '1:200']];
        html += '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-x="esc" class="inp" style="width:120px">' +
          ESCS.map(function (o) { return '<option value="' + o[0] + '"' + (Math.abs(parseFloat(o[0]) - (xr.escala || 1)) < 1e-6 ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      } else {
        var real = (xr.escala || 1) >= 0.999;
        var ESCS2 = [['1', '1:1 real (andar dentro)'], ['fit', 'Caber na sala (auto)'], ['0.04', '1:25'], ['0.02', '1:50'], ['0.01', '1:100'], ['0.005', '1:200']];
        // seleção: 1:1 se real; senão a numérica mais próxima; senão "fit"
        var selNum = null; if (!real) { for (var _i = 2; _i < ESCS2.length; _i++) { if (Math.abs(parseFloat(ESCS2[_i][0]) - (xr.escala || 1)) < 1e-4) { selNum = ESCS2[_i][0]; break; } } }
        var selVal = real ? '1' : (selNum || 'fit');
        html += '<label style="display:flex;justify-content:space-between;align-items:center">Escala <select data-x="esc2" class="inp" style="width:150px">' +
          ESCS2.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === selVal ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
          '<div style="display:flex;gap:6px">' +
          '<button class="btn sm" data-x="centralizar" style="flex:1">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Centralizar</button>' +
          '<button class="btn sm" data-x="travarcam" style="flex:1">' + (xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Destravar' : '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Travar') + '</button></div>' +
          '<div style="font-size:11px;color:#9fb2c8;line-height:1.3">1:1 = andar DENTRO em tamanho real. Miniatura = ver o projeto inteiro na sua frente. ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' recoloca à frente; ' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' fixa no lugar.</div>';
      }
      // altura do corte de visão (reflete o valor atual — não reseta no repaint)
      var cf = (xr.cortefrac == null ? 1000 : xr.cortefrac);
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span>' + (typeof Icones !== 'undefined' ? Icones.get('corte', 15) : '') + ' Teto de visão</span><span data-x="cortev" style="color:#7fe0a3">' + (cf >= 999 ? 'inteiro' : '') + '</span></div>' +
        '<input type="range" data-x="corte" min="0" max="1000" value="' + cf + '" style="width:100%;accent-color:#22c55e">';
      // passos: sensibilidade (só caminhar/câmera — no AR a locomoção é do WebXR). Tablet precisa de mais
      // sensibilidade (movimento gentil); o usuário ajusta se não anda ou anda demais.
      if (xr.mode !== 'ar' && xr.mode !== 'vr') {
        var ps = Math.round(_passSens() * 100); // valor REAL (localStorage c/ fallback), não o default fixo — bate com o aplicado
        html += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span>' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Sensibilidade dos passos</span><span data-x="passv" style="color:#7fe0a3">' + (ps / 100).toFixed(1) + '×</span></div>' +
          '<input type="range" data-x="passsens" min="40" max="300" value="' + ps + '" style="width:100%;accent-color:#0d9488">' +
          '<div style="font-size:10.5px;color:#9fb2c8;line-height:1.25;margin-top:-2px">Ande com o aparelho na mão pra andar no projeto. Se o projeto não anda, <b>aumente</b>; se anda sozinho, <b>diminua</b>. (No tablet costuma precisar mais.)</div>';
      }
      // medir
      html += '<button class="btn sm" data-x="medir" style="width:100%">' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Medir na escala (toque 2 pontos)</button>';
      // disciplinas
      if (discs.length > 1) {
        html += '<div style="font-size:11px;color:#9fb2c8;margin-top:2px">Disciplinas (toque pra ligar/desligar):</div><div style="display:flex;flex-wrap:wrap;gap:5px">';
        discs.forEach(function (d) {
          var off = !!xr.discOcultas[d.chave];
          html += '<button class="btn sm" data-xd="' + esc(d.chave) + '" style="' + (off ? 'opacity:.45' : 'background:' + corAtiva() + ';color:#fff') + '">' + esc(d.nome) + '</button>';
        });
        html += '</div>';
      }
      if (xr.mode === 'ar') {
        html += '<button class="btn sm" data-x="travar" style="width:100%">' + (xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Destravar do ponto' : '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Travar neste ponto') + '</button>' +
          '<div style="font-size:11px;color:#9fb2c8;line-height:1.3">Aponte pro chão, toque pra fixar o projeto no lugar real; trave pra ele não sair do lugar.</div>';
      }
      html += '<button class="btn sm" data-x="sair" style="width:100%">⏹ Sair do imersivo</button>';
    }
    xrPanel.innerHTML = html;
    if (!xr.on && !vazio) {
      // habilita VR/AR conforme suporte real do aparelho
      xrSupport('immersive-vr').then(function (ok) { var b = xrPanel.querySelector('[data-x="vr"]'), st = xrPanel.querySelector('[data-x="vrst"]'); if (!b) return; b.disabled = !ok; if (st) st.textContent = ok ? '' : '(indisponível aqui)'; });
      xrSupport('immersive-ar').then(function (ok) { var b = xrPanel.querySelector('[data-x="ar"]'), st = xrPanel.querySelector('[data-x="arst"]'); if (!b) return; b.disabled = !ok; if (st) st.textContent = ok ? '' : '(precisa Android/ARCore)'; });
    }
  }
  function disciplinasPresentes() {
    var mapa = {};
    S.modelos.forEach(function (mo) { var d = (mo.disciplina || 'outros'); if (!mapa[d]) mapa[d] = { chave: d, nome: nomeDisc(d), n: 0 }; mapa[d].n += mo.elementos.length; });
    return Object.keys(mapa).map(function (k) { return mapa[k]; });
  }
  function nomeDisc(d) { var M = { arquitetura: 'Arquitetura', estrutura: 'Estrutura', hidraulica: 'Hidráulica', eletrica: 'Elétrica', mecanica: 'Mecânica', incendio: 'Incêndio', outros: 'Outros' }; return M[d] || (d.charAt(0).toUpperCase() + d.slice(1)); }

  function toggleXRPanel() {
    if (xrPanel.style.display === 'flex') { xrPanel.style.display = 'none'; return; }
    if (S._fecharPaineis) S._fecharPaineis(xrPanel);
    pintarXRPanel(); xrPanel.style.display = 'flex';
    if (S._ajustarTop) S._ajustarTop();
  }
  S._toggleXR = toggleXRPanel;

  // ---- qualidade: sombras só no imersivo e só se o modelo não for gigante ----
  function ligarSombras(on) {
    var tri = 0; S.modelos.forEach(function (mo) { tri += mo.nTri || 0; });
    if (on && tri > 1800000) return false; // modelo pesado: sombra travaria — segue sem
    dir.castShadow = !!on;
    todasMalhas(function (m) { if (m.geometry) { m.castShadow = !!on; m.receiveShadow = !!on; } });
    return true;
  }

  // ---- escala: só na RA de mesa (AR). Andar/VR é sempre 1:1 (escala real) — escalar o
  // modelRoot em torno da origem no Caminhar jogava a câmera pra fora do modelo (achado do gate).
  function aplicarEscalaXR(f) {
    if (xr.mode !== 'ar') { xr.escala = 1; return; } // AR de mesa tem seu próprio fluxo (hit-test)
    xr.escala = f || 1;
    if (xr.placed) posicionarModeloAR();
  }

  // ---- ESCALA + ÂNCORA no modo CÂMERA/CAMINHAR (iPhone/Android sem WebXR): 1:1 real (andar DENTRO)
  //      ou miniatura na sua frente. Escala em torno de uma ÂNCORA (ponto à frente), NÃO da origem —
  //      escalar na origem jogava a câmera pra fora do modelo (achado do gate). modelRoot fica na
  //      origem durante o imersivo (posOrig restaurado ao sair), então world = position + escala*local. ----
  var _imFwd = new THREE.Vector3(), _imC = new THREE.Vector3();
  function fitEscala() { // escala que faz o modelo caber ~2,2 m à frente (miniatura de sala)
    var b = xr.boxLocal; if (!b) return 0.02;
    var d = b.getSize(new THREE.Vector3()), maior = Math.max(d.x, d.y, d.z) || 1;
    return Math.max(0.002, Math.min(1, 2.2 / maior));
  }
  function posicionarNaFrente(dist) {
    var b = xr.boxLocal; if (!b) return;
    var s = xr.escala || 1;
    camera.getWorldDirection(_imFwd); _imFwd.y = 0; if (_imFwd.lengthSq() < 1e-6) _imFwd.set(0, 0, -1); _imFwd.normalize();
    var pisoY = camera.position.y - EYE; // chão sob os olhos (altura real do usuário)
    var ax = camera.position.x + _imFwd.x * dist, az = camera.position.z + _imFwd.z * dist;
    b.getCenter(_imC);
    modelRoot.position.set(ax - s * _imC.x, pisoY - s * b.min.y, az - s * _imC.z); // base-centro do modelo cai em (ax, pisoY, az)
    xr._pisoY = pisoY;
  }
  function aplicarEscalaImersivo(f) {
    if (xr.mode === 'ar') { aplicarEscalaXR(f); return; }
    if (!xr.on || !xr.boxLocal) return; // só no imersivo câmera/caminhar
    if (xr.travado) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra mudar a escala.'); pintarXRPanel(); return; } // repinta pro <select> voltar ao valor real
    xr.escala = f > 0 ? f : 1;
    modelRoot.scale.setScalar(xr.escala);
    if (xr.escala >= 0.999) { // 1:1 real: modelo nas coords locais, câmera no piso do centro (andar DENTRO)
      modelRoot.position.set(0, 0, 0);
      xr.boxLocal.getCenter(_imC);
      camera.position.set(_imC.x, xr.boxLocal.min.y + EYE, _imC.z);
      xr._pisoY = xr.boxLocal.min.y;
      xrDica('Escala real 1:1 — você está DENTRO do projeto. Vire o celular; ande com o joystick.');
    } else { // miniatura à frente (na sua sala)
      posicionarNaFrente(2.0);
      xrDica('Miniatura na sua frente. Vire o celular pra olhar; ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' recentraliza; joystick pra rodear.');
    }
    if (xr.cortefrac != null && xr.cortefrac < 999) aplicarTetoVisao(xr.cortefrac / 1000); // recalcula o teto de visão p/ a nova escala (senão o corte fica na altura de mundo antiga e some o modelo)
  }
  S._aplicarEscalaImersivo = aplicarEscalaImersivo;
  function centralizarProjeto() {
    if (xr.mode === 'ar') { if (!xr.travado) { xr.placed = false; xrDica('Aponte pro chão e toque pra fixar de novo.'); } else S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra reposicionar.'); return; }
    if (!xr.on || !xr.boxLocal) return; // simétrico com aplicarEscalaImersivo: fora do imersivo câmera/caminhar não faz nada
    if (xr.travado) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Destrave pra reposicionar.'); return; }
    if (xr.escala >= 0.999) { xr.boxLocal.getCenter(_imC); camera.position.set(_imC.x, xr.boxLocal.min.y + EYE, _imC.z); xr._pisoY = xr.boxLocal.min.y; }
    else posicionarNaFrente(2.0);
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Projeto recolocado à sua frente.');
  }
  S._centralizarImersivo = centralizarProjeto;
  // re-snapshot da âncora (boxLocal) quando modelos entram/saem DURANTE o imersivo câmera/caminhar —
  // senão centralizar/escala ancoram no bbox antigo. Se ficou sem geometria, sai do imersivo.
  function xrReSnap() {
    if (!xr.on || xr.mode === 'ar' || xr.mode === 'vr') return;
    var p = modelRoot.position.clone(), s = modelRoot.scale.clone();
    modelRoot.position.set(0, 0, 0); modelRoot.scale.setScalar(1); modelRoot.updateMatrixWorld(true);
    var b = new THREE.Box3().setFromObject(modelRoot);
    modelRoot.position.copy(p); modelRoot.scale.copy(s); modelRoot.updateMatrixWorld(true);
    if (b.isEmpty()) { sairImersivo(); return; }
    xr.boxLocal = b.clone();
    aplicarEscalaImersivo(xr.escala || 1); // reancora na escala corrente
  }
  S._xrReSnap = xrReSnap;

  // ---- teto de visão (corte horizontal que esconde o que está acima) ----
  function aplicarTetoVisao(frac) {
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    xr.cortefrac = Math.round(frac * 1000); // lembra a posição p/ o repaint não resetar
    var y = box.min.y + (box.max.y - box.min.y) * frac;
    var rot = xrPanel.querySelector('[data-x="cortev"]');
    if (frac >= 0.999) { var walk = (xr.mode !== 'ar' && xr.mode !== 'vr'); renderer.clippingPlanes = walk ? [] : (xr.prevClip || []); renderer.localClippingEnabled = walk ? false : xr.prevLocal; if (rot) rot.textContent = 'inteiro'; return; } // no Caminhar/Câmera "inteiro" = modelo inteiro (não reinstala o corte da planta)
    if (!xr.clip) xr.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    xr.clip.constant = y;
    renderer.localClippingEnabled = true; renderer.clippingPlanes = [xr.clip];
    if (rot) rot.textContent = fmtDist(Math.max(0, y - box.min.y) / (xr.escala || 1)) + ' do piso'; // metro REAL (divide pela escala do AR)
  }

  // ---- HUD: joystick de andar + mira + (no AR) barra de disciplina/medir/sair ----
  // No AR imersivo SÓ o dom-overlay (xrHud) aparece — o xrPanel de config fica invisível.
  // Então as ferramentas essenciais da obra (disciplina, medir, sair) vão pra CÁ.
  function montarHud(comReticulo) {
    // barra compacta de ferramentas SEMPRE (Caminhar E AR) — no celular o painel grande de config
    // tampa a vista, então as ações essenciais (disciplina/medir/ajustes/sair) ficam nesta barra.
    var discs = disciplinasPresentes();
    var chips = discs.length > 1 ? discs.map(function (d) { var off = !!xr.discOcultas[d.chave]; return '<button data-har="' + esc(d.chave) + '" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 11px;font-size:12px;color:#fff;background:' + (off ? 'rgba(90,110,130,.7)' : corAtiva()) + '">' + esc(d.nome) + '</button>'; }).join('') : '';
    var barra = '<div style="position:absolute;left:0;right:0;bottom:16px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:0 10px">' +
      chips +
      '<button data-har="centralizar" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;background:#2563eb;font-weight:600">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Centralizar</button>' +
      // Passos SÓ em Caminhar/Câmera (no AR a locomoção é do WebXR, o botão seria morto). Rótulo reflete
      // o estado REAL (listener ativo) — nunca mostra "on" sem sensor ligado (gate v1.1.93).
      (comReticulo ? '' : '<button data-har="passos" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;font-weight:600;background:' + ((xr._pass && xr._pass.on) ? '#0d9488' : 'rgba(90,110,130,.7)') + '">' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Passos: ' + ((xr._pass && xr._pass.on) ? 'on' : 'off') + '</button>') +
      '<button data-har="medir" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#0b1a2b;background:#7fe0a3;font-weight:600">' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Medir</button>' +
      '<button data-har="sistema" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;font-weight:600;background:' + (sisColor.on ? corAtiva() : '#334a63') + '">' + (typeof Icones !== 'undefined' ? Icones.get('paleta', 15) : '') + ' Sistemas</button>' +
      '<button data-har="ajustes" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;background:#334a63">' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ajustes</button>' +
      '<button data-har="sair" style="pointer-events:auto;border:0;border-radius:14px;padding:7px 12px;font-size:12px;color:#fff;background:#b91c1c">⏹ Sair</button></div>';
    xrHud.innerHTML =
      (comReticulo ? '' : '<div data-h="joy" style="position:absolute;left:16px;bottom:60px;width:108px;height:108px;border-radius:50%;background:rgba(20,40,64,.4);border:2px solid rgba(127,224,163,.5);pointer-events:auto;touch-action:none">' +
      '<div data-h="knob" style="position:absolute;left:31px;top:31px;width:46px;height:46px;border-radius:50%;background:rgba(127,224,163,.85)"></div></div>') +
      (comReticulo ? '<div style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #7fe0a3;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></div>' : '') +
      barra +
      (S._montarLegendaChips ? S._montarLegendaChips() : '') + // legenda de cores por sistema (só quando o modo está ligado)
      '<div style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;pointer-events:none"><div data-h="dica" style="margin-top:8px;background:rgba(11,26,43,.82);color:#dbe8f5;font-size:12px;padding:5px 12px;border-radius:20px;max-width:88%;text-align:center"></div></div>';
    xrHud.style.display = 'block';
    if (!comReticulo) ligarJoystick();
  }
  // cliques da barra (disciplina/medir/ajustes/sair) — no dom-overlay do imersivo
  xrHud.addEventListener('click', function (e) {
    var b = e.target.closest('[data-har]'); if (!b) return; var k = b.getAttribute('data-har');
    if (k === 'sair') sairImersivo();
    else if (k === 'centralizar') centralizarProjeto();
    else if (k === 'passos') {
      if (xr._passH) { xr._pass.on = !xr._pass.on; _syncPassosHud(xr._pass.on ? 'Andar com o celular na mão move você no projeto (por passos).' : 'Passos desligados — use o joystick.'); }
      else { ligarPassos(); } // sem listener (permissão negada/pendente) → re-tenta de fato em vez de mentir "on"
    }
    else if (k === 'medir') { xr.medir.on = !xr.medir.on; if (!xr.medir.on) limparMedirXR(); b.style.background = xr.medir.on ? '#f0b94a' : '#7fe0a3'; xrDica(xr.medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Toque em 2 pontos do modelo pra medir na escala.' : ''); } // limpa as medições ao desligar (paridade com o painel)
    else if (k === 'ajustes') { var aberto = xrPanel.style.display === 'flex'; if (aberto) { xrPanel.style.display = 'none'; } else { pintarXRPanel(); xrPanel.style.display = 'flex'; if (S._ajustarTop) S._ajustarTop(); } }
    else if (k === 'sistema') { if (S._setSistema) S._setSistema(!(S._sisColorOn && S._sisColorOn())); } // recolore por sistema; _sisImersivoSync remonta o HUD (botão + legenda)
    else { toggleDisciplinaXR(k); var off = !!xr.discOcultas[k]; b.style.background = off ? 'rgba(90,110,130,.7)' : corAtiva(); }
  });
  // atualiza SÓ o botão 🎨 + a legenda de chips do imersivo quando o modo por-sistema muda
  // (update cirúrgico, sem remontar o HUD inteiro — não reseta joystick nem o estado do 📏 Medir)
  S._sisImersivoSync = function () {
    if (!(xr.on && xrHud.style.display !== 'none')) return;
    var b = xrHud.querySelector('[data-har="sistema"]'); if (b) b.style.background = S._sisColorOn && S._sisColorOn() ? corAtiva() : '#334a63';
    var leg = xrHud.querySelector('[data-h="sisleg"]'); if (leg && leg.parentNode) leg.parentNode.removeChild(leg);
    if (S._sisColorOn && S._sisColorOn() && S._montarLegendaChips) { var html = S._montarLegendaChips(); if (html) xrHud.insertAdjacentHTML('beforeend', html); }
  };
  function xrDica(t) { var d = xrHud.querySelector('[data-h="dica"]'); if (d) d.textContent = t || ''; }
  // espelha no botão do HUD o estado REAL dos passos (listener ativo) — evita "on" mentiroso quando a
  // permissão de Movimento foi negada/está pendente no iOS (gate v1.1.93).
  function _syncPassosHud(dica) {
    var b = xrHud.querySelector('[data-har="passos"]');
    if (b) { var on = !!(xr._pass && xr._pass.on); b.textContent = '' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Passos: ' + (on ? 'on' : 'off'); b.style.background = on ? '#0d9488' : 'rgba(90,110,130,.7)'; }
    if (dica) xrDica(dica);
  }
  S._xrPassosHud = function (n) { var b = xrHud.querySelector('[data-har="passos"]'); if (b && xr._pass && xr._pass.on) b.textContent = '🚶 ' + n + ' passos'; };
  function ligarJoystick() {
    var joy = xrHud.querySelector('[data-h="joy"]'), knob = xrHud.querySelector('[data-h="knob"]');
    if (!joy) return;
    var ativo = false, cx = 60, cy = 60, R = 42;
    function set(px, py) {
      var dx = px - cx, dy = py - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      knob.style.left = (35 + dx) + 'px'; knob.style.top = (35 + dy) + 'px';
      xr.joy.x = dx / R; xr.joy.z = dy / R; // x=strafe, z=frente(-)/trás(+)
    }
    function pos(e) { var r = joy.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top]; }
    joy.addEventListener('pointerdown', function (e) { ativo = true; joy.setPointerCapture && joy.setPointerCapture(e.pointerId); var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
    joy.addEventListener('pointermove', function (e) { if (!ativo) return; var p = pos(e); set(p[0], p[1]); e.preventDefault(); });
    var solta = function () { ativo = false; xr.joy.x = 0; xr.joy.z = 0; knob.style.left = '35px'; knob.style.top = '35px'; };
    joy.addEventListener('pointerup', solta); joy.addEventListener('pointercancel', solta);
  }

  // ---- olhar arrastando (não-XR): drag no canvas gira a câmera ----
  var xrDrag = null;
  function xrPointerDown(e) { if (!xr.on || xr.mode === 'ar' || xr.mode === 'vr') return; if (xr.medir.on) { medirTocar(e); return; } xrDrag = { x: e.clientX, y: e.clientY }; }
  function xrPointerMove(e) {
    if (!xrDrag) return;
    if (xr.oriOk) { xr.oriYawOff -= (e.clientX - xrDrag.x) * 0.005; } // com giroscópio: arrastar na horizontal RECENTRALIZA (o pitch vem do aparelho)
    else { xr.look.yaw -= (e.clientX - xrDrag.x) * 0.005; xr.look.pitch -= (e.clientY - xrDrag.y) * 0.005; xr.look.pitch = Math.max(-1.4, Math.min(1.4, xr.look.pitch)); }
    xrDrag = { x: e.clientX, y: e.clientY };
  }
  function xrPointerUp() { xrDrag = null; }

  // ---- orientação do aparelho: giroscópio REAL por QUATERNION (fórmula do DeviceOrientationControls
  //      do three.js). O jeito antigo (só yaw a partir de alpha + pitch de beta) IGNORAVA gamma e a
  //      orientação da tela → a câmera "bugava" ao inclinar/girar o celular. Agora acompanha os 3 eixos. ----
  var _oriZee = new THREE.Vector3(0, 0, 1);
  var _oriEul = new THREE.Euler();
  var _oriQ0 = new THREE.Quaternion();
  var _oriQ1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° em X: a câmera aponta pra "fora" do fundo do aparelho
  var _oriYaw = new THREE.Quaternion(); // offset de recentragem (horizontal), aplicado em torno do Y do MUNDO
  var _oriUp = new THREE.Vector3(0, 1, 0);
  function _screenAngRad() { var a = 0; try { a = (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0); } catch (e) {} return (a || 0) * Math.PI / 180; }
  // iOS exige que DeviceOrientation/Motion.requestPermission rode DENTRO do gesto de toque. No modo
  // Câmera+Projeto, ligarOrientacao/ligarPassos só rodam depois do getUserMedia().then (gesto já
  // gasto) → sem isto os sensores NUNCA ligavam no iPhone (gate v1.1.93). Cacheamos a PROMISE do
  // pedido: _pedirSensores() a cria no toque; ligar* reusa a mesma promise (sem 2º requestPermission,
  // que o iOS rejeitaria como "já pendente"). Só limpa em não-granted, p/ permitir retry depois.
  function _permOri() {
    if (typeof DeviceOrientationEvent === 'undefined' || !DeviceOrientationEvent.requestPermission) return null; // Android/desktop: sem gate
    if (!xr._oriPromise) xr._oriPromise = DeviceOrientationEvent.requestPermission().then(function (p) { xr._oriPerm = p; if (p !== 'granted') xr._oriPromise = null; return p; }).catch(function () { xr._oriPromise = null; return 'denied'; });
    return xr._oriPromise;
  }
  function _permPasso() {
    if (typeof DeviceMotionEvent === 'undefined' || !DeviceMotionEvent.requestPermission) return null;
    if (!xr._passPromise) xr._passPromise = DeviceMotionEvent.requestPermission().then(function (p) { xr._passPerm = p; if (p !== 'granted') xr._passPromise = null; return p; }).catch(function () { xr._passPromise = null; return 'denied'; });
    return xr._passPromise;
  }
  function _pedirSensores() { _permOri(); _permPasso(); } // dispara AMBOS no gesto (usado pelo modo câmera)
  function ligarOrientacao() {
    if (xr.ori) return;
    function handler(ev) {
      if (ev.alpha == null && ev.beta == null && ev.gamma == null) return;
      var alpha = (ev.alpha || 0) * Math.PI / 180, beta = (ev.beta || 0) * Math.PI / 180, gamma = (ev.gamma || 0) * Math.PI / 180;
      _oriEul.set(beta, alpha, -gamma, 'YXZ');       // ordem canônica do device-orientation
      var q = xr.oriQuat || (xr.oriQuat = new THREE.Quaternion());
      q.setFromEuler(_oriEul);
      q.multiply(_oriQ1);                            // olhar pra frente (não pro céu)
      q.multiply(_oriQ0.setFromAxisAngle(_oriZee, -_screenAngRad())); // corrige retrato/paisagem
      // recentragem horizontal: gira o resultado em torno do Y do mundo pelo offset do usuário
      _oriYaw.setFromAxisAngle(_oriUp, xr.oriYawOff || 0);
      q.premultiply(_oriYaw);
      xr.oriOk = true;
    }
    var start = function () { window.addEventListener('deviceorientation', handler, true); xr.ori = true; xr._oriH = handler; xrDica('Vire e incline o celular pra olhar — o projeto acompanha. Joystick pra andar. Arraste na horizontal pra recentralizar.'); };
    var pr = _permOri();
    if (pr) { pr.then(function (p) { if (p === 'granted') start(); }); }
    else if (typeof DeviceOrientationEvent !== 'undefined') { start(); } // Android/desktop: sem requestPermission → liga direto
  }
  function desligarOrientacao() { if (xr.ori && xr._oriH) { window.removeEventListener('deviceorientation', xr._oriH, true); } xr.ori = false; xr.oriOk = false; xr.oriBase = null; }

  // ---- ANDAR POR PASSOS (acelerômetro): andar com o celular na mão → andar no projeto. iPhone/Android
  //      sem SLAM nativo — é APROXIMADO (detecção de passo), rotulado como "por passos". Cada passo move
  //      pra frente ~0,68 m na escala do mundo (na 1:1 = passo real dentro do projeto). Toggle no HUD. ----
  var _passLen = 0.68;
  function _passSens() { if (xr.passSens == null) { var v = 1.3; try { var s = parseFloat(localStorage.getItem('orcapro:bim:passSens')); if (s > 0) v = s; } catch (_) {} xr.passSens = Math.max(0.4, Math.min(3, v)); } return xr.passSens; }
  // detector de passo ADAPTATIVO (pura, testável): o limiar escala com o VIGOR do movimento (dev = média
  // do |dinâmico|) e tem piso BAIXO — o antigo `din>2.6` fixo não disparava com TABLET (movimento mais
  // gentil que o celular na mão). Pico com histerese (conta 1 por passo) + refratário. Retorna true no passo.
  function _passoDetecta(P, mag, now, sens) {
    P.ema = P.ema * 0.9 + mag * 0.1;                          // baseline SEMPRE EMA (P semeado c/ ema≈9.81 → sem transiente que engula os 1ºs passos)
    var din = mag - P.ema;                                    // parte dinâmica do passo
    P.dev = P.dev * 0.92 + Math.abs(din) * 0.08;              // vigor do movimento
    var thr = Math.max(0.55, P.dev * 1.4) / (sens || 1);      // limiar adaptativo (÷ sensibilidade do usuário)
    // dev>0.35: exige movimento REAL de translação — tremor/agito do aparelho parado não vira passo fantasma
    if (!P.up && din > thr && P.dev > 0.35 && (now - P.last) > 300) { P.up = true; P.last = now; P.n++; return true; }
    if (P.up && din < thr * 0.5) P.up = false;                // rearma ao descer (1 passo por pico)
    return false;
  }
  function ligarPassos() {
    if (xr._passH) return;
    xr._pass = { last: 0, ema: 9.81, dev: 0.2, up: false, on: false, n: 0 }; // baseline semeado (gravidade); 'on' só vira true quando o listener EXISTIR (start)
    function handler(ev) {
      if (!xr.on || !xr._pass || !xr._pass.on) return;
      var a = ev.accelerationIncludingGravity || ev.acceleration; if (!a) return;
      var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (_passoDetecta(xr._pass, mag, now, _passSens())) { xr._stepMove = (xr._stepMove || 0) + _passLen; if (S._xrPassosHud) S._xrPassosHud(xr._pass.n); } // pico → 1 passo pra frente
    }
    var start = function () { window.addEventListener('devicemotion', handler); xr._passH = handler; if (xr._pass) xr._pass.on = true; _syncPassosHud(); };
    var pr = _permPasso();
    if (pr) { pr.then(function (p) { if (p === 'granted') start(); else _syncPassosHud('📵 Passos precisam da permissão de Movimento (negada) — use o joystick.'); }); }
    else if (typeof DeviceMotionEvent !== 'undefined') { start(); } // Android/desktop: sem requestPermission → liga direto
  }
  function desligarPassos() { if (xr._passH) { try { window.removeEventListener('devicemotion', xr._passH); } catch (_) {} xr._passH = null; } xr._pass = null; xr._stepMove = 0; }
  S._xrStep = function () { xr._stepMove = (xr._stepMove || 0) + _passLen; }; // hook de teste: simula 1 passo
  S._passSensSet = function (v) { v = Math.max(0.4, Math.min(3, +v || 1)); xr.passSens = v; try { localStorage.setItem('orcapro:bim:passSens', String(v)); } catch (_) {} return v; };
  S._xrSimPassos = function (mags) { // hook de teste: alimenta uma sequência de magnitudes e conta os passos
    var P = { last: -9999, ema: 9.81, dev: 0.2, up: false, n: 0 }, i, t = 0, passos = 0;
    for (i = 0; i < mags.length; i++) { t += 60; if (_passoDetecta(P, mags[i], t, _passSens())) passos++; }
    return passos;
  };

  // ---- passo de andar (roda todo frame via S._xrWalk) ----
  var _xrFwd = new THREE.Vector3(), _xrRight = new THREE.Vector3(), _xrUp = new THREE.Vector3(0, 1, 0);
  function xrWalkStep(dt) {
    if (xr.mode === 'vr') { xrVRLoco(dt); return; }
    // câmera olha conforme o giroscópio (quaternion real) OU, sem giroscópio (desktop/permissão negada),
    // pelo arraste (yaw/pitch). No AR a câmera é da sessão, só nudge no plano.
    if (xr.mode !== 'ar') {
      if (xr.oriOk && xr.oriQuat) { camera.quaternion.copy(xr.oriQuat); }
      else { var e = new THREE.Euler(xr.look.pitch, xr.look.yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(e); }
      // PASSOS: andou com o celular na mão → anda pra frente no projeto (independe do joystick).
      // Só zera o acumulador quando REALMENTE aplica (olhando ~reto p/ cima/baixo o fwd horizontal some →
      // adia o passo pro próximo frame com direção válida, em vez de descartá-lo). (gate v1.1.95)
      if (xr._stepMove) { camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; if (_xrFwd.lengthSq() > 1e-6) { var sm = xr._stepMove; xr._stepMove = 0; _xrFwd.normalize(); camera.position.addScaledVector(_xrFwd, sm); camera.position.y = xr._pisoY + EYE; } }
    }
    var mv = xr.joy.x * xr.joy.x + xr.joy.z * xr.joy.z;
    if (mv < 0.0009) return;
    camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; _xrFwd.normalize();
    _xrRight.crossVectors(_xrFwd, _xrUp).normalize();
    var vel = 1.4 * dt; // ~caminhada humana (m/s), em unidades de mundo já escaladas
    var alvo = new THREE.Vector3();
    alvo.addScaledVector(_xrFwd, -xr.joy.z * vel).addScaledVector(_xrRight, xr.joy.x * vel);
    if (xr.mode === 'ar') { modelRoot.position.sub(alvo); } // no AR movo o MODELO (a câmera é do device)
    else { camera.position.add(alvo); camera.position.y = xr._pisoY + EYE; } // altura REAL do olho (não escala com a miniatura)
  }
  function xrVRLoco(dt) {
    try {
      var s = renderer.xr.getSession(); if (!s) return;
      s.inputSources.forEach(function (src) {
        if (!src.gamepad || !src.handedness) return;
        var ax = src.gamepad.axes || [];
        var x = ax[2] || ax[0] || 0, y = ax[3] || ax[1] || 0;
        if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) return;
        if (src.handedness === 'left') {
          camera.getWorldDirection(_xrFwd); _xrFwd.y = 0; _xrFwd.normalize(); _xrRight.crossVectors(_xrFwd, _xrUp).normalize();
          var v = 1.6 * dt, mov = new THREE.Vector3(); mov.addScaledVector(_xrFwd, -y * v).addScaledVector(_xrRight, x * v);
          xrRig.position.add(mov);
        } else if (src.handedness === 'right' && Math.abs(x) > 0.6) {
          if (!xr._snapT || performance.now() - xr._snapT > 300) { xrRig.rotation.y -= (x > 0 ? 1 : -1) * Math.PI / 6; xr._snapT = performance.now(); }
        }
      });
    } catch (_) {}
  }

  // rig de VR: a câmera XR fica dentro dele; mover/girar o rig = teletransporte suave
  var xrRig = new THREE.Group(); scene.add(xrRig);

  // ---- ENTRAR: Caminhar / Câmera (universal, sem WebXR) ----
  // modo 'caminhar' = modelo em fundo liso; modo 'camera' = modelo POR CIMA do vídeo da câmera
  // (RA simples que roda no iPhone: giroscópio olha, joystick anda, o projeto aparece no ambiente).
  function iniciarAndar(modo) {
    if (xr.on) return; // guarda de reentrada: 2ª entrada (toque duplo 📷/👣) capturaria posOrig JÁ deslocado → modelo torto no 3D ao sair (gate v1.1.92)
    if (!modelRoot.children.length) { S._hint('Carregue um modelo primeiro.'); return; }
    // trabalha no frame LOCAL (modelRoot na origem) p/ a escala ancorar certo; posOrig restaurado ao sair
    xr.posOrig = modelRoot.position.clone();
    modelRoot.position.set(0, 0, 0); modelRoot.scale.setScalar(1); modelRoot.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) { modelRoot.position.copy(xr.posOrig); S._hint('Modelo sem geometria visível.'); return; }
    xr.boxLocal = box.clone();
    xr.on = true; xr.mode = modo; xr.escala = 1; xr.cortefrac = 1000;
    xr.oriYawOff = 0; xr.oriOk = false; xr.travado = false;
    xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone(), near: camera.near, far: camera.far };
    xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled;
    renderer.clippingPlanes = []; renderer.localClippingEnabled = false; // Caminhar/Câmera entram INTEIROS; Planta/Corte ativos NÃO vazam (prevClip volta no sair)
    orbit.enabled = false; if (S.fly && S.fly.on && S._setMode) S._setMode(false);
    ligarSombras(true);
    var c = box.getCenter(new THREE.Vector3());
    camera.near = 0.02; camera.far = 5000;
    camera.quaternion.identity(); // olhar pra frente (-Z) até o giroscópio assumir
    if (modo === 'camera') { camera.position.set(0, box.min.y + EYE, 0); xr._pisoY = box.min.y; }
    else { camera.position.set(c.x, box.min.y + EYE, c.z); xr._pisoY = box.min.y; } // caminhar: dentro, 1:1
    camera.updateProjectionMatrix();
    xr.look.yaw = 0; xr.look.pitch = 0; xr.joy.x = 0; xr.joy.z = 0; // zera o joystick (senão anda sozinho na reentrada)
    S._xrWalk = xrWalkStep;
    montarHud(false);
    if (typeof DeviceOrientationEvent !== 'undefined') ligarOrientacao();
    ligarPassos(); // andar com o celular na mão → andar no projeto (por passos)
    canvasEl.addEventListener('pointerdown', xrPointerDown); canvasEl.addEventListener('pointermove', xrPointerMove); window.addEventListener('pointerup', xrPointerUp);
    marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none';
    // câmera: começa como MINIATURA na frente (vê o projeto inteiro na sala); caminhar: 1:1 DENTRO
    if (modo === 'camera') { aplicarEscalaImersivo(fitEscala()); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Projeto no seu ambiente. Vire o celular pra olhar; ' + (typeof Icones !== 'undefined' ? Icones.get('ajustes', 15) : '') + ' Ajustes p/ escala (1:1 = andar dentro) e ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Centralizar. ⏹ Sair.'); }
    else { xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Você está DENTRO em escala real 1:1. Vire o celular pra olhar; joystick pra andar.'); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Dentro do projeto 1:1. Vire o celular; joystick pra andar. ⏹ Sair.'); }
  }
  function entrarCaminhar() { iniciarAndar('caminhar'); }
  // ---- ENTRAR: Câmera + Projeto (RA simples: vídeo da câmera de fundo + modelo por cima) ----
  function entrarCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Este navegador não dá acesso à câmera.'); return; }
    // câmera só em contexto seguro (HTTPS ou localhost) — regra do navegador. No QR da rede local (http) não rola.
    // (fix v1.1.90: o regex antigo `^https:$` NUNCA batia em "https://host" — bloqueava a câmera em TODO HTTPS, inclusive o link da nuvem)
    var h = location.hostname;
    var origemSegura = (location.protocol === 'https:') || (typeof window.isSecureContext !== 'undefined' && window.isSecureContext) || h === 'localhost' || h === '127.0.0.1' || h === '::1' || /\.localhost$/.test(h);
    if (!origemSegura) {
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' A câmera só abre por HTTPS. Use o link ' + (typeof Icones !== 'undefined' ? Icones.get('nuvem', 15) : '') + ' da nuvem (ou rode no próprio computador).');
      return;
    }
    if (xr.on || xr._camPend) return; // já imersivo ou pedido de câmera em voo: ignora toque duplo (senão orfã stream + corrompe posOrig)
    xr._camPend = true;
    _pedirSensores(); // AINDA no gesto do toque: concede giroscópio+passos p/ o iPhone (o getUserMedia().then já gastaria o gesto)
    S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Pedindo acesso à câmera…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
      xr._camPend = false;
      if (xr.on) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} return; } // usuário já entrou em outro modo enquanto pedíamos a câmera → descarta o stream
      xr.stream = stream;
      var v = document.createElement('video');
      v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.autoplay = true;
      v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;background:#000';
      v.srcObject = stream; host.insertBefore(v, host.firstChild); xr.video = v; try { v.play(); } catch (_) {}
      canvasEl.style.position = 'relative'; canvasEl.style.zIndex = '1'; canvasEl.style.background = 'transparent';
      iniciarAndar('camera');
    }).catch(function (e) {
      xr._camPend = false;
      var nm = (e && e.name) || e;
      S._hint(nm === 'NotAllowedError' ? '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Você negou a câmera. Toque de novo e permita.' : '' + (typeof Icones !== 'undefined' ? Icones.get('camera', 15) : '') + ' Não consegui abrir a câmera: ' + nm);
    });
  }
  function limparCamera() {
    if (xr.stream) { try { xr.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} xr.stream = null; }
    if (xr.video) { try { xr.video.pause(); xr.video.srcObject = null; if (xr.video.parentNode) xr.video.parentNode.removeChild(xr.video); } catch (_) {} xr.video = null; }
    try { canvasEl.style.zIndex = ''; canvasEl.style.background = ''; } catch (_) {}
  }

  // ---- ENTRAR: VR imersivo (WebXR) ----
  function entrarVR() {
    if (!navigator.xr) return;
    var box = new THREE.Box3().setFromObject(modelRoot); if (box.isEmpty()) return;
    navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (session) {
      xr.on = true; xr.mode = 'vr'; xr.session = session; xr.escala = 1;
      xr.cam = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
      xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled; // preserva Planta/Corte ativos
      xr.joy.x = 0; xr.joy.z = 0;
      S._xrWalk = xrWalkStep; // locomoção (analógico → xrVRLoco) roda no xrLoop
      ligarSombras(true);
      var c = box.getCenter(new THREE.Vector3());
      xrRig.position.set(c.x, box.min.y, c.z); xrRig.rotation.set(0, 0, 0);
      renderer.xr.setReferenceSpaceType('local-floor');
      xrRig.add(camera); // câmera XR dentro do rig → mover o rig te leva pelo modelo
      renderer.xr.setSession(session).then(function () {
        if (!xr.on) return; // sessão já encerrada antes deste callback (Esc/tirou o headset) — não ressuscita o loop
        /* ⚠ AS COTAS SAEM ANTES DO IMERSIVO. A ancora vem do `aabb`, que e foto
           do carregamento; no RA/RV o `modelRoot` e transladado e escalado, e
           `_tickExtra` continua rodando la dentro (o laco do XR o re-executa).
           Sem isto, as cotas flutuam soltas no meio do ambiente, com
           `depthTest` desligado, e `sairImersivo` nao as conhece. */
        if (S._setCota && S._cotaEstado && S._cotaEstado().on) S._setCota(false);
        xr._xrActivePrev = S._xrActive; S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        renderer.setAnimationLoop(xrLoop);
      }).catch(function (e) { sairImersivo(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Falha ao iniciar a sessão VR: ' + (e && e.message || e)); });
      session.addEventListener('end', sairImersivo);
      marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none'; // no imersivo o painel grande some (tampava a vista no celular); ⚙️ Ajustes reabre
    }).catch(function (e) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('vr', 15) : '') + ' Não deu pra entrar em VR: ' + (e && e.message || e)); });
  }

  // ---- ENTRAR: RA no ambiente (WebXR immersive-ar, Android) ----
  function entrarAR() {
    if (!navigator.xr) return;
    montarHud(true); // dom-overlay usa o xrHud
    navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: xrHud } }).then(function (session) {
      xr.on = true; xr.mode = 'ar'; xr.session = session; xr.placed = false; xr.travado = false;
      xr.modelSnap = { pos: modelRoot.position.clone(), quat: modelRoot.quaternion.clone(), scale: modelRoot.scale.clone() };
      xr.prevClip = renderer.clippingPlanes; xr.prevLocal = renderer.localClippingEnabled; // preserva Planta/Corte ativos
      xr.joy.x = 0; xr.joy.z = 0;
      S._xrWalk = xrWalkStep; // nudge do joystick no modo AR roda no xrLoop
      modelRoot.visible = false; // só aparece após colocar
      ligarSombras(true);
      // retículo de colocação
      if (!xr.reticle) {
        var g = new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2);
        xr.reticle = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x7fe0a3 }));
        xr.reticle.matrixAutoUpdate = false; xr.reticle.visible = false; scene.add(xr.reticle);
      }
      renderer.xr.setReferenceSpaceType('local');
      renderer.xr.setSession(session).then(function () {
        if (!xr.on) return; // sessão já encerrada antes deste callback
        S._xrActive = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        session.requestReferenceSpace('viewer').then(function (vs) {
          session.requestHitTestSource({ space: vs }).then(function (src) { if (xr.on) xr.hitSrc = src; else { try { src.cancel(); } catch (_) {} } });
        });
        renderer.setAnimationLoop(xrLoop);
      }).catch(function (e) { sairImersivo(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' Falha ao iniciar a sessão RA: ' + (e && e.message || e)); });
      // toque no AR: mede (se a régua estiver ligada) ou fixa o projeto
      session.addEventListener('select', function () { if (xr.medir.on && xr.placed) medirTocar({}); else arColocar(); });
      session.addEventListener('end', sairImersivo);
      xrDica('Aponte a câmera pro chão e toque na tela pra fixar o projeto.');
      marcarBtnXR(true); pintarXRPanel(); xrPanel.style.display = 'none'; // no imersivo o painel grande some (tampava a vista no celular); ⚙️ Ajustes reabre
    }).catch(function (e) { xrHud.style.display = 'none'; S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA indisponível neste aparelho: ' + (e && e.message || e)); });
  }
  function arColocar() {
    if (xr.travado || !xr.reticle || !xr.reticle.visible) return;
    xr._anchorMat = xr.reticle.matrix.clone();
    xr.placed = true; modelRoot.visible = true;
    posicionarModeloAR();
    xrDica('Projeto fixado. Ande em volta! Trave no painel pra ele não sair do lugar.');
    pintarXRPanel();
  }
  function posicionarModeloAR() {
    if (!xr._anchorMat) return;
    var box = new THREE.Box3().setFromObject(modelRoot); // em coords atuais
    var p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    xr._anchorMat.decompose(p, q, s);
    modelRoot.scale.setScalar(xr.escala || 1);
    // apoia a BASE do modelo no ponto do chão
    var box0 = new THREE.Box3().setFromObject(modelRoot);
    modelRoot.position.set(0, 0, 0);
    var min = box0.min.clone();
    modelRoot.position.set(p.x - (box0.getCenter(new THREE.Vector3()).x), p.y - min.y, p.z - (box0.getCenter(new THREE.Vector3()).z));
    modelRoot.quaternion.copy(q);
  }

  // ---- loop XR (VR/AR): dt + locomoção + hit-test + render ----
  function xrLoop(t, frame) {
    if (!S || !S.alive) { renderer.setAnimationLoop(null); return; }
    var dt = Math.min(clock.getDelta(), 0.1);
    if (S._xrWalk) S._xrWalk(dt);
    if (xr.mode === 'ar' && frame && xr.hitSrc && !xr.travado) {
      try {
        var ref = renderer.xr.getReferenceSpace(), hits = frame.getHitTestResults(xr.hitSrc);
        if (hits.length) { var pose = hits[0].getPose(ref); if (pose) { xr.reticle.visible = !xr.placed; xr.reticle.matrix.fromArray(pose.transform.matrix); } }
        else xr.reticle.visible = false;
      } catch (_) {}
    }
    for (var i = 0; i < S._tickExtra.length; i++) { try { S._tickExtra[i](dt); } catch (_) {} }
    renderer.render(scene, camera);
  }

  // ---- medir na escala (2 toques) ----
  function medirTocar(e) {
    var r = canvasEl.getBoundingClientRect();
    var mx = (((e.clientX != null ? e.clientX : r.left + r.width / 2) - r.left) / r.width) * 2 - 1;
    var my = -((((e.clientY != null ? e.clientY : r.top + r.height / 2) - r.top) / r.height) * 2 - 1);
    ray.setFromCamera({ x: mx, y: my }, camera);
    var hit = primeiroHit(ray.intersectObjects(modelRoot.children, true));
    if (!hit) { xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Mire numa superfície do modelo.'); return; }
    xr.medir.pts.push(hit.point.clone());
    var m = pontoMarca(hit.point.clone()); scene.add(m); xr.medir.objs.push(m); rescaleObj(m);
    if (xr.medir.pts.length === 2) {
      var a = xr.medir.pts[0], b = xr.medir.pts[1];
      var dReal = a.distanceTo(b) / (xr.escala || 1); // divide pela escala → metros reais
      var ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x7fe0a3, depthTest: false }));
      ln.renderOrder = 998; scene.add(ln); xr.medir.objs.push(ln);
      var lab = labelSprite(fmtDist(dReal)); lab.position.copy(a.clone().add(b).multiplyScalar(0.5)); scene.add(lab); xr.medir.objs.push(lab); rescaleObj(lab);
      xrDica('📏 ' + fmtDist(dReal) + ' (real). Toque 2 pontos pra medir de novo.');
      xr.medir.pts = [];
    } else xrDica('' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Agora toque no 2º ponto.');
  }
  function limparMedirXR() { xr.medir.objs.forEach(function (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); }); xr.medir.objs = []; xr.medir.pts = []; }

  // ---- disciplina: liga/desliga MODELOS por disciplina ----
  function toggleDisciplinaXR(chave) {
    xr.discOcultas[chave] = !xr.discOcultas[chave];
    S.modelos.forEach(function (mo) { if ((mo.disciplina || 'outros') === chave) mo.grupo.visible = !xr.discOcultas[chave] && mo.visivel !== false; });
    pintarXRPanel();
  }

  // ---- SAIR: restaura tudo ----
  function sairImersivo() {
    if (!xr.on) return;
    var eraVR = xr.mode === 'vr', eraAR = xr.mode === 'ar';
    xr.on = false;
    if (xr.hitSrc) { try { xr.hitSrc.cancel(); } catch (_) {} }
    if (xr.session) { try { xr.session.end(); } catch (_) {} }
    xr.session = null; xr.hitSrc = null; xr.joy.x = 0; xr.joy.z = 0; xr.cortefrac = 1000;
    limparCamera(); // para a câmera + remove o vídeo de fundo (modo 📷)
    S._xrActive = false; S._xrWalk = null;
    try { renderer.setAnimationLoop(null); } catch (_) {}
    if (xr.reticle) xr.reticle.visible = false;
    if (eraVR) { scene.add(camera); xrRig.remove(camera); } // devolve a câmera à cena
    // restaura modelo (escala/posição do AR) e disciplinas
    modelRoot.visible = true;
    modelRoot.scale.setScalar(1);
    if (xr.modelSnap) { modelRoot.position.copy(xr.modelSnap.pos); modelRoot.quaternion.copy(xr.modelSnap.quat); modelRoot.scale.copy(xr.modelSnap.scale); xr.modelSnap = null; }
    else if (xr.posOrig) { modelRoot.position.copy(xr.posOrig); } // câmera/caminhar movem o modelRoot p/ a origem — devolve a posição real
    xr.posOrig = null; xr.boxLocal = null;
    S.modelos.forEach(function (mo) { mo.grupo.visible = mo.visivel !== false; }); xr.discOcultas = {};
    ligarSombras(false);
    limparMedirXR(); xr.medir.on = false;
    desligarOrientacao(); desligarPassos();
    renderer.clippingPlanes = xr.prevClip || []; renderer.localClippingEnabled = xr.prevLocal;
    canvasEl.removeEventListener('pointerdown', xrPointerDown); canvasEl.removeEventListener('pointermove', xrPointerMove); window.removeEventListener('pointerup', xrPointerUp);
    xrHud.style.display = 'none'; xrHud.innerHTML = '';
    if (xr.cam) { camera.position.copy(xr.cam.pos); if (xr.cam.quat) camera.quaternion.copy(xr.cam.quat); if (xr.cam.near) { camera.near = xr.cam.near; camera.far = xr.cam.far; camera.updateProjectionMatrix(); } xr.cam = null; }
    orbit.enabled = true; orbit.update();
    xr.escala = 1; xr.mode = null; xr.placed = false; xr.travado = false;
    marcarBtnXR(false); pintarXRPanel();
    if (S._retomarTick) S._retomarTick();
    S._hint('');
  }
  S._sairImersivo = sairImersivo;
  function marcarBtnXR(on) { var b = bar.querySelector('[data-b="xr"]'); if (b) { b.style.background = on ? corAtiva() : ''; b.style.color = on ? '#fff' : ''; } }

  xrPanel.addEventListener('click', function (e) {
    var bd = e.target.closest('[data-xd]'); if (bd) { toggleDisciplinaXR(bd.getAttribute('data-xd')); return; }
    var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
    if (k === 'fechar') { xrPanel.style.display = 'none'; }
    else if (k === 'camera') { entrarCamera(); }
    else if (k === 'caminhar') { entrarCaminhar(); }
    else if (k === 'vr') { entrarVR(); }
    else if (k === 'ar') { entrarAR(); }
    else if (k === 'sair') { sairImersivo(); }
    else if (k === 'travar') { xr.travado = !xr.travado; if (xr.reticle) xr.reticle.visible = false; pintarXRPanel(); }
    else if (k === 'centralizar') { centralizarProjeto(); }
    else if (k === 'travarcam') { xr.travado = !xr.travado; S._hint(xr.travado ? '' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Projeto travado no lugar.' : '' + (typeof Icones !== 'undefined' ? Icones.get('destravado', 15) : '') + ' Projeto liberado — dá pra reposicionar/escalar.'); pintarXRPanel(); }
    else if (k === 'medir') { xr.medir.on = !xr.medir.on; if (!xr.medir.on) limparMedirXR(); xrDica(xr.medir.on ? '' + (typeof Icones !== 'undefined' ? Icones.get('medir', 15) : '') + ' Toque 2 pontos do modelo pra medir na escala.' : ''); b.style.background = xr.medir.on ? corAtiva() : ''; b.style.color = xr.medir.on ? '#fff' : ''; }
  });
  xrPanel.addEventListener('change', function (e) {
    var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
    if (k === 'esc') aplicarEscalaXR(parseFloat(b.value) || 1);
    else if (k === 'esc2') { var v = b.value; aplicarEscalaImersivo(v === 'fit' ? fitEscala() : (parseFloat(v) || 1)); }
  });
  xrPanel.addEventListener('input', function (e) {
    var b = e.target.closest('[data-x]'); if (!b) return; var k = b.getAttribute('data-x');
    if (k === 'corte') aplicarTetoVisao((+b.value) / 1000);
    else if (k === 'passsens') { var v = S._passSensSet((+b.value) / 100); var lab = xrPanel.querySelector('[data-x="passv"]'); if (lab) lab.textContent = v.toFixed(1) + '×'; }
  });

  // ============================================================
  // 🏗 2D→3D (Fase C.1) — reconstrução ASSISTIDA a partir de DXF: o parser
  // (js/dxf.js) lê a planta, o detector (js/planta3d.js) PROPÕE paredes por
  // pares de linhas paralelas, o usuário confirma/desliga no preview e o
  // viewer extruda como MODELO SINTÉTICO (QTO/4D/clash/parede-cebola ganham
  // de graça). Honesto: volumetria de ESTUDO — não substitui projeto.
  // ============================================================
  var p3dSeq = 0;
  function carregarSintetico(caixas, nome) {
    caixas = caixas || [];
    if (!caixas.length) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Nenhuma parede ligada pra gerar.'); return null; }
    if (S.modelos.length >= 8) { S._hint('Limite de 8 modelos abertos — remova um antes.'); return null; }
    var mid = 'p3d' + (++p3dSeq);
    var modelo = { mid: mid, sintetico: true, nome: nome || ('Planta 2D→3D (' + caixas.length + ' paredes)'), disciplina: 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: { IFCWALL: caixas.length }, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
    modelo.grupo.userData.mid = mid;
    modelRoot.add(modelo.grupo);
    var mat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, metalness: .05, roughness: .85, side: THREE.DoubleSide });
    modelo.matCache.parede = mat;
    caixas.forEach(function (c, i) {
      var g = new THREE.BoxGeometry(c.comprimento, c.altura, c.espessura);
      var m = new THREE.Mesh(g, mat);
      m.position.set(c.cx, c.cy, c.cz); m.rotation.y = c.rotY;
      m.userData.expressID = c.id != null ? c.id : (i + 1); m.userData.tipo = 'IFCWALL'; m.userData.mid = mid; m.userData.matOrig = mat;
      modelo.grupo.add(m);
      S.meshPorId[m.userData.expressID] = m; S.meshPorUid[mid + ':' + m.userData.expressID] = m;
      modelo.nTri += 12;
      // qto REAL da parede (área de 1 face; a Parede-Cebola/QTO consomem daqui — nada estimado por caixa)
      modelo.qto[m.userData.expressID] = { comprimento: c.comprimento, area: c.area, volume: +(c.comprimento * c.altura * c.espessura).toFixed(4), contagem: 1 };
      modelo.elementos.push({ id: m.userData.expressID, uid: mid + ':' + m.userData.expressID, mid: mid, arquivo: modelo.nome, tipo: 'IFCWALL', nome: 'Parede ' + (i + 1) + ' (' + c.comprimento.toFixed(2).replace('.', ',') + ' m)', etapa: null, codOrc: null, qto: modelo.qto[m.userData.expressID], disciplina: 'arquitetura' });
      modelo.nEl++;
    });
    S.modelos.push(modelo);
    recarimbarIdentidade();   /* B0: 2D->3D e sintetico, GlobalId proprio */
    agregarModelo(modelo);    /* B2 */
    carimbarConsulta();     /* B3 */
    // AABB mundo por elemento (clash/QTO)
    try {
      modelRoot.updateMatrixWorld(true);
      modelo.grupo.children.forEach(function (m) {
        var bb = new THREE.Box3().setFromObject(m);
        var elx = modelo.elementos.filter(function (e) { return e.id === m.userData.expressID; })[0];
        if (elx && !bb.isEmpty()) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
      });
    } catch (_) {}
    over.style.display = 'none';
    atualizarHud();
    if (planta.on) setPlanta(false);
    if (corteL.on) setCorteL(false);
    enquadrar();
    S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
    if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
    if (S._editReaplicarRem) S._editReaplicarRem(); // removidos da edição valem pro sintético recém-chegado
    notifyModelos();
    if (S._xrReSnap) S._xrReSnap(); // se chegou modelo durante o imersivo, re-ancora (o enquadrar() acima é ignorado no imersivo)
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    return mid;
  }
  S._carregarSintetico = carregarSintetico;

  // ============================================================
  // ✏️ EDITOR — cria/edita volumetria SINTÉTICA no viewer (motor puro:
  // js/bimedit.js; ops serializáveis, undo por REPLAY determinístico).
  // Honestidade RA: o que nasce aqui é "sintético (criado no OrçaPRO)"
  // com QTO exato das peças; elemento de IFC importado NUNCA é alterado —
  // "apagar" IFC apenas OCULTA marcado como removido na edição.
  // ============================================================
  var edit = { on: false, sub: null, p1: null, prov: null, ops: [], seq: 0,
               /* espLaje separado de esp de propósito: a espessura do TIPO DE
                  PAREDE (bloco + revestimento das duas faces) não tem relação
                  nenhuma com a espessura do piso. Compartilhar o campo fazia a
                  laje nascer com 19,7 cm em vez de 15 — 31% de concreto a mais,
                  em silêncio, e a espessura do piso virava função do reboco. */
               moverId: null, moverMesh: null, esp: 0.15, espLaje: 0.15, alt: 2.8, secao: 0.2,
               base: 0, modelo: null, sprites: [], removidosAntes: [],
               // v1.1.82 — desenho estilo Revit: trava orto, ângulo predefinido (0=livre),
               // traço ENCADEADO (a próxima parede continua do fim da anterior) e o último
               // ponto ajustado do preview (direção p/ o input de distância)
               orto: false, angPre: 0, chain: true, pPrev: null, linhaProv: null };
  S.edit = edit;
  var editPanel = document.createElement('div');
  editPanel.style.cssText = 'position:absolute;left:10px;top:52px;z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:10px 12px;color:#dbe8f5;font-size:12px;width:280px;max-width:94%';
  editPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Editor <span style="color:#9fb2c8;font-weight:400">(sintético)</span></b><button class="btn sm" data-ed="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn sm" data-ed="parede">' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede</button>' +
    '<button class="btn sm" data-ed="laje">' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Laje</button>' +
    '<button class="btn sm" data-ed="pilar">' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Pilar</button>' +
    '<button class="btn sm" data-ed="mover">↔️ Mover</button>' +
    '<button class="btn sm" data-ed="apagar">' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Apagar</button>' +
    '<button class="btn sm" data-ed="anotar">' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Anotar</button></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    '<label style="display:flex;gap:4px;align-items:center">Esp. <input data-ed="esp" class="inp" type="number" value="0.15" step="0.01" min="0.05" max="1.0" style="width:56px"> m</label>' +
    '<label style="display:flex;gap:4px;align-items:center">Alt. <input data-ed="alt" class="inp" type="number" value="2.80" step="0.1" min="0.3" max="8" style="width:56px"> m</label>' +
    '<label style="display:flex;gap:4px;align-items:center">Pilar <input data-ed="secao" class="inp" type="number" value="0.20" step="0.05" min="0.1" max="1" style="width:56px"> m</label></div>' +
    '<input data-ed="txt" class="inp" placeholder="Texto da anotação (p/ ' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Anotar)" maxlength="200" style="width:100%">' +
    // v1.1.82 — controles de desenho estilo Revit (orto/ângulo/encadear)
    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
    '<button class="btn sm" data-ed="orto" title="Trava a parede na horizontal/vertical (ou segure Shift enquanto desenha)">⟂ Orto</button>' +
    '<button class="btn sm" data-ed="angpre" title="Ângulos predefinidos: livre → 45° → 15°">∠ Livre</button>' +
    '<button class="btn sm" data-ed="chain" title="A próxima parede continua do fim da anterior (Esc encerra a cadeia)">⛓ Encadear</button>' +
    '</div>' +
    '<div style="font-size:10.5px;color:#9fb2c8">' + (typeof Icones !== 'undefined' ? Icones.get('lampada', 15) : '') + ' Desenhando parede: digite a <b>distância</b> na caixinha junto ao cursor e Enter — igual no Revit.</div>' +
    '<div style="display:flex;gap:6px;align-items:center"><button class="btn sm" data-ed="undo">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Desfazer</button><span data-ed="st" style="color:#9fb2c8;font-size:11.5px"></span></div>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Volumetria SINTÉTICA de estudo, com QTO exato das peças criadas. Elemento de IFC importado nunca muda — "apagar" só o oculta como removido na edição.</div>';
  host.appendChild(editPanel);
  S.editPanel = editPanel; // re-home re-parenteia via S.* — fora da lista o painel fica órfão
  var editMats = null;
  function editMat(tipo) {
    if (!editMats) {
      editMats = {
        parede: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, metalness: .05, roughness: .85, side: THREE.DoubleSide }),
        laje: new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: .05, roughness: .9, side: THREE.DoubleSide }),
        pilar: new THREE.MeshStandardMaterial({ color: 0x7fa7d4, metalness: .1, roughness: .8, side: THREE.DoubleSide }),
        sel: new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x114422, metalness: .1, roughness: .6, side: THREE.DoubleSide })
      };
    }
    return editMats[tipo] || editMats.parede;
  }
  function editBase() {
    try {
      // só modelos IMPORTADOS ancoram o plano de trabalho — incluir o próprio modelo
      // do editor faria a laje (que cresce pra baixo) rebaixar a base a cada reentrada
      var bb = new THREE.Box3(), tem = false;
      S.modelos.forEach(function (mo) { if (mo.mid === 'edit' || !mo.grupo) return; bb.expandByObject(mo.grupo); tem = true; });
      return (!tem || bb.isEmpty()) ? 0 : bb.min.y;
    } catch (_) { return 0; }
  }
  // ponto no PLANO DE TRABALHO (y = base) quando o raio não acha malha —
  // permite desenhar no vazio (terreno limpo) e ao lado do modelo
  function editPontoPlano(clientX, clientY) {
    var rc = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rc.left) / rc.width) * 2 - 1; mouse.y = -((clientY - rc.top) / rc.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var alvo = new THREE.Vector3();
    var plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -edit.base); // y = base
    return ray.ray.intersectPlane(plano, alvo) ? alvo : null;
  }
  function editTirarProv() {
    if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
    edit.p1 = null;
    editPreviewLimpar();
  }
  // ---- v1.1.82: desenho estilo Revit ----
  // ajusta o 2º ponto pela trava orto (botão OU Shift) e pelos ângulos predefinidos
  function editAjustarPonto(p, ev) {
    if (!edit.p1 || !p || edit.sub !== 'parede') return p;
    var dx = p.x - edit.p1.x, dz = p.z - edit.p1.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-6) return p;
    var q = p.clone(); q.y = edit.p1.y;
    if (edit.orto || (ev && ev.shiftKey)) {
      if (Math.abs(dx) >= Math.abs(dz)) q.z = edit.p1.z; else q.x = edit.p1.x;
      return q;
    }
    if (edit.angPre > 0) {
      var passo = edit.angPre * Math.PI / 180;
      var a2 = Math.round(Math.atan2(dz, dx) / passo) * passo;
      q.x = edit.p1.x + dist * Math.cos(a2); q.z = edit.p1.z + dist * Math.sin(a2);
    }
    return q;
  }
  // preview vivo (rubber-band) + caixinha de distância junto ao cursor (padrão do snapMarca:
  // DOM fora da cena — nunca é clipado nem raycastado)
  var editDist = document.createElement('div');
  editDist.style.cssText = 'position:absolute;z-index:6;display:none;background:rgba(15,39,64,.95);border:1px solid #2FBF71;border-radius:8px;padding:3px 6px;color:#dbe8f5;font-size:12px;white-space:nowrap;pointer-events:auto';
  editDist.innerHTML = '<span data-edd="txt" style="font-weight:700;color:#7fe0a3"></span> <input data-edd="inp" inputmode="decimal" placeholder="m" style="width:52px;background:#0b1a2b;border:1px solid #24435f;border-radius:5px;color:#fff;font-size:12px;padding:1px 4px">';
  host.appendChild(editDist);
  S.editDist = editDist; // re-home
  function editPreviewLimpar() {
    if (edit.linhaProv) { scene.remove(edit.linhaProv); if (edit.linhaProv.geometry) edit.linhaProv.geometry.dispose(); edit.linhaProv = null; }
    edit.pPrev = null;
    editDist.style.display = 'none';
  }
  function editPreview(p, clientX, clientY) {
    if (!edit.p1 || !p) { editPreviewLimpar(); return; }
    edit.pPrev = p.clone();
    if (!edit.linhaProv) {
      if (!edit._linhaMat) edit._linhaMat = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false }); // 1 material vivo (sem leak por segmento)
      var g3 = new THREE.BufferGeometry().setFromPoints([edit.p1, p]);
      edit.linhaProv = new THREE.Line(g3, edit._linhaMat);
      edit.linhaProv.renderOrder = 999;
      scene.add(edit.linhaProv);
    } else {
      edit.linhaProv.geometry.setFromPoints([edit.p1, p]);
    }
    var d = Math.sqrt(Math.pow(p.x - edit.p1.x, 2) + Math.pow(p.z - edit.p1.z, 2));
    var rc2 = canvasEl.getBoundingClientRect();
    editDist.style.display = '';
    editDist.style.left = (clientX - rc2.left + 16) + 'px';
    editDist.style.top = (clientY - rc2.top + 12) + 'px';
    var tx = editDist.querySelector('[data-edd="txt"]');
    if (tx) tx.textContent = d.toFixed(2).replace('.', ',') + ' m';
  }
  // digitar a distância + Enter = parede com o comprimento EXATO na direção do preview
  editDist.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { // Esc DENTRO do input: encerra a cadeia (o stopPropagation não pode engolir)
      e.stopPropagation();
      var iEsc = editDist.querySelector('[data-edd="inp"]'); if (iEsc) { iEsc.value = ''; iEsc.blur(); }
      if (S._editFimCadeia) S._editFimCadeia();
      return;
    }
    e.stopPropagation(); // não aciona atalhos do viewer (WASD do voo etc.)
    if (e.key !== 'Enter') return;
    var inp2 = editDist.querySelector('[data-edd="inp"]');
    var num2 = parseFloat(String(inp2.value || '').replace(',', '.'));
    if (!(num2 > 0.01) || !edit.p1) return;
    var dir;
    if (edit.pPrev) {
      var ddx = edit.pPrev.x - edit.p1.x, ddz = edit.pPrev.z - edit.p1.z;
      var len = Math.sqrt(ddx * ddx + ddz * ddz);
      dir = len > 1e-6 ? { x: ddx / len, z: ddz / len } : { x: 1, z: 0 };
    } else dir = { x: 1, z: 0 };
    var p2 = new THREE.Vector3(edit.p1.x + dir.x * num2, edit.p1.y, edit.p1.z + dir.z * num2);
    inp2.value = '';
    editConcluirParede(p2);
  });
  // conclui a parede em p2 (2º clique OU distância digitada) com o traço ENCADEADO
  function editConcluirParede(p2) {
    var cxP = BimEdit.parede({ x: edit.p1.x, z: edit.p1.z }, { x: p2.x, z: p2.z }, edit.esp, edit.alt, edit.base);
    if (!cxP) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Pontos muito próximos — clique 2 pontos distintos.'); return; }
    editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cxP });
    var comp = cxP.comprimento.toFixed(2).replace('.', ',');
    if (edit.chain) {
      // encadeia: a próxima parede nasce do fim desta (Esc encerra a cadeia)
      if (edit.prov) { limparMarca(edit.prov); edit.prov = null; }
      editPreviewLimpar();
      edit.p1 = p2.clone();
      edit.prov = pontoMarca(p2); scene.add(edit.prov); rescaleObj(edit.prov);
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede criada (' + comp + ' m). ⛓ Continuando do fim — clique o próximo ponto, ou Esc pra encerrar.');
    } else {
      editTirarProv();
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede criada (' + comp + ' m). Siga clicando, ou Esc.');
    }
    marcarFechamento();
  }
  // Esc no meio da cadeia: encerra SÓ o traço (não fecha o editor)
  S._editFimCadeia = function () {
    editTirarProv();
    S._hint(edit.sub ? '' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Traço encerrado — clique o INÍCIO da próxima parede.' : '');
    marcarFechamento();
  };
  // preview no pointermove (registrado lá em cima via S._ — o handler nasce antes deste bloco)
  var _edPrevT = 0;
  S._editPreviewMove = function (e) {
    var t2 = performance.now(); if (t2 - _edPrevT < 33) return; _edPrevT = t2;
    var hit2 = raycastEm(e.clientX, e.clientY);
    var sn2 = hit2 ? aplicarSnap(hit2, raioToque(e)) : null;
    var pM = sn2 ? sn2.p.clone() : editPontoPlano(e.clientX, e.clientY);
    if (!pM) return;
    editPreview(editAjustarPonto(pM, e), e.clientX, e.clientY);
  };
  function editSt() {
    var el = editPanel.querySelector('[data-ed="st"]');
    if (el) el.textContent = edit.ops.length + ' operação(ões) · ' + ((edit.modelo && edit.modelo.nEl) || 0) + ' elemento(s)';
    editPanel.querySelectorAll('[data-ed]').forEach(function (b) {
      var k = b.getAttribute('data-ed');
      if (['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].indexOf(k) >= 0) {
        b.style.background = (edit.sub === k) ? corAtiva() : ''; b.style.color = (edit.sub === k) ? '#fff' : '';
      }
    });
  }
  function editSoltarSel() {
    if (edit.moverMesh && edit.moverMesh.userData.matOrig) edit.moverMesh.material = edit.moverMesh.userData.matOrig;
    edit.moverMesh = null; edit.moverId = null;
  }
  // reconstrói o modelo sintético 'edit' a partir do REPLAY das ops (fonte
  // única de verdade = motor puro; nada de estado paralelo no viewer)
  // uid gravado numa op pode ser de OUTRA sessão (o mid muda com a ordem de abertura dos
  // arquivos) — resolve pela identidade estável arquivo+expressID quando o uid direto não existe
  function editUidRemovido(info) {
    if (S.meshPorUid[info.uid]) return info.uid;
    if (info.arq != null && info.eid != null) {
      var mo2 = S.modelos.filter(function (x) { return x.mid !== 'edit' && x.nome === info.arq; })[0];
      if (mo2) return mo2.mid + ':' + info.eid;
    }
    return info.uid;
  }
  function editRebuild() {
    // restaura visibilidade dos IFC ocultados na rodada anterior (diff limpo) — TODAS as
    // malhas do elemento (multi-material tem várias), compondo com o 4D
    if (edit.removidosAntes.length) {
      var ra = {}; edit.removidosAntes.forEach(function (u) { ra[u] = 1; });
      todasMalhas(function (m) { if (ra[m.userData.mid + ':' + m.userData.expressID]) m.visible = !ehFuturo4d(m); });
    }
    editSoltarSel();
    // a malha 'edit' selecionada será destruída+recriada abaixo: limpa a seleção/contorno obsoletos
    // (senão o contorno verde fica congelado na posição antiga — mesmo padrão de removerModelo). Gate v1.1.89.
    if (S.selected && S.selected.userData && S.selected.userData.mid === 'edit') { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
    if (edit.modelo) {
      modelRoot.remove(edit.modelo.grupo);
      edit.modelo.grupo.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      edit.modelo.grupo.children.slice().forEach(function (m) { delete S.meshPorUid['edit:' + m.userData.expressID]; });
      var ix = S.modelos.indexOf(edit.modelo); if (ix >= 0) S.modelos.splice(ix, 1);
      edit.modelo = null;
    }
    edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
    edit.sprites = [];
    var st = BimEdit.aplicar(edit.ops);
    if (st.caixas.length) {
      var mo = { mid: 'edit', sintetico: true, editor: true, nome: 'Criados no OrçaPRO (' + st.caixas.length + ')', disciplina: 'arquitetura', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0, pavimentos: [], carimbos: {}, qto: {} };
      mo.grupo.userData.mid = 'edit';
      st.caixas.forEach(function (c) {
        var g = new THREE.BoxGeometry(c.comprimento, c.altura, c.espessura);
        var m = new THREE.Mesh(g, editMat(c.tipo));
        m.position.set(c.cx, c.cy, c.cz); m.rotation.y = c.rotY;
        m.userData.expressID = c.id; m.userData.tipo = c.ifc; m.userData.mid = 'edit'; m.userData.matOrig = editMat(c.tipo);
        mo.grupo.add(m);
        S.meshPorUid['edit:' + c.id] = m;
        mo.nTri += 12; mo.tipos[c.ifc] = (mo.tipos[c.ifc] || 0) + 1;
        mo.qto[c.id] = { comprimento: c.tipo === 'pilar' ? (c.comprimentoPilar || c.altura) : c.comprimento, area: c.area, volume: c.volume, contagem: 1 };
        mo.elementos.push({ id: c.id, uid: 'edit:' + c.id, mid: 'edit', arquivo: mo.nome, tipo: c.ifc, nome: (c.tipo === 'parede' ? 'Parede' : c.tipo === 'laje' ? 'Laje' : 'Pilar') + ' (sintética ' + c.id + ')', etapa: null, codOrc: null, qto: mo.qto[c.id], disciplina: 'arquitetura' });
        mo.nEl++;
      });
      modelRoot.add(mo.grupo);
      try {
        modelRoot.updateMatrixWorld(true);
        mo.grupo.children.forEach(function (m) {
          var bb = new THREE.Box3().setFromObject(m);
          var elx = mo.elementos.filter(function (e2) { return e2.id === m.userData.expressID; })[0];
          if (elx && !bb.isEmpty()) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
        });
      } catch (_) {}
      S.modelos.push(mo);
      recarimbarIdentidade();   /* B0: criados no editor, GlobalId proprio */
      agregarModelo(mo);        /* B2 */
      carimbarConsulta();     /* B3 */
      edit.modelo = mo;
    }
    st.anotacoes.forEach(function (a) {
      var sp = labelSprite('📍 ' + a.texto);
      sp.position.set(a.x, a.y, a.z); sp.userData._anotId = a.id;
      scene.add(sp); rescaleObj(sp); edit.sprites.push(sp);
    });
    // oculta os removidos (uid resolvido p/ a sessão atual; TODAS as malhas do elemento) e
    // publica S._remEd — todo escritor de visibilidade (4D/isolar/restaurar/focar) compõe com ele
    S._remEd = {};
    (st.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
    if (st.removidosIfc.length) todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
    edit.removidosAntes = Object.keys(S._remEd);
    S.elementos = []; S.modelos.forEach(function (mo2) { S.elementos = S.elementos.concat(mo2.elementos); });
    over.style.display = (S.modelos.length || st.anotacoes.length) ? 'none' : 'flex'; // sintético/anotação também tira o "arraste um IFC"
    atualizarHud(); notifyModelos(); editSt();
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    if (opts.onEdicao && !edit._replay) { try { opts.onEdicao(edit.ops.slice()); } catch (_) {} }
  }
  S._tickExtra.push(function () { for (var i = 0; i < edit.sprites.length; i++) rescaleObj(edit.sprites[i]); });
  function editOp(o) { edit.ops.push(o); editRebuild(); }
  function editHintSub() {
    var h = { parede: '' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Clique o INÍCIO e o FIM da parede (no modelo ou no chão vazio).',
              laje: '' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Clique 2 cantos OPOSTOS do retângulo da laje.',
              pilar: '' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Clique onde o pilar nasce.',
              mover: '↔️ Clique num elemento CRIADO AQUI e depois no novo lugar (IFC não se move — honestidade).',
              apagar: '' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Clique no elemento: criado aqui = removido; do IFC = ocultado como "removido na edição".',
              anotar: '' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Escreva o texto no campo e clique no ponto do modelo.' };
    S._hint(edit.sub ? h[edit.sub] : '' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Editor: escolha uma ferramenta no painel.');
  }
  function editClique(e, hit) {
    var sn = hit ? aplicarSnap(hit, raioToque(e)) : null;
    var p = sn ? sn.p.clone() : editPontoPlano(e.clientX, e.clientY);
    if (sn) mostrarSnapMarca(sn, e.clientX, e.clientY);
    var sub = edit.sub;
    if (sub === 'apagar') {
      if (!hit) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Clique em cima de um elemento.'); return; }
      var mA = _ultimosHits[0].object, midA = mA.userData.mid, idA = mA.userData.expressID;
      if (midA === 'edit') { editOp({ op: 'apagar', id: idA }); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Removido (Desfazer volta).'); }
      else {
        var moRem = S.modelos.filter(function (x) { return x.mid === midA; })[0];
        // arq+eid = identidade que sobrevive a F5/ordem de abertura (o mid é da sessão)
        editOp({ op: 'apagarIfc', uid: midA + ':' + idA, arq: moRem ? moRem.nome : null, eid: idA });
        S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + ' Elemento do modelo OCULTADO como removido na edição — o arquivo original não muda.');
      }
      marcarFechamento(); return;
    }
    if (sub === 'mover') {
      if (!edit.moverId) {
        if (!hit) { S._hint('↔️ Clique num elemento criado no editor.'); return; }
        var mM = _ultimosHits[0].object;
        if (mM.userData.mid !== 'edit') { S._hint('↔️ Só elementos CRIADOS AQUI se movem (IFC importado não é alterado).'); return; }
        edit.moverId = mM.userData.expressID; edit.moverMesh = mM; mM.material = editMat('sel');
        S._hint('↔️ Agora clique no NOVO lugar (o centro vai pra lá).'); return;
      }
      if (!p) { S._hint('↔️ Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
      editOp({ op: 'mover', id: edit.moverId, cx: p.x, cz: p.z });
      S._hint('↔️ Movido. Clique noutro elemento pra mover de novo, ou Esc.');
      marcarFechamento(); return;
    }
    if (!p) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Não achei o ponto — clique no modelo ou no plano do chão.'); return; }
    if (sub === 'pilar') {
      var cP = BimEdit.pilar({ x: p.x, z: p.z }, edit.secao, edit.alt, edit.base);
      if (cP) { editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cP }); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('pilar', 15) : '') + ' Pilar criado. Clique pra outro, ou Esc.'); }
      marcarFechamento(); return;
    }
    if (sub === 'anotar') {
      var txt = (editPanel.querySelector('[data-ed="txt"]').value || '').trim();
      if (!txt) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Escreva o texto da anotação no painel primeiro.'); return; }
      editOp({ op: 'anotar', id: 'a' + (++edit.seq), x: p.x, y: p.y, z: p.z, texto: txt });
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('alvo', 15) : '') + ' Anotado! O pin fica salvo com a obra.');
      marcarFechamento(); return;
    }
    if (sub === 'parede' || sub === 'laje') {
      if (!edit.p1) {
        edit.p1 = p.clone();
        edit.prov = pontoMarca(p); scene.add(edit.prov); rescaleObj(edit.prov);
        S._hint(sub === 'parede' ? '' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Agora clique o FIM da parede (ou digite a distância na caixinha + Enter).' : '' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Agora clique o canto OPOSTO.');
        return;
      }
      if (sub === 'parede') { editConcluirParede(editAjustarPonto(p, e)); return; } // orto/ângulo/encadeado/distância
      var cx2 = BimEdit.laje({ x: edit.p1.x, z: edit.p1.z }, { x: p.x, z: p.z }, Math.min(edit.espLaje, 0.4), edit.base);
      editTirarProv();
      if (!cx2) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + ' Pontos muito próximos — clique 2 pontos distintos.'); return; }
      editOp({ op: 'criar', id: 'e' + (++edit.seq), caixa: cx2 });
      S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('laje', 15) : '') + ' Laje criada (' + cx2.area.toFixed(2).replace('.', ',') + ' m²).');
      marcarFechamento(); return;
    }
  }
  function setEditSub(sub) {
    edit.sub = (edit.sub === sub) ? null : sub;
    editTirarProv(); editSoltarSel(); editHintSub(); editSt();
    canvasEl.style.cursor = edit.sub ? 'crosshair' : '';
    // ferramenta ativa marcada no painel — sem isso o toggle fica invisível pro usuário
    ['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].forEach(function (k) {
      var b = editPanel.querySelector('[data-ed="' + k + '"]'); if (!b) return;
      var on2 = edit.sub === k;
      b.style.background = on2 ? corAtiva() : ''; b.style.color = on2 ? '#fff' : '';
    });
  }
  function setEdit(on) {
    edit.on = !!on;
    if (on) {
      if (medir.on) setMedir(false); if (area.on) setArea(false); if (ang.on) setAng(false);
      if (ctec.ativo && S._ctecCancelar) S._ctecCancelar(true);
      setMode(false); fecharPaineis(null);
      edit.base = editBase();
      editPanel.style.display = 'flex';
      editHintSub(); editSt();
    } else {
      editTirarProv(); editSoltarSel();
      edit.sub = null; editPanel.style.display = 'none';
      canvasEl.style.cursor = ''; S._hint('');
    }
    var be = bar.querySelector('[data-b="editar"]'); if (be) { be.style.background = on ? corAtiva() : ''; be.style.color = on ? '#fff' : ''; }
  }
  S._setEdit = setEdit;
  S._editOps = function () { return edit.ops.slice(); };
  S._editAplicar = function (ops) {
    if (!S || !S.alive) return; // viewer morto (ctx perdido): rebuild apagaria o aviso de recarregar
    edit.ops = BimEdit.sanear(ops);
    var mx = 0;
    edit.ops.forEach(function (o) { var m2 = /^[ea](\d+)$/.exec(String(o.id || '')); if (m2) mx = Math.max(mx, parseInt(m2[1], 10)); });
    edit.seq = mx;
    // replay NÃO re-dispara onEdicao (gravaria de volta o que acabou de ser lido)
    edit._replay = true;
    try { editRebuild(); } finally { edit._replay = false; }
    // replay externo (reentrar na obra / F5): enquadra o que voltou — no uso ao vivo
    // a câmera NÃO pula (editRebuild não enquadra; o usuário está desenhando nela)
    if (edit.ops.length) enquadrar();
  };
  // IFC chega DEPOIS do replay (pós-F5 só as ops persistem): re-resolve os removidos
  // sobre o modelo recém-carregado — sem isto o "removido na edição" voltaria visível
  S._editReaplicarRem = function () {
    if (!edit.ops.length) return;
    var st2 = BimEdit.aplicar(edit.ops);
    if (!st2.removidosIfc.length) return;
    S._remEd = {};
    (st2.removidosIfcInfo || []).forEach(function (info) { S._remEd[editUidRemovido(info)] = 1; });
    todasMalhas(function (m) { if (S._remEd[m.userData.mid + ':' + m.userData.expressID]) m.visible = false; });
    edit.removidosAntes = Object.keys(S._remEd);
  };
  // 🗑 Limpar / remover o modelo "Criados no OrçaPRO": o editor zera JUNTO (persistido) —
  // senão pins ficam órfãos na cena e a próxima op ressuscitaria tudo do replay
  S._editReset = function () {
    edit.ops = []; edit.seq = 0; edit.removidosAntes = []; edit.modelo = null; S._remEd = null;
    edit.sprites.forEach(function (sp) { scene.remove(sp); if (sp.material && sp.material.map) sp.material.map.dispose(); if (sp.material) sp.material.dispose(); });
    edit.sprites = [];
    if (edit.on) setEdit(false);
    if (opts.onEdicao) { try { opts.onEdicao([]); } catch (_) {} }
  };
  editPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ed]'); if (!b) return; var k = b.getAttribute('data-ed');
    if (k === 'fechar') setEdit(false);
    else if (k === 'undo') { if (edit.ops.length) { edit.ops.pop(); editTirarProv(); editRebuild(); S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Desfeito.'); } else { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' Nada pra desfazer.'); } } // TirarProv: cadeia não pode ficar apontando pra parede que sumiu
    else if (k === 'orto') { edit.orto = !edit.orto; b.style.background = edit.orto ? corAtiva() : ''; b.style.color = edit.orto ? '#fff' : ''; S._hint(edit.orto ? '⟂ Orto LIGADO — paredes só na horizontal/vertical.' : '⟂ Orto desligado (Shift também trava).'); }
    else if (k === 'angpre') {
      edit.angPre = edit.angPre === 0 ? 45 : (edit.angPre === 45 ? 15 : 0);
      b.textContent = '∠ ' + (edit.angPre === 0 ? 'Livre' : edit.angPre + '°');
      b.style.background = edit.angPre ? corAtiva() : ''; b.style.color = edit.angPre ? '#fff' : '';
      S._hint(edit.angPre ? '∠ Ângulos travados em múltiplos de ' + edit.angPre + '°.' : '∠ Ângulo livre.');
    }
    else if (k === 'chain') { edit.chain = !edit.chain; b.style.background = edit.chain ? corAtiva() : ''; b.style.color = edit.chain ? '#fff' : ''; S._hint(edit.chain ? '⛓ Encadear LIGADO — cada parede continua da anterior (Esc encerra o traço).' : '⛓ Encadear desligado.'); }
    else if (['parede', 'laje', 'pilar', 'mover', 'apagar', 'anotar'].indexOf(k) >= 0) setEditSub(k);
  });
  // estado inicial dos toggles (chain nasce ligado — fluxo Revit)
  (function () { var bC = editPanel.querySelector('[data-ed="chain"]'); if (bC) { bC.style.background = corAtiva(); bC.style.color = '#fff'; } })();
  editPanel.addEventListener('change', function (e) {
    var i = e.target.closest('input[data-ed]'); if (!i) return; var k = i.getAttribute('data-ed'), v = parseFloat(i.value);
    // clamp nos limites do input — valor DIGITADO ignora min/max do HTML (parede de 50 m de espessura não passa)
    var lim = { esp: [0.05, 1.0], alt: [0.3, 8], secao: [0.1, 1] }[k];
    if (!lim || !(v > 0) || !isFinite(v)) return;
    v = Math.min(lim[1], Math.max(lim[0], v));
    i.value = String(v);
    /* o mesmo campo alimenta parede e laje conforme a ferramenta ativa */
    if (k === 'esp') { if (edit.sub === 'laje') edit.espLaje = v; else edit.esp = v; }
    else if (k === 'alt') edit.alt = v; else edit.secao = v;
  });

  /* --------------------------------------------------------------
   * O TIPO DE PAREDE manda na espessura do editor.
   * Até aqui, `edit.esp` nascia com 0,15 m FIXOS: o painel de tipo
   * calculava a parede executiva em 19,7 cm e o 3D desenhava 15.
   * Agora quem define é o tipo ativo (js/alvtipos.js), e o número
   * chega aqui em metros, já somado com as camadas das duas faces.
   * -------------------------------------------------------------- */
  S._setEspEditor = function (metros, rotulo) {
    var v = parseFloat(metros);
    if (!(v > 0) || !isFinite(v)) return false;
    /* se não mudou nada, não escreve: o painel de propriedades repinta a cada
       tecla, e sobrescrever aqui apagaria o que o usuário digitou no viewer */
    if (Math.abs(v - edit.esp) < 1e-6 && (rotulo || "") === (edit.tipoRotulo || "")) return true;
    /* parede de 5 cm ou de 5 m não existe. O teto sobe para 1,00 m porque a
       espessura agora inclui as camadas: bloco de 19 com emboço nas duas
       faces já passa de 24 cm, e parede dupla passa de 60. */
    v = Math.min(1.0, Math.max(0.05, v));
    edit.esp = v;
    edit.tipoRotulo = rotulo || "";
    /* o campo na tela mostra a grandeza da ferramenta ATIVA — se o usuário
       está no Piso, escrever a espessura da parede ali seria mentira */
    if (edit.sub !== 'laje') {
      var inp = editPanel.querySelector('input[data-ed="esp"]');
      if (inp) inp.value = String(Math.round(v * 1000) / 1000);
    }
    return true;
  };
  S._espEditor = function () { return { esp: edit.esp, espLaje: edit.espLaje, tipo: edit.tipoRotulo || "" }; };

  var p3d = { parse: null, det: null };
  var p3dPanel = document.createElement('div');
  p3dPanel.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;display:none;flex-direction:column;gap:8px;background:rgba(15,39,64,.97);border:1px solid #24435f;border-radius:12px;padding:14px 16px;color:#dbe8f5;font-size:12px;width:480px;max-width:94%;max-height:92%;overflow:auto;box-shadow:0 12px 34px rgba(0,0,0,.5)';
  p3dPanel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Planta 2D → 3D (DXF)</b><button class="btn sm" data-p3="fechar">' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + '</button></div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<button class="btn sm primary" data-p3="abrir">' + (typeof Icones !== 'undefined' ? Icones.get('abrir', 15) : '') + ' Abrir .DXF</button>' +
    '<label style="display:flex;gap:5px;align-items:center">Pé-direito <input data-p3="pd" class="inp" type="number" value="2.80" step="0.1" min="2" max="6" style="width:64px"> m</label>' +
    '<label style="display:flex;gap:5px;align-items:center">Unidade <select data-p3="un" class="inp" style="width:76px"><option value="">auto</option><option value="0.001">mm</option><option value="0.01">cm</option><option value="1">m</option></select></label>' +
    '<input type="file" data-p3="file"' + (ehToque() ? '' : ' accept=".dxf"') + ' style="display:none"></div>' +
    '<div data-p3="info" style="font-size:11.5px;color:#9fb2c8">Exporte a planta baixa do seu CAD em <b>DXF</b> (AutoCAD/QCAD/LibreCAD; DWG? salve-como DXF). O sistema propõe as paredes — você confirma.</div>' +
    '<canvas data-p3="cv" width="448" height="300" style="background:#0b1a2b;border:1px solid #24435f;border-radius:8px;cursor:pointer;display:none"></canvas>' +
    '<div data-p3="res" style="font-size:12px"></div>' +
    '<button class="btn sm primary" data-p3="gerar" style="display:none">' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Gerar 3D</button>' +
    '<div style="font-size:11px;color:#f0b94a;line-height:1.35">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Volumetria de ESTUDO (paredes por par de linhas paralelas de 6–40 cm) — clique numa parede verde do preview pra ligar/desligar. Portas, janelas e cobertura não entram nesta fase. Não substitui o projeto.</div>';
  host.appendChild(p3dPanel);
  S.p3dPanel = p3dPanel;
  function toggleP3dPanel() { var abrir = p3dPanel.style.display === 'none' || !p3dPanel.style.display; fecharPaineis(null); p3dPanel.style.display = abrir ? 'flex' : 'none'; }
  S._toggleP3d = toggleP3dPanel; // a fita chama por aqui (BIM.painelP3d)
  function p3dDesenhar() {
    var cv = p3dPanel.querySelector('[data-p3="cv"]'); if (!cv || !p3d.parse) return;
    cv.style.display = '';
    var g = cv.getContext('2d'), ex = p3d.parse.extents;
    g.fillStyle = '#0b1a2b'; g.fillRect(0, 0, cv.width, cv.height);
    if (!ex) return;
    var mrg = 14, sw = (cv.width - mrg * 2) / Math.max(1e-6, ex.x1 - ex.x0), sh = (cv.height - mrg * 2) / Math.max(1e-6, ex.y1 - ex.y0);
    var sc = Math.min(sw, sh);
    function px(x) { return mrg + (x - ex.x0) * sc; }
    function py(y) { return cv.height - mrg - (y - ex.y0) * sc; } // Y da planta pra cima
    p3d._px = px; p3d._py = py; p3d._sc = sc;
    g.strokeStyle = '#3a5570'; g.lineWidth = 1;
    p3d.parse.segmentos.forEach(function (s) { g.beginPath(); g.moveTo(px(s.x1), py(s.y1)); g.lineTo(px(s.x2), py(s.y2)); g.stroke(); });
    (p3d.det ? p3d.det.paredes : []).forEach(function (p) {
      g.strokeStyle = p.ligada !== false ? '#22c55e' : '#64748b';
      g.setLineDash(p.ligada !== false ? [] : [5, 4]);
      g.lineWidth = Math.max(3, p.espessura * sc);
      g.beginPath(); g.moveTo(px(p.x1), py(p.y1)); g.lineTo(px(p.x2), py(p.y2)); g.stroke();
      g.setLineDash([]);
    });
  }
  function p3dResumo() {
    var res = p3dPanel.querySelector('[data-p3="res"]'), bg = p3dPanel.querySelector('[data-p3="gerar"]');
    if (!p3d.det) { res.innerHTML = ''; bg.style.display = 'none'; return; }
    var ligadas = p3d.det.paredes.filter(function (p) { return p.ligada !== false; });
    var mTot = ligadas.reduce(function (s, p) { return s + p.comprimento; }, 0);
    res.innerHTML = '<b style="color:#7fe0a3">' + ligadas.length + ' parede(s) ligadas</b> (' + mTot.toFixed(1).replace('.', ',') + ' m lineares) · ' +
      /* NÃO AFIRMAR A CAUSA. "portas/mobiliário/cotas" era chute apresentado
         como fato: no DXF com a parede fatiada em LINEs, boa parte dos
         sem-par é FACE DE PAREDE que o pareador não casou — e o texto
         mandava o usuário ignorar justamente o que estava faltando. */
      p3d.det.stats.segmentosSemPar + ' segmento(s) não formaram par (porta, mobiliário, cota — ou face de parede que o pareador não casou) · unidade: ' + (p3d.parse.unidade.origem === 'insunits' ? 'do arquivo' : p3d.parse.unidade.origem);
    /* O MOTIVO SAI DO PRÓPRIO OBJETO, não de uma lista fixa de causas.
       Concatenar só viaTrio e provavelPilar como se fossem exaustivas
       imprimia "⚠ 4 item(ns) NÃO entram no 3D: ." — prefixo com ponto solto
       e nenhuma explicação — sempre que a exclusão viesse por outro caminho. */
    var dubias = p3d.det.paredes.filter(function (p) { return p.ligada === false; });
    if (dubias.length) {
      var nTrio = dubias.filter(function (p) { return p.viaTrio; }).length;
      var nPil = dubias.filter(function (p) { return p.provavelPilar && !p.viaTrio; }).length;
      var nOutro = dubias.length - nTrio - nPil;
      var mot = [];
      if (nTrio) mot.push(nTrio + ' com três linhas paralelas (pode ser cota, não parede)');
      if (nPil) mot.push(nPil + ' com comprimento próximo da espessura (parece pilar, contaria em dobro)');
      if (nOutro > 0) mot.push(nOutro + ' desligados por você');
      res.innerHTML += '<br><span style="color:#f0b94a">⚠ ' + dubias.length + ' NÃO entram no 3D: ' + mot.join(' · ') + '.</span>';
    }
    /* botão que gera NADA não fica oferecido: com zero ligadas ele produzia
       um modelo vazio e o painel continuava aberto, sem dizer por quê */
    if (!ligadas.length) {
      bg.style.display = 'none';
      /* dois casos DIFERENTES, e mandar clicar no segundo é mandar clicar
         no vazio: sem parede proposta não há o que ligar no desenho */
      res.innerHTML += p3d.det.paredes.length
        ? '<br><b style="color:#f0b94a">Nenhuma parede ligada</b> — clique nas do desenho para ligar ' +
          'o que for parede de verdade. O 3D só nasce com pelo menos uma.'
        : '<br><b style="color:#f0b94a">Nenhuma parede foi proposta</b> — não há o que clicar. ' +
          'Confira a UNIDADE no seletor acima (envergadura errada joga toda espessura fora da faixa de ' +
          '6–40 cm) e explode os blocos no CAD antes de exportar.';
      return;
    }
    bg.style.display = ''; bg.textContent = '' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Gerar 3D (' + ligadas.length + ' paredes)';
  }
  function p3dProcessar(texto, nome) {
    if (typeof window === 'undefined' || !window.DXF || !window.Planta3D) { S._hint('' + (typeof Icones !== 'undefined' ? Icones.get('obra', 15) : '') + ' Motores 2D→3D não carregados — atualize o app.'); return; }
    p3d._texto = String(texto || ''); // guardado: trocar a unidade re-processa (a UI instrui isso)
    var fu = parseFloat(p3dPanel.querySelector('[data-p3="un"]').value) || 0;
    p3d.parse = window.DXF.parse(texto, fu > 0 ? { fatorUnidade: fu } : {});
    p3d.nome = nome || 'planta.dxf';
    var info = p3dPanel.querySelector('[data-p3="info"]');
    if (!p3d.parse.segmentos.length) { info.innerHTML = '' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Não achei geometria 2D neste DXF (só ' + JSON.stringify(p3d.parse.stats.ignoradas) + '). Exporte como DXF ASCII (R12/2000) com as linhas das paredes.'; p3d.det = null; p3dDesenhar(); p3dResumo(); return; }
    /* ESCADA, HACHURA E COTA SAEM ANTES — este painel chamava o detector
       direto e não passava pelo filtro de famílias que o assistente de
       volumetria usa. Um lance de escada de 28 cm cai no meio da faixa de
       espessura de parede e virava meia dúzia de paredes por aqui. */
    var fam3d = window.Planta3D.filtrarFamilias(p3d.parse.segmentos, { espMin: 0.06, espMax: 0.40, angTol: 4 });
    p3d.familias = fam3d.familias || [];
    p3d.det = window.Planta3D.detectarParedes(fam3d.segmentos);
    var env = p3d.parse.extents ? ((p3d.parse.extents.x1 - p3d.parse.extents.x0).toFixed(1) + '×' + (p3d.parse.extents.y1 - p3d.parse.extents.y0).toFixed(1) + ' m') : '—';
    var ign = Object.keys(p3d.parse.stats.ignoradas || {}).map(function (k) { return k + '×' + p3d.parse.stats.ignoradas[k]; }).join(', ');
    info.innerHTML = '<b>' + esc(p3d.nome) + '</b> · ' + p3d.parse.segmentos.length + ' segmentos · envergadura ' + env +
      (p3d.parse.unidade.origem.indexOf('heuristica') === 0 ? ' · <span style="color:#f0b94a">unidade ASSUMIDA (' + p3d.parse.unidade.origem.slice(11) + ') — confira a envergadura e corrija no seletor se preciso</span>' : '');
    if (ign) info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Entidades ignoradas: ' + esc(ign) + (/INSERT/.test(ign) ? ' — geometria DENTRO de bloco não entra: exploda os blocos no CAD antes de exportar.' : '.');
    if (!p3d.det.paredes.length) info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Nenhum par de linhas com cara de parede (6–40 cm). Confira a UNIDADE — envergadura errada = espessuras fora da faixa.';
    /* o que saiu e o que entrou DESMARCADO tem de aparecer: sem isso o
       painel diz "N paredes" e gera outro número */
    if (p3d.familias.length) {
      info.innerHTML += '<br>' + (typeof Icones !== 'undefined' ? Icones.get('proibido', 15) : '') + ' Descartado como não-parede: ' + p3d.familias.map(function (fx) {
        return fx.linhas + ' linhas a ' + Math.round(fx.espacamento * 100) + ' cm (' + esc(fx.motivo) + ')';
      }).join(' · ') + '. Parede tem DUAS faces.';
    }
    /* o aviso do que NÃO entra mora no resumo, não aqui: o bloco `info` só
       é escrito ao abrir o arquivo, e depois que o usuário liga paredes na
       mão ele continuaria afirmando que N itens ficam de fora */
    p3dDesenhar(); p3dResumo();
  }
  p3dPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p3]'); if (!b) return; var k = b.getAttribute('data-p3');
    if (k === 'fechar') p3dPanel.style.display = 'none';
    else if (k === 'abrir') p3dPanel.querySelector('[data-p3="file"]').click();
    else if (k === 'gerar') {
      if (!p3d.det) return;
      var pd = parseFloat(p3dPanel.querySelector('[data-p3="pd"]').value) || 2.8;
      var caixas = window.Planta3D.extrudar(p3d.det.paredes, pd);
      var mid = carregarSintetico(caixas, p3d.nome.replace(/\.dxf$/i, '') + ' (2D→3D)');
      if (mid) { p3dPanel.style.display = 'none'; S._hint('🏗 ' + caixas.length + ' paredes no 3D! O QTO já mede os m² — e a ' + (typeof Icones !== 'undefined' ? Icones.get('bloco', 15) : '') + ' Parede-Cebola explode em camadas SINAPI no orçamento.'); }
    }
  });
  p3dPanel.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute('data-p3') === 'file' && t.files && t.files[0]) {
      var f = t.files[0], fr = new FileReader();
      /* mesma razão do IFC: sem `accept` no celular, quem valida somos nós */
      if (!/\.dxf$/i.test(f.name || '')) {
        t.value = '';
        var m3 = 'O arquivo “' + f.name + '” não é um DXF. Exporte a planta do seu CAD em DXF e tente de novo.';
        try { if (typeof UI !== 'undefined' && UI.toast) UI.toast(m3, 'erro'); else alert(m3); } catch (_) {}
        return;
      }
      fr.onload = function () { p3dProcessar(String(fr.result || ''), f.name); };
      fr.readAsText(f); t.value = '';
    } else if (t.getAttribute('data-p3') === 'un' && p3d._texto) { p3dProcessar(p3d._texto, p3d.nome); } // achado do gate: era no-op — agora re-parseia com a unidade nova
  });
  // clique no preview: liga/desliga a parede proposta mais próxima
  p3dPanel.querySelector('[data-p3="cv"]').addEventListener('click', function (e) {
    if (!p3d.det || !p3d._px) return;
    var cv = e.target, rc = cv.getBoundingClientRect();
    var mx = (e.clientX - rc.left) * (cv.width / rc.width), my = (e.clientY - rc.top) * (cv.height / rc.height);
    var melhor = null, dMin = 12;
    p3d.det.paredes.forEach(function (p) {
      var x1 = p3d._px(p.x1), y1 = p3d._py(p.y1), x2 = p3d._px(p.x2), y2 = p3d._py(p.y2);
      var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
      var t2 = L2 > 0 ? Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / L2)) : 0;
      var d = Math.sqrt(Math.pow(mx - (x1 + dx * t2), 2) + Math.pow(my - (y1 + dy * t2), 2));
      if (d < dMin) { dMin = d; melhor = p; }
    });
    if (melhor) { melhor.ligada = melhor.ligada === false; p3dDesenhar(); p3dResumo(); }
  });
  S._p3dProcessar = p3dProcessar; // hook de teste (injeta o texto DXF sem file input)

  // rejeição NÃO fica memoizada: falha transitória do wasm (offline/atualização) permite retentar na próxima carga
  function initApi() { if (!S._initP) S._initP = (async function () { S.api.SetWasmPath('bim/vendor/'); await S.api.Init(); S.apiReady = true; })().catch(function (e) { S._initP = null; throw e; }); return S._initP; }
  var _loadChain = Promise.resolve(); // cadeia LOCAL do mount (a global misturaria cargas de um viewer morto com o novo)
  function enfileirar(fn) { _loadChain = _loadChain.then(fn, fn); return _loadChain; }

  // Lê os carimbos do exportador pyRevit e devolve mapa expressID -> {etapa, codOrc}.
  // Uma passada por todos os IfcRelDefinesByProperties; para cada, resolve o pset e varre
  // seus IfcPropertySingleValue atrás de OrcaPRO_Etapa/OrcaPRO_CodOrc, atribuindo a TODOS os
  // RelatedObjects (um rel pode carimbar vários elementos). Blindado: qualquer falha de leitura
  // devolve o que já achou — NUNCA impede o modelo 3D de abrir (property é bônus sobre a geometria).
  /* =====================================================================
   * TOPOLOGIA DA REDE — porta a porta, como o IFC publica.
   *
   * Três passadas no molde de `lerCarimbosOrcaPro`:
   *   IfcRelConnectsPortToElement  porta  → peça
   *   IfcRelConnectsPorts          porta ↔ porta
   *   IfcDistributionPort          o sentido do fluxo, quando declarado
   *
   * ⚠ PREGUIÇOSA, DE PROPÓSITO. Não entra no bloco síncrono da carga: são
   *   ~20 mil chamadas que TODO cliente pagaria ao abrir QUALQUER modelo,
   *   inclusive quem nunca vai numerar rede — e no celular isso é aba
   *   travada. Roda no primeiro uso e fica no `modelo.topologia`.
   *
   * ⚠ E NÃO usar a rota inversa `HasPorts`: medido no arquivo real, 1.120 ms
   *   contra 131 ms destas três passadas em lote.
   *
   * ⚠ O SENTIDO NÃO ORDENA NADA. No arquivo real, 2.246 das 8.430 portas
   *   (27%) são SOURCEANDSINK — o IFC não diz para onde corre. FlowDirection
   *   serve só para ESCOLHER a ponta onde o percurso começa; quando não há,
   *   a origem é declarada arbitrária em vez de deduzida. */
  function lerTopologiaRede(mid) {
    var mo = modeloDe(mid);
    if (mo && mo.topologia) return mo.topologia;
    /* ⚠ B1: sem isto um modelo restaurado varreria o WASM com mid string e
       leria a rede de OUTRO arquivo. Topologia vazia e a resposta honesta. */
    if (semWasm(mo)) return { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
    var topo = { portaDe: {}, ligacao: {}, portasDe: {}, dirPorta: {}, nPortas: 0, nLigacoes: 0 };
    try {
      var re1 = S.api.GetLineIDsWithType(mid, IFC_RELCONNECTSPORTTOELEMENT), n1 = re1.size();
      for (var i = 0; i < n1; i++) {
        var r1; try { r1 = S.api.GetLine(mid, re1.get(i), false); } catch (_) { continue; }
        if (!r1 || !r1.RelatingPort || !r1.RelatedElement) continue;
        var pid = r1.RelatingPort.value, eid = r1.RelatedElement.value;
        if (pid == null || eid == null) continue;
        var uid = mid + ':' + eid;
        topo.portaDe[pid] = uid;
        (topo.portasDe[uid] = topo.portasDe[uid] || []).push(pid);
        topo.nPortas++;
      }
      var re2 = S.api.GetLineIDsWithType(mid, IFC_RELCONNECTSPORTS), n2 = re2.size();
      for (var j = 0; j < n2; j++) {
        var r2; try { r2 = S.api.GetLine(mid, re2.get(j), false); } catch (_) { continue; }
        if (!r2 || !r2.RelatingPort || !r2.RelatedPort) continue;
        var pa = r2.RelatingPort.value, pb = r2.RelatedPort.value;
        if (pa == null || pb == null) continue;
        topo.ligacao[pa] = pb; topo.ligacao[pb] = pa;
        topo.nLigacoes++;
      }
      var re3 = S.api.GetLineIDsWithType(mid, IFC_DISTRIBUTIONPORT), n3 = re3.size();
      for (var k = 0; k < n3; k++) {
        var id3 = re3.get(k), p3;
        try { p3 = S.api.GetLine(mid, id3, false); } catch (_) { continue; }
        /* enum chega embrulhado: { type: 3, value: 'SINK' } — sem os pontos do STEP */
        if (p3 && p3.FlowDirection && p3.FlowDirection.value) topo.dirPorta[id3] = String(p3.FlowDirection.value);
      }
    } catch (e) { /* topologia é bônus: falha devolve o que já achou */ }
    if (mo) mo.topologia = topo;
    return topo;
  }

  /* =====================================================================
   * BITOLA — o raio que o projetista declarou, não medido por nós.
   *
   * O pset do tubo traz só Length/Manufacturer/Reference: a bitola NÃO está
   * lá. Mas está publicada na geometria, no perfil que foi varrido:
   *   IfcExtrudedAreaSolid.SweptArea → IfcCircleProfileDef.Radius
   * Amostra do arquivo real: raio 0,05 m → 100 mm de diâmetro externo, que é
   * como o PVC é designado comercialmente no Brasil.
   *
   * ⚠ É Ø EXTERNO, e o rótulo diz isso. Chamar de "DN" sem ressalva
   *   atropelaria a norma em bitola onde o DN nominal não é o externo — no
   *   PVC brasileiro coincide, em outros materiais não.
   *
   * ⚠ E É POR ELEMENTO, sob demanda. Varrer todos os IfcCircleProfileDef de
   *   uma vez sairia mais barato, mas o perfil não sabe a que peça pertence:
   *   o caminho de volta é justamente pela representação do elemento. Só roda
   *   para o que vai entrar na lista. */
  function lerBitolaMm(mid, eid, fLen) {
    /* ⚠ B1: o cache traz a bitola pronta; o modelo sintetico nao tem nenhuma.
       Os dois precisam sair antes do GetLine (ver `semWasm`). */
    var moB = modeloDe(mid);
    if (semWasm(moB)) return (moB.bitolas && moB.bitolas[eid]) || 0;
    try {
      var el = S.api.GetLine(mid, eid, false);
      if (!el || !el.Representation || el.Representation.value == null) return 0;
      var pds = S.api.GetLine(mid, el.Representation.value, false);
      var reps = pds && pds.Representations; if (!reps) return 0;
      reps = Array.isArray(reps) ? reps : [reps];
      for (var i = 0; i < reps.length; i++) {
        if (!reps[i] || reps[i].value == null) continue;
        var sr; try { sr = S.api.GetLine(mid, reps[i].value, false); } catch (_) { continue; }
        var itens = sr && sr.Items; if (!itens) continue;
        itens = Array.isArray(itens) ? itens : [itens];
        for (var j = 0; j < itens.length; j++) {
          if (!itens[j] || itens[j].value == null) continue;
          var it; try { it = S.api.GetLine(mid, itens[j].value, false); } catch (_) { continue; }
          if (!it || !it.SweptArea || it.SweptArea.value == null) continue;
          var pf; try { pf = S.api.GetLine(mid, it.SweptArea.value, false); } catch (_) { continue; }
          if (!pf) continue;
          var r = pf.Radius; if (r && r.value != null) r = r.value;
          /* perfil OCO (anel de vedação) traz Radius + WallThickness: o
             externo continua sendo Radius, então serve igual */
          var v = parseFloat(r);
          if (!isNaN(v) && v > 0) return Math.round(v * 2 * (fLen || 1) * 1000);
        }
      }
    } catch (_) {}
    return 0;
  }

  function lerCarimbosOrcaPro(mid) {
    var mapa = {};
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES);
      var nRel = rels.size();
      for (var i = 0; i < nRel; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var psetID = rel.RelatingPropertyDefinition.value; if (psetID == null) continue;
        var pset; try { pset = S.api.GetLine(mid, psetID, false); } catch (_) { continue; }
        if (!pset || !pset.HasProperties) continue; // não é IfcPropertySet (ex.: quantities/type)
        var props = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
        var etapa = null, cod = null, fase = null;
        for (var p = 0; p < props.length; p++) {
          var h = props[p]; if (!h || h.value == null) continue;
          var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
          if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE) continue;
          var nm = pv.Name && pv.Name.value;
          if (nm === 'OrcaPRO_Etapa' && pv.NominalValue) etapa = pv.NominalValue.value;
          else if (nm === 'OrcaPRO_CodOrc' && pv.NominalValue) cod = pv.NominalValue.value;
          else if (nm === 'OrcaPRO_Fase' && pv.NominalValue) fase = pv.NominalValue.value; // reforma: nova|demolir|existente
        }
        if (etapa == null && cod == null && fase == null) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          var eid = oh.value; if (!mapa[eid]) mapa[eid] = {};
          if (etapa != null) mapa[eid].etapa = etapa;
          if (cod != null) mapa[eid].codOrc = cod;
          if (fase != null) mapa[eid].fase = fase;
        }
      }
    } catch (e) { /* leitura de propriedades é bônus; nunca impede o modelo de abrir */ }
    return mapa;
  }

  // v1.1.82 — FAMÍLIA/TIPO por elemento (IfcRelDefinesByType): o Revit exporta o nome do TIPO
  // como Name do IfcTypeObject (e 'Família:Tipo' no ObjectType da instância). Devolve mapa
  // expressID -> { familia, tipoId } — tipoId guarda o IfcTypeObject p/ ler os psets do TIPO depois.
  // Blindado: property é bônus, nunca impede o 3D de abrir.
  function lerTipos(mid) {
    var mapa = {};
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYTYPE);
      var n = rels.size();
      for (var i = 0; i < n; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingType || !rel.RelatedObjects) continue;
        var tid = rel.RelatingType.value; if (tid == null) continue;
        var tipoObj; try { tipoObj = S.api.GetLine(mid, tid, false); } catch (_) { continue; }
        var nomeFam = (tipoObj && tipoObj.Name && tipoObj.Name.value) || null;
        if (!nomeFam) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          mapa[oh.value] = { familia: nomeFam, tipoId: tid };
        }
      }
    } catch (e) { /* bônus */ }
    return mapa;
  }

  // v1.1.98 — SISTEMA por elemento (IfcRelAssignsToGroup → IfcSystem/IfcDistributionSystem): o Revit
  // agrupa a tubulação em sistemas nomeados ("Sanitário 1", "Água Fria 3", "Ventilação 2"…). É esse
  // Name que diz o SISTEMA de verdade — o nome do elemento costuma ser genérico ("Tubo/duto"). Só
  // aceita grupos que SÃO sistema (filtra IfcGroup genérico, ex.: "Grupo de modelos"). Blindado.
  function lerSistemas(mid) {
    var mapa = {};
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELASSIGNSTOGROUP);
      var n = rels.size();
      for (var i = 0; i < n; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingGroup || rel.RelatingGroup.value == null || !rel.RelatedObjects) continue;
        var grp; try { grp = S.api.GetLine(mid, rel.RelatingGroup.value, false); } catch (_) { continue; }
        if (!grp || (grp.type !== IFC_SYSTEM && grp.type !== IFC_DISTRIBUTIONSYSTEM)) continue; // só SISTEMA (não zona/grupo/lista)
        var nomeSis = (grp.Name && grp.Name.value) || (grp.LongName && grp.LongName.value) || null;
        if (!nomeSis) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          if (!mapa[oh.value]) mapa[oh.value] = nomeSis; // 1º sistema vence (um elemento pode estar em vários grupos)
        }
      }
    } catch (e) { /* bônus */ }
    return mapa;
  }

  // valor legível de uma property (SingleValue/Enumerated/List/Bounded/Complex — nada é descartado)
  function propValor(mid, pv) {
    try {
      if (pv.type === IFC_PROPERTYSINGLEVALUE) return pv.NominalValue != null ? pv.NominalValue.value : null;
      if (pv.type === IFC_PROP_ENUM) return (pv.EnumerationValues || []).map(function (x) { return x && x.value; }).join(", ");
      if (pv.type === IFC_PROP_LIST) return (pv.ListValues || []).map(function (x) { return x && x.value; }).join(", ");
      if (pv.type === IFC_PROP_BOUNDED) {
        var lo = pv.LowerBoundValue && pv.LowerBoundValue.value, hi = pv.UpperBoundValue && pv.UpperBoundValue.value;
        return (lo != null ? lo : "…") + " – " + (hi != null ? hi : "…");
      }
      if (pv.type === IFC_PROP_COMPLEX) {
        var subs = Array.isArray(pv.HasProperties) ? pv.HasProperties : [pv.HasProperties];
        return subs.map(function (h) {
          try { var sub = S.api.GetLine(mid, h.value, false); return (sub.Name && sub.Name.value) + ": " + propValor(mid, sub); } catch (_) { return ""; }
        }).filter(Boolean).join(" · ");
      }
    } catch (e) {}
    return null;
  }
  function lerPropsDePset(mid, psetId, grupos, origem) {
    var pset; try { pset = S.api.GetLine(mid, psetId, false); } catch (_) { return; }
    if (!pset) return;
    var nomePset = (pset.Name && pset.Name.value) || "Propriedades";
    var props = [];
    if (pset.HasProperties) { // IfcPropertySet
      var hs = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
      for (var p = 0; p < hs.length; p++) {
        var h = hs[p]; if (!h || h.value == null) continue;
        var pv; try { pv = S.api.GetLine(mid, h.value, false); } catch (_) { continue; }
        if (!pv) continue;
        var v = propValor(mid, pv);
        if (v != null && v !== "") props.push({ n: (pv.Name && pv.Name.value) || "?", v: String(v) });
      }
    } else if (pset.Quantities) { // IfcElementQuantity — quantidades cruas do arquivo
      var qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
      for (var q = 0; q < qs.length; q++) {
        var qh = qs[q]; if (!qh || qh.value == null) continue;
        var qv; try { qv = S.api.GetLine(mid, qh.value, false); } catch (_) { continue; }
        if (!qv) continue;
        var val = null, camp = ["LengthValue", "AreaValue", "VolumeValue", "CountValue", "WeightValue"];
        for (var c = 0; c < camp.length; c++) if (qv[camp[c]] != null) { val = qv[camp[c]].value != null ? qv[camp[c]].value : qv[camp[c]]; break; }
        if (val != null) props.push({ n: (qv.Name && qv.Name.value) || "?", v: String(val) });
      }
    }
    if (props.length) grupos.push({ pset: nomePset, origem: origem, props: props });
  }
  // TODAS as propriedades de um elemento, on-demand (clique): psets da INSTÂNCIA
  // (IfcRelDefinesByProperties) + psets do TIPO/família (IfcTypeObject.HasPropertySets — atributo
  // direto, caminho diferente!). Devolve [{pset, origem:'instância'|'família', props:[{n,v}]}].
  function propsCompletas(mid, expressID) {
    var grupos = [];
    var mo = modeloDe(mid);
    /* ⚠ B1: o cache guarda o que os paineis do produto consomem (etapa,
       quantitativo, familia, sistema, pavimento) e NAO guarda o despejo
       completo de psets do arquivo — sao dezenas de propriedades por peca,
       vezes dezenas de milhares de pecas. Aqui isso e DITO, em vez de a lista
       aparecer curta e o usuario achar que o projetista nao preencheu. */
    if (mo && mo.doCache) {
      var elK = (mo.elementos || []).filter(function (e) { return e.id === expressID; })[0];
      var qK = (mo.qto && mo.qto[expressID]) || null;
      var pr = [];
      if (elK && elK.tipo) pr.push({ n: 'Tipo IFC', v: String(elK.tipo) });
      if (elK && elK.globalId) pr.push({ n: 'GlobalId', v: String(elK.globalId) });
      if (elK && elK.familia) pr.push({ n: 'Família/tipo', v: String(elK.familia) });
      if (elK && elK.tag) pr.push({ n: 'Tag', v: String(elK.tag) });
      if (elK && elK.etapa) pr.push({ n: 'Etapa (OrçaPRO)', v: String(elK.etapa) });
      if (elK && elK.codOrc) pr.push({ n: 'Código do orçamento', v: String(elK.codOrc) });
      if (pr.length) grupos.push({ pset: 'Do modelo guardado', origem: 'instância', props: pr });
      if (qK) grupos.push({ pset: 'Quantitativos', origem: 'instância', props: [
        { n: 'Comprimento', v: String(qK.comprimento == null ? '—' : qK.comprimento) },
        { n: 'Área', v: String(qK.area == null ? '—' : qK.area) },
        { n: 'Volume', v: String(qK.volume == null ? '—' : qK.volume) }] });
      grupos.push({ pset: 'Lista completa de propriedades', origem: 'instância', props: [
        { n: 'Não está guardada', v: 'Abra o arquivo .ifc de novo para ver todas as propriedades desta peça.' }] });
      return grupos;
    }
    if (mo && mo.sintetico) { // criado no OrçaPRO: propriedades do editor
      var elS = (mo.elementos || []).filter(function (e) { return e.id === expressID; })[0];
      if (elS && elS.qto) grupos.push({ pset: "Dimensões (criado no OrçaPRO)", origem: "instância", props: [
        { n: "Comprimento (m)", v: String(elS.qto.comprimento || 0) }, { n: "Área (m²)", v: String(elS.qto.area || 0) }, { n: "Volume (m³)", v: String(elS.qto.volume || 0) }] });
      return grupos;
    }
    try {
      // psets da instância
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES);
      var n = rels.size();
      for (var i = 0; i < n; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        var meu = false;
        for (var o = 0; o < objs.length; o++) if (objs[o] && objs[o].value === expressID) { meu = true; break; }
        if (!meu) continue;
        lerPropsDePset(mid, rel.RelatingPropertyDefinition.value, grupos, "instância");
      }
      // psets do TIPO (família)
      var fam = (mo && mo.familias && mo.familias[expressID]) || null;
      if (fam && fam.tipoId != null) {
        var tipoObj; try { tipoObj = S.api.GetLine(mid, fam.tipoId, false); } catch (_) { tipoObj = null; }
        if (tipoObj && tipoObj.HasPropertySets) {
          var hps = Array.isArray(tipoObj.HasPropertySets) ? tipoObj.HasPropertySets : [tipoObj.HasPropertySets];
          for (var t = 0; t < hps.length; t++) if (hps[t] && hps[t].value != null) lerPropsDePset(mid, hps[t].value, grupos, "família");
        }
      }
    } catch (e) { /* bônus */ }
    return grupos;
  }

  // Fator linear do prefixo do IfcSIUnit de um tipo (LENGTHUNIT/AREAUNIT/VOLUMEUNIT). Ex.: CENTI→0.01.
  // Devolve null se o tipo não estiver declarado no arquivo. IMPORTANTE: no IFC, área e volume têm
  // unidade PRÓPRIA (SQUARE_METRE/CUBIC_METRE, quase sempre m²/m³ mesmo com comprimento em cm/mm) —
  // por isso NÃO se converte área com comprimento². Só se AREAUNIT/VOLUMEUNIT faltarem é que caímos
  // no derivado (comprimento² / comprimento³).
  function unidadePrefixoBase(mid, tipo) {
    try {
      var us = S.api.GetLineIDsWithType(mid, IFC_SIUNIT), n = us.size();
      for (var i = 0; i < n; i++) {
        var u; try { u = S.api.GetLine(mid, us.get(i), false); } catch (_) { continue; }
        if (!u || !u.UnitType || u.UnitType.value !== tipo) continue;
        var p = u.Prefix && u.Prefix.value;
        return p === 'MILLI' ? 0.001 : p === 'CENTI' ? 0.01 : p === 'DECI' ? 0.1 : p === 'KILO' ? 1000 : 1;
      }
    } catch (_) {}
    return null;
  }

  // Lê BaseQuantities (IfcElementQuantity) por elemento → {comprimento, area, volume, contagem} já
  // em metros/m²/m³. Espelha lerCarimbosOrcaPro, mas atua nos psets que têm .Quantities (não
  // .HasProperties — exatamente os que o traversal de carimbos pula). Escolhe por nome:
  // comprimento='Length' (ignora Width/Height/Perímetro); área/volume preferem 'Net' sobre 'Gross'.
  // Quando existir, o motor de quantitativos prefere isto (MEDIDO) ao AABB (ESTIMADO). Blindado:
  // qualquer falha devolve o que já achou — quantidade é bônus, NUNCA impede o 3D de abrir.
  function lerQuantitativos(mid) {
    var mapa = {};
    // 3 fatores independentes → metros / m² / m³. Área/volume usam a unidade própria (m²/m³ se
    // declarada); só caem no comprimento²/³ se AREAUNIT/VOLUMEUNIT não existirem no arquivo.
    var bL = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (bL == null) bL = 1;
    var bA = unidadePrefixoBase(mid, 'AREAUNIT'), bV = unidadePrefixoBase(mid, 'VOLUMEUNIT');
    var fLen = bL, fArea = (bA != null ? bA * bA : bL * bL), fVol = (bV != null ? bV * bV * bV : bL * bL * bL);
    function vnum(x) { if (x == null) return NaN; if (typeof x === 'object') x = x.value; var v = parseFloat(x); return isNaN(v) ? NaN : v; }
    try {
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELDEFINESBYPROPERTIES), nRel = rels.size();
      for (var i = 0; i < nRel; i++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(i), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingPropertyDefinition || !rel.RelatedObjects) continue;
        var qid = rel.RelatingPropertyDefinition.value; if (qid == null) continue;
        var qset; try { qset = S.api.GetLine(mid, qid, false); } catch (_) { continue; }
        if (!qset) continue;
        var comp = { v: 0, s: -1 }, ar = { v: 0, s: -1 }, vol = { v: 0, s: -1 }, cont = 0;
        /* ⚠ MUITO IFC NÃO TEM BaseQuantities — E O COMPRIMENTO ESTÁ LÁ MESMO ASSIM.
         *
         * Este leitor só olhava `IfcElementQuantity`. Medido num projeto
         * hidrossanitário real de creche (80 MB, 1.725 IFCFLOWSEGMENT): o
         * arquivo tem ZERO IfcElementQuantity e ZERO IfcQuantityLength — e
         * tem 1.725 propriedades `Length`, uma por tubo, em
         * `Pset_FlowSegmentPipeSegment`. O comprimento estava publicado; o
         * leitor é que olhava só uma das duas gavetas. A tela dizia "sem
         * comprimento no IFC" sobre um arquivo que trazia todos.
         *
         * ⚠ MAIS ESTRITO QUE NA GAVETA DAS QUANTIDADES, de propósito. Num
         *   `IfcElementQuantity`, um `LengthValue` já se declara comprimento
         *   mesmo sem nome. Num pset comum cabe qualquer número: aqui o nome
         *   TEM de dizer comprimento — anônimo não vira cota. */
        if (!qset.Quantities && qset.HasProperties) {
          var props = Array.isArray(qset.HasProperties) ? qset.HasProperties : [qset.HasProperties];
          for (var pp = 0; pp < props.length; pp++) {
            var ph = props[pp]; if (!ph || ph.value == null) continue;
            var pv; try { pv = S.api.GetLine(mid, ph.value, false); } catch (_) { continue; }
            if (!pv || pv.type !== IFC_PROPERTYSINGLEVALUE || !pv.NominalValue) continue;
            var pnm = (pv.Name && pv.Name.value) ? String(pv.Name.value).toLowerCase() : '';
            if (/width|height|thick|depth|perimet|larg|altura|espess|diamet|diâmet|bore|radius|raio/.test(pnm)) continue;
            var sP = pnm === 'length' ? 3 : /length|comprim/.test(pnm) ? 2 : 0;
            if (!sP) continue;
            var Pv = vnum(pv.NominalValue.value);
            if (isNaN(Pv) || Pv <= 0) continue;
            if (sP > comp.s) comp = { v: Pv, s: sP };
          }
          if (comp.s < 0) continue;
          /* mesma unidade do projeto que as quantidades usam: IfcPositiveLengthMeasure
             é expresso no LENGTHUNIT declarado no arquivo */
          var qtoP = { comprimento: comp.v * fLen, area: 0, volume: 0, contagem: 0,
            compFonte: comp.s === 3 ? 'exata' : 'nomeada' };
          var objsP = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
          for (var op = 0; op < objsP.length; op++) {
            var ohp = objsP[op]; if (!ohp || ohp.value == null) continue;
            var eidp = ohp.value;
            if (!mapa[eidp]) mapa[eidp] = { comprimento: 0, area: 0, volume: 0, contagem: 0, compFonte: '' };
            if (qtoP.comprimento > mapa[eidp].comprimento) { mapa[eidp].comprimento = qtoP.comprimento; mapa[eidp].compFonte = qtoP.compFonte; }
          }
          continue;
        }
        if (!qset.Quantities) continue; // nem quantidade nem propriedade útil
        var qs = Array.isArray(qset.Quantities) ? qset.Quantities : [qset.Quantities];
        for (var q = 0; q < qs.length; q++) {
          var qh = qs[q]; if (!qh || qh.value == null) continue;
          var qv; try { qv = S.api.GetLine(mid, qh.value, false); } catch (_) { continue; }
          if (!qv) continue;
          var nm = (qv.Name && qv.Name.value) ? String(qv.Name.value).toLowerCase() : '';
          if (qv.LengthValue != null) {
            var Lv = vnum(qv.LengthValue); if (isNaN(Lv)) continue;
            /* ⚠ O VETO FOI ESCRITO PARA PAREDE E NÃO CONHECIA O VOCABULÁRIO DA REDE.
             * Faltavam DIÂMETRO e RAIO. Num qset de tubo ou duto que carimbe
             * `Diameter`/`NominalDiameter` e NÃO carimbe `Length` — exportador
             * que só publica a bitola, caso comum —, o diâmetro sobrevivia ao
             * filtro, ganhava nota 1 por falta de concorrente e virava "o
             * comprimento": um duto DN 400 saía com 0,40 m. Plausível, errado, e
             * em cima da peça que alguém vai serrar. */
            if (/width|height|thick|depth|perimet|larg|altura|espess|diamet|diâmet|bore|radius|raio/.test(nm)) continue;
            var sL = nm === 'length' ? 3 : /length|comprim/.test(nm) ? 2 : 1;
            /* ⚠ E a nota vira DADO, não só desempate. `s === 1` é uma quantidade
             * de comprimento SEM nome que diga comprimento — pode ser a peça,
             * pode ser outra dimensão que ninguém batizou. Serve para somar num
             * quantitativo que o engenheiro confere; não serve para carimbar um
             * número sobre o tubo, onde não há contexto para desconfiar. Quem
             * consome decide, mas agora sabe. */
            if (sL > comp.s) comp = { v: Lv, s: sL };
          } else if (qv.AreaValue != null) {
            var Av = vnum(qv.AreaValue); if (isNaN(Av)) continue;
            var sA = /net/.test(nm) ? 3 : /gross/.test(nm) ? 2 : 1;
            if (sA > ar.s) ar = { v: Av, s: sA };
          } else if (qv.VolumeValue != null) {
            var Vv = vnum(qv.VolumeValue); if (isNaN(Vv)) continue;
            var sV = /net/.test(nm) ? 3 : /gross/.test(nm) ? 2 : 1;
            if (sV > vol.s) vol = { v: Vv, s: sV };
          } else if (qv.CountValue != null) {
            var Cv = vnum(qv.CountValue); if (!isNaN(Cv)) cont += Cv;
          }
        }
        if (comp.s < 0 && ar.s < 0 && vol.s < 0 && cont === 0) continue;
        var qto = { comprimento: comp.s >= 0 ? comp.v * fLen : 0, area: ar.s >= 0 ? ar.v * fArea : 0, volume: vol.s >= 0 ? vol.v * fVol : 0, contagem: cont,
          /* 'exata' = a quantidade se chama Length; 'nomeada' = o nome cita
             comprimento; 'anonima' = e de comprimento mas ninguem a batizou. */
          compFonte: comp.s === 3 ? 'exata' : comp.s === 2 ? 'nomeada' : comp.s === 1 ? 'anonima' : '' };
        var objs = Array.isArray(rel.RelatedObjects) ? rel.RelatedObjects : [rel.RelatedObjects];
        for (var o = 0; o < objs.length; o++) {
          var oh = objs[o]; if (!oh || oh.value == null) continue;
          var eid = oh.value;
          // um elemento pode ter mais de um IfcElementQuantity → fica o MAIOR por dimensão (não soma, p/ não duplicar)
          if (!mapa[eid]) mapa[eid] = { comprimento: 0, area: 0, volume: 0, contagem: 0, compFonte: '' };
          if (qto.comprimento > mapa[eid].comprimento) { mapa[eid].comprimento = qto.comprimento; mapa[eid].compFonte = qto.compFonte; }
          if (qto.area > mapa[eid].area) mapa[eid].area = qto.area;
          if (qto.volume > mapa[eid].volume) mapa[eid].volume = qto.volume;
          if (qto.contagem > mapa[eid].contagem) mapa[eid].contagem = qto.contagem;
        }
      }
    } catch (e) { /* quantidade é bônus; nunca impede o modelo de abrir */ }
    return mapa;
  }

  // Lê os IfcBuildingStorey + a relação de contenção espacial → [{sid, nome, elev, eids:[expressID]}].
  // Elevation vem na unidade CRUA do arquivo (×fLen) e o placement pode deslocar — por isso é só
  // FALLBACK de ordenação; a altura confiável (y0) vem do AABB dos membros, no mundo (metros),
  // preenchida depois que as malhas existem. Blindado: pavimento é bônus, nunca impede o 3D.
  function lerPavimentos(mid) {
    var out = [], st = {};
    try {
      var fLen = unidadePrefixoBase(mid, 'LENGTHUNIT'); if (fLen == null) fLen = 1;
      var ids = S.api.GetLineIDsWithType(mid, IFC_BUILDINGSTOREY), n = ids.size();
      for (var i = 0; i < n; i++) {
        var sid = ids.get(i), ln; try { ln = S.api.GetLine(mid, sid, false); } catch (_) { continue; }
        if (!ln) continue;
        var nome = (ln.Name && ln.Name.value) || (ln.LongName && ln.LongName.value) || ('Pavimento ' + (out.length + 1));
        var reg = { sid: sid, nome: String(nome), elev: null, y0: null, eids: [] };
        var ev = ln.Elevation; if (ev && typeof ev === 'object') ev = ev.value;
        ev = parseFloat(ev); if (!isNaN(ev)) reg.elev = ev * fLen;
        st[sid] = reg; out.push(reg);
      }
      if (!out.length) return out;
      var rels = S.api.GetLineIDsWithType(mid, IFC_RELCONTAINEDINSPATIALSTRUCTURE), nR = rels.size();
      for (var r = 0; r < nR; r++) {
        var rel; try { rel = S.api.GetLine(mid, rels.get(r), false); } catch (_) { continue; }
        if (!rel || !rel.RelatingStructure || rel.RelatingStructure.value == null) continue;
        var alvo = st[rel.RelatingStructure.value]; if (!alvo) continue; // contido em Building/Space, não em pavimento
        var els = Array.isArray(rel.RelatedElements) ? rel.RelatedElements : (rel.RelatedElements ? [rel.RelatedElements] : []);
        for (var k2 = 0; k2 < els.length; k2++) { var h2 = els[k2]; if (h2 && h2.value != null) alvo.eids.push(h2.value); }
      }
    } catch (_) { /* pavimento é bônus; nunca impede o modelo de abrir */ }
    return out;
  }

  // ---------- MULTI-IFC: cada arquivo vira um MODELO independente (disciplina + transparência próprias) ----------
  function detectarDisciplina(nome, tipos) {
    var n = String(nome || '').toLowerCase();
    if (/estrut|struct|\best[_\-.]|founda/.test(n)) return 'estrutural';
    if (/arq|arch/.test(n)) return 'arquitetura';
    if (/hidr|hydro|sanit|agua|água|esgoto|plumb/.test(n)) return 'hidraulica';
    if (/elet|elec|el[ée]tr/.test(n)) return 'eletrica';
    if (/avac|hvac|mec[aâ]|clima/.test(n)) return 'mecanica';
    var t = tipos || {};
    var est = (t.IFCBEAM || 0) + (t.IFCCOLUMN || 0) + (t.IFCFOOTING || 0) + (t.IFCPILE || 0) + (t.IFCMEMBER || 0);
    var hid = (t.IFCFLOWSEGMENT || 0) + (t.IFCFLOWFITTING || 0) + (t.IFCFLOWTERMINAL || 0);
    var arq = (t.IFCWALL || 0) + (t.IFCWALLSTANDARDCASE || 0) + (t.IFCDOOR || 0) + (t.IFCWINDOW || 0) + (t.IFCCOVERING || 0) + (t.IFCROOF || 0) + (t.IFCSLAB || 0);
    var max = Math.max(est, hid, arq);
    if (!max) return 'arquitetura';
    return max === hid ? 'hidraulica' : (max === est ? 'estrutural' : 'arquitetura');
  }
  function modeloDe(mid) { for (var i = 0; i < S.modelos.length; i++) if (S.modelos[i].mid === mid) return S.modelos[i]; return null; }
  function publicos() { return S.modelos.map(function (mo) { return { mid: mo.mid, nome: mo.nome, disciplina: mo.disciplina, alpha: mo.alpha, visivel: mo.visivel, n: mo.elementos.length, modeloId: mo.modeloId || '', arquivoId: mo.versaoId || '', doCache: !!mo.doCache, sintetico: !!mo.sintetico, temColeta: !!mo._coleta, semCache: mo._semCache || '', exemplo: !!mo.exemplo }; }); }
  function notifyModelos() { if (S._reaplicarEstilo) S._reaplicarEstilo(); if (S._reaplicarSistema) S._reaplicarSistema(); if (S.opts && S.opts.onModelos) { try { S.opts.onModelos(publicos()); } catch (_) {} } } // estilo desenho E cor-por-sistema pegam modelo que entrar depois
  S._publicos = publicos;

  /* =====================================================================
   * B3 — ISOLAR E PINTAR UM CONJUNTO
   *
   * O motor (js/bimset.js) devolve CHAVES do B0; a cena entende `uid`. Estas
   * três funções são a ponte, e ficam aqui porque dependem da cena — a regra
   * em si não depende de nada disto e por isso mora no motor puro.
   * ===================================================================== */
  var _corMatCache = {};
  function corMat(hex, alpha) {
    var a = (alpha == null ? 1 : alpha);
    var k = hex + '_' + a.toFixed(2);
    if (!_corMatCache[k]) {
      _corMatCache[k] = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex), metalness: .05, roughness: .85, side: THREE.DoubleSide,
        transparent: a < 1, opacity: a, depthWrite: a >= 1
      });
    }
    return _corMatCache[k];
  }

  function uidsDeChaves(chaves) {
    var alvo = {}, out = [];
    (chaves || []).forEach(function (c) { alvo[c] = 1; });
    (S.elementos || []).forEach(function (e) { if (e.chave && alvo[e.chave]) out.push(e.uid); });
    return out;
  }

  /* deixa visível só o que está no conjunto. Usa o mesmo caminho do isolar por
     seleção, então o botão ↺ Restaurar tudo desfaz como o usuário já espera. */
  function isolarChaves(chaves) {
    var alvo = {}, n = 0;
    uidsDeChaves(chaves).forEach(function (u) { alvo[u] = 1; });
    todasMalhas(function (m) {
      if (m.userData.expressID == null) return;
      var vis = !!alvo[m.userData.mid + ':' + m.userData.expressID] && !ehFuturo4d(m) && !ehRemovidoEd(m);
      m.visible = vis; if (vis) n++;
    });
    pav.isolado = null; pav.manual = true; pavRender();
    return n;
  }

  /* pinta o conjunto. `mapa` é { chave: '#rrggbb' } — vem do perfil de cores do
     motor, onde a PRIMEIRA regra que casa manda. */
  function pintarChaves(mapa) {
    var porUid = {}, n = 0;
    var alvo = mapa || {};
    (S.elementos || []).forEach(function (e) {
      if (e.chave && alvo[e.chave]) { porUid[e.uid] = alvo[e.chave]; n++; }
    });
    S._pintura = n ? porUid : null;
    S.modelos.forEach(function (mo) { refreshModelo(mo); });
    return n;
  }
  function limparPintura() { S._pintura = null; S.modelos.forEach(function (mo) { refreshModelo(mo); }); }
  S._isolarChaves = isolarChaves; S._pintarChaves = pintarChaves; S._limparPintura = limparPintura;
  S._uidsDeChaves = uidsDeChaves;

  /* =====================================================================
   * B6 — APLICAR A SIMULACAO 4D DIRIGIDA POR TAREFAS
   *
   * O motor (js/bimtarefa.js) decide QUEM esta em que estado numa data; aqui
   * fica so o que a cena sabe fazer: esconder, pintar com opacidade e
   * contornar.
   *
   * ⚠ O CONTORNO DO ATRASO VAI NUMA MALHA SO. A tentacao e criar um
   * LineSegments por peca atrasada — e foi exatamente isso que o B2 mediu
   * custando 1.793 draw calls no caminho da planta. Aqui as arestas de todas
   * as pecas atrasadas sao mescladas num unico BufferGeometry: um objeto,
   * uma chamada de desenho, independente de haver 3 ou 300 atrasos.
   *
   * ⚠ E ELE NAO PISCA. O atraso precisa aparecer numa FOTO que vai para o
   * relatorio; cor que pisca sai ora de um jeito ora de outro e o engenheiro
   * nao consegue mandar a imagem para o cliente.
   * ===================================================================== */
  var _lnAtraso = null, _lnAtrasoMat = null;
  var MAX_CONTORNO = 4000;   /* pecas; acima disso so a cor, e a tela avisa */

  function limparContorno4D() {
    if (_lnAtraso && _lnAtraso.parent) _lnAtraso.parent.remove(_lnAtraso);
    if (_lnAtraso && _lnAtraso.geometry) { try { _lnAtraso.geometry.dispose(); } catch (e) {} }
    _lnAtraso = null;
  }

  function aplicar4DTarefas(sim) {
    if (!S || !sim) return { ok: false, erro: 'simulação vazia' };
    /* o 4D manda na visibilidade inteira: o isolamento por pavimento deixa de
       valer, como ja acontece no aplicarEstado do 4D automatico */
    if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }

    var fora = {};
    uidsDeChaves(sim.ocultos || []).forEach(function (u) { fora[u] = 1; });

    var porChave = {}, n = 0;
    Object.keys(sim.pinturas || {}).forEach(function (k) { porChave[k] = sim.pinturas[k]; n++; });
    var porUid = {};
    (S.elementos || []).forEach(function (e) { if (e.chave && porChave[e.chave]) porUid[e.uid] = porChave[e.chave]; });
    S._pintura = n ? porUid : null;
    S._fut4d = fora;   /* o 🏢/👁 compoe com isto e nao ressuscita o que ainda nao existe */

    cadaMalha(function (m) {
      var id = m.userData.expressID; if (id == null) return;
      var uid = m.userData.mid + ':' + id;
      if (fora[uid] || ehRemovidoEd(m)) { m.visible = false; return; }
      m.visible = true;
      if (m === S.selected) return;
      m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material);
    });

    /* ---- o contorno do atraso, numa malha so ---- */
    limparContorno4D();
    var alvos = uidsDeChaves(Object.keys(sim.contornos || {}));
    var res = { ok: true, ocultos: Object.keys(fora).length, pintados: n, contornados: 0, contornoCortado: false };
    if (!alvos.length) return res;
    var mapaUid = {};
    alvos.forEach(function (u) { mapaUid[u] = 1; });
    var pos = [], usados = 0, cortou = false;
    var _v = new THREE.Vector3();
    cadaMalha(function (m) {
      if (m.userData.expressID == null) return;
      if (!mapaUid[m.userData.mid + ':' + m.userData.expressID]) return;
      if (usados >= MAX_CONTORNO) { cortou = true; return; }
      var g = m.geometry;
      if (!g || !g.attributes || !g.attributes.position) return;
      /* malha densa fica sem contorno: o EdgesGeometry dela sozinho trava a aba
         (mesma guarda que o contorno da selecao ja usa desde a v1.1.89) */
      if (g.attributes.position.count > 60000) return;
      /* ⚠ O CACHE DE ARESTAS JÁ EXISTE — use-o. Construir um EdgesGeometry por
         peça a cada quadro custava ~0,29 ms cada; num arrasto com 350 peças
         atrasadas são 100 ms por evento, e a régua arrastava atrás do dedo.
         A geometria não muda enquanto o modelo está aberto, e `arestasDe`
         guarda por geometria num WeakMap, em espaço LOCAL — que é o que este
         laço consome, porque aplica a `matrixWorld` logo em seguida. */
      var arr;
      try { arr = arestasDe(g); } catch (e) { return; }
      if (!arr || !arr.length) return;
      var mw = m.matrixWorld;
      for (var i = 0; i < arr.length; i += 3) {
        _v.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(mw);
        pos.push(_v.x, _v.y, _v.z);
      }
      usados++;
    });
    if (pos.length) {
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var cor = sim.contornos[Object.keys(sim.contornos)[0]] || '#ea580c';
      if (!_lnAtrasoMat) _lnAtrasoMat = new THREE.LineBasicMaterial({ color: new THREE.Color(cor), depthTest: true, transparent: false });
      else _lnAtrasoMat.color = new THREE.Color(cor);
      _lnAtraso = new THREE.LineSegments(bg, _lnAtrasoMat);
      _lnAtraso.renderOrder = 998;
      scene.add(_lnAtraso);
    }
    res.contornados = usados;
    res.contornoCortado = cortou;
    return res;
  }

  function limpar4DTarefas() {
    limparContorno4D();
    S._pintura = null; S._fut4d = null; S._and4d = null;
    cadaMalha(function (m) { m.visible = !ehRemovidoEd(m); if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); });
  }
  S._aplicar4DTarefas = aplicar4DTarefas; S._limpar4DTarefas = limpar4DTarefas;

  /* =====================================================================
   * B4 — LER E APLICAR UM PONTO DE VISTA
   *
   * O motor (js/bimvista.js) decide o que a vista E; aqui ficam as duas pontas
   * que so a cena sabe fazer: onde a camera esta agora, e como voltar para la.
   * ===================================================================== */
  function cameraAtual() {
    var alvo = (orbit && orbit.target) ? orbit.target : { x: 0, y: 0, z: 0 };
    return {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      alvo: [alvo.x, alvo.y, alvo.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
      fov: camera.fov, orto: false
    };
  }

  /* ⚠ APLICAR NA ORDEM CERTA: camera, depois visibilidade, depois cor. Aplicar
   * a visibilidade antes da camera faria o `enquadrar` interno de alguns
   * caminhos re-mirar o que sobrou, e a vista salva abriria noutro angulo — o
   * oposto do que um ponto de vista promete. */
  function aplicarVista(v, opts) {
    if (!v) return { ok: false, erro: 'ponto de vista vazio' };
    opts = opts || {};
    var res = { ok: true, naoLocalizadas: [] };
    try {
      var c = v.camera;
      if (c && c.pos) {
        camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
        if (c.up) camera.up.set(c.up[0], c.up[1], c.up[2]);
        if (c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
        if (orbit && orbit.target && c.alvo) { orbit.target.set(c.alvo[0], c.alvo[1], c.alvo[2]); orbit.update(); }
        camera.lookAt(c.alvo[0], c.alvo[1], c.alvo[2]);
      }
      var r = (typeof window !== 'undefined' && window.BimVista) ? window.BimVista.resolver(v, S.elementos || []) : null;
      if (r) {
        res.naoLocalizadas = r.naoLocalizadas;
        if (r.isolados.length) isolarChaves(r.isolados);
        else if (r.ocultos.length) {
          var fora = {};
          uidsDeChaves(r.ocultos).forEach(function (u) { fora[u] = 1; });
          todasMalhas(function (m) {
            if (m.userData.expressID == null) return;
            if (fora[m.userData.mid + ':' + m.userData.expressID]) m.visible = false;
          });
          pav.isolado = null; pav.manual = true; pavRender();
        }
        if (r.aparencias.length) {
          var mapa = {};
          r.aparencias.forEach(function (a) {
            function h(x) { var t = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16); return t.length < 2 ? '0' + t : t; }
            mapa[a.chave] = '#' + h(a.cor[0]) + h(a.cor[1]) + h(a.cor[2]);
          });
          pintarChaves(mapa);
        }
      }
    } catch (e) { return { ok: false, erro: String(e && e.message || e) }; }
    return res;
  }
  S._cameraAtual = cameraAtual; S._aplicarVista = aplicarVista;

  // material corrente de um mesh respeitando a TRANSPARÊNCIA do modelo dele
  function matBase(m) {
    /* ⚠ B3 — A COR DO CONJUNTO ENTRA AQUI, e não num `m.material = …` solto.
     * `refreshModelo` reescreve o material de toda malha do modelo a cada troca
     * de transparência, disciplina ou estilo. Pintura aplicada por fora seria
     * apagada pelo primeiro ajuste que o usuário fizesse, sem nada na tela
     * explicando por quê. Entrando na aparência-base, ela sobrevive — e vale de
     * uma vez no 3D, na Planta e no imersivo, como a cor por sistema.
     * ⚠ E o material NÃO tem `emissive`: com o B2 ligado, peça com emissão sai
     * do desenho mesclado e vira chamada própria — pintar um conjunto de 600
     * peças custaria 600 chamadas. */
    if (S._pintura) {
      var _cp = S._pintura[m.userData.mid + ':' + m.userData.expressID];
      if (_cp) {
        var _moP = modeloDe(m.userData.mid);
        /* ⚠ A PINTURA PASSOU A TER DOIS FORMATOS, e o antigo continua valendo.
           O B3 (conjuntos) grava uma string de cor; o B6 (4D) precisa de cor E
           opacidade — "em execucao" e translucido de proposito, para o
           engenheiro ver o que esta atras. Trocar o formato quebraria o B3,
           que ja esta no ar; aceitar os dois nao quebra nada. */
        if (typeof _cp === 'object' && _cp) {
          var _aM = (_moP ? _moP.alpha : 1);
          var _aP = (_cp.opacidade == null ? 1 : _cp.opacidade);
          return corMat(_cp.cor, Math.min(_aM, _aP));
        }
        return corMat(_cp, _moP ? _moP.alpha : 1);
      }
    }
    // v1.1.96 — modo "colorir por sistema" ligado: a aparência-base vira a COR DO SISTEMA
    // hidrossanitário (isto faz a cor valer no 3D, na Planta e no imersivo de uma vez).
    if (sisColor.on) { var _moS = modeloDe(m.userData.mid); return sisMat(m.userData._sisK || 'outros', _moS ? _moS.alpha : 1); }
    var mo = modeloDe(m.userData.mid);
    var orig = m.userData.matOrig || m.material;
    if (!mo || mo.alpha >= 0.99) return orig;
    var k = orig.uuid;
    if (!mo.transCache[k]) {
      var c = orig.clone();
      c.transparent = true; c.opacity = (orig.opacity != null ? orig.opacity : 1) * mo.alpha; c.depthWrite = false;
      mo.transCache[k] = c;
    }
    return mo.transCache[k];
  }
  S._matBase = matBase;
  function refreshModelo(mo) {
    mo.grupo.visible = !!mo.visivel;
    mo.grupo.children.forEach(function (m) {
      if (m === S.selected) return;
      if (S._clashSel && S._clashSel.indexOf(m) !== -1) return;
      if (m.material === S.matAndamento) return; // estado 4D "em andamento" mantém o âmbar
      if (xray.on && xray.ghosted.indexOf(m) !== -1) return; // raio-X: preserva o fantasma (senão trocar transparência/cor-por-sistema desfaz o isolamento)
      m.material = matBase(m);
    });
  }
  function setTransparencia(mid, alpha) {
    var mo = modeloDe(mid); if (!mo) return;
    mo.alpha = Math.max(0.05, Math.min(1, +alpha || 0));
    Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
    mo.transCache = {};
    refreshModelo(mo); notifyModelos();
  }
  function setVisivel(mid, v) { var mo = modeloDe(mid); if (!mo) return; mo.visivel = !!v; mo.grupo.visible = !!v; notifyModelos(); }
  function setDisciplina(mid, d) {
    var mo = modeloDe(mid); if (!mo) return;
    mo.disciplina = d; mo.elementos.forEach(function (e) { e.disciplina = d; });
    notifyModelos();
    if (opts.onLoaded) opts.onLoaded(elementosVivos()); // 4D/QTO/clash replanejam com a disciplina nova
  }
  function atualizarHud() {
    var el = 0, tri = 0;
    S.modelos.forEach(function (mo) { el += mo.nEl || 0; tri += mo.nTri || 0; });
    hud.querySelector('[data-h="el"]').textContent = el.toLocaleString('pt-BR');
    hud.querySelector('[data-h="tri"]').textContent = Math.round(tri).toLocaleString('pt-BR');
  }
  function rebuildIndices() {
    S.elementos = []; S.meshPorId = {}; S.meshPorUid = {};
    S.modelos.forEach(function (mo) {
      S.elementos = S.elementos.concat(mo.elementos);
      mo.grupo.children.forEach(function (m) {
        var eid = m.userData.expressID; if (eid == null) return;
        S.meshPorId[eid] = m; S.meshPorUid[mo.mid + ':' + eid] = m;
      });
    });
  }
  function removerModelo(mid) {
    var mo = modeloDe(mid); if (!mo) return;
    desagregarModelo(mo);     /* B2: as malhas mescladas saem junto */
    /* o indice de cotas guarda uid e ancora deste modelo: invalida e apaga o
       que estiver na tela, senao sobra cota pendurada no vazio */
    if (S._setCota && S._cotaEstado && S._cotaEstado().on) S._setCota(false);
    S.modelos.splice(S.modelos.indexOf(mo), 1);
    mo.grupo.children.slice().forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } if (m.userData && m.userData._edgeLn && m.userData._edgeLn.geometry) { try { m.userData._edgeLn.geometry.dispose(); } catch (_) {} } });
    Object.keys(mo.matCache).forEach(function (k) { try { mo.matCache[k].dispose(); } catch (_) {} });
    Object.keys(mo.transCache).forEach(function (k) { try { mo.transCache[k].dispose(); } catch (_) {} });
    modelRoot.remove(mo.grupo);
    if (typeof mid === 'number') { try { S.api.CloseModel(mid); } catch (_) {} } // mid sintético ('p3dN') no embind vira >>>0 = 0 e FECHARIA o 1º IFC real
    if (S.selected && S.selected.userData.mid === mid) { S.selected = null; S.prevMat = null; if (S._contornoSelecao) S._contornoSelecao(null); }
    if (S._limparRaioX) S._limparRaioX(); // raio-X segura refs de malhas que podem ter saído do modelo removido
    S._clashSel = (S._clashSel || []).filter(function (m) { return m.userData.mid !== mid; });
    rebuildIndices(); atualizarHud(); notifyModelos();
    if (S._limparMedidas) S._limparMedidas(); // medidas referenciam coordenadas que podem ter saído
    if (S._ctecCancelar) S._ctecCancelar(); // linha de corte riscada pode referenciar o modelo removido
    if (!S.modelos.length && S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    else if (S.planta && S.planta.on && S._replanejarCorte) S._replanejarCorte(); // sobrou modelo: corte re-ancorado
    if (S.corteL && S.corteL.on && S._aplicarCorteL) S._aplicarCorteL(); // re-ancora (ou sai, se o bbox esvaziou)
    if (S._xrReSnap) S._xrReSnap(); // imersivo câmera/caminhar: re-ancora a escala no bbox restante (ou sai se esvaziou)
    if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender(); // isolamento (🏢 OU 👁) pode ter ficado sem alvo
    if (mid === 'edit' && S._editReset) S._editReset(); // apagar "Criados no OrçaPRO" = zerar edições (senão replay ressuscita + pins órfãos)
    if (opts.onLoaded) opts.onLoaded(elementosVivos());
    if (!S.modelos.length) { over.style.display = 'flex'; limparSisMatCache(); } // sem modelos: nenhuma malha referencia os materiais de sistema → pode liberar a GPU (com modelos vivos, NÃO limpar: eles ainda apontam pro cache global)
  }
  function limparTudo() {
    if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
    if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
    if (S._ctecCancelar) S._ctecCancelar();
    if (S._limparMedidas) S._limparMedidas();
    /* as cotas da rede vao junto: elas apontam para uid de modelo que esta
       saindo, e o indice ficaria com anconra de coisa que nao existe mais */
    if (S._setCota) S._setCota(false);
    /* ⚠ o 🗑 tem de tirar os modelos da OBRA, nao so da cena. Sem este aviso,
       o usuario limpava tudo para comecar do zero, saia da aba, voltava — e a
       restauracao devolvia exatamente os modelos que ele acabou de remover. */
    var indoEmbora = S.modelos.map(function (mo) { return { mid: mo.mid, modeloId: mo.modeloId || '', arquivoId: mo.versaoId || '', sintetico: !!mo.sintetico }; });
    S.modelos.slice().forEach(function (mo) { removerModelo(mo.mid); });
    if (S.opts && S.opts.onModelosRemovidos) { try { S.opts.onModelosRemovidos(indoEmbora); } catch (_) {} }
    if (S._editReset) S._editReset(); // 🗑 limpa TAMBÉM as edições (anotações/removidos sem modelo 'edit')
    S.carimbos = {}; S.qto = {}; S._fut4d = null; S._remEd = null;
    /* ⚠ O CONTORNO DO ATRASO MORA EM `scene`, NÃO EM `modelRoot` — tirar os
       modelos deixava um esqueleto laranja pairando numa cena vazia. E a
       pintura do 4D fica no `_pintura`, que o `matBase` consulta antes de tudo:
       sem zerar, o próximo modelo carregado nasceria com a cor do cronograma
       do modelo anterior. */
    try { limparContorno4D(); } catch (_c4) {}
    S._pintura = null; S._and4d = null;
    pav.isolado = null; pav.manual = false; pavRender();
  }
  S._setTransparencia = setTransparencia; S._setVisivel = setVisivel; S._setDisciplina = setDisciplina;
  /* ⚠ AQUI, e nao onde as funcoes sao declaradas: `S` so passa a existir
     algumas centenas de linhas depois delas, e atribuir antes estoura o
     `montar` inteiro — a aba BIM nao abre. */
  S._carimbarConsulta = carimbarConsulta; S._valoresDe = valoresDe;   /* B3 */
  S._removerModelo = removerModelo; S._limparTudo = limparTudo;

  async function carregarIFC(arrayBuffer, nome, disc, ehExemplo) {
    // identidade + vida: um FileReader em voo de um viewer MORTO não pode nem apagar o overlay
    // nem despejar meshes/índices no viewer NOVO (S global pode já ser outra instância)
    if (S !== Sm || !S.alive) return;
    over.style.display = 'none'; loading.style.display = 'flex';
    loading.querySelector('[data-l="txt"]').textContent = 'Lendo ' + (nome || 'IFC') + '…';
    if (S.modelos.length >= 8) { loading.style.display = 'none'; over.style.display = S.modelos.length ? 'none' : 'flex'; try { alert('Limite de 8 modelos abertos ao mesmo tempo. Remova um antes de abrir outro (memória de vídeo).'); } catch (_) {} return; }
    var mid;
    try {
      await initApi();
      if (S !== Sm || !S.alive) return; // o mundo pode ter mudado durante o await (ctx-lost + remount)
      var data = new Uint8Array(arrayBuffer);
      mid = S.api.OpenModel(data);
      S.modelID = mid; // compat: "modelo corrente" = último carregado
      var modelo = { mid: mid, nome: nome || ('Modelo ' + (S.modelos.length + 1)), disciplina: disc || '', alpha: 1, visivel: true, grupo: new THREE.Group(), matCache: {}, transCache: {}, elementos: [], tipos: {}, nEl: 0, nTri: 0 };
      modelo._bytes = data; // v1.1.85: guarda os bytes do IFC p/ o ☁️ Compartilhar na nuvem (RA/RV)
      /* B0: o LUGAR do arquivo na obra (sobrevive a versao nova) e o hash do
         CONTEUDO (muda a cada reexportacao, de proposito — invalida cache e
         alimenta a comparacao entre versoes; NUNCA entra na chave) */
      /* ⚠ a ORDEM importa desde o B1: o conteudo identifica o arquivo, e e
         por ele que a federacao acha a vaga do modelo. Derivar o modeloId
         antes de conhecer o versaoId cairia sempre no nome. */
      modelo.versaoId = (typeof window !== 'undefined' && window.BimId) ? window.BimId.versaoId(data, data.length) : '';
      modelo.modeloId = idModelo(modelo.nome, modelo.versaoId);
      modelo.grupo.userData.mid = mid;
      modelRoot.add(modelo.grupo);
      // carimbos do exportador pyRevit + BaseQuantities — merge nos mapas compartilhados (4D/5D)
      var carimbos = lerCarimbosOrcaPro(mid), qto = lerQuantitativos(mid);
      modelo.carimbos = carimbos; modelo.qto = qto; // por modelo (expressID colide entre IFCs)
      modelo.familias = lerTipos(mid); // v1.1.82: família/tipo por elemento (Revit → IfcTypeObject)
      modelo.sistemas = lerSistemas(mid); // v1.1.98: SISTEMA por elemento (IfcSystem) → cor por sistema hidrossanitário
      modelo.pavimentos = lerPavimentos(mid); // 🏢 (y0 real preenchido depois, pelo AABB dos membros)
      var tmpMat = new THREE.Matrix4();
      var getMat = criarGetMat(modelo);
      /* B1: a coleta para o cache anda junto com a montagem — os dados so
         existem aqui, `geo.delete()` os devolve ao WASM logo abaixo.
         ⚠ E ela guarda a REFERENCIA, sem copiar: `GetVertexArray`/
         `GetIndexArray` do web-ifc terminam em `.slice(0)`, entao ja sao
         copias proprias, e `m.applyMatrix4` age no OBJETO (a matriz do mesh),
         nao na geometria — ninguem mexe nesses vetores depois. Copiar aqui
         dobraria a memoria sem motivo. */
      var colG = [], colI = [], colVistos = {}, colBytes = 0, colOk = !!(typeof window !== 'undefined' && window.BimCache);
      S.api.StreamAllMeshes(mid, function (mesh) {
        var geos = mesh.geometries, n = geos.size(), tipoNum = 0;
        try { tipoNum = S.api.GetLineType(mid, mesh.expressID); } catch (_) {}
        var tipoNome = nomeTipo(tipoNum);
        var tKey = String(tipoNome).toUpperCase(); modelo.tipos[tKey] = (modelo.tipos[tKey] || 0) + 1;
        for (var i = 0; i < n; i++) {
          var pg = geos.get(i), geo = S.api.GetGeometry(mid, pg.geometryExpressID);
          var verts = S.api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
          var idx = S.api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
          var nv = verts.length / 6, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
          for (var v = 0; v < nv; v++) { pos[v * 3] = verts[v * 6]; pos[v * 3 + 1] = verts[v * 6 + 1]; pos[v * 3 + 2] = verts[v * 6 + 2]; nor[v * 3] = verts[v * 6 + 3]; nor[v * 3 + 1] = verts[v * 6 + 4]; nor[v * 3 + 2] = verts[v * 6 + 5]; }
          var bg = new THREE.BufferGeometry();
          bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
          bg.setIndex(new THREE.BufferAttribute(idx, 1));
          var c = pg.color, m = new THREE.Mesh(bg, getMat(c.x, c.y, c.z, c.w));
          tmpMat.fromArray(pg.flatTransformation); m.applyMatrix4(tmpMat);
          m.userData.expressID = mesh.expressID; m.userData.tipo = tipoNome; m.userData.mid = mid; m.userData.matOrig = m.material;
          modelo.grupo.add(m);
          S.meshPorId[mesh.expressID] = m; S.meshPorUid[mid + ':' + mesh.expressID] = m;
          if (colOk) {
            var gK = String(pg.geometryExpressID);
            if (!colVistos[gK]) {
              colBytes += pos.byteLength + nor.byteLength + idx.byteLength;
              if (colBytes > TETO_COLETA) { colOk = false; colG = []; colI = []; colVistos = {}; }
              else { colVistos[gK] = 1; colG.push({ gid: gK, pos: pos, nor: nor, idx: idx }); }
            }
            /* ⚠ a MATRIZ em dupla precisao: `flatTransformation` vem em double do
               web-ifc e e ela que carrega a POSICAO da peca no mundo. Estreitar
               aqui perdia precisao ANTES de o motor do cache ver o numero — foi
               medido no navegador (3,9 µm num modelo de ~100 m; num IFC
               georreferenciado isso vira metro). A cor pode ser float32: e 0..1. */
            if (colOk) colI.push({ e: mesh.expressID, gid: gK, m: new Float64Array(pg.flatTransformation), cor: new Float32Array([c.x, c.y, c.z, c.w]) });
          }
          modelo.nTri += idx.length / 3; geo.delete();
        }
        var cb = carimbos[mesh.expressID] || {};
        var famEl = (modelo.familias && modelo.familias[mesh.expressID]) || null;
        /* B0: a identidade que sobrevive a reexportacao. O `uid` fica ao lado
           porque toda a maquina de malhas e indices e feita nele; o que muda e
           que o que se GRAVA passa a ser a `chave`. */
        var idIfc = lerIdentidadeIfc(S.api, mid, mesh.expressID);
        var idB = idElemento(modelo.modeloId, { id: mesh.expressID, globalId: idIfc.globalId });
        modelo.elementos.push({ globalId: idB.globalId, chave: idB.chave, chaveInstavel: idB.instavel, nomeIfc: idIfc.nomeIfc, tag: idIfc.tag, id: mesh.expressID, uid: mid + ':' + mesh.expressID, mid: mid, arquivo: modelo.nome, tipo: tipoNome, nome: rotuloDisciplina(tipoNome), familia: famEl ? famEl.familia : null, sistemaIfc: (modelo.sistemas && modelo.sistemas[mesh.expressID]) || '', etapa: cb.etapa || null, codOrc: cb.codOrc || null, fase: cb.fase || null, qto: (qto && qto[mesh.expressID]) || null });
        modelo.nEl++;
      });
      modelo.disciplina = detectarDisciplina(modelo.nome, modelo.tipos);
      modelo.elementos.forEach(function (e) { e.disciplina = modelo.disciplina; });
      /* B1: fica pendurado no modelo ate a casca gravar (ou desistir). Nao e
         o viewer quem escreve no disco — a fronteira do produto diz que quem
         persiste e a casca. */
      modelo._coleta = colOk ? { geometrias: colG, instancias: colI, bytes: colBytes } : null;
      /* ⚠ POR QUE ELE NAO COUBE, para a casca poder DIZER. Sem isto o modelo
         entrava na obra, nunca era guardado, e toda reabertura pedia o arquivo
         de novo — a mesma frase, para sempre, sem o usuario jamais saber o
         motivo nem ter como consertar. */
      /* ⚠ O MODELO DE DEMONSTRAÇÃO NÃO É DA OBRA DO CLIENTE. Ele é o IFC de
         outra obra (Murumbir, da RA). Sem esta marca ele entrava em
         `bim_modelos`, voltava na cena a cada abertura, era contado por
         "Gerar orçamento do modelo" e subia para a nuvem junto com o resto. */
      modelo.exemplo = !!ehExemplo;
      modelo._semCache = colOk ? '' : (colBytes > TETO_COLETA
        ? 'a geometria deste modelo passa de ' + Math.round(TETO_COLETA / (1024 * 1024)) + ' MB — ele abre normalmente, mas não fica guardado para reabrir rápido'
        : 'o motor de cache não carregou nesta sessão');
      S.modelos.push(modelo);
      recarimbarIdentidade();   /* B0 */
      agregarModelo(modelo);    /* B2 */
      carimbarConsulta();     /* B3 */
      atualizarHud();
      if (planta.on) setPlanta(false); // carregar modelo com a planta ativa: sai da planta (senão vista fica incoerente)
      if (corteL.on) setCorteL(false); // idem corte livre (o bbox mudou; o usuário re-corta no modelo federado)
      enquadrar(); loading.style.display = 'none';
      // AABB (mundo) por elemento do modelo novo — p/ compatibilização entre DISCIPLINAS
      try {
        modelRoot.updateMatrixWorld(true);
        var caixas = {};
        modelo.grupo.children.forEach(function (m) {
          var id = m.userData && m.userData.expressID; if (id == null) return;
          var bb = new THREE.Box3().setFromObject(m); if (bb.isEmpty()) return;
          if (!caixas[id]) caixas[id] = bb; else caixas[id].union(bb);
        });
        modelo.elementos.forEach(function (elx) { var bb = caixas[elx.id]; if (bb) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
        // 🏢 altura real de cada pavimento = menor Y (mundo, metros) entre os membros com malha
        (modelo.pavimentos || []).forEach(function (pv) {
          var y0 = Infinity;
          pv.eids.forEach(function (eid) { var bb = caixas[eid]; if (bb && bb.min.y < y0) y0 = bb.min.y; });
          if (isFinite(y0)) pv.y0 = y0;
        });
      } catch (_) {}
      S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
      // isolamento antigo (🏢 OU 👁) ficaria incoerente (modelo novo nasce visível) -> restaura; senão só re-lista
      if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
      if (S._editReaplicarRem) S._editReaplicarRem(); // "removidos na edição" persistidos valem pro IFC que acabou de chegar
      notifyModelos();
      avisarModeloCarregado(modelo);   /* B1: a casca grava o cache e a federacao */
      if (opts.onLoaded) opts.onLoaded(elementosVivos());
    } catch (err) {
      try { if (mid != null && mid !== -1) S.api.CloseModel(mid); } catch (_) {}
      try { if (typeof modelo !== 'undefined' && modelo && S.modelos.indexOf(modelo) === -1) { (modelo.grupo.children || []).forEach(function (m) { if (m.geometry) { try { m.geometry.dispose(); } catch (_) {} } }); Object.keys(modelo.matCache || {}).forEach(function (k) { try { modelo.matCache[k].dispose(); } catch (_) {} }); modelRoot.remove(modelo.grupo); } } catch (_) {}
      try { rebuildIndices(); } catch (_) {} // meshPorId E meshPorUid sem restos do modelo que falhou (o manual só limpava o Uid)
      loading.style.display = 'none'; if (!S.modelos.length) over.style.display = 'flex';
      over.querySelector('div').innerHTML = '<div style="font-size:30px">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + '</div><h3 style="margin:8px 0">Não consegui ler este IFC</h3><p style="color:#a9c1d8;font-size:13px">' + esc(String(err && err.message || err)) + '</p><p style="color:#a9c1d8;font-size:12px">Confira se é um .ifc válido (IFC2x3 ou IFC4).</p>';
    }
  }
  function rotuloDisciplina(ifcName) { var u = String(ifcName).toUpperCase(); return TIPOS[u] || String(ifcName).replace(/^IFC/, ''); }

  /* =====================================================================
   * B1 — MONTAR O MODELO A PARTIR DO CACHE, SEM WASM
   *
   * Espelha `carregarIFC` do ponto em que ela ja tem os dados. O molde e o
   * `carregarSintetico` (2D->3D), que ja monta cena sem web-ifc desde a fase C.
   *
   * ⚠ A CENA TEM DE SAIR IDENTICA a de uma abertura normal — mesma malha por
   * peca, mesma matriz no OBJETO (nao assada na geometria), mesmos indices
   * `meshPorId`/`meshPorUid`. Cache que monta "quase igual" e pior que cache
   * nenhum: trena, encaixe e corte tecnico passariam a responder diferente
   * conforme a obra tivesse sido aberta antes ou nao.
   * ===================================================================== */
  function criarGetMat(modelo) {
    return function (r, g, b, a) {
      var k = (r * 255 | 0) + '_' + (g * 255 | 0) + '_' + (b * 255 | 0) + '_' + a.toFixed(2);
      if (!modelo.matCache[k]) modelo.matCache[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), transparent: a < 1, opacity: a, metalness: .05, roughness: .85, side: THREE.DoubleSide });
      return modelo.matCache[k];
    };
  }

  function montarDoCache(reg, estado) {
    estado = estado || {};
    if (!S || !S.alive) return { ok: false, erro: 'visualizador não está montado' };
    if (typeof window === 'undefined' || !window.BimCache) return { ok: false, erro: 'motor de cache não carregado' };
    if (S.modelos.length >= 8) return { ok: false, erro: 'Limite de 8 modelos abertos ao mesmo tempo.' };

    /* ⚠ o mid e STRING, e isso e requisito, nao estilo: `removerModelo` so
       chama `CloseModel` quando o mid e numero, e uma string no embind vira 0,
       que FECHARIA o primeiro IFC de verdade. */
    var mid = 'cache' + (++cacheSeq);
    var r = BimCache.paraCena(reg, mid);
    if (!r.ok) return { ok: false, erro: r.erro };
    var c = r.modelo;

    /* ⚠ o nome vem do registro da OBRA, nao do cache. O cache e chaveado por
       conteudo e o mesmo arquivo pode estar em duas obras com nomes
       diferentes — a ultima importacao sobrescrevia o campo `nome` do
       registro compartilhado, e a outra obra passava a exibir o rotulo da
       vizinha. */
    var nomeDaObra = String(estado.nome || '') || c.nome;
    var modelo = {
      mid: mid, doCache: true, nome: nomeDaObra,
      disciplina: '', alpha: 1, visivel: true,
      grupo: new THREE.Group(), matCache: {}, transCache: {},
      elementos: c.elementos, tipos: c.tipos, nEl: c.nEl, nTri: 0,
      versaoId: c.arquivoId, modeloId: '',
      /* os mapas que so o WASM sabia produzir — e por eles que o modelo
         restaurado continua tendo etapa, quantitativo, familia e pavimento */
      carimbos: c.carimbos, qto: c.qto, familias: c.familias, sistemas: c.sistemas,
      pavimentos: c.pavimentos, topologia: c.topologia, bitolas: c.bitolas,
      fatorLenCache: c.fatorLen, bytesArquivo: c.bytesArquivo, convertidoEm: c.criadoEm
    };
    modelo.grupo.userData.mid = mid;
    modelRoot.add(modelo.grupo);

    var getMat = criarGetMat(modelo);
    var tmpM = new THREE.Matrix4();
    var tipoPorId = {};
    for (var t = 0; t < c.elementos.length; t++) { tipoPorId[c.elementos[t].id] = c.elementos[t].tipo; c.elementos[t].arquivo = nomeDaObra; }

    for (var i = 0; i < c.instancias.length; i++) {
      var it = c.instancias[i];
      var g = c.geometrias[it.g]; if (!g) continue;
      var bg = new THREE.BufferGeometry();
      /* copia por instancia, igual a abertura normal: geometria compartilhada
         entre malhas e o B2, e mexe em raycast, trena e descarte */
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.nor), 3));
      bg.setIndex(new THREE.BufferAttribute(new Uint32Array(g.idx), 1));
      var cor = it.cor || [1, 1, 1, 1];
      var m = new THREE.Mesh(bg, getMat(cor[0], cor[1], cor[2], cor[3]));
      tmpM.fromArray(it.m); m.applyMatrix4(tmpM);
      m.userData.expressID = it.e; m.userData.tipo = tipoPorId[it.e] || ''; m.userData.mid = mid; m.userData.matOrig = m.material;
      modelo.grupo.add(m);
      S.meshPorId[it.e] = m; S.meshPorUid[mid + ':' + it.e] = m;
      modelo.nTri += g.idx.length / 3;
    }

    /* a disciplina escolhida pelo usuario NAQUELA obra manda; sem escolha,
       detecta como na abertura normal */
    modelo.disciplina = String(estado.disciplina || '') || detectarDisciplina(modelo.nome, modelo.tipos);
    modelo.elementos.forEach(function (e) { e.disciplina = modelo.disciplina; });

    S.modelos.push(modelo);
    recarimbarIdentidade();   /* B0 */
    agregarModelo(modelo);    /* B2 */
    carimbarConsulta();     /* B3 */
    atualizarHud();
    if (planta.on) setPlanta(false);
    if (corteL.on) setCorteL(false);
    enquadrar(); over.style.display = 'none'; loading.style.display = 'none';

    /* caixa envolvente por peca e altura real do pavimento: THREE puro, sao
       recalculados de proposito (guardar criaria uma segunda verdade) */
    try {
      modelRoot.updateMatrixWorld(true);
      var caixas = {};
      modelo.grupo.children.forEach(function (mm) {
        var id = mm.userData && mm.userData.expressID; if (id == null) return;
        var bb = new THREE.Box3().setFromObject(mm); if (bb.isEmpty()) return;
        if (!caixas[id]) caixas[id] = bb; else caixas[id].union(bb);
      });
      modelo.elementos.forEach(function (elx) { var bb = caixas[elx.id]; if (bb) elx.aabb = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] }; });
      (modelo.pavimentos || []).forEach(function (pv) {
        var y0 = Infinity;
        (pv.eids || []).forEach(function (eid2) { var bb2 = caixas[eid2]; if (bb2 && bb2.min.y < y0) y0 = bb2.min.y; });
        if (isFinite(y0)) pv.y0 = y0;
      });
    } catch (_) {}

    S.elementos = []; S.modelos.forEach(function (mo) { S.elementos = S.elementos.concat(mo.elementos); });
    if (pav.isolado || pav.manual) restaurarVisibilidade(); else pavRender();
    if (S._editReaplicarRem) S._editReaplicarRem();

    /* o que o usuario tinha ajustado nesta obra volta pelos caminhos normais */
    if (estado.visivel === false && S._setVisivel) S._setVisivel(mid, false);
    var al = +estado.alpha;
    if (isFinite(al) && al > 0 && al < 1 && S._setTransparencia) S._setTransparencia(mid, al);

    notifyModelos();
    avisarModeloCarregado(modelo);
    if (S._xrReSnap) S._xrReSnap();
    if (opts && opts.onLoaded) opts.onLoaded(elementosVivos());
    return { ok: true, mid: mid, nome: modelo.nome, nEl: modelo.elementos.length };
  }
  S._montarDoCache = montarDoCache; S._dadosParaCache = dadosParaCache; S._soltarColeta = soltarColeta;

  function avisarModeloCarregado(mo) {
    if (!mo || !S.opts || !S.opts.onModeloCarregado) return;
    try {
      S.opts.onModeloCarregado({
        mid: mo.mid, nome: mo.nome, arquivoId: mo.versaoId || '', modeloId: mo.modeloId || '',
        disciplina: mo.disciplina || '', doCache: !!mo.doCache, exemplo: !!mo.exemplo,
        temColeta: !!mo._coleta, semCache: mo._semCache || '', nEl: (mo.elementos || []).length
      });
    } catch (_) {}
  }

  /* o pacote que a casca entrega ao BimCache.montar — o viewer nao escreve no
     disco, so entrega dado simples */
  function dadosParaCache(mid) {
    var mo = modeloDe(mid);
    if (!mo || !mo._coleta || mo.doCache || mo.sintetico) return null;
    return {
      arquivoId: mo.versaoId, nome: mo.nome, bytesArquivo: (mo._bytes && mo._bytes.length) || 0,
      criadoEm: new Date().toISOString(), webIfc: '0.0.44', three: THREE.REVISION ? ('r' + THREE.REVISION) : '',
      geometrias: mo._coleta.geometrias, instancias: mo._coleta.instancias,
      elementos: mo.elementos, tipos: mo.tipos, carimbos: mo.carimbos, qto: mo.qto,
      familias: mo.familias, sistemas: mo.sistemas, pavimentos: mo.pavimentos,
      topologia: mo.topologia || lerTopologiaRede(mo.mid), bitolas: bitolasDoModelo(mo),
      fatorLen: fatorLen(mo.mid), nEl: mo.elementos.length, nTri: mo.nTri
    };
  }
  /* bitola por peca: so existe via WASM, e sem ela o modelo restaurado perde a
     cota de rede e a relacao de tubos — recursos que o produto ja vende */
  function bitolasDoModelo(mo) {
    var out = {}, f = fatorLen(mo.mid);
    (mo.elementos || []).forEach(function (e) {
      if (!/IFCPIPE|IFCDUCT|IFCFLOWSEGMENT/i.test(String(e.tipo || ''))) return;
      try { var b = lerBitolaMm(mo.mid, e.id, f); if (b) out[e.id] = b; } catch (_) {}
    });
    return out;
  }
  /* a coleta e grande: uma vez gravada (ou recusada), sai da memoria */
  function soltarColeta(mid) { var mo = modeloDe(mid); if (mo) mo._coleta = null; }

  function abrirArquivo(file) { var fr = new FileReader(); fr.onload = function () { enfileirar(function () { return carregarIFC(fr.result, file.name); }); }; fr.readAsArrayBuffer(file); }
  // v1.1.85 — carrega IFC a partir de bytes (compartilhamento em nuvem: o celular baixa o modelo do VPS)
  S._abrirBytes = function (ab, nome, disc) { enfileirar(function () { return carregarIFC(ab, nome || 'modelo.ifc', disc); }); };
  // modelos IFC atuais com bytes guardados (p/ subir pra nuvem) — sintéticos/editor ficam de fora
  S._bytesModelos = function () { return S.modelos.filter(function (m) { return m._bytes && m._bytes.length; }).map(function (m) { return { nome: m.nome, disc: m.disciplina || '', bytes: m._bytes }; }); };
  function carregarExemplo() {
    // v1.1.97 — exemplo = modelo REAL de obra (Murumbir, RA Engenharia) da nuvem; atualizável sem
    // release e sem inchar o pacote. Offline/sem nuvem cai no exemplo embutido (bim/samples/exemplo.ifc).
    var CLOUD = 'https://orcapro.raengenhariaespecial.com.br/samples/murumbir-demolicao.ifc';
    function embutido() { fetch('bim/samples/exemplo.ifc').then(function (r) { return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'exemplo.ifc', '', true); }); }).catch(function () { over.querySelector('div').innerHTML = '<div style="font-size:30px">' + (typeof Icones !== 'undefined' ? Icones.get('tabela', 15) : '') + '</div><p style="color:#a9c1d8">Abra um arquivo .ifc seu — o exemplo não foi encontrado.</p>'; }); }
    fetch(CLOUD).then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); }).then(function (ab) { enfileirar(function () { return carregarIFC(ab, 'Murumbir — Demolição (exemplo)', '', true); }); }).catch(embutido);
  }
  S._abrirArquivo = abrirArquivo; S._carregarExemplo = carregarExemplo;
}

// desmonta um viewer MORTO (pós webglcontextlost): remove listeners globais, cancela o RAF,
// libera os modelos do WASM e o renderer — deixa o caminho limpo pro montar() criar um novo.
function desmontarMorto() {
  if (!S) return;
  try { if (S.xr && S.xr.on && S._sairImersivo) S._sairImersivo(); } catch (_) {} // fecha sessão XR/loop antes de derrubar
  try { S._xrActive = false; if (S.renderer && S.renderer.setAnimationLoop) S.renderer.setAnimationLoop(null); } catch (_) {}
  try { if (S.raf) cancelAnimationFrame(S.raf); } catch (_) {}
  try { if (Reuniao.on) Reuniao.sair(); } catch (_) {}
  try { if (S._onKeyDown) window.removeEventListener('keydown', S._onKeyDown); } catch (_) {}
  try { if (S._onKeyUp) window.removeEventListener('keyup', S._onKeyUp); } catch (_) {}
  try { if (S._onMouseMove) document.removeEventListener('mousemove', S._onMouseMove); } catch (_) {}
  try { if (S._resize) window.removeEventListener('resize', S._resize); } catch (_) {}
  try { if (S._ajustarTop) window.removeEventListener('resize', S._ajustarTop); } catch (_) {}
  try { if (S._fabObserver) S._fabObserver.disconnect(); } catch (_) {}
  try { if (S._fabEstilo) window.removeEventListener('resize', S._fabEstilo); } catch (_) {}
  /* o ouvinte de rolagem sai junto: sem isto cada remontagem do viewer deixa
     mais um rAF por quadro amarrado a um dock que já não existe */
  try { if (S._dockRolar) window.removeEventListener('scroll', S._dockRolar, true); } catch (_) {}
  try { if (S._dockDocClick) document.removeEventListener('click', S._dockDocClick, true); } catch (_) {}
  try { S.modelos.slice().forEach(function (mo) { if (typeof mo.mid === 'number') { try { S.api.CloseModel(mo.mid); } catch (_) {} } }); } catch (_) {}
  try { S.renderer.dispose(); } catch (_) {}
  S = null;
}
// itera as MALHAS REAIS de todos os modelos (um elemento pode ter VÁRIAS malhas — uma por cor;
// meshPorUid guarda só a última, então visibilidade via mapa deixava peças meio-escondidas)
function cadaMalha(fn) { if (!S) return; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(fn); }); }
// "removido na edição" (✏️ apagarIfc) compõe com TODO escritor de visibilidade — mesma família
// do ehFuturo4d: sem isto, 4D/isolar/restaurar/focar ressuscitam o que o editor ocultou.
function ehRemovidoEd(m) {
  var r = S && S._remEd; if (!r) return false;
  return !!r[m.userData.mid + ':' + m.userData.expressID];
}
// elementos SEM os "removidos na edição" — o que o EAP/QTO/4D/clash consomem tem que ser
// o MESMO modelo que o viewer mostra (peça apagada no ✏️ não pode ser orçada/quantificada)
function elementosVivos() {
  if (!S) return [];
  var r = S._remEd; if (!r) return S.elementos.slice();
  return S.elementos.filter(function (e) { return !r[e.uid]; });
}
// aplica o estado 4D: esconde futuros; construídos = material original; em andamento = âmbar
function aplicarEstado(est) {
  if (!S) return;
  // 4D sobrescreve a visibilidade inteira -> o isolamento (🏢/👁) deixa de valer; limpa o marcador
  if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
  var fut = {}, and = {};
  (est && est.futuros || []).forEach(function (id) { fut[id] = 1; });
  (est && est.emAndamento || []).forEach(function (id) { and[id] = 1; });
  S._fut4d = fut; // isolamento 🏢/👁 compõe com isto (não ressuscita futuros)
  S._and4d = and; // "em andamento" (âmbar): o restore do raio-X consulta isto p/ NÃO apagar o âmbar do 4D
  cadaMalha(function (m) {
    var id = m.userData.expressID; if (id == null) return;
    var uid = m.userData.mid + ':' + id;
    var chave = (fut[uid] != null || and[uid] != null) ? uid : id;
    if (fut[chave] || ehRemovidoEd(m)) { m.visible = false; return; }
    m.visible = true;
    if (m === S.selected) return; // não mexe no selecionado
    m.material = and[chave] ? S.matAndamento : (S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material));
  });
}
function mostrarTudo() {
  if (!S) return;
  if (S.pav && (S.pav.isolado || S.pav.manual)) { S.pav.isolado = null; S.pav.manual = false; if (S._pavRender) S._pavRender(); }
  S._fut4d = null; S._and4d = null; // sair do 4D: nada mais é "futuro" nem "em andamento"
  cadaMalha(function (m) { m.visible = !ehRemovidoEd(m); if (m !== S.selected) m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); });
}

// Compatibilização: destaca (vermelho) os elementos de um clash e enquadra a câmera no par.
function focarClash(ids) {
  if (!S) return;
  // caminho EXTERNO (gestao.js "ver clash"): sai da Planta/Corte/Trena antes de voar a câmera —
  // senão o clash fica clipado pelo plano de corte e a órbita segue travada ("não funciona")
  if (S.planta && S.planta.on && S._setPlanta) S._setPlanta(false);
  if (S.corteL && S.corteL.on && S._setCorteL) S._setCorteL(false);
  if (S.medir && S.medir.on && S._setMedir) S._setMedir(false);
  if (S.area && S.area.on && S._setArea) S._setArea(false);
  if (S.ang && S.ang.on && S._setAng) S._setAng(false);
  if (S._fecharCtecModal && S.ctecModal && S.ctecModal.style.display === 'flex') S._fecharCtecModal(); // modal do resultado tapa o viewer -> fecha antes de voar a câmera
  if (S._ctecCancelar) S._ctecCancelar();
  if (S.edit && S.edit.on && S._setEdit) S._setEdit(false); // editor armado + câmera voando = clique seguinte criaria parede sem querer (setEdit já limpa a cadeia)
  if (S.p3dPanel && S.p3dPanel.style.display === 'flex') S.p3dPanel.style.display = 'none'; // modal 2D→3D também taparia o clash
  limparClash();
  // desfaz a seleção anterior ANTES de pintar o par de vermelho: devolve o material e apaga o contorno verde
  // (senão o selMat/contorno da seleção antiga sobrevivem por cima da cena do clash). Gate v1.1.89.
  if (S.selected) { S.selected.material = S.prevMat; S.selected = null; S.prevMat = null; }
  if (S._contornoSelecao) S._contornoSelecao(null);
  var idset = {}; (ids || []).forEach(function (id) { idset[id] = 1; });
  var box = new THREE.Box3(), any = false;
  S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) {
    if (m.userData && (idset[m.userData.mid + ':' + m.userData.expressID] || idset[m.userData.expressID])) {
      if (ehRemovidoEd(m)) return; // "removido na edição" não é destacável — segue oculto
      m.visible = true; m.material = S.clashMat; box.expandByObject(m); any = true; S._clashSel.push(m);
    }
  }); });
  if (any) {
    var size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 2, dist = maxDim * 3 + 2;
    S.camera.position.set(c.x + dist * .7, c.y + dist * .55, c.z + dist * .7);
    S.camera.near = Math.max(0.01, maxDim / 100); S.camera.far = Math.max(1000, maxDim * 200); S.camera.updateProjectionMatrix();
    S.orbit.target.copy(c); S.orbit.update();
    S.fly.yaw = Math.atan2(S.camera.position.x - c.x, S.camera.position.z - c.z); S.fly.pitch = -0.3;
  }
}
function limparClash() { if (!S) return; (S._clashSel || []).forEach(function (m) { m.material = S._matBase ? S._matBase(m) : (m.userData.matOrig || m.material); }); S._clashSel = []; }

// ============================================================
// REFINO DO CLASH — geometria REAL (triângulo-a-triângulo, motor BIMTri)
// sobre os pares que o envelope (AABB) apontou. Cada clash ganha
// geo = 'confirmado' (tri de A atravessa tri de B) | 'descartado' (caixas se
// tocam mas a geometria não) | 'nao-verificavel' (sem malha/cap estourado —
// honesto: não-verificável NÃO vira "sem conflito"). Só triângulos dentro da
// caixa de interseção (expandida) entram no teste — mantém o custo baixo.
// ============================================================
function refinarClash(clashes, opts) {
  clashes = clashes || [];
  if (!S || typeof window === 'undefined' || !window.BIMTri) return clashes;
  opts = opts || {};
  var MAX_TRI = opts.maxTriPorElemento || 40000; // por ELEMENTO (malha completa em mundo)
  var FOLGA = opts.folga != null ? opts.folga : 0.01;
  var MAX_TESTES = opts.maxTestes || 400000;     // pares tri×tri por clash
  var MAX_CLASHES = opts.maxClashes || 800;      // refina os N piores (a lista já vem ordenada)
  var DEADLINE_MS = opts.deadlineMs || 2500;     // orçamento GLOBAL: estourou -> resto vira não-verificável (UI explica)
  var MODO_FOLGA = opts.modo === "folga";        // B5: mede distância em vez de cruzamento
  var FOLGA_ALVO = opts.folgaAlvo != null ? opts.folgaAlvo : 0.30;
  try { S.modelRoot.updateMatrixWorld(true); } catch (_) {} // RAF pode estar congelado (aba em background)
  var t0 = performance.now();
  // índice uid/eid -> malhas (um elemento pode ter VÁRIAS malhas)
  var porId = {};
  S.modelRoot.children.forEach(function (g) {
    (g.children || []).forEach(function (m) {
      var ud = m.userData || {}; if (ud.expressID == null) return;
      var uid = ud.mid + ':' + ud.expressID;
      (porId[uid] = porId[uid] || []).push(m);
      (porId[ud.expressID] = porId[ud.expressID] || []).push(m);
    });
  });
  var _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
  // CACHE por elemento (achado do gate: o mesmo elemento grande aparece em dezenas de clashes —
  // transformar a malha 1x por elemento, não 1x por clash): id -> { tris: Float32Array (mundo),
  // aabb: [x0,y0,z0,x1,y1,z1] } | 'cap' | null (sem malha)
  var cache = {};
  function cacheDe(id) {
    if (id in cache) return cache[id];
    var malhas = porId[id];
    if (!malhas || !malhas.length) return (cache[id] = null);
    var total = 0, mi, m, g;
    for (mi = 0; mi < malhas.length; mi++) {
      g = malhas[mi].geometry;
      if (g && g.attributes && g.attributes.position) total += Math.floor(((g.index ? g.index.array.length : g.attributes.position.count)) / 3);
    }
    if (total > MAX_TRI) return (cache[id] = 'cap');
    var arr = new Float32Array(total * 9), w = 0;
    var bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
    for (mi = 0; mi < malhas.length; mi++) {
      m = malhas[mi]; g = m.geometry;
      if (!g || !g.attributes || !g.attributes.position) continue;
      var pos = g.attributes.position, idx = g.index ? g.index.array : null;
      var nTri = Math.floor((idx ? idx.length : pos.count) / 3), mw = m.matrixWorld;
      for (var t = 0; t < nTri; t++) {
        var i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
        _va.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        _vb.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        _vc.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        arr[w] = _va.x; arr[w + 1] = _va.y; arr[w + 2] = _va.z;
        arr[w + 3] = _vb.x; arr[w + 4] = _vb.y; arr[w + 5] = _vb.z;
        arr[w + 6] = _vc.x; arr[w + 7] = _vc.y; arr[w + 8] = _vc.z;
        w += 9;
        if (_va.x < bx0) bx0 = _va.x; if (_va.x > bx1) bx1 = _va.x; if (_va.y < by0) by0 = _va.y; if (_va.y > by1) by1 = _va.y; if (_va.z < bz0) bz0 = _va.z; if (_va.z > bz1) bz1 = _va.z;
        if (_vb.x < bx0) bx0 = _vb.x; if (_vb.x > bx1) bx1 = _vb.x; if (_vb.y < by0) by0 = _vb.y; if (_vb.y > by1) by1 = _vb.y; if (_vb.z < bz0) bz0 = _vb.z; if (_vb.z > bz1) bz1 = _vb.z;
        if (_vc.x < bx0) bx0 = _vc.x; if (_vc.x > bx1) bx1 = _vc.x; if (_vc.y < by0) by0 = _vc.y; if (_vc.y > by1) by1 = _vc.y; if (_vc.z < bz0) bz0 = _vc.z; if (_vc.z > bz1) bz1 = _vc.z;
      }
    }
    return (cache[id] = { tris: arr.subarray(0, w), aabb: [bx0, by0, bz0, bx1, by1, bz1] });
  }
  // recorte da malha em cache pela zona da interseção (+folga)
  function filtrar(ce, caixa, exp) {
    var E = FOLGA + (exp || 0);
    var x0 = caixa.min[0] - E, y0 = caixa.min[1] - E, z0 = caixa.min[2] - E;
    var x1 = caixa.max[0] + E, y1 = caixa.max[1] + E, z1 = caixa.max[2] + E;
    var tris = ce.tris, out = [];
    for (var b = 0; b < tris.length; b += 9) {
      var tx0 = Math.min(tris[b], tris[b + 3], tris[b + 6]), tx1 = Math.max(tris[b], tris[b + 3], tris[b + 6]);
      if (tx1 < x0 || tx0 > x1) continue;
      var ty0 = Math.min(tris[b + 1], tris[b + 4], tris[b + 7]), ty1 = Math.max(tris[b + 1], tris[b + 4], tris[b + 7]);
      if (ty1 < y0 || ty0 > y1) continue;
      var tz0 = Math.min(tris[b + 2], tris[b + 5], tris[b + 8]), tz1 = Math.max(tris[b + 2], tris[b + 5], tris[b + 8]);
      if (tz1 < z0 || tz0 > z1) continue;
      for (var q = 0; q < 9; q++) out.push(tris[b + q]);
    }
    return out;
  }
  function contido(bIn, bOut) { // AABB bIn dentro de bOut (com folga)
    return bIn[0] >= bOut[0] - FOLGA && bIn[1] >= bOut[1] - FOLGA && bIn[2] >= bOut[2] - FOLGA &&
           bIn[3] <= bOut[3] + FOLGA && bIn[4] <= bOut[4] + FOLGA && bIn[5] <= bOut[5] + FOLGA;
  }
  for (var i = 0; i < clashes.length; i++) {
    var c = clashes[i]; if (!c) continue;
    if (i >= MAX_CLASHES || performance.now() - t0 > DEADLINE_MS) { c.geo = 'nao-verificavel'; continue; }
    if (!c.inter || !c.inter.min || !c.inter.max) { c.geo = 'nao-verificavel'; continue; }
    var A = cacheDe(c.aId), B = cacheDe(c.bId);
    if (A === null || A === 'cap' || B === null || B === 'cap') { c.geo = 'nao-verificavel'; continue; }
    /* ⚠ NO MODO FOLGA A CAIXA `inter` NAO CONTEM SUPERFICIE NENHUMA.
       Ela e a intersecao das AABB DILATADAS: com as pecas separadas por um
       vao `g`, ela e uma FATIA DENTRO DO VAO, de espessura folga - g,
       centrada entre as duas. A superficie de A fica em `g - folga/2` de
       distancia da borda da fatia — ou seja, FORA dela sempre que o vao
       passar de metade da folga pedida.
       Recortar por ela zerava os dois lados, o par saia como "descartado",
       e o modo folga perdia CALADO metade da faixa que o usuario pediu:
       com folga de 30 cm, nada entre 15 e 30 cm era achado.
       Reabrir por folga/2 e exatamente o necessario e suficiente:
       inter.min - folga/2 = B.min - folga <= A.max sempre que o vao real
       for <= folga; e simetrico do outro lado. Menos perde face, mais so
       custa triangulo. No modo rigido a expansao e zero e nada muda. */
    var EXP = MODO_FOLGA ? FOLGA_ALVO / 2 : 0;
    var ta = filtrar(A, c.inter, EXP), tb = filtrar(B, c.inter, EXP);
    var conf = false, naoVer = false;
    if (ta.length && tb.length) {
      if (MODO_FOLGA) {
        /* ⚠ B5 modo FOLGA: a pergunta nao e "cruza?" e sim "quao perto?".
           distMalhas para no primeiro par abaixo do limite — o modo so
           precisa do SIM, e varrer o resto custaria o detector inteiro.
           A distancia so e anotada quando ELE ACHOU: quando nao acha, o
           motor devolve null de proposito, porque o menor par examinado
           nao e o minimo verdadeiro (o pre-filtro por caixa descarta
           pares que podem estar mais perto). Numero inventado aqui vira
           decisao de obra. */
        var rf = window.BIMTri.distMalhas(ta, tb, { limite: FOLGA_ALVO, maxTestes: MAX_TESTES });
        if (rf.estourou) naoVer = true;
        else if (rf.abaixo) { conf = true; c.distancia = rf.distancia; }
      } else {
        var r = window.BIMTri.algumIntersecta(ta, tb, MAX_TESTES);
        if (r.estourou) naoVer = true; else conf = r.confirmado;
      }
    }
    // CONTENÇÃO TOTAL (achado bloqueador do gate): tubo INTEIRO dentro da viga não tem
    // cruzamento de superfície — teste ponto-dentro-do-sólido (paridade de raio, voto 3 eixos)
    // com um vértice do elemento menor contra a malha COMPLETA do maior.
    /* ⚠ A CONTENCAO VALE NOS DOIS MODOS, e tirar o modo folga daqui foi erro
       meu. O raciocinio era "se um esta dentro do outro, a distancia e zero e
       o distMalhas ja pega" — e e falso: as SUPERFICIES nao se cruzam, e a
       distancia minima entre elas e o vao entre a peca de dentro e a parede
       da de fora. Um tubo inteiro dentro de uma viga larga da distancia
       MAIOR que a folga pedida e sai como "sem conflito" — justamente o
       conflito mais grave que existe. */
    if (!conf && !naoVer) {
      var menor = null, maior = null;
      if (contido(A.aabb, B.aabb)) { menor = A; maior = B; }
      else if (contido(B.aabb, A.aabb)) { menor = B; maior = A; }
      if (menor && menor.tris.length >= 3) {
        conf = window.BIMTri.dentroVoto([menor.tris[0], menor.tris[1], menor.tris[2]], maior.tris);
        /* contido = atravessa de fato: a distancia entre os solidos e ZERO,
           e nao a que o distMalhas mediu entre as superficies. */
        if (conf && MODO_FOLGA) c.distancia = 0;
      }
    }
    c.geo = naoVer ? 'nao-verificavel' : (conf ? 'confirmado' : 'descartado');
    /* no modo folga a gravidade e o quanto FALTA de espaco, nao a penetracao:
       10 cm faltando numa folga exigida de 30 e outra conversa que 1 cm. */
    if (MODO_FOLGA && conf && c.distancia != null && FOLGA_ALVO > 0) {
      var frac = c.distancia / FOLGA_ALVO;
      c.severidade = frac <= 0.34 ? 'grave' : (frac <= 0.67 ? 'media' : 'leve');
    }
  }
  return clashes;
}

// ===================== REUNIÃO: presença multi-usuário no modelo =====================
// Vários usuários andam no MESMO modelo com um avatar nomeado (compatibilização ao vivo).
// Transporte simples e robusto: SSE (recebe) + POST (envia pose) num relay do VPS — sem
// dependências. Sem internet, o BIM segue 100% (a reunião só não conecta).
var Reuniao = {
  on: false, sala: '', uid: 'u' + Math.random().toString(36).slice(2, 9),
  es: null, outros: {}, grupo: null, cfg: null, _lastPost: 0,
  base: function () { return ((typeof window !== 'undefined' && window.CONFIG && window.CONFIG.licencaServer) ? String(window.CONFIG.licencaServer).replace(/\/$/, '') : '') + '/bim-sala/'; },
  _sprite: function (nome, cor) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    var x = cv.getContext('2d');
    x.fillStyle = 'rgba(12,31,51,.88)'; x.beginPath();
    if (x.roundRect) x.roundRect(6, 18, 500, 92, 26); else x.rect(6, 18, 500, 92);
    x.fill();
    x.strokeStyle = cor; x.lineWidth = 6; x.stroke();
    x.font = 'bold 56px Segoe UI, Arial'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(nome || 'Visitante').slice(0, 16), 256, 66);
    var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(2.6, 0.65, 1); sp.renderOrder = 999;
    return sp;
  },
  // camisa (jersey) com LOGO da empresa + NOME + TELEFONE — identifica cada um na reunião.
  // Duas texturas: frente normal e verso espelhado (pra ler certo por trás, como no Augin).
  _jerseyTex: function (u) {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    var x = cv.getContext('2d');
    var shirt = u.c1 || '#222b34';
    function desenha(logoImg) {
      x.clearRect(0, 0, 256, 256);
      x.fillStyle = shirt; x.fillRect(0, 0, 256, 256);
      x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(0, 0, 256, 20); // "gola"
      if (logoImg) { try { var r = (logoImg.width || 1) / (logoImg.height || 1), w = 100, h = w / r; if (h > 84) { h = 84; w = h * r; } x.drawImage(logoImg, 128 - w / 2, 34, w, h); } catch (e) {} }
      else { // sem logo (convidado da nuvem): iniciais do nome num disco → cada um fica distinto
        var ini = String(u.nome || 'Visitante').trim().split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'RA';
        x.fillStyle = 'rgba(255,255,255,.16)'; x.beginPath(); x.arc(128, 64, 34, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,.95)'; x.font = 'bold 34px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ini, 128, 65); x.textBaseline = 'alphabetic';
      }
      x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = 'bold 27px Segoe UI, Arial';
      x.fillText(String(u.nome || 'Visitante').slice(0, 18), 128, 168);
      if (u.tel) { x.font = '20px Segoe UI, Arial'; x.fillStyle = 'rgba(255,255,255,.88)'; x.fillText(String(u.tel).slice(0, 20), 128, 202); }
    }
    desenha(null);
    var texF = new THREE.CanvasTexture(cv); texF.anisotropy = 4;
    var texB = new THREE.CanvasTexture(cv); texB.anisotropy = 4; texB.wrapS = THREE.RepeatWrapping; texB.repeat.x = -1; texB.offset.x = 1; // verso: espelha p/ ler certo por trás
    if (u.logo) { var img = new Image(); img.onload = function () { desenha(img); texF.needsUpdate = true; texB.needsUpdate = true; }; img.onerror = function () {}; img.src = u.logo; }
    return { texF: texF, texB: texB, shirt: new THREE.Color(shirt) };
  },
  // avatar HUMANO (cabeça/tronco/braços/pernas + capacete); homem/mulher; camisa c/ logo+nome+tel
  _avatar: function (u) {
    var g = new THREE.Group();
    var corC = new THREE.Color(u.c2 || '#f59e0b'), mulher = u.sexo === 'm';
    var matPele = new THREE.MeshStandardMaterial({ color: 0xe4b48e, roughness: .75 });
    var matCalca = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: .85 });
    var matSapato = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: .6 });
    var j = this._jerseyTex(u);
    var matShirt = new THREE.MeshStandardMaterial({ color: j.shirt, roughness: .85 });
    var matJf = new THREE.MeshStandardMaterial({ map: j.texF, roughness: .85 });
    var matJb = new THREE.MeshStandardMaterial({ map: j.texB, roughness: .85 });
    var lh = 0.82, th = 0.52, tw = mulher ? 0.36 : 0.42, td = 0.24, lw = mulher ? 0.13 : 0.15;
    [-1, 1].forEach(function (s) {
      var perna = new THREE.Mesh(new THREE.CylinderGeometry(lw * 0.5, lw * 0.45, lh, 10), matCalca); perna.position.set(s * 0.11, lh / 2, 0); g.add(perna);
      var pe = new THREE.Mesh(new THREE.BoxGeometry(lw * 1.1, 0.07, 0.26), matSapato); pe.position.set(s * 0.11, 0.035, 0.06); g.add(pe);
    });
    // tronco: jersey na frente (+z, idx4) e verso (-z, idx5); camisa lisa nas laterais/topo/base
    var tronco = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), [matShirt, matShirt, matShirt, matShirt, matJf, matJb]);
    tronco.position.y = lh + th / 2; g.add(tronco);
    var aw = mulher ? 0.09 : 0.11;
    [-1, 1].forEach(function (s) {
      var br = new THREE.Mesh(new THREE.CylinderGeometry(aw * 0.5, aw * 0.45, 0.5, 8), matShirt); br.position.set(s * (tw / 2 + aw * 0.45), lh + th - 0.27, 0); br.rotation.z = s * 0.09; g.add(br);
      var mao = new THREE.Mesh(new THREE.SphereGeometry(aw * 0.55, 8, 6), matPele); mao.position.set(s * (tw / 2 + aw * 0.5), lh + th - 0.5, 0); g.add(mao);
    });
    var cab = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), matPele); cab.position.y = lh + th + 0.16; g.add(cab);
    if (mulher) { // cabelo + rabo de cavalo
      var matCab = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: .9 });
      var cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), matCab); cabelo.position.set(0, lh + th + 0.19, -0.015); g.add(cabelo);
      var rabo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.028, 0.3, 8), matCab); rabo.position.set(0, lh + th + 0.03, -0.14); rabo.rotation.x = 0.2; g.add(rabo);
    }
    var capacete = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: corC, roughness: .35, metalness: .15 })); capacete.position.y = lh + th + 0.19; g.add(capacete);
    var aba = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 18), capacete.material); aba.position.set(0, lh + th + 0.15, 0.07); g.add(aba);
    var nome = this._sprite(u.nome, u.c2 || '#f59e0b'); nome.position.y = lh + th + 0.55; g.add(nome);
    // indicador de fala (🎤): aparece quando o áudio detecta ESSE avatar falando (Voz.falandoUid)
    var mic = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._micTex(), depthTest: false, transparent: true }));
    mic.scale.set(0.42, 0.42, 1); mic.position.y = lh + th + 0.92; mic.visible = false; mic.renderOrder = 1001;
    g.add(mic); g.userData.mic = mic;
    var esc2 = u.esc === 'baixo' ? 0.9 : u.esc === 'alto' ? 1.1 : 1; g.scale.set(esc2, esc2, esc2);
    g.userData.alvo = { p: new THREE.Vector3(), yaw: 0 };
    return g;
  },
  _micTex: function () {
    // textura POR avatar (não compartilhada): o _dispor libera o .map de cada avatar; uma textura
    // compartilhada seria disposta pelo 1º descarte e sumiria dos outros.
    var cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    var x = cv.getContext('2d');
    x.fillStyle = 'rgba(22,163,74,.92)'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#eafff2'; x.lineWidth = 6; x.stroke();
    x.font = '64px Segoe UI Emoji, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🎤', 64, 70);
    var t = new THREE.CanvasTexture(cv); t.anisotropy = 4;
    return t;
  },
  _aplicar: function (usuarios) {
    var self = this, vistos = {};
    Object.keys(usuarios || {}).forEach(function (uid) {
      if (uid === self.uid) return;
      var u = usuarios[uid]; if (!u || !u.p) return;
      vistos[uid] = 1;
      // LOGO vem fora do broadcast (só o hash 'lv' no SSE): busca 1x por uid quando o lv mudar
      if (!self._logos) self._logos = {};
      var lc = self._logos[uid];
      if (u.lv && (!lc || (lc.lv !== u.lv && !lc.pend))) {
        self._logos[uid] = { lv: u.lv, logo: (lc && lc.logo) || '', pend: true };
        (function (id, lv) { fetch(self.base() + encodeURIComponent(self.sala) + '/logo/' + encodeURIComponent(id)).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { self._logos[id] = { lv: lv, logo: t || '', pend: false }; }).catch(function () { if (self._logos[id]) self._logos[id].pend = false; }); })(uid, u.lv);
      } else if (!u.lv && lc) { self._logos[uid] = { lv: '', logo: '', pend: false }; }
      u.logo = (self._logos[uid] && self._logos[uid].logo) || ''; // avatar usa o logo do cache; rebuild dispara quando chega
      var av = self.outros[uid];
      if (!av || av.userData.c1 !== u.c1 || av.userData.c2 !== u.c2 || av.userData.nome !== u.nome || av.userData.esc !== u.esc || av.userData.sexo !== u.sexo || av.userData.tel !== u.tel || av.userData.logo !== u.logo) {
        if (av) { self._dispor(av); self.grupo.remove(av); }
        av = self._avatar(u); av.userData.c1 = u.c1; av.userData.c2 = u.c2; av.userData.nome = u.nome; av.userData.esc = u.esc; av.userData.sexo = u.sexo; av.userData.tel = u.tel; av.userData.logo = u.logo;
        av.position.set(u.p[0], u.p[1] - 1.6, u.p[2]);
        self.grupo.add(av); self.outros[uid] = av;
      }
      av.userData.alvo.p.set(u.p[0], u.p[1] - 1.6, u.p[2]); // câmera ≈ olhos → pé do avatar ~1,6m abaixo
      av.userData.alvo.yaw = u.yaw || 0;
    });
    Object.keys(this.outros).forEach(function (uid) { if (!vistos[uid]) { self._dispor(self.outros[uid]); self.grupo.remove(self.outros[uid]); delete self.outros[uid]; delete self._logos[uid]; } });
    if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(Object.keys(vistos).length + 1); } catch (_) {} }
  },
  // libera GPU: o TRONCO usa material ARRAY [camisa×4, frente, verso] → normaliza p/ array e
  // dispõe .map+.dispose de cada submaterial (o antigo o.material.map casava Array.prototype.map
  // → TypeError abortava o traverse e VAZAVA texturas/geometrias — bloqueador do gate v1.1.93).
  _dispor: function (g) {
    try {
      g.traverse(function (o) {
        try {
          if (o.geometry && !o.isSprite) o.geometry.dispose(); // Sprite (nome/🎤) usa geometria COMPARTILHADA do three r150 — não dispor
          var m = o.material; if (!m) return;
          var arr = Array.isArray(m) ? m : [m];
          for (var i = 0; i < arr.length; i++) { var mm = arr[i]; if (!mm) continue; if (mm.map) mm.map.dispose(); mm.dispose(); }
        } catch (_) {}
      });
    } catch (_) {}
  },
  _tick: function () {
    var self = Reuniao; if (!self.on || !S) return;
    var vozOn = (typeof Voz !== 'undefined' && Voz.on);
    Object.keys(self.outros).forEach(function (uid) {
      var av = self.outros[uid], a = av.userData.alvo;
      av.position.lerp(a.p, 0.14);
      var dy = a.yaw - av.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      av.rotation.y += dy * 0.14;
      if (av.userData.mic) av.userData.mic.visible = vozOn && Voz.falandoUid(uid); // 🎤 quando esse colega fala
    });
    if (!self.conectado) return; // sem SSE conectado não martela POST
    var now = Date.now();
    var c = S.camera, e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
    // POSE (leve, frequente): só posição/rotação — o relay MERGE preserva a identidade
    if (now - self._lastPost > 180) {
      self._lastPost = now;
      // 429 = sala CHEIA (relay capa em 20 no POST, mas o SSE conecta mesmo assim → sem isto o 21º
      // vira "zumbi": vê todos e some pra todos, sem aviso). Detecta o 429 e sai avisando (gate v1.1.93).
      try { fetch(self.base() + encodeURIComponent(self.sala) + '/pose', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ uid: self.uid, p: [c.position.x, c.position.y, c.position.z], yaw: e.y }) }).then(function (r) { if (r && r.status === 429) { self.sair(); if (S && S.opts) { var cb = S.opts.onReuniaoCheia || S.opts.onReuniaoFalha; if (cb) { try { cb(); } catch (_) {} } } } }).catch(function () {}); } catch (_) {}
    }
    // IDENTIDADE (nome/tel/sexo/cores) a cada ~4s — p/ quem entra depois montar o avatar.
    // O LOGO (dataURL pesado) só entra no corpo quando MUDA: o relay guarda por sessão e serve via
    // GET /logo; reenviar a cada 4s desperdiçava ~6 KB/s de upload por participante (gate v1.1.93).
    // Se o POST com o logo falhar, _logoEnviado fica desalinhado e o próximo tick reenvia (retry).
    if (now - (self._lastIdent || 0) > 4000) {
      self._lastIdent = now;
      var g = self.cfg;
      var mudouLogo = g.logo !== self._logoEnviado;
      var body = { uid: self.uid, nome: g.nome, c1: g.c1, c2: g.c2, esc: g.esc, sexo: g.sexo, tel: g.tel, p: [c.position.x, c.position.y, c.position.z], yaw: e.y };
      if (mudouLogo) body.logo = g.logo;
      try { fetch(self.base() + encodeURIComponent(self.sala) + '/pose', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(function (r) { if (mudouLogo && r && r.ok) self._logoEnviado = g.logo; }).catch(function () {}); } catch (_) {}
    }
  },
  entrar: function (cfg) {
    if (!S) return false;
    this.sair();
    this.cfg = { nome: (cfg && cfg.nome) || 'Visitante', c1: (cfg && cfg.c1) || '#222b34', c2: (cfg && cfg.c2) || '#f59e0b', esc: (cfg && cfg.esc) || 'normal', sexo: (cfg && cfg.sexo) || 'h', tel: (cfg && cfg.tel) || '', logo: (cfg && cfg.logo) || '' };
    this.sala = (cfg && cfg.sala) || 'geral';
    this.grupo = new THREE.Group(); S.scene.add(this.grupo);
    this.conectado = false; this.falhas = 0; this.jaConectou = false; this._logos = {}; this._lastIdent = 0; this._logoEnviado = null;
    var self = this;
    try {
      this.es = new EventSource(this.base() + encodeURIComponent(this.sala) + '/stream');
      // _logoEnviado=null no (re)conectar: se a sessão expirou no relay durante uma queda >6s (TTL),
      // o logo é reenviado no próximo tick; senão o hash bate e ninguém re-busca (gate v1.1.93).
      this.es.onopen = function () { self.conectado = true; self.jaConectou = true; self.falhas = 0; self._logoEnviado = null; if (self._connTimer) { clearTimeout(self._connTimer); self._connTimer = 0; } if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(self.on ? (Object.keys(self.outros).length + 1) : 0); } catch (_) {} } };
      this.es.onmessage = function (ev) { try { var d = JSON.parse(ev.data); self.conectado = true; self.jaConectou = true; self._aplicar(d.usuarios || {}); } catch (_) {} };
      // queda DEPOIS de conectado: pausa os POSTs (conectado=false) e deixa o SSE reconectar
      // sozinho (onopen religa); só desiste de vez quem NUNCA conectou (3 falhas na entrada).
      // EXCEÇÃO: resposta ≠200 (ex.: 502 do proxy com o relay morto) FECHA o EventSource pra
      // sempre (readyState=CLOSED, sem retry da spec) → sem sair() aqui viraria reunião-zumbi
      // silenciosa (botão verde, contagem stale, nunca se recupera sozinha).
      this.es.onerror = function () {
        self.conectado = false; self.falhas++;
        var fatal = self.jaConectou && self.es && self.es.readyState === 2; // 2 = CLOSED (não reconecta mais)
        if (fatal || (!self.jaConectou && self.falhas >= 3)) { self.sair(); if (S && S.opts && S.opts.onReuniaoFalha) { try { S.opts.onReuniaoFalha(); } catch (_) {} } }
      };
    } catch (_) { this.sair(); return false; }
    this._connTimer = setTimeout(function () { if (self.on && !self.jaConectou) { self.sair(); if (S && S.opts && S.opts.onReuniaoFalha) { try { S.opts.onReuniaoFalha(); } catch (_) {} } } }, 8000);
    S._tickExtra.push(this._tick);
    this.on = true;
    return true;
  },
  sair: function () {
    this.on = false; this.conectado = false;
    if (typeof Voz !== 'undefined' && (Voz.on || Voz.wanted)) { try { Voz.sair(); } catch (_) {} } // sai da reunião → corta o áudio junto (Voz.wanted cobre o mic em aquisição)
    if (this._connTimer) { clearTimeout(this._connTimer); this._connTimer = 0; }
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    var i = S ? S._tickExtra.indexOf(this._tick) : -1; if (i !== -1) S._tickExtra.splice(i, 1);
    var selfS = this; if (this.grupo) { Object.keys(this.outros).forEach(function (uid) { selfS._dispor(selfS.outros[uid]); }); if (S) S.scene.remove(this.grupo); }
    this.grupo = null; this.outros = {}; this._logos = {};
    if (S && S.opts && S.opts.onReuniao) { try { S.opts.onReuniao(0); } catch (_) {} }
  }
};

// ===================== VOZ: áudio walkie-talkie da reunião (VAD) =====================
// Cada um só TRANSMITE enquanto FALA (VAD no navegador) → quem não fala não gera tráfego e
// fica em silêncio pros outros (o "pausado" que o Rogério pediu; no exato momento que fala,
// o gate abre e a voz vai). PCM 8kHz mono int16 em frames de ~100ms via o canal /audio do relay
// (separado da pose). Playback por locutor com jitter buffer. getUserMedia + AudioContext exigem
// HTTPS + gesto do usuário (por isso é um botão), igual à câmera.
var Voz = {
  on: false, ctx: null, stream: null, src: null, proc: null, muteGain: null,
  es: null, sala: '', uid: '', base: '', seq: 0, HZ: 8000, frameLen: 800,
  frameBuf: null, frameFill: 0, ratio: 1, wanted: false, _acc: 0, _cnt: 0, _phase: 0,
  vad: { floor: 0.003, hang: 0, speaking: false },
  rx: {}, // uid -> { gain, next, last }
  entrar: function (sala, uid, base) {
    if (this.on) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    var self = this; this.sala = sala; this.uid = uid; this.base = base; this.wanted = true;
    // cria + resume o AudioContext AINDA no gesto do toque: no iOS o ctx nasce 'suspended' e só sai do
    // suspenso dentro da ativação do usuário; criar dentro do getUserMedia().then (microtask) deixaria o
    // áudio MUDO no iPhone. ratio já sai daqui (síncrono).
    try { this.ctx = new AC(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) { this.ctx = null; }
    if (!this.ctx) { this.wanted = false; return false; }
    this.ratio = Math.max(1, this.ctx.sampleRate / this.HZ);
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }).then(function (stream) {
      // saiu no meio da aquisição (wanted=false) OU já ligou de novo (on): descarta o stream E o ctx órfão
      if (self.on || !self.wanted) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} if (!self.wanted && self.ctx) { try { self.ctx.close(); } catch (_) {} self.ctx = null; } return; }
      self.stream = stream;
      self.frameBuf = new Float32Array(self.frameLen); self.frameFill = 0; self.seq = 0; self._acc = 0; self._cnt = 0; self._phase = 0;
      self.src = self.ctx.createMediaStreamSource(stream);
      var proc = self.ctx.createScriptProcessor(2048, 1, 1); self.proc = proc;
      self.muteGain = self.ctx.createGain(); self.muteGain.gain.value = 0; // não ecoa o próprio microfone
      proc.onaudioprocess = function (e) { self._captura(e); };
      self.src.connect(proc); proc.connect(self.muteGain); self.muteGain.connect(self.ctx.destination);
      try {
        self.es = new EventSource(base + encodeURIComponent(sala) + '/audiostream?uid=' + encodeURIComponent(uid));
        self.es.onmessage = function (ev) { self._recebe(ev.data); };
        self.es.onerror = function () {}; // reconecta sozinho pela spec do EventSource
      } catch (_) {}
      self.on = true;
      if (S && S.opts && S.opts.onVoz) { try { S.opts.onVoz(true); } catch (_) {} }
    }).catch(function (e) {
      self.wanted = false; if (self.ctx) { try { self.ctx.close(); } catch (_) {} self.ctx = null; } // mic negado → fecha o ctx criado no gesto
      if (S && S.opts && S.opts.onVozErro) { try { S.opts.onVozErro((e && e.name) || String(e)); } catch (_) {} }
    });
    return true;
  },
  // downsample p/ 8kHz com acumulador de FASE fracionário e PERSISTENTE entre callbacks: com ratio
  // fracionário (44100/8000=5.5125) um contador inteiro travaria em 6:1 (=7350Hz → voz de esquilo) e
  // ainda descartaria o resto de cada bloco. A fase média converge pra 8000Hz exatos (grupos de ~5 e ~6).
  _captura: function (e) {
    if (!this.on) return;
    var input = e.inputBuffer.getChannelData(0), ratio = this.ratio, i;
    for (i = 0; i < input.length; i++) {
      this._acc += input[i]; this._cnt++; this._phase++;
      if (this._phase >= ratio) {
        this._phase -= ratio;
        this.frameBuf[this.frameFill++] = this._acc / this._cnt; this._acc = 0; this._cnt = 0;
        if (this.frameFill >= this.frameLen) { this._frame(); this.frameFill = 0; }
      }
    }
  },
  _frame: function () {
    var buf = this.frameBuf, n = this.frameLen, i, sum = 0;
    for (i = 0; i < n; i++) sum += buf[i] * buf[i];
    var rms = Math.sqrt(sum / n), v = this.vad;
    // noise floor adaptativo: sobe devagar, desce rápido quando fica quieto
    if (rms < v.floor) v.floor = v.floor * 0.9 + rms * 0.1; else v.floor = v.floor * 0.995 + rms * 0.005;
    var thrOpen = Math.max(0.012, v.floor * 3.2), thrClose = Math.max(0.008, v.floor * 2.0);
    var era = v.speaking;
    if (!v.speaking) { if (rms > thrOpen) { v.speaking = true; v.hang = 6; } }
    else { if (rms > thrClose) v.hang = 6; else if (--v.hang <= 0) v.speaking = false; }
    if (v.speaking !== era && S && S.opts && S.opts.onFala) { try { S.opts.onFala(v.speaking); } catch (_) {} }
    if (!v.speaking) return; // silêncio: NÃO transmite (é o "pausado")
    var pcm = new Int16Array(n);
    for (i = 0; i < n; i++) { var x = buf[i]; if (x > 1) x = 1; else if (x < -1) x = -1; pcm[i] = x < 0 ? (x * 0x8000) | 0 : (x * 0x7fff) | 0; }
    var b64 = this._toB64(pcm);
    try { fetch(this.base + encodeURIComponent(this.sala) + '/audio', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ uid: this.uid, q: this.seq++, a: b64 }) }).catch(function () {}); } catch (_) {}
  },
  _recebe: function (data) {
    if (!this.on || !this.ctx) return;
    var msg; try { msg = JSON.parse(data); } catch (_) { return; }
    if (!msg || !msg.a || !msg.u || msg.u === this.uid) return;
    var pcm = this._fromB64(msg.a); if (!pcm || !pcm.length) return;
    var n = pcm.length, f32 = new Float32Array(n), i;
    for (i = 0; i < n; i++) f32[i] = pcm[i] / 0x8000;
    var r = this.rx[msg.u];
    if (!r) { r = this.rx[msg.u] = { gain: this.ctx.createGain(), next: 0, last: 0 }; r.gain.gain.value = 1; try { r.gain.connect(this.ctx.destination); } catch (_) {} }
    r.last = Date.now();
    var ab = this.ctx.createBuffer(1, n, this.HZ); ab.getChannelData(0).set(f32);
    var srcN = this.ctx.createBufferSource(); srcN.buffer = ab; try { srcN.connect(r.gain); } catch (_) { return; }
    var t = this.ctx.currentTime, dur = n / this.HZ;
    if (r.next < t + 0.02) r.next = t + 0.12; // buffer de jitter inicial (evita estouros/gaps)
    if (r.next > t + 0.5) return; // TETO: já há ~0.5s enfileirado (rajada de rede) → descarta este frame p/ não acumular latência
    try { srcN.start(r.next); } catch (_) {}
    r.next += dur;
  },
  falandoUid: function (uid) { var r = this.rx[uid]; return !!(r && (Date.now() - r.last) < 500); },
  euFalando: function () { return !!(this.on && this.vad.speaking); },
  sair: function () {
    this.on = false; this.wanted = false; // wanted=false: se um getUserMedia estiver pendente, ele descarta o mic ao resolver (sem hot-mic)
    if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
    if (this.proc) { try { this.proc.disconnect(); this.proc.onaudioprocess = null; } catch (_) {} this.proc = null; }
    if (this.src) { try { this.src.disconnect(); } catch (_) {} this.src = null; }
    if (this.muteGain) { try { this.muteGain.disconnect(); } catch (_) {} this.muteGain = null; }
    if (this.stream) { try { this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} this.stream = null; }
    var self = this; Object.keys(this.rx).forEach(function (u) { try { self.rx[u].gain.disconnect(); } catch (_) {} });
    this.rx = {}; this.vad.speaking = false; this.vad.hang = 0;
    if (this.ctx) { try { this.ctx.close(); } catch (_) {} this.ctx = null; }
    if (S && S.opts && S.opts.onVoz) { try { S.opts.onVoz(false); } catch (_) {} }
  },
  _toB64: function (int16) {
    var bytes = new Uint8Array(int16.buffer), bin = '', i, chunk = 0x8000;
    for (i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  },
  _fromB64: function (b64) {
    try { var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len), i; for (i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i); return new Int16Array(bytes.buffer); } catch (_) { return null; }
  }
};

window.BIM = {
  montar: montar,
  /* ---- B0: identidade duravel ----
     `setObra` e chamado pela casca (js/gestao.js) na montagem e em toda troca
     de obra. `chaveDe` e a porta unica para quem GRAVA vinculo: montar
     'modelo::gid' na mao daria dois donos ao formato. */
  setObra: function (obraId) {
    var novo = String(obraId == null ? '' : obraId);
    if (novo === OBRA_ID) return OBRA_ID;
    OBRA_ID = novo; recarimbarIdentidade(); return OBRA_ID;
  },
  obraAtual: function () { return OBRA_ID; },
  /* ---- B1: cache do modelo e federacao da obra ----
     A casca entrega o mapa da federacao e pede/entrega o cache; o viewer nao
     encosta em Store nem em IndexedDB. */
  setFederacao: function (mapa) {
    FED = mapa || null;
    if (mapa && mapa.obraId) OBRA_ID = String(mapa.obraId);
    recarimbarIdentidade();
    return true;
  },
  federacao: function () { return FED; },
  dadosParaCache: function (mid) { return (S && S._dadosParaCache) ? S._dadosParaCache(mid) : null; },
  soltarColeta: function (mid) { if (S && S._soltarColeta) S._soltarColeta(mid); },
  /* ⚠ os modelos que estao na cena mas cujo ARQUIVO nao esta em memoria — o
     caso do modelo restaurado do cache, que por projeto nao guarda o .ifc. Sem
     isto, o "Compartilhar na nuvem" subia so parte da obra e dizia que estava
     tudo la; o cliente abria no celular e faltava metade do predio. */
  /* ---- B2: agregacao de geometria ----
     Liga/desliga o desenho mesclado. A bandeira existe porque a tabela de
     riscos manda manter o caminho antigo alcancavel: qualquer coisa estranha
     na trena, no encaixe ou no corte tecnico, desliga e volta ao de antes. */
  agregacao: function (on) { return (S && S._ligarAgregacao) ? S._ligarAgregacao(on) : false; },
  agregacaoEstado: function () { return (S && S._agregEstado) ? S._agregEstado() : { on: false }; },
  /* ---- B3: conjuntos de selecao e busca ----
     O motor (js/bimset.js) avalia a regra sobre `BIM.elementos`; aqui ficam so
     as pontas que dependem da cena. */
  carimbarConsulta: function () { return (S && S._carimbarConsulta) ? S._carimbarConsulta() : 0; },
  /* os valores que EXISTEM no modelo para um campo — o editor de regra oferece
     em vez de exigir que o usuario adivinhe a grafia do projetista */
  valoresDe: function (campo) { return (S && S._valoresDe) ? S._valoresDe(campo) : []; },
  /* de chave (B0) para o uid da sessao — a ponte entre o que fica gravado e o
     que a cena entende */
  uidsDeChaves: function (chaves) { return (S && S._uidsDeChaves) ? S._uidsDeChaves(chaves) : []; },
  /* deixa visível só o conjunto; o ↺ Restaurar tudo desfaz */
  isolarChaves: function (chaves) { return (S && S._isolarChaves) ? S._isolarChaves(chaves) : 0; },
  /* { chave: '#rrggbb' } — a cor por regra do B3 */
  pintarChaves: function (mapa) { return (S && S._pintarChaves) ? S._pintarChaves(mapa) : 0; },
  limparPintura: function () { if (S && S._limparPintura) S._limparPintura(); },
  /* ---- B4: pontos de vista ----
     `cameraAtual` e o que a vista GUARDA; `aplicarVista` e como se volta para
     ela. A miniatura sai do `foto()`, que ja existia. */
  /* ---- B6: simulação 4D dirigida pelo cronograma do engenheiro ---- */
  aplicar4DTarefas: function (sim) { return (S && S._aplicar4DTarefas) ? S._aplicar4DTarefas(sim) : { ok: false, erro: 'visualizador não montado' }; },
  limpar4DTarefas: function () { if (S && S._limpar4DTarefas) S._limpar4DTarefas(); },
  cameraAtual: function () { return (S && S._cameraAtual) ? S._cameraAtual() : null; },
  aplicarVista: function (v, opts) { return (S && S._aplicarVista) ? S._aplicarVista(v, opts) : { ok: false, erro: 'visualizador não montado' }; },
  modelosSemArquivo: function () {
    return ((S && S.modelos) || []).filter(function (m) { return !m.sintetico && !(m._bytes && m._bytes.length); })
      .map(function (m) { return { mid: m.mid, nome: m.nome, doCache: !!m.doCache }; });
  },
  abrirDoCache: function (reg, estado) { return (S && S._montarDoCache) ? S._montarDoCache(reg, estado) : { ok: false, erro: 'visualizador não montado' }; },
  chaveDe: function (el) {
    if (typeof el === 'string') el = ((S && S.elementos) || []).filter(function (x) { return x.uid === el; })[0];
    return (el && el.chave) || '';
  },
  modelosIdentidade: function () {
    return ((S && S.modelos) || []).map(function (m) { return { mid: m.mid, nome: m.nome, modeloId: m.modeloId, versaoId: m.versaoId }; });
  },
  /* ⚠ o canvas do WebGL NÃO redimensiona sozinho quando o layout muda por CSS
   * (esconder a lateral, entrar no modo foco): só o evento `resize` da janela
   * o acorda, e trocar de painel não dispara `resize`. Sem isto o modelo sai
   * esticado e — pior para a trena — o clique cai alguns pixels fora do que a
   * pessoa vê, porque a matriz de projeção continua a da largura antiga. */
  redimensionar: function () { if (S && S._resize) S._resize(); },
  abrirArquivo: function (f) { if (S && S._abrirArquivo) S._abrirArquivo(f); },
  abrirBytes: function (ab, nome) { if (S && S._abrirBytes) S._abrirBytes(ab, nome); }, // v1.1.85 — RA/RV nuvem
  bytesModelos: function () { return (S && S._bytesModelos) ? S._bytesModelos() : []; },
  carregarExemplo: function () { if (S && S._carregarExemplo) S._carregarExemplo(); },
  aplicarEstado: aplicarEstado,
  mostrarTudo: mostrarTudo,
  focarClash: function (ids) { if (S) focarClash(ids); },
  limparClash: function () { if (S) limparClash(); },
  refinarClash: function (clashes, opts) { return refinarClash(clashes, opts); }, // tri-a-tri: anota geo=confirmado/descartado/nao-verificavel
  // ---- ferramentas de coordenação ----
  medir: function (on) { if (S && S._setMedir) S._setMedir(on == null ? !(S.medir && S.medir.on) : !!on); },
  get ultimaMedida() { return (S && S.medir && S.medir.ultima) || null; }, // {valor(m), horizontal}
  area: function (on) { if (S && S._setArea) S._setArea(on == null ? !(S.area && S.area.on) : !!on); },
  get ultimaArea() { return (S && S.medir && S.medir.ultimaArea) || null; }, // {area(m²), perimetro(m), horizontal, aproximada}
  angulo: function (on) { if (S && S._setAng) S._setAng(on == null ? !(S.ang && S.ang.on) : !!on); },
  get ultimoAngulo() { return (S && S.medir && S.medir.ultimoAngulo) || null; }, // {graus}
  limparMedidas: function () { if (S && S._limparMedidas) S._limparMedidas(); },
  // ---- pavimentos (IfcBuildingStorey) ----
  get pavimentos() { return (S && S._pavLista) ? S._pavLista().map(function (p) { return { nome: p.nome, y0: p.y0, n: p.n }; }) : []; },
  get pavimentoIsolado() { return (S && S.pav && S.pav.isolado) || null; },
  isolarPavimento: function (nome) { return (S && S._isolarPavimento) ? S._isolarPavimento(nome) : false; },
  plantaPavimento: function (nome) { return (S && S._plantaPavimento) ? S._plantaPavimento(nome) : false; },
  // ---- visibilidade ----
  isolarSelecao: function () { if (S && S._isolarSelecao) S._isolarSelecao(); },
  ocultarSelecao: function () { if (S && S._ocultarSelecao) S._ocultarSelecao(); },
  isolarTipo: function () { if (S && S._isolarTipo) S._isolarTipo(); },
  restaurarVisibilidade: function () { if (S && S._restaurarVis) S._restaurarVis(); },
  // ---- RA/RV (v1.1.84): imersivo — andar em escala real, VR, RA Android ----
  abrirXR: function () { if (S && S._toggleXR) S._toggleXR(); },
  imersivo: function (modo) { if (!S || !S.xr) return false; if (S.xr.on) return true; if (S._toggleXR && (!S.xrPanel || S.xrPanel.style.display !== 'flex')) S._toggleXR(); var b = S.xrPanel && S.xrPanel.querySelector('[data-x="' + (modo || 'caminhar') + '"]'); if (b) { b.click(); return true; } return false; },
  imersivoAtivo: function () { return !!(S && S.xr && S.xr.on); },
  sairImersivo: function () { if (S && S._sairImersivo) S._sairImersivo(); },
  foto: function () { return (S && S._tirarFoto) ? S._tirarFoto() : null; }, // dataURL do render (também baixa o PNG carimbado)
  // v1.1.83 — planta baixa técnica 2D (corte na altura do slider da Planta, hachura + cotas automáticas)
  plantaBaixa: function (o) {
    o = o || {};
    if (!S || !S._gerarPlantaTec) return null;
    var y = o.y != null ? o.y : (S.planta && S.planta.plane ? S.planta.plane.constant : null);
    if (y == null) return null; // sem Planta ativa e sem altura explícita, não há corte honesto
    return S._gerarPlantaTec({ y: y, escala: o.escala || 50, cotas: o.cotas !== false, prof: o.prof || 3, rotAlt: o.rotAlt });
  },
  estiloDesenho: function (on) { if (S && S._setEstiloDesenho) S._setEstiloDesenho(on == null ? !(S._estiloOn && S._estiloOn()) : !!on); },
  // v1.1.96 — colorir por sistema hidrossanitário (3D + planta + RA/RV); sistemaInfo p/ E2E
  sistema: function (on) { if (S && S._setSistema) S._setSistema(on == null ? !(S._sisColorOn && S._sisColorOn()) : !!on); },
  /* tema da CENA 3D: 'orcapro' (navy) | 'revit' (cinza escuro) | 'claro'.
   * A casca do ambiente chama isto para a cena acompanhar a interface. */
  tema: function (id) { return !!(S && S._definirTema && S._definirTema(id)); },
  sistemaOn: function () { return !!(S && S._sisColorOn && S._sisColorOn()); },
  sistemaInfo: function () { return (S && S._sisInfo) ? S._sisInfo() : null; },
  sistemaClassificar: function (texto) { return (S && S._sisClassificar) ? S._sisClassificar(texto) : null; }, // classifica um nome/descrição num sistema (pura; p/ testes e plugins)
  // v1.1.99 — Plantas Executivas Blocok: lê as paredes do IFC → pranchas 90×90 numeradas + material + carga na fundação
  blocok: function (opts) { return (S && S.blocok) ? S.blocok(opts) : null; }, // {semJanela?:bool} → {paredes,material,carga}; abre a prancha em nova aba salvo semJanela
  blocokParedes: function () { return (S && S._extrairParedesBlocok && S._blocokLiberado && S._blocokLiberado()) ? S._extrairParedesBlocok() : { paredes: [], vaosDet: 0 }; }, // só a extração (E2E/diagnóstico) — mesmo gate por licença
  blocokPlanilha: function () { return (S && S.blocokPlanilha) ? S.blocokPlanilha() : null; }, // planilha Excel multi-abas (por pavimento, romaneio, material, insumos, MO, cargas, logística)
  // v1.1.82 — propriedades completas do elemento (todos os psets, instância+família) e thumbnail
  propriedades: function (uid) { return (S && S._propsCompletas) ? S._propsCompletas(uid) : []; },
  thumbFamilia: function (uid, maxPx) { return (S && S._thumbFamilia) ? S._thumbFamilia(uid, maxPx) : null; },
  // ---- 2D→3D (Fase C.1): paredes confirmadas viram modelo sintético no viewer ----
  carregarSintetico: function (caixas, nome) { return (S && S._carregarSintetico) ? S._carregarSintetico(caixas, nome) : null; },
  editar: function (on) { if (S && S._setEdit) S._setEdit(on == null ? !(S.edit && S.edit.on) : !!on); },
  /* a espessura com que a próxima parede nasce — vem do tipo (alvtipos.js),
     em METROS, já com as camadas das duas faces somadas */
  espessuraTipo: function (metros, rotulo) { return !!(S && S._setEspEditor && S._setEspEditor(metros, rotulo)); },
  espessuraAtual: function () { return (S && S._espEditor) ? S._espEditor() : null; },
  editarOps: function () { return (S && S._editOps) ? S._editOps() : []; },
  editarAplicar: function (ops) { if (S && S._editAplicar) S._editAplicar(ops); },
  // nº de malhas efetivamente visíveis (modelo ligado + mesh visível) — E2E/diagnóstico
  visiveis: function () {
    var v = 0; if (!S) return 0;
    S.modelRoot.children.forEach(function (g) { if (g.visible === false) return; (g.children || []).forEach(function (m) { if (m.visible) v++; }); });
    return v;
  },
  _p3dTexto: function (txt, nome) { if (S && S._p3dProcessar) S._p3dProcessar(txt, nome); }, // hook de teste: injeta DXF sem file input
  /* "Gerar de desenho" na fita chamava BIM.painelP3d(), que NUNCA EXISTIU:
     o registro devolvia false e o comando respondia "ainda não está
     disponível nesta versão". O painel só abria pelo botão antigo dentro
     do viewer. É o botão da função que o cliente mais pediu — 2D vira 3D
     — e ele estava mudo desde que a fita nasceu. */
  painelP3d: function () { if (S && S._toggleP3d) { S._toggleP3d(); return true; } return false; },
  voo: function (on) { if (S && S._setVoo) { S._setVoo(on); return true; } return false; },
  home: function () { if (S && S._fit) { S._fit(); return true; } return false; },
  painelVis: function () { if (S && S._toggleVis) { S._toggleVis(); return true; } return false; },
  painelPav: function () { if (S && S._togglePav) { S._togglePav(); return true; } return false; },
  planta: function (on) { if (S && S._setPlanta) S._setPlanta(on == null ? !(S.planta && S.planta.on) : !!on); },
  corte: function (on) { if (S && S._setCorteL) S._setCorteL(on == null ? !(S.corteL && S.corteL.on) : !!on); },
  corteConfig: function (cfg) { // {az?, inc?, pos0a1?, inv?} — programático/testes
    if (!S || !S.corteL || !S.corteL.on) return;
    if (cfg && cfg.az != null) { S.corteL.az = +cfg.az; var e1 = S.corteLPanel.querySelector('[data-k="az"]'); if (e1) e1.value = +cfg.az; }
    if (cfg && cfg.inc != null) { S.corteL.inc = +cfg.inc; var e2 = S.corteLPanel.querySelector('[data-k="inc"]'); if (e2) e2.value = +cfg.inc; }
    if (cfg && cfg.pos0a1 != null) { var e3 = S.corteLPanel.querySelector('[data-k="pos"]'); if (e3) e3.value = Math.round(Math.max(0, Math.min(1, +cfg.pos0a1)) * 1000); }
    if (cfg && cfg.inv != null) S.corteL.inv = !!cfg.inv;
    if (S._aplicarCorteL) S._aplicarCorteL();
  },
  snapConfig: function (cfg) { // {on?, v?, m?, a?} — liga/desliga tipos de snap
    if (!S || !S.snap) return { on: false };
    ['on', 'v', 'm', 'a', 'i', 'c'].forEach(function (k) { if (cfg && cfg[k] != null) S.snap[k] = !!cfg[k]; });
    try { localStorage.setItem('orcapro:bim:snap', JSON.stringify({ on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i, c: S.snap.c })); } catch (_) {}
    return { on: S.snap.on, v: S.snap.v, m: S.snap.m, a: S.snap.a, i: S.snap.i, c: S.snap.c };
  },
  corteTecnico: function (o) { return (S && S._gerarCorteTec) ? S._gerarCorteTec(o || {}) : null; }, // {ax,az,bx,bz,escala,tipo,prof,inv} -> {url,w,h,escala}
  /* hook de teste do ⊕ centro: o teste de bancada monta o anel à mão, mas quem
     monta o anel de verdade é o EdgesGeometry do three em cima da malha do IFC.
     Sem este gancho, a única prova possível seria "achei um centro no modelo",
     que depende de o modelo ter tubo — e o de exemplo não tem. */
  _aneisDe: function (arrArestas) { return (S && S._acharAneis) ? S._acharAneis(arrArestas) : null; },
  /* hook de teste da lupa: sem ele, provar que ela abriu exige adivinhar por
     pixel, e um falso negativo aí manda procurar defeito no lugar errado. */
  _lupaEstado: function () { if (!S || !S.lupa) return null; var L = S.lupa; return { on: !!L.on, orbita: !!(S.orbit && S.orbit.enabled), x: L.x, y: L.y, id: L.id, esperando: !!L.timer, tipoSnap: L.sn && L.sn.tipo || null, mediDown: !!(S.medir && S.medir.down), ferramenta: !!(S._ferramentaClique && S._ferramentaClique()) }; },
  /* =====================================================================
   * _coordMatriz — a matriz que o web-ifc aplicou ao abrir o arquivo
   *
   * O IFC e Z-up; a cena e Y-up. Quem converte e o web-ifc, e ele guarda a
   * conta. Sem esta janela, exportar camera para BCF (que fala IFC) seria
   * deduzir a permutacao de cabeca — e o criterio do B4 e justamente o
   * projetista abrir o arquivo no Revit NA MESMA CAMERA. Deduzir errado poe
   * a camera dele em outro lugar, sem erro nenhum.
   * ===================================================================== */
  _coordMatriz: function (mid) {
    if (!S || !S.api || !S.api.GetCoordinationMatrix) return null;
    var alvo = (mid != null) ? mid : (S.modelos.filter(function (m) { return typeof m.mid === 'number'; })[0] || {}).mid;
    if (alvo == null) return null;
    try { var m = S.api.GetCoordinationMatrix(alvo); return Array.prototype.slice.call(m); } catch (e) { return String(e && e.message || e); }
  },
  _snapAt: function (cx, cy) { if (!S || !S._raycastEm) return null; var h = S._raycastEm(cx, cy); if (!h) return null; var sn = S._aplicarSnapRef(h, S.snap ? S.snap.raio : 14); return { tipo: sn.tipo, p: [sn.p.x, sn.p.y, sn.p.z] }; }, // hook de teste: snap num ponto de tela
  /* =====================================================================
   * _perf — a régua do B2, e a razão de ela existir
   *
   * A especificação proíbe declarar ganho de desempenho sem medir: "nenhum
   * número desses vai para nota de versão, apresentação ou proposta antes de
   * ser medido no aparelho e no modelo reais". Sem um gancho, medir `draw
   * calls` exigiria expor o renderer — e aí qualquer código passaria a poder
   * mexer nele.
   *
   * ⚠ `renderer.info.render` só tem número DEPOIS de um quadro desenhado, e a
   * aba do painel fica com `document.hidden === true`, onde o
   * `requestAnimationFrame` não dispara. Por isso ele desenha um quadro
   * síncrono antes de ler: sem isso o número volta zero e a medição mente para
   * o lado bom.
   * ===================================================================== */
  _perf: function () {
    if (!S || !S.alive || !S.renderer) return null;
    try { S.renderer.info.reset(); } catch (_) {}
    var t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    try { S.renderer.render(S.scene, S.camera); } catch (_) { return null; }
    var msQuadro = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    var i = S.renderer.info;
    var malhas = 0, geos = 0, vistos = {};
    try {
      S.modelRoot.traverse(function (o) {
        if (!o.isMesh) return;
        malhas++;
        var g = o.geometry; if (g && !vistos[g.uuid]) { vistos[g.uuid] = 1; geos++; }
      });
    } catch (_) {}
    /* ⚠ a cena INTEIRA, por camada — sem isto nao da para saber QUEM esta
       sendo desenhado quando a conta de draw calls sobe. O modelRoot sozinho
       nao conta: as malhas mescladas do B2 vivem fora dele. */
    var porCamada = { visiveisNaCamera: 0, ocultasDaCamera: 0, invisiveis: 0, foraDoModelo: 0, linhasNaCamera: 0 };
    try {
      S.scene.traverse(function (o) {
        /* ⚠ NAO SO isMesh: linha e ponto tambem gastam chamada de desenho, e o
           produto desenha ARESTAS por peca no estilo desenho. Contar so malha
           fazia a conta nao fechar com o renderer — e a diferenca parecia
           defeito da agregacao quando era outra fonte inteira. */
        if (!(o.isMesh || o.isLine || o.isLineSegments || o.isPoints)) return;
        if (o.isLine || o.isLineSegments || o.isPoints) {
          var vl = true; for (var pl = o; pl; pl = pl.parent) if (pl.visible === false) { vl = false; break; }
          if (vl && S.camera.layers.test(o.layers)) porCamada.linhasNaCamera++;
          return;
        }
        var vis = true;
        for (var p = o; p; p = p.parent) if (p.visible === false) { vis = false; break; }
        if (!vis) { porCamada.invisiveis++; return; }
        if (S.camera.layers.test(o.layers)) porCamada.visiveisNaCamera++; else porCamada.ocultasDaCamera++;
        var dentro = false; for (var q = o; q; q = q.parent) if (q === S.modelRoot) { dentro = true; break; }
        if (!dentro) porCamada.foraDoModelo++;
      });
    } catch (_) {}
    return {
      drawCalls: i.render.calls, triangulos: i.render.triangles,
      geometriasNaGpu: i.memory.geometries, texturas: i.memory.textures,
      malhasNaCena: malhas, geometriasDistintas: geos, cena: porCamada,
      msQuadro: +msQuadro.toFixed(2),
      /* diagnostico: mascara de camada da camera e do renderer — sem isto nao
         da para saber por que a conta de chamadas nao bate com o que a camera
         enxerga */
      mascaraCamera: S.camera.layers.mask, autoReset: S.renderer.info.autoReset,
      sombras: !!(S.renderer.shadowMap && S.renderer.shadowMap.enabled),
      elementos: (S.elementos || []).length,
      modelos: (S.modelos || []).length
    };
  },
  /* mede o clique de verdade: o raycast que o duplo-clique usa */
  _perfClique: function (cx, cy, n) {
    if (!S || !S._raycastEm) return null;
    n = n || 20;
    var t0 = performance.now(), acertos = 0;
    for (var k = 0; k < n; k++) { if (S._raycastEm(cx, cy)) acertos++; }
    return { ms: +((performance.now() - t0) / n).toFixed(3), amostras: n, acertos: acertos };
  },
  // Cotar rede — hooks de teste: ligar/desligar por modo e ler o estado real
  _cota: function (on, modo) { if (S && S._setCota) S._setCota(on, modo); return this._cotaEstado(); },
  _cotaEstado: function () { return (S && S._cotaEstado) ? S._cotaEstado() : null; },
  _cotaIndice: function () { return (S && S._cotaIndice) ? S._cotaIndice() : null; },
  // Numerar rede — hook público: dispara o encadeamento e devolve o pacote
  numerarRede: function () { return (S && S._numerarRede) ? S._numerarRede() : null; },
  numeracao: function () { return (S && S._numeracao) ? S._numeracao() : null; },
  _px: function (p) { if (!S) return null; var v = new THREE.Vector3(p[0], p[1], p[2]).project(S.camera); var rc = S.renderer.domElement.getBoundingClientRect(); return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height }; }, // hook de teste: mundo -> px da tela
  _visiveis: function () { if (!S) return null; var v = 0, t = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { t++; if (m.visible) v++; }); }); return { visiveis: v, total: t }; }, // hook de teste: malhas visíveis
  _cam: function () { if (!S) return null; var c = S.camera, t = S.orbit.target; return { p: [c.position.x, c.position.y, c.position.z], t: [t.x, t.y, t.z], near: c.near, far: c.far, rot: S.orbit.enableRotate }; }, // hook de teste: estado da câmera
  // ---- v1.1.89 render/navegação/raio-X: hooks de teste ----
  _selecionarPrimeiro: function () { // seleciona a 1ª malha real (imita o duplo-clique) p/ testar contorno/raio-X sem evento DOM
    if (!S) return null; var alvo = null;
    S.modelRoot.children.some(function (g) { return (g.children || []).some(function (m) { if (m.userData && m.userData.expressID != null && m.visible) { alvo = m; return true; } return false; }); });
    if (!alvo) return null;
    if (S.selected) S.selected.material = S.prevMat;
    S.selected = alvo; S.prevMat = alvo.material; alvo.material = S.selMat;
    if (S._contornoSelecao) S._contornoSelecao(alvo);
    return { tipo: alvo.userData.tipo, eid: alvo.userData.expressID, mid: alvo.userData.mid };
  },
  _temContorno: function () { if (!S) return false; var n = 0; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) n++; }); return n; }, // nº de contornos de seleção na cena
  _contornoVis: function () { if (!S) return null; var v = null; S.scene.children.forEach(function (c) { if (c.type === 'LineSegments' && c.renderOrder === 1000) v = c.visible; }); return v; }, // visibilidade do contorno (segue o elemento)
  raioXSelecao: function () { if (S && S._raioXSelecao) S._raioXSelecao(); },
  raioXTipo: function () { if (S && S._raioXTipo) S._raioXTipo(); },
  limparRaioX: function () { if (S && S._limparRaioX) S._limparRaioX(); },
  _ghostCount: function () { if (!S) return 0; var n = 0, gm = null; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material && m.material.opacity === 0.1 && m.material.transparent && m.material.depthWrite === false && m.material.color && m.material.color.getHex() === 0x93a7bd) n++; }); }); return n; }, // malhas em material fantasma
  _amberCount: function () { if (!S) return 0; var n = 0; S.modelRoot.children.forEach(function (g) { (g.children || []).forEach(function (m) { if (m.material === S.matAndamento) n++; }); }); return n; }, // malhas em âmbar (4D em andamento)
  _chaoVis: function () { if (!S || !S.scene) return null; var v = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) v = o.visible; }); return v; }, // visibilidade da sombra de contato
  _envSet: function () { return !!(S && S.scene && S.scene.environment); }, // ambiente PMREM aplicado?
  _xr: function () { if (!S || !S.xr) return null; var x = S.xr, c = S.camera, m = S.modelRoot; return { on: x.on, mode: x.mode, escala: +(x.escala || 1).toFixed(4), oriOk: !!x.oriOk, travado: !!x.travado, camY: +c.position.y.toFixed(2), mScale: +m.scale.x.toFixed(4), mPos: [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)], camDist: +m.position.clone().sub(c.position).length().toFixed(2), camQuat: [+c.quaternion.x.toFixed(3), +c.quaternion.y.toFixed(3), +c.quaternion.z.toFixed(3), +c.quaternion.w.toFixed(3)] }; }, // hook de teste: estado do imersivo RA/RV
  _xrEscala: function (f) { if (S && S._aplicarEscalaImersivo) S._aplicarEscalaImersivo(f); }, // hook de teste
  _xrCentralizar: function () { if (S && S._centralizarImersivo) S._centralizarImersivo(); }, // hook de teste
  _xrTickWalk: function () { if (S && S._xrWalk) S._xrWalk(0.016); }, // hook de teste: roda o passo do imersivo (giroscópio/andar), que o loop real chama
  _xrPasso: function () { if (S && S._xrStep) S._xrStep(); }, // hook de teste: simula 1 passo do acelerômetro
  _xrSimPassos: function (mags) { return (S && S._xrSimPassos) ? S._xrSimPassos(mags) : 0; }, // hook de teste: conta passos numa sequência de |accel|
  _passSens: function (v) { return (S && S._passSensSet) ? S._passSensSet(v) : 1; }, // sensibilidade dos passos (persistida)
  _chaoSet: function () { if (!S || !S.scene) return null; var c = null; S.scene.children.forEach(function (o) { if (o.type === 'Mesh' && o.geometry && o.geometry.type === 'PlaneGeometry' && o.material && o.material.map && o.renderOrder === -1) c = o; }); return c ? { x: c.scale.x, y: c.position.y } : null; }, // sombra de contato
  _frame: function () { if (!S || !S.alive) return false; try { S.orbit.update(); for (var tx = 0; tx < S._tickExtra.length; tx++) { try { S._tickExtra[tx](0.016); } catch (_) {} } S.renderer.render(S.scene, S.camera); for (var tp = 0; tp < (S._tickPos || []).length; tp++) { try { S._tickPos[tp](0.016); } catch (_) {} } return true; } catch (_) { return false; } }, // hook de teste: 1 frame síncrono FIEL ao tick real (inclui _tickExtra E _tickPos — sem _tickPos a lupa nunca desenha fora do navegador, e o teste passaria medindo nada — marcador de snap, rescale de cotas, reunião)
  _foraDoClip: function (p) { return (S && S._foraDoClipRef) ? S._foraDoClipRef({ x: p[0], y: p[1], z: p[2] }) : false; }, // hook de teste
  _ctecModal: function () { return (S && S.ctecModal) ? S.ctecModal : null; }, // hook de teste: elemento do modal do resultado
  get elementos() { return elementosVivos(); },
  // ---- multi-IFC (interoperabilidade entre disciplinas) ----
  get modelos() { return S && S._publicos ? S._publicos() : []; },
  setTransparencia: function (mid, a) { if (S && S._setTransparencia) S._setTransparencia(mid, a); },
  setVisivel: function (mid, v) { if (S && S._setVisivel) S._setVisivel(mid, v); },
  setDisciplina: function (mid, d) { if (S && S._setDisciplina) S._setDisciplina(mid, d); },
  removerModelo: function (mid) { if (S && S._removerModelo) S._removerModelo(mid); },
  limpar: function () { if (S && S._limparTudo) S._limparTudo(); },
  setUltra: function (v) { if (S && S._setUltra) S._setUltra(v); },
  // ---- reunião multi-usuário (avatares no modelo) ----
  reuniao: {
    entrar: function (cfg) { return Reuniao.entrar(cfg); },
    sair: function () { Reuniao.sair(); },
    get ativa() { return Reuniao.on; },
    get sala() { return Reuniao.sala; },
    get participantes() { return Reuniao.on ? Object.keys(Reuniao.outros).length + 1 : 0; },
    // ---- áudio walkie-talkie (v1.1.94): só liga DENTRO de uma reunião, precisa de gesto (botão) + HTTPS ----
    audioEntrar: function () { if (!Reuniao.on) return false; return Voz.entrar(Reuniao.sala, Reuniao.uid, Reuniao.base()); },
    audioSair: function () { Voz.sair(); },
    get audioAtiva() { return Voz.on; },
    euFalando: function () { return Voz.euFalando(); },
    _vozRecebeTest: function (data) { Voz._recebe(data); }, // hook de teste: injeta 1 frame recebido
    _tickTest: function () { Reuniao._tick(); }, // hook de teste: roda 1 tick (rAF fica pausado em aba de fundo)
    _avatarTest: function (u) { // hook de teste: monta um avatar e devolve a estrutura
      var g = Reuniao._avatar(u || {}); var meshes = 0, jersey = false;
      g.traverse(function (o) { if (o.isMesh) { meshes++; var m = o.material; if (Array.isArray(m) ? m.some(function (x) { return x && x.map; }) : (m && m.map)) jersey = true; } });
      var alt = new THREE.Box3().setFromObject(g); var sz = alt.getSize(new THREE.Vector3());
      Reuniao._dispor(g);
      return { meshes: meshes, jersey: jersey, alturaM: +sz.y.toFixed(2), filhos: g.children.length };
    }
  }
};
