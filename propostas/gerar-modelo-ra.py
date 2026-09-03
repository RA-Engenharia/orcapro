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
import json
import os

MODELO = {
    "marca": "orcapro:modelo-de-proposta",
    "versao": 1,
    "exportadoEm": "2026-09-03T00:00:00.000Z",
    "modelo": {
        "nome": "RA Engenharia — padrão",
        "descricao": "Modelo oficial da RA Engenharia Especial: curvas da marca, quem somos, o que fazemos, escopo, investimento, condições, aceite e contatos clicáveis (WhatsApp, e-mail, site, planilha).",
        "estilo": {
            "corTitulo": "#0F3B5E",        # azul-marinho do logo
            "corTexto": "#26303A",
            "corFundo": "#FFFFFF",
            "corDestaque": "#7D6E4F",      # taupe/dourado do logo
            "corDestaque2": "#3F7D22",     # verde do logo
            "corFundoEscuro": "#0B2E4A",
            "textura": "",
            "fonte": "montserrat",
            "formato": "a4",
            "ornamento": "curvas",
            "rodape": "contatos",
            "fundoInternas": "claro",
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
            {"id": "p6", "tipo": "condicoes", "titulo": "Condições gerais",
             "paragrafos": "\n".join([
                 "Os serviços seguem as normas técnicas ABNT aplicáveis e a NR-18, com acompanhamento de engenheiro responsável.",
                 "Quantidades marcadas como estimadas são conferidas em visita técnica; variações relevantes são tratadas por aditivo ou por diária, sempre com aprovação prévia.",
                 "Salvo indicação em contrário nesta proposta, materiais, água e energia no local são de responsabilidade da contratante.",
                 "Esta proposta é válida pelo prazo indicado no aceite; após esse prazo os valores podem ser revisados.",
             ]),
             "usarPrazo": True, "usarGarantia": True},
            {"id": "p7", "tipo": "assinatura", "titulo": "ACEITE DA PROPOSTA",
             "texto": "A assinatura abaixo formaliza a aprovação do escopo, dos valores e das condições desta proposta. O aceite também pode ser confirmado por e-mail ou WhatsApp.",
             "mostrarValidade": True},
            {"id": "p8", "tipo": "contato", "titulo": "FALE CONOSCO",
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
