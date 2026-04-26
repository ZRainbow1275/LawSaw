# SPEC-01 — ReBAC 角色权限矩阵（5-Tier）

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `prompts/0322/REBAC_USER_END.md`, `crates/law-eye-db/migrations/{028,050,052,055..058}_*.sql`, `crates/law-eye-core/src/authz.rs`  
**实现入口**: `crates/law-eye-api/src/middleware/authz.rs` + `crates/law-eye-core/src/authz.rs`  
**前端镜像**: `apps/web/src/lib/authz.ts` + `apps/web/src/stores/auth-store.ts` + `apps/web/src/hooks/use-authz.ts`

---

## 1. 角色层级（RoleTier）

```
basic_user(0) → verified_user(1) → premium_user(2) → tenant_admin(3) → super_admin(4)
```

数值用于 `is_at_least(min_tier)` 比较。**不**直接暴露给前端 UI；前端只看 RoleTier 字符串名。

### 1.1 角色推导（后端唯一真源）

```rust
// crates/law-eye-core/src/authz.rs
pub fn derive_role_tier_from_names(role_names: &[&str]) -> RoleTier {
    if role_names.contains(&"super_admin") { return RoleTier::SuperAdmin; }
    if role_names.iter().any(|r| matches!(*r, "tenant_admin" | "admin")) { return RoleTier::TenantAdmin; }
    if role_names.contains(&"premium_user") { return RoleTier::PremiumUser; }
    if role_names.iter().any(|r| matches!(*r, "verified_user" | "editor")) { return RoleTier::VerifiedUser; }
    RoleTier::BasicUser
}
```

### 1.2 单测覆盖矩阵

| 输入 `role_names` | 期望 |
|---|---|
| `[]` | `BasicUser` |
| `["viewer"]` | `BasicUser` |
| `["editor"]` | `VerifiedUser` |
| `["verified_user"]` | `VerifiedUser` |
| `["premium_user"]` | `PremiumUser` |
| `["admin"]` | `TenantAdmin` |
| `["tenant_admin"]` | `TenantAdmin` |
| `["super_admin"]` | `SuperAdmin` |
| `["editor", "premium_user"]` | `PremiumUser`（取最高） |
| `["super_admin", "viewer"]` | `SuperAdmin` |

---

## 2. 权限矩阵（Permissions × RoleTier）

权限字符串遵循 `<resource>:<action>` 格式（`*` 为通配）。下表 ✓ 表示有；空表示无。

| 权限字符串 | basic | verified | premium | tenant_admin | super_admin |
|---|:---:|:---:|:---:|:---:|:---:|
| `articles:read` | ✓（受限） | ✓ | ✓ | ✓ | ✓ |
| `articles:read:full` |  |  | ✓ | ✓ | ✓ |
| `articles:write` |  |  |  | ✓ | ✓ |
| `articles:publish` |  |  |  | ✓ | ✓ |
| `articles:pin` |  |  |  | ✓ | ✓ |
| `articles:archive` |  |  |  | ✓ | ✓ |
| `sources:read:name` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `sources:read:meta` |  | ✓ | ✓ | ✓ | ✓ |
| `sources:read:full` |  |  | ✓ | ✓ | ✓ |
| `sources:write` |  |  |  | ✓ | ✓ |
| `sources:publish` |  |  |  |  | ✓ |
| `categories:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `categories:write` |  |  |  | ✓ | ✓ |
| `channels:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `channels:write` |  |  |  | ✓ | ✓ |
| `channels:visibility` |  |  |  | ✓ | ✓ |
| `reports:read` | ✓（公开） | ✓ | ✓ | ✓ | ✓ |
| `reports:read:full` |  |  | ✓ | ✓ | ✓ |
| `reports:write` |  |  |  | ✓ | ✓ |
| `reports:export` |  |  | ✓ | ✓ | ✓ |
| `reports:template` |  |  |  | ✓ | ✓ |
| `reports:subscribe` |  | ✓ | ✓ | ✓ | ✓ |
| `analytics:read` | ✓（基础） | ✓ | ✓ | ✓ | ✓ |
| `analytics:read:full` |  |  | ✓ | ✓ | ✓ |
| `knowledge:read` | ✓（只读） | ✓ | ✓ | ✓ | ✓ |
| `knowledge:write` |  |  |  | ✓ | ✓ |
| `knowledge:manage` |  |  |  | ✓ | ✓ |
| `feedbacks:write` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `feedbacks:read` |  |  |  | ✓ | ✓ |
| `feedbacks:reply` |  |  |  | ✓ | ✓ |
| `banners:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `banners:manage` |  |  |  | ✓ | ✓ |
| `pins:manage` |  |  |  | ✓ | ✓ |
| `users:read` |  |  |  | ✓ | ✓ |
| `users:write` |  |  |  | ✓ | ✓ |
| `users:delete` |  |  |  |  | ✓ |
| `roles:assign` |  |  |  | ✓ | ✓ |
| `tenants:read` |  |  |  | ✓ | ✓ |
| `tenants:manage` |  |  |  |  | ✓ |
| `apikeys:read` |  |  |  | ✓ | ✓ |
| `apikeys:manage` |  |  |  | ✓ | ✓ |
| `audit:read` |  |  |  | ✓ | ✓ |
| `audit:export` |  |  |  |  | ✓ |
| `ai:use:summary` |  | ✓ | ✓ | ✓ | ✓ |
| `ai:use:sentiment` |  |  | ✓ | ✓ | ✓ |
| `ai:use:report` |  |  |  | ✓ | ✓ |
| `ai:use:kg` |  |  |  | ✓ | ✓ |
| `ai:governance` |  |  |  | ✓ | ✓ |
| `webhooks:manage` |  |  |  | ✓ | ✓ |
| `*` |  |  |  |  | ✓ |

### 2.1 数据库种子（seed）

每次创建租户时（`tenants:create`）自动 seed 角色 + 权限映射到 `roles` + `role_permissions` 表。
入口：`law-eye-services::tenant_service::create_by_slug` 调用 `ensure_tenant_roles_seeded`。

---

## 3. 资源-关系约束（ReBAC）

除上述全局权限外，`auth_relations` 表支持资源级 fine-grained 授权：

```sql
auth_relations (
  id UUID PK,
  tenant_id UUID,
  resource_type TEXT,      -- "article" | "source" | "report" | "channel" | "feedback" | "banner" | "object" | "tenant"
  resource_id UUID,
  relation TEXT,           -- "owner" | "editor" | "viewer" | "subscriber"
  subject_type TEXT,       -- "user" | "role" | "group"
  subject_key TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID
)
```

### 3.1 决策顺序（保持现状，prompts/0322 §7.4 已定）

```
1. Tenant 隔离：资源 tenant_id == 当前 session.tenant_id（除 super_admin 跨租户）
2. 关系匹配：在 auth_relations 表查 (resource_type, resource_id, relation, {user|role|group})
3. 角色基线：用户角色 permissions 列含请求的 permission
4. 默认拒绝
```

### 3.2 接口

```
GET /api/v1/authz/check
  ?resource_type={...}
  &resource_id={uuid}
  &permission={string}

→ 200 { allow, decision_path[], role_tier, matched_relation, matched_subject, roles[], permissions[] }
→ 401 / 403 / 404 / 429 / 500
```

前端 hook：`useAuthzDecision(resourceType, resourceId, permission)` — React Query 缓存 30s。

---

## 4. 后端 Middleware

### 4.1 `RequirePermission(perm)` — 全局权限

```rust
// crates/law-eye-api/src/middleware/authz.rs
async fn require_permission_middleware(
    State(state): State<AppState>,
    Extension(RequiredPermission(perm)): Extension<RequiredPermission>,
    auth: AuthSession,
    request: Request<Body>,
    next: Next,
) -> Result<Response, AppError> { /* ... */ }
```

### 4.2 `RequireRoleTier(min)` — 新增

```rust
async fn require_role_tier_middleware(
    State(state): State<AppState>,
    Extension(RequiredRoleTier(min_tier)): Extension<RequiredRoleTier>,
    auth: AuthSession,
    request: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let user_tier = state.auth_service.role_tier(&auth.user_id).await?;
    if !user_tier.is_at_least(min_tier) {
        return Err(AppError::forbidden(format!("Requires {min_tier}, current {user_tier}")));
    }
    next.run(request).await
}
```

### 4.3 `RequireResourceRelation(rt, perm)` — fine-grained

用于资源级 hot path（如 `GET /api/v1/articles/{id}`）：拼出 `(article, id, articles:read|read:full)` 调 `authz_service.check`。失败 → 403 + 友好降级提示。

### 4.4 路由层应用规范

```rust
.route("/api/v1/admin/users",
    get(list_users)
        .layer(middleware::from_fn_with_state(state.clone(), require_role_tier_middleware))
        .layer(Extension(RequiredRoleTier(RoleTier::TenantAdmin)))
        .layer(middleware::from_fn_with_state(state.clone(), require_permission_middleware))
        .layer(Extension(RequiredPermission("users:read".into())))
)
```

### 4.5 双 guard 原则

所有 admin 路由必须叠加 `RequireRoleTier(TenantAdmin)` + `RequirePermission(...)`。**仅 RequirePermission 不够**（用户可能误授权但 RoleTier 不达）。

---

## 5. RLS（Row-Level Security）

PostgreSQL session 级 GUC：

```sql
-- 每个连接 begin 时
SET LOCAL app.current_user_id = '<uuid>';
SET LOCAL app.current_tenant_id = '<uuid>';
SET LOCAL app.current_role_tier = '<basic_user|...>';
```

### 5.1 策略表（沿用 migration 050-058）

| 表 | 策略 |
|---|---|
| `articles` | tenant_id 匹配 + visibility check（按 channel.visibility 关联）|
| `sources` | tenant_id 匹配；basic 不可读 metadata 列（视图层做） |
| `reports` | tenant_id 匹配 + report_subscriptions 含当前 user 或 public_visibility=true |
| `feedbacks` | 写入：任何 user；读取：仅 admin 或 owner 自己 |
| `banners` | tenant_id 匹配 + audience 命中 |
| `audit_logs` | 仅 tenant_admin / super_admin 读 |
| `apikeys` | tenant_id 匹配 + 仅 admin |
| `auth_relations` | tenant_id 匹配；写：仅 admin |
| `ai_usage_events` | tenant_id 匹配；用户读自己，admin 读全租户 |

### 5.2 跨租户（super_admin）

`super_admin` 持有特殊 GUC `app.cross_tenant=true`，policy 中 `OR app.cross_tenant = true` 旁路 tenant_id 检查。

---

## 6. 前端权限渲染

### 6.1 Auth store 字段（已存在，扩展）

```typescript
// apps/web/src/stores/auth-store.ts
interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    roles: string[];                // role names
    permissions: string[];          // permission strings
    roleTier: RoleTier | null;      // derived
    tenantId: string | null;        // current session tenant
    availableTenants: TenantBrief[];// for tenant switcher
}
```

### 6.2 工具函数（扩展 `lib/authz.ts`）

```typescript
export function hasPermission(perms: readonly string[], perm: string): boolean
export function isRoleTierAtLeast(tier: RoleTier, min: RoleTier): boolean
export function canSeeAdmin(tier: RoleTier): boolean   // tenant_admin+
export function canManageContent(perms, tier): boolean // tenant_admin OR (* perm)
export function canUseAI(perms, feature: AIFeature): boolean
```

### 6.3 组件守卫

```tsx
<RoleTierGuard min="tenant_admin" fallback={<DegradePanel />}>
  <AdminOnlyComponent />
</RoleTierGuard>

<PermissionGuard perm="reports:export" fallback={<UpgradeHint tier="premium_user" />}>
  <ExportButton />
</PermissionGuard>
```

### 6.4 路由级守卫

`/admin/*` 在 `app/[locale]/admin/layout.tsx` 服务端组件中检查 `roleTier`，未达直接 `redirect("/me/feed")` + `flash` 消息。

---

## 7. UI 文案标准（5 档）

| Tier | i18n key (zh) | i18n key (en) | badge color CSS var |
|---|---|---|---|
| `super_admin` | `Super admin` → "超级管理员" | `Super admin` | `var(--color-error)` |
| `tenant_admin` | `Tenant admin` → "租户管理员" | `Tenant admin` | `var(--color-info)` |
| `premium_user` | `Premium user` → "高级用户" | `Premium user` | `var(--color-warning)` |
| `verified_user` | `Verified user` → "认证用户" | `Verified user` | `var(--color-regulation)` |
| `basic_user` | `Basic user` → "普通用户" | `Basic user` | `var(--surface-muted-text)` |

降级提示统一文案：

| 场景 | zh | en |
|---|---|---|
| 路由 403 | "此页面需要管理员权限。返回首页 →" | "Admin access required. Back to home →" |
| 内容截断 | "升级到{premium_user}查看完整文章" | "Upgrade to {premium_user} to view full article" |
| 操作禁用 | "您当前的角色（{tier}）无法执行此操作" | "Your current role ({tier}) cannot perform this action" |

---

## 8. 测试计划

### 8.1 后端单测

- `derive_role_tier_from_names` — §1.2 矩阵
- 每个 admin 路由：未登录 / basic / verified / premium / tenant_admin / super_admin × HTTP 状态码断言
- RLS：跨租户访问应 404（不是 403，避免存在性泄漏）

### 8.2 集成测试

- `POST /api/v1/auth/register` 第一个用户 → admin → 第二个用户 → viewer → 验证 RoleTier
- `POST /api/v1/admin/users/{id}/roles` 修改角色后立即 `/api/v1/users/me` 反映新 RoleTier

### 8.3 E2E（Playwright）

- 场景 A：admin 注册 → 自动跳 `/admin` → 看到所有面板
- 场景 B：basic 注册 → 自动跳 `/me/feed` → 不能进 `/admin/*` → 内容被截断
- 场景 C：admin 顶部 Workspace switcher 切到用户视角 → 看到 `/me/feed`

---

## 9. 迁移 / 回滚

无新 migration（沿用 050-058）。如需调整 permissions seed，写 `064_role_permissions_v3.sql`，必须含 `down`。

---

## 10. 验收

- [ ] §2 权限矩阵全部落库（roles + role_permissions）
- [ ] §4 双 guard 中间件落地，所有 `/admin/*` 与 `/api/v1/admin/*` 受保护
- [ ] §6 前端守卫组件可用
- [ ] §8 单测 + 集成 + E2E 全绿
- [ ] §7 文案 i18n 完整（zh + en）
- [ ] `gitnexus_impact("derive_role_tier_from_names")` 显示无意外 caller 受影响
