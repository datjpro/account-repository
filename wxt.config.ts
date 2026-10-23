import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'VaultGuard - Local Password Manager',
    short_name: 'VaultGuard',
    description: 'High-security, zero-knowledge, local-first Browser Password Manager (AES-256-GCM + PBKDF2)',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'tabs', 'alarms'],
    host_permissions: ['http://*/*', 'https://*/*'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'none';"
    }
  }
});
