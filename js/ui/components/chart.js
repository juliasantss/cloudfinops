/**
 * Gráficos em SVG.
 *
 * Escritos à mão com `createElementNS`, sem biblioteca. Na etapa estática o
 * SVG era fixo no HTML; agora as mesmas coordenadas são calculadas a partir
 * dos dados — a estrutura não mudou, só a origem dos números.
 */

import { svg, el } from '../dom.js';
import { currency, monthLabel, shortDate } from '../../format.js';

const AREA = { width: 720, height: 244, left: 48, right: 16, top: 40, bottom: 44 };

/**
 * Gráfico de barras verticais.
 *
 * @param {Array} serie      { label, value, kind } — kind 'forecast' vira hachura
 * @param {object} [opcoes]  { title, description, maxBars }
 */
export function barChart(serie, opcoes = {}) {
  const dados = opcoes.maxBars ? serie.slice(-opcoes.maxBars) : serie;
  if (dados.length === 0) return el('p', { class: 'state__text', text: 'Sem dados no período.' });

  const plotW = AREA.width - AREA.left - AREA.right;
  const plotH = AREA.height - AREA.top - AREA.bottom;
  const base = AREA.top + plotH;

  const maximo = Math.max(...dados.map((d) => d.value));
  const escala = escalaBonita(maximo);
  const fatia = plotW / dados.length;
  const largura = Math.min(fatia * 0.62, 56);

  const idTitulo = `chart-t-${Math.random().toString(36).slice(2, 8)}`;
  const idDesc = `chart-d-${Math.random().toString(36).slice(2, 8)}`;

  const node = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${AREA.width} ${AREA.height}`,
    role: 'img',
    'aria-labelledby': `${idTitulo} ${idDesc}`,
  });

  node.appendChild(svg('title', { id: idTitulo, text: opcoes.title ?? 'Evolução de custo' }));
  node.appendChild(svg('desc', {
    id: idDesc,
    text: opcoes.description ?? dados.map((d) => `${d.label} ${currency(d.value, true)}`).join(', '),
  }));

  // Hachura usada na barra de projeção
  const defs = svg('defs');
  defs.appendChild(svg('pattern', {
    id: 'chart-hachura', width: 6, height: 6,
    patternTransform: 'rotate(45)', patternUnits: 'userSpaceOnUse',
  },
  svg('rect', { width: 6, height: 6, fill: 'var(--surface)' }),
  svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--rule-ink)', 'stroke-width': 2 })));
  node.appendChild(defs);

  // Linhas de grade e rótulos do eixo
  const grade = svg('g', { class: 'chart__grid' });
  const rotulosY = svg('g', { class: 'chart__label', 'text-anchor': 'end' });

  for (let i = 1; i <= 3; i += 1) {
    const valor = (escala / 3) * i;
    const y = base - (valor / escala) * plotH;
    grade.appendChild(svg('line', { x1: AREA.left, y1: y, x2: AREA.width - AREA.right, y2: y }));
    rotulosY.appendChild(svg('text', { x: AREA.left - 8, y: y + 4, text: currency(valor, true).replace('US$ ', '') }));
  }
  rotulosY.appendChild(svg('text', { x: AREA.left - 8, y: base + 4, text: '0' }));

  node.appendChild(grade);
  node.appendChild(svg('line', {
    class: 'chart__axis', x1: AREA.left, y1: base, x2: AREA.width - AREA.right, y2: base,
  }));
  node.appendChild(rotulosY);

  // Barras
  const barras = svg('g');
  const rotulosX = svg('g', { class: 'chart__label', 'text-anchor': 'middle' });

  dados.forEach((d, i) => {
    const altura = escala > 0 ? (d.value / escala) * plotH : 0;
    const x = AREA.left + i * fatia + (fatia - largura) / 2;
    const y = base - altura;
    const projetado = d.kind === 'forecast';

    const barra = svg('rect', {
      x, y, width: largura, height: Math.max(altura, 1),
      class: projetado ? null : 'chart__bar',
      fill: projetado ? 'url(#chart-hachura)' : null,
      stroke: projetado ? 'var(--rule-ink)' : null,
      'stroke-width': projetado ? 1 : null,
    });
    barra.appendChild(svg('title', { text: `${d.label}: ${currency(d.value)}` }));
    barras.appendChild(barra);

    rotulosX.appendChild(svg('text', { x: x + largura / 2, y: base + 18, text: d.label }));
  });

  node.appendChild(barras);
  node.appendChild(rotulosX);
  return node;
}

/** Legenda do gráfico, separando realizado de projetado. */
export function chartLegend() {
  return el('p', { class: 'chart__legend' },
    el('span', {}, el('i', { class: 'chart__key' }), 'Realizado'),
    el('span', {}, el('i', { class: 'chart__key chart__key--forecast' }), 'Projetado'));
}

/** Arredonda o topo do eixo para um número legível. */
function escalaBonita(maximo) {
  if (maximo <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(maximo));
  return Math.ceil(maximo / magnitude) * magnitude;
}

/** Converte `monthlySeries` da API no formato do gráfico. */
export function fromMonthlySeries(serie) {
  return serie.map((m) => ({
    label: monthLabel(m.month),
    value: m.billedCost,
    kind: m.kind,
  }));
}

/** Converte `dailyTotals` da API no formato do gráfico. */
export function fromDailyTotals(diario) {
  return diario.map((d) => ({ label: shortDate(d.date), value: d.billedCost, kind: 'actual' }));
}