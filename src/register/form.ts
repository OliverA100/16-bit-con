/**
 * The Register form's behaviour: validation with our own messages (the form is `novalidate`, so every
 * browser looks the same), the submit's short "Registering" beat, and the swap to the success state.
 *
 * When a field is checked:
 * - never while someone is typing in it for the first time;
 * - when they leave it, if they typed in it;
 * - on submit, every field, and focus moves to the first invalid one;
 * - once it shows an error, on every input, so the error clears the moment the value is valid.
 * Each field keeps its 20 px message line whether or not it shows one, so nothing ever moves.
 */

export type FieldName = 'name' | 'email' | 'pass';

export const MESSAGES = {
  name: 'Enter your name.',
  emailEmpty: 'Enter your email address.',
  emailInvalid: 'Enter a valid email address, like name@example.com.',
  pass: 'Choose a pass.',
} as const;

/** something@something.something, no spaces: never rejects a valid address like name+tag@sub.example.co.uk */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The name: trimmed, at least 2 characters (code points, so any script counts), any letters or marks. */
export function checkName(value: string): string {
  return [...value.trim()].length >= 2 ? '' : MESSAGES.name;
}

export function checkEmail(value: string): string {
  const v = value.trim();
  if (!v) return MESSAGES.emailEmpty;
  return EMAIL.test(v) ? '' : MESSAGES.emailInvalid;
}

/** What the success state needs from a valid submit. */
export interface Registration {
  name: string;
  email: string;
  pass: string;
  passLabel: string;
  passMeta: string;
  news: boolean;
}

export interface FormHooks {
  /** Show the success state for this registration (the form has stepped out by then). */
  onRegistered(r: Registration): void | Promise<void>;
}

/** How long "Registering" shows before the success state: a beat, as if it went somewhere. */
const REGISTERING_MS = 600;

export interface RegisterFormApi {
  /** Clear every field, message and the "typed in" marks. */
  reset(): void;
  focusFirst(): void;
}

export function initRegisterForm(hooks: FormHooks): RegisterFormApi | null {
  const form = document.getElementById('register-form') as HTMLFormElement | null;
  const win = document.getElementById('register');
  if (!form || !win) return null;

  const field = (name: FieldName) => form.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const msg = (name: FieldName) => field(name).querySelector<HTMLElement>('.field__msg')!;
  const input = (name: 'name' | 'email') => form.elements.namedItem(name) as HTMLInputElement;
  const radios = () => [...form.querySelectorAll<HTMLInputElement>('input[name="pass"]')];
  const submit = form.querySelector<HTMLButtonElement>('[data-register-submit]')!;
  const submitText = submit.querySelector<HTMLElement>('.register__submit-text')!;

  const validators: Record<FieldName, () => string> = {
    name: () => checkName(input('name').value),
    email: () => checkEmail(input('email').value),
    pass: () => (radios().some((r) => r.checked) ? '' : MESSAGES.pass),
  };
  const names = Object.keys(validators) as FieldName[];
  /** Typed in since the last reset: a field is only checked on leaving it once it has been. */
  const dirty = new Set<FieldName>();

  const show = (name: FieldName, message: string) => {
    const wrap = field(name);
    const was = wrap.dataset.invalid === 'true';
    wrap.dataset.invalid = message ? 'true' : 'false';
    const el = msg(name);
    if (!message) {
      // an error appears and clears at once: no motion
      el.replaceChildren();
    } else if (el.dataset.text !== message || !was) {
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = 'Error: ';
      // the "!" in pixel blocks, like every icon (a 2 px bar and its dot in the 14 px square)
      const bang = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      bang.setAttribute('class', 'field__bang');
      bang.setAttribute('viewBox', '0 0 14 14');
      bang.setAttribute('width', '14');
      bang.setAttribute('height', '14');
      bang.setAttribute('shape-rendering', 'crispEdges');
      bang.setAttribute('aria-hidden', 'true');
      bang.innerHTML = '<rect width="14" height="14" class="field__bang-box"/><path d="M6 3h2v5H6zM6 10h2v2H6z"/>';
      const text = document.createElement('span');
      text.textContent = message;
      el.replaceChildren(sr, bang, text);
    }
    el.dataset.text = message;
    const targets: HTMLInputElement[] = name === 'pass' ? radios() : [input(name)];
    for (const t of targets) {
      if (message) t.setAttribute('aria-invalid', 'true');
      else t.removeAttribute('aria-invalid');
    }
  };

  const validate = (name: FieldName) => {
    const message = validators[name]();
    show(name, message);
    return !message;
  };

  for (const name of ['name', 'email'] as const) {
    const el = input(name);
    el.addEventListener('input', () => {
      dirty.add(name);
      if (field(name).dataset.invalid === 'true') validate(name);
    });
    el.addEventListener('blur', () => {
      if (name === 'email' && el.value !== el.value.trim()) el.value = el.value.trim();
      if (dirty.has(name)) validate(name);
    });
  }
  // a pass is chosen in one go: re-check only once the group shows its error
  field('pass').addEventListener('change', () => {
    if (field('pass').dataset.invalid === 'true') validate('pass');
  });

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const results = names.map((name) => [name, validate(name)] as const);
    const firstInvalid = results.find(([, ok]) => !ok);
    if (firstInvalid) {
      const [name] = firstInvalid;
      const target = name === 'pass' ? radios()[0]! : input(name);
      target.focus();
      return;
    }
    busy = true;
    submit.setAttribute('aria-disabled', 'true');
    submitText.textContent = 'Registering';
    await new Promise((r) => setTimeout(r, REGISTERING_MS));
    const picked = radios().find((r) => r.checked)!.closest('.option')!;
    const registration: Registration = {
      name: input('name').value.trim(),
      email: input('email').value.trim(),
      pass: radios().find((r) => r.checked)!.value,
      passLabel: picked.querySelector('.option__label')?.textContent ?? '',
      passMeta: picked.querySelector('.option__meta')?.textContent ?? '',
      news: (form.elements.namedItem('news') as HTMLInputElement).checked,
    };
    submit.removeAttribute('aria-disabled');
    submitText.textContent = 'Register now';
    busy = false;
    await hooks.onRegistered(registration);
  });

  // aria-disabled keeps the button focusable while it waits; a click on it then does nothing
  submit.addEventListener('click', (e) => {
    if (busy) e.preventDefault();
  });

  return {
    reset() {
      form.reset();
      dirty.clear();
      for (const name of names) show(name, '');
    },
    focusFirst() {
      input('name').focus({ preventScroll: true });
    },
  };
}
