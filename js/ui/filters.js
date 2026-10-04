/**
 * Filtros combináveis.
 *
 * Na etapa estática o filtro era um truque de CSS com um critério só. Com
 * dados reais os critérios se somam — provedor E categoria E ambiente — e o
 * total precisa ser recalculado a cada mudança.
 *
 * O estado dos filtros também vai para a query string da URL, o que torna
 * qualquer recorte compartilhável por link.
 */

import { ALL } from './components/filterBar.js';

/**
 * Aplica vários critérios de uma vez.
 *
 *   applyFilters(cobrancas, { provider: 'AWS', serviceCategory: ALL })
 *
 * Critérios com valor `ALL`, nulo ou vazio são ignorados.
 *
 * @param {Array<object>} registros
 * @param {object} criterios  mapa campo -> valor desejado
 * @param {object} [extratores]  campo -> função que extrai o valor do registro
 */
export function applyFilters(registros, criterios, extratores = {}) {
  const ativos = Object.entries(criterios)
    .filter(([, valor]) => valor !== ALL && valor !== null && valor !== undefined && valor !== '');

  if (ativos.length === 0) return registros;

  return registros.filter((registro) => ativos.every(([campo, valor]) => {
    const extrair = extratores[campo] ?? ((r) => r[campo]);
    return String(extrair(registro)) === String(valor);
  }));
}

/**
 * Conta quantos registros sobrariam para cada valor de um campo, respeitando
 * os outros filtros já ativos.
 *
 * É o que faz os números dos chips serem honestos: com "AWS" selecionado, o
 * chip "Rede" mostra quantos serviços de rede existem na AWS, não no total.
 */
export function countsFor(registros, campo, criterios, extratores = {}) {
  const outros = { ...criterios };
  delete outros[campo];

  const base = applyFilters(registros, outros, extratores);
  const extrair = extratores[campo] ?? ((r) => r[campo]);

  const contagem = new Map();
  for (const r of base) {
    const v = extrair(r);
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }

  return { total: base.length, counts: contagem };
}

/**
 * Monta as opções de um chip a partir das contagens, já ordenadas.
 * Valores sem nenhum registro no recorte atual são omitidos.
 */
export function buildOptions(registros, campo, criterios, opcoes = {}) {
  const { allLabel = 'Todos', labelFn = (v) => v, extratores = {} } = opcoes;
  const { total, counts } = countsFor(registros, campo, criterios, extratores);

  const lista = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([valor, qtd]) => ({ value: valor, label: labelFn(valor), count: qtd }));

  return [{ value: ALL, label: allLabel, count: total }, ...lista];
}

/**
 * Lê os filtros da query string da URL.
 * Permite abrir a tela já filtrada: costs.html?provider=AWS
 */
export function readFiltersFromUrl(campos) {
  const params = new URLSearchParams(window.location.search);
  const criterios = {};
  for (const campo of campos) {
    criterios[campo] = params.get(campo) ?? ALL;
  }
  return criterios;
}

/**
 * Reflete os filtros na URL sem recarregar a página.
 * `replaceState` em vez de `pushState`: cada clique em um chip não deve
 * criar uma entrada no histórico do navegador.
 */
export function writeFiltersToUrl(criterios) {
  const params = new URLSearchParams();
  for (const [campo, valor] of Object.entries(criterios)) {
    if (valor !== ALL && valor !== null && valor !== '') params.set(campo, valor);
  }
  const query = params.toString();
  const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}