<div align="center">

<img src="assets/logo.svg" alt="CloudFinOps" width="260">

**Plataforma Web de observabilidade financeira de infraestrutura em nuvem**

![HTML5](https://img.shields.io/badge/HTML5-sem%C3%A2ntico-e34f26?style=flat-square)
![CSS3](https://img.shields.io/badge/CSS3-sem_framework-1572b6?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-f7df1e?style=flat-square)
![JSON Server](https://img.shields.io/badge/json--server-API_simulada-ff6b6b?style=flat-square)
![FOCUS](https://img.shields.io/badge/FOCUS-1.4-6e9bff?style=flat-square)

</div>

---

## Sobre

Boa parte do desperdício em ambientes de nuvem nasce de **decisões de rede** — NAT Gateways mal roteados, transferência entre regiões, endereços elásticos ociosos — e permanece invisível até a fatura fechar, trinta dias depois. As ferramentas nativas espalham esse diagnóstico entre Cost Explorer, Budgets, Anomaly Detection e Trusted Advisor, cada uma com sua interface.

O CloudFinOps reúne tudo em uma trilha única: **ver → detectar → agir**.

A plataforma observa, diagnostica e recomenda. Não provisiona, não desliga e não altera recursos — é uma camada de decisão, não de execução.

### Multicloud por padrão aberto

Os dados seguem **FOCUS 1.4**, a *FinOps Open Cost and Usage Specification* mantida pela FinOps Foundation e ratificada em junho de 2026, com exportação nativa em AWS, Microsoft Azure, Google Cloud, Oracle e outros.

A consequência prática: **as três nuvens chegam no mesmo esquema**, a comparação entre elas é possível pelo campo normalizado `ServiceCategory`, e qualquer organização que já exporte nesse formato conecta a plataforma sem transformação.

---

## Equipe

| Integrante | GitHub | LinkedIn |
|---|---|---|---|
| Júlia Beatriz | [@juliasantss](https://github.com/juliasantss) | [perfil](https://www.linkedin.com/in/julia-beatriz-santss/) |
| Fernanda Cipriano |  [@fernandacipriano2410](https://github.com/fernandacipriano2410) | [perfil](https://www.linkedin.com/in/fernanda-mcipriano/) |
| Júlia Evelim | [@usuario](https://github.com/usuario) | [perfil](https://linkedin.com/in/usuario) |

> Substitua matrículas e links antes de enviar.

---

## Telas

| Tela | Arquivo | O que responde |
|---|---|---|
| Índice | `index.html` | Que telas existem |
| Acesso | `login.html` | Quem está usando e com qual perfil |
| Dashboard | `dashboard.html` | Como estamos agora? |
| Custos | `costs.html` | Para onde está indo o dinheiro? |
| Anomalias | `anomalies.html` | O que fugiu do esperado? |
| Recomendações | `recommendations.html` | O que eu faço a respeito? |
| Orçamentos | `budgets.html` | Estamos dentro do planejado? |
| Governança | `governance.html` | Sabemos de quem é o gasto? |
| Simulador | `calculator.html` | Quanto custaria em outra nuvem? |

---

## Funcionalidades

### Projeto 1.1 — implementado

- [x] Nove telas, oito delas consumindo API simulada com `json-server`
- [x] Dados **multicloud** no padrão FOCUS 1.4: AWS, Azure e Google Cloud
- [x] Fetch com os quatro verbos: GET, POST, PUT/PATCH e DELETE
- [x] Tratamento de erro com timeout, nova tentativa e recuperação na interface
- [x] Manipulação de DOM manual, **sem `innerHTML`** em nenhum arquivo
- [x] Filtros combináveis com estado refletido na URL
- [x] Ordenação e paginação de tabelas
- [x] Detecção de anomalias recalculada no cliente a partir da série diária
- [x] CRUD completo de orçamentos
- [x] Simulador de custo comparando as três nuvens
- [x] Perfis de visualização: Executivo, FinOps e Engenharia
- [x] Organização em ES Modules com quatro camadas

### Próxima etapa — Projeto 1.2

- [ ] API REST com Express.js
- [ ] Persistência com Prisma e PostgreSQL
- [ ] **Autenticação real** com hash de senha e JWT
- [ ] Integração ao vivo com as APIs de preço das nuvens

---

## Como executar

Requisitos: Node.js 18+. Python 3 apenas para regenerar os dados.

```bash
git clone https://github.com/usuario/cloudfinops.git
cd cloudfinops
npm install
npm run api        # json-server em http://localhost:3000
```

Em outro terminal, sirva os arquivos estáticos — com a extensão **Live Server** do VS Code, ou:

```bash
npx serve -l 5500
```

Acesse `http://localhost:5500`.

| Comando | O que faz |
|---|---|
| `npm run api` | Sobe o json-server na porta 3000 |
| `npm run data` | Regenera `api/db.json` a partir do ETL |
| `npm run check` | Testa as métricas contra o dataset, fora do navegador |

> As telas dinâmicas exigem o `json-server` em execução. Sem ele, a aplicação exibe o estado de erro com botão de recuperação — comportamento proposital, não falha.

---

## Arquitetura

```
Navegador (ES Modules)
   |  fetch
   v
json-server  --  api/db.json  <-- tools/build-dataset.py <-- data/raw/*.csv (FOCUS 1.4)
```

### Camadas

```
js/
├── config.js · format.js      configuração e formatação
├── api/                       comunicação HTTP
├── core/                      cálculo de negócio
├── ui/ + ui/components/       construção de interface
└── pages/                     orquestração por tela
```

**A regra que organiza tudo:** `api/` e `core/` nunca tocam no DOM; `ui/` e `pages/` nunca fazem requisição.

Consequência verificável: `core/` roda fora do navegador. O `npm run check` executa os cálculos em Node, contra o dataset real.

### Estrutura

```
cloudfinops/
├── *.html                  9 telas
├── api/db.json             API simulada · 14 recursos
├── css/                    7 arquivos na ordem da cascata
├── js/                     api · core · ui · pages
├── data/raw/               4.800 linhas FOCUS em CSV
├── tools/                  ETL e verificação
├── docs/                   contrato de dados e cobertura dos critérios
├── assets/                 logo, favicon, preview
└── prototypes/             capturas e benchmarking
```

---

## Dados

| Item | Valor |
|---|---|
| Padrão | FOCUS 1.4 (Cost and Usage) · 42 das 65 colunas |
| Natureza | Sintético e determinístico (semente fixa) |
| Período | agosto a outubro de 2026 |
| Linhas brutas | 4.800 |
| Provedores | AWS, Microsoft Azure, Google Cloud |
| Recursos inventariados | 180 |

Rodar `npm run data` duas vezes produz resultado idêntico. Colunas, invariantes e rotas em **[`docs/data-contract.md`](docs/data-contract.md)**.

### Tags obrigatórias

| Chave | Finalidade | Valores aceitos |
|---|---|---|
| `OwnerTeam` | Equipe responsável pelo gasto | `plataforma`, `redes`, `backend`, `dados` |
| `Environment` | Separa produção de ambientes descartáveis | `prod`, `staging`, `dev` |
| `ManagedBy` | Origem do provisionamento | `terraform`, `cloudformation`, `serverless`, `manual` |

Recursos sem `OwnerTeam` compõem o **custo não atribuível** — o valor que nenhuma equipe revisa, questiona ou desliga.

---

## Decisões técnicas

**CSS próprio, sem Bootstrap ou Tailwind.** O critério avalia como o layout foi organizado. Um sistema de tokens demonstra domínio de cascata e variáveis CSS, e evita depender de CDN na apresentação.

**Nenhum `innerHTML`.** Com dado vindo de API, `innerHTML` é vetor de injeção; `textContent` escapa o conteúdo por natureza. Todos os componentes montam elementos com `createElement`.

**Detecção de anomalia recalculada no cliente.** A API guarda só o status. O mesmo critério está implementado duas vezes — Python no ETL, JavaScript no front — e ambas chegam ao mesmo resultado.

**Atualização otimista nas escritas.** A interface muda antes da resposta e reverte se o servidor recusar. Esperar a resposta faz a interface parecer travada.

**Gráficos em SVG escritos à mão**, sem biblioteca, com coordenadas calculadas a partir dos dados.

---

## Limitações conhecidas

- A tela de acesso **não autentica**: não há senha armazenada nem verificada, e a coleção `users` não tem campo de senha. Autenticação real é o Projeto 1.2.
- O catálogo de preços é um **snapshot versionado**, não consulta ao vivo. A Retail Prices API da Azure é pública, mas AWS exige assinatura SigV4 e Google Cloud exige chave de API — que não pode ficar em front-end.
- Perfis de visualização mudam densidade de informação, **não são controle de acesso**.
- Projeções nos primeiros dias do mês têm baixa confiança estatística, e a interface declara isso.

---

## Documentação

- **[`docs/data-contract.md`](docs/data-contract.md)** — colunas FOCUS, recursos da API, invariantes
- **[`docs/rubric-coverage.md`](docs/rubric-coverage.md)** — onde cada critério de avaliação foi atendido

---

## Licença

Projeto acadêmico da disciplina de Desenvolvimento Web — CST em Redes de Computadores, IFPB Campus João Pessoa, 2026.2.
