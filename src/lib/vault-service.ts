import {
  AutofillCredentialMatch,
  CredentialEntry,
  DecryptedVaultPayload,
  EncryptedVaultEnvelope,
  ExtensionMessage,
  MessageResponseMap,
  NewCredentialInput,
  NewCredentialInputSchema,
  VaultSettings,
  VaultSettingsSchema,
  VaultStatus
} from '@/types';
import {
  deriveMasterKey,
  generateSalt,
  PBKDF2_ITERATIONS,
  sealVaultPayload,
  unlockVaultEnvelope
} from './crypto';
import { extractNormalizedDomain, isDomainMatchForAutofill } from './domain';
import {
  loadEncryptedVaultEnvelope,
  saveEncryptedVaultEnvelope
} from './storage';

interface ActiveVaultSession {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  payload: DecryptedVaultPayload;
  unlockedUntil: number;
}

const DEFAULT_SETTINGS: VaultSettings = {
  autoLockMinutes: 15,
  enableAutofillPrompt: true,
  enableAutoSavePrompt: true
};

export class VaultBackgroundController {
  private session: ActiveVaultSession | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private onAutoLockCallback?: () => void;

  constructor(onAutoLock?: () => void) {
    this.onAutoLockCallback = onAutoLock;
  }

  /**
   * Immediately wipes the in-memory CryptoKey, salt bytes, and decrypted entries.
   */
  public lockVault(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.session) {
      // Zero-fill salt buffer in memory
      this.session.salt.fill(0);
      // Overwrite decrypted passwords in memory before dropping reference
      for (const entry of this.session.payload.entries) {
        entry.password = '';
        entry.notes = '';
        entry.totpSecret = undefined;
      }
      this.session = null;
    }
  }

  /**
   * Refreshes the inactivity timeout timer whenever the user interacts with the unlocked vault.
   */
  private touchSessionTimer(): void {
    if (!this.session) return;

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    const durationMs = this.session.payload.settings.autoLockMinutes * 60 * 1000;
    this.session.unlockedUntil = Date.now() + durationMs;

    this.inactivityTimer = setTimeout(() => {
      this.lockVault();
      this.onAutoLockCallback?.();
    }, durationMs);
  }

  /**
   * Checks whether the session has expired due to wall-clock time (e.g., MV3 service worker wake).
   */
  private ensureSessionFresh(): boolean {
    if (!this.session) {
      return false;
    }
    if (Date.now() >= this.session.unlockedUntil) {
      this.lockVault();
      return false;
    }
    return true;
  }

  /**
   * Seals and persists the current in-memory vault payload with a fresh 96-bit IV.
   */
  private async persistCurrentSession(): Promise<EncryptedVaultEnvelope> {
    if (!this.session) {
      throw new Error('Cannot persist while vault is locked');
    }

    this.session.payload.lastModified = Date.now();
    const envelope = await sealVaultPayload(
      this.session.payload,
      this.session.key,
      this.session.salt,
      this.session.iterations
    );

    await saveEncryptedVaultEnvelope(envelope);
    return envelope;
  }

  public async getVaultStatus(): Promise<VaultStatus> {
    const isUnlocked = this.ensureSessionFresh();
    const storedEnvelope = await loadEncryptedVaultEnvelope();

    return {
      isInitialized: storedEnvelope !== null,
      isUnlocked,
      entryCount: isUnlocked && this.session ? this.session.payload.entries.length : 0,
      autoLockMinutes:
        isUnlocked && this.session
          ? this.session.payload.settings.autoLockMinutes
          : DEFAULT_SETTINGS.autoLockMinutes,
      unlockedUntil: isUnlocked && this.session ? this.session.unlockedUntil : null
    };
  }

  public async initializeVault(masterPassword: string): Promise<VaultStatus> {
    if (!masterPassword || masterPassword.trim().length < 8) {
      throw new Error('Master password must be at least 8 characters');
    }

    const salt = generateSalt();
    const iterations = PBKDF2_ITERATIONS;
    const key = await deriveMasterKey(masterPassword, salt, iterations);

    const initialPayload: DecryptedVaultPayload = {
      version: 1,
      entries: [],
      settings: { ...DEFAULT_SETTINGS },
      lastModified: Date.now()
    };

    const envelope = await sealVaultPayload(initialPayload, key, salt, iterations);
    await saveEncryptedVaultEnvelope(envelope);

    this.session = {
      key,
      salt,
      iterations,
      payload: initialPayload,
      unlockedUntil: Date.now() + DEFAULT_SETTINGS.autoLockMinutes * 60 * 1000
    };
    this.touchSessionTimer();

    return this.getVaultStatus();
  }

  public async unlockVault(masterPassword: string): Promise<VaultStatus> {
    const envelope = await loadEncryptedVaultEnvelope();
    if (!envelope) {
      throw new Error('NOT_INITIALIZED');
    }

    try {
      const { payload, key, salt, iterations } = await unlockVaultEnvelope(
        envelope,
        masterPassword
      );

      this.session = {
        key,
        salt,
        iterations,
        payload,
        unlockedUntil: Date.now() + payload.settings.autoLockMinutes * 60 * 1000
      };
      this.touchSessionTimer();

      return this.getVaultStatus();
    } catch {
      throw new Error('INVALID_PASSWORD');
    }
  }

  /**
   * Returns credentials strictly matching the active tab's eTLD+1 domain.
   */
  public getCredentialsForUrl(activeTabUrl: string): {
    isLocked: boolean;
    matches: AutofillCredentialMatch[];
  } {
    if (!this.ensureSessionFresh() || !this.session) {
      return { isLocked: true, matches: [] };
    }

    this.touchSessionTimer();

    const matches: AutofillCredentialMatch[] = [];
    for (const entry of this.session.payload.entries) {
      if (isDomainMatchForAutofill(entry.url, activeTabUrl)) {
        matches.push({
          id: entry.id,
          title: entry.title,
          username: entry.username,
          password: entry.password,
          domain: entry.domain,
          url: entry.url
        });
      }
    }

    return {
      isLocked: false,
      matches
    };
  }

  public async saveCredential(input: NewCredentialInput): Promise<CredentialEntry> {
    if (!this.ensureSessionFresh() || !this.session) {
      throw new Error('VAULT_LOCKED');
    }

    const parsed = NewCredentialInputSchema.parse(input);
    const domain = extractNormalizedDomain(parsed.url);
    if (!domain) {
      throw new Error('Invalid URL or domain');
    }

    const now = Date.now();
    // Check if an existing credential with identical domain + username exists to update it
    const existingIndex = this.session.payload.entries.findIndex(
      (item) =>
        item.domain === domain &&
        item.username.toLowerCase() === parsed.username.toLowerCase()
    );

    let savedEntry: CredentialEntry;
    if (existingIndex !== -1) {
      const existing = this.session.payload.entries[existingIndex];
      savedEntry = {
        ...existing,
        title: parsed.title || existing.title,
        url: parsed.url,
        domain,
        username: parsed.username,
        password: parsed.password,
        notes: parsed.notes ?? existing.notes,
        totpSecret: parsed.totpSecret ?? existing.totpSecret,
        favorite: parsed.favorite ?? existing.favorite,
        updatedAt: now
      };
      this.session.payload.entries[existingIndex] = savedEntry;
    } else {
      savedEntry = {
        id: globalThis.crypto.randomUUID(),
        title: parsed.title,
        url: parsed.url,
        domain,
        username: parsed.username,
        password: parsed.password,
        notes: parsed.notes ?? '',
        totpSecret: parsed.totpSecret,
        favorite: parsed.favorite ?? false,
        createdAt: now,
        updatedAt: now
      };
      this.session.payload.entries.unshift(savedEntry);
    }

    await this.persistCurrentSession();
    this.touchSessionTimer();
    return savedEntry;
  }

  public async updateCredential(
    id: string,
    updates: Partial<NewCredentialInput>
  ): Promise<CredentialEntry> {
    if (!this.ensureSessionFresh() || !this.session) {
      throw new Error('VAULT_LOCKED');
    }

    const index = this.session.payload.entries.findIndex((e) => e.id === id);
    if (index === -1) {
      throw new Error('Credential not found');
    }

    const current = this.session.payload.entries[index];
    const nextUrl = updates.url !== undefined ? updates.url : current.url;
    const nextDomain = extractNormalizedDomain(nextUrl);
    if (!nextDomain) {
      throw new Error('Invalid URL or domain');
    }

    const updated: CredentialEntry = {
      ...current,
      title: updates.title !== undefined ? updates.title : current.title,
      url: nextUrl,
      domain: nextDomain,
      username: updates.username !== undefined ? updates.username : current.username,
      password: updates.password !== undefined ? updates.password : current.password,
      notes: updates.notes !== undefined ? updates.notes : current.notes,
      totpSecret: updates.totpSecret !== undefined ? updates.totpSecret : current.totpSecret,
      favorite: updates.favorite !== undefined ? updates.favorite : current.favorite,
      updatedAt: Date.now()
    };

    this.session.payload.entries[index] = updated;
    await this.persistCurrentSession();
    this.touchSessionTimer();
    return updated;
  }

  public async deleteCredential(id: string): Promise<{ deletedId: string }> {
    if (!this.ensureSessionFresh() || !this.session) {
      throw new Error('VAULT_LOCKED');
    }

    const prevLen = this.session.payload.entries.length;
    this.session.payload.entries = this.session.payload.entries.filter((e) => e.id !== id);
    if (this.session.payload.entries.length === prevLen) {
      throw new Error('Credential not found');
    }

    await this.persistCurrentSession();
    this.touchSessionTimer();
    return { deletedId: id };
  }

  public listAllCredentials(searchQuery?: string, tabUrl?: string): {
    entries: CredentialEntry[];
    matchedForTab: CredentialEntry[];
    settings: VaultSettings;
  } {
    if (!this.ensureSessionFresh() || !this.session) {
      throw new Error('VAULT_LOCKED');
    }

    this.touchSessionTimer();

    const query = (searchQuery || '').trim().toLowerCase();
    const allEntries = this.session.payload.entries;

    const filtered = query
      ? allEntries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(query) ||
            entry.domain.toLowerCase().includes(query) ||
            entry.username.toLowerCase().includes(query) ||
            entry.url.toLowerCase().includes(query)
        )
      : [...allEntries];

    const matchedForTab = tabUrl
      ? allEntries.filter((entry) => isDomainMatchForAutofill(entry.url, tabUrl))
      : [];

    return {
      entries: filtered,
      matchedForTab,
      settings: { ...this.session.payload.settings }
    };
  }

  public async exportEncryptedVault(): Promise<EncryptedVaultEnvelope> {
    const envelope = await loadEncryptedVaultEnvelope();
    if (!envelope) {
      throw new Error('NOT_INITIALIZED');
    }
    return envelope;
  }

  public async importEncryptedVault(
    envelope: EncryptedVaultEnvelope,
    masterPassword: string
  ): Promise<VaultStatus> {
    try {
      const { payload, key, salt, iterations } = await unlockVaultEnvelope(
        envelope,
        masterPassword
      );

      // Re-seal with a fresh IV before persisting locally
      const freshEnvelope = await sealVaultPayload(payload, key, salt, iterations);
      await saveEncryptedVaultEnvelope(freshEnvelope);

      this.session = {
        key,
        salt,
        iterations,
        payload,
        unlockedUntil: Date.now() + payload.settings.autoLockMinutes * 60 * 1000
      };
      this.touchSessionTimer();

      return this.getVaultStatus();
    } catch {
      throw new Error('INVALID_PASSWORD');
    }
  }

  public async updateSettings(partial: Partial<VaultSettings>): Promise<VaultSettings> {
    if (!this.ensureSessionFresh() || !this.session) {
      throw new Error('VAULT_LOCKED');
    }

    const merged = VaultSettingsSchema.parse({
      ...this.session.payload.settings,
      ...partial
    });

    this.session.payload.settings = merged;
    await this.persistCurrentSession();
    this.touchSessionTimer();

    return merged;
  }

  /**
   * Central message dispatcher with sender origin verification.
   */
  public async handleMessage<M extends ExtensionMessage>(
    message: M,
    senderUrl?: string
  ): Promise<MessageResponseMap[M['type']]> {
    try {
      switch (message.type) {
        case 'QUERY_VAULT_STATUS': {
          const status = await this.getVaultStatus();
          return { ok: true, data: status } as MessageResponseMap[M['type']];
        }

        case 'INITIALIZE_VAULT': {
          const status = await this.initializeVault(message.payload.masterPassword);
          return { ok: true, data: status } as MessageResponseMap[M['type']];
        }

        case 'UNLOCK_VAULT': {
          const status = await this.unlockVault(message.payload.masterPassword);
          return { ok: true, data: status } as MessageResponseMap[M['type']];
        }

        case 'LOCK_VAULT': {
          this.lockVault();
          const status = await this.getVaultStatus();
          return { ok: true, data: status } as MessageResponseMap[M['type']];
        }

        case 'REQUEST_CREDENTIALS': {
          // Security: If invoked from a content script tab, enforce the browser-verified sender tab URL
          // rather than trusting an arbitrary URL string in the payload.
          const verifiedUrl =
            senderUrl && /^https?:\/\//i.test(senderUrl)
              ? senderUrl
              : message.payload.tabUrl;

          const result = this.getCredentialsForUrl(verifiedUrl);
          return { ok: true, data: result } as MessageResponseMap[M['type']];
        }

        case 'SAVE_CREDENTIALS': {
          // If sent from content script, ensure the saved URL matches the sender's actual tab eTLD+1
          if (
            senderUrl &&
            /^https?:\/\//i.test(senderUrl) &&
            !isDomainMatchForAutofill(message.payload.url, senderUrl)
          ) {
            return {
              ok: false,
              error: 'Origin mismatch between content script tab and credential URL',
              code: 'VALIDATION_ERROR'
            } as MessageResponseMap[M['type']];
          }

          const saved = await this.saveCredential(message.payload);
          return { ok: true, data: saved } as MessageResponseMap[M['type']];
        }

        case 'UPDATE_CREDENTIAL': {
          const updated = await this.updateCredential(
            message.payload.id,
            message.payload.updates
          );
          return { ok: true, data: updated } as MessageResponseMap[M['type']];
        }

        case 'DELETE_CREDENTIAL': {
          const deleted = await this.deleteCredential(message.payload.id);
          return { ok: true, data: deleted } as MessageResponseMap[M['type']];
        }

        case 'LIST_ALL_CREDENTIALS': {
          const listed = this.listAllCredentials(
            message.payload?.searchQuery,
            message.payload?.tabUrl
          );
          return { ok: true, data: listed } as MessageResponseMap[M['type']];
        }

        case 'EXPORT_ENCRYPTED_VAULT': {
          const envelope = await this.exportEncryptedVault();
          return { ok: true, data: envelope } as MessageResponseMap[M['type']];
        }

        case 'IMPORT_ENCRYPTED_VAULT': {
          const status = await this.importEncryptedVault(
            message.payload.envelope,
            message.payload.masterPassword
          );
          return { ok: true, data: status } as MessageResponseMap[M['type']];
        }

        case 'UPDATE_SETTINGS': {
          const settings = await this.updateSettings(message.payload);
          return { ok: true, data: settings } as MessageResponseMap[M['type']];
        }

        default:
          return {
            ok: false,
            error: 'Unsupported message type',
            code: 'VALIDATION_ERROR'
          } as MessageResponseMap[M['type']];
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected vault error';
      if (msg === 'VAULT_LOCKED') {
        return {
          ok: false,
          error: 'Vault is currently locked. Unlock with your Master Password first.',
          code: 'VAULT_LOCKED'
        } as MessageResponseMap[M['type']];
      }
      if (msg === 'INVALID_PASSWORD') {
        return {
          ok: false,
          error: 'Incorrect Master Password or corrupted vault.',
          code: 'INVALID_PASSWORD'
        } as MessageResponseMap[M['type']];
      }
      if (msg === 'NOT_INITIALIZED') {
        return {
          ok: false,
          error: 'Vault has not been initialized yet.',
          code: 'NOT_INITIALIZED'
        } as MessageResponseMap[M['type']];
      }

      return {
        ok: false,
        error: msg,
        code: 'INTERNAL_ERROR'
      } as MessageResponseMap[M['type']];
    }
  }
}
