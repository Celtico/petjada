import { Pool } from 'pg';
import { getConfig } from './config';

/**
 * Usuaris de prova. Sense contrasenya: en dev s'hi entra amb
 * `POST /api/auth/magic-link` i el codi que surt al log del servidor.
 */
export const SEED_USERS = [
  { email: 'test@petjada.app', displayName: 'Prova', role: 'admin' },
  { email: 'editor@petjada.app', displayName: 'Editor', role: 'editor' },
] as const;

export async function runSeed(pool: Pool): Promise<string[]> {
  const created: string[] = [];
  for (const u of SEED_USERS) {
    const { rowCount } = await pool.query(
      `INSERT INTO users (email, display_name, is_guest, role)
       VALUES ($1, $2, false, $3)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, u.displayName, u.role],
    );
    if (rowCount) created.push(u.email);
  }
  return created;
}

if (require.main === module) {
  const pool = new Pool({ connectionString: getConfig().databaseUrl });
  runSeed(pool)
    .then((created) => {
      console.log(created.length ? `Usuaris de prova creats: ${created.join(', ')}` : 'Usuaris de prova ja existents.');
      return pool.end();
    })
    .catch((err) => {
      console.error('Error al seed:', err);
      process.exit(1);
    });
}
