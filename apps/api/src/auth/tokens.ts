import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { LOGIN_CODE_LENGTH } from '@petjada/shared';

/**
 * Utilitats pures de tokens: només se'n guarden hashos a la base de dades.
 */

/** Hash SHA-256 en hexadecimal. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Token opac aleatori (32 bytes → 64 caràcters hex). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Codi numèric de `LOGIN_CODE_LENGTH` xifres, amb zeros a l'esquerra. */
export function generateLoginCode(random: (max: number) => number = (max) => randomInt(max)): string {
  const max = 10 ** LOGIN_CODE_LENGTH;
  return String(random(max)).padStart(LOGIN_CODE_LENGTH, '0');
}

/** Normalitza un codi introduït per l'usuari (espais, guions). */
export function normalizeLoginCode(input: string): string {
  return input.replace(/\D/g, '');
}

/** Comparació en temps constant entre un hash guardat i un valor en clar. */
export function hashMatches(storedHash: string, raw: string): boolean {
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(hashToken(raw), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `true` si ja s'han esgotat els intents (l'intent actual inclòs). */
export function attemptsExceeded(attemptsSoFar: number, maxAttempts: number): boolean {
  return attemptsSoFar >= maxAttempts;
}

/** Nom visible per defecte d'un convidat: "Caminant-4F2A". */
export function guestDisplayName(random: () => string = () => randomBytes(2).toString('hex').toUpperCase()): string {
  return `Caminant-${random()}`;
}

/** Nom visible per defecte en crear un compte a partir de l'email. */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  if (cleaned.length < 2) return 'Caminant';
  return cleaned.slice(0, 40);
}
