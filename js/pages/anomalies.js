/**
 * Detecção de anomalias — ponto de entrada da tela.
 *
 * A detecção NÃO vem pronta da API: a tela recalcula tudo a partir da série
 * diária, usando `core/metrics.js`. A API guarda apenas o status do
 * tratamento, alterado por PATCH.
 *
 * Isso é proposital. O mesmo critério está implementado duas vezes — em
 * Python no ETL e em JavaScript aqui — e as duas implementações chegam ao
 * mesmo resultado. É a melhor evidência de que a lógica está correta.
 */

import { getMeta, listDailyCharges } from '../api/charges.js';
import { listAnomalies, updateAnomalyStatus } from '../api/anomalies.js';

import { detectAnomalies, sumBy, round2 } from '../core/metrics.js';
import { ANOMALY_SEVERITIES, BASELINE_WINDOW_DAYS, IMPACT_PROJECTION_DAYS } from '../config.js';

import { el, mount } from '../ui/dom.js';
import { createStore } from '../ui/state.js';
import { mountSessionControls, onProfileChange, getProfile } from '../ui/profile.js';
import { initTheme } from '../ui/theme.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { dataTable } from '../ui/components/dataTable.js';
import { filterBar, ALL } from '../ui/components/filterBar.js';
import { expander, keyValueList, badge } from '../ui/components/expander.js';
import { statusControl } from '../ui/components/statusControl.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';
import { buildOptions, applyFilters } from '../ui/filters.js';

import { currency, percent, delta, integer, fullDate, providerShort, categoryLabel, monthFull }
  from '../format.js';

const TONS = { 'Crítica': 'alert', 'Alta': 'warn', 'Média': 'warn', 'Baixa': null };
const STATUS_PERMITIDOS = ['open', 'investigating', 'resolved', 'dismissed'];

const store = createStore({ severity: ALL, provider: ALL });
let dados = null;

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#anom-context'),
    kpis: mount('#anom-kpis'),
    criteria: mount('#anom-criteria'),
    filters: mount('#anom-filters'),
    list: mount('#anom-list'),
  };

  areas.kpis.replaceChildren(loadingState());
  areas.list.replaceChildren(loadingState());

  try {
    const meta = await getMeta();
    const [diarias, salvas] = await Promise.all([listDailyCharges(), listAnomalies()]);

    // Recalcula a detecção e junta com o status guardado na API.
    const detectadas = detectAnomalies(diarias);
    const porChave = new Map(salvas.map((a) => [`${a.provider}||${a.serviceName}`, a]));

    const anomalias = detectadas.map((d) => {
      const salva = porChave.get(`${d.provider}||${d.serviceName}`);
      return {
        ...d,
        id: salva?.id ?? null,
        status: salva?.status ?? 'open',
        probableCause: salva?.probableCause ?? 'Sem causa identificada.',
      };
    });

    dados = { meta, anomalias, detectadas, salvas };

    areas.context.replaceChildren(
      `${monthFull(meta.currentMonth)} · linha de base: média móvel de `,
      el('span', { class: 'num', text: String(BASELINE_WINDOW_DAYS) }),
      ` dias · ${meta.currency}`,
    );

    desenharCriterio(areas.criteria);
    desenharTudo(areas);
    store.subscribe(() => desenharTudo(areas));
  } catch (erro) {
    areas.kpis.replaceChildren(errorState(erro, () => iniciar()));
    areas.list.replaceChildren();
  }
}

function desenharTudo(areas) {
  const filtradas = applyFilters(dados.anomalias, store.get());
  desenharKpis(areas.kpis);
  desenharFiltros(areas.filters);
  desenharLista(areas.list, filtradas);
}

/* ------------------------------------------------------------------ */

function desenharKpis(area) {
  const { anomalias } = dados;
  const abertas = anomalias.filter((a) => a.status === 'open');
  const criticas = anomalias.filter((a) => a.severity === 'Crítica');
  const impacto = sumBy(anomalias, 'monthlyImpact');
  const tratadas = anomalias.length - abertas.length;
  const taxa = anomalias.length ? (tratadas / anomalias.length) * 100 : 100;

  renderKpiStrip(area, [
    {
      label: 'Anomalias no período',
      value: anomalias.length,
      format: 'integer',
      meta: `${integer(abertas.length)} ainda em aberto`,
      tone: abertas.length > 0 ? 'warn' : 'gain',
    },
    {
      label: 'Impacto projetado',
      value: impacto,
      meta: 'acima da linha de base, em 30 dias',
      tone: 'alert',
    },
    {
      label: 'Severidade crítica',
      value: criticas.length,
      format: 'integer',
      meta: criticas[0] ? `${criticas[0].serviceName}, desde ${fullDate(criticas[0].date)}` : '—',
      tone: criticas.length ? 'alert' : 'gain',
    },
    {
      label: 'Taxa de tratamento',
      value: taxa,
      format: 'percent',
      meterPct: taxa,
      tone: taxa >= 80 ? 'gain' : taxa >= 50 ? 'warn' : 'alert',
    },
  ]);
}

function desenharCriterio(area) {
  area.replaceChildren(dataTable({
    caption: 'Exigir os dois limiares ao mesmo tempo evita que variações irrelevantes em valor '
      + 'absoluto sejam classificadas como críticas apenas por terem percentual alto.',
    sortable: false,
    columns: [
      {
        key: 'label',
        label: 'Severidade',
        sortable: false,
        render: (r) => badge(r.label, TONS[r.label]),
      },
      {
        key: 'minDeviationPct',
        label: 'Desvio',
        align: 'right',
        sortable: false,
        format: (v) => `≥ ${v}%`,
      },
      {
        key: 'minMonthlyImpact',
        label: `Impacto em ${IMPACT_PROJECTION_DAYS} dias`,
        align: 'right',
        sortable: false,
        format: (v) => (v > 0 ? `≥ ${currency(v)}` : 'qualquer valor'),
      },
      {
        key: 'responseHours',
        label: 'Prazo de resposta',
        sortable: false,
        format: (v) => (v ? (v >= 24 ? `${v / 24} dia(s)` : `${v} horas`) : 'sem prazo'),
      },
    ],
    rows: ANOMALY_SEVERITIES,
  }));
}

function desenharFiltros(area) {
  const criterios = store.get();

  area.replaceChildren(el('div', { class: 'filtergroup' },
    el('div', { class: 'filtergroup__row' },
      el('span', { class: 'filtergroup__label', text: 'Severidade' }),
      filterBar({
        options: buildOptions(dados.anomalias, 'severity', criterios, { allLabel: 'Todas' }),
        active: criterios.severity,
        ariaLabel: 'Filtrar por severidade',
        onChange: (v) => store.set({ severity: v }),
      })),
    el('div', { class: 'filtergroup__row' },
      el('span', { class: 'filtergroup__label', text: 'Nuvem' }),
      filterBar({
        options: buildOptions(dados.anomalias, 'provider', criterios, {
          allLabel: 'Todas', labelFn: providerShort,
        }),
        active: criterios.provider,
        ariaLabel: 'Filtrar por provedor',
        onChange: (v) => store.set({ provider: v }),
      }))));
}

function desenharLista(area, anomalias) {
  if (anomalias.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhuma anomalia neste recorte',
      message: 'Ajuste os filtros para ver outros desvios.',
      action: { label: 'Limpar filtros', onClick: () => store.set({ severity: ALL, provider: ALL }) },
    }));
    return;
  }

  const perfil = getProfile();

  const itens = anomalias.map((a) => expander({
    title: `${a.serviceName} acima da linha de base`,
    subtitle: `${providerShort(a.provider)} · ${categoryLabel(a.serviceCategory)} · `
      + `detectada em ${fullDate(a.date)}`,
    value: el('span', {
      class: `num delta--${a.severity === 'Crítica' ? 'alert' : 'up'}`,
      text: delta(a.deviationPct),
    }),
    badges: [
      badge(a.severity, TONS[a.severity]),
      a.id
        ? statusControl({
            value: a.status,
            options: STATUS_PERMITIDOS,
            label: `Status da anomalia em ${a.serviceName}`,
            // Aqui está o PATCH: só o campo status é enviado.
            onChange: async (novo) => {
              await updateAnomalyStatus(a.id, novo);
              a.status = novo;
              // Os indicadores dependem do status: recalcula a faixa de KPIs.
              desenharKpis(mount('#anom-kpis'));
            },
          })
        : badge('não persistida'),
    ],
    body: () => keyValueList([
      ['Linha de base', el('span', {},
        'média de ', el('span', { class: 'num', text: String(BASELINE_WINDOW_DAYS) }),
        ' dias: ', el('span', { class: 'num', text: currency(a.baselineCost) }), ' por dia')],
      ['Custo observado', el('span', { class: 'num', text: `${currency(a.observedCost)} por dia` })],
      ['Desvio', el('span', { class: 'num', text: delta(a.deviationPct) })],
      ['Impacto projetado', el('span', {
        class: 'num', style: { color: 'var(--alert)' },
        text: `${currency(a.monthlyImpact)} em ${IMPACT_PROJECTION_DAYS} dias`,
      })],
      ['Causa provável', a.probableCause],
      ...(perfil.showTechnicalDetail
        ? [['Identificador', el('span', { class: 'num', text: a.id ?? '—' })]]
        : []),
    ]),
  }));

  area.replaceChildren(
    el('ul', { class: 'filterlist' }, ...itens.map((i) => el('li', {}, i))),
    el('p', { class: 'costtotal' },
      el('span', { text: `${anomalias.length} de ${dados.anomalias.length} anomalias` }),
      el('span', {
        class: 'costtotal__value num',
        text: `${currency(sumBy(anomalias, 'monthlyImpact'))} de impacto`,
      })),
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