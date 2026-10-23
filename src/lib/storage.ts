import {
  EncryptedVaultEnvelope,
  EncryptedVaultEnvelopeSchema
} from '@/types';

export const VAULT_STORAGE_KEY = 'vaultguard_encrypted_envelope_v1';

// In-memory fallback used only in Vitest/Node unit tests when chrome.storage.local is absent
let memoryStore: Record<string, unknown> = {};

function hasChromeStorage(): boolean {
  return (
    typeof globalThis.chrome !== 'undefined' &&
    Boolean(globalThis.chrome?.storage?.local)
  );
}

/**
 * Reads the encrypted vault envelope from `chrome.storage.local`.
 * Validates structure with Zod before returning.
 */
export async function loadEncryptedVaultEnvelope(): Promise<EncryptedVaultEnvelope | null> {
  let rawValue: unknown;

  if (hasChromeStorage()) {
    const result = await globalThis.chrome.storage.local.get(VAULT_STORAGE_KEY);
    rawValue = result[VAULT_STORAGE_KEY];
  } else {
    rawValue = memoryStore[VAULT_STORAGE_KEY];
  }

  if (!rawValue) {
    return null;
  }

  const parsed = EncryptedVaultEnvelopeSchema.safeParse(rawValue);
  if (!parsed.success) {
    throw new Error('Stored vault envelope is corrupted or invalid');
  }

  return parsed.data;
}

/**
 * Persists an EncryptedVaultEnvelope to `chrome.storage.local`.
 * Enforces schema validation so plaintext or malformed objects can NEVER be written.
 */
export async function saveEncryptedVaultEnvelope(envelope: EncryptedVaultEnvelope): Promise<void> {
  const validated = EncryptedVaultEnvelopeSchema.parse(envelope);

  if (hasChromeStorage()) {
    await globalThis.chrome.storage.local.set({
      [VAULT_STORAGE_KEY]: validated
    });
  } else {
    memoryStore[VAULT_STORAGE_KEY] = validated;
  }
}

/**
 * Clears the stored encrypted vault (only used in tests or explicit factory reset).
 */
export async function clearStoredVaultEnvelope(): Promise<void> {
  if (hasChromeStorage()) {
    await globalThis.chrome.storage.local.remove(VAULT_STORAGE_KEY);
  } else {
    delete memoryStore[VAULT_STORAGE_KEY];
  }
}

/**
 * Parses and validates an exported JSON string into an EncryptedVaultEnvelope.
 */
export function parseExportedVaultJson(jsonText: string): EncryptedVaultEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file format');
  }
  const result = EncryptedVaultEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('File does not match VaultGuard Encrypted Envelope v1 schema');
  }
  return result.data;
}
