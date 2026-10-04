/**
 * Diretório de usuários da demonstração.
 *
 * IMPORTANTE: não há senha armazenada e não há verificação de credencial.
 * Esta coleção existe para associar uma pessoa a um perfil de visualização.
 * Autenticação real — hash de senha, token assinado, sessão no servidor —
 * exige backend e pertence ao Projeto 1.2.
 */

import { get } from './client.js';

/** Todos os usuários cadastrados. */
export function listUsers() {
  return get('/users');
}

/**
 * Busca por e-mail exato.
 * @returns {object|null} o usuário, ou null se não houver
 */
export async function findUserByEmail(email) {
  const encontrados = await get('/users', { email: email.trim().toLowerCase() });
  return Array.isArray(encontrados) && encontrados.length > 0 ? encontrados[0] : null;
}