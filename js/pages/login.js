/**
 * Tela de acesso — seleção de perfil de visualização.
 *
 * DECLARAÇÃO IMPORTANTE, repetida na interface e no README:
 * esta tela NÃO autentica. Não há senha armazenada, não há verificação de
 * credencial, não há token. Ela valida o formato dos dados, confirma que o
 * e-mail existe no diretório e aplica um perfil de exibição.
 *
 * Autenticação real — hash de senha com bcrypt, token JWT assinado,
 * proteção de rota no servidor — é o Projeto 1.2 e exige backend.
 *
 * O que esta tela exercita de fato: submissão de formulário com
 * `preventDefault`, validação em tempo real no evento `input`, `change` em
 * campo de seleção e apresentação de erro na interface.
 */

import { findUserByEmail, listUsers } from '../api/users.js';
import { startSession, getSession } from '../ui/profile.js';
import { el, mount, delegate } from '../ui/dom.js';
import { errorState } from '../ui/components/emptyState.js';
import { VIEW_PROFILES, DEFAULT_PROFILE } from '../config.js';

const MIN_SENHA = 6;
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let perfilEscolhido = DEFAULT_PROFILE;

/* ------------------------------------------------------------------ */

function iniciar() {
  const form = mount('#login-form');
  const campoEmail = mount('#login-email');
  const campoSenha = mount('#login-senha');
  const erroEmail = mount('#erro-email');
  const erroSenha = mount('#erro-senha');
  const erroGeral = mount('#login-erro');
  const botao = mount('#login-submit');
  const perfis = mount('#login-perfis');
  const descricao = mount('#login-perfil-desc');
  const atalhos = mount('#login-atalhos');

  // Já havia sessão? Oferece continuar em vez de pedir tudo de novo.
  const sessao = getSession();
  if (sessao) {
    campoEmail.value = sessao.email;
    erroGeral.replaceChildren(el('p', { class: 'form__hint' },
      `Sessão ativa como ${sessao.name}. `,
      el('a', { href: 'dashboard.html', text: 'Ir para o painel' })));
  }

  desenharPerfis(perfis, descricao);
  carregarAtalhos(atalhos, campoEmail);

  /* --- Validação em tempo real --- */

  campoEmail.addEventListener('input', () => {
    limparErro(campoEmail, erroEmail);
  });

  campoSenha.addEventListener('input', () => {
    limparErro(campoSenha, erroSenha);
  });

  // `blur` valida o formato assim que a pessoa sai do campo, sem esperar
  // o envio — erro cedo custa menos que erro depois.
  campoEmail.addEventListener('blur', () => {
    const valor = campoEmail.value.trim();
    if (valor && !FORMATO_EMAIL.test(valor)) {
      marcarErro(campoEmail, erroEmail, 'Formato de e-mail inválido.');
    }
  });

  /* --- Envio --- */

  form.addEventListener('submit', async (evento) => {
    // Sem isto o navegador recarrega a página e perde tudo.
    evento.preventDefault();

    erroGeral.replaceChildren();
    const email = campoEmail.value.trim().toLowerCase();
    const senha = campoSenha.value;

    let valido = true;

    if (!email) {
      marcarErro(campoEmail, erroEmail, 'Informe o e-mail corporativo.');
      valido = false;
    } else if (!FORMATO_EMAIL.test(email)) {
      marcarErro(campoEmail, erroEmail, 'Formato de e-mail inválido.');
      valido = false;
    }

    if (!senha) {
      marcarErro(campoSenha, erroSenha, 'Informe a senha.');
      valido = false;
    } else if (senha.length < MIN_SENHA) {
      marcarErro(campoSenha, erroSenha, `A senha precisa de ao menos ${MIN_SENHA} caracteres.`);
      valido = false;
    }

    if (!valido) {
      // Leva o foco ao primeiro campo com erro.
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Verificando…';

    try {
      const usuario = await findUserByEmail(email);

      if (!usuario) {
        marcarErro(campoEmail, erroEmail, 'E-mail não encontrado no diretório.');
        campoEmail.focus();
        return;
      }

      startSession(usuario, perfilEscolhido);
      window.location.href = 'dashboard.html';
    } catch (erro) {
      erroGeral.replaceChildren(errorState(erro, () => form.requestSubmit()));
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });
}

/* ------------------------------------------------------------------ */
/* Perfis                                                              */
/* ------------------------------------------------------------------ */

function desenharPerfis(container, descricao) {
  const opcoes = Object.entries(VIEW_PROFILES);

  container.replaceChildren(...opcoes.map(([id, cfg]) => el('label', {
    class: `profile-option${id === perfilEscolhido ? ' is-active' : ''}`,
    dataset: { profile: id },
  },
  el('input', {
    type: 'radio',
    name: 'perfil',
    value: id,
    class: 'sr-only',
    checked: id === perfilEscolhido,
  }),
  el('span', { class: 'profile-option__label', text: cfg.label }))));

  atualizarDescricao(descricao);

  // Delegação: um ouvinte cobre todas as opções.
  delegate(container, 'change', 'input[name="perfil"]', (_ev, input) => {
    perfilEscolhido = input.value;
    for (const label of container.querySelectorAll('.profile-option')) {
      label.classList.toggle('is-active', label.dataset.profile === perfilEscolhido);
    }
    atualizarDescricao(descricao);
  });
}

function atualizarDescricao(node) {
  node.textContent = VIEW_PROFILES[perfilEscolhido].description;
}

/* ------------------------------------------------------------------ */
/* Atalhos de demonstração                                             */
/* ------------------------------------------------------------------ */

/**
 * Lista os usuários do diretório para que ninguém precise adivinhar um
 * e-mail válido durante a apresentação.
 */
async function carregarAtalhos(container, campoEmail) {
  try {
    const usuarios = await listUsers();

    container.replaceChildren(
      el('p', { class: 'form__hint', text: 'Contas de demonstração — clique para preencher:' }),
      el('ul', { class: 'demo-users' }, ...usuarios.map((u) => el('li', {},
        el('button', {
          type: 'button',
          class: 'demo-users__btn',
          dataset: { email: u.email },
        },
        el('span', { class: 'demo-users__name', text: u.name }),
        el('span', { class: 'demo-users__role', text: `${u.jobTitle} · ${u.email}` }))))),
    );

    delegate(container, 'click', '[data-email]', (_ev, botao) => {
      campoEmail.value = botao.dataset.email;
      campoEmail.dispatchEvent(new Event('input'));
      mount('#login-senha').focus();
    });
  } catch {
    // A ausência dos atalhos não impede o acesso: o campo continua aberto.
    container.replaceChildren(el('p', {
      class: 'form__hint',
      text: 'Diretório indisponível. Informe o e-mail manualmente.',
    }));
  }
}

/* ------------------------------------------------------------------ */
/* Erros de campo                                                      */
/* ------------------------------------------------------------------ */

function marcarErro(campo, destino, mensagem) {
  campo.setAttribute('aria-invalid', 'true');
  destino.textContent = mensagem;
}

function limparErro(campo, destino) {
  campo.removeAttribute('aria-invalid');
  destino.textContent = '';
}

/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', iniciar);