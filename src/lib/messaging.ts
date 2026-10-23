import type { ExtensionMessage, MessageResponseMap } from '@/types';

/**
 * Sends a strictly-typed message to the Background Service Worker.
 */
export async function sendVaultMessage<M extends ExtensionMessage>(
  message: M
): Promise<MessageResponseMap[M['type']]> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: MessageResponseMap[M['type']] | undefined) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          resolve({
            ok: false,
            error: lastError.message || 'Failed to communicate with background service worker',
            code: 'INTERNAL_ERROR'
          } as MessageResponseMap[M['type']]);
          return;
        }

        if (!response) {
          resolve({
            ok: false,
            error: 'Empty response from background service worker',
            code: 'INTERNAL_ERROR'
          } as MessageResponseMap[M['type']]);
          return;
        }

        resolve(response);
      });
    } catch (err) {
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : 'Messaging error',
        code: 'INTERNAL_ERROR'
      } as MessageResponseMap[M['type']]);
    }
  });
}
