/**
 * Controle de status com escrita na API.
 *
 * Padrão de atualização otimista: a interface muda imediatamente e só então
 * a requisição parte. Se o servidor recusar, o valor anterior é restaurado e
 * o erro aparece ao lado do campo.
 *
 * O contrário — esperar a resposta para só então mudar a tela — faz a
 * interface parecer travada em toda interação.
 */

import { el } from '../dom.js';
import { WORKFLOW_STATUS } from '../../config.js';

/**
 * @param {object} config
 * @param {string}   config.value     status atual
 * @param {string[]} config.options   identificadores permitidos
 * @param {Function} config.onChange  recebe o novo status; deve devolver Promise
 * @param {string}   [config.label]   rótulo acessível
 */
export function statusControl({ value, options, onChange, label = 'Status' }) {
  const erro = el('span', { class: 'statusctl__error', role: 'alert' });
  let anterior = value;

  const seletor = el('select', {
    class: `statusctl statusctl--${WORKFLOW_STATUS[value]?.tone ?? 'neutral'}`,
    'aria-label': label,
    on: {
      // `change` dispara quando a pessoa escolhe outra opção.
      change: async (ev) => {
        const novo = ev.target.value;
        erro.textContent = '';
        seletor.disabled = true;
        aplicarTom(seletor, novo);

        try {
          await onChange(novo);
          anterior = novo;
        } catch (falha) {
          // Reverte: o estado exibido precisa refletir o que está gravado.
          seletor.value = anterior;
          aplicarTom(seletor, anterior);
          erro.textContent = falha?.userMessage ?? 'Não foi possível salvar.';
        } finally {
          seletor.disabled = false;
        }
      },
    },
  }, ...options.map((id) => el('option', {
    value: id,
    text: WORKFLOW_STATUS[id]?.label ?? id,
    selected: id === value,
  })));

  // O clique no seletor não deve abrir ou fechar o <details> que o contém.
  seletor.addEventListener('click', (ev) => ev.stopPropagation());

  return el('span', { class: 'statusctl__wrap' }, seletor, erro);
}

function aplicarTom(seletor, status) {
  const tom = WORKFLOW_STATUS[status]?.tone ?? 'neutral';
  seletor.className = `statusctl statusctl--${tom}`;
}