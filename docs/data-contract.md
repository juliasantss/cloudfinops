# Contrato de dados — CloudFinOps

> **Padrão:** FOCUS 1.4 — *FinOps Open Cost and Usage Specification*, mantido pela FinOps Foundation sob a Joint Development Foundation.
> **Versão ratificada em:** 4 de junho de 2026
> **Referência:** https://focus.finops.org/docs/specification/v1-4/
> **Moeda:** USD · **Granularidade de origem:** diária

---

## 1. Por que FOCUS

A plataforma **não define formato próprio de dados de custo**. Ela consome FOCUS, o padrão aberto que normaliza dados de cobrança entre provedores de nuvem, SaaS e data center.

Consequências práticas:

- **Multicloud sem código duplicado.** AWS, Azure e Google Cloud chegam no mesmo esquema; a diferença entre provedores é valor de coluna, não caminho de código.
- **Integração sem adaptação.** Qualquer organização que já exporte em FOCUS conecta a plataforma sem transformação intermediária.
- **Vocabulário alinhado ao FinOps Framework.** Os termos da interface são os termos da especificação.

O dataset consumido é o **Cost and Usage**, que na versão 1.4 define 65 colunas. A plataforma usa o subconjunto abaixo.

---

## 2. Colunas FOCUS utilizadas

42 das 65 colunas do dataset Cost and Usage.

### Identificação e período

| Coluna | Uso na plataforma |
|---|---|
| `BillingAccountId` · `BillingAccountName` · `BillingAccountType` | Conta de faturamento raiz |
| `SubAccountId` · `SubAccountName` · `SubAccountType` | Conta, assinatura ou projeto — unidade de alocação e de orçamento |
| `BillingPeriodStart` · `BillingPeriodEnd` | Mês de competência |
| `ChargePeriodStart` · `ChargePeriodEnd` | Dia do encargo — base da série temporal e da linha de base de anomalias |
| `InvoiceIssuerName` | Emissor da fatura |

### Custo

| Coluna | Uso na plataforma |
|---|---|
| `BilledCost` | **Métrica principal.** Todo total exibido na interface |
| `EffectiveCost` | Custo amortizado, já com descontos por compromisso |
| `ListCost` · `ListUnitPrice` | Preço de tabela, base do cálculo de economia efetiva |
| `ContractedCost` · `ContractedUnitPrice` | Preço negociado |
| `BillingCurrency` | Fixado em USD neste conjunto |
| `PricingCategory` | `Standard` ou `Committed` — mede cobertura por compromisso |

### Serviço e recurso

| Coluna | Uso na plataforma |
|---|---|
| `ServiceProviderName` | **Dimensão multicloud.** `AWS`, `Microsoft Azure`, `Google Cloud` |
| `ServiceCategory` | **Campo normalizado — use este para comparar entre nuvens** |
| `ServiceSubcategory` | Detalhe da categoria |
| `ServiceName` | Nome específico do provedor — não comparável entre nuvens |
| `ResourceId` · `ResourceName` · `ResourceType` | Inventário e tela de governança |
| `SkuId` · `SkuPriceId` | Ligação com o catálogo de preços |
| `RegionId` · `RegionName` | Análise geográfica |

### Consumo e cobrança

| Coluna | Uso na plataforma |
|---|---|
| `ConsumedQuantity` · `ConsumedUnit` | Quantidade consumida |
| `PricingQuantity` · `PricingUnit` | Quantidade precificada |
| `ChargeCategory` | `Usage`, `Purchase`, `Tax`, `Credit`, `Adjustment` |
| `ChargeClass` | Vazio em encargo normal; `Correction` em ajuste retroativo |
| `ChargeDescription` · `ChargeFrequency` | Descrição e periodicidade |
| `CommitmentDiscountId` · `CommitmentDiscountCategory` · `CommitmentDiscountStatus` | Cobertura e utilização de compromissos |

### Alocação

| Coluna | Uso na plataforma |
|---|---|
| `Tags` | Objeto chave-valor. **Base de toda a governança** |

**Tags obrigatórias definidas pela organização:**

| Chave | Finalidade | Valores aceitos |
|---|---|---|
| `OwnerTeam` | Equipe responsável pelo recurso e pelo gasto | `plataforma`, `redes`, `backend`, `dados` |
| `Environment` | Separa produção de ambientes descartáveis | `prod`, `staging`, `dev` |
| `ManagedBy` | Origem do provisionamento | `terraform`, `cloudformation`, `serverless`, `manual` |

> **Regra de atribuição:** o *custo sem responsável* considera apenas a ausência de `OwnerTeam`. `Environment` e `ManagedBy` medem qualidade de inventário, não atribuição. Por isso os três valores de custo não somam o total — são recortes sobrepostos, não uma partição.

---

## 3. Origem dos dados

| Item | Valor |
|---|---|
| Natureza | **Sintético e determinístico** |
| Gerador | `tools/build-dataset.py` (semente fixa `20262`) |
| Período | 2026-06-01 a 2026-08-22 |
| Linhas FOCUS brutas | 6.225 |
| Saída bruta | `data/raw/focus-costandusage-<provedor>-2026-06_2026-08.csv` |
| Nenhum dado provém de conta real de nuvem | — |

Executar o gerador duas vezes produz resultado idêntico byte a byte. Isso torna o conjunto reproduzível e versionável.

### Eventos plantados

O gerador injeta desvios propositais, que são a matéria-prima da detecção de anomalias:

| Provedor | Serviço | A partir de | Fator | Severidade resultante |
|---|---|---|---|---|
| AWS | NAT Gateway | 05/08 | 3,64× | Crítica |
| AWS | Amazon S3 | 18/08 a 19/08 | 1,75× | Alta |
| Microsoft Azure | Bandwidth | 12/08 | 1,62× | Alta |
| Google Cloud | BigQuery | 16/08 | 1,95× | Alta |
| AWS | Amazon CloudWatch | 08/08 | 1,42× | Média |
| Google Cloud | Cloud Logging | 14/08 | 1,26× | Baixa |

Declarar os eventos é metodologia, não trapaça: o algoritmo de detecção é avaliado contra desvios conhecidos.

### Substituindo por dados oficiais

Para trocar pelos conjuntos publicados pela FinOps Foundation:

1. Baixar de `FinOps-Open-Cost-and-Usage-Spec/FOCUS-Sample-Data`
2. Colocar os CSV em `data/raw/`
3. Adaptar a função `gerar_linhas()` para ler em vez de gerar
4. As agregações seguintes permanecem inalteradas — é esse o ponto de adotar um padrão

---

## 4. Recursos expostos pelo json-server

`api/db.json` · 418 KB · servido em `http://localhost:3000`

| Recurso | Tipo | Registros | Conteúdo | Verbos usados |
|---|---|---:|---|---|
| `meta` | objeto | 1 | Versão, moeda, período, totais consolidados | GET |
| `dataSources` | coleção | 3 | Provedores conectados, versão FOCUS, última sincronização | GET |
| `monthlySeries` | coleção | 8 | Série jan–ago, com agosto marcado como projeção | GET |
| `charges` | coleção | 225 | Mensal por provedor, serviço, conta e região | GET |
| `dailyTotals` | coleção | 249 | Diário por provedor — série do gráfico | GET |
| `dailyCharges` | coleção | 1.248 | Diário por serviço, de 15/07 em diante | GET |
| `resources` | coleção | 180 | Inventário com tags e conformidade | GET · PATCH |
| `tagCoverage` | coleção | 3 | Conformidade por chave obrigatória | GET |
| `tagPolicies` | coleção | 3 | Taxonomia e valores aceitos | GET · POST · PUT · DELETE |
| `anomalies` | coleção | 6 | Desvios detectados, com linha de base e causa | GET · PATCH |
| `recommendations` | coleção | 9 | Oportunidades priorizadas, multicloud | GET · PATCH |
| `budgets` | coleção | 4 | Orçamentos por escopo | GET · POST · PUT · PATCH · DELETE |
| `priceCatalog` | coleção | 27 | Preços equivalentes entre as três nuvens | GET |
| `scenarios` | coleção | 0 | Cenários salvos do simulador | GET · POST · PUT · DELETE |

### Cobertura dos verbos HTTP

O critério de avaliação exige GET, POST, PUT/PATCH e DELETE. A distribuição acima não é decorativa:

- **POST** — criar orçamento · salvar cenário no simulador · criar política de tag
- **PUT** — editar orçamento por completo · editar política de tag
- **PATCH** — alterar status de anomalia (`open` → `investigating` → `resolved`) e de recomendação
- **DELETE** — excluir orçamento · excluir cenário salvo

### Consultas suportadas pelo json-server

```
GET /charges?month=2026-07&provider=AWS
GET /charges?serviceCategory=Networking&_sort=billedCost&_order=desc
GET /dailyCharges?date_gte=2026-08-01&serviceName=NAT%20Gateway
GET /resources?compliant=false&_sort=monthlyCost&_order=desc&_limit=10
GET /anomalies?severity=Crítica&status=open
GET /priceCatalog?family=compute.4vcpu16gb
```

---

## 5. Invariantes

Garantias verificadas pelo gerador. Quebrar qualquer uma indica defeito no ETL.

1. `meta.totals.closedMonthCost` é igual à soma de `charges` com `month = 2026-07`
2. `meta.totals.currentMonthToDate` é igual à soma de `charges` com `month = 2026-08`
3. `meta.totals.potentialSavings` é igual à soma de `estimatedMonthlySavings` em `recommendations`
4. `meta.totals.unallocatedCost` é igual à soma de `noOwnerCost` em `charges` do mês fechado
5. A soma de `dailyTotals` de um mês é igual à soma de `charges` do mesmo mês
6. Todo registro de `resources` tem `compliant = true` se e somente se possui as três tags obrigatórias
7. `EffectiveCost` é sempre menor ou igual a `BilledCost`
8. Toda `anomalies[].severity` respeita simultaneamente os limiares de desvio e de impacto

---

## 6. Critério de anomalia

**Linha de base:** média móvel de 14 dias do mesmo par provedor/serviço.

A classificação exige **desvio percentual e impacto absoluto ao mesmo tempo**. Exigir os dois evita que uma variação de US$ 2 para US$ 6 — 200% de desvio, US$ 4 de impacto — seja tratada como emergência.

| Severidade | Desvio | Impacto projetado em 30 dias | Prazo de resposta |
|---|---:|---:|---|
| Crítica | ≥ 100% | ≥ US$ 200 | 24 horas |
| Alta | ≥ 50% | ≥ US$ 80 | 3 dias |
| Média | ≥ 30% | ≥ US$ 30 | 7 dias |
| Baixa | ≥ 20% | qualquer valor | sem prazo |

O gerador grava a detecção inicial em `anomalies`. O front-end **recalcula** a partir de `dailyCharges` para demonstrar a lógica, e usa o recurso da API apenas para persistir o status — que é alterado por `PATCH`.

---

## 7. Catálogo de preços

`priceCatalog` contém 27 registros cobrindo 8 famílias equivalentes entre AWS, Azure e Google Cloud, permitindo comparação direta do mesmo cenário entre nuvens.

> **Declaração obrigatória:** o catálogo atual é um **snapshot sintético** (`source: "synthetic-snapshot"`), não uma captura das APIs oficiais. Os valores são plausíveis, não contratuais.

Evolução prevista:

| Provedor | API | Situação |
|---|---|---|
| Microsoft Azure | Retail Prices API | Pública e **não autenticada** — candidata a consulta ao vivo, sujeita a verificação de CORS |
| AWS | Price List Query API | Exige assinatura SigV4 — inviável no navegador |
| Google Cloud | Cloud Billing Catalog API | Exige chave de API — não pode ficar no front-end |

Por isso a consulta ao vivo às três nuvens é um recurso de backend, previsto para o Projeto 1.2. Colocar chave de API em código de front-end, além de não funcionar, é a falha de segurança que o próprio critério do 1.2 avalia.

---

## 8. Como regenerar

```bash
npm run data     # python3 tools/build-dataset.py
npm run api      # json-server --watch api/db.json --port 3000
npm run web      # servidor estático na porta 5500
```

O `db.json` é versionado no repositório para que a aplicação funcione sem exigir Python de quem só vai rodar o front-end.
