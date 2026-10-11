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
