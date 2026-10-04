/**
 * Dashboard — ponto de entrada da tela.
 *
 * Responsabilidade única: buscar dados, calcular métricas com `core/` e
 * montar componentes de `ui/`. Nenhum cálculo de negócio mora aqui, nenhuma
 * construção de elemento tampouco — esta camada só orquestra.
 */

import { getMeta, listMonthlySeries, listCharges, listDailyCharges } from '../api/charges.js';
import { listAnomalies } from '../api/anomalies.js';
import { listRecommendations } from '../api/recommendations.js';
import { listResources } from '../api/governance.js';

import { aggregate, sumBy, finopsScore, variationPct, dailyAverage, round2 } from '../core/metrics.js';
import { unallocatedCost, complianceByKey, nonCompliantResources } from '../core/allocation.js';

import { el, mount, delegate } from '../ui/dom.js';
import { createStore } from '../ui/state.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { barChart, chartLegend, fromMonthlySeries } from '../ui/components/chart.js';
import { expander, keyValueList, badge } from '../ui/components/expander.js';
import { filterBar, optionsFrom, ALL } from '../ui/components/filterBar.js';
import { dataTable } from '../ui/components/dataTable.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';

import { currency, percent, delta, deltaTone, integer, monthFull, providerShort, statusInfo, shortDate }
  from '../format.js';
import { CATEGORY_LABELS } from '../config.js';

/** Estado local da tela: só o filtro de provedor por enquanto. */
const store = createStore({ provider: ALL });

/** Dados carregados uma vez e reaproveitados pelos blocos. */
let dados = null;

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    kpis: mount('#dash-kpis'),
    chart: mount('#dash-chart'),
    alerts: mount('#dash-alerts'),
    costs: mount('#dash-costs'),
    filter: mount('#dash-costs-filter'),
    governance: mount('#dash-governance'),
    recs: mount('#dash-recs'),
    context: mount('#dash-context'),
  };

  for (const area of Object.values(areas)) {
    area.replaceChildren(loadingState());
  }

  try {
    // O período de referência vem do meta: nenhuma data cravada na tela.
    const meta = await getMeta();

    const [serie, cobrancasFechado, cobrancasCorrente, diarias, anomalias, recomendacoes, recursos] =
      await Promise.all([
        listMonthlySeries(),
        listCharges({ month: meta.closedMonth }),
        listCharges({ month: meta.currentMonth }),
        listDailyCharges(),
        listAnomalies(),
        listRecommendations({ _sort: 'estimatedMonthlySavings', _order: 'desc' }),
        listResources(),
      ]);

    dados = {
      meta, serie, diarias, anomalias, recomendacoes, recursos,
      cobrancasJul: cobrancasFechado,
      cobrancasAgo: cobrancasCorrente,
    };

    desenharContexto(areas.context);
    desenharKpis(areas.kpis);
    desenharGrafico(areas.chart);
    desenharAlertas(areas.alerts);
    desenharFiltro(areas.filter);
    desenharCustos(areas.costs);
    desenharGovernanca(areas.governance);
    desenharRecomendacoes(areas.recs);

    // Qualquer mudança de filtro redesenha apenas o bloco de custos.
    store.subscribe(() => desenharCustos(areas.costs));
  } catch (erro) {
    const tentar = () => iniciar();
    areas.kpis.replaceChildren(errorState(erro, tentar));
    for (const [nome, area] of Object.entries(areas)) {
      if (nome !== 'kpis') area.replaceChildren();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Blocos                                                              */
/* ------------------------------------------------------------------ */

function desenharContexto(area) {
  const { meta } = dados;
  area.replaceChildren(
    monthFull(meta.currentMonth),
    ' · dia ',
    el('span', { class: 'num', text: String(meta.currentMonthElapsedDays) }),
    ' de ',
    el('span', { class: 'num', text: String(meta.currentMonthTotalDays) }),
    ` · ${meta.currency} · FOCUS ${meta.focusVersion}`,
  );
}

function desenharKpis(area) {
  const { meta, cobrancasJul, cobrancasAgo, serie, anomalias, recursos } = dados;

  const totalJul = sumBy(cobrancasJul);
  const acumulado = sumBy(cobrancasAgo);
  const projecao = meta.totals.currentMonthForecast;
  const variacao = variationPct(projecao, totalJul);
  const naoAtribuido = unallocatedCost(recursos);

  const { score, level } = finopsScore({
    totalCost: totalJul,
    allocatableCost: totalJul - naoAtribuido.cost,
    potentialSavings: meta.totals.potentialSavings,
    budgets: [],
    monthlySeries: serie,
    anomalies: anomalias,
  });

  renderKpiStrip(area, [
    {
      label: 'Acumulado no mês',
      value: acumulado,
      meta: `Média diária ${currency(dailyAverage(acumulado, meta.currentMonthElapsedDays))}`,
    },
    {
      label: 'Projeção de fechamento',
      value: projecao,
      // Nos primeiros dias do mês a projeção se apoia em poucas amostras.
      // Declarar a baixa confiança é mais útil que exibir o número sozinho.
      meta: meta.forecastConfidence === 'low'
        ? `baixa confiança · base de ${meta.forecastBasisDays} dias`
        : `${delta(variacao)} sobre o mês fechado`,
      tone: meta.forecastConfidence === 'low' ? 'warn' : deltaTone(variacao, 5),
    },
    {
      label: 'Economia potencial',
      value: meta.totals.potentialSavings,
      valueTone: 'gain',
      meta: `${dados.recomendacoes.length} recomendações abertas`,
    },
    {
      label: `FinOps Score · ${level.label}`,
      value: score,
      format: 'score',
      meterPct: score,
      tone: score >= 80 ? 'gain' : score >= 50 ? 'warn' : 'alert',
    },
  ]);
}

function desenharGrafico(area) {
  area.replaceChildren(
    barChart(fromMonthlySeries(dados.serie), {
      title: 'Custo mensal consolidado das três nuvens',
    }),
    chartLegend(),
  );
}

function desenharAlertas(area) {
  const { anomalias } = dados;

  if (anomalias.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhum desvio detectado',
      message: 'O consumo está dentro da linha de base em todos os serviços.',
    }));
    return;
  }

  const tons = { 'Crítica': 'alert', 'Alta': 'warn', 'Média': 'warn', 'Baixa': null };

  const lista = el('ul', { class: 'itemlist' }, ...anomalias.slice(0, 5).map((a) => {
    const info = statusInfo(a.status);
    return el('li', { class: 'itemlist__row' },
      el('span', {},
        el('span', { class: 'itemlist__title', text: `${a.serviceName} acima da linha de base` }),
        el('span', { class: 'itemlist__meta' },
          `${shortDate(a.date)} · ${providerShort(a.provider)} · base `,
          el('span', { class: 'num', text: currency(a.baselineCost) }),
          ' → observado ',
          el('span', { class: 'num', text: currency(a.observedCost) }))),
      el('span', {},
        badge(a.severity, tons[a.severity]),
        ' ',
        badge(info.label, info.tone === 'neutral' ? null : info.tone)));
  }));

  area.replaceChildren(lista);
}

function desenharFiltro(area) {
  const opcoes = optionsFrom(dados.cobrancasJul, (c) => c.provider, {
    allLabel: 'Todas as nuvens',
    labelFn: providerShort,
  });

  area.replaceChildren(filterBar({
    options: opcoes,
    active: store.get('provider'),
    ariaLabel: 'Filtrar custos por provedor',
    onChange: (valor) => store.set({ provider: valor }),
  }));
}

function desenharCustos(area) {
  const provedor = store.get('provider');
  const filtradas = provedor === ALL
    ? dados.cobrancasJul
    : dados.cobrancasJul.filter((c) => c.provider === provedor);

  if (filtradas.length === 0) {
    area.replaceChildren(emptyState({ title: 'Nenhum custo neste filtro' }));
    return;
  }

  const porServico = aggregate(filtradas, (c) => `${c.provider}||${c.serviceName}`);
  const total = sumBy(filtradas);

  const itens = porServico.slice(0, 8).map((grupo) => {
    const [prov, servico] = grupo.key.split('||');
    const linhas = filtradas.filter((c) => c.provider === prov && c.serviceName === servico);
    const categoria = linhas[0]?.serviceCategory ?? '';
    const semTags = sumBy(linhas, 'untaggedCost');

    return expander({
      title: servico,
      subtitle: `${providerShort(prov)} · ${CATEGORY_LABELS[categoria] ?? categoria} · `
        + `${percent(grupo.share)} do período`,
      value: currency(grupo.total),
      body: () => keyValueList([
        ['Por conta', listaDeContas(linhas)],
        ['Região', [...new Set(linhas.map((l) => l.regionId))].join(' · ')],
        ['Custo com as três tags', el('span', { class: 'num', text: currency(sumBy(linhas, 'taggedCost')) })],
        ['Custo sem tag obrigatória', el('span', {
          class: 'num',
          style: { color: semTags > 0 ? 'var(--alert)' : 'var(--ink-muted)' },
          text: currency(semTags),
        })],
        ['Custo efetivo (com descontos)', el('span', {
          class: 'num', text: currency(sumBy(linhas, 'effectiveCost')),
        })],
      ]),
    });
  });

  area.replaceChildren(
    el('ul', { class: 'costlist' }, ...itens.map((item) => el('li', {}, item))),
    el('p', { class: 'costtotal' },
      el('span', { text: `${porServico.length} serviços no filtro` }),
      el('span', { class: 'costtotal__value num', text: currency(total) })),
  );
}

function listaDeContas(linhas) {
  const porConta = aggregate(linhas, (l) => l.subAccountName);
  const span = el('span');
  porConta.forEach((c, i) => {
    if (i > 0) span.appendChild(document.createTextNode(' · '));
    span.appendChild(document.createTextNode(`${c.key} `));
    span.appendChild(el('span', { class: 'num', text: currency(c.total) }));
  });
  return span;
}

function desenharGovernanca(area) {
  const { recursos } = dados;
  const naoAtribuido = unallocatedCost(recursos);
  const cobertura = complianceByKey(recursos);
  const irregulares = nonCompliantResources(recursos, 5);

  const impacto = el('div', {},
    el('div', { class: 'impact' },
      el('span', { class: 'label', id: 'gov-impacto', text: 'Custo sem responsável' }),
      el('span', { class: 'impact__value num', 'aria-labelledby': 'gov-impacto', text: currency(naoAtribuido.cost) }),
      el('span', { class: 'impact__note' },
        el('span', { class: 'num', text: percent(naoAtribuido.pct) }),
        ' do inventário está em ',
        el('span', { class: 'num', text: integer(naoAtribuido.resourceCount) }),
        ' recursos sem a tag ',
        el('span', { class: 'tagkey', text: 'OwnerTeam' }),
        ' e não pode ser atribuído a nenhuma equipe.')),

    el('div', { class: 'taglist' }, ...cobertura.map((c) => {
      const tom = c.compliancePct >= 90 ? 'gain' : c.compliancePct >= 80 ? 'warn' : 'alert';
      return el('div', { class: 'taglist__item' },
        el('div', { class: 'taglist__head' },
          el('span', { class: 'tagkey', text: c.key }),
          el('span', { class: 'taglist__pct num', text: percent(c.compliancePct) })),
        el('span', { class: 'meter' },
          el('span', {
            class: `meter__fill meter__fill--${tom}`,
            style: { width: `${c.compliancePct}%` },
          })),
        el('span', { class: 'taglist__meta' },
          el('span', { class: 'num', text: integer(c.resourcesTotal - c.resourcesWithTag) }),
          ' de ',
          el('span', { class: 'num', text: integer(c.resourcesTotal) }),
          ' recursos sem a tag · ',
          el('span', { class: 'num', text: currency(c.untaggedCost) })));
    })),
  );

  const tabela = dataTable({
    caption: `Recursos de maior custo entre os fora de conformidade. `
      + `${integer(recursos.filter((r) => r.compliant).length)} de ${integer(recursos.length)} `
      + `possuem as três tags obrigatórias.`,
    columns: [
      {
        key: 'resourceId',
        label: 'Recurso',
        sortable: false,
        render: (r) => el('span', {},
          el('span', { class: 'num', text: r.resourceId }),
          el('span', { class: 'datatable__sub', text: `${r.resourceType} · ${providerShort(r.provider)} · ${r.regionId}` })),
      },
      {
        key: 'missingTags',
        label: 'Tags ausentes',
        sortable: false,
        render: (r) => el('span', {}, ...r.missingTags.map((t) =>
          el('span', { class: 'tag tag--alert tagkey', text: t }))),
      },
      {
        key: 'monthlyCost',
        label: 'Custo/mês',
        align: 'right',
        format: (v) => currency(v),
      },
    ],
    rows: irregulares,
    sortKey: 'monthlyCost',
  });

  area.replaceChildren(impacto, el('div', {}, tabela));
}

function desenharRecomendacoes(area) {
  const { recomendacoes } = dados;
  const tons = { 'Crítica': 'alert', 'Alta': 'warn', 'Média': null, 'Baixa': null };

  const itens = recomendacoes.slice(0, 5).map((r) => expander({
    title: r.title,
    subtitle: `${providerShort(r.provider)} · ${CATEGORY_LABELS[r.serviceCategory] ?? r.serviceCategory}`
      + ` · esforço ${r.effort} · risco ${r.risk}`,
    value: el('span', { class: 'rec__amount', text: `${currency(r.estimatedMonthlySavings)}/mês` }),
    badges: [badge(r.priority, tons[r.priority])],
    body: () => keyValueList([
      ['Problema', r.problem],
      ['Ação sugerida', r.action],
      ['Status', badge(statusInfo(r.status).label, statusInfo(r.status).tone)],
    ]),
  }));

  const total = sumBy(recomendacoes, 'estimatedMonthlySavings');

  area.replaceChildren(
    el('ul', { class: 'reclist' }, ...itens.map((i) => el('li', {}, i))),
    el('p', { class: 'costtotal' },
      el('span', { text: `${recomendacoes.length} oportunidades identificadas` }),
      el('span', { class: 'costtotal__value num', text: `${currency(total)}/mês` })),
  );
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', iniciar);