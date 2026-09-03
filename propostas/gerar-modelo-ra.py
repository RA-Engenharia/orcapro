# -*- coding: utf-8 -*-
"""
gerar-modelo-ra.py — monta o MODELO DE PROPOSTA padrão da RA Engenharia no
formato que o OrçaPRO exporta/importa (js/proptpl.js, `paraArquivo`).

Saída: propostas/modelo-proposta-ra-engenharia.json

Como usar no app:
  • link:    app/?importar=../propostas/modelo-proposta-ra-engenharia.json
  • arquivo: Modelos de proposta › "Trazer de um arquivo"
  • backup:  💾 Backup › Restaurar (o mesmo input reconhece o modelo)

Depois de trazer, o modelo aparece em "Gerar Proposta › Com qual desenho?".
Para mandar a outro usuário do sistema: envie este .json (ou o link acima).

Cores tiradas do logo RA Engenharia Especial: azul-marinho, taupe/dourado e verde.
Textos são o ponto de partida — edite no app (Modelos de proposta) ou aqui.
"""
import base64
import json
import os

PASTA = os.path.dirname(os.path.abspath(__file__))
LOGO_PNG = os.path.join(PASTA, "logo-ra-engenharia.png")


def logo_data_uri():
    """O logo VIAJA DENTRO do modelo (campo `logo`, data URI).

    Sem isso, o modelo exportado chega na outra conta com [LOGO] na capa: o
    logo do app mora em prefs (⚙ Empresa), que o arquivo de modelo não leva —
    e não deve levar, porque prefs é da conta de quem recebe, não de quem
    manda. O logo do modelo é a exceção explícita: é a marca do documento.
    """
    with open(LOGO_PNG, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()

MODELO = {
    "marca": "orcapro:modelo-de-proposta",
    "versao": 1,
    "exportadoEm": "2026-09-03T00:00:00.000Z",
    "modelo": {
        "nome": "RA Engenharia — padrão",
        "descricao": "Modelo oficial da RA Engenharia Especial: curvas da marca, quem somos, o que fazemos, escopo, investimento, condições, aceite e contatos clicáveis (WhatsApp, e-mail, site, planilha).",
        "logo": logo_data_uri(),
        "estilo": {
            # cores MEDIDAS no PNG do logo (pixels dominantes), não escolhidas de olho
            "corTitulo": "#0B4269",        # azul-marinho do "A" e do arco externo
            "corTexto": "#26303A",
            "corFundo": "#FFFFFF",
            "corDestaque": "#72664A",      # taupe do "R"
            "corDestaque2": "#417B1F",     # verde da folha
            "corFundoEscuro": "#072E48",   # navy escurecido, para as páginas cheias
            "textura": "",
            "fonte": "montserrat",
            "formato": "a4",
            "ornamento": "curvas",
            "rodape": "contatos",
            "fundoInternas": "claro",
            # o logo da RA é azul-marinho: em página escura ele sai na versão
            # negativa (branco), senão desapareceria na capa
            "logoEscuro": "clarear",
        },
        "paginas": [
            {"id": "p1", "tipo": "capa", "titulo": "PROPOSTA", "subtitulo": "COMERCIAL",
             "chamada": "RA Engenharia Especial · orçamento, execução e gestão de obras",
             "mostrarCliente": True, "mostrarNumero": True, "mostrarLogo": True},
            {"id": "p2", "tipo": "sobre", "titulo": "QUEM SOMOS",
             "texto": ("A RA Engenharia Especial é uma empresa de engenharia civil sediada em Uberlândia/MG, "
                       "com responsabilidade técnica do Eng. Rogério Alves de Souza (CREA-MG 323736).\n"
                       "Atuamos em orçamentos, planejamento, execução e gestão de obras, com custos referenciados "
                       "em bases oficiais (SINAPI), transparência com o cliente e compromisso com prazo e qualidade."),
             "mostrarLogo": True},
            {"id": "p3", "tipo": "servicos", "titulo": "O QUE FAZEMOS",
             "abertura": "Atendemos do estudo inicial à entrega, com o mesmo time acompanhando cada etapa.",
             "itens": "\n".join([
                 "Orçamentos de obras | Planilhas com bases SINAPI/SICRO, BDI, curva ABC e cronograma físico-financeiro.",
                 "Execução e gestão de obras | Equipe própria, diário de obra, medições e controle de custo real × orçado.",
                 "Projetos e BIM | Compatibilização de projetos, quantitativos e modelagem 3D ao 7D.",
                 "Laudos e vistorias | Laudos técnicos e anexos de orçamento para laudo pericial.",
                 "Mão de obra especializada | Pedreiro, ajudante e equipes para reformas, alvenaria, pisos e calçadas.",
             ]),
             "fechamento": "Cada proposta traz memória de cálculo e referência de preço: o cliente sabe o que está pagando."},
            {"id": "p4", "tipo": "texto", "titulo": "Escopo dos serviços",
             "abertura": "Os serviços abaixo foram dimensionados a partir das informações fornecidas pelo cliente e da visita técnica.",
             "rotuloLista": "Está incluso:", "obsTitulo": "Não está incluso:", "observacao": "", "usarComercial": True},
            {"id": "p5", "tipo": "investimento", "titulo": "INVESTIMENTO", "colTrabalho": "Serviço",
             "colValor": "Valor", "tituloPagamento": "CONDIÇÕES DE PAGAMENTO", "detalhar": True,
             "tipografia": {"escalaTitulo": 85, "escalaTexto": 85}},
            {"id": "p6", "tipo": "cronograma", "titulo": "CRONOGRAMA",
             "abertura": "Previsão de execução por etapa, calculada a partir das quantidades desta proposta. O cronograma detalhado é fechado na reunião de início da obra.",
             "mostrarValores": False, "rotuloMes": "Mês", "periodos": "0",
             "legenda": "As barras indicam em que período cada etapa acontece. Atrasos causados por falta de material, chuva ou liberação de acesso deslocam as etapas seguintes."},
            {"id": "p7", "tipo": "condicoes", "titulo": "Condições gerais",
             "paragrafos": "\n".join([
                 "Os serviços seguem as normas técnicas ABNT aplicáveis e a NR-18, com acompanhamento de engenheiro responsável.",
                 "Quantidades marcadas como estimadas são conferidas em visita técnica; variações relevantes são tratadas por aditivo ou por diária, sempre com aprovação prévia.",
                 "Salvo indicação em contrário nesta proposta, materiais, água e energia no local são de responsabilidade da contratante.",
                 "Esta proposta é válida pelo prazo indicado no aceite; após esse prazo os valores podem ser revisados.",
             ]),
             "usarPrazo": True, "usarGarantia": True},
            {"id": "p8", "tipo": "assinatura", "titulo": "ACEITE DA PROPOSTA",
             "texto": "A assinatura abaixo formaliza a aprovação do escopo, dos valores e das condições desta proposta. O aceite também pode ser confirmado por e-mail ou WhatsApp.",
             "mostrarValidade": True},
            {"id": "p9", "tipo": "contato", "titulo": "FALE CONOSCO",
             "pessoas": "Eng. Rogério Alves de Souza — CREA-MG 323736",
             "redes": "", "telefone": "(34) 9286-9383", "whatsapp": "3492869383",
             "email": "contato@raengenhariaespecial.com.br", "site": "",
             "endereco": "Rua Ovídio Bradamante de Toledo, 100, Apto 101 Bl. B — Tubalina — Uberlândia/MG",
             "usarEmpresa": True, "textoZap": "Falar no WhatsApp",
             "botaoPlanilha": True, "textoBotao": "Abrir a planilha desta proposta (Excel)",
             "mostrarFoto": False, "molduraCelular": False},
        ],
    },
    "imagens": {},
}

if __name__ == "__main__":
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modelo-proposta-ra-engenharia.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(MODELO, f, ensure_ascii=False, indent=2)
    print("ok", dest)
