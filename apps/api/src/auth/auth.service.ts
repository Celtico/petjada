import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PoolClient } from 'pg';
import type { AuthResponse, MagicLinkResponse } from '@petjada/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService } from '../db/database.service';
import { ApiError } from '../common/api-error';
import type { AuthUser, JwtPayload } from '../common/auth.guard';
import { USER_COLUMNS, UsersService, type UserRow } from '../users/users.service';
import { MailService } from './mail.service';
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
import { needsMerge, recomputeTotalPoints, shouldDropGuestInProgress } from './merge';

/** Senyal intern: s'ha presentat un refresh token ja revocat (possible robatori). */
class RefreshReuse extends Error {
  constructor(public readonly userId: string) {
    super('refresh token reuse');
  }
}

/** Sessió emesa: la resposta per al client i el refresh token en clar per a la cookie. */
export interface Session {
  response: AuthResponse;
  refreshToken: string;
}

interface RefreshRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

interface LoginTokenRow {
  id: string;
  email: string;
  code_hash: string;
  guest_user_id: string | null;
  expires_at: Date;
  attempts: number;
  used_at: Date | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Convidat, refresh i logout
  // -------------------------------------------------------------------------

  /** Crea un usuari convidat i n'emet la sessió. */
  async guest(): Promise<Session> {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (email, display_name, is_guest, role)
         VALUES (NULL, $1, true, 'player')
         RETURNING ${USER_COLUMNS}`,
        [guestDisplayName()],
      );
      return this.issueSession(client, rows[0]);
    });
  }

  /**
   * Rota el refresh token. Si el token ja estava revocat (reutilització), es
   * revoquen tots els de l'usuari: la família queda invalidada.
   */
  async refresh(rawToken: string | null): Promise<Session> {
    if (!rawToken) throw new ApiError(401, 'UNAUTHORIZED', 'No hi ha sessió');
    const hash = hashToken(rawToken);
    try {
      return await this.rotate(hash);
    } catch (err) {
      if (err instanceof RefreshReuse) {
        // Fora de la transacció (que s'ha desfet): la revocació de tota la família ha de persistir.
        await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
          err.userId,
        ]);
        this.logger.warn(`Reutilització de refresh token detectada per a l'usuari ${err.userId}`);
        throw new ApiError(401, 'UNAUTHORIZED', 'La sessió ha estat invalidada. Torna a entrar.');
      }
      throw err;
    }
  }

  private async rotate(hash: string): Promise<Session> {
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<RefreshRow>(
        'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
        [hash],
      );
      const current = rows[0];
      if (!current) throw new ApiError(401, 'UNAUTHORIZED', 'La sessió no és vàlida');
      if (current.revoked_at) throw new RefreshReuse(current.user_id);
      if (current.expires_at.getTime() <= Date.now()) {
        throw new ApiError(401, 'UNAUTHORIZED', 'La sessió ha caducat');
      }
      const user = await this.users.findById(current.user_id, client);
      if (!user) throw new ApiError(401, 'UNAUTHORIZED', "L'usuari ja no existeix");
      const session = await this.issueSession(client, user);
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(),
                replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $2)
          WHERE id = $1`,
        [current.id, hashToken(session.refreshToken)],
      );
      return session;
    });
  }

  async logout(rawToken: string | null): Promise<void> {
    if (!rawToken) return;
    await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
      hashToken(rawToken),
    ]);
  }

  // -------------------------------------------------------------------------
  // Enllaç màgic i codi
  // -------------------------------------------------------------------------

  /**
   * Genera un enllaç d'un sol ús i un codi de 6 xifres; envia el correu (o
   * escriu-los al log si no hi ha SMTP). Mai revela si l'email existeix.
   */
  async requestMagicLink(email: string, bearer: AuthUser | undefined): Promise<MagicLinkResponse> {
    const normalized = email.trim().toLowerCase();
    const linkToken = generateOpaqueToken();
    const code = generateLoginCode();
    const guestId = bearer?.isGuest ? bearer.id : null;
    const ttlMin = this.config.loginTokenTtlMin;
    await this.db.query(
      `INSERT INTO login_tokens (email, link_hash, code_hash, guest_user_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 minute'))`,
      [normalized, hashToken(linkToken), hashToken(code), guestId, ttlMin],
    );
    const link = `${this.config.appUrl.replace(/\/$/, '')}/api/auth/magic?token=${linkToken}`;
    try {
      await this.mail.sendMagicLink({ to: normalized, link, code, expiresMin: ttlMin });
    } catch (err) {
      this.logger.error(`No s'ha pogut enviar el correu a ${normalized}: ${err instanceof Error ? err.message : err}`);
    }
    return { sent: true, expiresIn: ttlMin * 60 };
  }

  /** Consumeix l'enllaç màgic i emet la sessió (l'endpoint redirigeix a la PWA). */
  async consumeMagicLink(rawToken: string): Promise<Session> {
    const hash = hashToken(rawToken);
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<LoginTokenRow>(
        `SELECT id, email, code_hash, guest_user_id, expires_at, attempts, used_at
           FROM login_tokens WHERE link_hash = $1 FOR UPDATE`,
        [hash],
      );
      const token = rows[0];
      if (!token || token.used_at) throw new ApiError(400, 'INVALID_CODE', "L'enllaç no és vàlid o ja s'ha fet servir");
      if (token.expires_at.getTime() <= Date.now()) throw new ApiError(400, 'CODE_EXPIRED', "L'enllaç ha caducat");
      await client.query('UPDATE login_tokens SET used_at = now() WHERE id = $1', [token.id]);
      const user = await this.resolveAccount(client, token.email, token.guest_user_id);
      return this.issueSession(client, user);
    });
  }

  /** Verifica el codi de 6 xifres amb límit d'intents. */
  async verifyCode(email: string, rawCode: string, bearer: AuthUser | undefined): Promise<Session> {
    const normalized = email.trim().toLowerCase();
    const code = normalizeLoginCode(rawCode);
    const token = await this.db.one<LoginTokenRow>(
      `SELECT id, email, code_hash, guest_user_id, expires_at, attempts, used_at
         FROM login_tokens
        WHERE email = $1 AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [normalized],
    );
    if (!token) throw new ApiError(400, 'INVALID_CODE', 'El codi no és correcte. Demana’n un de nou.');
    if (token.expires_at.getTime() <= Date.now()) throw new ApiError(400, 'CODE_EXPIRED', 'El codi ha caducat. Demana’n un de nou.');
    if (attemptsExceeded(token.attempts, this.config.loginCodeMaxAttempts)) {
      throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Massa intents. Demana un codi nou.');
    }
    // L'intent es persisteix fora de la transacció perquè compti encara que falli.
    const bumped = await this.db.one<{ attempts: number }>(
      'UPDATE login_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
      [token.id],
    );
    if (!hashMatches(token.code_hash, code)) {
      const left = this.config.loginCodeMaxAttempts - (bumped?.attempts ?? this.config.loginCodeMaxAttempts);
      if (left <= 0) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Massa intents. Demana un codi nou.');
      throw new ApiError(400, 'INVALID_CODE', `El codi no és correcte. Et queden ${left} intents.`);
    }
    return this.db.transaction(async (client) => {
      const { rowCount } = await client.query('UPDATE login_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL', [
        token.id,
      ]);
      if (!rowCount) throw new ApiError(400, 'INVALID_CODE', "Aquest codi ja s'ha fet servir.");
      const guestId = bearer?.isGuest ? bearer.id : token.guest_user_id;
      const user = await this.resolveAccount(client, token.email, guestId);
      return this.issueSession(client, user);
    });
  }

  // -------------------------------------------------------------------------
  // Comptes i fusió
  // -------------------------------------------------------------------------

  /** Obté o crea el compte de l'email i hi fusiona el convidat si cal. */
  private async resolveAccount(client: PoolClient, email: string, guestId: string | null): Promise<UserRow> {
    let account = await this.users.findByEmail(email, client);
    if (!account && guestId) {
      // El convidat es converteix directament en el compte: conserva tot el progrés sense fusió.
      const { rows } = await client.query<UserRow>(
        `UPDATE users SET email = $2, is_guest = false,
                display_name = CASE WHEN display_name LIKE 'Caminant-%' THEN $3 ELSE display_name END
          WHERE id = $1 AND is_guest = true
          RETURNING ${USER_COLUMNS}`,
        [guestId, email, displayNameFromEmail(email)],
      );
      account = rows[0] ?? null;
    }
    if (!account) {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO users (email, display_name, is_guest, role)
         VALUES ($1, $2, false, 'player')
         RETURNING ${USER_COLUMNS}`,
        [email, displayNameFromEmail(email)],
      );
      account = rows[0];
    }
    if (needsMerge(guestId, account.id)) {
      await this.mergeGuest(client, guestId as string, account.id);
      account = (await this.users.findById(account.id, client)) ?? account;
    }
    return account;
  }

  /**
   * Fusiona el progrés d'un convidat dins d'un compte existent, sense duplicar
   * captures, i recalcula `total_points` a partir dels components. Al final
   * el convidat s'esborra (i amb ell els seus refresh tokens).
   */
  async mergeGuest(client: PoolClient, guestId: string, accountId: string): Promise<void> {
    const { rows: guest } = await client.query<{ is_guest: boolean }>('SELECT is_guest FROM users WHERE id = $1 FOR UPDATE', [guestId]);
    if (!guest[0] || !guest[0].is_guest) return;

    const { rows: prog } = await client.query<{ account: boolean; guest: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM user_routes WHERE user_id = $1 AND status = 'in_progress') AS account,
              EXISTS (SELECT 1 FROM user_routes WHERE user_id = $2 AND status = 'in_progress') AS guest`,
      [accountId, guestId],
    );
    if (shouldDropGuestInProgress({ accountHasInProgress: prog[0].account, guestHasInProgress: prog[0].guest })) {
      await client.query(`DELETE FROM user_routes WHERE user_id = $1 AND status = 'in_progress'`, [guestId]);
    }
    await client.query('UPDATE user_routes SET user_id = $2 WHERE user_id = $1', [guestId, accountId]);
    await client.query('UPDATE routes SET created_by = $2 WHERE created_by = $1', [guestId, accountId]);
    await client.query(
      `INSERT INTO user_captures (user_id, object_id, captured_at, lat, lon, accuracy)
       SELECT $2, object_id, captured_at, lat, lon, accuracy FROM user_captures WHERE user_id = $1
       ON CONFLICT (user_id, object_id) DO NOTHING`,
      [guestId, accountId],
    );
    await client.query(
      `INSERT INTO user_collections (user_id, collection_id, completed_at, bonus_points)
       SELECT $2, collection_id, completed_at, bonus_points FROM user_collections WHERE user_id = $1
       ON CONFLICT (user_id, collection_id) DO NOTHING`,
      [guestId, accountId],
    );
    await this.recomputePoints(client, accountId);
    await client.query('DELETE FROM users WHERE id = $1', [guestId]);
  }

  private async recomputePoints(client: PoolClient, userId: string): Promise<void> {
    const { rows } = await client.query<{ capture_points: number; route_bonus: number; collection_bonus: number }>(
      `SELECT
         (SELECT COALESCE(SUM(o.points), 0) FROM user_captures c JOIN route_objects o ON o.id = c.object_id WHERE c.user_id = $1)::int AS capture_points,
         (SELECT COALESCE(SUM(bonus_points), 0) FROM user_routes WHERE user_id = $1 AND status = 'completed')::int AS route_bonus,
         (SELECT COALESCE(SUM(bonus_points), 0) FROM user_collections WHERE user_id = $1)::int AS collection_bonus`,
      [userId],
    );
    const total = recomputeTotalPoints({
      capturePoints: rows[0].capture_points,
      routeBonus: rows[0].route_bonus,
      collectionBonus: rows[0].collection_bonus,
    });
    await client.query('UPDATE users SET total_points = $2 WHERE id = $1', [userId, total]);
  }

  // -------------------------------------------------------------------------
  // Emissió de tokens
  // -------------------------------------------------------------------------

  private async issueSession(client: PoolClient, user: UserRow): Promise<Session> {
    const refreshToken = generateOpaqueToken();
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3::int * interval '1 day'))`,
      [user.id, hashToken(refreshToken), this.config.refreshTtlDays],
    );
    const payload: JwtPayload = { sub: user.id, role: user.role, isGuest: user.is_guest };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.config.accessTtlS });
    return {
      refreshToken,
      response: { accessToken, expiresIn: this.config.accessTtlS, user: UsersService.toDto(user) },
    };
  }
}
