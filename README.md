<div align="center">

<img src="assets/logo.svg" alt="CloudFinOps" width="260">

**Plataforma Web para análise e governança de custos de infraestrutura em nuvem**

![HTML5](https://img.shields.io/badge/HTML5-semântico-e34f26?style=flat-square)
![CSS3](https://img.shields.io/badge/CSS3-sem_framework-1572b6?style=flat-square)
![SVG](https://img.shields.io/badge/SVG-escrito_à_mão-ff9900?style=flat-square)
![Etapa](https://img.shields.io/badge/etapa-interface_estática-6e9bff?style=flat-square)

</div>

---

## Sobre o projeto

Boa parte do desperdício em ambientes AWS nasce de **decisões de rede** — NAT Gateways mal roteados, transferência entre regiões, endereços elásticos ociosos — e permanece invisível até a fatura fechar, 30 dias depois. Ferramentas nativas espalham essa informação entre Cost Explorer, Budgets, Anomaly Detection e Trusted Advisor, cada uma com sua própria interface.

O CloudFinOps reúne esse diagnóstico em uma trilha única: **ver → detectar → agir**.

O sistema não provisiona, não desliga e não modifica recursos. Ele observa, diagnostica e recomenda. É uma camada de decisão, não uma camada de execução.

## Equipe

| Integrantes |

| _Júlia Beatriz_ | 
| _Fernanda Cipriano_ | 
| _Júlia Evelim_ | 

## Telas da aplicação

Publicado no GitHub Pages: **[usuario.github.io/cloudfinops](https://juliasantss.github.io/cloudfinops/)**

| Tela | Arquivo | O que responde |
|---|---|---|
| Índice | [`index.html`](index.html) | Que telas existem e como navegar entre elas |
| Dashboard | [`dashboard.html`](dashboard.html) | Como estamos agora? |
| Custos | [`costs.html`](costs.html) | Para onde está indo o dinheiro? |
| Anomalias | [`anomalies.html`](anomalies.html) | O que fugiu do esperado? |
| Recomendações | [`recommendations.html`](recommendations.html) | O que eu faço a respeito? |
| Orçamentos | [`budgets.html`](budgets.html) | Estamos dentro do planejado? |
| Governança | [`governance.html`](governance.html) | Sabemos de quem é o gasto? |

## Funcionalidades

### Implementado nesta etapa

- [x] Sete telas estáticas navegáveis, com HTML semântico e CSS próprio
- [x] Dashboard com KPIs, gráfico de evolução e alertas
- [x] Filtros por categoria funcionando **sem JavaScript** (campos de rádio + seletor irmão)
- [x] Expansão de detalhes com `<details>` e `<summary>` nativos
- [x] Gráfico de evolução em SVG escrito à mão, sem biblioteca de gráficos
- [x] Governança das três tags obrigatórias com cálculo de custo não atribuível
- [x] Identidade visual, logo em SVG e tema escuro com design tokens
- [x] Layout responsivo de 360px a 1440px e acessibilidade básica

### Próximas etapas

- [ ] **Projeto 1.1** — consumo de API simulada com `json-server` e Fetch, manipulação de DOM, tratamento de eventos e organização em ES Modules
- [ ] **Projeto 1.2** — API REST com Express.js, persistência com Prisma e PostgreSQL, autenticação JWT e controle de acesso
- [ ] **Futuro** — integração real com AWS Cost Explorer, Budgets e CloudWatch

## Conceitos do domínio

### As três tags obrigatórias

| Chave | Finalidade | Valores aceitos |
|---|---|---|
| `OwnerTeam` | Equipe responsável pelo recurso e pelo custo que ele gera | `plataforma`, `redes`, `backend`, `dados` |
| `Environment` | Separa produção de ambientes descartáveis | `prod`, `staging`, `dev` |
| `ManagedBy` | Origem do provisionamento | `terraform`, `cloudformation`, `serverless`, `manual` |

Recursos sem `OwnerTeam` compõem o **custo não atribuível** — o valor que nenhuma equipe revisa, questiona ou desliga.

### Critério de anomalia

Linha de base: média móvel de 14 dias do mesmo recurso. A classificação exige **desvio percentual e impacto absoluto** simultaneamente, para que uma variação de US$ 2 para US$ 6 não seja tratada como crítica.

| Severidade | Desvio | Impacto projetado |
|---|---|---|
| Crítica | ≥ 100% | ≥ US$ 200/mês |
| Alta | ≥ 50% | ≥ US$ 80/mês |
| Média | ≥ 30% | ≥ US$ 30/mês |
| Baixa | ≥ 20% | qualquer valor |

### FinOps Score

Índice de 0 a 100 com fórmula aberta e exibida na interface — um número sem fórmula é decoração.

| Pilar | Peso | Medida |
|---|---|---|
| Governança e tagging | 25% | % de custo atribuível a recursos com as três tags |
| Otimização | 25% | 1 − (economia potencial ÷ custo total) |
| Controle de custos | 20% | % de orçamentos dentro do limite |
| Previsibilidade | 15% | 1 − erro médio entre projeção e realizado |
| Resposta a anomalias | 15% | % de anomalias tratadas em até 7 dias |

## Tecnologias

| Etapa | Stack |
|---|---|
| Atual | HTML5, CSS3, SVG, Git, GitHub Pages |
| Projeto 1.1 | JavaScript (ES Modules), Fetch API, json-server |
| Projeto 1.2 | Node.js, Express.js, Prisma, PostgreSQL, JWT |

**Nenhuma dependência externa** nesta etapa: sem framework CSS, sem CDN, sem biblioteca de gráficos e sem fontes remotas. A página carrega igual mesmo sem rede — o que também elimina um risco no dia da apresentação.

## Estrutura do repositório

```
cloudfinops/
├── index.html              # índice de navegação (requisito da disciplina)
├── dashboard.html          # visão geral
├── costs.html              # análise de custos
├── anomalies.html          # detecção de anomalias
├── recommendations.html    # recomendações de otimização
├── budgets.html            # orçamentos
├── governance.html         # governança de tags
│
├── css/
│   ├── styles.css          # agregador: define a ordem da cascata
│   ├── tokens.css          # cor, tipografia, espaçamento
│   ├── base.css            # reset, tipografia base, acessibilidade
│   ├── layout.css          # container, topo, navegação, rodapé
│   ├── components.css      # KPI, tabela, badge, filtro, expansor
│   ├── dashboard.css       # ajustes do dashboard
│   └── pages.css           # ajustes das demais telas
│
├── assets/
│   ├── logo.svg
│   ├── favicon.svg
│   └── preview.png         # captura do dashboard (1280×720)
│
├── docs/                   # documentação do sistema
├── prototypes/             # protótipos e capturas de tela
└── README.md
```

## Como executar

Não há etapa de build, servidor ou instalação de dependências.

**Abrindo direto:** baixe o repositório e abra `index.html` no navegador.

**Servindo localmente** (recomendado, pois reproduz o comportamento do GitHub Pages):

```bash
git clone https://github.com/juliasantss/cloudfinops.git
cd cloudfinops
python3 -m http.server 8000
```

Acesse `http://localhost:8000`.

No VS Code, a extensão **Live Server** recarrega a página a cada salvamento.

## Decisões técnicas

**Por que CSS próprio e não Tailwind ou Bootstrap.** A disciplina avalia como o layout foi organizado. Um sistema de tokens próprio (`tokens.css`) demonstra domínio de cascata, especificidade e variáveis CSS, além de não introduzir dependência de CDN.

**Por que os filtros são CSS e não JavaScript.** A etapa atual não permite JavaScript funcional. Campos de rádio combinados com o seletor irmão geral (`~`) produzem filtragem real mantendo o HTML semântico. Na etapa seguinte esse comportamento será reescrito em JavaScript, porque com dados reais a filtragem precisa recalcular totais.

**Por que o gráfico é SVG manual e não Chart.js.** O SVG escrito à mão evita uma dependência externa e prepara a etapa seguinte, quando o mesmo elemento passará a ser gerado dinamicamente a partir do JSON.

**Por que o cabeçalho se repete em sete arquivos.** Sem JavaScript e sem etapa de build, não há forma de compartilhar o bloco. A duplicação está delimitada por comentários `#region` para permitir substituição confiável e será extraída para um módulo na etapa seguinte.

## Limitações conhecidas

- Os filtros em CSS removem linhas do fluxo com `display: none`, o que também as remove da árvore de acessibilidade. Com JavaScript, o correto é anunciar a mudança com `aria-live`.
- Conteúdo dentro de `<details>` fechado pode não ser encontrado pela busca do navegador em algumas versões.
- Todos os dados são fictícios e representam um ambiente com 3 contas AWS e 428 recursos. A aplicação não se conecta a nenhuma API.

## Licença

Projeto acadêmico desenvolvido para a disciplina de Desenvolvimento Web do curso de Tecnologia em Redes de Computadores do IFPB — Campus João Pessoa.