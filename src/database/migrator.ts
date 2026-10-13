import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration';

/**
 * Creates a Kysely Migrator instance using FileMigrationProvider.
 */
export async function createMigrator(
  db: Kysely<unknown>,
  migrationFolder?: string
): Promise<Migrator> {
  const folder = migrationFolder ?? path.join(__dirname, 'migrations');

  return new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: folder,
      import: (filePath: string) => import(pathToFileURL(filePath).href),
    }),
  });
}

/**
 * Runs all pending migrations up to the latest.
 */
export async function migrateToLatest(
  db: Kysely<unknown>,
  migrationFolder?: string
): Promise<{ error?: unknown; results?: MigrationResult[] }> {
  const migrator = await createMigrator(db, migrationFolder);
  return migrator.migrateToLatest();
}

/**
 * Rolls back the most recently executed migration.
 */
export async function migrateDown(
  db: Kysely<unknown>,
  migrationFolder?: string
): Promise<{ error?: unknown; results?: MigrationResult[] }> {
  const migrator = await createMigrator(db, migrationFolder);
  return migrator.migrateDown();
}
