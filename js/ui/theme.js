/**
 * Tema claro e escuro.
 *
 * Os tokens já isolam toda a cor em variáveis CSS, então trocar de tema é
 * trocar um conjunto de variáveis — nenhum componente precisa saber disso.
 */

import { THEME_STORAGE_KEY } from '../config.js';

const TEMAS = ['dark', 'light'];

/** Tema salvo, ou a preferência declarada pelo sistema operacional. */
export function getTheme() {
  const salvo = localStorage.getItem(THEME_STORAGE_KEY);
  if (TEMAS.includes(salvo)) return salvo;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(tema) {
  document.documentElement.dataset.theme = tema;
  localStorage.setItem(THEME_STORAGE_KEY, tema);
}

export function toggleTheme() {
  const novo = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(novo);
  return novo;
}

/** Aplica o tema salvo. Chamar cedo, antes de desenhar a interface. */
export function initTheme() {
  applyTheme(getTheme());
}