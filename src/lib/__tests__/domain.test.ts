import { describe, expect, it } from 'vitest';
import {
  extractNormalizedDomain,
  isDomainMatchForAutofill,
  parseUrlDomain
} from '@/lib/domain';

describe('Domain Parsing & Anti-Phishing eTLD+1 Verification', () => {
  it('extracts canonical eTLD+1 across standard and multi-part public suffixes', () => {
    expect(extractNormalizedDomain('https://sub.paypal.com/signin')).toBe('paypal.com');
    expect(extractNormalizedDomain('https://accounts.google.co.uk/login')).toBe('google.co.uk');
    expect(extractNormalizedDomain('github.com')).toBe('github.com');
  });

  it('matches legitimate subdomains sharing the same eTLD+1', () => {
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'https://sub.paypal.com/checkout')
    ).toBe(true);
    expect(
      isDomainMatchForAutofill('https://login.microsoft.com', 'https://account.microsoft.com')
    ).BeTruthy;
    expect(
      isDomainMatchForAutofill('https://login.microsoft.com', 'https://account.microsoft.com')
    ).toBe(true);
  });

  it('strictly blocks phishing lookalike domains', () => {
    // Subdomain spoofing on attacker domain
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'https://paypal.phishing.com/login')
    ).toBe(false);
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'https://paypal.com.attacker.co.uk')
    ).toBe(false);
    // Prefix/suffix spoofing
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'https://secure-paypal.com')
    ).toBe(false);
  });

  it('prevents protocol downgrade from HTTPS stored credentials to HTTP active page', () => {
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'http://paypal.com/login')
    ).toBe(false);
  });

  it('isolates localhost and IP addresses by exact host and port', () => {
    expect(
      isDomainMatchForAutofill('http://localhost:3000', 'http://localhost:3000/login')
    ).toBe(true);
    expect(
      isDomainMatchForAutofill('http://localhost:3000', 'http://localhost:8080/login')
    ).toBe(false);
    expect(
      isDomainMatchForAutofill('http://192.168.1.10:8080', 'http://192.168.1.10:8080/admin')
    ).toBe(true);
    expect(
      isDomainMatchForAutofill('http://192.168.1.10:8080', 'http://192.168.1.11:8080/admin')
    ).toBe(false);
  });

  it('rejects non-HTTP/HTTPS schemes such as javascript:, data:, chrome://', () => {
    expect(parseUrlDomain('javascript:alert(1)')).toBeNull();
    expect(parseUrlDomain('data:text/html,<h1>Phish</h1>')).toBeNull();
    expect(parseUrlDomain('chrome://extensions')).toBeNull();
    expect(
      isDomainMatchForAutofill('https://paypal.com', 'javascript:alert(document.cookie)')
    ).toBe(false);
  });
});
