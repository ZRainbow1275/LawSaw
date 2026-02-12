# 命题5：租户隔离与身份隔离 — 执行摘要

> **最后更新**: 2026-02-13
> **总体进度**: 第一阶段 + 第二阶段 **已完成**, RLS 覆盖率 **100%**, 第二轮审计修复 **已完成**

---

## 实施完成状态

### 第一阶段：RLS 覆盖补全 -- 已完成

- **032_rls_complete_coverage.sql** -- 已创建并就绪
  - `users` 表: 启用 RLS + FORCE RLS + tenant_isolation 策略
  - `roles` 表: 启用 RLS + FORCE RLS + tenant_isolation 策略
  - `user_roles` 表: 启用 RLS + FORCE RLS + tenant_isolation 策略
  - `api_keys` 表: 添加 tenant_id 列 (从 users 表回填) + NOT NULL + FK + 复合唯一约束 + 启用 RLS
  - `session_tenants` 表: 启用 RLS + FORCE RLS + tenant_isolation 策略
  - `sessions` 表: 启用 RLS + FORCE RLS, 通过 session_tenants JOIN 实现间接 RLS
  - 全表 DML 授权: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO law_eye_app`
- **RLS 覆盖率**: 100% (所有含 tenant_id 的表均已启用 RLS)

### 第二阶段：租户管理 CRUD -- 已完成

- **035_tenant_quotas.sql** -- 已创建并就绪
  - `tenant_configs` 表: 配额设置 (max_users/max_articles/max_sources/max_storage_mb/max_reports_per_month) + 功能开关 (feature_ai_enabled/feature_knowledge_graph/feature_report_generation/feature_webhook) + 品牌设置 (logo_url/primary_color)
  - `tenant_usage` 表: 用量缓存 (current_users/current_articles/current_sources/current_storage_mb/current_reports_this_month/last_refreshed_at)
  - 自动为现有租户插入默认配置和用量记录

- **Tenant CRUD API** (`law-eye-api/src/routes/tenants/`) -- 已实现
  - `GET    /api/v1/tenants` -- 列出所有租户
  - `POST   /api/v1/tenants` -- 创建租户
  - `GET    /api/v1/tenants/{id}` -- 获取租户详情 (含 config + usage)
  - `PUT    /api/v1/tenants/{id}` -- 更新租户
  - `DELETE /api/v1/tenants/{id}` -- 删除租户
  - `GET    /api/v1/tenants/{id}/config` -- 获取配额配置
  - `PUT    /api/v1/tenants/{id}/config` -- 更新配额配置
  - `GET    /api/v1/tenants/{id}/usage` -- 获取用量统计
  - `POST   /api/v1/tenants/{id}/usage/refresh` -- 刷新用量统计
  - 所有端点均带 utoipa OpenAPI 注解 + 审计日志

- **TenantService** (`law-eye-core/src/tenant.rs`) -- 已扩展
  - 支持 `UpdateTenantConfigInput` 部分更新
  - TenantConfig / TenantUsage 模型已在 law-eye-db 中定义

### 新增/修改文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `crates/law-eye-db/migrations/032_rls_complete_coverage.sql` | 新增 | RLS 覆盖补全 |
| `crates/law-eye-db/migrations/035_tenant_quotas.sql` | 新增 | 租户配额 + 用量表 |
| `crates/law-eye-db/src/models.rs` | 修改 | TenantConfig + TenantUsage 模型 |
| `crates/law-eye-core/src/tenant.rs` | 修改 | TenantService 扩展 |
| `crates/law-eye-api/src/routes/tenants/mod.rs` | 新增 | 路由定义 + utoipa 注解 |
| `crates/law-eye-api/src/routes/tenants/handlers.rs` | 新增 | 处理器实现 |
| `crates/law-eye-api/src/routes/tenants/dto.rs` | 新增 | DTO 定义 |

---

## 现状评估

### 已有多租户基础设施
| 组件 | 状态 | 迁移 | 评价 |
|------|------|------|------|
| tenants 表 | 已创建 | 006 | slug, name, 时间戳 |
| tenant_id 列 | 8 张核心表 | 006 | articles, users, sources, feedbacks, entities 等 |
| RLS 策略 | **所有租户表** | 006 + 032 | `current_setting('app.tenant_id', true)` -- **100% 覆盖** |
| law_eye_app 角色 | 已创建 | 007 | NOLOGIN, NOSUPERUSER, NOBYPASSRLS |
| with_tenant_tx() | 已实现 | -- | 事务级 set_config |
| 租户作用域角色 | 已实现 | 028 | roles, user_roles 租户隔离 |
| session_tenants | 已实现 | 028 | 会话-租户绑定 |
| **tenant_configs** | **已创建** | **035** | **配额 + 功能开关 + 品牌设置** |
| **tenant_usage** | **已创建** | **035** | **用量缓存表** |
| **Tenant CRUD API** | **已实现** | -- | **routes/tenants/ 完整 CRUD + config + usage** |

### 识别的 RLS 覆盖缺口 -- 全部已修复

以下表有 `tenant_id` 列但**缺少 RLS 策略** (全部已在 032 中修复):
1. ~~`objects` -- 文件存储~~ (已有 RLS, 早期迁移已覆盖)
2. ~~`domain_events` -- 领域事件~~ (已有 RLS, 早期迁移已覆盖)
3. ~~`webhook_endpoints` / `webhook_events` -- Webhook~~ (已有 RLS, 早期迁移已覆盖)
4. ~~`password_reset_tokens` -- 密码重置~~ (已有 RLS, 早期迁移已覆盖)
5. ~~`email_verification_tokens` -- 邮箱验证~~ (已有 RLS, 早期迁移已覆盖)
6. ~~`web_push_subscriptions` -- 推送订阅~~ (已有 RLS, 早期迁移已覆盖)
7. ~~`oauth_identities` -- 第三方身份~~ (已有 RLS, 早期迁移已覆盖)
8. ~~`api_keys` -- API 密钥~~ **032 已修复: 添加 tenant_id + RLS**
9. ~~`crawl_logs` -- 爬虫日志~~ (030 已添加 RLS)
10. ~~`users` -- 用户表~~ **032 已修复: 启用 RLS**
11. ~~`roles` -- 角色表~~ **032 已修复: 启用 RLS**
12. ~~`user_roles` -- 用户角色~~ **032 已修复: 启用 RLS**
13. ~~`session_tenants` -- 会话租户~~ **032 已修复: 启用 RLS**
14. ~~`sessions` -- 会话表~~ **032 已修复: 间接 RLS (通过 session_tenants JOIN)**

### 需要添加 tenant_id 的表
1. `categories` -- 全局分类表, 目前无租户隔离 (保持全局共享, 不需要 RLS)
2. `idempotency_keys` -- 幂等键表 (已有 tenant_id, 已有 RLS)

## 已有安全机制评估

### 认证层
- argon2 密码哈希 ✅
- OAuth SSO (Google 等) ✅
- MFA TOTP ✅
- API Key 认证 ✅
- Session 管理 (tower-sessions + Redis) ✅

### 授权层
- RBAC (角色-权限模型) ✅
- 17 种权限粒度 ✅
- RequireAuth + RequirePermission 中间件 ✅

### 数据层
- RLS (Row Level Security) ✅ **100% 覆盖**
- 审计日志 (防篡改) ✅
- 事务级租户上下文 ✅
- **租户配额系统** ✅
- **租户用量统计** ✅

## 安全评估：企业级就绪度

| 维度 | 当前得分 | 目标得分 | 差距 |
|------|---------|---------|------|
| 认证安全 | 9/10 | 9/10 | ✅ |
| 授权控制 | 8/10 | 9/10 | 需要更细粒度 |
| **数据隔离** | **9/10** | **9/10** | **✅ RLS 100% 覆盖 + 配额系统** |
| 审计合规 | 8/10 | 9/10 | 需要跨租户审计 |

## 待办项

- [ ] 第三阶段: 身份隔离强化
  - 确保用户会话只能访问已绑定的租户
  - 跨租户切换的安全审计
  - 超级管理员的跨租户访问审计
- [ ] 配额执行: 在写入操作前校验配额限制
- [ ] 租户用量自动刷新定时任务

### 审计修复记录 (2026-02-13 第二轮)

| 问题 | 严重度 | 修复内容 | 文件 |
|------|--------|----------|------|
| MCP 服务器完全绕过 RLS | P0 | 替换直接 `PgPoolOptions::new().connect()` 为 `law_eye_db::create_pool_with_session_role(_, 5, Some("law_eye_app"))` | `law-eye-mcp/src/main.rs` |
| tenant_configs / tenant_usage 表缺少 RLS | P1 | 创建 `036_tenant_config_rls.sql` 迁移: ENABLE + FORCE RLS + tenant_isolation 策略 + GRANT | `law-eye-db/migrations/036_tenant_config_rls.sql` |
| TenantService 缺少管理方法 | P1 | 添加 list_tenants / update_tenant / delete_tenant / get_config / update_config / get_usage / refresh_usage / check_quota | `law-eye-core/src/tenant.rs` |
