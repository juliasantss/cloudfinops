/**
 * Recursos de custo da API.
 *
 * Cada função devolve dado cru; nenhuma formata e nenhuma toca no DOM.
 * A camada de página decide o que fazer com o resultado.
 */

import { get } from './client.js';

/** Metadados e totais consolidados do período. */
export function getMeta() {
  return get('/meta');
}

/** Fontes de dados conectadas, com versão FOCUS e última sincronização. */
export function listDataSources() {
  return get('/dataSources');
}

/** Série mensal para o gráfico de evolução. */
export function listMonthlySeries() {
  return get('/monthlySeries');
}

/**
 * Cobranças mensais agregadas.
 * @param {object} filtros  { month, provider, serviceCategory, subAccountId }
 */
export function listCharges(filtros = {}) {
  return get('/charges', filtros);
}

/** Série diária por serviço, usada na detecção de anomalias. */
export function listDailyCharges(filtros = {}) {
  return get('/dailyCharges', filtros);
}

/** Série diária consolidada por provedor. */
export function listDailyTotals(filtros = {}) {
  return get('/dailyTotals', filtros);
}