import { parse as parseTld } from 'tldts';

export interface ParsedDomainInfo {
  protocol: string;
  hostname: string;
  port: string;
  eTldPlusOne: string;
  isIp: boolean;
  isLocalhost: boolean;
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Parses a URL string or bare hostname into normalized domain metadata.
 * Returns null if the URL is invalid, uses a disallowed protocol (e.g. javascript:, data:, chrome:),
 * or lacks a valid hostname.
 */
export function parseUrlDomain(rawInput: string): ParsedDomainInfo | null {
  if (!rawInput || typeof rawInput !== 'string') {
    return null;
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  let urlObj: URL;
  try {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      urlObj = new URL(trimmed);
    } else if (trimmed.includes(':')) {
      // Disallow non-HTTP schemes like javascript:alert(1) or data:text/html
      const maybeScheme = trimmed.split(':')[0]?.toLowerCase();
      if (maybeScheme && !/^[a-z0-9.-]+$/.test(maybeScheme)) {
        return null;
      }
      if (maybeScheme === 'javascript' || maybeScheme === 'data' || maybeScheme === 'file' || maybeScheme === 'chrome' || maybeScheme === 'about') {
        return null;
      }
      urlObj = new URL(`https://${trimmed}`);
    } else {
      urlObj = new URL(`https://${trimmed}`);
    }
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(urlObj.protocol)) {
    return null;
  }

  const hostname = urlObj.hostname.toLowerCase();
  if (!hostname) {
    return null;
  }

  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  if (isLocalhost) {
    const hostWithPort = urlObj.port ? `${hostname}:${urlObj.port}` : hostname;
    return {
      protocol: urlObj.protocol,
      hostname,
      port: urlObj.port,
      eTldPlusOne: hostWithPort,
      isIp: false,
      isLocalhost: true
    };
  }

  const parsed = parseTld(hostname, { allowPrivateDomains: true });
  if (parsed.isIp) {
    const ipWithPort = urlObj.port ? `${hostname}:${urlObj.port}` : hostname;
    return {
      protocol: urlObj.protocol,
      hostname,
      port: urlObj.port,
      eTldPlusOne: ipWithPort,
      isIp: true,
      isLocalhost: false
    };
  }

  if (!parsed.domain) {
    return null;
  }

  return {
    protocol: urlObj.protocol,
    hostname,
    port: urlObj.port,
    eTldPlusOne: parsed.domain.toLowerCase(),
    isIp: false,
    isLocalhost: false
  };
}

/**
 * Extracts the canonical eTLD+1 domain (or exact IP/localhost) from a URL or domain string.
 */
export function extractNormalizedDomain(urlOrDomain: string): string | null {
  const info = parseUrlDomain(urlOrDomain);
  return info ? info.eTldPlusOne : null;
}

/**
 * Anti-Phishing Domain Verification:
 * Determines whether a stored credential URL/domain is safe to autofill on `activeTabUrl`.
 *
 * Rules:
 * 1. Both URLs must parse cleanly with `http:` or `https:` protocol.
 * 2. Never downgrade HTTPS stored credentials to an HTTP active page (except localhost).
 * 3. For standard domains, the eTLD+1 MUST strictly match:
 *    - `https://sub.paypal.com/login` matches `https://paypal.com` (both eTLD+1 = `paypal.com`)
 *    - `https://paypal.phishing.com` (eTLD+1 = `phishing.com`) NEVER matches `paypal.com`
 *    - `https://paypal.com.attacker.co.uk` (eTLD+1 = `attacker.co.uk`) NEVER matches `paypal.com`
 * 4. For IP addresses or `localhost`, the exact hostname AND port must match.
 */
export function isDomainMatchForAutofill(storedUrlOrDomain: string, activeTabUrl: string): boolean {
  // Active tab URL must be an explicit full URL starting with http:// or https://
  if (!/^https?:\/\//i.test(activeTabUrl.trim())) {
    return false;
  }

  const stored = parseUrlDomain(storedUrlOrDomain);
  const active = parseUrlDomain(activeTabUrl);

  if (!stored || !active) {
    return false;
  }

  // Prevent protocol downgrade attack: if stored credential explicitly specified https://,
  // do not autofill on an insecure http:// page (unless localhost).
  if (
    /^https:\/\//i.test(storedUrlOrDomain.trim()) &&
    active.protocol === 'http:' &&
    !active.isLocalhost
  ) {
    return false;
  }

  if (stored.isIp || active.isIp || stored.isLocalhost || active.isLocalhost) {
    return (
      stored.isIp === active.isIp &&
      stored.isLocalhost === active.isLocalhost &&
      stored.eTldPlusOne === active.eTldPlusOne
    );
  }

  return stored.eTldPlusOne === active.eTldPlusOne;
}
