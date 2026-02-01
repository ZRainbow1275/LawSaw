# LawSaw / Law-Eye — Master Plan（单一真相源）

> 目的：把当前仓库演进为“可商业化交付”的云原生平台（安全、可观测、可扩展、可测试、可部署）。
>
> 约束：项目状态只能以磁盘文件为准；本文件为唯一“全局状态源”。任何重大决策必须以 ADR 形式记录在 `prompts/adr/`。

## 0. 当前状态（自动化验证口径）

**MISSION COMPLETE 判定（硬门槛）**
- `docker compose up` 成功，并且所有服务通过 healthcheck
- Monkey Tests 全部通过（不得导致系统崩溃/死锁/持续 5xx）

**最近一次验证（落盘口径）**
- 2026-02-01：`docker compose up --build -d` ✅；`scripts/monkey/api_monkey.py` ✅；`scripts/monkey/web_monkey.py` ✅；`cargo test --workspace` ✅；`pnpm -C apps/web test` ✅

**质量门槛（逐步收敛到强制）**
- Rust：`cargo test` 通过（workspace）
- Web：`pnpm -C apps/web lint && pnpm -C apps/web test`（若存在）
- 安全：不在仓库内存放任何明文密钥；运行时从 `.env`/Vault 注入

## 1. 模块划分（Spec-Driven 执行单元）

> 每个模块都必须走一遍 RALPH-LOOP：Spec → Implement → Verify（Unit/Integration/Monkey）→ Git Commit → Spec 归档。

| 模块ID | 模块名 | 范围 | 负责人 | 状态 |
|---|---|---|---|---|
| MOD-API | API 服务 | `crates/law-eye-api` | Agent | TODO |
| MOD-WORKER | Worker 服务 | `crates/law-eye-worker` | Agent | TODO |
| MOD-CORE | 领域服务层 | `crates/law-eye-core` | Agent | TODO |
| MOD-DB | 数据访问/迁移 | `crates/law-eye-db` | Agent | TODO |
| MOD-WEB | Web 前端 | `apps/web` | Agent | TODO |
| MOD-INFRA | Compose/容器/网关 | `docker-compose*.yml` / `Dockerfile*` / `infra/` | Agent | DONE（Verified） |
| MOD-QA | E2E/Monkey/Load | `scripts/` / `prompts/logs/` | Agent | IN_PROGRESS（Spec） |

## 2. 全局非功能性需求（NFR）

### 2.1 安全（OWASP & 12-Factor）
- Secrets：禁止写死在代码/compose；只允许 `.env`（本地）或 Vault（生产/企业）注入
- Auth：默认拒绝（Deny-by-default）；敏感操作需鉴权 + 速率限制 + 审计日志
- 数据库：RLS / Least Privilege；连接需支持 `session_role` 强制 RLS
- 输入：所有外部输入必须做严格校验（类型 + 约束 + 长度）

### 2.2 可观测性（Observability）
- 结构化日志（JSON）+ `request_id` 贯穿；关键链路打点（metrics）
- 关键错误必须包含可定位信息（模块、trace/request_id、错误码）

### 2.3 可靠性（Resilience）
- 超时/重试/幂等：外部依赖必须有超时；重试策略必须显式且有上限
- 熔断/隔离：对外部调用（如 LLM/Vault/S3）需具备熔断或退化策略

### 2.4 性能（Performance）
- 避免 N+1：列表接口必须以 JOIN/批量查询实现
- 避免阻塞 I/O：异步运行时内禁止长时间阻塞

## 3. 执行顺序（优先级）

1. Phase 1：生成 `prompts/adr/001_initial_audit.md`（取证式审计）
2. Phase 2：从 `MOD-INFRA` 开始（先确保“可部署可验证”），再逐步推进 `MOD-API`、`MOD-WORKER`、`MOD-WEB`
3. Phase 3：系统级 QA（E2E + Monkey + 简易负载检查）
4. Phase 4：云原生交付（多阶段镜像、非 root、compose 健康检查、README 一键启动）
