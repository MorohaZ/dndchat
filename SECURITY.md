# Security Guidelines & Secret Scanning

## Automated Secret Scanning & Dependency Audit

### 1. Gitleaks (Secret Leak Detection)
This repository uses [Gitleaks](https://github.com/gitleaks/gitleaks) to detect credentials, API tokens, and private keys before commit and during CI.

#### Local Installation
- **Windows (winget)**: `winget install Gitleaks.Gitleaks`
- **Windows (scoop)**: `scoop install gitleaks`
- **Windows (choco)**: `choco install gitleaks`
- **macOS (Homebrew)**: `brew install gitleaks`
- **Go**: `go install github.com/zricethezav/gitleaks/v8@latest`

#### Usage Commands
- **Pre-commit Scan (staged files)**:
  `gitleaks protect --staged --verbose --redact`
- **Repository Full Scan**:
  `npm run security:gitleaks` or `gitleaks detect --verbose --redact`
- **Allowlist Configuration**:
  Allowlisted test mocks are specified strictly in `.gitleaks.toml`. Never allowlist the whole project or ignore real credentials.

#### Git Hook Setup (Repository Hook)
To enable the pre-commit secret scanning hook located in `.githooks/`:
```bash
git config core.hooksPath .githooks
```
This points Git hook execution to the version-controlled `.githooks/` directory in the repository.
If `gitleaks` is not installed on the developer machine, the hook will display a prominent warning banner and instructions rather than silently passing.

### 2. Dependency Vulnerability Audit
- Run: `npm run security:audit` (or `npm audit --audit-level=high`)

### 3. CI Integration
In GitHub Actions / CI pipeline, run:
```yaml
- name: Run Gitleaks
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Audit Dependencies
  run: npm audit --audit-level=high
```

### 4. PDPA & Logging Rules
- **ห้าม log object ทั้งก้อนที่ไม่ผ่าน sanitize**: Never log entire raw or arbitrary objects without explicit pre-sanitization. Pino fast-redact operates at fixed segment depths; nested or dynamic structures can bypass redaction if not sanitized first.
- **ห้าม log payload webhook หรือข้อความผู้เล่นดิบ**: Never log raw LINE webhook event payloads or raw player chat messages.
- **โครงสร้าง log ที่ปลอดภัย**: Only log sanitized metadata: event ID, event type, message length, and correlation ID (via `sanitizeWebhookEventForLog`).
- All secrets, tokens, authorization headers, and database connection passwords must be redacted or sanitized prior to logging.

## 5. ข้อจำกัดทางสถาปัตยกรรมและความปลอดภัยที่ทราบ (Known Limitations)

### 5.1 ความเสี่ยงเรื่องลำดับเหตุการณ์เมื่อเกิดการ Commit สลับลำดับ (Out-of-Order Commit Timing)
- **สภาวะการทำงาน**: ในกรณีที่มีข้อความส่งเข้ามาพร้อมกันในเสี้ยววินาที Transaction ของ Webhook ก่อนหน้าอาจได้รับค่า `received_sequence` ต่ำกว่า แต่ทำ Commit ช้ากว่า Transaction ที่ได้รับค่า sequence สูงกว่า
- **การบรรเทาปัญหา**: ระบบจัดลำดับการหยิบงานโดยใช้ `(line_timestamp ASC, received_sequence ASC)` ทั้งในเงื่อนไข `NOT EXISTS` และ `ORDER BY`
- **ข้อจำกัดที่ยอมรับ**: หากข้อความแรกประสบปัญหาความล่าช้าจากโครงข่ายภายนอก (Network Latency ฝั่ง LINE) จนส่งมาถึงช้ากว่าข้อความที่สอง และข้อความที่สองถูกหยิบไปประมวลผลเสร็จสิ้นไปก่อน ข้อความแรกที่มาทีหลังจะถูกประมวลผลตามหลัง ซึ่งเป็นข้อจำกัดเชิงกายภาพของเครือข่ายภายนอกและการส่งข้อมูลแบบ Asynchronous

### 5.2 ฐานทางกฎหมายตาม PDPA สำหรับการเก็บรักษาข้อมูล (Legal Basis Notice)
- **ข้อสงวนสิทธิ์**: การระบุฐานความชอบธรรมตามกฎหมายในเอกสารสถาปัตยกรรมนี้ (เช่น ฐานความจำเป็นตามสัญญาสำหรับการเก็บ `source_id` ในช่วงให้บริการชั่วคราว หรือฐานประโยชน์อันชอบธรรมสำหรับการเก็บ Raw Payload ที่ผิดพลาดไว้ 7 วันเพื่อแก้ไขปัญหาทางเทคนิค) **เป็นเพียงข้อเสนอแนะเชิงเทคนิคเบื้องต้นเท่านั้น ไม่ถือเป็นข้อสรุปทางกฎหมาย**
- **ข้อกำหนดปฏิบัติ**: โครงสร้างการจัดเก็บ ระยะเวลา Retention และกระบวนการ Anonymize ทั้งหมด จำเป็นต้องได้รับการตรวจสอบและรับรองความสอดคล้องตามกฎหมายคุ้มครองข้อมูลส่วนบุคคลจากผู้เชี่ยวชาญด้าน PDPA หรือเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO / ฝ่ายกฎหมาย) ก่อนเปิดให้บริการแก่ผู้ใช้จริง

### 5.3 ความเสี่ยงของ type shim `src/types/kysely-migration.d.ts` เมื่ออัปเดต Kysely
- **สิ่งที่ shim ทำ**: `tsconfig.json` ใช้ `"moduleResolution": "node"` ซึ่งไม่อ่านฟิลด์ `exports` ของ package จึงต้องมี declaration `declare module 'kysely/migration'` ที่ re-export จาก `'kysely/dist/migration/index.js'` เพื่อให้ `tsc` ผ่าน
- **ความเสี่ยง**: shim นี้อ้างอิงพาธภายใน (`dist/...`) ของ Kysely ซึ่งไม่ใช่ public API ที่รับประกันความเสถียร หากอัปเดต Kysely แล้วโครงสร้าง `dist/` เปลี่ยน shim อาจพังตอน build หรือ (กรณีร้ายกว่า) ยังคอมไพล์ผ่านแต่ type ไม่ตรงกับ runtime
- **ข้อกำหนดปฏิบัติ**: ทุกครั้งที่อัปเดต Kysely ต้องตรวจฟิลด์ `exports["./migration"]` และไฟล์ `dist/migration/index.d.ts` ใน `node_modules/kysely`, รัน `npm run build` และ `npm test` (รวมเทสต์ migration) ก่อน merge ทางแก้ระยะยาวคือเปลี่ยนเป็น `"moduleResolution": "node16"`/`"bundler"` แล้วลบ shim (ต้องประเมินผลกระทบต่อ import ทั้งโปรเจกต์แยกต่างหาก)

### 5.4 Test Database Sandbox Security and Sentinel Marker (`dndchat_test`)
- **Zero `DROP DATABASE` / `CREATE DATABASE` Policy in Code and Tests**: Source code and automated test suites must never contain `DROP DATABASE` or `CREATE DATABASE` statements, preventing accidental destruction of the primary database. The isolated test database `dndchat_test` is provisioned manually by an administrator via the separate script `scripts/db/create-test-db.sql`.
- **Connection URL Validation (`assertSafeTestDatabase` in `src/database/testing/test-safety.ts`)**:
  - Requires a non-empty string and rejects whitespace or ASCII control characters (`/[\s\x00-\x1f\x7f]/`).
  - Strictly prohibits any query parameters or hash fragments, including a lone `?` or `#` (empty allowlist: rejects `rawUrl.includes('?')`, `rawUrl.includes('#')`, `parsed.search !== ''`, and `parsed.hash !== ''`).
  - Requires the protocol to be `postgres:` or `postgresql:`.
  - Restricts the host (lowercased, with IPv6 brackets stripped) to the loopback allowlist (`127.0.0.1`, `localhost`, `::1`).
  - Requires an explicit integer port in the range `1..65535`.
  - Requires non-empty username and password in the URL to prevent fallback to process environment variables.
  - Requires the pathname to be `/dndchat_test`.
  - Returns a typed `SafeTestDatabaseConfig` object (`{ host, port, user, password, database: 'dndchat_test' }` with URL-decoded credentials) passed directly to `pg.Client` and `pg.Pool` constructors to avoid parser discrepancies.
- **Sentinel Marker Guard (`assertSandboxMarker` and `resetPublicSchema`)**:
  - Before dropping and recreating the `public` schema, `resetPublicSchema` (`src/database/testing/sandbox.ts`) queries `current_database() AS db` and `shobj_description(d.oid, 'pg_database') AS comment` on the active connection and validates the result with `assertSandboxMarker`.
  - If the connected database name (`row.db ?? row.datname`) is not `dndchat_test` or its comment is not `dndchat-test-sandbox`, execution aborts immediately before any `DROP SCHEMA` command is sent.
  - Schema reset operations target only the `public` schema in `dndchat_test`.
- **Known Limitations and Verification Boundaries**:
  1. **Sandbox Marker is a Safeguard, Not a Proof**: The `dndchat-test-sandbox` comment check is an accident-prevention safeguard against misconfiguration, not a cryptographic proof or security boundary against a privileged actor (any superuser or database owner can set that comment on another database).
  2. **Database-Touching Test Files Cannot Run in Parallel**: `DROP SCHEMA IF EXISTS public CASCADE` is executed inside the helper `resetPublicSchema` (`src/database/testing/sandbox.ts`), which is called from `beforeAll` in `src/database/schema.test.ts`. Because this drops and recreates the shared `public` schema in `dndchat_test`, test files or processes that touch the database cannot run concurrently against the same `dndchat_test` database.
  3. **Verification Status of `scripts/db/create-test-db.sql`**: The idempotent re-run case (where `dndchat_test` already exists with the `dndchat-test-sandbox` comment) has been tested directly against the actual `scripts/db/create-test-db.sql` file. The initial database creation case and the mismatched/NULL comment failure case (`RAISE EXCEPTION`) have only been tested indirectly using a temporary database.
  4. **`lock_timeout` and Mid-Transaction Rollback Not Yet Proven on a Live Database**: In `resetPublicSchema`, `SET LOCAL lock_timeout = '5s'` and the mid-transaction `ROLLBACK` recovery path are tested via unit-test mocks in `src/database/testing/test-safety.test.ts`. Those mocks verify only the sequence of SQL command strings sent to `client.query()`, not actual PostgreSQL lock-timeout or rollback behavior on a live database.
  5. **`tsconfig.json` `exclude` Skips Typechecking for Tests and `src/**/testing/**`**: Because `tsconfig.json` excludes `"**/*.test.ts"` and `"src/**/testing/**"`, `tsc` (`npm run build`) does not typecheck test files or helper modules under `src/**/testing/**`. Consequently, `tsc` exits without warnings even when a test file contains an invalid import (such as when `Kysely` was imported using `type Kysely` in `src/database/schema.test.ts` while `new Kysely(...)` was called at runtime).
