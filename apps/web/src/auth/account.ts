import { LOGIN_CODE_LENGTH } from '@petjada/shared';
import { ApiError } from '../api/client';
import { t } from '../i18n/ca';
import { el } from '../ui/dom';
import { loadingView, page } from '../ui/layout';
import { router } from '../ui/router';
import type { Screen } from '../ui/router';
import { toast } from '../ui/toast';
import { session } from './session';

function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return t.auth.errors[error.code] ?? error.message;
  return t.app.genericError;
}

/** Bloc "crea un compte" per a convidats: email → codi de 6 xifres. */
function guestBlock(onDone: () => void): HTMLElement {
  const root = el('div', { className: 'card card--static' });
  let email = '';

  function renderEmailStep(): void {
    const input = el('input', { type: 'email', value: email, autocomplete: 'email', inputmode: 'email', placeholder: 'nom@exemple.cat' });
    const error = el('p', { className: 'error hidden' });
    const submit = el('button', { className: 'btn btn--block', text: t.auth.sendLink, type: 'submit' });
    const form = el(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          email = input.value.trim();
          if (!email.includes('@')) {
            error.textContent = t.auth.errors.VALIDATION;
            error.classList.remove('hidden');
            return;
          }
          submit.disabled = true;
          submit.textContent = t.auth.sending;
          try {
            const expiresIn = await session.requestMagicLink(email);
            renderCodeStep(expiresIn);
          } catch (err) {
            error.textContent = authErrorMessage(err);
            error.classList.remove('hidden');
            submit.disabled = false;
            submit.textContent = t.auth.sendLink;
          }
        },
      },
      el('h2', { text: t.auth.guestTitle }),
      el('p', { className: 'hint', text: t.auth.guestIntro }),
      el('div', { className: 'field' }, el('label', { text: t.auth.email }), input),
      error,
      submit,
    );
    root.replaceChildren(form);
  }

  function renderCodeStep(expiresIn: number): void {
    const code = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '······' });
    code.maxLength = LOGIN_CODE_LENGTH;
    code.pattern = `[0-9]{${LOGIN_CODE_LENGTH}}`;
    code.className = 'code-input';
    const error = el('p', { className: 'error hidden' });
    const submit = el('button', { className: 'btn btn--block', text: t.auth.verify, type: 'submit' });
    const form = el(
      'form',
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const value = code.value.replace(/\D/g, '');
          if (value.length !== LOGIN_CODE_LENGTH) {
            error.textContent = t.auth.errors.INVALID_CODE;
            error.classList.remove('hidden');
            return;
          }
          submit.disabled = true;
          submit.textContent = t.auth.verifying;
          try {
            const user = await session.verifyCode(email, value);
            toast(t.auth.welcome(user.displayName), 'success', 4000);
            onDone();
          } catch (err) {
            error.textContent = authErrorMessage(err);
            error.classList.remove('hidden');
            submit.disabled = false;
            submit.textContent = t.auth.verify;
          }
        },
      },
      el('h2', { text: t.auth.checkEmailTitle }),
      el('p', { text: t.auth.checkEmailIntro(email) }),
      el('p', { className: 'hint', text: t.auth.checkEmailHint }),
      el('p', { className: 'hint', text: t.auth.expiresIn(Math.max(1, Math.round(expiresIn / 60))) }),
      el('div', { className: 'field' }, el('label', { text: t.auth.codeLabel }), code),
      error,
      submit,
      el(
        'div',
        { className: 'chip-row', style: { marginTop: '12px' } },
        el('button', {
          className: 'btn btn--ghost',
          text: t.auth.resend,
          onClick: async () => {
            try {
              await session.requestMagicLink(email);
              toast(t.auth.checkEmailTitle, 'info');
            } catch (err) {
              toast(authErrorMessage(err), 'error');
            }
          },
        }),
        el('button', { className: 'btn btn--ghost', text: t.auth.changeEmail, onClick: () => renderEmailStep() }),
      ),
    );
    root.replaceChildren(form);
    code.focus();
  }

  renderEmailStep();
  return root;
}

/** Perfil: àlies, avatar, tancar sessió i esborrar el compte. */
function profileBlock(rerender: () => void): HTMLElement {
  const user = session.user!;
  const name = el('input', { type: 'text', value: user.displayName, autocomplete: 'nickname' });
  const avatar = el('input', { type: 'url', value: user.avatarUrl ?? '', placeholder: 'https://…', inputmode: 'url' });
  const saveBtn = el('button', {
    className: 'btn btn--block',
    text: t.auth.saveProfile,
    onClick: async () => {
      saveBtn.disabled = true;
      try {
        await session.updateProfile(name.value.trim() || user.displayName, avatar.value.trim() || null);
        toast(t.auth.profileSaved, 'success');
      } catch (error) {
        toast(authErrorMessage(error), 'error');
      } finally {
        saveBtn.disabled = false;
      }
    },
  });

  const deleteBox = el('div', { className: 'hidden', style: { marginTop: '12px' } });
  const deleteBtn = el('button', {
    className: 'btn btn--ghost btn--block',
    text: t.auth.deleteAccount,
    onClick: () => {
      deleteBox.classList.toggle('hidden');
    },
  });
  const confirmInput = el('input', { type: 'text', placeholder: t.auth.deleteConfirmWord, autocomplete: 'off' });
  const confirmBtn = el('button', {
    className: 'btn btn--danger btn--block',
    text: t.app.delete,
    disabled: true,
    onClick: async () => {
      confirmBtn.disabled = true;
      try {
        await session.deleteAccount();
        toast(t.auth.deleteDone, 'info');
        rerender();
      } catch (error) {
        toast(authErrorMessage(error), 'error');
        confirmBtn.disabled = false;
      }
    },
  });
  confirmInput.addEventListener('input', () => (confirmBtn.disabled = confirmInput.value.trim() !== t.auth.deleteConfirmWord));
  deleteBox.append(
    el('h3', { text: t.auth.deleteConfirmTitle }),
    el('p', { className: 'hint', text: t.auth.deleteConfirmText }),
    el('div', { className: 'field' }, el('label', { text: t.auth.deleteConfirmType }), confirmInput),
    confirmBtn,
  );

  return el(
    'div',
    { className: 'card card--static' },
    el(
      'div',
      { className: 'profile-head' },
      user.avatarUrl ? el('img', { className: 'avatar', src: user.avatarUrl, alt: '' }) : el('div', { className: 'avatar avatar--placeholder', text: user.displayName.slice(0, 1).toUpperCase() }),
      el('div', {}, el('h2', { text: user.displayName }), el('p', { className: 'hint', text: t.auth.totalPoints(user.totalPoints) })),
    ),
    user.email ? el('p', { className: 'hint', text: `${user.email} · ${t.auth.emailPrivate}` }) : null,
    el('div', { className: 'field' }, el('label', { text: t.auth.displayName }), name, el('span', { className: 'hint', text: t.auth.displayNameHint })),
    el('div', { className: 'field' }, el('label', { text: t.auth.avatarUrl }), avatar),
    saveBtn,
    user.isGuest
      ? null
      : el('button', {
          className: 'btn btn--secondary btn--block',
          style: { marginTop: '12px' },
          text: t.auth.logout,
          onClick: async () => {
            await session.logout();
            toast(t.auth.logoutDone, 'info');
            rerender();
          },
        }),
    el('div', { style: { marginTop: '12px' } }, deleteBtn, deleteBox),
  );
}

export const accountScreen: Screen = (container) => {
  const content = el('div', { className: 'content' });
  container.append(page({ title: t.auth.accountTitle, activePath: '/compte', content }));

  const render = () => {
    const user = session.user;
    if (!user) {
      content.replaceChildren(loadingView());
      return;
    }
    content.replaceChildren(user.isGuest ? guestBlock(render) : el('div'), profileBlock(render));
  };
  render();
  const off = session.subscribe(render);
  return () => off();
};

/** `#/auth/done`: destí de l'enllaç màgic al navegador. Renova la sessió amb la cookie. */
export const authDoneScreen: Screen = async (container) => {
  container.append(el('div', { className: 'centered' }, loadingView()));
  const ok = await session.refresh();
  toast(ok ? t.auth.linkDone : t.auth.linkFailed, ok ? 'success' : 'error', 4000);
  router.navigate(ok ? '/rutes' : '/compte', true);
};
