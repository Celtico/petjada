import { el } from './dom';

export interface SheetOptions {
  title?: string;
  body: HTMLElement;
  closeLabel: string;
  /** Contenidor on muntar-lo; per defecte `document.body`. */
  parent?: HTMLElement;
}

/** Sheet inferior modal. Es resol en tancar-lo. */
export function openSheet(options: SheetOptions): Promise<void> {
  return new Promise((resolve) => {
    const close = () => {
      overlay.remove();
      resolve();
    };
    const sheet = el(
      'div',
      { className: 'sheet sheet--modal' },
      el('div', { className: 'sheet__handle' }),
      options.title ? el('h2', { text: options.title }) : null,
      options.body,
      el('div', { style: { marginTop: '16px' } }, el('button', { className: 'btn btn--secondary btn--block', text: options.closeLabel, onClick: close })),
    );
    const overlay = el(
      'div',
      {
        className: 'sheet-overlay',
        onClick: (event) => {
          if (event.target === overlay) close();
        },
      },
      sheet,
    );
    (options.parent ?? document.body).append(overlay);
  });
}
