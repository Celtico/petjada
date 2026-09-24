import { el } from './dom';

type ToastKind = 'info' | 'success' | 'accent' | 'error';

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container) {
    container = el('div', { className: 'toast-container' });
    document.body.append(container);
  }
  return container;
}

const DEFAULT_DURATION_MS = 2600;

export function toast(message: string, kind: ToastKind = 'info', durationMs = DEFAULT_DURATION_MS): void {
  const node = el('div', { className: `toast toast--${kind}`, text: message });
  getContainer().append(node);
  window.setTimeout(() => {
    node.style.transition = 'opacity 0.25s';
    node.style.opacity = '0';
    window.setTimeout(() => node.remove(), 260);
  }, durationMs);
}
