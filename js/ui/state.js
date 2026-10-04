/**
 * Estado compartilhado da página.
 *
 * Um objeto observável minúsculo. Quem muda o estado não sabe quem desenha;
 * quem desenha não sabe quem mudou. Evita que cada filtro precise conhecer
 * todos os blocos que dependem dele.
 */

/**
 * @param {object} inicial
 * @returns {{get, set, subscribe}}
 */
export function createStore(inicial = {}) {
  let estado = { ...inicial };
  const ouvintes = new Set();

  return {
    /** Lê o estado atual, ou uma chave específica. */
    get(chave) {
      return chave === undefined ? { ...estado } : estado[chave];
    },

    /** Altera o estado e avisa os inscritos. */
    set(mudancas) {
      const anterior = estado;
      estado = { ...estado, ...mudancas };
      for (const ouvinte of ouvintes) ouvinte(estado, anterior);
    },

    /** Registra um ouvinte. Devolve a função que o remove. */
    subscribe(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}