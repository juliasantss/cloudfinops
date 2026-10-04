/**
 * Barra de filtros.
 *
 * Substitui o truque de CSS puro usado na etapa estática. Com dados reais o
 * filtro precisa recalcular totais, o que exige JavaScript.
 *
 * Um único ouvinte no contêiner atende todos os chips, por delegação.
 */

import { el, delegate } from '../dom.js';
import { integer } from '../../format.js';

/**
 * @param {object} config
 * @param {Array}    config.options  { value, label, count }
 * @param {string}   config.active   valor selecionado
 * @param {Function} config.onChange recebe o novo valor
 * @param {string}   [config.ariaLabel]
 */
export function filterBar({ options, active, onChange, ariaLabel = 'Filtros' }) {
  const barra = el('div', { class: 'filterbar', role: 'group', 'aria-label': ariaLabel });

  function desenhar(selecionado) {
    barra.replaceChildren(...options.map((op) => {
      const ativo = op.value === selecionado;
      return el('button', {
        type: 'button',
        class: `chip${ativo ? ' is-active' : ''}`,
        'aria-pressed': String(ativo),
        dataset: { value: op.value },
      },
      op.label,
      op.count !== undefined
        ? el('span', { class: 'chip__count', text: ` ${integer(op.count)}` })
        : null);
    }));
  }

  delegate(barra, 'click', '[data-value]', (_ev, botao) => {
    const valor = botao.dataset.value;
    desenhar(valor);
    onChange(valor);
  });

  desenhar(active);
  return barra;
}

/**
 * Monta as opções de um filtro a partir dos próprios dados, já com a
 * contagem de cada valor e uma opção "Todos" no início.
 */
export function optionsFrom(registros, chaveFn, { allLabel = 'Todos', labelFn = (v) => v } = {}) {
  const contagem = new Map();
  for (const r of registros) {
    const v = chaveFn(r);
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }

  const opcoes = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([valor, total]) => ({ value: valor, label: labelFn(valor), count: total }));

  return [{ value: '__all__', label: allLabel, count: registros.length }, ...opcoes];
}

/** Valor sentinela da opção "Todos". */
export const ALL = '__all__';