import { z } from 'zod';

export const CredentialEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  domain: z.string().min(1), // normalized eTLD+1 or hostname for local/IP
  username: z.string(),
  password: z.string(),
  notes: z.string().optional().default(''),
  totpSecret: z.string().optional(),
  favorite: z.boolean().optional().default(false),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
});

export type CredentialEntry = z.infer<typeof CredentialEntrySchema>;

export const NewCredentialInputSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  username: z.string(),
  password: z.string(),
  notes: z.string().optional().default(''),
  totpSecret: z.string().optional(),
  favorite: z.boolean().optional().default(false)
});

export type NewCredentialInput = z.infer<typeof NewCredentialInputSchema>;

export const VaultSettingsSchema = z.object({
  autoLockMinutes: z.number().int().min(1).max(240).default(15),
  enableAutofillPrompt: z.boolean().default(true),
  enableAutoSavePrompt: z.boolean().default(true)
});

export type VaultSettings = z.infer<typeof VaultSettingsSchema>;

export const DecryptedVaultPayloadSchema = z.object({
  version: z.literal(1),
  entries: z.array(CredentialEntrySchema),
  settings: VaultSettingsSchema,
  lastModified: z.number().int().nonnegative()
});

export type DecryptedVaultPayload = z.infer<typeof DecryptedVaultPayloadSchema>;

/**
 * Option A (Full Zero-Knowledge Encrypted Blob):
 * The entire DecryptedVaultPayload JSON is encrypted with AES-256-GCM.
 * Key is derived via PBKDF2-HMAC-SHA256 (600,000 iterations) with a unique 16-byte random Salt.
 * Every write generates a fresh 12-byte (96-bit) cryptographically random IV.
 */
export const EncryptedVaultEnvelopeSchema = z.object({
  format: z.literal('vaultguard-encrypted-v1'),
  kdf: z.object({
    algorithm: z.literal('PBKDF2-SHA256'),
    iterations: z.number().int().min(600000),
    saltBase64: z.string().min(16)
  }),
  cipher: z.object({
    algorithm: z.literal('AES-256-GCM'),
    ivBase64: z.string().min(12),
    ciphertextBase64: z.string().min(1)
  }),
  updatedAt: z.number().int().nonnegative()
});

export type EncryptedVaultEnvelope = z.infer<typeof EncryptedVaultEnvelopeSchema>;

export interface VaultStatus {
  isInitialized: boolean;
  isUnlocked: boolean;
  entryCount: number;
  autoLockMinutes: number;
  unlockedUntil: number | null;
}

/**
 * Safe summary returned to Content Script for matching domain autofill
 */
export interface AutofillCredentialMatch {
  id: string;
  title: string;
  username: string;
  password: string;
  domain: string;
  url: string;
}
