# ️ ENTERPRISE GAP ANALYSIS REPORT
**Date**: 2026-02-04
**System Maturity Score**: 30/100

##  SEVERITY 1: CRITICAL BLOCKERS (Must Fix Before Deploy)
*(Security risks, data loss risks, potential crashes)*
| ID | Component | Issue | Violation Type | Remediation |
|----|-----------|-------|----------------|-------------|
| S1-01 | `.env` | `.env` 仍属于明文敏感配置载体（禁止生产落盘）；但该仓库已通过 `.gitignore` 排除且未被版本控制追踪 | OWASP A07 / Secret Management | 生产环境必须使用 Secret Manager/Vault/KMS 注入；CI 继续强制 Secret 扫描并阻断；若历史曾暴露请立即轮换凭证。 |
| S1-02 | `tmp/enterprise/vault/unseal.key` | Vault Unseal Key 属于 root 级关键材料（禁止在仓库目录落盘）；当前已迁移到用户 state 目录并由 `.gitignore` 排除 | Zero Trust / Key Material Sprawl | 维持“仓库内零落盘”约束；按需要启用一次性生成/外部安全存储；若历史落盘视为已泄露并执行轮换流程。 |
| S1-03 | `docker-compose.yml` / `scripts/no-dockerhub/start-stack.sh` | 存在短生命周期 root init（卷 chown）；已做禁网/最小能力/只读 rootfs/no-new-privileges 隔离，但仍应尽量消除 root 路径 | Container Hardening / Privilege Escalation | 保持运行期服务 non-root；root init 仅保留 CHOWN 且禁网；进一步方案：评估 rootless/预置卷权限/替代存储驱动以移除 chown 需求。 |
| S1-04 | `apps/web/src/components/article/article-content.tsx` | 仍存在 HTML 直出渲染点（dangerouslySetInnerHTML），但已通过收紧 DOMPurify allowlist + URI scheme policy 进行加固 | OWASP A03 XSS | 结构化渲染优先；保留直出则必须配套 CSP（script-src/nonce 等）与回归用例（a/img 协议与属性白名单）。 |
| S1-05 | `crates/law-eye-api/src/routes/*` | 已补齐 API 输入校验基线（统一 JSON/Query 解析失败 4xx + deny_unknown_fields + 关键约束），但仍缺少“全路由统一的业务级校验网关” | Input Validation / OWASP A04 | 继续推进：validator/garde 等显式校验层 + 负向测试；对所有写接口实现字段范围/语义约束与统一错误码。 |

## ⚠️ SEVERITY 2: ARCHITECTURAL DEBT (Refactoring Candidates)
*(Issues affecting maintainability and scalability)*

### God Files (≥ 400 LOC)
- `Cargo.lock`: 5897 LOC
- `docs/plans/2025-01-18-frontend-api-integration.md`: 2424 LOC
- `docs/plans/2025-01-17-phase2-ai-enhancement.md`: 2078 LOC
- `docs/plans/2025-01-17-phase1-mvp-implementation.md`: 2052 LOC
- `apps/web/pnpm-lock.yaml`: 1623 LOC
- `docs/plans/2025-01-17-phase4-platform-capabilities.md`: 1565 LOC
- `docs/plans/2025-01-17-law-eye-design.md`: 1209 LOC
- `crates/law-eye-worker/src/main.rs`: 1161 LOC
- `apps/web/src/app/settings/page.tsx`: 1120 LOC
- `.claude/plan/ui-components-enhancement.md`: 1113 LOC
- `apps/web/src/lib/api/types.ts`: 1112 LOC
- `crates/law-eye-api/src/routes/articles.rs`: 1055 LOC
- `scripts/no-dockerhub/start-stack.sh`: 989 LOC
- `apps/web/e2e/lawsaw.e2e.spec.ts`: 946 LOC
- `apps/web/src/components/knowledge/knowledge-canvas.tsx`: 937 LOC
- `resource/DESIGN_HANDBOOK.md`: 915 LOC
- `crates/law-eye-core/src/article.rs`: 787 LOC
- `crates/law-eye-api/src/routes/knowledge.rs`: 675 LOC
- `apps/web/src/app/feedback/page.tsx`: 608 LOC
- `crates/law-eye-queue/src/lib.rs`: 589 LOC

### Panic/Crash Risks (unwrap/expect/panic): 59 处
- `crates/law-eye-ai/src/classify.rs:183`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/src/classify.rs:195`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/src/entity.rs:114`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:67`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:93`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:110`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:138`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:164`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:183`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:197`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:211`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-ai/tests/ai_tests.rs:224`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/main.rs:176`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/middleware/request_id.rs:157`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/openapi.rs:114`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/routes/auth.rs:20`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/routes/auth.rs:21`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-api/src/routes/sources.rs:375`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-core/src/feedback.rs:388`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-core/src/feedback.rs:392`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-core/src/feedback.rs:441`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-core/src/feedback.rs:457`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-core/src/feedback.rs:470`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-crawler/src/pipeline.rs:54`: 发现 unwrap/expect/panic（潜在宕机点）。
- `crates/law-eye-crawler/src/rss.rs:19`: 发现 unwrap/expect/panic（潜在宕机点）。

### Blocking I/O (std::fs): 0 处
- ✅ Vault TLS 证书/密钥读取已改为 `tokio::fs::read(...).await`（避免 async 路径阻塞 runtime worker 线程；见 `PERF-307`）。

##  SEVERITY 3: OPS GAPS (DevOps Readiness)
- [x] Docker/Compose 仅保留短生命周期 root init 且已隔离（禁网/最小能力/只读 rootfs/no-new-privileges）
- [x] 已提供 /health/live 与 /health/ready
- [x] 镜像 digest 已全面固定（Compose + enterprise compose + Dockerfile + 脚本内联 Dockerfile 均使用 tag@sha256；CI 已启用 TruffleHog/RustSec/pnpm audit + SBOM）
- [x] 未发现敏感字段日志（仅静态启发式）

## ️ PILLAR-BY-PILLAR FINDINGS (Enterprise Audit Matrix)

### 1. SECURITY & COMPLIANCE (OWASP & Zero Trust)
- **Secret Management: 环境文件/明文密钥**: 7
  - `.env:2`: 环境文件包含敏感键：POSTGRES_PASSWORD=[REDACTED]
  - `.env:3`: 环境文件包含敏感键：REDIS_PASSWORD=[REDACTED]
  - `.env:5`: 环境文件包含敏感键：MINIO_ROOT_PASSWORD=[REDACTED]
  - `.env:11`: 环境文件包含敏感键：JWT_SECRET=[REDACTED]
  - `.env.example:2`: 环境文件包含敏感键：POSTGRES_PASSWORD=[REDACTED]
  - `.env.example:3`: 环境文件包含敏感键：REDIS_PASSWORD=[REDACTED]
  - `.env.example:5`: 环境文件包含敏感键：MINIO_ROOT_PASSWORD=[REDACTED]
- **Secret Management: 密钥材料文件**: 1
  - `tmp/enterprise/vault/unseal.key:1`: 发现 Vault unseal key 文件存在于工作区（高危：可解封 Vault）。
- **连接串内嵌口令/凭证（DSN）**: 11
  - `.env.example:36`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5435/law_eye
  - `config/mcp-config.example.json:6`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5432/law_eye",
  - `docs/plans/2025-01-17-phase1-mvp-implementation.md:280`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5432/law_eye".to_string(),
  - `docs/plans/2025-01-17-phase1-mvp-implementation.md:1877`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5432/law_eye"
  - `docs/plans/2025-01-17-phase1-mvp-implementation.md:1892`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5432/law_eye
  - `docs/plans/2025-01-17-phase2-ai-enhancement.md:1268`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5435/law_eye".to_string(),
  - `docs/plans/2025-01-17-phase2-ai-enhancement.md:1288`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5435/law_eye"
  - `docs/plans/2025-01-17-phase2-ai-enhancement.md:1308`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@localhost:5435/law_eye
  - `prompts/adr/001_initial_audit.md:60`: 连接串疑似包含凭证：postgres://law_eye:[REDACTED]@...`），容易被复制到生产环境。
  - `scripts/enterprise/vault-init-enterprise.sh:396`: 连接串疑似包含凭证：redis://:[REDACTED]@redis:6379)"
  - `scripts/enterprise/vault-init.sh:364`: 连接串疑似包含凭证：redis://:[REDACTED]@redis:6379)"
- **URL userinfo（user:pass@）**: 2
  - `crates/law-eye-common/src/egress.rs:317`: URL 中包含 userinfo（user:pass@host），高风险。
  - `crates/law-eye-worker/src/main.rs:83`: URL 中包含 userinfo（user:pass@host），高风险。
- **XSS sinks（HTML 直出/DOM 注入）**: 1
  - `apps/web/src/components/article/article-content.tsx:156`: 发现潜在 XSS sink（dangerouslySetInnerHTML/innerHTML/insertAdjacentHTML）。
- **Shell/命令执行面（需追踪参数来源）**: 5
  - `apps/web/scripts/next-dev.mjs:1`: 发现命令执行面（child_process 或 std::process::Command），需追踪参数来源。
  - `apps/web/scripts/next-dev.mjs:24`: 发现命令执行面（child_process 或 std::process::Command），需追踪参数来源。
  - `apps/web/tsconfig.tsbuildinfo:1`: 发现命令执行面（child_process 或 std::process::Command），需追踪参数来源。
  - `crates/law-eye-api/src/middleware/rate_limit.rs:114`: 发现命令执行面（child_process 或 std::process::Command），需追踪参数来源。
  - `crates/law-eye-worker/src/main.rs:1130`: 发现命令执行面（child_process 或 std::process::Command），需追踪参数来源。

- **Input Validation**: 未观察到跨路由的统一 Schema Validation（仅靠 serde 反序列化不等价于 Zero Trust 校验）。
- **Data Privacy**: 静态扫描仅能识别可疑日志点；必须引入字段级脱敏与禁止日志字段策略。

### 2. RELIABILITY & RESILIENCY (The 5-Nines Check)
- **Timeouts**: 发现 reqwest::Client::new() 1 处（默认无全局 timeout；需确认请求级超时/Abort）。
- **Retries & Backoff**: 未见统一退避策略声明；对关键外部依赖应统一重试预算与指数退避。
- **Idempotency**: 未见 Idempotency-Key 字段/中间件；写接口需具备幂等键或去重语义。
- **Circuit Breakers**: 未见熔断器/隔离舱；建议对关键出站依赖引入断路器。

### 3. PERFORMANCE & SCALABILITY
- **Blocking I/O**: 存在 std::fs 调用（启动/请求路径需人工确认；在 Tokio 热路径会阻塞）。
- **Database Hygiene**: 未静态发现明显 SQL 拼接模式（当前口径）。
- **Pagination**: 未对所有 list endpoints 做逐个检查；要求默认分页与上限（limit cap）。

### 4. ARCHITECTURE & CODE QUALITY (SOLID / DDD)
- **God Files**: 43 个文件 ≥ 400 行（维护成本与安全回归风险上升）。
- **Cyclomatic Complexity**: 未启用 AST 级复杂度门禁（建议：ESLint complexity / Rust clippy + 自定义 lint）。
- **Hard Dependencies**: 多处直接构造服务对象（缺少 DI 接口层，测试替身困难）。

### 5. OBSERVABILITY & OPS (12-Factor App)
- **Structured Logging**: Rust 侧发现 tracing/TraceLayer；前端多为 console 日志，缺少 trace_id 贯穿。
- **Configuration**: Rust 配置支持 env + 文件 + Vault（加分），但 .env 落盘并入仓库属于重大倒扣分。
- **Health Checks**: 已提供 `/health`、`/health/live` 与 `/health/ready`（建议在 K8s/网关侧配置探针并强制超时/告警）。

### 6. SUPPLY CHAIN & DEPENDENCIES
- **Lock Files**: 发现 Cargo.lock 与 apps/web/pnpm-lock.yaml（确定性构建基础）。
- **CI Security Gates**: .github/workflows/ci.yml 包含 TruffleHog、RustSec、pnpm audit、SBOM 生成。
- **pnpm audit (apps/web)**: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
- **pnpm audit --dev (apps/web)**: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
- **Container Image Pinning**: 已移除可执行路径中的 `:latest`（compose n8n 已固定版本，脚本 MinIO 已移除 latest 回退）；仍建议进一步固定 digest。

## ️ EXECUTABLE REMEDIATION ROADMAP
1. **[Immediate]** 清除并轮换所有已落盘密钥（.env、unseal.key 等）；迁移到 Vault/KMS/Secret Manager 注入。
2. **[Immediate]** 对所有 HTML 直出点做强制审计：结构化渲染优先；保留则必须 CSP + URI policy + 回归用例。
3. **[Immediate]** Postgres 镜像与 Compose 硬化：运行期非 root；禁止默认弱口令；避免 SUPERUSER；最小权限。
4. **[Near-term]** 为 API 写接口引入统一 Schema Validation 层，并以负向测试驱动（拒绝多余字段/非法范围）。
5. **[Near-term]** 统一出站依赖治理：timeout + retry/backoff + circuit breaker + request_id。
6. **[Refactor]** 拆分 God Files，建立清晰 service 边界与 DI 接口，降低变更和审计成本。

---
### Scan Notes
- 扫描口径：静态/启发式（不执行代码）。
- 扫描文件数（排除构建/产物目录）: 745
- God Files（≥400 LOC）数量: 43

