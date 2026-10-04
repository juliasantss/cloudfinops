/**
 * Camada FOCUS — validação e normalização.
 *
 * A plataforma não define formato próprio de dados de custo: ela consome
 * FOCUS 1.4, o padrão aberto da FinOps Foundation. Este módulo é a fronteira
 * entre o formato externo e o vocabulário interno da aplicação.
 *
 * Consequência prática: quando outro provedor for adicionado, nada muda aqui.
 * Provedor é valor de coluna, não caminho de código.
 *
 * Módulo puro: não toca no DOM e não faz requisição.
 */

import { REQUIRED_TAG_KEYS, ALLOCATION_TAG_KEY } from '../config.js';

/** Versão da especificação que esta implementação consome. */
export const FOCUS_VERSION = '1.4';

/**
 * Colunas sem as quais nenhuma análise é possível.
 * O dataset Cost and Usage da versão 1.4 define 65 colunas; estas são as
 * que a plataforma trata como obrigatórias.
 */
export const REQUIRED_COLUMNS = [
  'BilledCost',
  'BillingCurrency',
  'ChargePeriodStart',
  'ChargePeriodEnd',
  'ChargeCategory',
  'ServiceProviderName',
  'ServiceName',
  'ServiceCategory',
  'SubAccountId',
];

/**
 * Valores permitidos para ChargeCategory na especificação.
 * Linhas fora desta lista indicam dataset não conforme.
 */
export const CHARGE_CATEGORIES = ['Usage', 'Purchase', 'Tax', 'Credit', 'Adjustment'];

/**
 * Verifica se um conjunto de linhas FOCUS tem as colunas obrigatórias.
 *
 * @param {Array<object>} linhas
 * @returns {{valid: boolean, missingColumns: string[], rowCount: number}}
 */
export function validateDataset(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { valid: false, missingColumns: REQUIRED_COLUMNS, rowCount: 0 };
  }

  const presentes = new Set(Object.keys(linhas[0]));
  const faltando = REQUIRED_COLUMNS.filter((c) => !presentes.has(c));

  return { valid: faltando.length === 0, missingColumns: faltando, rowCount: linhas.length };
}

/**
 * As tags chegam como objeto ou como texto JSON, dependendo da origem
 * (exportação CSV versus API). Normaliza as duas formas.
 *
 * @param {object|string|null} valor
 * @returns {object}
 */
export function parseTags(valor) {
  if (!valor) return {};
  if (typeof valor === 'object') return valor;
  try {
    const obj = JSON.parse(valor);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

/**
 * Converte uma linha FOCUS bruta no vocabulário interno da aplicação.
 *
 * Os nomes internos são curtos e em camelCase; os nomes FOCUS são longos e
 * em PascalCase. Traduzir numa fronteira única evita que o resto do código
 * fique preso ao formato externo.
 *
 * @param {object} linha  linha no esquema FOCUS
 * @returns {object}
 */
export function normalizeRow(linha) {
  return {
    date: String(linha.ChargePeriodStart ?? '').slice(0, 10),
    month: String(linha.ChargePeriodStart ?? '').slice(0, 7),
    provider: linha.ServiceProviderName ?? '',
    serviceName: linha.ServiceName ?? '',
    serviceCategory: linha.ServiceCategory ?? '',
    serviceSubcategory: linha.ServiceSubcategory ?? '',
    subAccountId: linha.SubAccountId ?? '',
    subAccountName: linha.SubAccountName ?? '',
    regionId: linha.RegionId ?? '',
    regionName: linha.RegionName ?? '',
    resourceId: linha.ResourceId ?? '',
    resourceType: linha.ResourceType ?? '',
    chargeCategory: linha.ChargeCategory ?? 'Usage',
    billedCost: Number(linha.BilledCost ?? 0),
    effectiveCost: Number(linha.EffectiveCost ?? linha.BilledCost ?? 0),
    listCost: Number(linha.ListCost ?? linha.BilledCost ?? 0),
    quantity: Number(linha.ConsumedQuantity ?? 0),
    unit: linha.ConsumedUnit ?? '',
    isCommitted: linha.PricingCategory === 'Committed',
    tags: parseTags(linha.Tags),
  };
}

/** Normaliza um conjunto inteiro. */
export function normalizeDataset(linhas) {
  return linhas.map(normalizeRow);
}

/**
 * Quais tags obrigatórias faltam neste recurso.
 * @returns {string[]}
 */
export function missingRequiredTags(tags) {
  const t = parseTags(tags);
  return REQUIRED_TAG_KEYS.filter((chave) => !(chave in t) || t[chave] === '');
}

/** O recurso possui todas as tags obrigatórias? */
export function isTagCompliant(tags) {
  return missingRequiredTags(tags).length === 0;
}

/**
 * O custo deste recurso pode ser atribuído a alguma equipe?
 *
 * Atribuição depende apenas de OwnerTeam. Environment e ManagedBy medem
 * qualidade de inventário, não atribuição — por isso os três percentuais de
 * conformidade não somam o total: são recortes sobrepostos, não partição.
 */
export function isAllocatable(tags) {
  const t = parseTags(tags);
  return Boolean(t[ALLOCATION_TAG_KEY]);
}

/**
 * Chave de comparação entre provedores.
 *
 * ServiceName é específico do provedor: EC2, Virtual Machines e Compute
 * Engine são o mesmo conceito com três nomes. ServiceCategory é o campo
 * normalizado pela especificação — é por ele que se compara nuvens.
 *
 * Usar ServiceName para comparação multicloud é o erro clássico da área.
 */
export function comparableKey(registro) {
  return registro.serviceCategory ?? registro.ServiceCategory ?? '';
}

/**
 * Encargos que representam consumo real, excluindo impostos, créditos e
 * ajustes. É a base correta para análise de otimização.
 */
export function onlyUsage(registros) {
  return registros.filter((r) => (r.chargeCategory ?? r.ChargeCategory) === 'Usage');
}