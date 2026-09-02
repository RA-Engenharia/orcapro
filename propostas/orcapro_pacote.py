# -*- coding: utf-8 -*-
"""
orcapro_pacote.py — monta um PACOTE DE ORÇAMENTO que o OrçaPRO importa pronto.

O pacote é um .json no formato de backup do app, marcado com
`tipo: "pacote-orcamento"`, contendo o orçamento (etapas, itens, BDI, condições
comerciais) e, opcionalmente, o cliente e a obra vinculados. Ele entra no app por:

  1) link:    https://ra-engenharia.github.io/orcapro/app/?importar=<url-do-json>
  2) arquivo: 💾 Backup › Restaurar de um backup (.json)
  3) código:  Pacote.aplicar(dump) no console do app

Leitor: app/js/pacote.js. Regras de mesclagem: por id, o mais novo (atualizadoEm)
vence; nada é apagado. Os ids gerados aqui são DETERMINÍSTICOS (hash do texto
que você passa em `semente`), então gerar de novo o mesmo orçamento produz os
mesmos ids e a reimportação atualiza em vez de duplicar.

Uso mínimo:

    from orcapro_pacote import Pacote
    p = Pacote(gerado_por="proposta X")
    cli = p.cliente("MY Engenharia", uf="MG")
    obra = p.obra("Obra tal", cliente=cli, local="Rua ...", valor=4000)
    orc = p.orcamento("PC-2026-0902-01", "Mão de obra — MY Engenharia", cliente=cli, obra=obra)
    e = p.etapa(orc, "Alvenaria")
    p.item(orc, e, "MO-01", "Alvenaria ...", "m²", 35, 45.00, memoria="preço negociado")
    p.salvar("arquivo.orcapro.json")
"""
import datetime
import hashlib
import json

SCHEMA_VERSAO = 3
APP_VERSAO = "1.2.28"


def _uid(prefixo, semente):
    h = hashlib.sha1(semente.encode("utf-8")).hexdigest()[:14]
    return "%s_%s" % (prefixo, h)


def agora_iso():
    return datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")


def bdi_zero():
    """BDI 0 % — usado quando os preços unitários já são os de venda (negociados)."""
    return {"modeloId": "custom",
            "params": {"AC": 0, "S": 0, "R": 0, "G": 0, "DF": 0, "L": 0, "I": 0},
            "percentual": 0}


def bdi_percentual(pct):
    """BDI com percentual-alvo colocado só no Lucro (mesma inversão da aba BDI do app)."""
    return {"modeloId": "custom",
            "params": {"AC": 0, "S": 0, "R": 0, "G": 0, "DF": 0, "L": round(float(pct), 4), "I": 0},
            "percentual": round(float(pct), 2)}


class Pacote(object):
    def __init__(self, gerado_por="", atualizado_em=None):
        self.gerado_por = gerado_por
        self.atualizado_em = atualizado_em or agora_iso()
        self.orcamentos = []
        self.clientes = []
        self.obras = []

    # ---------------- cadastros ----------------
    def cliente(self, nome, doc="", telefone="", email="", cidade="", uf="", endereco="",
                tipo="PJ", status="ativo", origem="", obs="", semente=None):
        c = {"id": _uid("cli", semente or nome.lower()), "nome": nome, "tipo": tipo, "doc": doc,
             "telefone": telefone, "email": email, "endereco": endereco, "cidade": cidade, "uf": uf,
             "status": status, "origem": origem, "obs": obs,
             "criadoEm": self.atualizado_em, "atualizadoEm": self.atualizado_em}
        self.clientes.append(c)
        return c

    def obra(self, nome, cliente=None, local="", tipo="reforma", fase="", status="planejamento",
             valor=None, inicio="", termino="", responsavel="", obs="", semente=None):
        o = {"id": _uid("obr", semente or nome.lower()), "nome": nome,
             "clienteId": cliente["id"] if cliente else "", "tipo": tipo, "fase": fase, "status": status,
             "local": local, "valor": valor if valor is not None else "", "inicio": inicio, "termino": termino,
             "responsavel": responsavel, "orcamentoId": "", "obs": obs,
             "criadoEm": self.atualizado_em, "atualizadoEm": self.atualizado_em}
        self.obras.append(o)
        return o

    # ---------------- orçamento ----------------
    def orcamento(self, numero, nome, cliente=None, obra=None, uf="MG", competencia="2026-06",
                  bdi=None, arredondamento="arred2", categoria="", prazo_entrega="",
                  comercial=None, cronograma_meses=1, encargos="desonerado"):
        orc = {
            "id": _uid("orc", numero), "schemaVersao": SCHEMA_VERSAO, "numero": numero, "nome": nome,
            "cliente": {"nome": cliente["nome"] if cliente else "", "doc": (cliente or {}).get("doc", ""),
                        "contato": (cliente or {}).get("telefone", "")},
            "obra": {"nome": obra["nome"] if obra else "", "local": (obra or {}).get("local", ""), "regime": "Empreitada"},
            "clienteId": cliente["id"] if cliente else "",
            "obraId": obra["id"] if obra else "",
            "competenciaSinapi": competencia, "uf": uf, "desonerado": encargos == "desonerado",
            "bdi": bdi or bdi_zero(),
            "config": {"categoria": categoria, "prazoEntrega": prazo_entrega, "arredondamento": arredondamento,
                       "bdiIncidencia": "unitario", "encargos": {"tipo": encargos, "horista": 0, "mensalista": 0},
                       "permitirZerado": False, "licitacao": {"ativo": False, "tipo": "", "abertura": "", "processo": ""}},
            "comercial": comercial or {},
            "cronogramaMeses": cronograma_meses, "etapas": [],
            "criadoEm": self.atualizado_em, "atualizadoEm": self.atualizado_em,
        }
        if obra is not None:
            obra["orcamentoId"] = orc["id"]
        self.orcamentos.append(orc)
        return orc

    def etapa(self, orc, nome):
        e = {"id": _uid("eta", orc["numero"] + "|" + nome.lower()), "codigo": "%d.0" % (len(orc["etapas"]) + 1),
             "nome": nome, "itens": []}
        orc["etapas"].append(e)
        return e

    def item(self, orc, etapa, codigo, descricao, unidade, quantidade, preco_unit,
             mo=None, mat=0.0, eq=0.0, origem="PROPRIO", base_fonte=None, memoria=""):
        """preco_unit é o CUSTO UNITÁRIO do app (com BDI 0 % vira o preço de venda).
        Por padrão o item é 100 % mão de obra (mo = preco_unit, mat = eq = 0)."""
        mo = preco_unit if mo is None else mo
        it = {"id": _uid("itm", orc["numero"] + "|" + etapa["nome"].lower() + "|" + str(codigo)),
              "origem": origem, "baseFonte": base_fonte, "codigo": str(codigo), "descricao": descricao,
              "unidade": unidade, "quantidade": round(float(quantidade), 4),
              "custoUnitario": round(float(preco_unit), 2), "custoMO": round(float(mo), 2),
              "custoMAT": round(float(mat), 2), "custoEQ": round(float(eq), 2)}
        if mat == 0 and eq == 0:
            it["modoCusto"] = "mo"
            it["custoBase"] = round(float(preco_unit), 2)
        if memoria:
            it["memoriaCalculo"] = memoria
        etapa["itens"].append(it)
        return it

    # ---------------- saída ----------------
    def total(self, orc):
        t = 0.0
        pct = float(orc["bdi"].get("percentual") or 0) / 100.0
        for e in orc["etapas"]:
            for it in e["itens"]:
                pu = round(it["custoUnitario"] * (1 + pct), 2)
                t += round(pu * it["quantidade"], 2)
        return round(t, 2)

    def dump(self):
        return {"app": "OrçaPRO", "tipo": "pacote-orcamento", "versao": APP_VERSAO,
                "exportadoEm": self.atualizado_em, "geradoPor": self.gerado_por,
                "orcamentos": self.orcamentos,
                "gestao": {k: v for k, v in (("clientes", self.clientes), ("obras", self.obras)) if v}}

    def salvar(self, caminho):
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(self.dump(), f, ensure_ascii=False, indent=2)
        return caminho
