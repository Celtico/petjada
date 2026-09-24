import { describe, expect, it } from 'vitest';
import { decideBootstrap, MIN_REFRESH_DELAY_MS, needsRefresh, REFRESH_MARGIN_S, refreshDelayMs } from './session';

describe('session (lògica pura)', () => {
  it('refreshDelayMs renova abans de caducar amb marge', () => {
    expect(refreshDelayMs(900)).toBe((900 - REFRESH_MARGIN_S) * 1000);
  });

  it('refreshDelayMs mai és menor que el mínim', () => {
    expect(refreshDelayMs(5)).toBe(MIN_REFRESH_DELAY_MS);
    expect(refreshDelayMs(0)).toBe(MIN_REFRESH_DELAY_MS);
  });

  it('needsRefresh és cert dins del marge', () => {
    const now = 1_000_000;
    expect(needsRefresh(now + 10_000, now)).toBe(true);
    expect(needsRefresh(now + 120_000, now)).toBe(false);
    expect(needsRefresh(now - 1, now)).toBe(true);
  });

  it('decideBootstrap: refresh ok → session', () => {
    expect(decideBootstrap({ ok: true })).toBe('session');
  });

  it('decideBootstrap: 401 → guest', () => {
    expect(decideBootstrap({ ok: false, statusCode: 401 })).toBe('guest');
  });

  it('decideBootstrap: error de xarxa o 5xx → offline (no crea convidat)', () => {
    expect(decideBootstrap({ ok: false, statusCode: 0 })).toBe('offline');
    expect(decideBootstrap({ ok: false, statusCode: 503 })).toBe('offline');
  });
});
