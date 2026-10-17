export interface SafeTestDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: 'dndchat_test';
}

export interface SandboxMarkerRow {
  db?: string;
  datname?: string;
  comment?: string | null;
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Validates that a connection URL strictly targets the local, isolated test database dndchat_test.
 * Query string parameters are strictly prohibited (empty allowlist).
 * Returns a typed config object to be passed directly to pg.Client / Pool constructors,
 * avoiding discrepancies between URL parsers.
 */
export function assertSafeTestDatabase(rawUrl: string): SafeTestDatabaseConfig {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('Refusing to connect: database URL must be a non-empty string');
  }

  // Reject whitespace or control characters
  if (/[\s\x00-\x1f\x7f]/.test(rawUrl)) {
    throw new Error('Refusing to connect: database URL contains whitespace or control characters');
  }

  // 2. Query string and hash are strictly prohibited (empty allowlist, reject even lone '?' or '#')
  if (rawUrl.includes('?')) {
    throw new Error('Refusing to connect: query parameters are strictly prohibited on test database URLs');
  }
  if (rawUrl.includes('#')) {
    throw new Error('Refusing to connect: URL hash fragment is prohibited on test database URLs');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const portMatch = rawUrl.match(/:(\d+)(?:\/|$)/);
    if (portMatch) {
      const portNum = Number(portMatch[1]);
      if (portNum < 1 || portNum > 65535) {
        throw new Error(`Refusing to connect: invalid port "${portMatch[1]}"`);
      }
    }
    throw new Error('Refusing to connect: invalid database URL format');
  }

  // 1. Protocol must be postgres: or postgresql:
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Refusing to connect: invalid protocol "${parsed.protocol}", expected "postgres:" or "postgresql:"`);
  }

  if (parsed.search !== '') {
    throw new Error('Refusing to connect: query parameters are strictly prohibited on test database URLs');
  }

  if (parsed.hash !== '') {
    throw new Error('Refusing to connect: URL hash fragment is prohibited on test database URLs');
  }

  // 4. Hostname must be strictly local loopback
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`Refusing to connect: unsafe host "${parsed.hostname}", only 127.0.0.1, localhost, or ::1 are allowed`);
  }

  // 5. Port must be explicitly specified and valid
  if (!parsed.port) {
    throw new Error('Refusing to connect: port must be explicitly specified');
  }
  const portNum = Number(parsed.port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    throw new Error(`Refusing to connect: invalid port "${parsed.port}"`);
  }

  // 6. User and password must be non-empty (prevents fallback to process environment variables)
  if (!parsed.username) {
    throw new Error('Refusing to connect: database username must be explicitly specified');
  }
  if (!parsed.password) {
    throw new Error('Refusing to connect: database password must be explicitly specified');
  }

  // 7. Pathname must be strictly "/dndchat_test"
  if (parsed.pathname !== '/dndchat_test') {
    throw new Error(`Refusing to connect: target database must be strictly "/dndchat_test", got "${parsed.pathname}"`);
  }

  return {
    host: hostname,
    port: portNum,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: 'dndchat_test',
  };
}

/**
 * Validates that the connected database contains the sandbox marker comment.
 */
export function assertSandboxMarker(row: SandboxMarkerRow): void {
  const dbName = row.db ?? row.datname;
  if (dbName !== 'dndchat_test') {
    throw new Error(`Sandbox marker check failed: expected database "dndchat_test", got "${dbName}"`);
  }
  if (row.comment !== 'dndchat-test-sandbox') {
    throw new Error(
      `Sandbox marker check failed: missing required comment "dndchat-test-sandbox" on database "${dbName}". ` +
      `Got "${row.comment}". Ensure the database was initialized with scripts/db/create-test-db.sql.`
    );
  }
}
