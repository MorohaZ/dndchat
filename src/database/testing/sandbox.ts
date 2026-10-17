import type pg from 'pg';
import { sql, type Kysely } from 'kysely';
import { assertSandboxMarker } from './test-safety.js';

export function explainConnectError(
  err: unknown,
  config?: { host?: string; port?: number; database?: string; user?: string }
): string {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const message = e?.message ?? String(err);
  const targetDb = config?.database ?? 'dndchat_test';
  const targetHost = config?.host ?? '127.0.0.1';
  const targetPort = config?.port ?? 5432;
  const targetUser = config?.user ?? 'postgres';

  if (code === '3D000') {
    return (
      `Database "${targetDb}" does not exist (code 3D000).\n` +
      `Please create the isolated test database by running:\n` +
      `  Get-Content scripts/db/create-test-db.sql | docker compose exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1`
    );
  }

  if (code === 'ECONNREFUSED') {
    return (
      `Could not connect to PostgreSQL server at ${targetHost}:${targetPort} (ECONNREFUSED).\n` +
      `Verify that Docker Desktop and the PostgreSQL container are running:\n` +
      `  docker compose ps`
    );
  }

  if (code === '28P01') {
    return (
      `Authentication failed for user "${targetUser}" (code 28P01).\n` +
      `Check your database credentials.`
    );
  }

  if (code === 'ETIMEDOUT' || message.toLowerCase().includes('timeout')) {
    return (
      `Connection to PostgreSQL at ${targetHost}:${targetPort} timed out.\n` +
      `The database container may be frozen or uncontactable.`
    );
  }

  return `Failed to connect to test database at ${targetHost}:${targetPort}/${targetDb}: ${message}`;
}

export async function resetPublicSchema(client: pg.Client | pg.PoolClient): Promise<void> {
  // 1. Verify current database and sandbox comment marker on this exact connection
  const res = await client.query<{ db: string; comment: string | null }>(`
    SELECT current_database() AS db,
           shobj_description(d.oid, 'pg_database') AS comment
    FROM pg_database d
    WHERE d.datname = current_database();
  `);

  const row = res.rows[0];
  if (!row) {
    throw new Error('Sandbox verification failed: could not query current database catalog');
  }

  assertSandboxMarker(row);

  // 2. Recreate public schema using individual statements inside an explicit transaction
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION pg_database_owner');
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
    await client.query("COMMENT ON SCHEMA public IS 'standard public schema'");
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure if connection was lost
    }
    throw error;
  }
}

export interface SchemaClassItem {
  name: string;
  kind: string;
}

export interface SchemaFunctionItem {
  name: string;
  identityArgs: string;
}

export interface SchemaTriggerItem {
  name: string;
  tableName: string;
}

export interface SchemaTypeItem {
  name: string;
  kind: string;
}

export interface PublicSchemaSnapshot {
  classes: SchemaClassItem[];
  functions: SchemaFunctionItem[];
  triggers: SchemaTriggerItem[];
  types: SchemaTypeItem[];
}

export async function snapshotPublic(db: Kysely<any>): Promise<PublicSchemaSnapshot> {
  const classesRes = await sql<SchemaClassItem>`
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND c.relname NOT LIKE 'kysely_migration%'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'i', 'f', 'c')
    ORDER BY c.relname;
  `.execute(db);

  const functionsRes = await sql<SchemaFunctionItem>`
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS "identityArgs"
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
    ORDER BY p.proname, "identityArgs";
  `.execute(db);

  const triggersRes = await sql<SchemaTriggerItem>`
    SELECT t.tgname AS name, c.relname AS "tableName"
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND t.tgisinternal = false
    ORDER BY t.tgname, c.relname;
  `.execute(db);

  const typesRes = await sql<SchemaTypeItem>`
    SELECT t.typname AS name, t.typtype AS kind
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    LEFT JOIN pg_depend d ON d.objid = t.oid AND d.classid = 'pg_type'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND t.typtype IN ('e', 'd', 'r', 'm')
    ORDER BY t.typname;
  `.execute(db);

  return {
    classes: classesRes.rows,
    functions: functionsRes.rows,
    triggers: triggersRes.rows,
    types: typesRes.rows,
  };
}
