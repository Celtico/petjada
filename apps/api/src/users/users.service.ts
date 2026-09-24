import { Injectable } from '@nestjs/common';
import type { UpdateProfileRequest, UserDto, UserRole } from '@petjada/shared';
import { DatabaseService, type Queryable } from '../db/database.service';
import { ApiError } from '../common/api-error';

export interface UserRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
  role: UserRole;
  total_points: number;
}

export const USER_COLUMNS = 'id, email, display_name, avatar_url, is_guest, role, total_points';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  static toDto(row: UserRow): UserDto {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isGuest: row.is_guest,
      role: row.role,
      totalPoints: row.total_points,
    };
  }

  async findById(id: string, q: Queryable = this.db.q): Promise<UserRow | null> {
    const { rows } = await q.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findByEmail(email: string, q: Queryable = this.db.q): Promise<UserRow | null> {
    const { rows } = await q.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
    return rows[0] ?? null;
  }

  async me(userId: string): Promise<UserDto> {
    const row = await this.findById(userId);
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', "L'usuari ja no existeix");
    return UsersService.toDto(row);
  }

  async updateProfile(userId: string, patch: UpdateProfileRequest): Promise<UserDto> {
    const row = await this.db.one<UserRow>(
      `UPDATE users
          SET display_name = COALESCE($2, display_name),
              avatar_url = CASE WHEN $3::boolean THEN $4 ELSE avatar_url END
        WHERE id = $1
        RETURNING ${USER_COLUMNS}`,
      [userId, patch.displayName?.trim() ?? null, patch.avatarUrl !== undefined, patch.avatarUrl ?? null],
    );
    if (!row) throw new ApiError(401, 'UNAUTHORIZED', "L'usuari ja no existeix");
    return UsersService.toDto(row);
  }

  /** Esborra el compte i totes les dades associades (cascade). */
  async deleteAccount(userId: string): Promise<void> {
    await this.db.query('DELETE FROM users WHERE id = $1', [userId]);
  }
}
