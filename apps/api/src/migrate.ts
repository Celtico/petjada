import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import { getConfig } from './config';

/**
 * Executa les migracions SQL de `apps/api/migrations` per ordre alfabètic i
 * en registra el nom a `schema_migrations`. És idempotent: les ja aplicades
 * s'ometen. Funciona tant des de `src/` (ts-node) com des de `dist/`.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const dir = path.resolve(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      done.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return done;
}

if (require.main === module) {
  const pool = new Pool({ connectionString: getConfig().databaseUrl });
  runMigrations(pool)
    .then((done) => {
      if (done.length === 0) console.log('Migracions: res a aplicar.');
      else console.log(`Migracions aplicades: ${done.join(', ')}`);
      return pool.end();
    })
    .catch((err) => {
      console.error('Error aplicant migracions:', err);
      process.exit(1);
    });
}
