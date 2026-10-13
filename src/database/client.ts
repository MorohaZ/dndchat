import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './types.js';

/**
 * Creates a Kysely Database instance connected via pg.Pool.
 */
export function createDatabaseClient(connectionString: string): Kysely<Database> {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  const dialect = new PostgresDialect({
    pool,
  });

  return new Kysely<Database>({
    dialect,
  });
}
