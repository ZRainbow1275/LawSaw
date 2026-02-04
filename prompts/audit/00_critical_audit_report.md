# ️ CRITICAL FORENSIC AUDIT REPORT
**Date**: 2026-02-03
**Overall System Health Score**: 38/100

## ✅ 修复任务清单（执行队列）

> 规则（强制）：一次只做一个任务；每完成一个任务都必须跑门禁（`cargo test --workspace` + `pnpm -C apps/web lint` + `pnpm -C apps/web test`），更新本清单勾选状态，并提交 Git。

### CRITICAL（必须修复）
- [x] [SEC-001] Redact 示例 DSN 内嵌口令（copy/paste 扩散风险） ✅ - `config/mcp-config.example.json:6`
- [x] [SEC-002] CI 增加 Secret 扫描（TruffleHog） ✅ - `.github/workflows/ci.yml`
- [x] [SEC-003] Worker Webhook 出站加固：URL 校验 + 超时（防 SSRF/无限挂起） ✅ - `crates/law-eye-worker/src/main.rs:870`
- [x] [SEC-004] Sources URL SSRF 策略改为 fail-closed（含 DNS 解析阻断私网/链路本地） ✅ - `crates/law-eye-api/src/routes/sources.rs:36`
- [x] [SEC-005] HTML 渲染收口：移除 `iframe` + 外链强制 `rel=noopener noreferrer` ✅ - `apps/web/src/components/article/article-content.tsx:20`
- [x] [SEC-006] 前端“加密”fail-open 改造（显式标记明文/加密 + warn） ✅ - `apps/web/src/lib/crypto.ts:121`
- [x] [REL-001] MCP 服务器移除 `unwrap()` panic（返回结构化错误响应） ✅ - `crates/law-eye-mcp/src/server.rs:68`
- [x] [OBS-001] 清理/收敛空 `catch {}`（增加 `console.warn` 打点，保留错误对象） ✅ - `apps/web/src/app/sw/route.ts:85`
- [x] [SEC-008] 出站 URL 策略统一：收口到 `law-eye-common::egress`，并在 API/worker/crawler 的真实发包边界再次校验 ✅（DNS 解析阻断私网/链路本地、超时、禁止 userinfo、协议白名单） - `crates/law-eye-common/src/egress.rs`
- [x] [SEC-009] 移除工作区 `.env` 依赖 ✅：`scripts/no-dockerhub/*.sh` 默认改用用户 state 目录（`$XDG_STATE_HOME`/`$HOME/.local/state`）生成/读取 `secrets.env`；并显式警告 repo-root `.env`（不再读取） - `scripts/no-dockerhub/*.sh` / `.env.example`
- [x] [SEC-010] Vault state 彻底外移 ✅：init/rotate/revoke 统一使用用户 state 目录（`LAW_EYE_ENTERPRISE_*_DIR`）并自动迁移 legacy `tmp/enterprise/{vault,secrets}` - `scripts/enterprise/vault-*.sh`
- [ ] [SEC-011] Docker 本地栈 root init 最小能力：移除 `DAC_READ_SEARCH`，并避免递归 `chown -R`（仅修复卷根目录权限） - `docker-compose.yml`
- [x] [SEC-012] no-dockerhub legacy state 自动迁移 ✅：启动时将 `tmp/no-dockerhub/<stack>/.env*` 迁移到用户 state（优先落到 `secrets.env`）并移除 legacy 副本 - `scripts/no-dockerhub/start-stack.sh`

### OPS（工作区卫生）
- [x] [OPS-001] 外移 enterprise PKI：改用 `LAW_EYE_ENTERPRISE_PKI_DIR`（默认用户 state 目录）+ 脚本拒绝写入仓库根目录 ✅ - `docker-compose.enterprise.yml`

### NEXT（后续收敛）
- [x] [SEC-007] API 安全响应头基线（CSP/HSTS/nosniff/frame-ancestors/permissions-policy） ✅ - `crates/law-eye-api/src/main.rs`
- [x] [OBS-002] 前端集中式错误上报：统一 `reportClientError` + 全局 `error/unhandledrejection` 监听，替代吞错 ✅ - `apps/web/src`

### QA（回归与开发体验）
- [x] [QA-001] E2E 运行器清理 `tmp/e2e-env.json`（避免 stale base_url 影响 `pnpm -C apps/web e2e`） ✅ - `scripts/no-dockerhub/e2e.sh`

### VERIFY（回归验证记录）
- [x] [VER-001] `cargo test --workspace` ✅（2026-02-03）
- [x] [VER-002] `pnpm -C apps/web test` ✅（2026-02-03）
- [x] [VER-003] Playwright E2E ✅（2026-02-03；`scripts/no-dockerhub/e2e.sh`；`E2E_BASE_URL=http://127.0.0.1:18849`，`E2E_RSS_URL=http://127.0.0.1:53151/rss.xml`；6 passed）
- [x] [VER-004] Monkey（API/Web）✅（2026-02-03；API：`p95_2xx=63ms` @ 300req/24c（门槛 200ms）；Web：`p95_2xx=40ms` @ 200req/16c（门槛 200ms））
- [x] [VER-005] `cargo test --workspace` ✅（2026-02-04）
- [x] [VER-006] `pnpm -C apps/web lint` ✅（2026-02-04）
- [x] [VER-007] `pnpm -C apps/web test` ✅（2026-02-04）
- [x] [VER-008] `cargo test --workspace` ✅（2026-02-04；SEC-010）
- [x] [VER-009] `pnpm -C apps/web lint` ✅（2026-02-04；SEC-010）
- [x] [VER-010] `pnpm -C apps/web test` ✅（2026-02-04；SEC-010）
- [x] [VER-011] `cargo test --workspace` ✅（2026-02-04；SEC-012）
- [x] [VER-012] `pnpm -C apps/web lint` ✅（2026-02-04；SEC-012）
- [x] [VER-013] `pnpm -C apps/web test` ✅（2026-02-04；SEC-012）

##  CRITICAL VULNERABILITIES (Must Fix Immediately)
*(Issues that compromise Security or Uptime)*
| ID | File | Line | Issue Type | Risk Description | Remediation |
|----|------|------|------------|------------------|-------------|
| C-ENV-1 | `.env` | 11 | Security | Plaintext secret material exists in the workspace (`JWT_SECRET`). Gitignore is not a control — it still leaks via backups, screen shares, zip exports, malware, and \"copy this .env\" habits. | Treat as compromised if ever shared. Rotate secrets. Move to secret manager injection (Vault/KMS) and keep local dev secrets minimal. Add secret-scanning in CI. |
| C-ENV-2 | `.env` | 12 | Security | Plaintext API credential exists in the workspace (`OPENAI_API_KEY`). This is an immediate money-burn + data-leak risk if exposed. | Rotate key. Enforce usage limits / allowlist / monitoring. Inject via secret manager; avoid persisting keys on disk outside local dev. |
| C-PKI-1 | `tmp/enterprise/pki/ca.key` | 1 | Security | Private key material exists on disk (multiple `*.key` under `tmp/enterprise/pki`). Even for \"demo\" PKI, this normalizes key sprawl and routinely leaks via shared artifacts. | Remove/relocate private keys out of the repo workspace. Generate ephemeral dev PKI on demand. Lock down file ACLs. Treat any leak as rotation. |
| C-XSS-1 | `apps/web/src/components/article/article-content.tsx` | 142 | Security | Permanent XSS sink: `dangerouslySetInnerHTML` renders attacker-controlled HTML. DOMPurify is configured to allow high-risk tags/attrs (e.g., `iframe`, `src`) without explicit URI scheme policy. One config mistake becomes stored XSS across every reader session. | Remove `iframe` unless absolutely required. Enforce allowed URI schemes (`https:` only), strict `rel` for links, and ship a CSP (script-src nonces; frame-src allowlist; object-src 'none'; base-uri 'none'). Prefer structured rendering over raw HTML. |
| C-CRYPTO-1 | `apps/web/src/lib/crypto.ts` | 142 | Security | Client-side \"encryption\" fails open: `encryptData` silently downgrades to plaintext JSON on any crypto failure. This creates a false sense of security and breaks compliance assumptions. | Fail closed for sensitive data. If backward compatibility is required, explicitly tag storage format (PLAINTEXT vs ENCRYPTED) and emit telemetry. Do not store tokens/PII in localStorage; use httpOnly cookies + server-side session. |
| C-SSRF-1 | `crates/law-eye-worker/src/main.rs` | 870 | Security | Outbound HTTP client is created without an explicit timeout (`reqwest::Client::new()`), then used to POST to `task.webhook_url`. Combined SSRF + infinite hang risk (availability loss, internal network reachability, data exfil). | Enforce URL policy (https-only, allowlist, deny private IP ranges, DNS rebinding protections), set strict connect/request timeouts, cap response size, and log request_id. Consider egress proxy / firewall enforcement. |
| C-SSRF-2 | `crates/law-eye-worker/src/main.rs` | 891 | Security | Direct use of `task.webhook_url` in `client.post(...)` lacks scheme/host validation, credential stripping, redirect policy, and allowlist. | Validate URL at task creation boundary and again before dispatch. Forbid embedded creds, forbid redirects, and require per-tenant allowlists. |
| C-SSRF-3 | `crates/law-eye-api/src/routes/sources.rs` | 36 | Security | SSRF policy relies on a single env var toggle (`PRODUCTION`) to allow/deny internal URLs. This fails open on misconfig. Domain handling only blocks literal `localhost`/`.localhost` and does not resolve DNS to prevent internal IP targets via domains (DNS rebinding surface). | Fail closed by default. Replace `PRODUCTION` toggle with explicit allowlist + env-based exceptions. Resolve DNS and block private/link-local ranges. Centralize outbound URL validation for all egress points. |
| C-OBS-1 | `apps/web/src/app/sw/route.ts` | 85 | Stability | Empty `catch {}` swallows runtime failures silently in the Service Worker. This guarantees \"it fails in production and nobody can prove why\". | Log structured warnings (or client telemetry) with correlation IDs. Avoid empty catch blocks. |
| C-PANIC-1 | `crates/law-eye-mcp/src/server.rs` | 68 | Stability | `unwrap()` inside request handling can panic and crash the MCP server process (availability loss). | Replace `unwrap()` with error propagation and an error response path. Add tests for serialization failures. |
| C-CFG-1 | `config/mcp-config.example.json` | 6 | Security | Example config embeds credentials in a DSN (`postgres://...:password@...`). Even if \"fake\", teams copy/paste examples into real systems and then credentials leak in logs/backtraces. | Replace with redacted placeholders and docs: use env vars / secret manager; never embed passwords in URLs. |

## ⚠️ ARCHITECTURAL HOTSPOTS (Refactoring Candidates)
*(Code that is rotting or unmaintainable)*
- **God Files (≥ 400 LOC)**: multiple files exceed 500–1100 lines; review cost and security regression risk scale nonlinearly. Worst offenders include `apps/web/src/app/settings/page.tsx` (1121), `apps/web/src/lib/api/types.ts` (1113), `crates/law-eye-worker/src/main.rs` (1058), `crates/law-eye-api/src/routes/articles.rs` (1056).
- **Silent Error Surfaces**: repeated `catch {}` patterns exist in web code (`apps/web/src/lib/crypto.ts`, `apps/web/src/app/sw/route.ts`, auth hooks/providers). This erases stack traces and correlation.
- **Stringly-Typed Environment Policy**: security-critical behavior hinges on `PRODUCTION` toggles; misconfiguration becomes a security event.
- **Mixed Concerns**: large Next.js pages/components mix UI and business logic; testing becomes brittle, and security review becomes expensive.

##  GAP ANALYSIS (Missing Enterprise Features)
- [x] Docker multi-stage builds (`Dockerfile.api`, `Dockerfile.worker`, etc.)
- [x] Local parity stack (`docker-compose.yml`)
- [x] CI pipeline (`.github/workflows/ci.yml`) with RustSec + `pnpm audit` + SBOM generation
- [x] Structured logging in production (JSON tracing in `crates/law-eye-api/src/main.rs`)
- [x] Metrics endpoint with production token gating (Prometheus exporter in `crates/law-eye-api/src/main.rs`)
- [x] E2E test suite (Playwright under `apps/web/e2e`)
- [x] Secret scanning in CI (TruffleHog) ✅
- [x] API security header baseline (CSP/HSTS/Permissions-Policy/nosniff/frame-ancestors) ✅ (implemented in API; consider enforcing at gateway too)
- [x] Centralized client-side error reporting (web telemetry) ✅ (global handlers + unified reporter)

## ✅ RECOMMENDED ACTION PLAN
1. **Stop key sprawl**: purge `tmp/enterprise/pki/*.key` from the workspace workflow; assume leakage and rotate if ever shared.
2. **Kill SSRF + hangs**: implement a single outbound URL validation policy shared by API/worker/crawler; enforce timeouts everywhere; require allowlists for webhooks.
3. **Lock down HTML rendering**: shrink DOMPurify allowlist (remove `iframe` unless required), enforce URL scheme policy, and ship a strict CSP.
4. **Stop \"fail-open encryption\"**: remove silent downgrade; treat encryption failures as errors for sensitive values; never store sensitive tokens/PII in localStorage.
5. **Eliminate swallowed errors**: remove empty catch blocks or route them into structured telemetry with `request_id` correlation.
6. **Pay down hotspots**: split the biggest files into modules and add contract tests for boundary validation and outbound URL policy.

---
**Audit Caveats**: Hostile static + workspace forensics pass. Findings are actionable risk surfaces; exploitability depends on runtime deployment, data sources, and tenant isolation guarantees. Treat this as triage, then do targeted dynamic tests.
