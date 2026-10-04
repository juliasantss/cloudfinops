/**
 * Formatação de valores para exibição.
 *
 * Toda cifra, percentual e data da interface passa por aqui. Centralizar
 * garante que o mesmo número apareça igual em todas as telas — e é o que
 * permite trocar moeda ou localidade em um único lugar.
 *
 * Módulo puro: não toca no DOM e não faz requisição.
 */

import { CURRENCY, LOCALE, CATEGORY_LABELS, PROVIDER_SHORT, WORKFLOW_STATUS } from './config.js';

const moeda = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moedaCompacta = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numero = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Moeda com duas casas: US$ 8.420,00
 * @param {number} valor
 * @param {boolean} compacto  sem centavos, para espaços estreitos
 */
export function currency(valor, compacto = false) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return (compacto ? moedaCompacta : moeda).format(valor);
}

/**
 * Separa a parte inteira dos centavos, para que a interface possa exibir os
 * centavos menores. Devolve as duas partes já formatadas.
 *
 * splitCurrency(8420.5) => { integer: 'US$ 8.420', cents: ',50' }
 */
export function splitCurrency(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return { integer: '—', cents: '' };
  }
  const texto = moeda.format(valor);
  const corte = texto.lastIndexOf(',');
  if (corte === -1) return { integer: texto, cents: '' };
  return { integer: texto.slice(0, corte), cents: texto.slice(corte) };
}

/** Inteiro com separador de milhar: 1.248 */
export function integer(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return numero.format(valor);
}

/**
 * Percentual: percent(84.3) => '84,3%'
 * @param {number} valor  já em escala de 0 a 100
 * @param {number} casas
 */
export function percent(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${valor.toFixed(casas).replace('.', ',')}%`;
}

/**
 * Variação com sinal explícito: '+187,3%' ou '−3,0%'.
 * Usa o sinal de menos tipográfico, que alinha melhor em fonte tabular.
 */
export function delta(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return `${sinal}${Math.abs(valor).toFixed(casas).replace('.', ',')}%`;
}

/**
 * Classe semântica da variação, para que a cor acompanhe o significado.
 * Em custo, subir é ruim e descer é bom — o oposto de uma métrica de receita.
 */
export function deltaTone(valor, limiarAlerta = 50) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'neutral';
  if (valor >= limiarAlerta) return 'alert';
  if (valor > 0) return 'neutral';
  return 'gain';
}

/** Data ISO para formato curto: '2026-08-22' => '22/08' */
export function shortDate(iso) {
  if (!iso) return '—';
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
}

/** Data ISO para formato completo: '2026-08-22' => '22/08/2026' */
export function fullDate(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Mês ISO para rótulo: '2026-08' => 'ago' */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function monthLabel(iso) {
  if (!iso) return '—';
  const mes = Number(iso.slice(5, 7));
  return MESES[mes - 1] ?? '—';
}

/** Mês ISO por extenso: '2026-08' => 'agosto de 2026' */
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthFull(iso) {
  if (!iso) return '—';
  const mes = Number(iso.slice(5, 7));
  return `${MESES_LONGOS[mes - 1]} de ${iso.slice(0, 4)}`;
}

/**
 * Tempo decorrido em linguagem natural: 'há 2 horas'.
 * Usado no carimbo de última sincronização das fontes de dados.
 */
export function timeAgo(iso) {
  if (!iso) return '—';
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'agora há pouco';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** Nome curto do provedor: 'Microsoft Azure' => 'Azure' */
export function providerShort(nome) {
  return PROVIDER_SHORT[nome] ?? nome;
}

/** Categoria FOCUS traduzida: 'Networking' => 'Rede' */
export function categoryLabel(categoria) {
  return CATEGORY_LABELS[categoria] ?? categoria;
}

/** Rótulo e tom de um status de fluxo de trabalho. */
export function statusInfo(status) {
  return WORKFLOW_STATUS[status] ?? { label: status, tone: 'neutral' };
}

/**
 * Quantidade com unidade FOCUS: '1.240 GB'
 * A unidade vem do dado (`ConsumedUnit`), não de suposição.
 */
export function quantity(valor, unidade) {
  if (valor === null || valor === undefined) return '—';
  return `${integer(Math.round(valor))} ${unidade ?? ''}`.trim();
}