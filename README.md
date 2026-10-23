# VaultGuard — Local-First Zero-Knowledge Password Manager Extension

A high-security, 100% offline Browser Password Manager built on **Manifest V3** (using **WXT**, **React**, **TypeScript**, **Tailwind CSS**, and **Web Crypto API**).

## Key Security Architecture
- **Zero-Knowledge Encryption (Full Vault Seal):** Entire credential vault (including URLs, usernames, passwords, and notes) is encrypted at rest using **AES-256-GCM** with a unique 96-bit (12-byte) IV generated on every write.
- **Key Derivation:** **PBKDF2-HMAC-SHA256** with **600,000 iterations** and a 128-bit random salt. Derived `CryptoKey` is marked non-extractable (`extractable: false`) and held strictly in the Background Service Worker's volatile memory.
- **Inactivity Auto-Lock:** Session key and decrypted credentials are automatically zeroed out and wiped after a configurable timeout (default: 15 minutes).
- **Anti-Phishing Autofill:** Strict eTLD+1 domain parsing (`tldts`) and sender tab URL verification (`sender.tab.url`) prevent subdomain spoofing (e.g., `paypal.phishing.com`) and HTTPS-to-HTTP protocol downgrade attacks.
- **Browser-Native Local-First Storage:** Persists only the encrypted envelope in `chrome.storage.local` and provides verified `.vault.json` encrypted backup Export/Import.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Run unit tests (Crypto roundtrip, IV uniqueness, eTLD+1 anti-phishing, Vault controller)
npm test

# 3. Start WXT development mode (Chromium)
npm run dev

# 4. Build production extension bundle
npm run build
```
