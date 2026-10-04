/**
 * Catálogo de preços multicloud.
 *
 * Os preços vêm de um snapshot versionado em `db.json`, não de consulta ao
 * vivo. Motivo técnico declarado em docs/data-contract.md: a Retail Prices
 * API da Azure é pública, mas AWS exige assinatura SigV4 e Google exige
 * chave de API — e chave em código de front-end é falha de segurança.
 * Consulta ao vivo às três nuvens depende de servidor: Projeto 1.2.
 */

import { get } from './client.js';

export function listPriceCatalog(filtros = {}) {
  return get('/priceCatalog', filtros);
}

/** Preços de uma família de recurso equivalente entre nuvens. */
export function listPricesByFamily(family) {
  return get('/priceCatalog', { family });
}