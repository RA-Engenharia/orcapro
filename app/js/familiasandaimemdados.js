/* =====================================================================
 * familiasandaimemdados.js — GERADO por tools/gerar-familiasandaimem-dados.js a partir de docs/andaime-multi/familias-m-cotas.json.
 * NÃO EDITE À MÃO (tools/test-familiasandaimem.js compara com o JSON). Cota: v = valor (mm quando é linear; senão a unidade u),
 * g = grau (p primária · s secundária · d derivada · e ESTIMADA — conferir com a peça real), s = id da fonte, p = página.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = { pecas: {
    "ra-andaime-m-poste": {
      acabamento: {"nome":"aço galvanizado a fogo","hex":"#AAB0B4","fonteId":"M02"},
      cotas: {
        "roseta_furoGrandeRaioInterno": {"v":30,"g":"d","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_furoGrandeRaioExterno": {"v":48,"g":"d","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_furoGrandeCorda": {"v":28,"g":"d","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_filete": {"v":3,"g":"d","s":null,"p":null},
        "diametroExterno": {"v":48.3,"g":"p","s":"S01","p":"10"},
        "parede": {"v":3,"g":"s","s":"S13","p":"ficha"},
        "paredeLayherLW": {"v":2.8,"g":"s","s":"S20","p":"B.S.10 (PDF 34)"},
        "diametroInterno": {"v":42.3,"g":"d","s":null,"p":null},
        "passoRosetas": {"v":500,"g":"s","s":"S01","p":"10 (fig.)"},
        "distanciaPrimeiraRosetaAtePontaInferior": {"v":400,"g":"s","s":"S01","p":"10 (fig.)"},
        "distanciaUltimaRosetaAteOmbroDoEspigao": {"v":100,"g":"s","s":"S01","p":"10 (fig.)"},
        "numeroRosetas": {"v":"(comprimento - 500) / 500 + 1","g":"d","s":"S01","p":"10","u":"un"},
        "comprimentosCatalogoPEMAX": {"v":"500; 1000; 1500; 2000; 2500; 3000","g":"p","s":"M02","p":"6","u":"mm"},
        "pesosCatalogoPEMAX": {"v":"3; 5; 7; 9; 11; 14","g":"p","s":"M02","p":"6","u":"kg"},
        "espigaoComprimentoLivre": {"v":175,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "espigaoDiametroExterno": {"v":38,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "espigaoParede": {"v":3.5,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "espigaoFuroPinoDiametro": {"v":13,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "espigaoFuroPosicao": {"v":35,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "soqueteInferiorComprimento": {"v":165,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "soqueteInternoDiametro": {"v":40.9,"g":"s","s":"S20","p":"B.S.11 (PDF 35)"},
        "roseta_diametroExterno": {"v":124,"g":"s","s":"S20","p":"B.S.2 (PDF 26)"},
        "roseta_espessura": {"v":9,"g":"s","s":"S20","p":"B.S.2 (PDF 26)"},
        "roseta_furoCentral": {"v":48.3,"g":"d","s":null,"p":null},
        "roseta_furosPequenosQuantidade": {"v":4,"g":"s","s":"S01","p":"10","u":"un"},
        "roseta_furosGrandesQuantidade": {"v":4,"g":"s","s":"S01","p":"10","u":"un"},
        "roseta_posicaoAngularFuros": {"g":"s","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_furoPequenoRadialExtensao": {"v":18,"g":"e","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_furoPequenoLarguraTangencial": {"v":16,"g":"e","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_furoGrandeFormato": {"g":"e","s":"S21","p":"A.S.70 (PDF 18)"},
        "roseta_ligacoesMaximas": {"v":8,"g":"s","s":"S05","p":"2","u":"peças"},
        "roseta_angulosLivres": {"g":"p","s":"M02","p":"14 (fig.04)"},
        "roseta_soldaNoTubo": {"g":"e","s":null,"p":null}
      }
    },
    "ra-andaime-m-travessa": {
      acabamento: {"nome":"aço galvanizado a fogo (tubo) e cabeça/cunha galvanizadas","hex":"#AAB0B4","fonteId":"M02"},
      cotas: {
        "tuboDiametroExterno": {"v":48.3,"g":"s","s":"S20","p":"B.S.12 (PDF 36)"},
        "tuboParede": {"v":3,"g":"d","s":"M02","p":"6"},
        "comprimentosNominaisPEMAX": {"v":"800; 1140; 1640; 2140; 2480; 3140","g":"p","s":"M02","p":"6","u":"mm"},
        "pesosCatalogoPEMAX": {"v":"3,5; 4,5; 6; 8; 9; 11","g":"p","s":"M02","p":"6","u":"kg"},
        "comprimentosNominaisMecanflex": {"v":"350; 500; 700; 1000; 1500; 2000; 2500; 3000","g":"p","s":"M01","p":"3","u":"mm"},
        "relacaoNominalXTubo": {"g":"d","s":"S01","p":"16"},
        "cabecaLargura": {"v":48,"g":"s","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaAltura": {"v":72,"g":"s","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaComprimento": {"v":50,"g":"s","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaEixoDoTuboAlturaMeia": {"v":36,"g":"s","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaFendaParaRosetaAltura": {"v":9.3,"g":"e","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaFendaProfundidade": {"v":37.9,"g":"d","s":"S20","p":"B.S.2 e B.S.3"},
        "cabecaJanelaDaCunha": {"g":"e","s":"S20","p":"B.S.3 (PDF 27)"},
        "cabecaFormato": {"g":"s","s":"S20","p":"B.S.3 (PDF 27)"},
        "cunhaComprimento": {"v":140,"g":"s","s":"S20","p":"B.S.7 (PDF 31)"},
        "cunhaLarguraNoTopo": {"v":27,"g":"e","s":"S20","p":"B.S.7 (PDF 31)"},
        "cunhaLarguraNaPonta": {"v":10,"g":"e","s":"S20","p":"B.S.7 (PDF 31)"},
        "cunhaEspessura": {"v":6,"g":"e","s":"S20","p":"B.S.3 (PDF 27)"},
        "cunhaFuroDaPonta": {"v":5.7,"g":"e","s":"S20","p":"B.S.7 (PDF 31)"},
        "cunhaFormato": {"g":"s","s":"S20","p":"B.S.7 (PDF 31)"},
        "cunhaMontagem": {"g":"p","s":"M02","p":"14 (fig.03) e S01 p.16"},
        "PEMAX_apoiaPisoEmTravessa": {"g":"p","s":"M02","p":"17 (fig.10, detalhe laranja)"},
        "altura_levanteM04": {"v":990,"g":"s","s":"M04","p":"1"}
      }
    },
    "ra-andaime-m-travessa-u": {
      acabamento: {"nome":"aço galvanizado","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "existeNoPEMAX": {"g":"p","s":"M02","p":"6 e 17"},
        "perfilLargura": {"v":49,"g":"s","s":"S20","p":"B.S.14 (PDF 38)"},
        "perfilAltura": {"v":53,"g":"s","s":"S20","p":"B.S.14 (PDF 38)"},
        "perfilParede": {"v":2.5,"g":"s","s":"S20","p":"B.S.13 (PDF 37)"},
        "perfilFormato": {"g":"s","s":"S20","p":"B.S.14 (PDF 38)"},
        "usoRecomendadoNoOrcaPRO": {"g":"e","s":null,"p":null}
      }
    },
    "ra-andaime-m-diagonal": {
      acabamento: {"nome":"aço galvanizado a fogo","hex":"#AAB0B4","fonteId":"M02"},
      cotas: {
        "pinoArticulacaoDiametro": {"v":16,"g":"d","s":"S21","p":"A.S.74 (PDF 22)"},
        "extremidadeAchatadaComprimento": {"v":105,"g":"e","s":"S21","p":"A.S.74 (PDF 22)"},
        "tuboDiametroExterno": {"v":48.3,"g":"s","s":"S20","p":"B.S.15 (PDF 39)"},
        "tuboParede": {"v":3,"g":"d","s":"M02","p":"6"},
        "comprimentosCatalogoPEMAX": {"v":"2140; 2260; 2520; 2850; 3100; 3620","g":"p","s":"M02","p":"6","u":"mm"},
        "pesosCatalogoPEMAX": {"v":"8,5; 9; 9,5; 10,5; 11,5; 13,5","g":"p","s":"M02","p":"6","u":"kg"},
        "comprimentosCatalogoMecanflex": {"v":"1350 (1000x1000); 2150 (1000x2000); 2760 (2000x2000); 3530 (2000x3000); 1970 (500x2000)","g":"p","s":"M01","p":"3","u":"mm"},
        "articulacaoPonto_ex": {"v":77.5,"g":"s","s":"S20","p":"B.S.6 (PDF 30)"},
        "formulaComprimentoLayher": {"g":"d","s":"S21","p":"A.S.74 (PDF 22)"},
        "PEMAX_alturaDoModulo": {"v":2000,"g":"e","s":"M02","p":"6","u":"mm"},
        "cabecaLarguraAlturaComprimento": {"g":"s","s":"S20","p":"B.S.6 (PDF 30)"},
        "extremidadeDoTubo": {"g":"e","s":"S21","p":"A.S.74 (PDF 22)"},
        "pinoArticulacao": {"g":"e","s":"S21","p":"A.S.74 (PDF 22)"},
        "cunha": {"g":"s","s":"S20","p":"B.S.6-B.S.7"},
        "M04_diagonalNoPlano": {"g":"s","s":"M04","p":"1"}
      }
    },
    "ra-andaime-m-piso": {
      acabamento: {"nome":"aço (galvanizado a fogo segundo o texto; foto mostra cinza escuro)","hex":"#666666","fonteId":"M02"},
      cotas: {
        "travaLargura": {"v":10,"g":"d","s":"M02","p":"17"},
        "travaComprimento": {"v":40,"g":"d","s":"M02","p":"17"},
        "largura": {"v":320,"g":"p","s":"M02","p":"6"},
        "comprimentosCatalogoPEMAX": {"v":"800; 1140; 1640; 2140; 2480; 3140","g":"p","s":"M02","p":"6","u":"mm"},
        "pesosCatalogoPEMAX": {"v":"8,5; 9,5; 11,5; 13,5; 15; 17","g":"p","s":"M02","p":"6","u":"kg"},
        "alturaDoPerfil": {"v":76,"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "comprimentoDoPisoMenosNominal": {"v":42,"g":"d","s":"S20","p":"B.S.37 (PDF 61)"},
        "espessuraDaChapa": {"v":1,"g":"e","s":"M02","p":"6"},
        "perfuracaoPassoNaLargura": {"v":24.7,"g":"e","s":"S21","p":"A.S.60a (PDF 11)"},
        "perfuracaoPassoNoComprimento": {"v":19.6,"g":"e","s":"S21","p":"A.S.60a (PDF 11)"},
        "perfuracaoDiametroDoFuro": {"v":15,"g":"e","s":"S21","p":"A.S.60a (PDF 11)"},
        "perfuracaoFormato": {"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "perfuracaoExtensao": {"g":"e","s":"S21","p":"A.S.60a (PDF 11)"},
        "garraLarguraNaPlanta": {"v":35,"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "garraRecuoNaLateral": {"v":32,"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "garraFormato": {"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "travaContraLevantamento": {"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "travaDimensoes": {"g":"e","s":"M02","p":"17"},
        "furosLateraisParaTrava": {"g":"s","s":"S21","p":"A.S.60a (PDF 11)"},
        "cargaPEMAX": {"g":"p","s":"M02","p":"18 (tabela 01)"}
      }
    },
    "ra-andaime-m-alcapao": {
      acabamento: {"nome":"aço galvanizado e tampa/escada de alumínio","hex":"#AEAEAE","fonteId":"M02"},
      cotas: {
        "escada_longarinaLargura": {"v":40,"g":"d","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_longarinaEspessura": {"v":20,"g":"d","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_degrauLado": {"v":20,"g":"d","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_numeroDeDegraus": {"v":7,"g":"e","s":"S20","p":"B.S.42 (PDF 66)","u":"un"},
        "PEMAX_peso": {"v":36.5,"g":"d","s":"M02","p":"6","u":"kg"},
        "PEMAX_catalogo": {"g":"p","s":"M02","p":"6"},
        "MecanflexAlcapao": {"g":"p","s":"M01","p":"4"},
        "larguraTotalLayher": {"v":640,"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "comprimentoLayher": {"v":2530,"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "aberturaDaTampaComprimento": {"v":710,"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "aberturaRobustLayher": {"g":"s","s":"S20","p":"B.S.46 (PDF 70)"},
        "tampaFormato": {"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "margemLateral": {"v":22,"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "profundidadeGarra": {"v":37,"g":"s","s":"S20","p":"B.S.41 (PDF 65)"},
        "escada_largura": {"v":300,"g":"s","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_passoDosDegraus": {"v":280,"g":"s","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_comprimento": {"v":2230,"g":"s","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_longarina": {"g":"s","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_degrau": {"g":"s","s":"S20","p":"B.S.42 (PDF 66)"},
        "escada_gancho": {"g":"p","s":"M02","p":"5 e 19"},
        "alternanciaDosAlcapoes": {"g":"p","s":"M02","p":"18 (fig.11)"}
      }
    },
    "ra-andaime-m-rodape": {
      acabamento: {"nome":"aço (galvanizado a fogo segundo o texto; foto mostra cinza escuro)","hex":"#575757","fonteId":"M02"},
      cotas: {
        "encaixeGarraLargura": {"v":35,"g":"d","s":"S20","p":"B.S.19 (PDF 43)"},
        "encaixeGarraAltura": {"v":60,"g":"d","s":"S20","p":"B.S.19 (PDF 43)"},
        "alturaPEMAX": {"v":200,"g":"p","s":"M02","p":"6"},
        "comprimentosCatalogoPEMAX": {"v":"800; 1140; 1640; 2140; 2480; 3140","g":"p","s":"M02","p":"6","u":"mm"},
        "pesosCatalogoPEMAX": {"v":"1,7; 2,4; 3,8; 4,5; 5,2; 6,6","g":"p","s":"M02","p":"6","u":"kg"},
        "comprimentosMecanflex": {"v":"500; 700; 1000; 1500; 2000; 2500; 3000","g":"p","s":"M01","p":"4","u":"mm"},
        "perfilProfundidade": {"v":30,"g":"s","s":"S20","p":"B.S.19 (PDF 43)"},
        "perfilAlturaLayher": {"v":150,"g":"s","s":"S20","p":"B.S.19 (PDF 43)"},
        "perfilSecao": {"g":"s","s":"S20","p":"B.S.19 (PDF 43)"},
        "espessuraDaChapa": {"v":0.8,"g":"e","s":"M02","p":"6"},
        "encaixeNasPontas": {"g":"s","s":"S20","p":"B.S.19 (PDF 43)"},
        "encaixeGarraLarguraAltura": {"g":"e","s":"S20","p":"B.S.19 (PDF 43)"},
        "capaPlastica": {"g":"s","s":"S20","p":"B.S.19 (PDF 43)"}
      }
    },
    "ra-andaime-m-peca-base": {
      acabamento: {"nome":"aço galvanizado a fogo","hex":"#AAB0B4","fonteId":"M02"},
      cotas: {
        "alturaTotal": {"v":235,"g":"s","s":"S20","p":"B.S.9 (PDF 33) e S21 A.S.70"},
        "pesoPEMAX": {"v":1.8,"g":"p","s":"M02","p":"6","u":"kg"},
        "tuboInternoDiametroParede": {"g":"s","s":"S20","p":"B.S.9 (PDF 33)"},
        "posicaoDaRosetaAPartirDaBase": {"v":65,"g":"s","s":"S20","p":"B.S.9 (PDF 33)"},
        "roseta_diametro": {"v":124,"g":"s","s":"S20","p":"B.S.2 (PDF 26)"},
        "tuboAteOTopoDoTuboInterno": {"v":165,"g":"d","s":"S20","p":"B.S.9 (PDF 33)"},
        "luvaDiametro": {"v":57,"g":"s","s":"S20","p":"B.S.9 (PDF 33)"},
        "luvaParede": {"v":2.9,"g":"s","s":"S20","p":"B.S.9 (PDF 33)"},
        "luvaComprimento": {"v":80,"g":"d","s":"S20","p":"B.S.9 (PDF 33)"},
        "uso": {"g":"p","s":"M02","p":"15-16"}
      }
    },
    "ra-andaime-m-base-regulavel": {
      acabamento: {"nome":"aço galvanizado ou bicromatizado (Mecanflex: bicromatizado)","hex":"#AAB0B4","fonteId":"M01"},
      cotas: {
        "placaFuroLargura": {"v":12,"g":"d","s":"S20","p":"B.S.8 (PDF 32)"},
        "placaFuroEntreCentros": {"v":125,"g":"d","s":"S20","p":"B.S.8 (PDF 32)"},
        "PEMAX_comprimento": {"v":500,"g":"p","s":"M02","p":"6"},
        "PEMAX_pesos": {"v":"1,8; 3,2","g":"p","s":"M02","p":"6","u":"kg"},
        "limiteDeRegulagem": {"v":250,"g":"p","s":"M02","p":"10"},
        "hasteDiametroDaRosca": {"v":38,"g":"p","s":"M01","p":"3"},
        "roscaPasso": {"v":8.1,"g":"s","s":"S20","p":"B.S.8 (PDF 32)"},
        "hasteTrechoLisoDeCima": {"v":150,"g":"s","s":"S20","p":"B.S.8 (PDF 32)"},
        "hasteParede": {"v":3.5,"g":"d","s":"M02","p":"6"},
        "placaLado": {"v":150,"g":"s","s":"S20","p":"B.S.8 (PDF 32)"},
        "placaEspessura": {"v":8,"g":"s","s":"F02","p":"ficha"},
        "placaFuros": {"g":"s","s":"S20","p":"B.S.8 (PDF 32)"},
        "placaCantos": {"g":"s","s":"S20","p":"B.S.8 (PDF 32)"},
        "porcaBorboletaDiametro": {"v":205,"g":"s","s":"S01","p":"8"},
        "porcaBorboletaFormato": {"g":"p","s":"M02","p":"6"},
        "porcaBorboletaAltura": {"v":32,"g":"e","s":"F02","p":"ficha"},
        "articulada_inclinacao": {"v":16,"g":"s","s":"S01","p":"8","u":"%"},
        "articulada_articulacao": {"g":"s","s":"M02","p":"16 (fig.07)"}
      }
    },
    "ra-andaime-m-gancho-ancoragem": {
      acabamento: {"nome":"aço galvanizado (gancho) e zincado/bicromatizado (olhal e chumbador)","hex":"#AAB0B4","fonteId":"M02"},
      cotas: {
        "olhalRoscaDiametro": {"v":12,"g":"e","s":"F20","p":"ficha"},
        "PEMAX_comprimentos": {"v":"250; 500","g":"p","s":"M02","p":"6","u":"mm"},
        "tuboDiametro": {"v":48.3,"g":"d","s":"M02","p":"6"},
        "pesoDoGancho": {"v":0.7,"g":"d","s":"M02","p":"6","u":"kg"},
        "ganchoBarraDiametro": {"v":18,"g":"s","s":"S20","p":"B.S.29 (PDF 53)"},
        "ganchoFormato": {"g":"p","s":"M02","p":"22 (fig.17)"},
        "ganchoBracoDeEnlace": {"v":70,"g":"e","s":"M02","p":"22 (fig.17)"},
        "travaNoPoste": {"g":"p","s":"M02","p":"21-22 (fig.18)"},
        "chumbadorFuroDiametro": {"v":20,"g":"p","s":"M02","p":"22 (fig.20)"},
        "chumbadorFuroProfundidade": {"v":70,"g":"p","s":"M02","p":"22 (fig.20)"},
        "chumbadorDiametroNominal": {"v":15.9,"g":"d","s":"M02","p":"22"},
        "chumbadorComprimento": {"v":70,"g":"e","s":"M02","p":"6 e 22"},
        "chumbadorFormato": {"g":"p","s":"M02","p":"6 e 22 (fig.19)"},
        "olhalPeso": {"v":0.3,"g":"p","s":"M02","p":"6","u":"kg"},
        "olhalRosca": {"g":"e","s":"F20","p":"ficha"},
        "olhalAbertura": {"v":23,"g":"s","s":"F20","p":"ficha"},
        "olhalBarraDiametro": {"v":8,"g":"e","s":"M02","p":"6"}
      }
    },
    "ra-andaime-m-pino-trava": {
      acabamento: {"nome":"aço bicromatizado/dourado","hex":"#C9A227","fonteId":"M02"},
      cotas: {
        "layherAltura": {"v":60,"g":"d","s":"S20","p":"B.S.30 (PDF 54)"},
        "layherComprimento": {"v":94,"g":"d","s":"S20","p":"B.S.30 (PDF 54)"},
        "PEMAX_comprimentoDesenvolvido": {"v":250,"g":"p","s":"M02","p":"6"},
        "PEMAX_peso": {"v":0.13,"g":"p","s":"M02","p":"6","u":"kg"},
        "arameDiametro": {"v":9,"g":"d","s":"M02","p":"6"},
        "formato": {"g":"p","s":"M02","p":"17 (fig.09) e 20 (fig.13)"},
        "layherDimensoes": {"g":"s","s":"S20","p":"B.S.30 (PDF 54)"},
        "uso": {"g":"p","s":"M02","p":"17"}
      }
    },
    "ra-andaime-m-estribo-no": {
      acabamento: {"nome":"aço galvanizado","hex":"#AAB0B4","fonteId":"M01"},
      cotas: {
        "lacoRasgoLargura": {"v":12,"g":"d","s":"M01","p":"5"},
        "lacoRasgoAltura": {"v":8,"g":"d","s":"M01","p":"5"},
        "lacoRaioCanto": {"v":6,"g":"d","s":"M01","p":"6"},
        "posteDiametro": {"v":48.2,"g":"p","s":"M01","p":"3"},
        "posteParede": {"v":3,"g":"p","s":"M01","p":"3"},
        "postesComprimentos": {"v":"500; 1000; 1500; 2000; 3000; 270 com/sem espiga; 500 e 1000 sem espiga","g":"p","s":"M01","p":"3","u":"mm"},
        "espigaDiametro": {"v":38,"g":"s","s":"M01","p":"3"},
        "estribosPorNo": {"v":4,"g":"p","s":"M01","p":"6","u":"un"},
        "estribosAngulo": {"g":"p","s":"M01","p":"6"},
        "lacoLargura": {"v":32,"g":"e","s":"M01","p":"6 (foto, esc. do tubo)"},
        "lacoProjecaoAlemDoTubo": {"v":38,"g":"e","s":"M01","p":"6 (foto, esc. do tubo)"},
        "lacoAlturaAoLongoDoPoste": {"v":41,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "lacoEspessuraDaFaixa": {"v":2.5,"g":"e","s":"M01","p":"6 (foto, esc. do tubo)"},
        "lacoFormato": {"g":"p","s":"M01","p":"6"},
        "lacoRasgoParaChaveta": {"g":"e","s":"M01","p":"5"},
        "espacamentoVerticalDosNos": {"v":500,"g":"e","s":"M01","p":"3"},
        "soldaDoEstribo": {"g":"e","s":"M01","p":"6"}
      }
    },
    "ra-andaime-m-pinca-chaveta": {
      acabamento: {"nome":"aço galvanizado","hex":"#AAB0B4","fonteId":"M01"},
      cotas: {
        "descricao": {"g":"p","s":"M01","p":"2 e 5"},
        "travessaTubo": {"v":48.2,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "travessaComprimentos": {"v":"350; 500; 700; 1000; 1500; 2000; 2500; 3000","g":"p","s":"M01","p":"3","u":"mm"},
        "pincaFormato": {"g":"e","s":"M01","p":"5"},
        "pincaLargura": {"v":30,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "pincaProfundidade": {"v":26,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "chavetaComprimento": {"v":120,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "chavetaLargura": {"v":11,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "chavetaEspessura": {"v":4,"g":"e","s":"M01","p":"5 (foto, esc. do tubo)"},
        "chavetaContrapeso": {"g":"p","s":"M01","p":"5"},
        "diagonalNoMesmoLaco": {"g":"p","s":"M01","p":"5"},
        "diagonalComprimentos": {"v":"1970 (500x2000) a 3530 (2000x3000)","g":"p","s":"M01","p":"3","u":"mm"}
      }
    }
  } };
  global.FamiliasAndaimeMDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
