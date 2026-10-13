import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration';

/**
 * Creates a Kysely Migrator instance using FileMigrationProvider.
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
      import: async (filePath: string) => {
        try {
          return await import(pathToFileURL(filePath).href);
        } catch {
          return require(filePath);
        }
      },
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
