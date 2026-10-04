/**
 * Criação de elementos DOM.
 *
 * Todos os componentes da aplicação montam a interface com `createElement` e
 * `appendChild`. Nenhum usa `innerHTML`.
 *
 * Isso não é purismo: `innerHTML` com dado vindo de API é vetor de injeção, e
 * o navegador precisa reinterpretar a string inteira a cada atualização.
 * `textContent` escapa o conteúdo por natureza.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Cria um elemento com atributos e filhos.
 *
 *   el('div', { class: 'kpi' },
 *      el('span', { class: 'kpi__label', text: 'Custo' }),
 *      el('span', { class: 'kpi__value num', text: 'US$ 8.420' }))
 *
 * Atributos especiais:
 *   text     define textContent
 *   class    define className
 *   dataset  objeto de data-attributes
 *   on       objeto de ouvintes: { click: fn }
 *   style    objeto de estilos inline
 *
 * @param {string} tag
 * @param {object} atributos
 * @param {...(Node|string|null|undefined|false)} filhos
 * @returns {HTMLElement}
 */
export function el(tag, atributos = {}, ...filhos) {
  const node = document.createElement(tag);
  aplicarAtributos(node, atributos);
  anexar(node, filhos);
  return node;
}

/** Mesma assinatura de `el`, para elementos SVG. */
export function svg(tag, atributos = {}, ...filhos) {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'text') node.textContent = String(valor);
    else if (chave === 'class') node.setAttribute('class', valor);
    else node.setAttribute(chave, String(valor));
  }

  anexar(node, filhos);
  return node;
}

function aplicarAtributos(node, atributos) {
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;

    if (chave === 'text') {
      node.textContent = String(valor);
    } else if (chave === 'class') {
      node.className = valor;
    } else if (chave === 'dataset') {
      Object.assign(node.dataset, valor);
    } else if (chave === 'style') {
      Object.assign(node.style, valor);
    } else if (chave === 'on') {
      for (const [evento, ouvinte] of Object.entries(valor)) {
        node.addEventListener(evento, ouvinte);
      }
    } else if (chave in node && typeof node[chave] !== 'object') {
      node[chave] = valor;
    } else {
      node.setAttribute(chave, String(valor));
    }
  }
}

function anexar(node, filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    node.appendChild(typeof filho === 'object' ? filho : document.createTextNode(String(filho)));
  }
}

/** Fragmento, para inserir vários nós numa única operação de layout. */
export function fragment(...filhos) {
  const frag = document.createDocumentFragment();
  anexar(frag, filhos);
  return frag;
}

/** Remove todos os filhos de um elemento. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Substitui o conteúdo de um elemento por novos filhos. */
export function replace(node, ...filhos) {
  clear(node);
  anexar(node, filhos);
  return node;
}

/** Atalho para `document.querySelector`, com erro claro quando não acha. */
export function mount(seletor) {
  const node = document.querySelector(seletor);
  if (!node) throw new Error(`Elemento não encontrado: ${seletor}`);
  return node;
}

/**
 * Delegação de evento: um único ouvinte no contêiner atende todos os filhos,
 * inclusive os criados depois. Evita registrar e remover ouvintes a cada
 * redesenho da lista.
 *
 *   delegate(tabela, 'click', '[data-id]', (ev, alvo) => { ... })
 */
export function delegate(container, evento, seletor, handler) {
  container.addEventListener(evento, (ev) => {
    const alvo = ev.target.closest(seletor);
    if (alvo && container.contains(alvo)) handler(ev, alvo);
  });
  return container;
}