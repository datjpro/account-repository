import { defineBackground } from 'wxt/sandbox';
import { VaultBackgroundController } from '@/lib/vault-service';
import type { ExtensionMessage } from '@/types';

const AUTO_LOCK_ALARM_NAME = 'vaultguard-auto-lock-alarm';

export default defineBackground(() => {
  const controller = new VaultBackgroundController(() => {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      void chrome.alarms.clear(AUTO_LOCK_ALARM_NAME);
    }
  });

  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === AUTO_LOCK_ALARM_NAME) {
        controller.lockVault();
      }
    });
  }

  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void
    ) => {
      if (!message || typeof message.type !== 'string') {
        return false;
      }

      // Only accept messages from our own extension ID
      if (sender.id && sender.id !== chrome.runtime.id) {
        sendResponse({
          ok: false,
          error: 'Unauthorized message sender',
          code: 'VALIDATION_ERROR'
        });
        return false;
      }

      const senderTabUrl = sender.tab?.url;

      void controller
        .handleMessage(message, senderTabUrl)
        .then(async (response) => {
          // Sync MV3 alarm with unlockedUntil timestamp
          if (typeof chrome !== 'undefined' && chrome.alarms) {
            const status = await controller.getVaultStatus();
            if (status.isUnlocked && status.unlockedUntil) {
              await chrome.alarms.create(AUTO_LOCK_ALARM_NAME, {
                when: status.unlockedUntil
              });
            } else {
              await chrome.alarms.clear(AUTO_LOCK_ALARM_NAME);
            }
          }
          sendResponse(response);
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'Internal background error',
            code: 'INTERNAL_ERROR'
          });
        });

      // Return true to keep the message channel open for async sendResponse
      return true;
    }
  );
});
