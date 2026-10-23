import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decryptWithKey,
  deriveMasterKey,
  encryptWithKey,
  generateIv,
  generateSalt,
  generateSecurePassword,
  IV_BYTE_LENGTH,
  PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  sealVaultPayload,
  unlockVaultEnvelope
} from '@/lib/crypto';
import type { DecryptedVaultPayload } from '@/types';

describe('Crypto Engine (AES-256-GCM + PBKDF2-SHA256)', () => {
  it('generates 16-byte salts and unique 12-byte (96-bit) IVs', () => {
    const salt = generateSalt();
    const iv1 = generateIv();
    const iv2 = generateIv();

    expect(salt.byteLength).toBe(SALT_BYTE_LENGTH);
    expect(iv1.byteLength).toBe(IV_BYTE_LENGTH);
    expect(iv2.byteLength).toBe(IV_BYTE_LENGTH);
    expect(Buffer.from(iv1).equals(Buffer.from(iv2))).toBe(false);
  });

  it('enforces minimum 600,000 PBKDF2 iterations and 16-byte salt', async () => {
    const validSalt = generateSalt();
    await expect(
      deriveMasterKey('ValidPassword!123', validSalt, 100_000)
    ).rejects.toThrow(/at least 600000/);

    const shortSalt = new Uint8Array(8);
    await expect(
      deriveMasterKey('ValidPassword!123', shortSalt, PBKDF2_ITERATIONS)
    ).rejects.toThrow(/at least 16 bytes/);
  });

  it('derives a non-extractable AES-256-GCM CryptoKey and performs encrypt-decrypt roundtrip', async () => {
    const salt = generateSalt();
    const key = await deriveMasterKey('CorrectHorseBatteryStaple!99', salt, PBKDF2_ITERATIONS);

    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');

    const secretPlaintext = JSON.stringify({
      username: 'alice@example.com',
      password: 'UltraSecretPassword#2026'
    });

    const encrypted1 = await encryptWithKey(secretPlaintext, key);
    const encrypted2 = await encryptWithKey(secretPlaintext, key);

    // Every encryption MUST generate a unique 96-bit IV
    expect(encrypted1.ivBase64).not.toBe(encrypted2.ivBase64);
    expect(encrypted1.ciphertextBase64).not.toBe(encrypted2.ciphertextBase64);
    expect(base64ToBytes(encrypted1.ivBase64).byteLength).toBe(12);

    const decrypted = await decryptWithKey(
      encrypted1.ciphertextBase64,
      encrypted1.ivBase64,
      key
    );
    expect(decrypted).toBe(secretPlaintext);
  });

  it('detects and rejects tampered ciphertext or tampered IV via AES-GCM auth tag', async () => {
    const salt = generateSalt();
    const key = await deriveMasterKey('TamperTestMasterKey!2026', salt);
    const { ivBase64, ciphertextBase64 } = await encryptWithKey('SensitiveVaultData', key);

    // Flip 1 bit in ciphertext
    const cipherBytes = base64ToBytes(ciphertextBase64);
    cipherBytes[0] ^= 0xff;
    const tamperedCipherBase64 = bytesToBase64(cipherBytes);

    await expect(
      decryptWithKey(tamperedCipherBase64, ivBase64, key)
    ).rejects.toThrow();

    // Flip 1 bit in IV
    const ivBytes = base64ToBytes(ivBase64);
    ivBytes[0] ^= 0xff;
    const tamperedIvBase64 = bytesToBase64(ivBytes);

    await expect(
      decryptWithKey(ciphertextBase64, tamperedIvBase64, key)
    ).rejects.toThrow();
  });

  it('seals and unlocks a full vault envelope and rejects an incorrect Master Password', async () => {
    const masterPassword = 'MasterVaultPassword!2026';
    const salt = generateSalt();
    const key = await deriveMasterKey(masterPassword, salt);

    const samplePayload: DecryptedVaultPayload = {
      version: 1,
      entries: [
        {
          id: 'cred-1',
          title: 'PayPal',
          url: 'https://www.paypal.com',
          domain: 'paypal.com',
          username: 'user@paypal.com',
          password: 'MyPayPalPassword!123',
          notes: 'Personal account',
          favorite: true,
          createdAt: 1700000000000,
          updatedAt: 1700000000000
        }
      ],
      settings: {
        autoLockMinutes: 15,
        enableAutofillPrompt: true,
        enableAutoSavePrompt: true
      },
      lastModified: 1700000000000
    };

    const envelope = await sealVaultPayload(samplePayload, key, salt);
    expect(envelope.format).toBe('vaultguard-encrypted-v1');
    expect(envelope.kdf.iterations).toBeGreaterThanOrEqual(600_000);
    expect(JSON.stringify(envelope)).not.toContain('MyPayPalPassword!123');
    expect(JSON.stringify(envelope)).not.toContain('user@paypal.com');

    // Correct Master Password unlocks cleanly
    const unlocked = await unlockVaultEnvelope(envelope, masterPassword);
    expect(unlocked.payload.entries).toHaveLength(1);
    expect(unlocked.payload.entries[0].password).toBe('MyPayPalPassword!123');

    // Wrong Master Password MUST throw
    await expect(
      unlockVaultEnvelope(envelope, 'WrongMasterPassword!000')
    ).rejects.toThrow();
  });

  it('generates high-entropy passwords with all enabled character sets', () => {
    const pwd = generateSecurePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true
    });

    expect(pwd).toHaveLength(24);
    expect(/[A-Z]/.test(pwd)).toBe(true);
    expect(/[a-z]/.test(pwd)).toBe(true);
    expect(/[0-9]/.test(pwd)).toBe(true);
  });
});
