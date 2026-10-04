/**
 * Recomendações de otimização.
 */

import { get, patch } from './client.js';

/** @param {object} filtros  { priority, status, provider } */
export function listRecommendations(filtros = {}) {
  return get('/recommendations', filtros);
}

export function getRecommendation(id) {
  return get(`/recommendations/${id}`);
}

/**
 * Altera o status da recomendação.
 * @param {'open'|'investigating'|'resolved'|'dismissed'|'blocked'} status
 */
export function updateRecommendationStatus(id, status) {
  return patch(`/recommendations/${id}`, { status });
}