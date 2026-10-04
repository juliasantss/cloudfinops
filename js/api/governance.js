/**
 * Inventário e políticas de tag.
 *
 * É o único módulo com CRUD completo das políticas: POST, PUT e DELETE
 * existem porque a taxonomia de tags muda com o tempo.
 */

import { get, post, put, patch, del } from './client.js';

/** @param {object} filtros  { provider, compliant, _sort, _order, _limit } */
export function listResources(filtros = {}) {
  return get('/resources', filtros);
}

/** Recursos fora de conformidade, do mais caro para o mais barato. */
export function listNonCompliant(limite = 10) {
  return get('/resources', { compliant: false, _sort: 'monthlyCost', _order: 'desc', _limit: limite });
}

/** Conformidade pré-calculada por chave de tag. */
export function listTagCoverage() {
  return get('/tagCoverage');
}

/** Taxonomia das tags obrigatórias. */
export function listTagPolicies() {
  return get('/tagPolicies');
}

export function createTagPolicy(politica) {
  return post('/tagPolicies', politica);
}

export function updateTagPolicy(id, politica) {
  return put(`/tagPolicies/${id}`, politica);
}

export function deleteTagPolicy(id) {
  return del(`/tagPolicies/${id}`);
}

/** Corrige as tags de um recurso. */
export function updateResourceTags(id, tags) {
  return patch(`/resources/${id}`, { tags });
}