/**
 * Item expansível.
 *
 * Usa <details> e <summary> nativos: o navegador já entrega acessibilidade
 * de teclado e estado anunciado, sem código de gestão de foco.
 */

import { el } from '../dom.js';

/**
 * @param {object} config
 * @param {string} config.title
 * @param {string} [config.subtitle]
 * @param {string|Node} [config.value]   valor à direita
 * @param {Array<Node>} [config.badges]  etiquetas de estado
 * @param {Node|Function} config.body    conteúdo; função é chamada ao abrir
 * @param {boolean} [config.open]
 */
export function expander({ title, subtitle, value, badges = [], body, open = false }) {
  const corpo = el('div', { class: 'expander__body' });
  const detalhes = el('details', { class: 'expander', open });

  const resumo = el('summary', { class: 'expander__summary' },
    el('i', { class: 'chev', 'aria-hidden': 'true' }),
    el('span', { class: 'expander__title' },
      title,
      subtitle ? el('span', { class: 'expander__sub', text: subtitle }) : null),
    value !== undefined && value !== null
      ? (typeof value === 'object' ? value : el('span', { class: 'expander__value num', text: value }))
      : null,
    ...badges);

  detalhes.appendChild(resumo);
  detalhes.appendChild(corpo);

  // Conteúdo pesado só é montado quando o item abre pela primeira vez.
  let montado = false;
  function montar() {
    if (montado) return;
    montado = true;
    const conteudo = typeof body === 'function' ? body() : body;
    if (conteudo) corpo.appendChild(conteudo);
  }

  if (open) montar();
  detalhes.addEventListener('toggle', () => { if (detalhes.open) montar(); });

  return detalhes;
}

/** Lista de pares rótulo/valor usada dentro do expansor. */
export function keyValueList(pares) {
  const dl = el('dl', { class: 'kv' });
  for (const [rotulo, valor] of pares) {
    dl.appendChild(el('dt', { text: rotulo }));
    const dd = el('dd');
    if (typeof valor === 'object' && valor !== null) dd.appendChild(valor);
    else dd.textContent = valor ?? '—';
    dl.appendChild(dd);
  }
  return dl;
}

/** Etiqueta de estado: cor sempre acompanhada de texto. */
export function badge(texto, tom = null) {
  return el('span', { class: `tag${tom ? ` tag--${tom}` : ''}`, text: texto });
}