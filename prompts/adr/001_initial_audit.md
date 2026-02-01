# ADR-001：初始取证式架构审计（Enterprise Architectural Audit）

日期：2026-02-01  
范围：整个仓库（Rust workspace + Next.js Web + Docker/Compose + infra）

> 本文是“现状盘点 + 风险清单 + 演进建议”。后续任何实质性架构选择（如镜像基座、Secrets 方案、测试框架、网关形态）必须单独写 ADR。

---

## 1) Domain Analysis（DDD 视角）

### 1.1 核心域（Core Domain）
- **内容采集与知识化（Legal Intelligence Pipeline）**
  - 来源（Source）、文章（Article）、分类（Category）、知识库/RAG（Knowledge/Rag）
  - 典型闭环：采集 → 归档/清洗 → AI 处理（分类/摘要/风险/标签/向量）→ 检索/RAG → 反馈闭环
  - 主要落点：`crates/law-eye-core`（服务层）+ `crates/law-eye-crawler`（采集）+ `crates/law-eye-ai`（LLM/Embedding）

### 1.2 支撑域（Supporting Domain）
- **多租户隔离（Tenant）**：租户级数据隔离与权限模型（`crates/law-eye-core/src/tenant/*`）
- **鉴权与权限（Auth/RBAC）**：会话、角色、权限校验（API 路由层广泛使用）
- **审计与可追溯（Audit）**：审计日志与防篡改（migration `009_audit_logs_tamper_proof.sql`）
- **对象存储（Object）**：用户头像/附件等（`crates/law-eye-core/src/object/*`）

### 1.3 通用子域（Generic Subdomain）
- 配置加载/Secrets（`crates/law-eye-common/src/config.rs`、Vault KV/Transit）
- 队列与异步任务（`crates/law-eye-queue`）
- 通知/邮件模板（`crates/law-eye-core/src/email/*`）

### 1.4 “业务逻辑泄漏”初判（Controller/View）
- API 层（`crates/law-eye-api/src/routes/*.rs`）以 **入参校验 + 权限校验 + 调用服务** 为主，核心业务大多在 `law-eye-core`，总体分层健康。
- 仍存在可演进点：**权限校验重复**（`has_permission` 逻辑在大量 handler 里重复出现），可下沉为 extractor/middleware（保持“默认拒绝”语义不变）。

---

## 2) Anti-Pattern Detection（反模式）

### 2.1 God Object / God Module
- `crates/law-eye-api/src/state.rs` 的 `AppState` 聚合了大量 Service（典型但可控）。
  - 风险：跨模块耦合逐渐增大，测试时难以替换依赖。
  - 建议：在 Phase 2 按模块引入“面向接口的依赖注入”（trait + 构造器），并为路由层提供轻量 facade（避免状态对象无限膨胀）。

### 2.2 隐式配置通道（容易导致“配置漂移”）
- `AppState::new` 在 `llm_gateway` 为空时，会 **回退读取** `OPENAI_API_KEY/OPENAI_BASE_URL`（`crates/law-eye-api/src/state.rs`）。
  - 风险：即使 `AppConfig` 显示未配置 AI，也可能因进程环境存在 `OPENAI_API_KEY` 而被动启用（行为不可预测，且可能绕过 Vault/12-Factor 约束）。
  - 建议：将 AI 启用/禁用完全收敛到 `AppConfig`（或 Vault），禁止 “隐式环境变量回退”。

### 2.3 产物污染（Build Artifacts）
- `apps/web/.next` 等构建产物存在于工作区（虽有 `.gitignore`，但会干扰扫描/grep/体积）。
  - 建议：清理构建产物，并在 CI/本地脚本中统一构建输出目录策略。

> Rust 生态本身禁止 crate 级循环依赖，因此“编译级循环依赖”不存在；但仍需关注运行时/逻辑层面的耦合扩散（通过模块边界与 trait/DTO 收敛）。

---

## 3) Security & Config（OWASP Top 10 + 12-Factor）

### 3.1 Secrets/明文敏感信息
发现（需要整改）：
- `docker-compose.yml` / `docker-compose.enterprise.yml`：MinIO 账号密码与 S3 key 明文为 `minioadmin`，并且 MinIO 以 `user: "0:0"`（root）运行。
- `config/default.toml` 与 `AppConfig::default()`：包含开发默认的 DB 凭证（`postgres://law_eye:law_eye@...`），容易被复制到生产环境。

已具备的能力（正向）：
- `law-eye-common` 支持 Vault KV v2 拉取 DB/Redis/OpenAI/S3 等 secrets，并支持 Vault Transit 加密（反馈敏感字段）。
- API 层对 URL 日志进行了 redact（`redact_sensitive_url`）。

建议（Phase 2/INFRA 模块落地）：
- 本地：用 `.env` 注入（只提交 `.env.example`），compose 中不出现任何默认明文密码。
- 生产：优先 Vault 注入（enterprise compose 已具雏形），并把 MinIO/S3 访问密钥也纳入 Vault（compose env 置空）。

### 3.2 鉴权/会话/CSRF/CORS
现状：
- `/api/v1` 默认需要 session（`routes/mod.rs` 上的 `RequireAuth`），并对登录/注册做了速率限制。
- `RequestIdLayer` + `TraceLayer` 已贯穿请求链路；`CsrfLayer` 与 CORS allowlist 已引入。

建议：
- 将“权限校验”提炼为可复用的 extractor（减少重复代码与漏配风险）。

### 3.3 SQLi / XSS
初判：
- 后端使用 `sqlx`，未发现明显拼接 SQL（唯一动态 SQL 为 `SET ROLE`，且有严格白名单校验）。
- 前端对富文本内容使用 DOMPurify 且避免 SSR 注入（`apps/web/src/components/article/article-content.tsx` 方向正确）。

建议：
- 邮件模板、富文本渲染、用户可控字段继续保持“输出编码/白名单”策略；新增渲染点必须走统一 sanitizer。

### 3.4 Redis 暴露面
风险：
- `Dockerfile.redis` 使用 `--protected-mode no` 且 compose 暴露端口到 host（无密码），对开发机/局域网存在明显风险。
建议：
- 默认 compose 不对外暴露 Redis，或开启 requirepass 并只允许内部网络访问。

---

## 4) Performance（N+1 / 阻塞 I/O / 超时）

### 4.1 潜在 N+1
观察：
- API 列表接口以 `ArticleService::list_filtered/count_filtered` 等批量方法为主（倾向正确）。
风险点：
- 若业务演进引入“列表 + 每条额外查询”（如 categories/permissions/attachments），容易形成 N+1。
建议：
- 在 `law-eye-core` 的服务层建立“批量查询/预加载”规范，并用基准测试或 slow-query 日志兜底。

### 4.2 外部调用可靠性（LLM/Vault/S3）
现状：
- Vault 客户端设置了 timeout（`VaultSecretsConfig.request_timeout_ms`）。
- LLM Gateway（`crates/law-eye-ai/src/gateway.rs`）目前缺少显式 timeout / retry / circuit breaker。
建议：
- 为 LLM/Embedding 增加：
  - `tokio::time::timeout` 预算
  - 可配置重试（仅对幂等请求，且有限次数/指数退避）
  - 熔断或快速失败（避免雪崩）

---

## 结论（下一步落地）

优先级（从“可商业化交付”硬门槛倒推）：
1. **INFRA**：Secrets 收敛、Redis/MinIO 安全基线、容器非 root、compose 一键启动稳定
2. **QA**：Monkey/E2E 脚本加入并可重复执行（输出到 `prompts/logs/`）
3. **API/AI**：移除隐式环境变量回退，补齐外部调用超时与降级策略

