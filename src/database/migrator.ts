import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration';

/**
 * Creates a Kysely Migrator instance using FileMigrationProvider.
 *
 * Module loading note: this project compiles to CommonJS (tsconfig "module": "commonjs"),
 * so tsc rewrites `import(x)` into `Promise.resolve().then(() => require(x))`. `require`
 * accepts a plain absolute path but NOT a `file://` URL, so the plain path is passed here.
 * Under Vitest the same `import(path)` is handled by vite-node. Errors thrown while loading
 * a migration file are intentionally NOT caught: Kysely reports them via
 * `MigrationResultSet.error`.
 */
export async function createMigrator(
  db: Kysely<any>,
  migrationFolder?: string
): Promise<Migrator> {
  const folder = migrationFolder ?? path.join(__dirname, 'migrations');

  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: folder,
      import: (filePath: string) => import(filePath),
    }),
  });
}

/**
 * Runs all pending migrations up to the latest.
 */
export async function migrateToLatest(
  db: Kysely<any>,
  migrationFolder?: string
): Promise<{ error?: unknown; results?: MigrationResult[] }> {
  const migrator = await createMigrator(db, migrationFolder);
  return migrator.migrateToLatest();
}

/**
 * Rolls back the most recently executed migration.
 */
export async function migrateDown(
  db: Kysely<any>,
  migrationFolder?: string
): Promise<{ error?: unknown; results?: MigrationResult[] }> {
  const migrator = await createMigrator(db, migrationFolder);
  return migrator.migrateDown();
}
