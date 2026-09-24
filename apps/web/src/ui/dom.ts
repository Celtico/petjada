/** Petites utilitats per crear DOM sense framework. */

type Child = Node | string | null | undefined | false;

type Attrs<K extends keyof HTMLElementTagNameMap> = Partial<{
  className: string;
  id: string;
  type: string;
  text: string;
  html: string;
  disabled: boolean;
  hidden: boolean;
  value: string;
  placeholder: string;
  title: string;
  src: string;
  alt: string;
  href: string;
  for: string;
  min: string;
  max: string;
  step: string;
  checked: boolean;
  autocomplete: string;
  inputmode: string;
  rows: number;
  dataset: Record<string, string>;
  style: Partial<CSSStyleDeclaration>;
  onClick: (event: MouseEvent) => void;
  onInput: (event: Event) => void;
  onChange: (event: Event) => void;
  onSubmit: (event: SubmitEvent) => void;
}> & { tag?: K };

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.className) node.className = attrs.className;
  if (attrs.id) node.id = attrs.id;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.html !== undefined) node.innerHTML = attrs.html;
  if (attrs.title) node.title = attrs.title;
  if (attrs.hidden) node.hidden = true;
  if (attrs.dataset) for (const [k, v] of Object.entries(attrs.dataset)) node.dataset[k] = v;
  if (attrs.style) Object.assign(node.style, attrs.style);
  if (attrs.onClick) node.addEventListener('click', attrs.onClick as EventListener);
  if (attrs.onInput) node.addEventListener('input', attrs.onInput);
  if (attrs.onChange) node.addEventListener('change', attrs.onChange);
  if (attrs.onSubmit) node.addEventListener('submit', attrs.onSubmit as EventListener);

  if (node instanceof HTMLButtonElement) {
    node.type = (attrs.type as 'button' | 'submit' | 'reset' | undefined) ?? 'button';
    if (attrs.disabled) node.disabled = true;
  }
  if (node instanceof HTMLInputElement) {
    if (attrs.type) node.type = attrs.type;
    if (attrs.value !== undefined) node.value = attrs.value;
    if (attrs.placeholder) node.placeholder = attrs.placeholder;
    if (attrs.min !== undefined) node.min = attrs.min;
    if (attrs.max !== undefined) node.max = attrs.max;
    if (attrs.step !== undefined) node.step = attrs.step;
    if (attrs.checked !== undefined) node.checked = attrs.checked;
    if (attrs.autocomplete) node.autocomplete = attrs.autocomplete as AutoFill;
    if (attrs.inputmode) node.inputMode = attrs.inputmode;
    if (attrs.disabled) node.disabled = true;
  }
  if (node instanceof HTMLTextAreaElement) {
    if (attrs.value !== undefined) node.value = attrs.value;
    if (attrs.placeholder) node.placeholder = attrs.placeholder;
    if (attrs.rows) node.rows = attrs.rows;
  }
  if (node instanceof HTMLImageElement) {
    if (attrs.src) node.src = attrs.src;
    node.alt = attrs.alt ?? '';
  }
  if (node instanceof HTMLAnchorElement && attrs.href) node.href = attrs.href;
  if (node instanceof HTMLLabelElement && attrs.for) node.htmlFor = attrs.for;

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Com `replaceChildren`, però accepta `null`/`false` (s'ignoren). */
export function setChildren(node: HTMLElement, ...children: Child[]): void {
  node.replaceChildren(
    ...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false),
  );
}

export function button(
  label: string,
  onClick: (event: MouseEvent) => void,
  className = 'btn',
): HTMLButtonElement {
  return el('button', { className, text: label, onClick });
}
