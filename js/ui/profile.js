/**
 * Perfil de visualização e sessão de demonstração.
 *
 * O perfil condiciona densidade de informação e exibição de detalhe técnico.
 * É uma preferência de exibição, NÃO controle de acesso: nada aqui impede
 * ninguém de ver nada. Autorização por papel é o Projeto 1.2.
 */

import { VIEW_PROFILES, DEFAULT_PROFILE, PROFILE_STORAGE_KEY } from '../config.js';
import { el, delegate } from './dom.js';

const SESSION_KEY = 'cloudfinops:session';

/* ------------------------------------------------------------------ */
/* Sessão                                                              */
/* ------------------------------------------------------------------ */

/** Grava a sessão de demonstração. */
export function startSession(usuario, perfil) {
  const sessao = {
    userId: usuario.id,
    name: usuario.name,
    email: usuario.email,
    jobTitle: usuario.jobTitle,
    team: usuario.team,
    profile: perfil ?? usuario.profile ?? DEFAULT_PROFILE,
    startedAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
  localStorage.setItem(PROFILE_STORAGE_KEY, sessao.profile);
  return sessao;
}

/** Sessão atual, ou null. */
export function getSession() {
  try {
    const bruto = localStorage.getItem(SESSION_KEY);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function endSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PROFILE_STORAGE_KEY);
}

/* ------------------------------------------------------------------ */
/* Perfil                                                              */
/* ------------------------------------------------------------------ */

/** Identificador do perfil ativo. */
export function getProfileId() {
  const salvo = localStorage.getItem(PROFILE_STORAGE_KEY);
  return salvo && VIEW_PROFILES[salvo] ? salvo : DEFAULT_PROFILE;
}

/** Configuração completa do perfil ativo. */
export function getProfile() {
  return VIEW_PROFILES[getProfileId()];
}

/** Troca o perfil e avisa quem estiver ouvindo. */
export function setProfile(id) {
  if (!VIEW_PROFILES[id]) return;
  localStorage.setItem(PROFILE_STORAGE_KEY, id);

  const sessao = getSession();
  if (sessao) {
    sessao.profile = id;
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
  }

  window.dispatchEvent(new CustomEvent('profile:change', { detail: { profile: id } }));
}

/** Registra um ouvinte para troca de perfil. Devolve a função que o remove. */
export function onProfileChange(handler) {
  const ouvinte = (ev) => handler(ev.detail.profile);
  window.addEventListener('profile:change', ouvinte);
  return () => window.removeEventListener('profile:change', ouvinte);
}

/* ------------------------------------------------------------------ */
/* Controle no cabeçalho                                               */
/* ------------------------------------------------------------------ */

/**
 * Monta, na barra superior, o seletor de perfil e a identificação da sessão.
 * Sem sessão, oferece o acesso.
 */
export function mountSessionControls(container) {
  const sessao = getSession();

  if (!sessao) {
    container.replaceChildren(
      el('a', { class: 'session__link', href: 'login.html', text: 'Acessar' }),
    );
    return;
  }

  const seletor = el('select', {
    class: 'session__select',
    'aria-label': 'Perfil de visualização',
    on: {
      // Evento `change` em campo de seleção.
      change: (ev) => setProfile(ev.target.value),
    },
  }, ...Object.entries(VIEW_PROFILES).map(([id, cfg]) =>
    el('option', { value: id, text: cfg.label, selected: id === getProfileId() })));

  container.replaceChildren(
    el('span', { class: 'session__user' },
      el('span', { class: 'session__name', text: sessao.name }),
      el('span', { class: 'session__role', text: sessao.jobTitle })),
    seletor,
    el('button', {
      type: 'button',
      class: 'session__exit',
      text: 'Sair',
      on: {
        click: () => {
          endSession();
          window.location.href = 'login.html';
        },
      },
    }),
  );
}