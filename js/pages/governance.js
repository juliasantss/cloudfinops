/**
 * Governança de tags — ponto de entrada da tela.
 *
 * Traduz conformidade em dinheiro: a métrica que importa não é "84% dos
 * recursos têm a tag", é "US$ 3.354 do gasto não tem dono".
 */

import { getMeta } from '../api/charges.js';
import { listResources, listTagPolicies } from '../api/governance.js';

import { sumBy, finopsScore, round2 } from '../core/metrics.js';
import { unallocatedCost, complianceByKey, overallCompliance, allocateByTag }
  from '../core/allocation.js';
import { missingRequiredTags } from '../core/focus.js';
import { REQUIRED_TAG_KEYS, ALLOCATION_TAG_KEY } from '../config.js';

import { el, mount } from '../ui/dom.js';
import { createStore } from '../ui/state.js';
import { mountSessionControls, onProfileChange, getProfile } from '../ui/profile.js';
import { initTheme } from '../ui/theme.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { dataTable } from '../ui/components/dataTable.js';
import { filterBar, ALL } from '../ui/components/filterBar.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';

import { currency, percent, integer, providerShort, categoryLabel } from '../format.js';

const store = createStore({ missingTag: ALL, busca: '' });
let dados = null;

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#gov-context'),
    kpis: mount('#gov-kpis'),
    coverage: mount('#gov-coverage'),
    taxonomy: mount('#gov-taxonomy'),
    allocation: mount('#gov-allocation'),
    search: mount('#gov-search'),
    filters: mount('#gov-filters'),
    table: mount('#gov-table'),
  };

  areas.kpis.replaceChildren(loadingState());
  areas.table.replaceChildren(loadingState());

  try {
    const [meta, recursos, politicas] = await Promise.all([
      getMeta(), listResources(), listTagPolicies(),
    ]);

    dados = { meta, recursos, politicas };

    areas.context.replaceChildren(
      `base: ${meta.closedMonth} · `,
      el('span', { class: 'num', text: integer(recursos.length) }),
      ` recursos inventariados · ${meta.currency}`,
    );

    desenharKpis(areas.kpis);
    desenharCobertura(areas.coverage);
    desenharTaxonomia(areas.taxonomy);
    desenharAlocacao(areas.allocation);
    desenharBusca(areas.search);
    desenharFiltros(areas.filters);
    desenharTabela(areas.table);

    store.subscribe(() => {
      desenharFiltros(areas.filters);
      desenharTabela(areas.table);
    });
  } catch (erro) {
    areas.kpis.replaceChildren(errorState(erro, () => iniciar()));
    areas.table.replaceChildren();
  }
}

/* ------------------------------------------------------------------ */

function desenharKpis(area) {
  const { recursos, meta } = dados;
  const geral = overallCompliance(recursos);
  const semDono = unallocatedCost(recursos);
  const irregulares = recursos.filter((r) => missingRequiredTags(r.tags).length > 0);

  const { pillars } = finopsScore({
    totalCost: meta.totals.closedMonthCost,
    allocatableCost: meta.totals.closedMonthCost - semDono.cost,
    potentialSavings: meta.totals.potentialSavings,
    budgets: [], monthlySeries: [], anomalies: [],
  });
  const governanca = pillars.find((p) => p.id === 'governance');

  renderKpiStrip(area, [
    {
      label: 'Conformidade geral',
      value: geral.pct,
      format: 'percent',
      meta: `${integer(geral.compliant)} de ${integer(geral.total)} com as três tags`,
      meterPct: geral.pct,
      tone: geral.pct >= 90 ? 'gain' : geral.pct >= 70 ? 'warn' : 'alert',
    },
    {
      label: 'Custo sem responsável',
      value: semDono.cost,
      valueTone: 'alert',
      meta: `${percent(semDono.pct)} do inventário`,
      tone: 'alert',
    },
    {
      label: 'Recursos irregulares',
      value: irregulares.length,
      format: 'integer',
      meta: 'falta ao menos uma tag obrigatória',
      tone: irregulares.length ? 'warn' : 'gain',
    },
    {
      label: 'Pilar de governança',
      value: governanca?.value ?? 0,
      format: 'score',
      meterPct: governanca?.value ?? 0,
      tone: (governanca?.value ?? 0) >= 80 ? 'gain' : 'warn',
    },
  ]);
}

function desenharCobertura(area) {
  const semDono = unallocatedCost(dados.recursos);

  area.replaceChildren(
    el('div', { class: 'impact' },
      el('span', { class: 'label', id: 'gov-imp', text: 'Custo sem responsável' }),
      el('span', { class: 'impact__value num', 'aria-labelledby': 'gov-imp', text: currency(semDono.cost) }),
      el('span', { class: 'impact__note' },
        'Recursos sem ',
        el('span', { class: 'tagkey', text: ALLOCATION_TAG_KEY }),
        ' não podem ser cobrados de nenhuma equipe. É o valor que ninguém revisa, '
        + 'ninguém questiona e ninguém desliga.')),

    el('div', { class: 'taglist' }, ...complianceByKey(dados.recursos).map((c) => {
      const tom = c.compliancePct >= 90 ? 'gain' : c.compliancePct >= 80 ? 'warn' : 'alert';
      return el('div', { class: 'taglist__item' },
        el('div', { class: 'taglist__head' },
          el('span', { class: 'tagkey', text: c.key }),
          el('span', { class: 'taglist__pct num', text: percent(c.compliancePct) })),
        el('span', { class: 'meter' },
          el('span', { class: `meter__fill meter__fill--${tom}`, style: { width: `${c.compliancePct}%` } })),
        el('span', { class: 'taglist__meta' },
          el('span', { class: 'num', text: integer(c.resourcesTotal - c.resourcesWithTag) }),
          ' recursos sem a tag · ',
          el('span', { class: 'num', text: currency(c.untaggedCost) })));
    })),
  );
}

function desenharTaxonomia(area) {
  area.replaceChildren(dataTable({
    caption: 'Poucas chaves com valores fechados é o que torna a conformidade verificável. '
      + 'Uma taxonomia livre gera inconsistência: time-redes, redes e Redes viram três donos diferentes.',
    columns: [
      { key: 'key', label: 'Chave', sortable: false, render: (r) => el('span', { class: 'tagkey', text: r.key }) },
      { key: 'purpose', label: 'Finalidade', sortable: false },
      {
        key: 'allowedValues',
        label: 'Valores aceitos',
        sortable: false,
        render: (r) => el('span', {}, ...r.allowedValues.map((v) =>
          el('span', { class: 'tagpair', text: v }))),
      },
    ],
    rows: dados.politicas,
  }));
}

function desenharAlocacao(area) {
  const grupos = allocateByTag(dados.recursos, ALLOCATION_TAG_KEY);

  area.replaceChildren(el('ul', { class: 'itemlist' }, ...grupos.map((g) =>
    el('li', { class: 'itemlist__row' },
      el('span', {},
        el('span', {
          class: 'itemlist__title',
          style: g.isUnassigned ? { color: 'var(--alert)' } : {},
          text: g.key,
        }),
        el('span', { class: 'itemlist__meta' },
          `${g.count} recursos · `,
          el('span', { class: 'num', text: percent(g.share) }))),
      el('span', { class: 'itemlist__value num', text: currency(g.total) })))));
}

/* ------------------------------------------------------------------ */

function desenharBusca(area) {
  const campo = el('input', {
    class: 'form__input search',
    type: 'search',
    id: 'gov-busca',
    placeholder: 'Buscar por identificador, nome ou serviço…',
    'aria-label': 'Buscar recurso no inventário',
  });

  // `input` dispara a cada tecla: filtro ao digitar, sem botão de buscar.
  campo.addEventListener('input', (ev) => store.set({ busca: ev.target.value.trim().toLowerCase() }));

  area.replaceChildren(campo);
}

function desenharFiltros(area) {
  const criterios = store.get();
  const opcoes = [
    { value: ALL, label: 'Todos os irregulares', count: irregulares().length },
    ...REQUIRED_TAG_KEYS.map((chave) => ({
      value: chave,
      label: `Sem ${chave}`,
      count: dados.recursos.filter((r) => !r.tags?.[chave]).length,
    })),
  ];

  area.replaceChildren(filterBar({
    options: opcoes,
    active: criterios.missingTag,
    ariaLabel: 'Filtrar por tag ausente',
    onChange: (v) => store.set({ missingTag: v }),
  }));
}

function irregulares() {
  return dados.recursos.filter((r) => missingRequiredTags(r.tags).length > 0);
}

function filtrar() {
  const { missingTag, busca } = store.get();

  let lista = missingTag === ALL
    ? irregulares()
    : dados.recursos.filter((r) => !r.tags?.[missingTag]);

  if (busca) {
    lista = lista.filter((r) => [r.resourceId, r.resourceName, r.serviceName]
      .some((campo) => String(campo ?? '').toLowerCase().includes(busca)));
  }

  return lista.map((r) => ({ ...r, missingTags: missingRequiredTags(r.tags) }));
}

function desenharTabela(area) {
  const linhas = filtrar();
  const perfil = getProfile();

  if (linhas.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhum recurso neste recorte',
      message: 'Ajuste a busca ou o filtro de tag ausente.',
      action: { label: 'Limpar', onClick: () => { store.set({ missingTag: ALL, busca: '' }); mount('#gov-busca').value = ''; } },
    }));
    return;
  }

  area.replaceChildren(
    dataTable({
      caption: `Ordenado por custo: a auditoria vira fila de trabalho quando o mais caro vem primeiro.`,
      pageSize: perfil.maxTableRows > 25 ? 15 : 10,
      sortKey: 'monthlyCost',
      columns: [
        {
          key: 'resourceId',
          label: 'Recurso',
          render: (r) => el('span', {},
            el('span', { class: 'num', text: perfil.showResourceIds ? r.resourceId : r.resourceName }),
            el('span', {
              class: 'datatable__sub',
              text: `${r.resourceType} · ${providerShort(r.provider)} · ${r.regionId}`,
            })),
        },
        { key: 'serviceName', label: 'Serviço', format: (v, r) => `${v} (${categoryLabel(r.serviceCategory)})` },
        {
          key: 'missingTags',
          label: 'Tags ausentes',
          sortable: false,
          render: (r) => el('span', {}, ...r.missingTags.map((t) =>
            el('span', { class: 'tag tag--alert tagkey', text: t }))),
        },
        { key: 'monthlyCost', label: 'Custo/mês', align: 'right', format: (v) => currency(v) },
      ],
      rows: linhas,
    }),
    el('p', { class: 'costtotal' },
      el('span', { text: `${linhas.length} recursos no recorte` }),
      el('span', { class: 'costtotal__value num', text: currency(sumBy(linhas, 'monthlyCost')) })),
  );
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const controles = document.querySelector('#session-controls');
  if (controles) mountSessionControls(controles);
  iniciar();
  onProfileChange(() => iniciar());
});