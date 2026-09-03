# -*- coding: utf-8 -*-
"""
derivar-analitico-desonerado.py — produz o ANALÍTICO DESONERADO a partir de
dados que já temos, sem depender da Referência .xlsx da CAIXA.

POR QUE ISTO EXISTE
-------------------
O caminho oficial é `tools/gerar-analitico-sinapi.js --regime desonerada`
(ver `patch-analitico-regime.js`), que lê as abas CCD/ICD do .xlsx mensal.
Esse script roda na máquina do Windows que tem a Referência baixada.

Aqui o mesmo resultado é DERIVADO de duas fontes oficiais que já circulam:

  1. ESTRUTURA e COEFICIENTES  ← `sinapi-<UF>-analitico.json` (o onerado)
     A aba "Analítico" da Referência é NACIONAL e SEM REGIME: a desoneração
     muda o encargo social da hora de mão de obra, não quantas horas entram
     no serviço. Coeficiente é o mesmo nos dois regimes.

  2. PREÇOS UNITÁRIOS          ← `sinapi-<UF>-<COMP>-desonerada.json`
     O sintético desonerado, que sai das abas CCD/ICD. Traz composições e
     insumos com o preço do regime.

REGRA DE PREÇO (a mesma do gerador oficial, `precoInsumo`)
    preço da UF  →  se não houver coleta, preço de SÃO PAULO  →  senão 0.
    O item que usa o preço de SP recebe `precoAtribuidoSP: true`, e a
    composição expõe `pctAtribuidoSP`.

REPARTIÇÃO MO/MAT/EQ (a mesma do gerador oficial, `criarQuebrador`)
    Sub-composição não pertence a UMA categoria: ela é quebrada nas razões
    DELA PRÓPRIA, recursivamente, com memo e guarda de ciclo. Composição de
    hora-homem ("COM ENCARGOS COMPLEMENTARES/SOCIAIS", HORISTA/MENSALISTA) é
    100 % mão de obra e NÃO é recursada — os encargos complementares
    (alimentação, transporte, EPI) são insumos rotulados MAT e diluiriam a MO.
    O mapa de categoria por código sai do próprio analítico onerado, porque a
    categoria é NACIONAL (não muda com o regime).

⚠ ISTO NÃO É PALPITE — O MÉTODO É CONFERIDO CONTRA A VERDADE
    Rodando a mesma derivação com os preços ONERADOS e comparando com o
    analítico onerado publicado (que veio do .xlsx), a saída tem de bater.
    É o que `--conferir` faz, e é o que autoriza confiar na versão
    desonerada. Sem essa conferência passar, não se publica nada.

USO
    python3 ferramentas/derivar-analitico-desonerado.py --conferir PA
    python3 ferramentas/derivar-analitico-desonerado.py MG PA --out app/data
"""
import argparse
import gzip
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "app", "data")
COMPETENCIA = "2026-06"

# mesma expressão do gerador e do `analitico.js`
RE_MO = re.compile(r" COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)")


def r2(n):
    return int(n * 100 + (0.5 if n >= 0 else -0.5)) / 100.0


def carregar(caminho):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def precos_do_sintetico(pacote):
    """codigo -> custoUnitario. O sintético só traz item COM preço na UF."""
    return {str(i["codigo"]): float(i["custoUnitario"]) for i in pacote["dados"]}


def mapa_categoria(analitico):
    """codigo -> categoria, tirado dos INSUMOS do analítico onerado.

    A categoria é NACIONAL (definida pela classe do ISD), então serve aos dois
    regimes. Só INSUMO entra: a categoria de uma sub-composição é calculada,
    não declarada.
    """
    m = {}
    for c in analitico["dados"]:
        for ins in c.get("insumos", []):
            if ins.get("tipo") == "INSUMO":
                m[str(ins["codigo"])] = ins.get("categoria", "MAT")
    return m


class Quebrador(object):
    """Razões MO/MAT/EQ recursivas — espelha `criarQuebrador` do gerador."""

    def __init__(self, comps_por_codigo, preco, mapa_cat):
        self.idx = comps_por_codigo
        self.preco = preco
        self.cat = mapa_cat
        self.memo = {}

    def razoes(self, codigo, visitando):
        if codigo in self.memo:
            return self.memo[codigo]
        c = self.idx.get(codigo)
        if c is None or codigo in visitando:
            return None                      # sem analítico ou ciclo
        visitando.add(codigo)
        mo = mat = eq = 0.0
        for ins in c.get("insumos", []):
            unit = self.preco.get(str(ins["codigo"]), 0.0)
            ct = unit * ins["coeficiente"]
            b = self.bucket(ins, visitando)
            mo += ct * b[0]
            mat += ct * b[1]
            eq += ct * b[2]
        visitando.discard(codigo)
        tot = mo + mat + eq
        if tot <= 0:
            return None
        r = (mo / tot, mat / tot, eq / tot)
        self.memo[codigo] = r
        return r

    def bucket(self, ins, visitando=None):
        d = str(ins.get("descricao", "")).upper()
        if ins.get("tipo") != "INSUMO":
            if RE_MO.search(d):
                return (1.0, 0.0, 0.0)       # hora-homem é 100 % MO
            r = self.razoes(str(ins["codigo"]), visitando if visitando is not None else set())
            if r:
                return r
        cat = self.cat.get(str(ins["codigo"]), ins.get("categoria", "MAT"))
        if cat == "MO":
            return (1.0, 0.0, 0.0)
        if cat == "EQ":
            return (0.0, 0.0, 1.0)
        return (0.0, 1.0, 0.0)


def derivar(analitico, preco_uf, preco_sp, desonerado, mes_rotulo):
    mapa_cat = mapa_categoria(analitico)
    idx = {str(c["codigo"]): c for c in analitico["dados"]}
    # o quebrador precisa do preço EFETIVO (com atribuição SP), igual ao gerador
    efetivo = {}

    def preco_de(cod):
        if cod in efetivo:
            return efetivo[cod]
        u = preco_uf.get(cod)
        sp = False
        if u is None:
            u = preco_sp.get(cod)
            sp = u is not None
        if u is None:
            u = 0.0
        efetivo[cod] = (u, sp)
        return efetivo[cod]

    preco_simples = _PrecoDict(preco_de)
    q = Quebrador(idx, preco_simples, mapa_cat)

    dados = []
    for c in analitico["dados"]:
        custo_mo = custo_mat = custo_eq = custo_sp = 0.0
        itens = []
        for ins in c.get("insumos", []):
            cod = str(ins["codigo"])
            unit, atribuido = preco_de(cod)
            ct = unit * ins["coeficiente"]
            if atribuido:
                custo_sp += ct
            b = q.bucket(ins, set())
            custo_mo += ct * b[0]
            custo_mat += ct * b[1]
            custo_eq += ct * b[2]
            categoria = "MO" if (b[0] >= b[1] and b[0] >= b[2]) else ("EQ" if b[2] > b[1] else "MAT")
            base = mapa_cat.get(cod, ins.get("categoria", "MAT"))
            tipo_insumo = ("mao_obra" if categoria == "MO"
                           else ("equipamento" if (categoria == "EQ" and base == "EQ")
                                 else ins.get("tipoInsumo", "material")))
            item = {
                "tipo": ins.get("tipo"), "codigo": ins["codigo"], "descricao": ins.get("descricao"),
                "unidade": ins.get("unidade"), "coeficiente": ins["coeficiente"],
                "custoUnitario": r2(unit),
                "custoTotal": int(ct * 10000 + (0.5 if ct >= 0 else -0.5)) / 10000.0,
                "tipoInsumo": tipo_insumo, "categoria": categoria,
            }
            if atribuido:
                item["precoAtribuidoSP"] = True
            if ins.get("tipo") != "INSUMO" and b[0] < 0.999 and b[1] < 0.999 and b[2] < 0.999:
                item["razoes"] = {"mo": round(b[0], 4), "mat": round(b[1], 4), "eq": round(b[2], 4)}
            itens.append(item)

        custo_unit = custo_mo + custo_mat + custo_eq
        comp = {
            "codigo": c["codigo"], "descricao": c.get("descricao"), "unidade": c.get("unidade"),
            "grupo": c.get("grupo"), "custoUnitario": r2(custo_unit),
            "custoMO": r2(custo_mo), "custoMAT": r2(custo_mat), "custoEQ": r2(custo_eq),
            "insumos": itens,
        }
        if custo_sp > 0 and custo_unit > 0:
            comp["pctAtribuidoSP"] = round(custo_sp / custo_unit, 4)
        dados.append(comp)

    return {
        "mes": mes_rotulo, "uf": analitico["uf"], "tipo": "analitico",
        "desonerado": desonerado, "count": len(dados),
        "fonte": "SINAPI Analitico " + COMPETENCIA + (" (desonerado)" if desonerado else ""),
        "dados": dados,
    }


class _PrecoDict(object):
    """Adaptador: o Quebrador quer `.get(cod, 0.0)`; aqui o preço já vem
    resolvido com a atribuição de São Paulo."""

    def __init__(self, fn):
        self.fn = fn

    def get(self, cod, padrao=0.0):
        u, _sp = self.fn(str(cod))
        return u if u else padrao


def sintetico_desonerado(uf):
    """Baixa do servidor o sintético desonerado da UF (3 MB), com cache local."""
    import tempfile
    import urllib.request
    # ⚠ o cache NÃO vai para app/data/: o sintético desonerado é entregue pelo
    # servidor (a linha SINAPI_DES do catálogo não tem `local`), então uma cópia
    # ali seria peso morto no repositório — e peso morto que parece dado vivo.
    cachedir = os.environ.get("ORCAPRO_CACHE") or tempfile.gettempdir()
    cache = os.path.join(cachedir, "sinapi-%s-%s-desonerada.json" % (uf, COMPETENCIA))
    if os.path.exists(cache):
        return carregar(cache)
    url = "https://187-127-40-14.sslip.io/bases/sinapi-%s-%s-desonerada.json" % (uf, COMPETENCIA)
    with urllib.request.urlopen(url, timeout=180) as r:
        bruto = r.read().decode("utf-8")
    pacote = json.loads(bruto)
    if pacote.get("desonerado") is not True:
        raise SystemExit("ERRO: %s não se declara desonerado — não gero no escuro." % url)
    with open(cache, "w", encoding="utf-8") as f:
        f.write(bruto)
    return pacote


def conferir(uf):
    """A prova: derivar com os preços ONERADOS tem de reproduzir o analítico
    onerado publicado, que veio do .xlsx. Compara total E repartição."""
    ana = carregar(os.path.join(DATA, "sinapi-%s-analitico.json" % uf))
    puf = precos_do_sintetico(carregar(os.path.join(DATA, "sinapi-%s-%s.json" % (uf, COMPETENCIA))))
    psp = precos_do_sintetico(carregar(os.path.join(DATA, "sinapi-SP-%s.json" % COMPETENCIA)))
    saida = derivar(ana, puf, psp, False, ana.get("mes"))

    oficiais = {str(c["codigo"]): c for c in ana["dados"]}
    n = ok_t = ok_mo = ok_mat = ok_eq = 0
    pior_t = pior_mo = 0.0
    for c in saida["dados"]:
        o = oficiais[str(c["codigo"])]
        n += 1
        dt = abs(c["custoUnitario"] - o["custoUnitario"])
        dmo = abs(c["custoMO"] - o.get("custoMO", 0))
        dmat = abs(c["custoMAT"] - o.get("custoMAT", 0))
        deq = abs(c["custoEQ"] - o.get("custoEQ", 0))
        if dt < 0.005: ok_t += 1
        if dmo < 0.015: ok_mo += 1
        if dmat < 0.015: ok_mat += 1
        if deq < 0.015: ok_eq += 1
        pior_t = max(pior_t, dt); pior_mo = max(pior_mo, dmo)
    print("CONFERENCIA %s — derivar com precos ONERADOS deve reproduzir o oficial" % uf)
    print("  composicoes      : %d" % n)
    print("  custoUnitario ok : %d  (%.2f%%)   pior R$ %.2f" % (ok_t, 100.0 * ok_t / n, pior_t))
    print("  custoMO       ok : %d  (%.2f%%)   pior R$ %.2f" % (ok_mo, 100.0 * ok_mo / n, pior_mo))
    print("  custoMAT      ok : %d  (%.2f%%)" % (ok_mat, 100.0 * ok_mat / n))
    print("  custoEQ       ok : %d  (%.2f%%)" % (ok_eq, 100.0 * ok_eq / n))
    return 100.0 * ok_t / n, 100.0 * ok_mo / n


def gerar(uf, out_dir):
    ana = carregar(os.path.join(DATA, "sinapi-%s-analitico.json" % uf))
    sdes = sintetico_desonerado(uf)
    sp_des = sintetico_desonerado("SP")
    saida = derivar(ana, precos_do_sintetico(sdes), precos_do_sintetico(sp_des), True, ana.get("mes"))

    # conferência contra os CUSTOS OFICIAIS das composições no sintético
    # desonerado (a coluna CCD): é a validação independente da saída.
    oficial = precos_do_sintetico(sdes)
    n = ok = 0
    pior = 0.0
    for c in saida["dados"]:
        o = oficial.get(str(c["codigo"]))
        if o is None:
            continue
        n += 1
        d = abs(c["custoUnitario"] - o)
        if d <= 0.02:
            ok += 1
        pior = max(pior, d)
    print("  %s: %d composicoes | conferidas contra a CCD oficial: %d/%d (%.2f%%) ate 2 centavos, pior R$ %.2f"
          % (uf, saida["count"], ok, n, 100.0 * ok / n if n else 0, pior))

    dest = os.path.join(out_dir, "sinapi-%s-desonerada-analitico.json" % uf)
    texto = json.dumps(saida, ensure_ascii=False, separators=(",", ":"))
    with open(dest, "w", encoding="utf-8") as f:
        f.write(texto)
    with gzip.open(dest + ".gz", "wb", compresslevel=9) as f:
        f.write(texto.encode("utf-8"))
    print("     -> %s (%.1f MB, gz %.1f MB)"
          % (os.path.basename(dest), os.path.getsize(dest) / 1048576.0,
             os.path.getsize(dest + ".gz") / 1048576.0))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ufs", nargs="*", default=[])
    ap.add_argument("--conferir", action="store_true")
    ap.add_argument("--out", default=DATA)
    a = ap.parse_args()
    if not a.ufs:
        ap.error("informe ao menos uma UF")
    if a.conferir:
        for uf in a.ufs:
            conferir(uf.upper())
        sys.exit(0)
    for uf in a.ufs:
        gerar(uf.upper(), a.out)
