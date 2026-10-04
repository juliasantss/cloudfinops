/**
 * Orçamentos — o único recurso com CRUD completo.
 *
 * Cada verbo tem razão de existir: orçamento é criado, editado por inteiro,
 * ajustado em parte e excluído.
 */

import { get, post, put, patch, del } from './client.js';

export function listBudgets(filtros = {}) {
  return get('/budgets', filtros);
}

export function getBudget(id) {
  return get(`/budgets/${id}`);
}

/** POST — cria. Nunca repete em falha: repetir criaria duplicado. */
export function createBudget(orcamento) {
  return post('/budgets', orcamento);
}

/** PUT — substitui o registro inteiro. */
export function updateBudget(id, orcamento) {
  return put(`/budgets/${id}`, orcamento);
}

/** PATCH — altera só o limite de alerta, preservando o resto. */
export function updateAlertThreshold(id, alertThresholdPct) {
  return patch(`/budgets/${id}`, { alertThresholdPct });
}

/** DELETE — remove. */
export function deleteBudget(id) {
  return del(`/budgets/${id}`);
}