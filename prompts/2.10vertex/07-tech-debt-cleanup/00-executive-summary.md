# 命题7：技术债清理 — 执行摘要

> **最后更新**: 2026-02-13
> **总体进度**: 编译修复 + 迁移清理 + 服务注册 **已完成**, 第二轮深度审计修复 **已完成**

---

## 实施完成状态

### 编译状态: 0 错误, 0 警告

- `cargo check --workspace` -- **通过, 0 错误**
- `cargo clippy --workspace -- -D warnings` -- **通过, 0 警告**
- `pnpm tsc --noEmit` (apps/web) -- **通过, 0 错误**
- 所有新增模块 (report, tenant CRUD, cache, statistics) 已正确导入和注册
- Rust struct 与 SQL schema 字段已对齐

### 警告清理进度

- 已消除大部分 clippy 警告
- 剩余的 `#[allow(dead_code)]` 注解:
  - `AppState.pool` -- 保留, 供未来直接池访问
  - `AppState.ai_service` -- 保留, 部分路由尚未使用
  - `AppState.knowledge_service` -- 保留, 知识图谱路由正在开发
  - `AppBootstrapDeps.config_runtime` -- 保留, 运行时配置热更新功能预留
- 剩余的 `#[allow(clippy::too_many_arguments)]`:
  - `AppState::new()` -- 保留, 构造函数参数多但语义明确, 已有 `from_deps` builder 替代方案

### 迁移文件清理

- **删除了冲突的 `034_statistics_indexes.sql`**: 该文件与 `034_index_optimization.sql` 内容重叠 (8 个索引 vs 25+ 索引), 保留了更全面的 `034_index_optimization.sql`
- 迁移序列完整性: 001-035 (编号 017 不存在, 为历史遗留正常间隔)
- 所有迁移文件幂等: 使用 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `DO $$ ... IF NOT EXISTS ... $$`

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
- `crates/law-eye-api/src/openapi.rs`: 注册所有新端点到 utoipa OpenAPI spec

### 数据模型一致性

| 层 | 状态 | 说明 |
|----|------|------|
| SQL -> Rust | ✅ | Report / ReportTemplate / TenantConfig / TenantUsage 模型与 migrations 字段一致 |
| Rust -> TS | ✅ | 前端 API types 与后端 DTO 对齐 |
| 枚举值一致性 | ✅ | status / period_type / format 字符串字面量前后端一致 |

---

## 范围

本命题覆盖命题 4/5/6 完成后的全面技术债清理，确保：
1. 所有代码编译通过 (`cargo check --workspace`) -- **已达成**
2. 所有 clippy 警告消除 (`cargo clippy --workspace`) -- **基本达成, 剩余少量 allow 注解**
3. 前端类型检查通过 (`pnpm tsc --noEmit`) -- 待验证
4. 数据模型一致性 (Rust struct <-> SQL schema <-> TS type) -- **已达成**
5. 无未使用依赖 -- 待审查
6. 文档完整性 -- 本文档即为更新

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

### 代码质量 (P2) -- 部分完成
- [ ] `#[allow(dead_code)]` 注解清理 (剩余 4 处, 均为预留字段)
- [ ] `#[allow(clippy::*)]` 注解审查 (剩余 1 处 too_many_arguments)
- [x] 未使用 import 清理
- [x] 错误处理一致性 (Error 类型统一)

### 文档 (P3) -- 部分完成
- [ ] AGENTS.md 更新
- [ ] API 文档更新 (OpenAPI/Swagger)
- [ ] 部署文档更新 (docker-compose 配置说明)
- [x] 数据库迁移日志更新

## 验收标准

1. `cargo check --workspace` 零错误 -- **已达成**
2. `cargo clippy --workspace -- -D warnings` 零警告 -- **已达成** (第二轮修复后)
3. `pnpm tsc --noEmit` 零错误 -- **已达成** (第二轮验证)
4. Docker Compose `docker compose config --quiet` 验证通过 -- 待验证
5. 所有迁移文件幂等可重放 -- **已达成**

## 第二轮深度审计修复记录 (2026-02-13)

以下问题由 Claude Opus 4.6 深度审计发现并修复:

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

### P2 级修复 (代码质量)

| # | 问题 | 修复方案 | 文件 |
|---|------|----------|------|
| 11 | Reports/Templates 未注册到 OpenAPI | 注册 15 个端点 + 2 个 tag | `law-eye-api/src/openapi.rs` |
| 12 | aggregator.rs 重复 domain_root_label | 删除本地副本, 使用 crate 导入 | `law-eye-core/src/report/aggregator.rs` |
| 13 | dedup.rs Mutex::lock().unwrap() 可 panic | 使用 unwrap_or_else + into_inner 恢复中毒 | `law-eye-crawler/src/stages/dedup.rs` |
| 14 | export_report 未检查内容非空 | 入队前校验 content != {} | `law-eye-api/src/routes/reports/handlers.rs` |
