/**
 * Recomendações de otimização — ponto de entrada da tela.
 *
 * A economia potencial exibida considera apenas recomendações que continuam
 * em aberto. Marcar uma como resolvida reduz o total imediatamente — porque
 * economia já capturada deixa de ser oportunidade.
 */

import { listRecommendations, updateRecommendationStatus } from '../api/recommendations.js';
import { getMeta } from '../api/charges.js';

import { sumBy, aggregate } from '../core/metrics.js';

import { el, mount } from '../ui/dom.js';
import { createStore } from '../ui/state.js';
import { mountSessionControls, onProfileChange, getProfile } from '../ui/profile.js';
import { initTheme } from '../ui/theme.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { filterBar, ALL } from '../ui/components/filterBar.js';
import { expander, keyValueList, badge } from '../ui/components/expander.js';
import { statusControl } from '../ui/components/statusControl.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';
import { buildOptions, applyFilters } from '../ui/filters.js';

import { currency, percent, integer, providerShort, categoryLabel } from '../format.js';

const TONS = { 'Crítica': 'alert', 'Alta': 'warn', 'Média': null, 'Baixa': null };
const STATUS_PERMITIDOS = ['open', 'investigating', 'resolved', 'dismissed', 'blocked'];
const ABERTAS = ['open', 'investigating', 'blocked'];

const ESFORCO = { low: 'baixo', medium: 'médio', high: 'alto' };

const store = createStore({ priority: ALL, provider: ALL, status: ALL });
let dados = null;

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#rec-context'),
    kpis: mount('#rec-kpis'),
    filters: mount('#rec-filters'),
    list: mount('#rec-list'),
    byProvider: mount('#rec-by-provider'),
  };

  areas.kpis.replaceChildren(loadingState());
  areas.list.replaceChildren(loadingState());

  try {
    const [meta, recomendacoes] = await Promise.all([
      getMeta(),
      listRecommendations({ _sort: 'estimatedMonthlySavings', _order: 'desc' }),
    ]);

    dados = { meta, recomendacoes };

    areas.context.replaceChildren(
      `base: ${meta.closedMonth} · economia mensal estimada · ${meta.currency}`,
    );

    desenharTudo(areas);
    store.subscribe(() => desenharTudo(areas));
  } catch (erro) {
    areas.kpis.replaceChildren(errorState(erro, () => iniciar()));
    areas.list.replaceChildren();
  }
}

function desenharTudo(areas) {
  const filtradas = applyFilters(dados.recomendacoes, store.get());
  desenharKpis(areas.kpis);
  desenharFiltros(areas.filters);
  desenharLista(areas.list, filtradas);
  desenharPorNuvem(areas.byProvider);
}

/* ------------------------------------------------------------------ */

function desenharKpis(area) {
  const { recomendacoes, meta } = dados;

  // Só o que continua aberto é oportunidade.
  const abertas = recomendacoes.filter((r) => ABERTAS.includes(r.status));
  const potencial = sumBy(abertas, 'estimatedMonthlySavings');
  const capturada = sumBy(
    recomendacoes.filter((r) => r.status === 'resolved'), 'estimatedMonthlySavings',
  );
  const imediatas = abertas.filter((r) => r.effort === 'low' && r.risk === 'low'
    && r.status !== 'blocked');
  const bloqueadas = recomendacoes.filter((r) => r.status === 'blocked');
  const custoMes = meta.totals.closedMonthCost;

  renderKpiStrip(area, [
    {
      label: 'Economia potencial',
      value: potencial,
      valueTone: 'gain',
      meta: `${percent(custoMes > 0 ? (potencial / custoMes) * 100 : 0)} do custo do mês fechado`,
    },
    {
      label: 'Economia já capturada',
      value: capturada,
      meta: `${integer(recomendacoes.filter((r) => r.status === 'resolved').length)} recomendações concluídas`,
      tone: capturada > 0 ? 'gain' : null,
    },
    {
      label: 'Execução imediata',
      value: sumBy(imediatas, 'estimatedMonthlySavings'),
      valueTone: 'gain',
      meta: `${integer(imediatas.length)} com esforço e risco baixos`,
    },
    {
      label: 'Bloqueadas',
      value: bloqueadas.length,
      format: 'integer',
      meta: bloqueadas.length ? 'aguardando definição de responsável' : 'nenhum bloqueio',
      tone: bloqueadas.length ? 'warn' : 'gain',
    },
  ]);
}

function desenharFiltros(area) {
  const criterios = store.get();

  const linhas = [
    { campo: 'priority', rotulo: 'Prioridade', allLabel: 'Todas', labelFn: (v) => v },
    { campo: 'provider', rotulo: 'Nuvem', allLabel: 'Todas', labelFn: providerShort },
    {
      campo: 'status',
      rotulo: 'Situação',
      allLabel: 'Todas',
      labelFn: (v) => ({
        open: 'Aberta', investigating: 'Em análise', resolved: 'Resolvida',
        dismissed: 'Ignorada', blocked: 'Bloqueada',
      }[v] ?? v),
    },
  ];

  area.replaceChildren(el('div', { class: 'filtergroup' }, ...linhas.map((linha) =>
    el('div', { class: 'filtergroup__row' },
      el('span', { class: 'filtergroup__label', text: linha.rotulo }),
      filterBar({
        options: buildOptions(dados.recomendacoes, linha.campo, criterios, {
          allLabel: linha.allLabel, labelFn: linha.labelFn,
        }),
        active: criterios[linha.campo],
        ariaLabel: `Filtrar por ${linha.rotulo.toLowerCase()}`,
        onChange: (v) => store.set({ [linha.campo]: v }),
      })))));
}

function desenharLista(area, recomendacoes) {
  if (recomendacoes.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhuma recomendação neste recorte',
      action: {
        label: 'Limpar filtros',
        onClick: () => store.set({ priority: ALL, provider: ALL, status: ALL }),
      },
    }));
    return;
  }

  const perfil = getProfile();

  const itens = recomendacoes.map((r) => expander({
    title: r.title,
    subtitle: `${providerShort(r.provider)} · ${categoryLabel(r.serviceCategory)} · `
      + `esforço ${ESFORCO[r.effort] ?? r.effort} · risco ${ESFORCO[r.risk] ?? r.risk}`,
    value: el('span', {
      class: 'rec__amount',
      text: `${currency(r.estimatedMonthlySavings)}/mês`,
    }),
    badges: [
      badge(r.priority, TONS[r.priority]),
      statusControl({
        value: r.status,
        options: STATUS_PERMITIDOS,
        label: `Situação de: ${r.title}`,
        // PATCH: altera apenas o status, mantendo o restante do registro.
        onChange: async (novo) => {
          await updateRecommendationStatus(r.id, novo);
          r.status = novo;
          // Economia potencial depende do status: recalcula os indicadores.
          desenharKpis(mount('#rec-kpis'));
          desenharPorNuvem(mount('#rec-by-provider'));
        },
      }),
    ],
    body: () => keyValueList([
      ['Problema', r.problem],
      ['Ação sugerida', r.action],
      ['Economia estimada', el('span', {
        class: 'num', style: { color: 'var(--gain)' },
        text: `${currency(r.estimatedMonthlySavings)} por mês`,
      })],
      ['Economia anualizada', el('span', {
        class: 'num', text: currency(r.estimatedMonthlySavings * 12),
      })],
      ...(perfil.showTechnicalDetail
        ? [['Identificador', el('span', { class: 'num', text: r.id })]]
        : []),
    ]),
  }));

  area.replaceChildren(
    el('ul', { class: 'filterlist reclist' }, ...itens.map((i) => el('li', {}, i))),
    el('p', { class: 'costtotal' },
      el('span', { text: `${recomendacoes.length} de ${dados.recomendacoes.length} recomendações` }),
      el('span', {
        class: 'costtotal__value num',
        text: `${currency(sumBy(recomendacoes, 'estimatedMonthlySavings'))}/mês`,
      })),
  );
}

function desenharPorNuvem(area) {
  const abertas = dados.recomendacoes.filter((r) => ABERTAS.includes(r.status));

  if (abertas.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhuma oportunidade aberta',
      message: 'Todas as recomendações foram tratadas.',
    }));
    return;
  }

  const grupos = aggregate(abertas, (r) => r.provider, 'estimatedMonthlySavings');

  area.replaceChildren(el('ul', { class: 'itemlist' }, ...grupos.map((g) =>
    el('li', { class: 'itemlist__row' },
      el('span', {},
        el('span', { class: 'itemlist__title', text: providerShort(g.key) }),
        el('span', { class: 'itemlist__meta' },
          `${g.count} oportunidades · `,
          el('span', { class: 'num', text: percent(g.share) }),
          ' do total identificado')),
      el('span', { class: 'itemlist__value num', text: `${currency(g.total)}/mês` })))));
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const controles = document.querySelector('#session-controls');
  if (controles) mountSessionControls(controles);
  iniciar();
  onProfileChange(() => iniciar());
});