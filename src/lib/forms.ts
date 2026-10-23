export interface DetectedCredentialForm {
  container: HTMLElement;
  usernameInput: HTMLInputElement | null;
  passwordInput: HTMLInputElement;
  isRegistration: boolean;
}

const USERNAME_AUTOCOMPLETE_VALUES = new Set(['username', 'email']);
const USERNAME_KEYWORD_REGEX = /(user|usr|email|e-mail|login|account|acct|identifier|id|phone|mobile)/i;
const IGNORED_TEXT_INPUT_REGEX = /(search|query|q|coupon|promo|captcha|otp|totp|code|token|csrf)/i;

/**
 * Checks whether an input element is visible and interactive in the DOM.
 */
export function isInputVisibleAndInteractive(input: HTMLInputElement): boolean {
  if (!input.isConnected || input.disabled || input.readOnly) {
    return false;
  }
  if (input.type === 'hidden') {
    return false;
  }

  const style = window.getComputedStyle(input);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    parseFloat(style.opacity || '1') === 0
  ) {
    return false;
  }

  const rect = input.getBoundingClientRect();
  return rect.width > 10 && rect.height > 10;
}

/**
 * Recursively collects all `<input>` elements across standard DOM and open Shadow DOM roots.
 */
export function collectAllInputsDeep(root: Document | ShadowRoot | Element = document): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = [];

  const walk = (node: Document | ShadowRoot | Element) => {
    const localInputs = node.querySelectorAll('input');
    for (const input of Array.from(localInputs)) {
      inputs.push(input);
    }

    const allElements = node.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      if (el.shadowRoot) {
        walk(el.shadowRoot);
      }
    }
  };

  walk(root);
  return inputs;
}

/**
 * Evaluates whether a candidate text/email input is likely a username/email field.
 */
export function scoreUsernameCandidate(input: HTMLInputElement): number {
  const type = (input.getAttribute('type') || 'text').toLowerCase();
  if (!['text', 'email', 'tel'].includes(type)) {
    return -1;
  }
  if (!isInputVisibleAndInteractive(input)) {
    return -1;
  }

  const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase().trim();
  if (USERNAME_AUTOCOMPLETE_VALUES.has(autocomplete)) {
    return 100;
  }

  const combinedAttributes = [
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute('aria-label') || '',
    input.getAttribute('data-testid') || ''
  ].join(' ');

  if (IGNORED_TEXT_INPUT_REGEX.test(combinedAttributes)) {
    return -1;
  }

  let score = 0;
  if (type === 'email') score += 50;
  if (USERNAME_KEYWORD_REGEX.test(combinedAttributes)) score += 40;
  if (type === 'text') score += 10;

  return score;
}

/**
 * Finds the best matching username/email input associated with a given password input.
 */
export function findAssociatedUsernameInput(
  passwordInput: HTMLInputElement,
  allInputs: HTMLInputElement[]
): HTMLInputElement | null {
  const container: Element =
    passwordInput.form ||
    passwordInput.closest('[role="form"], [data-form], form, main, section, div') ||
    document.body;

  const passwordIndex = allInputs.indexOf(passwordInput);
  const candidates: Array<{ input: HTMLInputElement; score: number }> = [];

  for (let i = 0; i < allInputs.length; i++) {
    const candidate = allInputs[i];
    if (candidate === passwordInput) continue;

    // Prefer inputs that appear before the password field in DOM order
    const isBefore = passwordIndex === -1 || i < passwordIndex;
    const sharesContainer = container.contains(candidate) || candidate.form === passwordInput.form;

    if (!sharesContainer && !isBefore) continue;

    let score = scoreUsernameCandidate(candidate);
    if (score < 0) continue;

    if (sharesContainer) score += 25;
    if (isBefore && passwordIndex !== -1 && passwordIndex - i <= 4) {
      score += 20 - (passwordIndex - i) * 3;
    }

    candidates.push({ input: candidate, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.input ?? null;
}

/**
 * Detects all active login/registration forms in the current document (including open Shadow DOMs).
 */
export function detectCredentialForms(root: Document | ShadowRoot | Element = document): DetectedCredentialForm[] {
  const allInputs = collectAllInputsDeep(root);
  const passwordInputs = allInputs.filter(
    (input) => input.type === 'password' && isInputVisibleAndInteractive(input)
  );

  const detectedForms: DetectedCredentialForm[] = [];
  const seenContainers = new Set<HTMLElement>();

  for (const passwordInput of passwordInputs) {
    const container =
      (passwordInput.form as HTMLElement | null) ||
      (passwordInput.closest('[role="form"], form, section, div') as HTMLElement | null) ||
      document.body;

    if (seenContainers.has(container) && container !== document.body) {
      continue;
    }
    seenContainers.add(container);

    const usernameInput = findAssociatedUsernameInput(passwordInput, allInputs);
    const autocomplete = (passwordInput.getAttribute('autocomplete') || '').toLowerCase();
    const isRegistration = autocomplete === 'new-password';

    detectedForms.push({
      container,
      usernameInput,
      passwordInput,
      isRegistration
    });
  }

  return detectedForms;
}

/**
 * Sets an `<input>` element's value in a framework-compatible way (React, Vue, Angular, Svelte)
 * by invoking the native `HTMLInputElement.prototype.value` setter and dispatching input/change events.
 */
export function setNativeInputValue(input: HTMLInputElement, value: string): boolean {
  if (!input.isConnected || input.disabled || input.readOnly) {
    return false;
  }

  input.focus();

  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));

  return true;
}

/**
 * Injects username and password into a detected credential form.
 */
export function fillCredentialIntoForm(
  form: DetectedCredentialForm,
  username: string,
  password: string
): boolean {
  if (!form.passwordInput.isConnected) {
    return false;
  }

  if (form.usernameInput && form.usernameInput.isConnected && username) {
    setNativeInputValue(form.usernameInput, username);
  }

  return setNativeInputValue(form.passwordInput, password);
}
