/**
 * Tabela de dados com ordenação.
 *
 * A ordenação acontece em memória e é reversível, com o estado refletido em
 * `aria-sort` — leitor de tela anuncia a mudança, não só a cor do cabeçalho.
 */

import { el, delegate } from '../dom.js';

/**
 * @param {object} config
 * @param {string}   [config.caption]   legenda acessível acima da tabela
 * @param {Array}    config.columns     { key, label, align, format, sortable, render }
 * @param {Array}    config.rows        registros
 * @param {string}   [config.sortKey]   coluna ordenada inicialmente
 * @param {string}   [config.sortDir]   'asc' | 'desc'
 * @param {Function} [config.onRowClick] recebe (registro, evento)
 * @param {number}   [config.pageSize]  ativa paginação quando definido
 */
export function dataTable(config) {
  const { caption, columns, rows, onRowClick, pageSize = null } = config;
  let sortKey = config.sortKey ?? null;
  let sortDir = config.sortDir ?? 'desc';
  let pagina = 1;

  const tbody = el('tbody');
  const thead = el('thead');
  const tabela = el('table', { class: 'datatable' });

  if (caption) tabela.appendChild(el('caption', { text: caption }));
  tabela.appendChild(thead);
  tabela.appendChild(tbody);

  function desenharCabecalho() {
    thead.replaceChildren(el('tr', {}, ...columns.map((col) => {
      const ativa = col.key === sortKey;
      const th = el('th', {
        scope: 'col',
        class: col.align === 'right' ? 'is-numeric' : '',
        'aria-sort': ativa ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none',
      });

      if (col.sortable === false) {
        th.textContent = col.label;
      } else {
        th.appendChild(el('button', {
          type: 'button',
          class: `datatable__sort${ativa ? ' is-active' : ''}`,
          text: col.label,
          dataset: { sortKey: col.key },
        }));
      }
      return th;
    })));
  }

  function linhasVisiveis() {
    const ordenadas = sortKey ? ordenar(rows, sortKey, sortDir) : rows;
    if (!pageSize) return ordenadas;
    const inicio = (pagina - 1) * pageSize;
    return ordenadas.slice(inicio, inicio + pageSize);
  }

  function desenharCorpo() {
    const ordenadas = linhasVisiveis();

    tbody.replaceChildren(...ordenadas.map((registro, indice) => {
      const tr = el('tr', { dataset: { index: String(indice) } });

      columns.forEach((col, i) => {
        const conteudo = col.render ? col.render(registro) : valorFormatado(registro, col);
        const celula = el(i === 0 ? 'th' : 'td', {
          class: col.align === 'right' ? 'is-numeric' : '',
          scope: i === 0 ? 'row' : null,
        });

        if (typeof conteudo === 'object' && conteudo !== null) celula.appendChild(conteudo);
        else celula.textContent = conteudo ?? '—';

        tr.appendChild(celula);
      });

      return tr;
    }));
  }

  // Delegação: um ouvinte no cabeçalho atende todas as colunas, inclusive
  // as redesenhadas depois de cada ordenação.
  delegate(thead, 'click', '[data-sort-key]', (_ev, botao) => {
    const chave = botao.dataset.sortKey;
    if (chave === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = chave; sortDir = 'desc'; }
    pagina = 1;
    desenharCabecalho();
    desenharCorpo();
    atualizarPaginacao();
  });

  if (onRowClick) {
    delegate(tbody, 'click', 'tr[data-index]', (ev, tr) => {
      onRowClick(linhasVisiveis()[Number(tr.dataset.index)], ev);
    });
  }

  // --- Paginação ---
  const totalPaginas = pageSize ? Math.max(Math.ceil(rows.length / pageSize), 1) : 1;
  const paginacao = el('nav', { class: 'pager', 'aria-label': 'Paginação da tabela' });
  const rotulo = el('span', { class: 'pager__label' });

  const anterior = el('button', {
    type: 'button', class: 'pager__btn', text: 'Anterior',
    on: { click: () => irPara(pagina - 1) },
  });
  const proxima = el('button', {
    type: 'button', class: 'pager__btn', text: 'Próxima',
    on: { click: () => irPara(pagina + 1) },
  });

  function irPara(nova) {
    pagina = Math.max(1, Math.min(nova, totalPaginas));
    desenharCorpo();
    atualizarPaginacao();
  }

  function atualizarPaginacao() {
    if (!pageSize) return;
    const inicio = (pagina - 1) * pageSize + 1;
    const fim = Math.min(pagina * pageSize, rows.length);
    rotulo.textContent = `${inicio}–${fim} de ${rows.length}`;
    anterior.disabled = pagina === 1;
    proxima.disabled = pagina === totalPaginas;
  }

  desenharCabecalho();
  desenharCorpo();

  if (!pageSize || rows.length <= pageSize) return tabela;

  paginacao.appendChild(anterior);
  paginacao.appendChild(rotulo);
  paginacao.appendChild(proxima);
  atualizarPaginacao();

  const bloco = el('div', {});
  bloco.appendChild(tabela);
  bloco.appendChild(paginacao);
  return bloco;
}

function valorFormatado(registro, col) {
  const bruto = registro[col.key];
  return col.format ? col.format(bruto, registro) : bruto;
}

function ordenar(linhas, chave, direcao) {
  const fator = direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = a[chave];
    const y = b[chave];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * fator;
    return String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR') * fator;
  });
}