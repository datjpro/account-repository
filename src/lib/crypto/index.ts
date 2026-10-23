import {
  DecryptedVaultPayload,
  DecryptedVaultPayloadSchema,
  EncryptedVaultEnvelope,
  EncryptedVaultEnvelopeSchema
} from '@/types';

export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTE_LENGTH = 16; // 128-bit salt
export const IV_BYTE_LENGTH = 12;   // 96-bit IV (NIST recommendation for AES-GCM)
export const KEY_BIT_LENGTH = 256;  // AES-256-GCM

/**
 * Converts a Uint8Array to a Base64 string safely without call stack overflow.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string back to a Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates cryptographically secure random bytes.
 */
export function generateRandomBytes(byteLength: number): Uint8Array {
  const buffer = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
}

/**
 * Generates a fresh 16-byte (128-bit) random salt.
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_BYTE_LENGTH);
}

/**
 * Generates a fresh 12-byte (96-bit) random Initialization Vector (IV) for AES-GCM.
 */
export function generateIv(): Uint8Array {
  return generateRandomBytes(IV_BYTE_LENGTH);
}

/**
 * Derives a non-extractable AES-256-GCM CryptoKey from a Master Password and Salt
 * using PBKDF2-HMAC-SHA256 with at least 600,000 iterations.
 */
export async function deriveMasterKey(
  masterPassword: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  if (!masterPassword || masterPassword.length === 0) {
    throw new Error('Master password must not be empty');
  }
  if (iterations < PBKDF2_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${PBKDF2_ITERATIONS}`);
  }
  if (salt.byteLength < SALT_BYTE_LENGTH) {
    throw new Error(`Salt must be at least ${SALT_BYTE_LENGTH} bytes`);
  }

  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(masterPassword);

  try {
    const baseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      passwordBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    const derivedKey = await globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: KEY_BIT_LENGTH
      },
      false, // Non-extractable key in memory
      ['encrypt', 'decrypt']
    );

    return derivedKey;
  } finally {
    // Best-effort zero-fill temporary password byte buffer
    passwordBytes.fill(0);
  }
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a unique 96-bit IV.
 */
export async function encryptWithKey(
  plaintext: string,
  key: CryptoKey
): Promise<{ ivBase64: string; ciphertextBase64: string }> {
  const iv = generateIv();
  const encoder = new TextEncoder();
  const encodedPlaintext = encoder.encode(plaintext);

  try {
    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128
      },
      key,
      encodedPlaintext
    );

    return {
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(ciphertextBuffer))
    };
  } finally {
    encodedPlaintext.fill(0);
  }
}

/**
 * Decrypts an AES-256-GCM payload using the provided CryptoKey and 96-bit IV.
 */
export async function decryptWithKey(
  ciphertextBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  const iv = base64ToBytes(ivBase64);
  if (iv.byteLength !== IV_BYTE_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_BYTE_LENGTH} bytes, got ${iv.byteLength}`);
  }

  const ciphertext = base64ToBytes(ciphertextBase64);
  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128
    },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  const decoded = decoder.decode(decryptedBuffer);
  // Zero out temporary decrypted buffer
  new Uint8Array(decryptedBuffer).fill(0);
  return decoded;
}

/**
 * Seals a full DecryptedVaultPayload into an EncryptedVaultEnvelope using an existing CryptoKey and salt.
 * Generates a fresh 12-byte IV on every seal operation.
 */
export async function sealVaultPayload(
  payload: DecryptedVaultPayload,
  key: CryptoKey,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<EncryptedVaultEnvelope> {
  const validated = DecryptedVaultPayloadSchema.parse(payload);
  const serialized = JSON.stringify(validated);
  const { ivBase64, ciphertextBase64 } = await encryptWithKey(serialized, key);

  return {
    format: 'vaultguard-encrypted-v1',
    kdf: {
      algorithm: 'PBKDF2-SHA256',
      iterations,
      saltBase64: bytesToBase64(salt)
    },
    cipher: {
      algorithm: 'AES-256-GCM',
      ivBase64,
      ciphertextBase64
    },
    updatedAt: Date.now()
  };
}

/**
 * Unseals an EncryptedVaultEnvelope using a derived CryptoKey and validates schema integrity.
 */
export async function unsealVaultEnvelopeWithKey(
  envelope: EncryptedVaultEnvelope,
  key: CryptoKey
): Promise<DecryptedVaultPayload> {
  const validatedEnvelope = EncryptedVaultEnvelopeSchema.parse(envelope);
  const jsonString = await decryptWithKey(
    validatedEnvelope.cipher.ciphertextBase64,
    validatedEnvelope.cipher.ivBase64,
    key
  );

  const parsed: unknown = JSON.parse(jsonString);
  return DecryptedVaultPayloadSchema.parse(parsed);
}

/**
 * Unseals an EncryptedVaultEnvelope directly from a Master Password, returning both the
 * DecryptedVaultPayload, the derived in-memory CryptoKey, and the raw Salt bytes.
 */
export async function unlockVaultEnvelope(
  envelope: EncryptedVaultEnvelope,
  masterPassword: string
): Promise<{
  payload: DecryptedVaultPayload;
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}> {
  const validatedEnvelope = EncryptedVaultEnvelopeSchema.parse(envelope);
  const salt = base64ToBytes(validatedEnvelope.kdf.saltBase64);
  const iterations = validatedEnvelope.kdf.iterations;

  const key = await deriveMasterKey(masterPassword, salt, iterations);
  const payload = await unsealVaultEnvelopeWithKey(validatedEnvelope, key);

  return {
    payload,
    key,
    salt,
    iterations
  };
}

export interface PasswordGeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

const CHARSETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  numbers: '23456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?'
} as const;

/**
 * Cryptographically secure uniform random integer in [0, max) using rejection sampling
 * to eliminate modulo bias.
 */
function secureRandomInt(max: number): number {
  if (max <= 0 || max > 0xffffffff) {
    throw new Error('Invalid max bound for secureRandomInt');
  }
  const limit = Math.floor(0x100000000 / max) * max;
  const randomUint32 = new Uint32Array(1);
  while (true) {
    globalThis.crypto.getRandomValues(randomUint32);
    const val = randomUint32[0];
    if (val < limit) {
      return val % max;
    }
  }
}

/**
 * Generates a high-entropy password with guaranteed character class inclusion.
 */
export function generateSecurePassword(options: PasswordGeneratorOptions = {}): string {
  const length = Math.max(8, Math.min(128, options.length ?? 20));
  const useUpper = options.uppercase ?? true;
  const useLower = options.lowercase ?? true;
  const useNumbers = options.numbers ?? true;
  const useSymbols = options.symbols ?? true;

  const activePools: string[] = [];
  if (useUpper) activePools.push(CHARSETS.uppercase);
  if (useLower) activePools.push(CHARSETS.lowercase);
  if (useNumbers) activePools.push(CHARSETS.numbers);
  if (useSymbols) activePools.push(CHARSETS.symbols);

  if (activePools.length === 0) {
    activePools.push(CHARSETS.lowercase, CHARSETS.numbers);
  }

  const combinedPool = activePools.join('');
  const resultChars: string[] = [];

  // Guarantee at least 1 character from each selected pool
  for (const pool of activePools) {
    resultChars.push(pool[secureRandomInt(pool.length)]);
  }

  // Fill remaining characters
  for (let i = resultChars.length; i < length; i++) {
    resultChars.push(combinedPool[secureRandomInt(combinedPool.length)]);
  }

  // Fisher-Yates shuffle using CSPRNG
  for (let i = resultChars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    const temp = resultChars[i];
    resultChars[i] = resultChars[j];
    resultChars[j] = temp;
  }

  return resultChars.join('');
}
