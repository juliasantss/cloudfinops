/**
 * Estados de carregamento, vazio e erro.
 *
 * É o que mais separa protótipo de produto: dado vindo da rede tem três
 * desfechos possíveis, e os três precisam de tela. Esconder a falha no
 * console deixa o usuário olhando para uma área em branco.
 */

import { el } from '../dom.js';

/** Esqueleto exibido enquanto a requisição está em andamento. */
export function loadingState(mensagem = 'Carregando dados…') {
  return el('div', { class: 'state state--loading', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'state__bar' }),
    el('p', { class: 'state__text', text: mensagem }));
}

/** Resultado vazio: a requisição funcionou, mas não há o que exibir. */
export function emptyState({ title = 'Nenhum resultado', message = '', action = null } = {}) {
  return el('div', { class: 'state state--empty' },
    el('p', { class: 'state__title', text: title }),
    message ? el('p', { class: 'state__text', text: message }) : null,
    action ? botao(action) : null);
}

/**
 * Falha de comunicação.
 *
 * A mensagem vem de `ApiError.userMessage`, que distingue servidor fora do
 * ar, timeout e recusa. "Erro ao carregar" para tudo não ajuda ninguém.
 */
export function errorState(erro, onRetry = null) {
  const mensagem = erro?.userMessage ?? erro?.message ?? 'Erro inesperado.';
  const detalhe = erro?.status ? `HTTP ${erro.status}` : erro?.kind ?? '';

  return el('div', { class: 'state state--error', role: 'alert' },
    el('p', { class: 'state__title', text: 'Não foi possível carregar' }),
    el('p', { class: 'state__text', text: mensagem }),
    detalhe ? el('p', { class: 'state__detail num', text: detalhe }) : null,
    onRetry ? botao({ label: 'Tentar novamente', onClick: onRetry }) : null);
}

function botao({ label, onClick }) {
  return el('button', { type: 'button', class: 'state__action', text: label, on: { click: onClick } });
}

/**
 * Executa uma função assíncrona desenhando os três estados no contêiner.
 * Concentra num só lugar o ciclo carregando -> sucesso -> erro.
 */
export async function withState(container, carregar, renderizar, opcoes = {}) {
  container.replaceChildren(loadingState(opcoes.loadingMessage));

  try {
    const dados = await carregar();

    if (Array.isArray(dados) && dados.length === 0) {
      container.replaceChildren(emptyState({
        title: opcoes.emptyTitle ?? 'Nenhum resultado',
        message: opcoes.emptyMessage ?? 'Ajuste os filtros e tente novamente.',
      }));
      return dados;
    }

    container.replaceChildren(renderizar(dados));
    return dados;
  } catch (erro) {
    container.replaceChildren(errorState(erro, () => {
      withState(container, carregar, renderizar, opcoes);
    }));
    return null;
  }
}