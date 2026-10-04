/**
 * Configuração central do CloudFinOps.
 *
 * Nenhum valor de domínio fica cravado em código de tela. Limiar de anomalia,
 * tags obrigatórias, moeda e endereço da API vivem aqui — é o que permite que
 * outra organização adapte a plataforma sem tocar na lógica.
 *
 * Este módulo não importa nada e não toca no DOM.
 */

/** Endereço do json-server. Ajuste a porta se subir em outra. */
export const API_BASE = 'http://localhost:3000';

/** Tempo máximo de espera por resposta, em milissegundos. */
export const REQUEST_TIMEOUT = 8000;

/** Quantas vezes uma requisição de leitura é repetida antes de falhar. */
export const RETRY_ATTEMPTS = 2;

/** Moeda e localidade de exibição. Os dados FOCUS estão em USD. */
export const CURRENCY = 'USD';
export const LOCALE = 'pt-BR';

/** Chaves de tag exigidas pela política da organização. */
export const REQUIRED_TAG_KEYS = ['OwnerTeam', 'Environment', 'ManagedBy'];

/**
 * A atribuição de custo depende de quem é o dono. Environment e ManagedBy
 * medem qualidade de inventário, não atribuição.
 */
export const ALLOCATION_TAG_KEY = 'OwnerTeam';

/**
 * Classificação de anomalia.
 *
 * Cada faixa exige desvio percentual E impacto absoluto ao mesmo tempo.
 * Sem a segunda condição, um gasto que vai de US$ 2 para US$ 6 seria
 * classificado como crítico por ter 200% de desvio.
 *
 * A ordem importa: a avaliação para na primeira faixa satisfeita.
 */
export const ANOMALY_SEVERITIES = [
  { label: 'Crítica', minDeviationPct: 100, minMonthlyImpact: 200, responseHours: 24 },
  { label: 'Alta', minDeviationPct: 50, minMonthlyImpact: 80, responseHours: 72 },
  { label: 'Média', minDeviationPct: 30, minMonthlyImpact: 30, responseHours: 168 },
  { label: 'Baixa', minDeviationPct: 20, minMonthlyImpact: 0, responseHours: null },
];

/** Dias da média móvel que define a linha de base. */
export const BASELINE_WINDOW_DAYS = 14;

/** Dias usados para projetar o impacto mensal de um desvio diário. */
export const IMPACT_PROJECTION_DAYS = 30;

/** Estados possíveis de uma anomalia ou recomendação. */
export const WORKFLOW_STATUS = {
  open: { label: 'Aberta', tone: 'alert' },
  investigating: { label: 'Em análise', tone: 'warn' },
  resolved: { label: 'Resolvida', tone: 'gain' },
  dismissed: { label: 'Ignorada', tone: 'neutral' },
  blocked: { label: 'Bloqueada', tone: 'warn' },
};

/**
 * Perfis de visualização.
 *
 * Isto é troca de visualização, não controle de acesso: a autorização por
 * papel com JWT pertence ao Projeto 1.2. O perfil condiciona densidade de
 * informação e exibição de detalhe técnico.
 */
export const VIEW_PROFILES = {
  executive: {
    label: 'Executivo',
    description: 'Poucos indicadores, tendência e risco. Sem detalhe técnico.',
    showResourceIds: false,
    showTechnicalDetail: false,
    maxTableRows: 5,
  },
  finops: {
    label: 'FinOps',
    description: 'Visão completa: alocação, orçamento, variação e economia.',
    showResourceIds: true,
    showTechnicalDetail: false,
    maxTableRows: 25,
  },
  engineering: {
    label: 'Engenharia',
    description: 'Identificadores, região, SKU e tags de cada recurso.',
    showResourceIds: true,
    showTechnicalDetail: true,
    maxTableRows: 50,
  },
};

export const DEFAULT_PROFILE = 'finops';

/** Provedores suportados. A ordem define a exibição na interface. */
export const PROVIDERS = ['AWS', 'Microsoft Azure', 'Google Cloud'];

/** Rótulo curto usado em espaços estreitos, como chips e colunas. */
export const PROVIDER_SHORT = {
  'AWS': 'AWS',
  'Microsoft Azure': 'Azure',
  'Google Cloud': 'GCP',
};

/**
 * Categorias de serviço do FOCUS usadas como filtro.
 * ServiceCategory é normalizado entre provedores; ServiceName não é.
 */
export const SERVICE_CATEGORIES = [
  'Compute',
  'Networking',
  'Storage',
  'Databases',
  'Management and Governance',
  'Analytics',
  'Security',
];

/** Tradução das categorias para exibição. */
export const CATEGORY_LABELS = {
  'Compute': 'Computação',
  'Networking': 'Rede',
  'Storage': 'Armazenamento',
  'Databases': 'Banco de dados',
  'Management and Governance': 'Observabilidade',
  'Analytics': 'Analytics',
  'Security': 'Segurança',
};

/** Chave do tema no armazenamento local. */
export const THEME_STORAGE_KEY = 'cloudfinops:theme';
export const PROFILE_STORAGE_KEY = 'cloudfinops:profile';