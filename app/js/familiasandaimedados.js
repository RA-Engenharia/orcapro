/* =====================================================================
 * familiasandaimedados.js — GERADO por tools/gerar-familiasandaime-dados.js a partir de docs/andaime/familias-cotas.json.
 * NÃO EDITE À MÃO (tools/test-familiasandaime.js compara com o JSON). Cota: v = valor (mm quando é linear; senão a unidade u),
 * g = grau (p primária · s secundária · d derivada · e ESTIMADA — conferir com a peça real), s = id da fonte, p = página.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = { pecas: {
    "ra-andaime-tubo": {
      acabamento: {"nome":"aco galvanizado a quente","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "diametroExterno": {"v":48.3,"g":"p","s":"S13","p":"ficha"},
        "parede": {"v":3,"g":"p","s":"S06","p":"3"},
        "diametroInterno": {"v":42.3,"g":"d","s":null,"p":null},
        "comprimentoMin": {"v":250,"g":"p","s":"S13","p":"ficha"},
        "comprimentoMax": {"v":6000,"g":"p","s":"S06","p":"3"},
        "pesoPorMetro": {"v":3.6,"g":"p","s":"S01","p":"5","u":"kg/m"},
        "momentoInercia": {"v":11,"g":"p","s":"S01","p":"5","u":"cm4"},
        "galvanizacaoCamadaMin": {"v":55,"g":"p","s":"S01","p":"5","u":"um"}
      }
    },
    "ra-andaime-abracadeira-fixa": {
      acabamento: {"nome":"corpo oxidado preto + U zincado + porcas bicromatizadas","hex":"corpo #1E1E1E; U #B9BEC2; porca #C9A227","fonteId":"S01"},
      cotas: {
        "furoCalhaDiametro": {"v":48.2,"g":"p","s":"S06","p":"4"},
        "raioInternoCalha": {"v":24.1,"g":"d","s":null,"p":null},
        "raioInternoCalhaParaModelar": {"v":24.3,"g":"d","s":null,"p":null},
        "parafusoRosca": {"v":"M14","g":"d","s":"S15","p":"ficha","u":"rosca"},
        "porcaChave": {"v":22,"g":"p","s":"S15","p":"ficha"},
        "porcaAltura": {"v":11,"g":"d","s":null,"p":null},
        "arruelaDiametroExterno": {"v":28,"g":"d","s":null,"p":null},
        "arruelaEspessura": {"v":2.5,"g":"d","s":null,"p":null},
        "hasteUDiametro": {"v":14,"g":"d","s":null,"p":null},
        "uLarguraInterna": {"v":49,"g":"d","s":null,"p":null},
        "uPernaComprimento": {"v":85,"g":"e","s":null,"p":null},
        "rosca_uteis": {"v":45,"g":"e","s":null,"p":null},
        "espessuraChapaCorpo": {"v":5,"g":"e","s":"S26","p":"ficha"},
        "extensaoLateralCorpo": {"v":100,"g":"e","s":"S07","p":"fig."},
        "distanciaEixosTubos": {"v":54,"g":"p","s":"S07","p":"1"},
        "larguraCalhaAoLongoDoTubo_prensada": {"v":40,"g":"p","s":"S07","p":"1"},
        "larguraCalhaAoLongoDoTubo_forjada": {"v":37,"g":"p","s":"S10","p":"1"},
        "pesoBrastub": {"v":1.23,"g":"p","s":"S01","p":"12","u":"kg"},
        "pesoDoughtyPrensada": {"v":1.02,"g":"p","s":"S07","p":"1","u":"kg"},
        "pesoDoughtyForjada": {"v":1.12,"g":"p","s":"S10","p":"1","u":"kg"},
        "cargaAdmissivel": {"v":8,"g":"p","s":"S01","p":"12","u":"kN"},
        "torqueMax": {"v":50,"g":"p","s":"S07","p":"1","u":"N.m"}
      }
    },
    "ra-andaime-abracadeira-giratoria": {
      acabamento: {"nome":"corpo oxidado preto + U zincado + porcas bicromatizadas","hex":"corpo #1E1E1E; U #B9BEC2; porca #C9A227","fonteId":"S01"},
      cotas: {
        "furoCalhaDiametro": {"v":48.2,"g":"p","s":"S06","p":"4"},
        "raioInternoCalha": {"v":24.1,"g":"d","s":null,"p":null},
        "raioInternoCalhaParaModelar": {"v":24.3,"g":"d","s":null,"p":null},
        "parafusoRosca": {"v":"M14","g":"d","s":"S15","p":"ficha","u":"rosca"},
        "porcaChave": {"v":22,"g":"p","s":"S15","p":"ficha"},
        "porcaAltura": {"v":11,"g":"d","s":null,"p":null},
        "arruelaDiametroExterno": {"v":28,"g":"d","s":null,"p":null},
        "arruelaEspessura": {"v":2.5,"g":"d","s":null,"p":null},
        "hasteUDiametro": {"v":14,"g":"d","s":null,"p":null},
        "uLarguraInterna": {"v":49,"g":"d","s":null,"p":null},
        "uPernaComprimento": {"v":85,"g":"e","s":null,"p":null},
        "rosca_uteis": {"v":45,"g":"e","s":null,"p":null},
        "espessuraChapaCorpo": {"v":5,"g":"e","s":"S26","p":"ficha"},
        "extensaoLateralCorpo": {"v":100,"g":"e","s":"S07","p":"fig."},
        "distanciaEixosTubos_prensada": {"v":70,"g":"p","s":"S08","p":"1"},
        "distanciaEixosTubos_forjada": {"v":72,"g":"p","s":"S09","p":"1"},
        "larguraAoLongoDoTubo_prensada": {"v":52,"g":"p","s":"S08","p":"1"},
        "larguraAoLongoDoTubo_forjada": {"v":38,"g":"p","s":"S09","p":"1"},
        "pinoCentralDiametro": {"v":16,"g":"e","s":null,"p":null},
        "anguloGiro": {"v":"0 a 360","g":"p","s":"S01","p":"12","u":"graus"},
        "pesoBrastub": {"v":1.23,"g":"p","s":"S01","p":"12","u":"kg"},
        "pesoDoughtyPrensada": {"v":0.9,"g":"p","s":"S08","p":"1","u":"kg"},
        "pesoDoughtyForjada": {"v":1.18,"g":"p","s":"S09","p":"1","u":"kg"},
        "cargaAdmissivel": {"v":6,"g":"p","s":"S01","p":"12","u":"kN"}
      }
    },
    "ra-andaime-abracadeira-rodape": {
      acabamento: {"nome":"galvanizado claro","hex":"#B4BABE","fonteId":"S01"},
      cotas: {
        "furoCalhaDiametro": {"v":48.2,"g":"d","s":"S06","p":"4"},
        "raioInternoCalhaParaModelar": {"v":24.3,"g":"d","s":null,"p":null},
        "espessuraChapa": {"v":4,"g":"e","s":null,"p":null},
        "abaVerticalAltura": {"v":70,"g":"e","s":null,"p":null},
        "abaLargura": {"v":60,"g":"e","s":null,"p":null},
        "parafusoRosca": {"v":"M14","g":"d","s":"S15","p":"ficha","u":"rosca"},
        "porcaChave": {"v":22,"g":"d","s":"S15","p":"ficha"},
        "peso": {"v":0.9,"g":"s","s":"S01","p":"12","u":"kg"}
      }
    },
    "ra-andaime-luva": {
      acabamento: {"nome":"oxidado preto (Brastub) ou zincado (Doughty)","hex":"corpo #1E1E1E; porca #C9A227","fonteId":"S01"},
      cotas: {
        "comprimentoTotal": {"v":148,"g":"p","s":"S11","p":"1"},
        "comprimentoPorMetade": {"v":72,"g":"p","s":"S11","p":"1"},
        "furoDiametro": {"v":48.2,"g":"d","s":"S06","p":"4"},
        "raioInternoParaModelar": {"v":24.3,"g":"d","s":null,"p":null},
        "parafusosQuantidade": {"v":2,"g":"p","s":"S01","p":"13","u":"un"},
        "parafusoRosca": {"v":"M14","g":"d","s":"S15","p":"ficha","u":"rosca"},
        "porcaChave": {"v":22,"g":"p","s":"S15","p":"ficha"},
        "distanciaEntreParafusos": {"v":75,"g":"e","s":"S11","p":"1"},
        "espessuraChapa": {"v":5,"g":"e","s":null,"p":null},
        "pesoBrastub": {"v":1,"g":"p","s":"S01","p":"13","u":"kg"},
        "pesoDoughty": {"v":0.5,"g":"p","s":"S11","p":"1","u":"kg"}
      }
    },
    "ra-andaime-base-regulavel": {
      acabamento: {"nome":"aco galvanizado","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "placaLargura": {"v":120,"g":"p","s":"S02","p":"ficha"},
        "placaComprimento": {"v":120,"g":"p","s":"S02","p":"ficha"},
        "placaEspessura": {"v":8,"g":"p","s":"S02","p":"ficha"},
        "placaFuros": {"v":"4 x Ø13 a 90","g":"e","s":"S01","p":"14","u":"un"},
        "hasteDiametroRosca": {"v":38.1,"g":"p","s":"S02","p":"ficha"},
        "hasteComprimento": {"v":200,"g":"p","s":"S02","p":"ficha"},
        "alturaTotal": {"v":500,"g":"p","s":"S12","p":"ficha"},
        "cursoRosca": {"v":330,"g":"p","s":"S05","p":"3"},
        "alturaRoscaMax": {"v":400,"g":"s","s":"S23","p":"apostila"},
        "tuboGuiaDiametro": {"v":38.1,"g":"d","s":"S06","p":"3"},
        "tuboGuiaComprimentoLiso": {"v":150,"g":"e","s":null,"p":null},
        "rosca": {"v":"1 1/2\"-6","g":"e","s":null,"p":null,"u":"rosca"},
        "porcaBorboletaEnvergadura": {"v":140,"g":"e","s":null,"p":null},
        "porcaBorboletaCuboDiametro": {"v":58,"g":"e","s":null,"p":null},
        "porcaBorboletaAltura": {"v":32,"g":"e","s":null,"p":null},
        "porcaBorboletaAsaEspessura": {"v":8,"g":"e","s":null,"p":null},
        "pesoBrastub": {"v":3.3,"g":"p","s":"S01","p":"14","u":"kg"},
        "cargaAdmissivel": {"v":8,"g":"p","s":"S02","p":"ficha","u":"kN"}
      }
    },
    "ra-andaime-base-fixa": {
      acabamento: {"nome":"aco galvanizado","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "placaLargura": {"v":120,"g":"p","s":"S03","p":"ficha"},
        "placaComprimento": {"v":120,"g":"p","s":"S03","p":"ficha"},
        "placaEspessura": {"v":8,"g":"p","s":"S03","p":"ficha"},
        "alturaTotal": {"v":100,"g":"p","s":"S12","p":"ficha"},
        "pinoDiametro": {"v":38.1,"g":"d","s":"S06","p":"3"},
        "pinoParede": {"v":3,"g":"e","s":null,"p":null},
        "pinoComprimentoAcimaDaPlaca": {"v":92,"g":"d","s":null,"p":null},
        "pesoBrastub": {"v":1.05,"g":"p","s":"S01","p":"14","u":"kg"},
        "cargaAdmissivel": {"v":34.3,"g":"p","s":"S03","p":"ficha","u":"kN"}
      }
    },
    "ra-andaime-rodizio": {
      acabamento: {"nome":"aco galvanizado + banda de PU/borracha","hex":"garfo #AAB0B4; banda #C8501E; nucleo #1A1A1A","fonteId":"S01"},
      cotas: {
        "rodaDiametro": {"v":150,"g":"p","s":"S05","p":"3"},
        "rodaLargura": {"v":50.8,"g":"p","s":"S12","p":"ficha"},
        "alturaTotalSimples": {"v":345,"g":"p","s":"S05","p":"3"},
        "alturaTotalAjustavel": {"v":686,"g":"p","s":"S05","p":"3"},
        "cursoAjuste": {"v":330,"g":"p","s":"S05","p":"3"},
        "tuboEncaixeAltura": {"v":90,"g":"p","s":"S12","p":"ficha"},
        "tuboEncaixeDiametro": {"v":38.1,"g":"d","s":"S06","p":"3"},
        "garfoEspessuraChapa": {"v":6,"g":"e","s":null,"p":null},
        "platinaDiametro": {"v":110,"g":"e","s":null,"p":null},
        "pedalTravaComprimento": {"v":120,"g":"e","s":null,"p":null},
        "peso": {"v":6.5,"g":"p","s":"S05","p":"3","u":"kg"},
        "cargaPorRodizio": {"v":1000,"g":"p","s":"S12","p":"ficha","u":"kgf"}
      }
    },
    "ra-andaime-pranchao": {
      acabamento: {"nome":"madeira serrada natural","hex":"#D9964A","fonteId":"S01"},
      cotas: {
        "largura": {"v":300,"g":"p","s":"S01","p":"7"},
        "espessura": {"v":38,"g":"s","s":"S23","p":"apostila"},
        "espessuraBrastub": {"v":30,"g":"p","s":"S01","p":"7"},
        "comprimentosCatalogo": {"v":"1000..3000 (0,25)","g":"p","s":"S01","p":"7","u":"m"},
        "peso": {"v":9,"g":"p","s":"S01","p":"7","u":"kg/m"},
        "raioQuina": {"v":3,"g":"e","s":null,"p":null},
        "cintaNasCabecas": {"v":"cinta nas 2 cabecas","g":"p","s":"S01","p":"7"},
        "cintaLargura": {"v":30,"g":"e","s":null,"p":null},
        "cargaAdmissivel": {"v":2.5,"g":"p","s":"S01","p":"7","u":"kN/m2"}
      }
    },
    "ra-andaime-rodape": {
      acabamento: {"nome":"madeira serrada natural (pinus)","hex":"#E3C28A","fonteId":"S23"},
      cotas: {
        "altura": {"v":200,"g":"s","s":"S23","p":"projeto de referencia"},
        "alturaMinimaNorma": {"v":150,"g":"p","s":"S24","p":"19"},
        "espessura": {"v":25,"g":"e","s":null,"p":null},
        "espessuraProjetoTerceiro": {"v":20,"g":"s","s":"S23","p":"projeto de referencia"},
        "comprimento": {"v":1120,"g":"s","s":"S23","p":"projeto de referencia"}
      }
    },
    "ra-andaime-calco": {
      acabamento: {"nome":"madeira serrada (eucalipto)","hex":"#B07A4A","fonteId":"S23"},
      cotas: {
        "largura": {"v":300,"g":"d","s":null,"p":null},
        "espessura": {"v":38,"g":"d","s":null,"p":null},
        "comprimento": {"v":500,"g":"e","s":null,"p":null},
        "tensaoAdmissivel": {"v":87,"g":"s","s":"S23","p":"apostila","u":"kgf/cm2"}
      }
    },
    "ra-andaime-escada": {
      acabamento: {"nome":"aco galvanizado (ou aluminio)","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "largura": {"v":400,"g":"p","s":"S12","p":"ficha"},
        "altura": {"v":2000,"g":"p","s":"S12","p":"ficha"},
        "banzoTuboDiametro": {"v":31.75,"g":"d","s":"S16","p":"ficha"},
        "banzoParede": {"v":1.5,"g":"p","s":"S16","p":"ficha"},
        "degrauEspacamento": {"v":275,"g":"s","s":"S23","p":"apostila"},
        "degrauDiametro": {"v":25,"g":"e","s":null,"p":null},
        "degrauPesoBrastub": {"v":1.05,"g":"p","s":"S01","p":"16","u":"kg"},
        "pesoEscada2m": {"v":6,"g":"p","s":"S01","p":"16","u":"kg"}
      }
    },
    "ra-andaime-marinheiro": {
      acabamento: {"nome":"aco galvanizado","hex":"#AAB0B4","fonteId":"S01"},
      cotas: {
        "largura": {"v":400,"g":"p","s":"S12","p":"ficha"},
        "alturaModulo": {"v":2000,"g":"p","s":"S12","p":"ficha"},
        "degrauEspacamento": {"v":275,"g":"s","s":"S23","p":"apostila"},
        "arcoDiametro": {"v":725,"g":"s","s":"S23","p":"apostila"},
        "arcoEspacamentoVertical": {"v":1000,"g":"s","s":"S23","p":"ESPEC 7.1"},
        "arcoFaixaLargura": {"v":32,"g":"d","s":null,"p":null},
        "arcoFaixaEspessura": {"v":5,"g":"d","s":null,"p":null},
        "arcoPesoAberto": {"v":3,"g":"p","s":"S01","p":"17","u":"kg"},
        "arcoPesoFechado": {"v":4,"g":"p","s":"S01","p":"17","u":"kg"},
        "arcoLuvaEncaixe": {"v":38.1,"g":"e","s":null,"p":null},
        "ganchoTopo": {"v":2,"g":"p","s":"S01","p":"16","u":"un"},
        "pesoEscada2m": {"v":6,"g":"p","s":"S01","p":"16","u":"kg"}
      }
    },
    "ra-andaime-olhal": {
      acabamento: {"nome":"aco zincado","hex":"#B9BEC2","fonteId":"S21"},
      cotas: {
        "rosca": {"v":"M12","g":"s","s":"S20","p":"ficha","u":"rosca"},
        "olhalDiametroInterno": {"v":23,"g":"s","s":"S20","p":"ficha"},
        "olhalDiametroBarra": {"v":8,"g":"e","s":null,"p":null},
        "olhalDiametroExterno": {"v":39,"g":"d","s":null,"p":null},
        "buchaDiametro": {"v":12.7,"g":"s","s":"S21","p":"ficha"},
        "hastesComprimentoTotal": {"v":100,"g":"e","s":"S21","p":"ficha"},
        "hasteRoscadaLivre": {"v":30,"g":"e","s":null,"p":null}
      }
    },
    "ra-andaime-tela": {
      acabamento: {"nome":"polietileno (PE)","hex":"verde #5B8C3A; laranja #F08A24; branca #F2F2EE","fonteId":"S17"},
      cotas: {
        "larguraRolo": {"v":3000,"g":"p","s":"S17","p":"ficha"},
        "comprimentoRolo": {"v":100000,"g":"s","s":"S18","p":"ficha"},
        "malhaMaximaNorma": {"v":25,"g":"s","s":"S23","p":"NBR 6494 3.2.4.1"},
        "malhaFachadeira": {"v":2.5,"g":"d","s":"S19","p":"ficha"},
        "gramatura": {"v":50,"g":"s","s":"S19","p":"ficha","u":"g/m2"},
        "alturaPainelModelo": {"v":1200,"g":"e","s":null,"p":null},
        "fioDiametro": {"v":0.8,"g":"e","s":null,"p":null}
      }
    }
  } };
  global.FamiliasAndaimeDados = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
