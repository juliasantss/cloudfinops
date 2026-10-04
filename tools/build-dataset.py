#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CloudFinOps — gerador do conjunto de dados.

Produz:
  data/raw/focus-costandusage-<provedor>-2026-06_2026-08.csv
      Linhas no esquema FOCUS 1.4 (dataset Cost and Usage), granularidade diaria.
  api/db.json
      Agregacoes e recursos de aplicacao consumidos pelo json-server.

Os dados sao SINTETICOS e DETERMINISTICOS (semente fixa): rodar duas vezes
produz exatamente o mesmo resultado. Nenhuma informacao vem de conta real.

Uso:
    python3 tools/build-dataset.py
"""

import csv
import json
import os
import random
from datetime import date, datetime, timedelta, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_RAW = os.path.join(RAIZ, "data", "raw")
DIR_API = os.path.join(RAIZ, "api")

FOCUS_VERSION = "1.4"
MOEDA = "USD"
SEMENTE = 20262

INICIO = date(2026, 8, 1)
FIM = date(2026, 10, 3)          # mes corrente parcial
MES_FECHADO = "2026-09"
MES_CORRENTE = "2026-10"
DIAS_MES_CORRENTE = 31

# Projecao calculada sobre poucos dias tem baixa confianca estatistica.
# A interface declara isso em vez de exibir o numero como se fosse certeza.
LIMIAR_CONFIANCA_DIAS = 7

TAGS_OBRIGATORIAS = ["OwnerTeam", "Environment", "ManagedBy"]

# ---------------------------------------------------------------- provedores

PROVEDORES = {
    "AWS": {
        "invoiceIssuer": "Amazon Web Services, Inc.",
        "subAccounts": [
            ("111122223333", "producao", "prod", 0.690),
            ("444455556666", "homologacao", "staging", 0.207),
            ("777788889999", "dados", "dev", 0.103),
        ],
        "regions": [("us-east-1", "US East (N. Virginia)"), ("sa-east-1", "South America (Sao Paulo)")],
        "crescimentoAgosto": 1.0895,
    },
    "Microsoft Azure": {
        "invoiceIssuer": "Microsoft Corporation",
        "subAccounts": [
            ("sub-a1b2c3d4", "assinatura-producao", "prod", 0.720),
            ("sub-d4e5f6a7", "assinatura-dev", "dev", 0.280),
        ],
        "regions": [("eastus", "East US"), ("brazilsouth", "Brazil South")],
        "crescimentoAgosto": 1.0400,
    },
    "Google Cloud": {
        "invoiceIssuer": "Google LLC",
        "subAccounts": [
            ("prj-core-prod", "projeto-core", "prod", 0.650),
            ("prj-data-lab", "projeto-dados", "dev", 0.350),
        ],
        "regions": [("us-central1", "Iowa"), ("southamerica-east1", "Sao Paulo")],
        "crescimentoAgosto": 0.9800,
    },
}

# serviceName, ServiceCategory, ServiceSubcategory, ResourceType, PricingUnit,
# custo de julho (USD), perfil de tag, regiao preferencial (indice)
SERVICOS = {
    "AWS": [
        ("Amazon EC2", "Compute", "Virtual Machines", "Instance", "Hours", 3820, "parcial", 0),
        ("Amazon RDS", "Databases", "Relational Databases", "Database Instance", "Hours", 1730, "semOwner", 0),
        ("NAT Gateway", "Networking", "Network Address Translation", "NAT Gateway", "GB", 355, "semManagedBy", 1),
        ("Amazon S3", "Storage", "Object Storage", "Bucket", "GB-Month", 640, "completo", 0),
        ("Amazon CloudWatch", "Management and Governance", "Monitoring", "Log Group", "GB", 430, "semOwner", 0),
        ("Amazon EBS", "Storage", "Block Storage", "Volume", "GB-Month", 310, "semManagedBy", 0),
        ("AWS Data Transfer", "Networking", "Data Transfer", "", "GB", 240, "semTags", 1),
        ("AWS Lambda", "Compute", "Serverless Compute", "Function", "Request", 130, "completo", 0),
        ("Amazon Route 53", "Networking", "Domain Name Services", "Hosted Zone", "Query", 42, "completo", 0),
        ("AWS Secrets Manager", "Security", "Key Management", "Secret", "Secret-Month", 36, "completo", 0),
        ("Amazon ECR", "Storage", "Container Registry", "Repository", "GB-Month", 22, "semEnv", 0),
    ],
    "Microsoft Azure": [
        ("Virtual Machines", "Compute", "Virtual Machines", "Virtual Machine", "Hours", 2140, "parcial", 0),
        ("Azure SQL Database", "Databases", "Relational Databases", "SQL Database", "Hours", 980, "completo", 0),
        ("Azure Blob Storage", "Storage", "Object Storage", "Storage Account", "GB-Month", 520, "completo", 0),
        ("NAT Gateway", "Networking", "Network Address Translation", "NAT Gateway", "GB", 410, "semManagedBy", 1),
        ("Managed Disks", "Storage", "Block Storage", "Disk", "GB-Month", 380, "semEnv", 0),
        ("Azure Monitor", "Management and Governance", "Monitoring", "Workspace", "GB", 330, "semOwner", 0),
        ("Bandwidth", "Networking", "Data Transfer", "", "GB", 260, "semTags", 1),
        ("Azure Functions", "Compute", "Serverless Compute", "Function App", "Request", 120, "completo", 0),
        ("Azure DNS", "Networking", "Domain Name Services", "DNS Zone", "Query", 60, "completo", 0),
        ("Key Vault", "Security", "Key Management", "Vault", "Operation", 60, "completo", 0),
    ],
    "Google Cloud": [
        ("Compute Engine", "Compute", "Virtual Machines", "Instance", "Hours", 1320, "parcial", 0),
        ("Cloud SQL", "Databases", "Relational Databases", "Database Instance", "Hours", 610, "completo", 0),
        ("Cloud Storage", "Storage", "Object Storage", "Bucket", "GB-Month", 340, "completo", 0),
        ("Cloud NAT", "Networking", "Network Address Translation", "NAT Gateway", "GB", 230, "semManagedBy", 1),
        ("Cloud Logging", "Management and Governance", "Monitoring", "Log Bucket", "GB", 210, "semOwner", 0),
        ("Persistent Disk", "Storage", "Block Storage", "Disk", "GB-Month", 190, "semEnv", 0),
        ("Network Egress", "Networking", "Data Transfer", "", "GB", 140, "semTags", 1),
        ("BigQuery", "Analytics", "Data Warehouse", "Dataset", "TB", 130, "completo", 0),
        ("Cloud Functions", "Compute", "Serverless Compute", "Function", "Request", 60, "completo", 0),
        ("Cloud DNS", "Networking", "Domain Name Services", "DNS Zone", "Query", 40, "completo", 0),
        ("Secret Manager", "Security", "Key Management", "Secret", "Secret-Month", 30, "completo", 0),
    ],
}

# Eventos plantados: multiplicam o custo diario do servico a partir de uma data.
# Sao a materia-prima da deteccao de anomalias e cobrem as tres severidades.
EVENTOS = [
    {"provider": "AWS", "service": "NAT Gateway",
     "inicio": date(2026, 9, 20), "fator": 3.64, "status": "open",
     "causa": "Tráfego para S3 e DynamoDB roteado pelo NAT em vez de VPC Endpoints."},
    {"provider": "AWS", "service": "Amazon S3",
     "inicio": date(2026, 9, 28), "fim": date(2026, 9, 29), "fator": 1.75, "status": "resolved",
     "causa": "Aumento de requisições PUT após mudança no nível de log da aplicação."},
    {"provider": "Microsoft Azure", "service": "Bandwidth",
     "inicio": date(2026, 9, 24), "fator": 1.62, "status": "investigating",
     "causa": "Réplica de leitura em brazilsouth sincronizando com eastus."},
    {"provider": "Google Cloud", "service": "BigQuery",
     "inicio": date(2026, 10, 1), "fator": 1.95, "status": "open",
     "causa": "Consultas sem partição varrendo a tabela inteira a cada execução."},
    {"provider": "AWS", "service": "Amazon CloudWatch",
     "inicio": date(2026, 9, 18), "fator": 1.42, "status": "open",
     "causa": "Grupos de log sem política de retenção acumulando volume."},
    {"provider": "Google Cloud", "service": "Cloud Logging",
     "inicio": date(2026, 9, 26), "fator": 1.26, "status": "open",
     "causa": "Aumento de verbosidade após implantação da nova versão."},
]


def evento_de(provedor, servico):
    for e in EVENTOS:
        if e["provider"] == provedor and e["service"] == servico:
            return e
    return None


def fator_evento(evento, d):
    if not evento or d < evento["inicio"]:
        return 1.0
    if "fim" in evento and d > evento["fim"]:
        return 1.0
    return evento["fator"]

TIMES = ["plataforma", "redes", "backend", "dados"]
GERENCIADORES = ["terraform", "cloudformation", "serverless", "manual"]


# ------------------------------------------------------------------ apoio

def iso(d, fim_do_dia=False):
    t = "T23:59:59Z" if fim_do_dia else "T00:00:00Z"
    return d.isoformat() + t


def dias(inicio, fim):
    d = inicio
    while d <= fim:
        yield d
        d += timedelta(days=1)


def dias_no_mes(ano, mes):
    if mes == 12:
        return 31
    return (date(ano, mes + 1, 1) - date(ano, mes, 1)).days


def tags_do_perfil(perfil, ambiente, rnd):
    """Monta o objeto Tags conforme o perfil de conformidade do servico."""
    t = {
        "OwnerTeam": rnd.choice(TIMES),
        "Environment": ambiente,
        "ManagedBy": rnd.choice(GERENCIADORES),
    }
    if perfil == "completo":
        return t
    if perfil == "semOwner":
        del t["OwnerTeam"]
    elif perfil == "semEnv":
        del t["Environment"]
    elif perfil == "semManagedBy":
        del t["ManagedBy"]
    elif perfil == "semTags":
        return {}
    elif perfil == "parcial":
        # 80% completo, 20% sem ManagedBy
        if rnd.random() < 0.20:
            del t["ManagedBy"]
    return t


def fator_diario(d, rnd):
    """Variacao diaria: fim de semana mais barato, ruido pequeno."""
    base = 0.88 if d.weekday() >= 5 else 1.045
    return base * (1 + rnd.uniform(-0.035, 0.035))


# -------------------------------------------------------- geracao das linhas

def gerar_linhas():
    rnd = random.Random(SEMENTE)
    linhas = []

    for provedor, cfg in PROVEDORES.items():
        for (serv, cat, sub, rtype, punit, custo_jul, perfil, ireg) in SERVICOS[provedor]:
            region_id, region_name = cfg["regions"][ireg]
            diario_jul = custo_jul / 31.0

            for sub_id, sub_nome, ambiente, peso in cfg["subAccounts"]:
                for d in dias(INICIO, FIM):
                    # custo base do dia para este servico
                    diario = diario_jul
                    if d.month == 8:
                        diario *= 0.955
                    elif d.month == 10:
                        diario *= cfg["crescimentoAgosto"]
                    diario *= fator_evento(evento_de(provedor, serv), d)

                    valor = diario * peso * fator_diario(d, rnd)
                    if valor < 0.01:
                        continue

                    billed = round(valor, 4)
                    # desconto por compromisso aplicado a parte da computacao
                    tem_desconto = cat == "Compute" and rnd.random() < 0.42
                    effective = round(billed * (0.84 if tem_desconto else 1.0), 4)
                    list_cost = round(billed * 1.0, 4)

                    quantidade = round(billed / max(rnd.uniform(0.02, 0.45), 0.001), 3)
                    unit_price = round(billed / quantidade, 6) if quantidade else 0.0

                    tags = tags_do_perfil(perfil, ambiente, rnd)
                    rid = ""
                    rname = ""
                    if rtype:
                        rid = "%s/%s/%s" % (provedor.split()[0].lower(), sub_id,
                                            serv.lower().replace(" ", "-"))
                        rname = "%s-%s" % (serv.lower().replace(" ", "-"), ambiente)

                    bp_ini = date(d.year, d.month, 1)
                    bp_fim = bp_ini + timedelta(days=dias_no_mes(d.year, d.month))

                    linhas.append({
                        "BilledCost": billed,
                        "BillingAccountId": cfg["subAccounts"][0][0],
                        "BillingAccountName": "cloudfinops-demo",
                        "BillingAccountType": "Billing Account",
                        "BillingCurrency": MOEDA,
                        "BillingPeriodStart": iso(bp_ini),
                        "BillingPeriodEnd": iso(bp_fim),
                        "ChargeCategory": "Usage",
                        "ChargeClass": "",
                        "ChargeDescription": "%s - %s" % (serv, sub or cat),
                        "ChargeFrequency": "Usage-Based",
                        "ChargePeriodStart": iso(d),
                        "ChargePeriodEnd": iso(d, True),
                        "CommitmentDiscountId": ("cd-%s-compute" % provedor.split()[0].lower()) if tem_desconto else "",
                        "CommitmentDiscountCategory": "Usage" if tem_desconto else "",
                        "CommitmentDiscountStatus": "Used" if tem_desconto else "",
                        "ConsumedQuantity": quantidade,
                        "ConsumedUnit": punit,
                        "ContractedCost": effective,
                        "ContractedUnitPrice": unit_price,
                        "EffectiveCost": effective,
                        "InvoiceIssuerName": cfg["invoiceIssuer"],
                        "ListCost": list_cost,
                        "ListUnitPrice": unit_price,
                        "PricingCategory": "Committed" if tem_desconto else "Standard",
                        "PricingQuantity": quantidade,
                        "PricingUnit": punit,
                        "RegionId": region_id,
                        "RegionName": region_name,
                        "ResourceId": rid,
                        "ResourceName": rname,
                        "ResourceType": rtype,
                        "ServiceCategory": cat,
                        "ServiceSubcategory": sub,
                        "ServiceName": serv,
                        "ServiceProviderName": provedor,
                        "SkuId": "%s-%s" % (provedor.split()[0][:3].upper(), serv.replace(" ", "")[:12]),
                        "SkuPriceId": "%s-%s-%s" % (provedor.split()[0][:3].upper(),
                                                    serv.replace(" ", "")[:8], region_id),
                        "SubAccountId": sub_id,
                        "SubAccountName": sub_nome,
                        "SubAccountType": "Account" if provedor == "AWS" else "Subscription",
                        "Tags": tags,
                    })
    return linhas


COLUNAS = [
    "BilledCost", "BillingAccountId", "BillingAccountName", "BillingAccountType",
    "BillingCurrency", "BillingPeriodStart", "BillingPeriodEnd", "ChargeCategory",
    "ChargeClass", "ChargeDescription", "ChargeFrequency", "ChargePeriodStart",
    "ChargePeriodEnd", "CommitmentDiscountId", "CommitmentDiscountCategory",
    "CommitmentDiscountStatus", "ConsumedQuantity", "ConsumedUnit", "ContractedCost",
    "ContractedUnitPrice", "EffectiveCost", "InvoiceIssuerName", "ListCost",
    "ListUnitPrice", "PricingCategory", "PricingQuantity", "PricingUnit", "RegionId",
    "RegionName", "ResourceId", "ResourceName", "ResourceType", "ServiceCategory",
    "ServiceSubcategory", "ServiceName", "ServiceProviderName", "SkuId", "SkuPriceId",
    "SubAccountId", "SubAccountName", "SubAccountType", "Tags",
]


def gravar_csv(linhas):
    os.makedirs(DIR_RAW, exist_ok=True)
    for provedor in PROVEDORES:
        slug = provedor.split()[0].lower()
        caminho = os.path.join(DIR_RAW, "focus-costandusage-%s-2026-08_2026-10.csv" % slug)
        sel = [l for l in linhas if l["ServiceProviderName"] == provedor]
        with open(caminho, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLUNAS)
            w.writeheader()
            for l in sel:
                linha = dict(l)
                linha["Tags"] = json.dumps(l["Tags"], ensure_ascii=False)
                w.writerow(linha)
        print("  %-52s %5d linhas" % (os.path.basename(caminho), len(sel)))


# ------------------------------------------------------------- agregacoes

def agregar(linhas):
    diario = {}
    mensal = {}
    for l in linhas:
        dia = l["ChargePeriodStart"][:10]
        mes = dia[:7]
        prov = l["ServiceProviderName"]
        serv = l["ServiceName"]

        kd = (dia, prov, serv)
        a = diario.setdefault(kd, {
            "id": "%s_%s_%s" % (dia, prov.split()[0].lower(), serv.lower().replace(" ", "-")),
            "date": dia, "provider": prov, "serviceName": serv,
            "serviceCategory": l["ServiceCategory"], "billedCost": 0.0, "effectiveCost": 0.0,
        })
        a["billedCost"] += l["BilledCost"]
        a["effectiveCost"] += l["EffectiveCost"]

        km = (mes, prov, serv, l["SubAccountId"], l["RegionId"])
        m = mensal.setdefault(km, {
            "id": "%s_%s_%s_%s" % (mes, prov.split()[0].lower(),
                                   serv.lower().replace(" ", "-"), l["SubAccountId"]),
            "month": mes, "provider": prov, "serviceName": serv,
            "serviceCategory": l["ServiceCategory"], "serviceSubcategory": l["ServiceSubcategory"],
            "subAccountId": l["SubAccountId"], "subAccountName": l["SubAccountName"],
            "environment": "", "regionId": l["RegionId"], "regionName": l["RegionName"],
            "billedCost": 0.0, "effectiveCost": 0.0,
            "taggedCost": 0.0, "untaggedCost": 0.0, "noOwnerCost": 0.0,
        })
        m["billedCost"] += l["BilledCost"]
        m["effectiveCost"] += l["EffectiveCost"]
        tags = l["Tags"]
        if all(k in tags for k in TAGS_OBRIGATORIAS):
            m["taggedCost"] += l["BilledCost"]
        else:
            m["untaggedCost"] += l["BilledCost"]
        if "OwnerTeam" not in tags:
            m["noOwnerCost"] += l["BilledCost"]
        if not m["environment"] and tags.get("Environment"):
            m["environment"] = tags["Environment"]

    for d in diario.values():
        d["billedCost"] = round(d["billedCost"], 2)
        d["effectiveCost"] = round(d["effectiveCost"], 2)
    for m in mensal.values():
        for campo in ("billedCost", "effectiveCost", "taggedCost", "untaggedCost", "noOwnerCost"):
            m[campo] = round(m[campo], 2)

    totais = {}
    for d in diario.values():
        k = (d["date"], d["provider"])
        t = totais.setdefault(k, {"id": "%s_%s" % (d["date"], d["provider"].split()[0].lower()),
                                  "date": d["date"], "provider": d["provider"], "billedCost": 0.0})
        t["billedCost"] += d["billedCost"]
    for t in totais.values():
        t["billedCost"] = round(t["billedCost"], 2)

    return (sorted(diario.values(), key=lambda x: (x["date"], x["provider"], x["serviceName"])),
            sorted(mensal.values(), key=lambda x: (x["month"], x["provider"], -x["billedCost"])),
            sorted(totais.values(), key=lambda x: (x["date"], x["provider"])))


def detectar_anomalias(diario):
    """Linha de base: media movel de 14 dias do mesmo par provedor/servico.
    Severidade exige desvio percentual E impacto absoluto projetado."""
    series = {}
    for d in diario:
        series.setdefault((d["provider"], d["serviceName"]), []).append(d)

    faixas = [("Crítica", 100.0, 200.0), ("Alta", 50.0, 80.0),
              ("Média", 30.0, 30.0), ("Baixa", 20.0, 0.0)]
    achados = []
    for (prov, serv), pontos in series.items():
        pontos.sort(key=lambda x: x["date"])
        for i in range(14, len(pontos)):
            janela = pontos[i - 14:i]
            base = sum(p["billedCost"] for p in janela) / 14.0
            atual = pontos[i]["billedCost"]
            if base <= 0:
                continue
            desvio = (atual - base) / base * 100.0
            impacto_mes = (atual - base) * 30.0
            for nome, min_desvio, min_impacto in faixas:
                if desvio >= min_desvio and impacto_mes >= min_impacto:
                    achados.append({
                        "provider": prov, "serviceName": serv, "date": pontos[i]["date"],
                        "baselineCost": round(base, 2), "observedCost": round(atual, 2),
                        "deviationPct": round(desvio, 1),
                        "monthlyImpact": round(impacto_mes, 2), "severity": nome,
                    })
                    break
    # mantem a primeira deteccao de cada par, que e a que importa
    vistos, unicos = set(), []
    for a in sorted(achados, key=lambda x: x["date"]):
        k = (a["provider"], a["serviceName"])
        if k in vistos:
            continue
        vistos.add(k)
        a["id"] = "anm_%s_%s" % (a["provider"].split()[0].lower(),
                                 a["serviceName"].lower().replace(" ", "-"))
        ev = evento_de(a["provider"], a["serviceName"])
        a["detectedAt"] = a["date"]
        a["probableCause"] = ev["causa"] if ev else "Sem causa identificada."
        a["status"] = ev["status"] if ev else "open"
        a["assignedTo"] = ""
        unicos.append(a)
    ordem = {"Crítica": 0, "Alta": 1, "Média": 2, "Baixa": 3}
    return sorted(unicos, key=lambda x: (ordem[x["severity"]], -x["monthlyImpact"]))


def montar_inventario(linhas):
    rnd = random.Random(SEMENTE + 7)
    custos = {}
    for l in linhas:
        if l["ChargePeriodStart"][:7] != MES_FECHADO or not l["ResourceType"]:
            continue
        k = (l["ServiceProviderName"], l["ServiceName"], l["SubAccountId"])
        e = custos.setdefault(k, {"custo": 0.0, "linha": l})
        e["custo"] += l["BilledCost"]

    inv = []
    for (prov, serv, sub), e in custos.items():
        l = e["linha"]
        # cada combinacao vira de 1 a 4 recursos
        n = rnd.randint(1, 4)
        for i in range(n):
            tags = tags_do_perfil(
                next(s[6] for s in SERVICOS[prov] if s[0] == serv),
                l["Tags"].get("Environment", "prod"), rnd)
            inv.append({
                "id": "res_%04d" % (len(inv) + 1),
                "resourceId": "%s-%06x" % (l["ResourceType"][:3].lower(), rnd.randrange(16 ** 6)),
                "resourceName": "%s-%02d" % (serv.lower().replace(" ", "-"), i + 1),
                "resourceType": l["ResourceType"],
                "provider": prov,
                "serviceName": serv,
                "serviceCategory": l["ServiceCategory"],
                "subAccountId": sub,
                "regionId": l["RegionId"],
                "monthlyCost": round(e["custo"] / n, 2),
                "tags": tags,
                "compliant": all(k in tags for k in TAGS_OBRIGATORIAS),
            })
    return sorted(inv, key=lambda x: -x["monthlyCost"])


def catalogo_precos():
    """Snapshot sintetico de precos equivalentes entre nuvens.
    SUBSTITUIR por captura real: Azure Retail Prices API (publica),
    AWS Price List e GCP Cloud Billing Catalog."""
    itens = [
        ("compute.4vcpu16gb", "Computação 4 vCPU / 16 GB", "Hours",
         [("AWS", "m5.xlarge", "us-east-1", 0.192), ("AWS", "m5.xlarge", "sa-east-1", 0.286),
          ("Microsoft Azure", "D4s v5", "eastus", 0.192), ("Microsoft Azure", "D4s v5", "brazilsouth", 0.274),
          ("Google Cloud", "n2-standard-4", "us-central1", 0.194),
          ("Google Cloud", "n2-standard-4", "southamerica-east1", 0.277)]),
        ("compute.2vcpu8gb", "Computação 2 vCPU / 8 GB", "Hours",
         [("AWS", "m5.large", "us-east-1", 0.096), ("Microsoft Azure", "D2s v5", "eastus", 0.096),
          ("Google Cloud", "n2-standard-2", "us-central1", 0.097)]),
        ("storage.object", "Armazenamento de objetos (padrão)", "GB-Month",
         [("AWS", "S3 Standard", "us-east-1", 0.023), ("Microsoft Azure", "Blob Hot", "eastus", 0.0184),
          ("Google Cloud", "Cloud Storage Standard", "us-central1", 0.020)]),
        ("storage.block", "Disco SSD de uso geral", "GB-Month",
         [("AWS", "gp3", "us-east-1", 0.080), ("Microsoft Azure", "Premium SSD v2", "eastus", 0.085),
          ("Google Cloud", "pd-balanced", "us-central1", 0.100)]),
        ("network.nat", "NAT gerenciado — processamento", "GB",
         [("AWS", "NAT Gateway", "us-east-1", 0.045), ("Microsoft Azure", "NAT Gateway", "eastus", 0.045),
          ("Google Cloud", "Cloud NAT", "us-central1", 0.045)]),
        ("network.egress", "Saída para internet (primeiros 10 TB)", "GB",
         [("AWS", "Data Transfer Out", "us-east-1", 0.090),
          ("Microsoft Azure", "Bandwidth Out", "eastus", 0.087),
          ("Google Cloud", "Network Egress", "us-central1", 0.085)]),
        ("db.relational.2vcpu", "Banco relacional 2 vCPU", "Hours",
         [("AWS", "db.m5.large", "us-east-1", 0.171),
          ("Microsoft Azure", "SQL GP 2 vCore", "eastus", 0.182),
          ("Google Cloud", "Cloud SQL db-n1-standard-2", "us-central1", 0.169)]),
        ("logs.ingestion", "Ingestão de logs", "GB",
         [("AWS", "CloudWatch Logs", "us-east-1", 0.50),
          ("Microsoft Azure", "Azure Monitor", "eastus", 0.46),
          ("Google Cloud", "Cloud Logging", "us-central1", 0.50)]),
    ]
    saida = []
    for familia, descricao, unidade, precos in itens:
        for prov, sku, regiao, preco in precos:
            saida.append({
                "id": "%s_%s_%s" % (familia, prov.split()[0].lower(), regiao),
                "family": familia, "description": descricao, "unit": unidade,
                "provider": prov, "skuName": sku, "regionId": regiao,
                "unitPrice": preco, "currency": MOEDA,
                "source": "synthetic-snapshot", "capturedAt": "2026-08-22",
            })
    return saida


# ---------------------------------------------------------------- db.json

def montar_db(linhas, diario, diarioTotais, mensal, anomalias, inventario):
    jul = [m for m in mensal if m["month"] == MES_FECHADO]
    ago = [m for m in mensal if m["month"] == MES_CORRENTE]
    jun = [m for m in mensal if m["month"] == "2026-08"]

    total_jul = round(sum(m["billedCost"] for m in jul), 2)
    total_ago = round(sum(m["billedCost"] for m in ago), 2)
    total_jun = round(sum(m["billedCost"] for m in jun), 2)
    dias_decorridos = (FIM - date(2026, 10, 1)).days + 1
    projecao = round(total_ago / dias_decorridos * DIAS_MES_CORRENTE, 2)

    sem_dono = round(sum(m["noOwnerCost"] for m in jul), 2)
    sem_tags = round(sum(m["untaggedCost"] for m in jul), 2)

    # serie mensal: janeiro a maio sinteticos, junho a agosto reais
    serie, rnd = [], random.Random(SEMENTE + 3)
    for i, mes in enumerate(["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]):
        fator = 0.80 + i * 0.030
        serie.append({"id": mes, "month": mes,
                      "billedCost": round(total_jul * fator * (1 + rnd.uniform(-0.02, 0.02)), 2),
                      "kind": "actual"})
    serie.append({"id": "2026-08", "month": "2026-08", "billedCost": total_jun, "kind": "actual"})
    serie.append({"id": "2026-09", "month": "2026-09", "billedCost": total_jul, "kind": "actual"})
    serie.append({"id": "2026-10", "month": "2026-10", "billedCost": projecao, "kind": "forecast"})

    conformes = sum(1 for r in inventario if r["compliant"])
    cobertura = {}
    for chave in TAGS_OBRIGATORIAS:
        com = sum(1 for r in inventario if chave in r["tags"])
        custo_sem = round(sum(r["monthlyCost"] for r in inventario if chave not in r["tags"]), 2)
        cobertura[chave] = {
            "key": chave, "resourcesWithTag": com, "resourcesTotal": len(inventario),
            "compliancePct": round(com / len(inventario) * 100, 1), "untaggedCost": custo_sem,
        }

    recomendacoes = [
        ("rec_vpc_endpoints", "AWS", "Substituir rotas do NAT Gateway por VPC Endpoints", "Networking",
         310.0, "Crítica", "medium", "low", "open",
         "Tráfego para S3 e DynamoDB atravessa o NAT Gateway, gerando cobrança por GB sobre dados que não saem da rede do provedor.",
         "Criar Gateway Endpoints nas VPCs afetadas e ajustar as tabelas de rotas das sub-redes privadas."),
        ("rec_rightsizing_ec2", "AWS", "Rightsizing de 4 instâncias EC2 subutilizadas", "Compute",
         480.0, "Alta", "medium", "medium", "open",
         "Quatro instâncias mantêm CPU média abaixo de 12% e pico abaixo de 30% por 30 dias.",
         "Reduzir um nível de tamanho na mesma família e observar por duas semanas."),
        ("rec_savings_plan", "AWS", "Contratar Savings Plans para a carga estável", "Compute",
         260.0, "Alta", "low", "medium", "open",
         "Base estável de computação roda sob demanda há mais de seis meses sem cobertura por compromisso.",
         "Compute Savings Plans de 1 ano cobrindo 70% da base, nunca 100%."),
        ("rec_azure_reserved", "Microsoft Azure", "Reservar instâncias de Virtual Machines", "Compute",
         295.0, "Alta", "low", "medium", "open",
         "As máquinas de produção rodam em pagamento conforme o uso, sem reserva de 1 ou 3 anos.",
         "Reserved VM Instances de 1 ano para as máquinas com uptime acima de 90%."),
        ("rec_gcp_cud", "Google Cloud", "Aplicar Committed Use Discounts no Compute Engine", "Compute",
         180.0, "Média", "low", "medium", "open",
         "O Compute Engine opera sem desconto por uso comprometido apesar de carga previsível.",
         "CUD de 1 ano sobre a base estável de vCPU e memória."),
        ("rec_ebs_orfaos", "AWS", "Remover volumes EBS órfãos e snapshots antigos", "Storage",
         140.0, "Média", "low", "low", "blocked",
         "Volumes desanexados há mais de 60 dias continuam sendo cobrados e nenhum possui a tag OwnerTeam.",
         "Snapshot final, 30 dias de quarentena e então exclusão. Bloqueado até definir responsável."),
        ("rec_s3_lifecycle", "AWS", "Aplicar ciclo de vida nos buckets S3", "Storage",
         90.0, "Média", "low", "low", "open",
         "Buckets mantêm todo o conteúdo na classe padrão, incluindo objetos sem acesso há 90 dias.",
         "Intelligent-Tiering nos buckets de log e backup, com transição para arquivamento após 180 dias."),
        ("rec_logs_retencao", "Microsoft Azure", "Definir retenção no Azure Monitor", "Management and Governance",
         75.0, "Baixa", "low", "low", "open",
         "Workspaces sem política de retenção acumulam volume indefinidamente.",
         "Retenção de 30 dias para logs operacionais e arquivamento para os de auditoria."),
        ("rec_eip_ociosos", "AWS", "Liberar endereços IP elásticos não associados", "Networking",
         60.0, "Baixa", "low", "low", "open",
         "Endereços IPv4 elásticos são cobrados por hora quando não estão associados a instância em execução.",
         "Confirmar que não estão em lista de permissão externa e liberar a alocação."),
    ]
    recs = [{
        "id": r[0], "provider": r[1], "title": r[2], "serviceCategory": r[3],
        "estimatedMonthlySavings": r[4], "priority": r[5], "effort": r[6], "risk": r[7],
        "status": r[8], "problem": r[9], "action": r[10],
    } for r in recomendacoes]
    economia = round(sum(r["estimatedMonthlySavings"] for r in recs), 2)

    orcamentos = [
        ("bdg_aws_prod", "Produção AWS", "AWS", "subAccountId", "111122223333", 6500.0),
        ("bdg_aws_stg", "Homologação AWS", "AWS", "environment", "staging", 1200.0),
        ("bdg_azure", "Azure consolidado", "Microsoft Azure", "provider", "Microsoft Azure", 5600.0),
        ("bdg_gcp", "Google Cloud consolidado", "Google Cloud", "provider", "Google Cloud", 3400.0),
    ]
    buds = []
    for bid, nome, prov, tipo, alvo, limite in orcamentos:
        if tipo == "subAccountId":
            cons = sum(m["billedCost"] for m in ago if m["subAccountId"] == alvo)
        elif tipo == "environment":
            cons = sum(m["billedCost"] for m in ago if m["environment"] == alvo)
        else:
            cons = sum(m["billedCost"] for m in ago if m["provider"] == alvo)
        cons = round(cons, 2)
        proj = round(cons / dias_decorridos * DIAS_MES_CORRENTE, 2)
        buds.append({
            "id": bid, "name": nome, "provider": prov, "scopeType": tipo, "scopeValue": alvo,
            "period": MES_CORRENTE, "amount": limite, "consumed": cons, "forecast": proj,
            "consumedPct": round(cons / limite * 100, 1), "forecastPct": round(proj / limite * 100, 1),
            "alertThresholdPct": 80, "status": "exceeding" if proj > limite else "ok",
        })

    return {
        "meta": {
            "id": "meta",
            "product": "CloudFinOps",
            "version": "0.2.0",
            "focusVersion": FOCUS_VERSION,
            "currency": MOEDA,
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z",
            "dataKind": "synthetic",
            "closedMonth": MES_FECHADO,
            "currentMonth": MES_CORRENTE,
            "currentMonthElapsedDays": dias_decorridos,
            "currentMonthTotalDays": DIAS_MES_CORRENTE,
            "forecastConfidence": "low" if dias_decorridos < LIMIAR_CONFIANCA_DIAS else "normal",
            "forecastBasisDays": dias_decorridos,
            "requiredTagKeys": TAGS_OBRIGATORIAS,
            "totals": {
                "closedMonthCost": total_jul,
                "previousMonthCost": total_jun,
                "currentMonthToDate": total_ago,
                "currentMonthForecast": projecao,
                "potentialSavings": economia,
                "unallocatedCost": sem_dono,
                "untaggedCost": sem_tags,
            },
        },
        "dataSources": [{
            "id": "src_" + p.split()[0].lower(), "provider": p,
            "focusVersion": FOCUS_VERSION, "status": "connected",
            "lastSyncAt": "2026-08-22T06:00:00Z",
            "accounts": len(PROVEDORES[p]["subAccounts"]),
        } for p in PROVEDORES],
        "monthlySeries": serie,
        "charges": mensal,
        "dailyTotals": diarioTotais,
        "dailyCharges": diario,
        "resources": inventario,
        "tagCoverage": list(cobertura.values()),
        "tagPolicies": [
            {"id": "tag_owner", "key": "OwnerTeam", "required": True,
             "purpose": "Identifica a equipe responsável pelo recurso e pelo gasto que ele gera.",
             "allowedValues": TIMES},
            {"id": "tag_env", "key": "Environment", "required": True,
             "purpose": "Separa produção de ambientes descartáveis.",
             "allowedValues": ["prod", "staging", "dev"]},
            {"id": "tag_managed", "key": "ManagedBy", "required": True,
             "purpose": "Indica se o recurso nasceu de infraestrutura como código ou de criação manual.",
             "allowedValues": GERENCIADORES},
        ],
        "anomalies": anomalias,
        "recommendations": recs,
        "budgets": buds,
        "priceCatalog": catalogo_precos(),
        "scenarios": [],
        # Diretorio de usuarios da demonstracao.
        # NENHUMA SENHA e armazenada: a tela de acesso seleciona perfil de
        # visualizacao, nao autentica. Autenticacao real (hash + JWT) e o
        # Projeto 1.2, e precisa de servidor.
        "users": [
            {"id": "usr_ana", "name": "Ana Ribeiro", "email": "ana.ribeiro@contoso.com",
             "jobTitle": "Diretora de Tecnologia", "team": "diretoria", "profile": "executive"},
            {"id": "usr_bruno", "name": "Bruno Lima", "email": "bruno.lima@contoso.com",
             "jobTitle": "Analista FinOps", "team": "plataforma", "profile": "finops"},
            {"id": "usr_carla", "name": "Carla Souza", "email": "carla.souza@contoso.com",
             "jobTitle": "Engenheira de Redes", "team": "redes", "profile": "engineering"},
            {"id": "usr_diego", "name": "Diego Alves", "email": "diego.alves@contoso.com",
             "jobTitle": "Engenheiro de Plataforma", "team": "plataforma", "profile": "engineering"},
        ],
    }


def main():
    print("CloudFinOps — gerando conjunto de dados FOCUS %s\n" % FOCUS_VERSION)
    linhas = gerar_linhas()
    print("Linhas FOCUS geradas: %d\n" % len(linhas))

    print("Gravando CSV bruto:")
    gravar_csv(linhas)

    diario, mensal, diarioTotais = agregar(linhas)
    anomalias = detectar_anomalias(diario)
    JANELA = "2026-09-10"
    diarioServico = [d for d in diario if d["date"] >= JANELA]
    inventario = montar_inventario(linhas)

    os.makedirs(DIR_API, exist_ok=True)
    db = montar_db(linhas, diarioServico, diarioTotais, mensal, anomalias, inventario)
    caminho = os.path.join(DIR_API, "db.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, separators=(",", ":"))

    t = db["meta"]["totals"]
    print("\nResumo:")
    print("  mês fechado (set) ...... US$ %10.2f" % t["closedMonthCost"])
    print("  mês anterior (ago) ..... US$ %10.2f" % t["previousMonthCost"])
    print("  outubro acumulado ...... US$ %10.2f" % t["currentMonthToDate"])
    print("  projeção de outubro .... US$ %10.2f" % t["currentMonthForecast"])
    print("  economia potencial ..... US$ %10.2f" % t["potentialSavings"])
    print("  custo sem responsável .. US$ %10.2f" % t["unallocatedCost"])
    print("  recursos ............... %d (%d conformes)"
          % (len(inventario), sum(1 for r in inventario if r["compliant"])))
    print("  anomalias .............. %d" % len(anomalias))
    print("  séries diárias ......... %d por serviço, %d por provedor"
          % (len(diarioServico), len(diarioTotais)))
    print("  db.json ................ %.1f KB" % (os.path.getsize(caminho) / 1024))


if __name__ == "__main__":
    main()