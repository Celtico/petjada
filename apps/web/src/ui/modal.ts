import { el } from './dom';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

/** Diàleg de confirmació propi (no fem servir `confirm()`). */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };
    const overlay = el(
      'div',
      { className: 'modal' },
      el(
        'div',
        { className: 'modal__box' },
        el('h2', { text: options.title }),
        options.message ? el('p', { text: options.message }) : null,
        el(
          'div',
          { className: 'actions' },
          el('button', {
            className: 'btn btn--secondary btn--block',
            text: options.cancelLabel,
            onClick: () => close(false),
          }),
          el('button', {
            className: `btn btn--block ${options.danger ? 'btn--danger' : ''}`,
            text: options.confirmLabel,
            onClick: () => close(true),
          }),
        ),
      ),
    );
    document.body.append(overlay);
  });
}

export interface InfoOptions {
  title: string;
  lines: string[];
  okLabel: string;
}

export function infoDialog(options: InfoOptions): Promise<void> {
  return new Promise((resolve) => {
    const overlay = el(
      'div',
      { className: 'modal' },
      el(
        'div',
        { className: 'modal__box' },
        el('h2', { text: options.title }),
        ...options.lines.map((line) => el('p', { text: line })),
        el(
          'div',
          { className: 'actions' },
          el('button', {
            className: 'btn btn--block',
            text: options.okLabel,
            onClick: () => {
              overlay.remove();
              resolve();
            },
          }),
        ),
      ),
    );
    document.body.append(overlay);
  });
}
