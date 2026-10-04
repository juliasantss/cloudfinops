/**
 * Anomalias.
 *
 * A detecção é recalculada no front-end a partir da série diária; a API
 * guarda apenas o status do tratamento, que muda por PATCH.
 */

import { get, patch } from './client.js';

/** @param {object} filtros  { severity, status, provider } */
export function listAnomalies(filtros = {}) {
  return get('/anomalies', filtros);
}

export function getAnomaly(id) {
  return get(`/anomalies/${id}`);
}

/**
 * Altera o status de uma anomalia.
 * PATCH, e não PUT: só o campo de status muda, o resto do registro permanece.
 *
 * @param {string} id
 * @param {'open'|'investigating'|'resolved'|'dismissed'} status
 */
export function updateAnomalyStatus(id, status) {
  return patch(`/anomalies/${id}`, { status });
}

/** Atribui a anomalia a uma pessoa ou equipe. */
export function assignAnomaly(id, assignedTo) {
  return patch(`/anomalies/${id}`, { assignedTo });
}