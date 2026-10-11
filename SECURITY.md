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
- Never log raw LINE webhook payloads or raw player chat messages.
- Only log event ID, event type, message length, and correlation ID.
- All secrets, tokens, authorization headers, and database connection passwords must be redacted or sanitized prior to logging.
