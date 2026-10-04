/**
 * Barra de orçamento.
 *
 * Mostra três informações sobrepostas no mesmo trilho: o que já foi
 * consumido, até onde a projeção aponta e onde está o limite. Separar isso
 * em três elementos faria o leitor comparar números em vez de ver a relação.
 */

import { el } from '../dom.js';
import { currency, percent } from '../../format.js';

/** O trilho representa 130% do orçamento, deixando o estouro visível. */
const ESCALA = 130;

/**
 * @param {object} orcamento  { name, scopeValue, amount, consumed, forecast, ... }
 */
export function budgetBar(orcamento) {
  const { name, amount, consumed, forecast } = orcamento;

  const pctConsumido = amount > 0 ? (consumed / amount) * 100 : 0;
  const pctProjetado = amount > 0 ? (forecast / amount) * 100 : 0;
  const estoura = forecast > amount;

  const larguraConsumo = Math.min(pctConsumido, ESCALA) / ESCALA * 100;
  const inicioProjecao = larguraConsumo;
  const fimProjecao = Math.min(pctProjetado, ESCALA) / ESCALA * 100;
  const posicaoLimite = 100 / ESCALA * 100;

  const saldo = forecast - amount;

  return el('li', { class: 'budget' },
    el('div', { class: 'budget__head' },
      el('div', {},
        el('h3', { class: 'budget__name', text: name }),
        el('p', { class: 'budget__scope', text: escopo(orcamento) })),
      el('p', { class: 'budget__figures' },
        el('span', { class: 'num', text: currency(consumed) }),
        ' de ',
        el('span', { class: 'num', text: currency(amount) }),
        el('span', { class: 'budget__status' },
          'projeção ',
          el('span', { class: 'num', text: currency(forecast) }),
          ' · ',
          el('span', {
            style: { color: estoura ? 'var(--alert)' : 'var(--gain)' },
            text: estoura
              ? `${currency(saldo)} acima do limite`
              : `${currency(-saldo)} disponíveis`,
          }),
          ' ',
          el('span', {
            class: `tag tag--${estoura ? 'alert' : 'gain'}`,
            text: estoura ? 'Estouro previsto' : 'Dentro do limite',
          })))),

    el('div', {
      class: 'budget__track',
      role: 'img',
      'aria-label': `${name}: consumido ${percent(pctConsumido)} do orçamento, `
        + `projeção de ${percent(pctProjetado)}`,
    },
    el('span', {
      class: `budget__used${estoura ? ' budget__used--alert' : ''}`,
      style: { width: `${larguraConsumo.toFixed(1)}%` },
    }),
    el('span', {
      class: 'budget__forecast',
      style: {
        left: `${inicioProjecao.toFixed(1)}%`,
        width: `${Math.max(fimProjecao - inicioProjecao, 0).toFixed(1)}%`,
      },
    }),
    el('span', { class: 'budget__limit', style: { left: `${posicaoLimite.toFixed(1)}%` } })),

    el('p', { class: 'budget__scale' },
      el('span', {}, 'consumido ', el('b', { class: 'num', text: percent(pctConsumido) })),
      el('span', {
        class: 'budget__mark',
        style: { left: `${posicaoLimite.toFixed(1)}%` },
        text: 'limite do orçamento',
      }),
      el('span', {}, 'projetado ', el('b', { class: 'num', text: percent(pctProjetado) }))));
}

function escopo(o) {
  const rotulos = {
    subAccountId: 'conta',
    environment: 'Environment',
    provider: 'provedor',
    serviceCategory: 'categoria',
  };
  return `${rotulos[o.scopeType] ?? o.scopeType} ${o.scopeValue}`;
}

/** Lista de orçamentos. */
export function budgetList(orcamentos) {
  return el('ul', { class: 'budgetlist' }, ...orcamentos.map(budgetBar));
}