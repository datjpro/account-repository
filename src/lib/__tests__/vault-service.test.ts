import { beforeEach, describe, expect, it } from 'vitest';
import { VaultBackgroundController } from '@/lib/vault-service';
import { clearStoredVaultEnvelope } from '@/lib/storage';

describe('VaultBackgroundController Lifecycle & Origin Security', () => {
  beforeEach(async () => {
    await clearStoredVaultEnvelope();
  });

  it('initializes, saves, filters by eTLD+1, locks, and unlocks cleanly', async () => {
    const controller = new VaultBackgroundController();

    const initRes = await controller.handleMessage({
      type: 'INITIALIZE_VAULT',
      payload: { masterPassword: 'StrongMasterPassword#2026' }
    });
    expect(initRes.ok).toBe(true);
    if (initRes.ok) {
      expect(initRes.data.isInitialized).toBe(true);
      expect(initRes.data.isUnlocked).toBe(true);
    }

    // Save a PayPal credential
    const saveRes = await controller.handleMessage(
      {
        type: 'SAVE_CREDENTIALS',
        payload: {
          title: 'PayPal Account',
          url: 'https://www.paypal.com',
          username: 'buyer@example.com',
          password: 'PayPalSecretPassword!1',
          notes: '',
          favorite: false
        }
      },
      'https://www.paypal.com/signin'
    );
    expect(saveRes.ok).toBe(true);

    // Request from legitimate subdomain (sub.paypal.com) -> returns match
    const matchRes = await controller.handleMessage(
      {
        type: 'REQUEST_CREDENTIALS',
        payload: { tabUrl: 'https://sub.paypal.com/checkout' }
      },
      'https://sub.paypal.com/checkout'
    );
    expect(matchRes.ok).toBe(true);
    if (matchRes.ok) {
      expect(matchRes.data.isLocked).toBe(false);
      expect(matchRes.data.matches).toHaveLength(1);
      expect(matchRes.data.matches[0].username).toBe('buyer@example.com');
    }

    // Spoofed payload tabUrl from a phishing sender tab -> blocked by senderUrl verification!
    const spoofRes = await controller.handleMessage(
      {
        type: 'REQUEST_CREDENTIALS',
        payload: { tabUrl: 'https://www.paypal.com' }
      },
      'https://paypal.phishing.com/login'
    );
    expect(spoofRes.ok).toBe(true);
    if (spoofRes.ok) {
      expect(spoofRes.data.matches).toHaveLength(0);
    }

    // Lock the vault and verify memory is wiped
    await controller.handleMessage({ type: 'LOCK_VAULT' });
    const lockedQuery = await controller.handleMessage({
      type: 'LIST_ALL_CREDENTIALS'
    });
    expect(lockedQuery.ok).toBe(false);
    if (!lockedQuery.ok) {
      expect(lockedQuery.code).toBe('VAULT_LOCKED');
    }

    // Unlock with wrong password fails
    const badUnlock = await controller.handleMessage({
      type: 'UNLOCK_VAULT',
      payload: { masterPassword: 'WrongPassword' }
    });
    expect(badUnlock.ok).toBe(false);

    // Unlock with correct password restores access
    const goodUnlock = await controller.handleMessage({
      type: 'UNLOCK_VAULT',
      payload: { masterPassword: 'StrongMasterPassword#2026' }
    });
    expect(goodUnlock.ok).toBe(true);
    if (goodUnlock.ok) {
      expect(goodUnlock.data.entryCount).toBe(1);
    }
  });
});
