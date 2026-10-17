import { describe, expect, it, vi } from 'vitest';
import { assertSafeTestDatabase, assertSandboxMarker } from './test-safety.js';
import { explainConnectError, resetPublicSchema } from './sandbox.js';

describe('assertSafeTestDatabase', () => {
  it('accepts valid local dndchat_test URLs', () => {
    const config1 = assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat_test');
    expect(config1).toEqual({
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: 'postgres',
      database: 'dndchat_test',
    });

    const config2 = assertSafeTestDatabase('postgres://app_user:secret_pass@localhost:5433/dndchat_test');
    expect(config2).toEqual({
      host: 'localhost',
      port: 5433,
      user: 'app_user',
      password: 'secret_pass',
      database: 'dndchat_test',
    });

    const config3 = assertSafeTestDatabase('postgresql://user:pass@[::1]:5432/dndchat_test');
    expect(config3).toEqual({
      host: '::1',
      port: 5432,
      user: 'user',
      password: 'pass',
      database: 'dndchat_test',
    });
  });

  it('decodes encoded user and password', () => {
    const config = assertSafeTestDatabase('postgresql://user%40domain:pass%23word@127.0.0.1:5432/dndchat_test');
    expect(config.user).toBe('user@domain');
    expect(config.password).toBe('pass#word');
  });

  it('rejects empty or whitespace URLs', () => {
    expect(() => assertSafeTestDatabase('')).toThrow('database URL must be a non-empty string');
    expect(() => assertSafeTestDatabase('   ')).toThrow('database URL must be a non-empty string');
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat_test ')).toThrow(
      'database URL contains whitespace or control characters'
    );
  });

  it('rejects non-postgres protocols', () => {
    expect(() => assertSafeTestDatabase('mysql://postgres:postgres@127.0.0.1:5432/dndchat_test')).toThrow(
      'invalid protocol "mysql:"'
    );
    expect(() => assertSafeTestDatabase('http://postgres:postgres@127.0.0.1:5432/dndchat_test')).toThrow(
      'invalid protocol "http:"'
    );
  });

  it('strictly rejects any query parameters (empty allowlist)', () => {
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat_test?sslmode=disable')).toThrow(
      'query parameters are strictly prohibited'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat_test?')).toThrow(
      'query parameters are strictly prohibited'
    );
  });

  it('rejects URL hash fragments', () => {
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat_test#opt')).toThrow(
      'URL hash fragment is prohibited'
    );
  });

  it('rejects remote or non-loopback hosts', () => {
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@192.168.1.100:5432/dndchat_test')).toThrow(
      'unsafe host "192.168.1.100"'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@db.production.internal:5432/dndchat_test')).toThrow(
      'unsafe host "db.production.internal"'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@0.0.0.0:5432/dndchat_test')).toThrow(
      'unsafe host "0.0.0.0"'
    );
  });

  it('rejects missing or invalid ports', () => {
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1/dndchat_test')).toThrow(
      'port must be explicitly specified'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:0/dndchat_test')).toThrow(
      'invalid port "0"'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:70000/dndchat_test')).toThrow(
      'invalid port "70000"'
    );
  });

  it('rejects missing username or password', () => {
    expect(() => assertSafeTestDatabase('postgresql://:postgres@127.0.0.1:5432/dndchat_test')).toThrow(
      'database username must be explicitly specified'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres@127.0.0.1:5432/dndchat_test')).toThrow(
      'database password must be explicitly specified'
    );
    expect(() => assertSafeTestDatabase('postgresql://127.0.0.1:5432/dndchat_test')).toThrow(
      'database username must be explicitly specified'
    );
  });

  it('rejects non-dndchat_test databases', () => {
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/dndchat')).toThrow(
      'target database must be strictly "/dndchat_test", got "/dndchat"'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/postgres')).toThrow(
      'target database must be strictly "/dndchat_test", got "/postgres"'
    );
    expect(() => assertSafeTestDatabase('postgresql://postgres:postgres@127.0.0.1:5432/')).toThrow(
      'target database must be strictly "/dndchat_test", got "/"'
    );
  });
});

describe('assertSandboxMarker (T6 sentinel verification)', () => {
  it('accepts matching database and comment marker', () => {
    expect(() =>
      assertSandboxMarker({ db: 'dndchat_test', comment: 'dndchat-test-sandbox' })
    ).not.toThrow();

    expect(() =>
      assertSandboxMarker({ datname: 'dndchat_test', comment: 'dndchat-test-sandbox' })
    ).not.toThrow();
  });

  it('throws when database name does not match', () => {
    expect(() =>
      assertSandboxMarker({ db: 'dndchat', comment: 'dndchat-test-sandbox' })
    ).toThrow('expected database "dndchat_test", got "dndchat"');

    expect(() =>
      assertSandboxMarker({ datname: 'postgres', comment: 'dndchat-test-sandbox' })
    ).toThrow('expected database "dndchat_test", got "postgres"');
  });

  it('throws when comment is missing or incorrect', () => {
    expect(() =>
      assertSandboxMarker({ db: 'dndchat_test', comment: null })
    ).toThrow('missing required comment "dndchat-test-sandbox" on database "dndchat_test"');

    expect(() =>
      assertSandboxMarker({ db: 'dndchat_test', comment: undefined })
    ).toThrow('missing required comment "dndchat-test-sandbox" on database "dndchat_test"');

    expect(() =>
      assertSandboxMarker({ db: 'dndchat_test', comment: 'wrong-marker' })
    ).toThrow('Got "wrong-marker". Ensure the database was initialized with scripts/db/create-test-db.sql.');
  });
});

describe('explainConnectError (T5 diagnostic explanations)', () => {
  const config = { host: '127.0.0.1', port: 5432, database: 'dndchat_test', user: 'postgres' };

  it('explains code 3D000 (database does not exist)', () => {
    const err = Object.assign(new Error('database "dndchat_test" does not exist'), { code: '3D000' });
    const explanation = explainConnectError(err, config);
    expect(explanation).toContain('Database "dndchat_test" does not exist (code 3D000)');
    expect(explanation).toContain('scripts/db/create-test-db.sql');
  });

  it('explains code ECONNREFUSED (Postgres server down)', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const explanation = explainConnectError(err, config);
    expect(explanation).toContain('Could not connect to PostgreSQL server at 127.0.0.1:5432 (ECONNREFUSED)');
    expect(explanation).toContain('docker compose ps');
  });

  it('explains code 28P01 (authentication failed)', () => {
    const err = Object.assign(new Error('password authentication failed for user "postgres"'), { code: '28P01' });
    const explanation = explainConnectError(err, config);
    expect(explanation).toContain('Authentication failed for user "postgres" (code 28P01)');
  });

  it('explains connection timeout', () => {
    const err = Object.assign(new Error('timeout exceeded when connecting to database'), { code: 'ETIMEDOUT' });
    const explanation = explainConnectError(err, config);
    expect(explanation).toContain('Connection to PostgreSQL at 127.0.0.1:5432 timed out');
  });

  it('explains generic error', () => {
    const err = new Error('unexpected socket failure');
    const explanation = explainConnectError(err, config);
    expect(explanation).toContain('Failed to connect to test database at 127.0.0.1:5432/dndchat_test');
    expect(explanation).toContain('unexpected socket failure');
  });
});

describe('resetPublicSchema guard mock (T6 refused wipe path)', () => {
  it('refuses to drop schema and aborts if sandbox marker is missing', async () => {
    const queriesRun: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation(async (queryText: string) => {
        queriesRun.push(queryText);
        // First query is the marker check
        return {
          rows: [{ db: 'dndchat_test', comment: null }],
        };
      }),
    };

    await expect(resetPublicSchema(mockClient as any)).rejects.toThrow(
      'missing required comment "dndchat-test-sandbox"'
    );

    // Verify DROP SCHEMA was NEVER called
    expect(queriesRun).toHaveLength(1);
    expect(queriesRun[0]).toContain('shobj_description');
    expect(queriesRun.some((q) => q.includes('DROP SCHEMA'))).toBe(false);
  });

  it('refuses to drop schema and aborts if connected to non-test db', async () => {
    const queriesRun: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation(async (queryText: string) => {
        queriesRun.push(queryText);
        return {
          rows: [{ db: 'dndchat', comment: 'dndchat-test-sandbox' }],
        };
      }),
    };

    await expect(resetPublicSchema(mockClient as any)).rejects.toThrow(
      'expected database "dndchat_test", got "dndchat"'
    );

    expect(queriesRun.some((q) => q.includes('DROP SCHEMA'))).toBe(false);
  });

  it('executes schema recreation statement-by-statement in order when sandbox marker is valid', async () => {
    const queriesRun: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation(async (queryText: string) => {
        queriesRun.push(queryText);
        if (queryText.includes('shobj_description')) {
          return {
            rows: [{ db: 'dndchat_test', comment: 'dndchat-test-sandbox' }],
          };
        }
        return { rows: [] };
      }),
    };

    await resetPublicSchema(mockClient as any);

    expect(queriesRun).toHaveLength(8);
    expect(queriesRun[0]).toContain('shobj_description');
    expect(queriesRun.slice(1)).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '5s'",
      'DROP SCHEMA IF EXISTS public CASCADE',
      'CREATE SCHEMA public AUTHORIZATION pg_database_owner',
      'GRANT USAGE ON SCHEMA public TO PUBLIC',
      "COMMENT ON SCHEMA public IS 'standard public schema'",
      'COMMIT',
    ]);
  });

  it('issues ROLLBACK and rethrows when a mid-transaction statement throws', async () => {
    const queriesRun: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation(async (queryText: string) => {
        queriesRun.push(queryText);
        if (queryText.includes('shobj_description')) {
          return {
            rows: [{ db: 'dndchat_test', comment: 'dndchat-test-sandbox' }],
          };
        }
        if (queryText === 'CREATE SCHEMA public AUTHORIZATION pg_database_owner') {
          throw new Error('simulated mid-transaction failure');
        }
        return { rows: [] };
      }),
    };

    await expect(resetPublicSchema(mockClient as any)).rejects.toThrow(
      'simulated mid-transaction failure'
    );

    expect(queriesRun.slice(1)).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '5s'",
      'DROP SCHEMA IF EXISTS public CASCADE',
      'CREATE SCHEMA public AUTHORIZATION pg_database_owner',
      'ROLLBACK',
    ]);
    expect(queriesRun).not.toContain('COMMIT');
  });

  it('attempts ROLLBACK and rethrows original error when COMMIT throws', async () => {
    const queriesRun: string[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation(async (queryText: string) => {
        queriesRun.push(queryText);
        if (queryText.includes('shobj_description')) {
          return {
            rows: [{ db: 'dndchat_test', comment: 'dndchat-test-sandbox' }],
          };
        }
        if (queryText === 'COMMIT') {
          throw new Error('simulated COMMIT failure');
        }
        return { rows: [] };
      }),
    };

    await expect(resetPublicSchema(mockClient as any)).rejects.toThrow(
      'simulated COMMIT failure'
    );

    expect(queriesRun.slice(1)).toEqual([
      'BEGIN',
      "SET LOCAL lock_timeout = '5s'",
      'DROP SCHEMA IF EXISTS public CASCADE',
      'CREATE SCHEMA public AUTHORIZATION pg_database_owner',
      'GRANT USAGE ON SCHEMA public TO PUBLIC',
      "COMMENT ON SCHEMA public IS 'standard public schema'",
      'COMMIT',
      'ROLLBACK',
    ]);
  });
});
