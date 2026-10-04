/**
 * Cenários salvos do simulador.
 *
 * Coleção que nasce vazia e é preenchida pelo uso: POST ao salvar, DELETE
 * ao descartar.
 */

import { get, post, del } from './client.js';

export function listScenarios() {
  return get('/scenarios', { _sort: 'savedAt', _order: 'desc' });
}

export function createScenario(cenario) {
  return post('/scenarios', cenario);
}

export function deleteScenario(id) {
  return del(`/scenarios/${id}`);
}