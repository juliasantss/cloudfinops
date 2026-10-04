/**
 * Análise de custos — ponto de entrada da tela.
 *
 * Três filtros que se combinam, tabela ordenável e paginada, e quebras por
 * conta e região. Os filtros vão para a query string, o que torna qualquer
 * recorte compartilhável: costs.html?provider=AWS&serviceCategory=Networking
 */

import { getMeta, listCharges } from '../api/charges.js';

import { aggregate, sumBy, variationPct, round2 } from '../core/metrics.js';

import { el, mount } from '../ui/dom.js';
import { createStore } from '../ui/state.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { dataTable } from '../ui/components/dataTable.js';
import { filterBar, ALL } from '../ui/components/filterBar.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';
import { applyFilters, buildOptions, readFiltersFromUrl, writeFiltersToUrl } from '../ui/filters.js';

import { currency, percent, delta, integer, monthFull, providerShort, categoryLabel }
  from '../format.js';

const CAMPOS = ['provider', 'serviceCategory', 'environment'];

const store = createStore(readFiltersFromUrl(CAMPOS));
let dados = null;

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#costs-context'),
    kpis: mount('#costs-kpis'),
    filters: mount('#costs-filters'),
    table: mount('#costs-table'),
    accounts: mount('#costs-accounts'),
    regions: mount('#costs-regions'),
  };

  areas.kpis.replaceChildren(loadingState());
  areas.table.replaceChildren(loadingState());

  try {
    // O período de referência vem do próprio dado. Nenhuma data é cravada
    // no código: trocar o conjunto de dados não exige tocar na tela.
    const meta = await getMeta();
    const mesFechado = meta.closedMonth;
    const mesAnterior = mesAnteriorA(mesFechado);

    const [atual, anterior] = await Promise.all([
      listCharges({ month: mesFechado }),
      listCharges({ month: mesAnterior }),
    ]);

    dados = { meta, atual, anterior, mesFechado, mesAnterior };

    areas.context.replaceChildren(
      `${monthFull(mesFechado)} · mês fechado · comparação com ${monthFull(mesAnterior)} · `,
      el('span', { text: meta.currency }),
    );

    desenharTudo(areas);

    // Toda mudança de filtro redesenha os blocos dependentes e atualiza a URL.
    store.subscribe((estado) => {
      writeFiltersToUrl(estado);
      desenharTudo(areas);
    });
  } catch (erro) {
    areas.kpis.replaceChildren(errorState(erro, () => iniciar()));
    areas.table.replaceChildren();
  }
}

function desenharTudo(areas) {
  desenharFiltros(areas.filters);
  const filtradas = filtrar(dados.atual);
  desenharKpis(areas.kpis, filtradas);
  desenharTabela(areas.table, filtradas);
  desenharQuebra(areas.accounts, filtradas, (c) => c.subAccountName, 'Conta');
  desenharQuebra(areas.regions, filtradas, (c) => c.regionId, 'Região');
}

/** Mês ISO anterior a um mês ISO: '2026-09' -> '2026-08' */
function mesAnteriorA(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, '0')}`;
}

function filtrar(registros) {
  return applyFilters(registros, store.get());
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

function desenharFiltros(area) {
  const criterios = store.get();

  const linhas = [
    { campo: 'provider', rotulo: 'Nuvem', allLabel: 'Todas', labelFn: providerShort },
    { campo: 'serviceCategory', rotulo: 'Categoria', allLabel: 'Todas', labelFn: categoryLabel },
    { campo: 'environment', rotulo: 'Ambiente', allLabel: 'Todos', labelFn: (v) => v || '—' },
  ];

  area.replaceChildren(el('div', { class: 'filtergroup' }, ...linhas.map((linha) =>
    el('div', { class: 'filtergroup__row' },
      el('span', { class: 'filtergroup__label', text: linha.rotulo }),
      filterBar({
        options: buildOptions(dados.atual, linha.campo, criterios, {
          allLabel: linha.allLabel,
          labelFn: linha.labelFn,
        }),
        active: criterios[linha.campo],
        ariaLabel: `Filtrar por ${linha.rotulo.toLowerCase()}`,
        onChange: (valor) => store.set({ [linha.campo]: valor }),
      })))));
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

function desenharKpis(area, filtradas) {
  const total = sumBy(filtradas);
  const anteriores = filtrar(dados.anterior);
  const totalAnterior = sumBy(anteriores);
  const variacao = variationPct(total, totalAnterior);

  const porServico = aggregate(filtradas, (c) => `${c.provider}||${c.serviceName}`);
  const maior = porServico[0];
  const efetivo = sumBy(filtradas, 'effectiveCost');
  const desconto = total > 0 ? ((total - efetivo) / total) * 100 : 0;

  renderKpiStrip(area, [
    {
      label: 'Custo no recorte',
      value: total,
      meta: variacao === null
        ? 'sem base de comparação'
        : `${delta(variacao)} sobre o mês anterior`,
      tone: variacao > 5 ? 'warn' : variacao < 0 ? 'gain' : null,
    },
    {
      label: 'Custo efetivo',
      value: efetivo,
      meta: `${percent(desconto)} absorvidos por compromissos`,
      tone: desconto > 0 ? 'gain' : null,
    },
    {
      label: 'Maior serviço',
      value: maior ? maior.total : 0,
      meta: maior ? `${maior.key.split('||')[1]} · ${percent(maior.share)} do recorte` : '—',
    },
    {
      label: 'Serviços no recorte',
      value: porServico.length,
      format: 'integer',
      meta: `${integer(filtradas.length)} linhas de cobrança`,
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Tabela                                                              */
/* ------------------------------------------------------------------ */

function desenharTabela(area, filtradas) {
  if (filtradas.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhum custo neste recorte',
      message: 'Nenhuma linha de cobrança combina com os filtros selecionados.',
      action: { label: 'Limpar filtros', onClick: limparFiltros },
    }));
    return;
  }

  // Agrupa por serviço dentro do provedor e cruza com o mês anterior.
  const anteriores = filtrar(dados.anterior);
  const mapaAnterior = new Map(
    aggregate(anteriores, (c) => `${c.provider}||${c.serviceName}`).map((g) => [g.key, g.total]),
  );

  const linhas = aggregate(filtradas, (c) => `${c.provider}||${c.serviceName}`).map((g) => {
    const [provider, serviceName] = g.key.split('||');
    const amostra = filtradas.find((c) => c.provider === provider && c.serviceName === serviceName);
    const anterior = mapaAnterior.get(g.key) ?? 0;

    return {
      provider,
      serviceName,
      serviceCategory: amostra?.serviceCategory ?? '',
      billedCost: g.total,
      share: g.share,
      previousCost: round2(anterior),
      variation: variationPct(g.total, anterior),
      untaggedCost: round2(sumBy(
        filtradas.filter((c) => c.provider === provider && c.serviceName === serviceName),
        'untaggedCost',
      )),
    };
  });

  const total = sumBy(filtradas);

  const tabela = dataTable({
    caption: `Clique no cabeçalho para ordenar. A variação compara com ${monthFull(dados.mesAnterior)}.`,
    pageSize: 10,
    sortKey: 'billedCost',
    columns: [
      {
        key: 'serviceName',
        label: 'Serviço',
        render: (r) => el('span', {},
          r.serviceName,
          el('span', {
            class: 'datatable__sub',
            text: `${providerShort(r.provider)} · ${categoryLabel(r.serviceCategory)}`,
          })),
      },
      { key: 'share', label: 'Participação', align: 'right', format: (v) => percent(v) },
      { key: 'previousCost', label: 'Mês anterior', align: 'right', format: (v) => currency(v) },
      { key: 'billedCost', label: 'Custo', align: 'right', format: (v) => currency(v) },
      {
        key: 'variation',
        label: 'Variação',
        align: 'right',
        render: (r) => el('span', {
          class: `num delta--${r.variation === null ? 'up' : r.variation >= 50 ? 'alert' : r.variation < 0 ? 'gain' : 'up'}`,
          text: r.variation === null ? '—' : delta(r.variation),
        }),
      },
      {
        key: 'untaggedCost',
        label: 'Sem tag',
        align: 'right',
        render: (r) => el('span', {
          class: 'num',
          style: { color: r.untaggedCost > 0 ? 'var(--alert)' : 'var(--ink-faint)' },
          text: r.untaggedCost > 0 ? currency(r.untaggedCost) : '—',
        }),
      },
    ],
    rows: linhas,
  });

  area.replaceChildren(
    tabela,
    el('p', { class: 'costtotal' },
      el('span', { text: `${linhas.length} serviços · ${integer(filtradas.length)} linhas de cobrança` }),
      el('span', { class: 'costtotal__value num', text: currency(total) })),
  );
}

function limparFiltros() {
  store.set(Object.fromEntries(CAMPOS.map((c) => [c, ALL])));
}

/* ------------------------------------------------------------------ */
/* Quebras                                                             */
/* ------------------------------------------------------------------ */

function desenharQuebra(area, filtradas, chaveFn, rotulo) {
  const grupos = aggregate(filtradas, chaveFn);

  if (grupos.length === 0) {
    area.replaceChildren(emptyState({ title: 'Sem dados no recorte' }));
    return;
  }

  area.replaceChildren(dataTable({
    caption: `Distribuição do custo do recorte por ${rotulo.toLowerCase()}.`,
    sortKey: 'total',
    columns: [
      { key: 'key', label: rotulo },
      { key: 'total', label: 'Custo', align: 'right', format: (v) => currency(v) },
      {
        key: 'share',
        label: 'Participação',
        align: 'right',
        render: (r) => el('span', {},
          el('span', { class: 'num', text: percent(r.share) }),
          el('span', { class: 'meter', style: { marginTop: '6px' } },
            el('span', { class: 'meter__fill', style: { width: `${r.share}%` } }))),
      },
    ],
    rows: grupos,
  }));
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', iniciar);