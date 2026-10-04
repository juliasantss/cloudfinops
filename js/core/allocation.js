/**
 * Alocação de custo.
 *
 * Responde à pergunta que dá sentido à governança de tags: de quem é esse
 * gasto? E, principalmente, quanto dele não é de ninguém.
 *
 * Módulo puro: não toca no DOM e não faz requisição.
 */

import { REQUIRED_TAG_KEYS, ALLOCATION_TAG_KEY } from '../config.js';
import { isAllocatable, missingRequiredTags } from './focus.js';
import { round2, sumBy, aggregate } from './metrics.js';

/**
 * Distribui o custo entre os valores de uma chave de tag.
 *
 * Recursos sem a chave caem em um grupo próprio, rotulado explicitamente.
 * Diluir esse valor entre os demais esconderia o problema — e o problema é
 * justamente o que a tela de governança existe para mostrar.
 *
 * @param {Array<object>} recursos  itens com tags e monthlyCost
 * @param {string} chave            chave de tag, por exemplo 'OwnerTeam'
 * @returns {Array<{key, total, count, share, isUnassigned}>}
 */
export function allocateByTag(recursos, chave = ALLOCATION_TAG_KEY) {
  const grupos = aggregate(
    recursos,
    (r) => r.tags?.[chave] || '__sem_tag__',
    'monthlyCost',
  );

  return grupos.map((g) => ({
    ...g,
    key: g.key === '__sem_tag__' ? `Sem ${chave}` : g.key,
    isUnassigned: g.key === '__sem_tag__',
  }));
}

/**
 * Custo que não pode ser cobrado de nenhuma equipe.
 *
 * Depende apenas de OwnerTeam. Environment e ManagedBy medem qualidade de
 * inventário, não atribuição — por isso os três recortes se sobrepõem e
 * não somam o total.
 *
 * @returns {{cost, pct, resourceCount, totalCost}}
 */
export function unallocatedCost(recursos) {
  const total = sumBy(recursos, 'monthlyCost');
  const semDono = recursos.filter((r) => !isAllocatable(r.tags));
  const custo = sumBy(semDono, 'monthlyCost');

  return {
    cost: round2(custo),
    pct: total > 0 ? round2((custo / total) * 100) : 0,
    resourceCount: semDono.length,
    totalCost: round2(total),
  };
}

/**
 * Panorama de conformidade das três chaves obrigatórias.
 * @returns {Array<{key, resourcesWithTag, resourcesTotal, compliancePct, untaggedCost}>}
 */
export function complianceByKey(recursos) {
  return REQUIRED_TAG_KEYS.map((chave) => {
    const com = recursos.filter((r) => Boolean(r.tags?.[chave]));
    const sem = recursos.filter((r) => !r.tags?.[chave]);

    return {
      key: chave,
      resourcesWithTag: com.length,
      resourcesTotal: recursos.length,
      compliancePct: recursos.length ? round2((com.length / recursos.length) * 100) : 0,
      untaggedCost: round2(sumBy(sem, 'monthlyCost')),
    };
  });
}

/**
 * Recursos fora de conformidade, ordenados por custo.
 *
 * A ordenação por custo é o que transforma um relatório de auditoria em uma
 * fila de trabalho: corrigir primeiro o que custa mais.
 *
 * @param {Array<object>} recursos
 * @param {number} limite
 */
export function nonCompliantResources(recursos, limite = 10) {
  return recursos
    .filter((r) => missingRequiredTags(r.tags).length > 0)
    .map((r) => ({ ...r, missingTags: missingRequiredTags(r.tags) }))
    .sort((a, b) => b.monthlyCost - a.monthlyCost)
    .slice(0, limite);
}

/**
 * Conformidade geral: recursos com as três tags obrigatórias.
 * @returns {{compliant, total, pct}}
 */
export function overallCompliance(recursos) {
  const conformes = recursos.filter((r) => missingRequiredTags(r.tags).length === 0).length;

  return {
    compliant: conformes,
    total: recursos.length,
    pct: recursos.length ? round2((conformes / recursos.length) * 100) : 0,
  };
}