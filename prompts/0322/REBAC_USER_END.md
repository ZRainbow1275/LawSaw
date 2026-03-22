# ReBAC 用户端集成规范

> 最后更新: 2026-03-22
> 范围: 前端用户端所有页面的 ReBAC 权限渲染与 API 权限检查

---

## 1. 角色层级体系 (Role Tier Hierarchy)

角色层级从低到高，高层级继承低层级的所有权限：

```
basic_user → verified_user → premium_user → tenant_admin → super_admin
```

| 角色层级 | 对应数据库角色名 | 说明 |
|---|---|---|
| `basic_user` | 默认（无角色或 `viewer`） | 基础只读访问，受限 feed 可见性 |
| `verified_user` | `verified_user` 或 `editor` | 扩展频道可见性，更丰富的报告访问 |
| `premium_user` | `premium_user` | 完整文章可见性，高级分析权限 |
| `tenant_admin` | `tenant_admin` 或 `admin` | 租户级治理、运维与审查 |
| `super_admin` | `super_admin` | 跨租户治理与完全可见性 |

### 角色推导逻辑

后端 `derive_role_tier_from_names()` 函数（`crates/law-eye-core/src/authz.rs:549`）：

```
1. 如果用户角色包含 "super_admin" → super_admin
2. 如果包含 "tenant_admin" 或 "admin" → tenant_admin
3. 如果包含 "premium_user" → premium_user
4. 如果包含 "verified_user" 或 "editor" → verified_user
5. 否则 → basic_user
```

---

## 2. 前端权限状态管理

### 2.1 Zustand Store (`stores/auth-store.ts`)

```typescript
interface AuthState {
  roles: string[];          // 用户角色名称列表
  permissions: string[];    // 聚合权限列表（如 ["articles:read", "sources:read"]）
  roleTier: string | null;  // 推导出的角色层级（如 "premium_user"）
}
```

- `setAuthz()` 在登录或 session 恢复时由 `use-auth.ts` 调用
- 权限数据来自 `/api/v1/users/me` 响应中的 `roles` / `permissions` / `role_tier` 字段

### 2.2 Authz Decision Hook (`hooks/use-authz.ts`)

```typescript
// 用于细粒度资源级别权限检查
useAuthzDecision(resourceType: string, resourceId: string | null, permission: string)
// 调用 GET /api/v1/authz/check?resource_type=...&resource_id=...&permission=...
// 返回 { allow, decision_path, role_tier, matched_relation, roles, permissions }
```

适用场景：
- 单个文章详情页的编辑/发布按钮
- 报告的审批/驳回按钮
- 频道管理操作

### 2.3 权限检查模式

| 检查类型 | 使用方式 | 适用场景 |
|---|---|---|
| 全局权限 | `permissions.includes("xxx")` 或 `permissions.includes("*")` | 导航菜单、页面级 guard |
| 角色层级 | `roleTier` 比较 | Feed 可见性、频道访问 |
| 资源级权限 | `useAuthzDecision()` hook | 按钮级别的操作权限 |

---

## 3. 权限字符串枚举

当前系统使用的所有权限字符串：

| 权限 | 说明 | 授予角色 |
|---|---|---|
| `*` | 超级权限（匹配所有） | admin |
| `articles:read` | 阅读文章 | editor, viewer |
| `articles:write` | 编辑文章 | editor |
| `articles:publish` | 发布文章 | editor |
| `sources:read` | 查看信息源 | editor, viewer |
| `sources:write` | 管理信息源 | admin |
| `categories:read` | 查看分类 | viewer |
| `reports:read` | 查看报告 | viewer+ |
| `reports:write` | 编辑报告 | editor+ |
| `feedbacks:read` | 查看反馈 | admin |
| `feedbacks:write` | 处理反馈 | admin |
| `knowledge:manage` | 管理知识图谱 | admin |
| `tenants:manage` | 管理租户 | admin |
| `apikeys:manage` | 管理 API 密钥 | admin |

---

## 4. 页面权限矩阵

### 4.1 侧边栏导航

**核心原则**: 侧边栏显示所有导航项（不隐藏），但页面内部根据权限控制内容渲染。

| 导航项 | 路由 | 图标 | 所有角色可见? | 页面级权限检查 |
|---|---|---|---|---|
| Dashboard | `/` | `LayoutDashboard` | 是 | 无（公开仪表盘） |
| My Feed | `/me/feed` | `Newspaper` | 是 | `roleTier` 决定 feed 内容范围 |
| All Articles | `/articles` | `FileText` | 是 | `articles:read` |
| Sources | `/sources` | `Rss` | 是 | `sources:read` |
| Reports | `/reports` | `ClipboardList` | 是 | `reports:read` |
| Analytics | `/analytics` | `TrendingUp` | 是 | `articles:read`（基础）|
| Knowledge | `/knowledge` | `Share2` | 是 | `knowledge:manage` |
| Data | `/data` | `Database` | 是 | `articles:read` |
| Feedback | `/feedback` | `MessageSquarePlus` | 是 | `feedbacks:read` |
| Settings | `/settings` | `Settings` | 是 | 部分面板按权限显示 |

### 4.2 分类列表（侧边栏下半部分）

- 需要 `categories:read` 或 `*` 权限才渲染分类列表
- 权限检查位于 `sidebar.tsx:357-358`:
  ```typescript
  const canReadCategories =
    permissions.includes("categories:read") || permissions.includes("*");
  ```

---

## 5. 各页面权限行为明细

### 5.1 Dashboard (`/`)

| 角色层级 | 可见内容 |
|---|---|
| basic_user | 统计卡片（文章总数、来源数）、分类概览、最近文章（有限条数） |
| verified_user | 同上 + 趋势图表 |
| premium_user | 同上 + 世界地图热点 + 行业分析图表 |
| tenant_admin | 同上 + 管理操作面板（审核队列等） |
| super_admin | 完全可见 |

### 5.2 My Feed (`/me/feed`)

后端 `/api/v1/me/feed` 返回数据由 `role_tier` 决定：
- `visible_channels`: 基于 `channel_access_policies` 和频道 `visibility` 字段过滤
- `articles`: 仅返回用户可见频道中的文章
- `pinned_articles`: 管理员置顶的文章（所有角色可见）
- `banners`: 定向横幅（按角色层级过滤）

前端渲染：
- 角色层级信息卡展示当前 tier 名称与描述
- 文章列表直接使用后端返回的已过滤数据

### 5.3 All Articles (`/articles`)

| 角色层级 | 文章列表 | 文章摘要 | 全文 | AI 分析 |
|---|---|---|---|---|
| basic_user | 仅公开频道文章 | 标题+来源 | 有限（前 200 字） | 不可用 |
| verified_user | 扩展频道 | 完整摘要 | 完整 | 基础 |
| premium_user | 所有频道 | 完整摘要 | 完整 | 完整（含深度分析） |
| tenant_admin | 所有 + 草稿/归档 | 完整 | 完整 | 完整 |
| super_admin | 跨租户所有 | 完整 | 完整 | 完整 |

### 5.4 Article Detail (`/articles/[id]`)

- 使用 `useAuthzDecision("article", articleId, "articles:read")` 检查阅读权限
- 编辑按钮：`useAuthzDecision("article", articleId, "articles:write")`
- 发布按钮：`useAuthzDecision("article", articleId, "articles:publish")`
- AI Insights 面板：`premium_user` 及以上角色层级可见

### 5.5 Sources (`/sources`)

| 角色层级 | 可见内容 |
|---|---|
| basic_user | 来源列表（名称+URL）、无详细配置 |
| verified_user | 来源列表 + 抓取频率 |
| premium_user | 同上 + 健康状态指标 |
| tenant_admin | 完整来源管理（CRUD） |

### 5.6 Reports (`/reports`)

| 角色层级 | 可见内容 |
|---|---|
| basic_user | 仅查看公开报告标题 |
| verified_user | 查看报告 + 基础导出 |
| premium_user | 完整报告 + PDF/HTML 导出 |
| tenant_admin | 报告管理 + 审批/驳回 + 订阅管理 |

### 5.7 Knowledge Graph (`/knowledge`)

- 需要 `knowledge:manage` 或 `*` 权限
- 无权限时显示只读视图（仅浏览实体关系）
- 有权限时可执行 CRUD 操作

### 5.8 Settings (`/settings`)

| 面板 | 所需权限 |
|---|---|
| 个人信息 | 任何已认证用户 |
| 通知偏好 | 任何已认证用户 |
| 安全设置 | 任何已认证用户 |
| 租户管理 | `tenants:manage` |
| 用户管理 | `tenants:manage` |
| API 密钥 | `apikeys:manage` |

### 5.9 Admin Pages (`/settings/admin`)

- 仅 `tenant_admin` 和 `super_admin` 可访问
- 包含用户管理、角色分配、审计日志查看

---

## 6. 频道可见性与源访问规则

### 6.1 频道可见性等级

频道 `visibility` 字段值（`channels` 表）：

| 值 | 含义 | 最低角色层级 |
|---|---|---|
| `public` | 所有用户可见 | `basic_user` |
| `restricted` | 受限（需显式授权） | 需 `channel_access_policies` 匹配 |
| `verified` | 认证用户可见 | `verified_user` |
| `premium` | 高级用户可见 | `premium_user` |

### 6.2 频道访问策略 (`channel_access_policies`)

```sql
channel_access_policies (
  channel_id UUID,
  subject_type TEXT,     -- "role" 或 "user"
  subject_key TEXT,      -- 角色名或用户 ID
  can_read BOOLEAN,
  can_read_source_meta BOOLEAN,
  can_access_reports BOOLEAN,
  priority INTEGER       -- 优先级（高值优先）
)
```

### 6.3 源信息可见性

| 角色层级 | 文章来源显示 |
|---|---|
| basic_user | 来源名称 |
| verified_user | 来源名称 + URL |
| premium_user | 完整来源元数据（抓取时间、可靠度评分等） |
| tenant_admin | 同上 + 来源配置详情 |

---

## 7. API 权限检查端点

### 7.1 内联权限检查

大部分 API 端点在路由层通过 `RequirePermission` middleware 检查：

```rust
// 示例：需要 "tenants:manage" 权限
.layer(middleware::from_extractor::<RequirePermission>())
.layer(Extension(RequiredPermission("tenants:manage")));
```

### 7.2 ReBAC 检查端点

```
GET /api/v1/authz/check
  ?resource_type={article|source|report|feedback|channel|banner|object|tenant}
  &resource_id={uuid}
  &permission={permission_string}

Response:
{
  "allow": boolean,
  "decision_path": ["tenant:allow:...", "relation:allow:...", "final:allow:..."],
  "role_tier": "premium_user",
  "matched_relation": "viewer",
  "matched_subject": "role:editor",
  "roles": ["editor", "verified_user"],
  "permissions": ["articles:read", "articles:write", ...]
}
```

### 7.3 关系管理端点

```
POST   /api/v1/authz/relations     — 创建关系元组（需 tenants:manage）
DELETE /api/v1/authz/relations/{id} — 删除关系元组（需 tenants:manage）
```

### 7.4 决策逻辑顺序

```
1. 租户隔离检查 → 资源是否属于当前租户
2. 关系匹配     → auth_relations 表是否有匹配的 (resource_type, resource_id, relation, subject)
3. 角色基线     → 用户角色的 permissions JSONB 是否包含请求的 permission
4. 默认拒绝     → 以上均未匹配则 deny
```

---

## 8. 前端条件渲染模式

### 8.1 权限 Guard 组件

```tsx
// 页面级保护
<ProtectedRoute>
  <PageContent />
</ProtectedRoute>
```

### 8.2 内联权限检查

```tsx
// 全局权限检查
const { permissions, roleTier } = useAuthStore();
const canManage = permissions.includes("tenants:manage") || permissions.includes("*");

// 角色层级比较
const tierOrder = ["basic_user", "verified_user", "premium_user", "tenant_admin", "super_admin"];
const userTierIndex = tierOrder.indexOf(roleTier ?? "basic_user");
const showPremiumFeature = userTierIndex >= tierOrder.indexOf("premium_user");
```

### 8.3 资源级权限按钮

```tsx
const { data: decision } = useAuthzDecision("article", articleId, "articles:write");

{decision?.allow && (
  <button onClick={handleEdit}>编辑</button>
)}
```

### 8.4 降级渲染（而非隐藏）

当用户无权限时，优先显示降级内容而非完全隐藏：
- 无权限查看完整文章 → 显示摘要 + "升级解锁完整内容" 提示
- 无权限导出报告 → 显示报告内容但禁用导出按钮
- 无权限管理设置 → 不渲染管理面板标签

---

## 9. 安全约束

1. **永远不要仅依赖前端权限检查** — 所有操作必须在后端 API 层验证
2. **前端权限检查仅用于 UX** — 隐藏/禁用不可用的 UI 元素
3. **`permissions` 数组可能过时** — 组件挂载时应使用 `staleTime: 15_000`（15 秒）的查询
4. **跨租户隔离** — 前端不存储其他租户数据，API 层通过 RLS 保证隔离
