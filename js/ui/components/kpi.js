/**
 * Indicador de topo.
 *
 * Medição separada por régua, sem cartão e sem preenchimento — decisão de
 * design que troca caixa por espaço em branco, cabendo mais informação na
 * mesma altura de tela.
 */

import { el, fragment } from '../dom.js';
import { splitCurrency, percent, integer } from '../../format.js';

/**
 * @param {object} dados
 * @param {string} dados.label      rótulo do indicador
 * @param {number} dados.value      valor numérico
 * @param {string} [dados.format]   'currency' | 'percent' | 'integer' | 'score'
 * @param {string} [dados.meta]     linha de apoio abaixo do número
 * @param {string} [dados.tone]     'gain' | 'warn' | 'alert'
 * @param {number} [dados.meterPct] desenha um medidor em vez do meta
 */
export function kpi(dados) {
  const { label, value, format = 'currency', meta, tone, meterPct, valueTone } = dados;
  const idRotulo = `kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const classeValor = ['kpi__value', 'num', valueTone ? `kpi__value--${valueTone}` : '']
    .filter(Boolean).join(' ');

  const node = el('article', { class: 'kpi' },
    el('span', { class: 'kpi__label', id: idRotulo, text: label }),
    el('span', { class: classeValor, 'aria-labelledby': idRotulo }, ...partesDoValor(value, format)),
  );

  if (meterPct !== undefined && meterPct !== null) {
    node.appendChild(
      el('span', { class: 'meter' },
        el('span', {
          class: `meter__fill${tone ? ` meter__fill--${tone}` : ''}`,
          style: { width: `${Math.max(0, Math.min(100, meterPct))}%` },
        })),
    );
  } else if (meta) {
    node.appendChild(el('span', {
      class: `kpi__meta${tone ? ` kpi__meta--${tone}` : ''}`,
      text: meta,
    }));
  }

  return node;
}

/** Quebra o valor em partes para que os centavos fiquem menores. */
function partesDoValor(valor, formato) {
  if (formato === 'currency') {
    const { integer: inteiro, cents } = splitCurrency(valor);
    return [inteiro, cents ? el('span', { class: 'kpi__cents', text: cents }) : null];
  }
  if (formato === 'percent') return [percent(valor, 1)];
  if (formato === 'score') {
    return [String(Math.round(valor)), el('span', { class: 'kpi__unit', text: '/100' })];
  }
  return [integer(valor)];
}

/** Faixa com vários indicadores lado a lado. */
export function kpiStrip(itens) {
  return el('div', { class: 'kpistrip' }, ...itens.map(kpi));
}

/** Monta a faixa dentro de um contêiner, substituindo o conteúdo anterior. */
export function renderKpiStrip(container, itens) {
  container.replaceChildren(fragment(kpiStrip(itens)));
  return container;
}