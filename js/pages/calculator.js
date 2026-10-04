/**
 * Simulador de custos multicloud — ponto de entrada da tela.
 *
 * Responde a pergunta que justifica o esquema FOCUS: "quanto este mesmo
 * recurso custaria em cada nuvem?". Só é possível comparar porque o campo
 * ServiceCategory é normalizado pela especificação — ServiceName não é
 * comparável, já que EC2, Virtual Machines e Compute Engine são o mesmo
 * conceito com três nomes.
 */

import { getMeta } from '../api/charges.js';
import { listPriceCatalog } from '../api/pricing.js';
import { listScenarios, createScenario, deleteScenario } from '../api/scenarios.js';

import { round2 } from '../core/metrics.js';

import { el, mount, delegate } from '../ui/dom.js';
import { mountSessionControls, onProfileChange } from '../ui/profile.js';
import { initTheme } from '../ui/theme.js';
import { dataTable } from '../ui/components/dataTable.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';
import { currency, percent, integer, providerShort, fullDate } from '../format.js';

const HORAS_MES = 730;   // média usada pelos provedores: 365 × 24 ÷ 12

let dados = null;
let resultado = null;

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#calc-context'),
    form: mount('#calc-form'),
    result: mount('#calc-result'),
    saved: mount('#calc-saved'),
  };

  areas.form.replaceChildren(loadingState());

  try {
    const [meta, catalogo, cenarios] = await Promise.all([
      getMeta(), listPriceCatalog(), listScenarios(),
    ]);

    dados = { meta, catalogo, cenarios };

    areas.context.replaceChildren(
      `catálogo com `,
      el('span', { class: 'num', text: integer(catalogo.length) }),
      ` preços · ${[...new Set(catalogo.map((p) => p.provider))].length} nuvens · ${meta.currency}`,
    );

    desenharFormulario(areas);
    desenharSalvos(areas);
    areas.result.replaceChildren(emptyState({
      title: 'Monte um cenário',
      message: 'Escolha o tipo de recurso e a quantidade para comparar as três nuvens.',
    }));
  } catch (erro) {
    areas.form.replaceChildren(errorState(erro, () => iniciar()));
  }
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

function desenharFormulario(areas) {
  const familias = [...new Map(dados.catalogo.map((p) => [p.family, p])).values()];

  const campoFamilia = el('select', { class: 'form__input', id: 'calc-familia' },
    ...familias.map((f) => el('option', { value: f.family, text: f.description })));

  const campoQtd = el('input', {
    class: 'form__input', type: 'number', id: 'calc-qtd', min: '1', step: '1', value: '4',
  });
  const erroQtd = el('p', { class: 'form__error', role: 'alert' });

  const campoHoras = el('input', {
    class: 'form__input', type: 'number', id: 'calc-horas', min: '1', max: '744', value: String(HORAS_MES),
  });
  const campoHorasBloco = el('div', { class: 'form__field' },
    el('label', { class: 'form__label', for: 'calc-horas', text: 'Horas por mês' }),
    campoHoras,
    el('p', { class: 'form__hint', text: `${HORAS_MES} horas equivale a operação contínua no mês.` }));

  const unidade = el('p', { class: 'form__hint' });

  /** Horas só fazem sentido quando a unidade de cobrança é por hora. */
  function ajustarUnidade() {
    const item = dados.catalogo.find((p) => p.family === campoFamilia.value);
    unidade.textContent = `Unidade de cobrança: ${item?.unit ?? '—'}`;
    campoHorasBloco.style.display = item?.unit === 'Hours' ? '' : 'none';
  }

  campoFamilia.addEventListener('change', () => { ajustarUnidade(); calcular(areas); });
  campoQtd.addEventListener('input', () => { erroQtd.textContent = ''; });

  const form = el('form', { class: 'form', novalidate: true },
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'calc-familia', text: 'Tipo de recurso' }),
      campoFamilia, unidade),
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'calc-qtd', text: 'Quantidade' }),
      campoQtd, erroQtd),
    campoHorasBloco,
    el('button', { class: 'form__submit', type: 'submit', text: 'Comparar nuvens' }));

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const qtd = Number(campoQtd.value);
    if (!qtd || qtd <= 0) {
      erroQtd.textContent = 'Informe uma quantidade maior que zero.';
      return;
    }
    calcular(areas);
  });

  areas.form.replaceChildren(form);
  ajustarUnidade();
  calcular(areas);
}

/* ------------------------------------------------------------------ */
/* Cálculo                                                             */
/* ------------------------------------------------------------------ */

function calcular(areas) {
  const familia = mount('#calc-familia').value;
  const qtd = Number(mount('#calc-qtd').value) || 0;
  const precos = dados.catalogo.filter((p) => p.family === familia);
  if (precos.length === 0 || qtd <= 0) return;

  const porHora = precos[0].unit === 'Hours';
  const horas = porHora ? (Number(mount('#calc-horas').value) || HORAS_MES) : 1;

  const linhas = precos.map((p) => ({
    provider: p.provider,
    skuName: p.skuName,
    regionId: p.regionId,
    unitPrice: p.unitPrice,
    monthlyCost: round2(p.unitPrice * qtd * horas),
  })).sort((a, b) => a.monthlyCost - b.monthlyCost);

  const barato = linhas[0];
  const caro = linhas[linhas.length - 1];

  resultado = {
    family: familia,
    description: precos[0].description,
    unit: precos[0].unit,
    quantity: qtd,
    hours: horas,
    rows: linhas,
    cheapest: barato,
    spread: round2(caro.monthlyCost - barato.monthlyCost),
    spreadPct: barato.monthlyCost > 0
      ? round2(((caro.monthlyCost - barato.monthlyCost) / barato.monthlyCost) * 100)
      : 0,
  };

  desenharResultado(areas);
}

function desenharResultado(areas) {
  const r = resultado;

  const tabela = dataTable({
    caption: 'Mesma carga precificada em cada nuvem e região. A diferença entre a opção mais '
      + 'barata e a mais cara é a margem de negociação que a comparação revela.',
    sortKey: 'monthlyCost',
    sortDir: 'asc',
    columns: [
      {
        key: 'provider',
        label: 'Nuvem',
        render: (x) => el('span', {},
          providerShort(x.provider),
          el('span', { class: 'datatable__sub', text: `${x.skuName} · ${x.regionId}` })),
      },
      { key: 'unitPrice', label: 'Preço unitário', align: 'right', format: (v) => `US$ ${v.toFixed(4).replace('.', ',')}` },
      {
        key: 'monthlyCost',
        label: 'Custo mensal',
        align: 'right',
        render: (x) => el('span', {
          class: 'num',
          style: { color: x === r.cheapest ? 'var(--gain)' : 'var(--ink)' },
          text: currency(x.monthlyCost),
        }),
      },
      {
        key: 'delta',
        label: 'vs. mais barata',
        align: 'right',
        sortable: false,
        render: (x) => {
          const d = x.monthlyCost - r.cheapest.monthlyCost;
          return el('span', {
            class: 'num',
            style: { color: d === 0 ? 'var(--gain)' : 'var(--ink-muted)' },
            text: d === 0 ? 'melhor preço' : `+${currency(d)}`,
          });
        },
      },
    ],
    rows: r.rows,
  });

  // Variante compacta: quatro cifras grandes não cabem em meia tela.
  const resumo = el('div', { class: 'kpistrip kpistrip--compact' },
    kpiSimples('Opção mais econômica', providerShort(r.cheapest.provider), r.cheapest.regionId),
    kpiSimples('Custo mensal', currency(r.cheapest.monthlyCost), `${integer(r.quantity)} × ${r.unit}`),
    kpiSimples('Custo anualizado', currency(r.cheapest.monthlyCost * 12, true), 'mesma configuração'),
    kpiSimples('Diferença entre nuvens', currency(r.spread, true),
      `${percent(r.spreadPct)} entre a menor e a maior`));

  const campoNome = el('input', {
    class: 'form__input', type: 'text', id: 'calc-nome',
    placeholder: `${r.description} · ${r.quantity} unidades`,
  });
  const feedback = el('p', { class: 'form__hint', role: 'alert' });

  const formSalvar = el('form', { class: 'form form--inline', novalidate: true },
    campoNome,
    el('button', { class: 'form__submit', type: 'submit', text: 'Salvar cenário' }));

  formSalvar.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nome = campoNome.value.trim() || campoNome.placeholder;
    const botao = formSalvar.querySelector('button');
    botao.disabled = true;
    botao.textContent = 'Salvando…';

    try {
      const criado = await createScenario({
        name: nome,
        family: r.family,
        description: r.description,
        quantity: r.quantity,
        hours: r.hours,
        unit: r.unit,
        cheapestProvider: r.cheapest.provider,
        cheapestRegion: r.cheapest.regionId,
        monthlyCost: r.cheapest.monthlyCost,
        spread: r.spread,
        savedAt: new Date().toISOString(),
      });
      dados.cenarios = [criado, ...dados.cenarios];
      campoNome.value = '';
      desenharSalvos(areas);
      feedback.textContent = 'Cenário salvo.';
    } catch (erro) {
      feedback.textContent = erro.userMessage ?? 'Não foi possível salvar.';
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar cenário';
    }
  });

  areas.result.replaceChildren(
    resumo,
    el('div', { style: { paddingTop: 'var(--sp-5)' } }, tabela),
    el('div', { class: 'section' },
      el('div', { class: 'section__head' },
        el('h3', { text: 'Salvar este cenário' }),
        el('p', { class: 'section__note', text: 'fica disponível para comparação futura' })),
      formSalvar, feedback),
  );
}

function kpiSimples(rotulo, valor, apoio) {
  return el('article', { class: 'kpi' },
    el('span', { class: 'kpi__label', text: rotulo }),
    el('span', { class: 'kpi__value num', text: valor }),
    el('span', { class: 'kpi__meta', text: apoio }));
}

/* ------------------------------------------------------------------ */
/* Cenários salvos                                                     */
/* ------------------------------------------------------------------ */

function desenharSalvos(areas) {
  if (dados.cenarios.length === 0) {
    areas.saved.replaceChildren(emptyState({
      title: 'Nenhum cenário salvo',
      message: 'Compare uma configuração e salve para consultar depois.',
    }));
    return;
  }

  const lista = el('ul', { class: 'itemlist' }, ...dados.cenarios.map((c) =>
    el('li', { class: 'itemlist__row' },
      el('span', {},
        el('span', { class: 'itemlist__title', text: c.name }),
        el('span', { class: 'itemlist__meta' },
          `${providerShort(c.cheapestProvider)} · ${c.cheapestRegion} · `,
          el('span', { class: 'num', text: integer(c.quantity) }),
          ` × ${c.unit} · salvo em ${fullDate(c.savedAt)}`)),
      el('span', {},
        el('span', { class: 'itemlist__value num', text: `${currency(c.monthlyCost)}/mês` }),
        ' ',
        el('button', {
          type: 'button', class: 'pager__btn pager__btn--danger', text: 'Excluir',
          dataset: { excluir: c.id },
        })))));

  delegate(lista, 'click', '[data-excluir]', async (_ev, botao) => {
    const id = botao.dataset.excluir;
    botao.disabled = true;
    try {
      await deleteScenario(id);
      dados.cenarios = dados.cenarios.filter((c) => c.id !== id);
      desenharSalvos(areas);
    } catch {
      botao.disabled = false;
      botao.textContent = 'Falhou';
    }
  });

  areas.saved.replaceChildren(lista);
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const controles = document.querySelector('#session-controls');
  if (controles) mountSessionControls(controles);
  iniciar();
  onProfileChange(() => iniciar());
});