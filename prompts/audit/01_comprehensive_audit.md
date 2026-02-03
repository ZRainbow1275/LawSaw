# ️ ENTERPRISE GAP ANALYSIS REPORT
**Date**: 2026-02-03
**System Maturity Score**: 15/100

##  SEVERITY 1: CRITICAL BLOCKERS (Must Fix Before Deploy)
*(Security risks, data loss risks, potential crashes)*
| ID | Component | Issue | Violation Type | Remediation |
|----|-----------|-------|----------------|-------------|
| S1-01 | `.env` | 工作区存在明文敏感配置（口令/API Key/JWT Secret）且文件被纳入仓库 | OWASP A07 / Secret Management | 将所有密钥迁移到 Secret Manager/Vault/KMS 注入；立刻轮换已暴露凭证；CI 强制 Secret 扫描并阻断；禁止把 .env 纳入版本控制。 |
| S1-02 | `tmp/enterprise/vault/unseal.key` | Vault Unseal Key 落盘于工作区（等同 Vault root 级别控制权） | Zero Trust / Key Material Sprawl | 从工作区移除并视为已泄露进行轮换；改为一次性生成/外部安全存储；严禁在仓库目录生成/缓存。 |
| S1-03 | `Dockerfile.postgres-pgvector` / `docker-compose*.yml` | Postgres 容器/初始化链存在 root 启动路径（或 root init 容器） | Container Hardening / Privilege Escalation | 确保运行期为非 root（USER postgres/指定 user）；最小权限；移除默认弱口令；避免创建 SUPERUSER；加固 entrypoint 与卷权限。 |
| S1-04 | `apps/web/src/components/article/article-content.tsx` | 存在 HTML 直出渲染点（dangerouslySetInnerHTML） | OWASP A03 XSS | 优先改为结构化渲染；若必须保留：收紧 DOMPurify allowlist + 明确 URI scheme policy + CSP。 |
| S1-05 | `crates/law-eye-api/src/routes/*` | 未发现系统级请求 Schema Validation 网关（仅 serde 反序列化不足以满足 Zero Trust） | Input Validation / OWASP A04 | 为所有公开写接口引入显式验证层（validator/garde 等）；query/body 白名单 + range + 业务约束；统一 4xx 错误结构；增加负向用例。 |

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

### Blocking I/O (std::fs): 3 处
- `crates/law-eye-common/src/config.rs:479`: 发现 std::fs::*（若位于 async/高频路径，会阻塞线程）。
- `crates/law-eye-common/src/config.rs:481`: 发现 std::fs::*（若位于 async/高频路径，会阻塞线程）。
- `crates/law-eye-common/src/config.rs:483`: 发现 std::fs::*（若位于 async/高频路径，会阻塞线程）。

##  SEVERITY 3: OPS GAPS (DevOps Readiness)
- [ ] Docker/Compose 存在 root 运行路径（含 init/root user）
- [ ] 缺少 /health/live 与 /health/ready
- [ ] 使用 latest 或未固定 tag/digest 镜像
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
- **Health Checks**: 发现 /health，缺少 /health/live 和 /health/ready。

### 6. SUPPLY CHAIN & DEPENDENCIES
- **Lock Files**: 发现 Cargo.lock 与 apps/web/pnpm-lock.yaml（确定性构建基础）。
- **CI Security Gates**: .github/workflows/ci.yml 包含 TruffleHog、RustSec、pnpm audit、SBOM 生成。
- **pnpm audit (apps/web)**: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
- **pnpm audit --dev (apps/web)**: {'info': 0, 'low': 0, 'moderate': 0, 'high': 0, 'critical': 0}
- **Container Image Pinning**: 2 处使用 latest 或未固定 tag/digest。

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

