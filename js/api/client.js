/**
 * Cliente HTTP do CloudFinOps.
 *
 * Toda comunicação com a API passa por aqui. Centralizar significa que
 * timeout, verificação de resposta e tradução de erro são escritos uma vez
 * e valem para a aplicação inteira.
 *
 * Este módulo NÃO toca no DOM. Ele lança erro; quem decide como mostrar é a
 * camada de interface. Essa separação é a regra que organiza o projeto:
 * `api/` e `core/` nunca manipulam elementos, `ui/` nunca faz requisição.
 */

import { API_BASE, REQUEST_TIMEOUT, RETRY_ATTEMPTS } from '../config.js';

/**
 * Erro de API com informação suficiente para a interface decidir o que dizer.
 *
 * `kind` distingue as três situações que exigem mensagens diferentes:
 *   network  — servidor fora do ar ou sem rede
 *   timeout  — servidor demorou demais
 *   http     — servidor respondeu, mas com status de erro
 */
export class ApiError extends Error {
  constructor(message, { kind, status = null, url = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.url = url;
    this.cause = cause;
  }

  /** Mensagem pronta para exibição ao usuário, em português. */
  get userMessage() {
    if (this.kind === 'network') {
      return 'Não foi possível falar com a API. Verifique se o json-server está em execução.';
    }
    if (this.kind === 'timeout') {
      return 'A API demorou demais para responder.';
    }
    if (this.status === 404) {
      return 'O recurso solicitado não existe.';
    }
    if (this.status >= 500) {
      return 'A API respondeu com erro interno.';
    }
    return `A API recusou a requisição (status ${this.status}).`;
  }

  /** Erro de rede ou timeout vale nova tentativa; 404 não vale. */
  get isRetryable() {
    return this.kind === 'network' || this.kind === 'timeout' || this.status >= 500;
  }
}

/**
 * Converte um objeto em query string compatível com o json-server.
 * Valores nulos, indefinidos ou vazios são descartados.
 *
 * buildQuery({ month: '2026-07', provider: 'AWS', _limit: 10 })
 *   => '?month=2026-07&provider=AWS&_limit=10'
 */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [chave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined || valor === '') continue;
    if (Array.isArray(valor)) {
      valor.forEach((v) => search.append(chave, v));
    } else {
      search.append(chave, valor);
    }
  }

  const texto = search.toString();
  return texto ? `?${texto}` : '';
}

/**
 * Executa uma requisição com limite de tempo.
 * O AbortController é o que permite desistir: sem ele, uma API travada
 * deixaria a interface carregando para sempre.
 */
async function fetchComTimeout(url, options) {
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), REQUEST_TIMEOUT);

  try {
    return await fetch(url, { ...options, signal: controlador.signal });
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new ApiError(`Timeout após ${REQUEST_TIMEOUT} ms`, {
        kind: 'timeout', url, cause: erro,
      });
    }
    throw new ApiError('Falha de rede', { kind: 'network', url, cause: erro });
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Núcleo do cliente: monta a URL, envia, verifica o status e devolve o JSON.
 *
 * `fetch` só rejeita em falha de rede — uma resposta 404 ou 500 chega como
 * sucesso. Por isso a verificação de `response.ok` é obrigatória, e é o erro
 * mais comum em quem está começando com a Fetch API.
 */
async function request(caminho, { method = 'GET', body = null, params = null, retry = true } = {}) {
  const url = `${API_BASE}${caminho}${params ? buildQuery(params) : ''}`;

  const options = { method, headers: {} };
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const tentativas = retry && method === 'GET' ? RETRY_ATTEMPTS : 1;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const resposta = await fetchComTimeout(url, options);

      if (!resposta.ok) {
        throw new ApiError(`HTTP ${resposta.status} em ${method} ${url}`, {
          kind: 'http', status: resposta.status, url,
        });
      }

      // 204 No Content não tem corpo para interpretar.
      if (resposta.status === 204) return null;

      const texto = await resposta.text();
      if (!texto) return null;

      try {
        return JSON.parse(texto);
      } catch (erro) {
        throw new ApiError('A resposta não é um JSON válido', {
          kind: 'http', status: resposta.status, url, cause: erro,
        });
      }
    } catch (erro) {
      ultimoErro = erro instanceof ApiError
        ? erro
        : new ApiError(erro.message, { kind: 'network', url, cause: erro });

      const ultimaChance = tentativa === tentativas;
      if (ultimaChance || !ultimoErro.isRetryable) throw ultimoErro;

      // Espera crescente entre tentativas: 300 ms, 600 ms, ...
      await new Promise((r) => setTimeout(r, 300 * tentativa));
    }
  }

  throw ultimoErro;
}

/** GET — leitura. Repete automaticamente em falha temporária. */
export function get(caminho, params = null) {
  return request(caminho, { method: 'GET', params });
}

/** POST — criação. Nunca repete: repetir criaria registro duplicado. */
export function post(caminho, body) {
  return request(caminho, { method: 'POST', body, retry: false });
}

/** PUT — substituição completa do registro. */
export function put(caminho, body) {
  return request(caminho, { method: 'PUT', body, retry: false });
}

/** PATCH — alteração parcial, usada para mudar status. */
export function patch(caminho, body) {
  return request(caminho, { method: 'PATCH', body, retry: false });
}

/** DELETE — remoção. */
export function del(caminho) {
  return request(caminho, { method: 'DELETE', retry: false });
}

/**
 * Verifica se a API está no ar, sem lançar erro.
 * Útil para exibir o estado da conexão no cabeçalho.
 */
export async function healthCheck() {
  try {
    await get('/meta');
    return { online: true, error: null };
  } catch (erro) {
    return { online: false, error: erro };
  }
}