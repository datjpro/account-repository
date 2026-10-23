import { defineContentScript } from 'wxt/sandbox';
import {
  DetectedCredentialForm,
  detectCredentialForms,
  fillCredentialIntoForm
} from '@/lib/forms';
import { sendVaultMessage } from '@/lib/messaging';
import type { AutofillCredentialMatch } from '@/types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',

  main() {
    if (!/^https?:$/i.test(window.location.protocol)) {
      return;
    }

    const decoratedInputs = new WeakSet<HTMLInputElement>();
    let activeOverlayHost: HTMLElement | null = null;

    function removeActiveOverlay(): void {
      if (activeOverlayHost && activeOverlayHost.isConnected) {
        activeOverlayHost.remove();
      }
      activeOverlayHost = null;
    }

    /**
     * Renders an isolated Shadow DOM autofill popover anchored below the focused input.
     */
    async function showAutofillPopover(
      anchorInput: HTMLInputElement,
      form: DetectedCredentialForm
    ): Promise<void> {
      removeActiveOverlay();

      const response = await sendVaultMessage({
        type: 'REQUEST_CREDENTIALS',
        payload: { tabUrl: window.location.href }
      });

      if (!response.ok) {
        return;
      }

      const { isLocked, matches } = response.data;
      if (!isLocked && matches.length === 0) {
        return;
      }

      const rect = anchorInput.getBoundingClientRect();
      const host = document.createElement('div');
      host.setAttribute('data-vaultguard-overlay', 'true');
      host.style.position = 'fixed';
      host.style.top = `${Math.min(window.innerHeight - 180, rect.bottom + 6)}px`;
      host.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, rect.left))}px`;
      host.style.zIndex = '2147483647';

      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        .vg-card {
          width: 280px;
          background: #0f172a;
          color: #f8fafc;
          border: 1px solid #334155;
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          overflow: hidden;
        }
        .vg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .vg-badge {
          color: #34d399;
          font-weight: 600;
        }
        .vg-list {
          max-height: 180px;
          overflow-y: auto;
        }
        .vg-item {
          display: flex;
          flex-direction: column;
          width: 100%;
          text-align: left;
          padding: 9px 12px;
          background: transparent;
          border: none;
          border-bottom: 1px solid #1e293b;
          color: #f8fafc;
          cursor: pointer;
          transition: background 0.12s ease;
        }
        .vg-item:hover {
          background: #1e293b;
        }
        .vg-title {
          font-weight: 600;
          font-size: 13px;
          color: #f1f5f9;
        }
        .vg-user {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 2px;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .vg-locked {
          padding: 12px;
          color: #cbd5e1;
          font-size: 12px;
          line-height: 1.4;
        }
      `;
      shadow.appendChild(style);

      const card = document.createElement('div');
      card.className = 'vg-card';

      const header = document.createElement('div');
      header.className = 'vg-header';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = 'VaultGuard Autofill';
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'vg-badge';
      badgeSpan.textContent = isLocked ? 'Locked' : `${matches.length} Match${matches.length > 1 ? 'es' : ''}`;
      header.append(titleSpan, badgeSpan);
      card.appendChild(header);

      if (isLocked) {
        const lockedMsg = document.createElement('div');
        lockedMsg.className = 'vg-locked';
        lockedMsg.textContent = 'Vault is locked. Open the VaultGuard extension icon in your toolbar to unlock.';
        card.appendChild(lockedMsg);
      } else {
        const list = document.createElement('div');
        list.className = 'vg-list';

        matches.forEach((cred: AutofillCredentialMatch) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vg-item';

          const t = document.createElement('span');
          t.className = 'vg-title';
          t.textContent = cred.title;

          const u = document.createElement('span');
          u.className = 'vg-user';
          u.textContent = cred.username;

          btn.append(t, u);
          btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fillCredentialIntoForm(form, cred.username, cred.password);
            removeActiveOverlay();
          });

          list.appendChild(btn);
        });

        card.appendChild(list);
      }

      shadow.appendChild(card);
      document.documentElement.appendChild(host);
      activeOverlayHost = host;
    }

    /**
     * Prompts the user with a non-intrusive Shadow DOM banner to save submitted credentials.
     */
    async function showSaveCredentialBanner(
      username: string,
      password: string
    ): Promise<void> {
      const statusRes = await sendVaultMessage({ type: 'QUERY_VAULT_STATUS' });
      if (!statusRes.ok || !statusRes.data.isUnlocked) {
        return;
      }

      removeActiveOverlay();

      const host = document.createElement('div');
      host.setAttribute('data-vaultguard-save-banner', 'true');
      host.style.position = 'fixed';
      host.style.top = '16px';
      host.style.right = '16px';
      host.style.zIndex = '2147483647';

      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        .vg-banner {
          width: 320px;
          background: #0f172a;
          color: #f8fafc;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 16px 40px rgba(2, 6, 23, 0.6);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .vg-banner-title {
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
          margin-bottom: 4px;
        }
        .vg-banner-sub {
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 12px;
          word-break: break-all;
        }
        .vg-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .vg-btn {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .vg-btn-cancel {
          background: #1e293b;
          color: #cbd5e1;
          border-color: #334155;
        }
        .vg-btn-save {
          background: #10b981;
          color: #022c22;
        }
      `;
      shadow.appendChild(style);

      const banner = document.createElement('div');
      banner.className = 'vg-banner';

      const title = document.createElement('div');
      title.className = 'vg-banner-title';
      title.textContent = 'Save credential to VaultGuard?';

      const sub = document.createElement('div');
      sub.className = 'vg-banner-sub';
      sub.textContent = `${username || '(No username)'} @ ${window.location.hostname}`;

      const actions = document.createElement('div');
      actions.className = 'vg-actions';

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'vg-btn vg-btn-cancel';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', () => removeActiveOverlay());

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'vg-btn vg-btn-save';
      saveBtn.textContent = 'Save Encrypted';
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        await sendVaultMessage({
          type: 'SAVE_CREDENTIALS',
          payload: {
            title: document.title || window.location.hostname,
            url: window.location.origin,
            username,
            password,
            notes: '',
            favorite: false
          }
        });
        removeActiveOverlay();
      });

      actions.append(dismissBtn, saveBtn);
      banner.append(title, sub, actions);
      shadow.appendChild(banner);
      document.documentElement.appendChild(host);
      activeOverlayHost = host;
    }

    function bindFormListeners(): void {
      const forms = detectCredentialForms(document);

      for (const form of forms) {
        const targets = [form.usernameInput, form.passwordInput].filter(
          (el): el is HTMLInputElement => el !== null
        );

        for (const input of targets) {
          if (decoratedInputs.has(input)) continue;
          decoratedInputs.add(input);

          input.addEventListener('focus', () => {
            void showAutofillPopover(input, form);
          });
        }

        if (form.container.tagName === 'FORM' && !form.container.hasAttribute('data-vg-bound')) {
          form.container.setAttribute('data-vg-bound', 'true');
          form.container.addEventListener('submit', () => {
            const passwordVal = form.passwordInput.value;
            const usernameVal = form.usernameInput?.value.trim() || '';
            if (passwordVal) {
              void showSaveCredentialBanner(usernameVal, passwordVal);
            }
          });
        }
      }
    }

    // Initial scan
    bindFormListeners();

    // Observe SPA DOM changes
    const observer = new MutationObserver(() => {
      bindFormListeners();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Dismiss popover on outside click or Escape key
    document.addEventListener('mousedown', (e) => {
      if (activeOverlayHost && !activeOverlayHost.contains(e.target as Node)) {
        removeActiveOverlay();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        removeActiveOverlay();
      }
    });

    // Allow Popup UI to trigger immediate autofill on the active tab
    chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
      if (sender.id && sender.id !== chrome.runtime.id) {
        return false;
      }
      if (
        msg &&
        typeof msg === 'object' &&
        (msg as { type?: string }).type === 'FILL_ACTIVE_TAB_CREDENTIAL'
      ) {
        const payload = (msg as { payload?: { username: string; password: string } }).payload;
        if (!payload) {
          sendResponse({ ok: false });
          return false;
        }
        const forms = detectCredentialForms(document);
        if (forms.length > 0) {
          const filled = fillCredentialIntoForm(forms[0], payload.username, payload.password);
          sendResponse({ ok: filled });
        } else {
          sendResponse({ ok: false });
        }
      }
      return false;
    });
  }
});
