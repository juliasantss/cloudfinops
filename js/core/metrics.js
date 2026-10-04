/**
 * Métricas do CloudFinOps.
 *
 * Todo cálculo da plataforma vive aqui: agregação, variação, projeção,
 * detecção de anomalias e FinOps Score. Nenhuma função toca no DOM nem faz
 * requisição, o que torna este módulo testável isoladamente — inclusive
 * fora do navegador.
 */

import {
  ANOMALY_SEVERITIES,
  BASELINE_WINDOW_DAYS,
  IMPACT_PROJECTION_DAYS,
} from '../config.js';

/* ------------------------------------------------------------------ */
/* Agregação                                                           */
/* ------------------------------------------------------------------ */

/** Soma um campo numérico de uma lista. */
export function sumBy(lista, campo = 'billedCost') {
  return lista.reduce((total, item) => total + (Number(item[campo]) || 0), 0);
}

/**
 * Agrupa registros por uma chave calculada.
 * @returns {Map<string, Array<object>>}
 */
export function groupBy(lista, chaveFn) {
  const mapa = new Map();
  for (const item of lista) {
    const chave = chaveFn(item);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(item);
  }
  return mapa;
}

/**
 * Agrupa e soma de uma vez, devolvendo lista ordenada por valor decrescente.
 *
 * aggregate(cobrancas, r => r.provider)
 *   => [{ key: 'AWS', total: 7795.9, count: 86, share: 47.5 }, ...]
 *
 * @returns {Array<{key: string, total: number, count: number, share: number}>}
 */
export function aggregate(lista, chaveFn, campo = 'billedCost') {
  const grupos = groupBy(lista, chaveFn);
  const total = sumBy(lista, campo);

  const saida = [];
  for (const [chave, itens] of grupos) {
    const soma = sumBy(itens, campo);
    saida.push({
      key: chave,
      total: round2(soma),
      count: itens.length,
      share: total > 0 ? round2((soma / total) * 100) : 0,
    });
  }

  return saida.sort((a, b) => b.total - a.total);
}

/** Arredonda para duas casas sem acumular erro de ponto flutuante. */
export function round2(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Variação e projeção                                                 */
/* ------------------------------------------------------------------ */

/**
 * Variação percentual entre dois valores.
 * Devolve null quando a base é zero — divisão por zero não é "infinito por
 * cento", é ausência de base de comparação, e a interface precisa saber
 * disso para exibir um traço em vez de um número sem sentido.
 */
export function variationPct(atual, anterior) {
  if (!anterior) return null;
  return round2(((atual - anterior) / anterior) * 100);
}

/**
 * Projeção linear do fechamento do mês.
 *
 * Premissa declarada: o ritmo dos dias restantes repete a média dos dias
 * decorridos. É simples e explicável — o que importa mais que precisão numa
 * ferramenta de decisão. Modelo com sazonalidade fica para etapa futura.
 */
export function forecastMonth(acumulado, diasDecorridos, diasTotais) {
  if (!diasDecorridos || diasDecorridos <= 0) return 0;
  return round2((acumulado / diasDecorridos) * diasTotais);
}

/** Média diária do período decorrido. */
export function dailyAverage(acumulado, diasDecorridos) {
  if (!diasDecorridos || diasDecorridos <= 0) return 0;
  return round2(acumulado / diasDecorridos);
}

/* ------------------------------------------------------------------ */
/* Séries temporais                                                    */
/* ------------------------------------------------------------------ */

/**
 * Média móvel simples. Posições sem janela completa recebem null, para que
 * a interface não desenhe linha de base onde não existe histórico.
 */
export function movingAverage(valores, janela) {
  return valores.map((_, i) => {
    if (i < janela) return null;
    const fatia = valores.slice(i - janela, i);
    return round2(fatia.reduce((a, b) => a + b, 0) / janela);
  });
}

/**
 * Converte a série diária em séries por par provedor/serviço, ordenadas
 * por data. É a estrutura que a detecção de anomalias consome.
 */
export function buildSeries(dailyCharges) {
  const series = groupBy(dailyCharges, (d) => `${d.provider}||${d.serviceName}`);
  for (const pontos of series.values()) {
    pontos.sort((a, b) => a.date.localeCompare(b.date));
  }
  return series;
}

/* ------------------------------------------------------------------ */
/* Detecção de anomalias                                               */
/* ------------------------------------------------------------------ */

/**
 * Classifica a severidade exigindo desvio percentual E impacto absoluto.
 *
 * As duas condições juntas são o que evita falso alarme: um gasto que vai de
 * US$ 2 para US$ 6 tem 200% de desvio e US$ 4 de impacto. Com apenas o
 * critério percentual, apareceria como crítico ao lado de um desvio real de
 * centenas de dólares.
 *
 * @returns {string|null} rótulo da severidade, ou null se não é anomalia
 */
export function classifySeverity(desvioPct, impactoMensal) {
  for (const faixa of ANOMALY_SEVERITIES) {
    if (desvioPct >= faixa.minDeviationPct && impactoMensal >= faixa.minMonthlyImpact) {
      return faixa.label;
    }
  }
  return null;
}

/**
 * Detecta desvios na série diária.
 *
 * Linha de base: média móvel dos N dias anteriores do mesmo par
 * provedor/serviço. Compara cada dia com a sua própria história, e não com
 * uma média global — o que impede que um serviço caro seja sempre anômalo.
 *
 * @param {Array<object>} dailyCharges  registros com date, provider, serviceName, billedCost
 * @param {object} opcoes
 * @returns {Array<object>} desvios ordenados por severidade e impacto
 */
export function detectAnomalies(dailyCharges, opcoes = {}) {
  const janela = opcoes.windowDays ?? BASELINE_WINDOW_DAYS;
  const projecao = opcoes.projectionDays ?? IMPACT_PROJECTION_DAYS;
  const apenasPrimeira = opcoes.firstPerSeries ?? true;

  const series = buildSeries(dailyCharges);
  const achados = [];

  for (const [chave, pontos] of series) {
    const [provider, serviceName] = chave.split('||');

    for (let i = janela; i < pontos.length; i += 1) {
      const anteriores = pontos.slice(i - janela, i);
      const base = anteriores.reduce((a, p) => a + p.billedCost, 0) / janela;
      if (base <= 0) continue;

      const observado = pontos[i].billedCost;
      const desvio = ((observado - base) / base) * 100;
      if (desvio <= 0) continue;

      const impacto = (observado - base) * projecao;
      const severidade = classifySeverity(desvio, impacto);
      if (!severidade) continue;

      achados.push({
        provider,
        serviceName,
        serviceCategory: pontos[i].serviceCategory ?? '',
        date: pontos[i].date,
        baselineCost: round2(base),
        observedCost: round2(observado),
        deviationPct: round2(desvio),
        monthlyImpact: round2(impacto),
        severity: severidade,
      });
    }
  }

  const resultado = apenasPrimeira ? primeiraDeCadaSerie(achados) : achados;
  const ordem = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };

  return resultado.sort((a, b) => {
    const diff = (ordem[a.severity] ?? 9) - (ordem[b.severity] ?? 9);
    return diff !== 0 ? diff : b.monthlyImpact - a.monthlyImpact;
  });
}

/**
 * Um degrau de consumo dispararia alerta todos os dias seguintes. Manter
 * apenas a primeira detecção transforma ruído repetido em um incidente.
 */
function primeiraDeCadaSerie(achados) {
  const vistos = new Set();
  const unicos = [];

  for (const a of [...achados].sort((x, y) => x.date.localeCompare(y.date))) {
    const chave = `${a.provider}||${a.serviceName}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push(a);
  }

  return unicos;
}

/* ------------------------------------------------------------------ */
/* Alocação e governança                                               */
/* ------------------------------------------------------------------ */

/**
 * Conformidade de uma chave de tag sobre um conjunto de recursos.
 * @returns {{key, resourcesWithTag, resourcesTotal, compliancePct, untaggedCost}}
 */
export function tagCompliance(recursos, chave) {
  const com = recursos.filter((r) => Boolean(r.tags?.[chave]));
  const sem = recursos.filter((r) => !r.tags?.[chave]);

  return {
    key: chave,
    resourcesWithTag: com.length,
    resourcesTotal: recursos.length,
    compliancePct: recursos.length ? round2((com.length / recursos.length) * 100) : 0,
    untaggedCost: round2(sumBy(sem, 'monthlyCost')),
  };
}

/* ------------------------------------------------------------------ */
/* FinOps Score                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pesos dos pilares. Somam 100.
 * A fórmula é exibida na interface: um índice sem fórmula visível é
 * decoração, não medida.
 */
export const SCORE_PILLARS = [
  { id: 'governance', label: 'Governança e tagging', weight: 25 },
  { id: 'optimization', label: 'Otimização', weight: 25 },
  { id: 'costControl', label: 'Controle de custos', weight: 20 },
  { id: 'predictability', label: 'Previsibilidade', weight: 15 },
  { id: 'anomalyResponse', label: 'Resposta a anomalias', weight: 15 },
];

/** Mantém um valor dentro de 0 a 100. */
function clamp100(valor) {
  return Math.max(0, Math.min(100, valor));
}

/**
 * Calcula o FinOps Score e o nível de maturidade.
 *
 * Os níveis Crawl, Walk e Run são a nomenclatura de maturidade do FinOps
 * Framework. Ancorar o índice num modelo público é o que o diferencia de
 * uma métrica inventada.
 *
 * @param {object} entrada
 * @param {number} entrada.totalCost          custo do mês de referência
 * @param {number} entrada.allocatableCost    custo em recursos com OwnerTeam
 * @param {number} entrada.potentialSavings   economia identificada e não capturada
 * @param {Array}  entrada.budgets            orçamentos com forecast e amount
 * @param {Array}  entrada.monthlySeries      série histórica realizada
 * @param {Array}  entrada.anomalies          anomalias com status
 */
export function finopsScore(entrada) {
  const {
    totalCost = 0,
    allocatableCost = 0,
    potentialSavings = 0,
    budgets = [],
    monthlySeries = [],
    anomalies = [],
  } = entrada;

  // Governança: quanto do gasto tem responsável identificado.
  const governance = totalCost > 0 ? (allocatableCost / totalCost) * 100 : 0;

  // Otimização: quanto do gasto NÃO é desperdício identificado.
  const optimization = totalCost > 0 ? (1 - potentialSavings / totalCost) * 100 : 100;

  // Controle de custos: proporção de orçamentos cuja projeção respeita o limite.
  const dentro = budgets.filter((b) => (b.forecast ?? 0) <= (b.amount ?? 0)).length;
  const costControl = budgets.length ? (dentro / budgets.length) * 100 : 0;

  // Previsibilidade: estabilidade mês a mês.
  // Aproximação declarada — a medida ideal compara projeção com realizado,
  // o que exige histórico de projeções que a plataforma ainda não guarda.
  const realizados = monthlySeries.filter((m) => m.kind === 'actual').map((m) => m.billedCost);
  let predictability = 100;
  if (realizados.length >= 3) {
    const variacoes = [];
    for (let i = 1; i < realizados.length; i += 1) {
      if (realizados[i - 1] > 0) {
        variacoes.push(Math.abs((realizados[i] - realizados[i - 1]) / realizados[i - 1]) * 100);
      }
    }
    const media = variacoes.reduce((a, b) => a + b, 0) / (variacoes.length || 1);
    predictability = 100 - Math.min(media * 4, 100);
  }

  // Resposta a anomalias: proporção que saiu do estado "aberta".
  const tratadas = anomalies.filter((a) => a.status && a.status !== 'open').length;
  const anomalyResponse = anomalies.length ? (tratadas / anomalies.length) * 100 : 100;

  const valores = {
    governance: clamp100(governance),
    optimization: clamp100(optimization),
    costControl: clamp100(costControl),
    predictability: clamp100(predictability),
    anomalyResponse: clamp100(anomalyResponse),
  };

  const pilares = SCORE_PILLARS.map((p) => ({
    ...p,
    value: round2(valores[p.id]),
    contribution: round2((valores[p.id] * p.weight) / 100),
  }));

  const score = Math.round(pilares.reduce((total, p) => total + p.contribution, 0));

  return { score, level: maturityLevel(score), pillars: pilares };
}

/** Nível de maturidade na nomenclatura do FinOps Framework. */
export function maturityLevel(score) {
  if (score >= 80) return { id: 'run', label: 'Run', description: 'Prática madura e automatizada.' };
  if (score >= 50) return { id: 'walk', label: 'Walk', description: 'Prática estabelecida, com lacunas conhecidas.' };
  return { id: 'crawl', label: 'Crawl', description: 'Prática inicial, foco em visibilidade.' };
}