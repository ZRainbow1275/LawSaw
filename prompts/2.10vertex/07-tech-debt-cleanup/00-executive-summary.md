# 命题7：技术债清理 — 执行摘要

> **最后更新**: 2026-02-13
> **总体进度**: 编译修复 + 迁移清理 + 服务注册 + Mutex 毒锁恢复 + 死代码清理 + OpenAPI 补全 + TS 类型修复 **全部完成**, R1-R6 审计修复 **全部通过**

---

## 实施完成状态

### 完成度总览

| 模块 | 状态 | 说明 |
|------|------|------|
| cargo check --workspace | **通过, 0 错误** | 所有 crate 编译成功 |
| cargo clippy --workspace -- -D warnings | **通过, 0 警告** | R1-R6 修复后清零 |
| pnpm tsc --noEmit (apps/web) | **通过, 0 错误** | TS 类型全部对齐 |
| 17 处 Mutex `.expect()` 毒锁恢复 | **已完成** | 转为 `unwrap_or_else` + `into_inner` poison recovery |
| 死代码删除 (AuthError, CrawlTimer) | **已完成** | 已移除不再使用的类型定义 |
| 4 处过时 `#[allow(dead_code)]` 移除 | **已完成** | 仅保留 2 处必要注解 |
| OpenAPI tenants 注册 (9 端点) | **已完成** | 全部 9 个 tenants 端点已注册 |
| TS 类型修复 | **已完成** | sections_config / AuthResponse mfa 字段 / User tenant_id |
| enqueue -> enqueue_retryable | **已完成** | 报告导出入队改用可重试版本 |
| 审计轮次 | **R1-R6 全部完成** | 递归修复, 每轮验证 |

### 验证门禁状态

| 门禁命令 | 结果 | 说明 |
|---------|------|------|
| `cargo check --workspace` | **PASS** | 0 错误 |
| `cargo clippy --workspace -- -D warnings` | **PASS** | 0 警告 |
| `pnpm tsc --noEmit` (apps/web) | **PASS** | 0 错误 |

### 编译状态: 0 错误, 0 警告

- `cargo check --workspace` -- **通过, 0 错误**
- `cargo clippy --workspace -- -D warnings` -- **通过, 0 警告**
- `pnpm tsc --noEmit` (apps/web) -- **通过, 0 错误**
- 所有新增模块 (report, tenant CRUD, cache, statistics, circuit_breaker) 已正确导入和注册
- Rust struct 与 SQL schema 字段已对齐

### Mutex 毒锁恢复 (17 处)

以下 8 个文件中共 17 处 `Mutex::lock().expect(...)` / `.unwrap()` 已全部转换为 poison recovery 模式:

| 文件 | 修改处数 | 恢复策略 |
|------|---------|---------|
| `crates/law-eye-crawler/src/anti_crawl/rate_limiter.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-crawler/src/anti_crawl/robots.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-crawler/src/incremental/conditional.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-crawler/src/incremental/content_hash.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-crawler/src/stages/dedup.rs` | 3 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-queue/src/lib.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-api/src/routes/search.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |
| `crates/law-eye-api/src/routes/objects.rs` | 2 | `unwrap_or_else(\|e\| e.into_inner())` |

### 死代码清理

- **AuthError** 类型: 已删除 (不再被任何模块引用)
- **CrawlTimer** 类型: 已删除 (被 observability 模块替代)
- **4 处过时 `#[allow(dead_code)]` 注解**: 已移除
  - 当前仅保留 2 处必要的 `#[allow(dead_code)]`:
    - `AppState.pool` (state.rs): 保留, 供未来直接池访问
    - `ContentHashStore` 内部字段 (content_hash.rs): 保留, 结构体字段通过方法访问

### 警告清理进度

- 已消除全部 clippy 警告 (R1-R6 递归修复)
- 剩余的 `#[allow(clippy::too_many_arguments)]`:
  - `AppState::new()` -- 保留, 构造函数参数多但语义明确, 已有 `from_deps` builder 替代方案

### 迁移文件清理

- **删除了冲突的 `034_statistics_indexes.sql`**: 该文件与 `034_index_optimization.sql` 内容重叠 (8 个索引 vs 25+ 索引), 保留了更全面的 `034_index_optimization.sql`
- 迁移序列完整性: 001-036 (编号 017 不存在, 为历史遗留正常间隔)
- 所有迁移文件幂等: 使用 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `DO $$ ... IF NOT EXISTS ... $$`

### OpenAPI 端点注册

- **tenants 模块**: 9 个端点全部注册到 utoipa spec
  - list_tenants / create_tenant / get_tenant / update_tenant / delete_tenant
  - get_tenant_config / update_tenant_config / get_tenant_usage / refresh_tenant_usage
  - tag: `(name = "tenants", description = "Tenant management")`
- **reports 模块**: 15 个端点 + 2 个 tag (在命题四中完成)
- **statistics 模块**: 已注册 (在命题三中完成)

### 服务注册

所有新增服务已在 `crates/law-eye-api/src/state.rs` 中注册:

| 服务 | AppState 字段 | 类型 |
|------|--------------|------|
| ReportService | `report_service` | `Arc<ReportService>` |
| ReportTemplateService | `report_template_service` | `Arc<ReportTemplateService>` |
| TenantService | `tenant_service` | `Arc<TenantService>` |
| StatisticsService | `statistics_service` | `Arc<StatisticsService>` |
| CacheService | `cache_service` | `Option<Arc<CacheService>>` |
| RagService | `rag_service` | `Arc<RagService>` |
| KnowledgeService | `knowledge_service` | `Arc<KnowledgeService>` |

### 模块注册

- `crates/law-eye-core/src/lib.rs`: 导出 `report` 模块, pub use ReportService / ReportTemplateService
- `crates/law-eye-core/src/lib.rs`: 导出 `statistics` 模块, pub use StatisticsService
- `crates/law-eye-core/src/lib.rs`: 导出 `tenant` 模块, pub use TenantService
- `crates/law-eye-api/src/routes/mod.rs`: 注册 reports / tenants / statistics 路由
- `crates/law-eye-api/src/openapi.rs`: 注册所有新端点到 utoipa OpenAPI spec (reports 15 + tenants 9)

### 前端 TypeScript 类型修复

| 类型/字段 | 文件 | 修复内容 |
|----------|------|---------|
| `ReportTemplate.sections_config` | `apps/web/src/lib/api/types.ts` | 添加 `sections_config: unknown` 字段, 对齐后端 JSONB 类型 |
| `AuthResponse.mfa_required` | `apps/web/src/lib/api/types.ts` | 添加 `mfa_required?: boolean` 可选字段 |
| `AuthResponse.mfa_challenge` | `apps/web/src/lib/api/types.ts` | 添加 `mfa_challenge?: string` 可选字段 |
| `User.tenant_id` | `apps/web/src/lib/api/types.ts` | 确保 `tenant_id: string` 字段存在于所有用户相关类型 |

### enqueue -> enqueue_retryable 迁移

- 报告导出入队: `enqueue` 替换为 `enqueue_retryable` (涉及文件: `law-eye-api/src/routes/reports/handlers.rs`)
- AI 任务入队: `enqueue_retryable` 已在 `law-eye-api/src/routes/ai.rs` 使用
- 数据源入队: `enqueue_retryable` 已在 `law-eye-api/src/routes/sources.rs` 使用
- Worker 侧: `enqueue_retryable` 已在 `law-eye-worker/src/main.rs` 使用

### 数据模型一致性

| 层 | 状态 | 说明 |
|----|------|------|
| SQL -> Rust | **全部对齐** | Report / ReportTemplate / TenantConfig / TenantUsage 模型与 migrations 字段一致 |
| Rust -> TS | **全部对齐** | 前端 API types 与后端 DTO 对齐 (含 sections_config / mfa fields / tenant_id) |
| 枚举值一致性 | **全部对齐** | status / period_type / format 字符串字面量前后端一致 |

---

## 范围

本命题覆盖命题 4/5/6 完成后的全面技术债清理，确保：
1. 所有代码编译通过 (`cargo check --workspace`) -- **已达成**
2. 所有 clippy 警告消除 (`cargo clippy --workspace -- -D warnings`) -- **已达成 (R1-R6 修复后)**
3. 前端类型检查通过 (`pnpm tsc --noEmit`) -- **已达成**
4. 数据模型一致性 (Rust struct <-> SQL schema <-> TS type) -- **已达成**
5. Mutex 毒锁安全 (17 处 .expect() 转 poison recovery) -- **已达成**
6. 死代码清除 (AuthError, CrawlTimer, 4 处 stale allow 注解) -- **已达成**
7. OpenAPI 完整性 (tenants 9 端点注册) -- **已达成**

## 技术债分类

### 编译级 (P0) -- 已完成
- [x] 新增 report 模块的 Cargo.toml 依赖声明 (tera, docx-rs, plotters, plotters-svg)
- [x] 新增数据库模型字段同步 (Report, ReportTemplate, TenantConfig, TenantUsage)
- [x] 模块注册 (mod.rs 导出)
- [x] API 路由注册 (routes/mod.rs)

### 类型一致性 (P1) -- 已完成
- [x] 前端 API 类型定义与后端 OpenAPI 规范对齐
- [x] Rust 模型与 SQL schema 字段对齐
- [x] 枚举值一致性 (status, type 等字符串字面量)
- [x] TS 类型修复: sections_config / AuthResponse mfa 字段 / User tenant_id

### 安全与稳定性 (P1) -- 已完成
- [x] 17 处 Mutex `.expect()` 转 poison recovery (unwrap_or_else + into_inner)
- [x] 死代码删除: AuthError / CrawlTimer 类型
- [x] 4 处过时 `#[allow(dead_code)]` 注解移除
- [x] enqueue -> enqueue_retryable 迁移 (报告导出)

### 代码质量 (P2) -- 已完成
- [x] `#[allow(dead_code)]` 注解清理 (剩余 2 处均为必要保留)
- [x] `#[allow(clippy::*)]` 注解审查 (剩余 1 处 too_many_arguments, 保留)
- [x] 未使用 import 清理
- [x] 错误处理一致性 (Error 类型统一)
- [x] OpenAPI tenants 9 端点注册

### 文档 (P3) -- 部分完成
- [ ] AGENTS.md 更新
- [ ] API 文档更新 (OpenAPI/Swagger)
- [ ] 部署文档更新 (docker-compose 配置说明)
- [x] 数据库迁移日志更新

## 验收标准

1. `cargo check --workspace` 零错误 -- **已达成**
2. `cargo clippy --workspace -- -D warnings` 零警告 -- **已达成** (R1-R6 修复后)
3. `pnpm tsc --noEmit` 零错误 -- **已达成**
4. Docker Compose `docker compose config --quiet` 验证通过 -- 待验证
5. 所有迁移文件幂等可重放 -- **已达成**
6. Mutex 毒锁安全 (17 处 poison recovery) -- **已达成**
7. 死代码清除 (AuthError/CrawlTimer/stale allow) -- **已达成**

## 审计修复总记录 (2026-02-13 R1-R6)

### R1-R6 轮次概览

| 轮次 | 主题 | 修复数量 | 关键修复 |
|------|------|---------|---------|
| R1 | 编译级修复 | 4 | 模块注册, 依赖声明, 模型同步 |
| R2 | 类型一致性 | 5 | TS 类型修复, 枚举值对齐, DTO 同步 |
| R3 | 安全与 RLS | 4 | MCP RLS 绕过, tenant_configs RLS, session fixation |
| R4 | 功能阻断 | 3 | Worker queue:report 消费者, 报告编号竞态, 风险阈值统一 |
| R5 | 稳定性 | 5 | 连接池加固, 批量 upsert, Mutex 毒锁, CircuitBreaker |
| R6 | 代码质量 | 6 | 死代码清理, OpenAPI 补全, enqueue_retryable, 缓存失效精简 |

### P0 级修复 (安全/功能阻断)

| # | 问题 | 影响范围 | 修复方案 | 文件 |
|---|------|----------|----------|------|
| 1 | MCP 服务器连接池未设置 SET ROLE, 完全绕过 RLS | 数据安全 | 替换为 `law_eye_db::create_pool_with_session_role(_, 5, Some("law_eye_app"))` | `law-eye-mcp/src/main.rs` |
| 2 | Worker 缺少 `queue:report` AI 生成消费者 | 报告生成功能不可用 | 添加 `ReportGenerateTask` + 消费者 + 完整处理流程 | `law-eye-queue/src/lib.rs`, `law-eye-worker/src/main.rs` |
| 3 | 文章写操作无缓存失效 | 数据陈旧 | 在 6 个写操作 handler 添加 `invalidate_resource` | `law-eye-api/src/routes/articles.rs` |
| 4 | ArticleResponse 缺少 tags/keywords/ai_metadata | 前端数据不完整 | 添加字段 + From impl 映射 | `law-eye-api/src/routes/articles.rs` |

### P1 级修复 (功能缺陷/稳定性)

| # | 问题 | 影响范围 | 修复方案 | 文件 |
|---|------|----------|----------|------|
| 5 | tenant_configs / tenant_usage 缺少 RLS | 租户配额数据泄露 | 创建 036_tenant_config_rls.sql 迁移 | `law-eye-db/migrations/036_tenant_config_rls.sql` |
| 6 | 报告编号 next_report_number 并发竞态 | 重复编号 | 添加 pg_advisory_xact_lock + MAX 替代 COUNT | `law-eye-core/src/report/service.rs` |
| 7 | 风险阈值不一致 (service 76/51 vs aggregator 80/60) | 数据矛盾 | 统一为 80/60 + 中文标签 | `law-eye-core/src/report/service.rs` |
| 8 | 连接池缺少关键参数 | 长期运行失效连接 | 添加 min_connections + idle_timeout + max_lifetime | `law-eye-db/src/lib.rs` |
| 9 | upsert_many 无批量限制 (PG $65535 参数上限) | 大批量插入崩溃 | 添加 BATCH_SIZE=500 分批逻辑 | `law-eye-core/src/article/service.rs` |
| 10 | TenantService 缺少管理方法 | 租户CRUD不可用 | 添加 8 个管理方法 + UpdateTenantConfigInput | `law-eye-core/src/tenant.rs` |
| 11 | 17 处 Mutex .expect() 可导致 panic | 线程 panic 级联 | 转为 unwrap_or_else + into_inner poison recovery | 8 个文件 |

### P2 级修复 (代码质量)

| # | 问题 | 修复方案 | 文件 |
|---|------|----------|------|
| 12 | Reports/Templates 未注册到 OpenAPI | 注册 15 个端点 + 2 个 tag | `law-eye-api/src/openapi.rs` |
| 13 | OpenAPI 缺少 tenants 端点 | 注册 9 个端点 + 1 个 tag | `law-eye-api/src/openapi.rs` |
| 14 | aggregator.rs 重复 domain_root_label | 删除本地副本, 使用 crate 导入 | `law-eye-core/src/report/aggregator.rs` |
| 15 | 死代码: AuthError / CrawlTimer | 删除不再使用的类型定义 | 多个文件 |
| 16 | 4 处过时 #[allow(dead_code)] | 移除不再需要的注解 | 多个文件 |
| 17 | TS 类型缺失: sections_config / mfa fields / tenant_id | 添加缺失字段到 types.ts | `apps/web/src/lib/api/types.ts` |
| 18 | enqueue 未使用 retryable 版本 | 报告导出改用 enqueue_retryable | `law-eye-api/src/routes/reports/handlers.rs` |
| 19 | export_report 未检查内容非空 | 入队前校验 content != {} | `law-eye-api/src/routes/reports/handlers.rs` |
| 20 | 6 处冗余 overview 缓存失效 | 精简为仅 invalidate "statistics" | `law-eye-api/src/routes/articles.rs` |
