import { createDatabaseClient } from './client.js';
import { migrateToLatest } from './migrator.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      '[migrator] DATABASE_URL is required. No default database is used, to avoid migrating the wrong database.'
    );
    process.exit(1);
  }

  console.log('[migrator] Connecting to database...');
  const db = createDatabaseClient(connectionString);

  try {
    console.log('[migrator] Executing pending migrations...');
    const { error, results } = await migrateToLatest(db);

    if (results) {
      for (const result of results) {
        if (result.status === 'Success') {
          console.log(`[migrator] Migration "${result.migrationName}" executed successfully.`);
        } else if (result.status === 'Error') {
          console.error(`[migrator] Failed to execute migration "${result.migrationName}".`);
        }
      }
    }

    if (error) {
      console.error('[migrator] Migration execution encountered an error:', error);
      process.exit(1);
    }

    console.log('[migrator] Migration process finished.');
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('[migrator] Unhandled error during migration execution:', err);
  process.exit(1);
});
