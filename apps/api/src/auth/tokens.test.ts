import { describe, expect, it } from 'vitest';
import {
  attemptsExceeded,
  displayNameFromEmail,
  generateLoginCode,
  generateOpaqueToken,
  guestDisplayName,
  hashMatches,
  hashToken,
  normalizeLoginCode,
} from './tokens';

describe('tokens', () => {
  it('genera codis de 6 xifres amb zeros a l’esquerra', () => {
    expect(generateLoginCode(() => 42)).toBe('000042');
    expect(generateLoginCode(() => 999999)).toBe('999999');
    expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });

  it('normalitza codis amb espais o guions', () => {
    expect(normalizeLoginCode('123 456')).toBe('123456');
    expect(normalizeLoginCode('12-34-56')).toBe('123456');
  });

  it('el hash és determinista i la comparació funciona', () => {
    const code = '482913';
    const h = hashToken(code);
    expect(h).toHaveLength(64);
    expect(hashMatches(h, code)).toBe(true);
    expect(hashMatches(h, '482914')).toBe(false);
    expect(hashMatches('zz', code)).toBe(false);
  });

  it('els tokens opacs són llargs i diferents', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });

  it('limita els intents', () => {
    expect(attemptsExceeded(4, 5)).toBe(false);
    expect(attemptsExceeded(5, 5)).toBe(true);
  });

  it('proposa noms visibles', () => {
    expect(guestDisplayName(() => 'AB12')).toBe('Caminant-AB12');
    expect(displayNameFromEmail('marta.puig@example.com')).toBe('marta puig');
    expect(displayNameFromEmail('a@example.com')).toBe('Caminant');
  });
});
