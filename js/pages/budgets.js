/**
 * Orçamentos — ponto de entrada da tela.
 *
 * Única tela com escrita completa: POST ao criar, PUT ao editar, DELETE ao
 * excluir. Consumo e projeção não são digitados — são calculados a partir
 * das cobranças do mês corrente para o escopo escolhido.
 */

import { getMeta, listCharges } from '../api/charges.js';
import { listBudgets, createBudget, updateBudget, deleteBudget } from '../api/budgets.js';

import { sumBy, forecastMonth, round2 } from '../core/metrics.js';

import { el, mount, delegate } from '../ui/dom.js';
import { mountSessionControls, onProfileChange } from '../ui/profile.js';
import { initTheme } from '../ui/theme.js';
import { renderKpiStrip } from '../ui/components/kpi.js';
import { budgetBar } from '../ui/components/budgetBar.js';
import { loadingState, errorState, emptyState } from '../ui/components/emptyState.js';
import { currency, percent, integer, monthFull, providerShort } from '../format.js';

const ESCOPOS = {
  provider: 'Nuvem',
  environment: 'Ambiente',
  subAccountId: 'Conta',
  serviceCategory: 'Categoria de serviço',
};

let dados = null;
let editando = null;   // id em edição, ou null quando é criação

/* ------------------------------------------------------------------ */

async function iniciar() {
  const areas = {
    context: mount('#bud-context'),
    kpis: mount('#bud-kpis'),
    list: mount('#bud-list'),
    form: mount('#bud-form-area'),
  };

  areas.kpis.replaceChildren(loadingState());
  areas.list.replaceChildren(loadingState());

  try {
    const meta = await getMeta();
    const [orcamentos, correntes] = await Promise.all([
      listBudgets(),
      listCharges({ month: meta.currentMonth }),
    ]);

    dados = { meta, orcamentos, correntes };

    areas.context.replaceChildren(
      `${monthFull(meta.currentMonth)} · dia `,
      el('span', { class: 'num', text: String(meta.currentMonthElapsedDays) }),
      ' de ',
      el('span', { class: 'num', text: String(meta.currentMonthTotalDays) }),
      ` · ${meta.currency}`,
    );

    redesenhar(areas);
  } catch (erro) {
    areas.kpis.replaceChildren(errorState(erro, () => iniciar()));
    areas.list.replaceChildren();
  }
}

function redesenhar(areas) {
  // Recalcula consumo e projeção de cada orçamento a partir das cobranças.
  dados.calculados = dados.orcamentos.map(calcular);
  desenharKpis(areas.kpis);
  desenharLista(areas.list, areas);
  desenharFormulario(areas.form, areas);
}

/** Consumo e projeção vêm do dado, não de campo digitado. */
function calcular(orcamento) {
  const { meta, correntes } = dados;
  const linhas = correntes.filter((c) => String(c[orcamento.scopeType]) === String(orcamento.scopeValue));
  const consumed = round2(sumBy(linhas));
  const forecast = forecastMonth(consumed, meta.currentMonthElapsedDays, meta.currentMonthTotalDays);

  return {
    ...orcamento,
    consumed,
    forecast,
    consumedPct: orcamento.amount > 0 ? round2((consumed / orcamento.amount) * 100) : 0,
    forecastPct: orcamento.amount > 0 ? round2((forecast / orcamento.amount) * 100) : 0,
    status: forecast > orcamento.amount ? 'exceeding' : 'ok',
  };
}

/* ------------------------------------------------------------------ */

function desenharKpis(area) {
  const lista = dados.calculados;
  const limite = sumBy(lista, 'amount');
  const consumido = sumBy(lista, 'consumed');
  const projetado = sumBy(lista, 'forecast');
  const estourando = lista.filter((b) => b.status === 'exceeding');

  renderKpiStrip(area, [
    { label: 'Orçamento total', value: limite, meta: `${integer(lista.length)} escopos definidos` },
    {
      label: 'Consumido até hoje',
      value: consumido,
      meta: `${percent(limite > 0 ? (consumido / limite) * 100 : 0)} do orçamento`,
    },
    {
      label: 'Projeção de fechamento',
      value: projetado,
      meta: dados.meta.forecastConfidence === 'low'
        ? `baixa confiança · base de ${dados.meta.forecastBasisDays} dias`
        : `${percent(limite > 0 ? (projetado / limite) * 100 : 0)} do orçamento`,
      tone: dados.meta.forecastConfidence === 'low' ? 'warn' : projetado > limite ? 'alert' : 'gain',
    },
    {
      label: 'Escopos com estouro previsto',
      value: estourando.length,
      format: 'integer',
      meta: estourando.length ? estourando.map((b) => b.name).join(', ') : 'nenhum',
      tone: estourando.length ? 'alert' : 'gain',
    },
  ]);
}

function desenharLista(area, areas) {
  if (dados.calculados.length === 0) {
    area.replaceChildren(emptyState({
      title: 'Nenhum orçamento definido',
      message: 'Crie o primeiro orçamento no formulário ao lado.',
    }));
    return;
  }

  const lista = el('ul', { class: 'budgetlist' }, ...dados.calculados.map((b) => {
    const item = budgetBar(b);
    item.appendChild(el('p', { class: 'budget__actions' },
      el('button', {
        type: 'button', class: 'pager__btn', text: 'Editar',
        dataset: { editar: b.id },
      }),
      el('button', {
        type: 'button', class: 'pager__btn pager__btn--danger', text: 'Excluir',
        dataset: { excluir: b.id },
      }),
      el('span', { class: 'budget__feedback', dataset: { feedback: b.id }, role: 'alert' })));
    return item;
  }));

  // Delegação: dois ouvintes cobrem todos os botões da lista.
  delegate(lista, 'click', '[data-editar]', (_ev, botao) => {
    editando = botao.dataset.editar;
    desenharFormulario(areas.form, areas);
    areas.form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  delegate(lista, 'click', '[data-excluir]', async (_ev, botao) => {
    const id = botao.dataset.excluir;
    const alvo = dados.orcamentos.find((b) => b.id === id);
    if (!window.confirm(`Excluir o orçamento "${alvo.name}"? A ação não pode ser desfeita.`)) return;

    const feedback = lista.querySelector(`[data-feedback="${id}"]`);
    botao.disabled = true;

    try {
      await deleteBudget(id);                       // DELETE
      dados.orcamentos = dados.orcamentos.filter((b) => b.id !== id);
      if (editando === id) editando = null;
      redesenhar(areas);
    } catch (erro) {
      botao.disabled = false;
      if (feedback) feedback.textContent = erro.userMessage ?? 'Falha ao excluir.';
    }
  });

  area.replaceChildren(lista);
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

function desenharFormulario(area, areas) {
  const alvo = editando ? dados.orcamentos.find((b) => b.id === editando) : null;
  const tipoInicial = alvo?.scopeType ?? 'provider';

  const campoNome = el('input', {
    class: 'form__input', type: 'text', id: 'bud-nome',
    value: alvo?.name ?? '', placeholder: 'Produção AWS',
  });
  const erroNome = el('p', { class: 'form__error', id: 'erro-nome', role: 'alert' });

  const campoTipo = el('select', { class: 'form__input', id: 'bud-tipo' },
    ...Object.entries(ESCOPOS).map(([v, rotulo]) =>
      el('option', { value: v, text: rotulo, selected: v === tipoInicial })));

  const campoValor = el('select', { class: 'form__input', id: 'bud-valor' });
  const erroValor = el('p', { class: 'form__error', id: 'erro-valor', role: 'alert' });

  const campoLimite = el('input', {
    class: 'form__input', type: 'number', id: 'bud-limite', min: '1', step: '50',
    value: alvo ? String(alvo.amount) : '', placeholder: '5000',
  });
  const erroLimite = el('p', { class: 'form__error', id: 'erro-limite', role: 'alert' });

  const previa = el('p', { class: 'form__hint' });
  const erroGeral = el('div');

  /** Opções de escopo saem do próprio dado, nunca de lista fixa. */
  function preencherValores() {
    const tipo = campoTipo.value;
    const valores = [...new Set(dados.correntes.map((c) => c[tipo]).filter(Boolean))].sort();
    campoValor.replaceChildren(...valores.map((v) => el('option', {
      value: v,
      text: tipo === 'provider' ? providerShort(v) : v,
      selected: v === alvo?.scopeValue,
    })));
    atualizarPrevia();
  }

  /** Mostra o consumo real do escopo antes de salvar. */
  function atualizarPrevia() {
    const linhas = dados.correntes.filter(
      (c) => String(c[campoTipo.value]) === String(campoValor.value));
    const consumo = round2(sumBy(linhas));
    const limite = Number(campoLimite.value) || 0;
    previa.textContent = limite > 0
      ? `Consumo atual do escopo: ${currency(consumo)} — ${percent((consumo / limite) * 100)} do limite informado.`
      : `Consumo atual do escopo: ${currency(consumo)}.`;
  }

  campoTipo.addEventListener('change', preencherValores);
  campoValor.addEventListener('change', atualizarPrevia);
  campoLimite.addEventListener('input', atualizarPrevia);
  campoNome.addEventListener('input', () => { erroNome.textContent = ''; });

  const botao = el('button', {
    class: 'form__submit', type: 'submit',
    text: alvo ? 'Salvar alterações' : 'Criar orçamento',
  });

  const form = el('form', { class: 'form', novalidate: true },
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'bud-nome', text: 'Nome do orçamento' }),
      campoNome, erroNome),
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'bud-tipo', text: 'Tipo de escopo' }),
      campoTipo),
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'bud-valor', text: 'Escopo' }),
      campoValor, erroValor),
    el('div', { class: 'form__field' },
      el('label', { class: 'form__label', for: 'bud-limite', text: 'Limite mensal (US$)' }),
      campoLimite, erroLimite, previa),
    botao,
    alvo ? el('button', {
      type: 'button', class: 'form__cancel', text: 'Cancelar edição',
      on: { click: () => { editando = null; desenharFormulario(area, areas); } },
    }) : null,
    erroGeral);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();          // sem isto a página recarrega
    erroGeral.replaceChildren();

    const nome = campoNome.value.trim();
    const limite = Number(campoLimite.value);
    let valido = true;

    if (nome.length < 3) {
      erroNome.textContent = 'Informe um nome com ao menos 3 caracteres.';
      valido = false;
    }
    if (!campoValor.value) {
      erroValor.textContent = 'Selecione um escopo.';
      valido = false;
    }
    if (!limite || limite <= 0) {
      erroLimite.textContent = 'Informe um limite maior que zero.';
      valido = false;
    }
    if (!valido) return;

    const corpo = {
      name: nome,
      provider: campoTipo.value === 'provider' ? campoValor.value : (alvo?.provider ?? 'Multicloud'),
      scopeType: campoTipo.value,
      scopeValue: campoValor.value,
      period: dados.meta.currentMonth,
      amount: limite,
      alertThresholdPct: alvo?.alertThresholdPct ?? 80,
    };

    botao.disabled = true;
    botao.textContent = 'Salvando…';

    try {
      if (alvo) {
        const salvo = await updateBudget(alvo.id, { ...corpo, id: alvo.id });   // PUT
        dados.orcamentos = dados.orcamentos.map((b) => (b.id === alvo.id ? salvo : b));
        editando = null;
      } else {
        const criado = await createBudget(corpo);                              // POST
        dados.orcamentos = [...dados.orcamentos, criado];
      }
      redesenhar(areas);
    } catch (erro) {
      erroGeral.replaceChildren(errorState(erro));
      botao.disabled = false;
      botao.textContent = alvo ? 'Salvar alterações' : 'Criar orçamento';
    }
  });

  area.replaceChildren(
    el('h3', { class: 'form__title', text: alvo ? `Editando: ${alvo.name}` : 'Novo orçamento' }),
    form);

  preencherValores();
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const controles = document.querySelector('#session-controls');
  if (controles) mountSessionControls(controles);
  iniciar();
  onProfileChange(() => iniciar());
});