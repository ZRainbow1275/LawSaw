# SPEC-02 — 双面板架构（Admin / User）

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `SPEC-01-REBAC-AUTHZ.md`, `prompts/0322/USER_END_ARCHITECTURE.md`, `prompts/0322/PAGE_SPECS.md`, `prototype/app.html`

---

## 1. 概览

LawSaw 物理上分为两个面板（Workspace），由根路由按 RoleTier 自动分发：

```
登录成功
  └─ GET /
       ├─ if RoleTier >= tenant_admin → redirect 302 → /admin
       └─ else                        → redirect 302 → /me/feed

未登录：
  └─ GET /<protected>  → redirect → /login?next=<original>
```

两个面板共享 Sidebar / Topbar 骨架但**菜单项与配色 accent 不同**。

| Workspace | 主色 | 边框 accent | 顶栏标识 | Sidebar 图标累计 |
|---|---|---|---|---|
| `/admin` | 信息蓝 (`--color-info`) | `--color-info-light` | "管理员控制台" + Shield 图标 | 13 项 |
| `/me` 系列 | 主色紫 (`--color-primary-500`) | `--color-primary-100` | "用户工作台" + Newspaper 图标 | 9 项 |

---

## 2. 路由树

### 2.1 Admin 面板

```
app/[locale]/admin/
├── layout.tsx                  服务端组件，roleTier guard
├── page.tsx                    /admin → 总览（运营仪表盘 + 系统健康）
├── users/
│   ├── page.tsx                /admin/users
│   ├── [id]/page.tsx           /admin/users/{id} 详情
│   └── invite/page.tsx         /admin/users/invite
├── relations/page.tsx          ReBAC 关系图谱
├── permissions/page.tsx        权限矩阵可视化
├── channels/
│   ├── page.tsx                列表
│   └── [id]/page.tsx           编辑
├── sources/
│   ├── page.tsx                列表 + 健康
│   └── [id]/page.tsx           爬虫策略详情
├── banners/
│   ├── page.tsx                列表
│   └── new/page.tsx            创建（含 Markdown 编辑器）
├── pins/page.tsx               置顶管理
├── reports/
│   ├── page.tsx                模板列表
│   ├── templates/[id]/page.tsx 模板编辑
│   ├── runs/page.tsx           生成历史
│   └── new/page.tsx            手动触发生成
├── knowledge/
│   ├── page.tsx                实体列表 + 图查看
│   └── [id]/page.tsx           实体编辑
├── feedback/
│   ├── page.tsx                列表 + 工单
│   └── [id]/page.tsx           回复
├── apikeys/
│   ├── page.tsx                列表 + 用量
│   └── new/page.tsx            创建
├── ai-governance/page.tsx      AI 配额 + 模型选择 + 提示词版本 + 用量
├── audit/page.tsx              审计日志（已存在 → 迁入）
└── settings/
    ├── page.tsx                租户设置
    ├── webhooks/page.tsx
    └── notifications/page.tsx
```

迁移：现有 `app/[locale]/settings/admin/*` 全部迁移到 `app/[locale]/admin/*`，旧路径返回 308 redirect 一年。

### 2.2 User 面板（保留）

```
app/[locale]/
├── page.tsx                    /[locale] → 同根路由分发
├── me/
│   ├── page.tsx                /me 个人门户
│   └── feed/page.tsx           /me/feed 沉浸 Feed
├── articles/
│   ├── page.tsx                列表
│   └── [id]/page.tsx           阅读器
├── reports/
│   ├── page.tsx                列表
│   └── [id]/page.tsx           阅读器
├── analytics/page.tsx          用户级统计
├── knowledge/page.tsx          KG 查询（只读 / 部分编辑）
├── category/[slug]/page.tsx    分类视图
├── feedback/page.tsx           反馈
├── search/page.tsx             全局搜索结果
└── settings/                   个人设置（保留）
    ├── page.tsx
    ├── tabs.tsx
    └── ...
```

### 2.3 共享路由

```
app/[locale]/
├── login/page.tsx
├── register/page.tsx
├── error.tsx                   错误边界
├── global-error.tsx
├── loading.tsx
└── not-found.tsx
```

### 2.4 根路由分发实现

```tsx
// apps/web/src/app/page.tsx — 服务端组件
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { fetchSession } from "@/lib/api/server";

export default async function Root() {
    const session = await fetchSession();
    if (!session?.user) redirect("/login");
    const tier = session.user.role_tier;
    if (tier === "super_admin" || tier === "tenant_admin") redirect("/admin");
    redirect("/me/feed");
}

// apps/web/src/app/[locale]/page.tsx — 转发
export { default } from "../page";
```

`fetchSession` 是 SSR-safe 的 wrapper，读取 cookie 后调用 `/api/v1/auth/me`，返回用户 + roleTier。失败返回 null。

---

## 3. Layout 组件分层

```
RootLayout                         (apps/web/src/app/layout.tsx)
└── LocaleLayout                   (apps/web/src/app/[locale]/layout.tsx)
    ├── Providers                  TanStack QueryClient / Auth / Theme / Tooltip / I18n
    ├── ScrollProgressBar          (顶部固定 1px 进度条)
    └── 路由分支
        ├── if /admin/*    → AdminShell
        │   ├── AdminSidebar (250px / 64px)
        │   ├── AdminTopbar  (64px, 含 Workspace switcher)
        │   └── <Outlet />
        ├── elif /me/* | /articles/* | /reports/* | /analytics | /knowledge | /category/* | /feedback | /search → UserShell
        │   ├── UserSidebar  (280px / 64px)
        │   ├── UserTopbar   (64px)
        │   └── <Outlet />
        └── else (login/register/error) → BareShell（无 sidebar）
```

`AdminShell` 与 `UserShell` 是独立组件（`components/layout/admin-shell.tsx`, `components/layout/user-shell.tsx`），共享 `components/layout/shared/` 下的子组件（搜索框、通知中心、用户菜单）。

---

## 4. Sidebar 内容

### 4.1 AdminSidebar 菜单

| Section | Items | 图标 (lucide) |
|---|---|---|
| **总览** | `/admin`（运营仪表盘） | `LayoutDashboard` |
| **内容** | Channels / Sources / Banners / Pins / Categories | `Radio` / `Rss` / `Megaphone` / `Pin` / `Layers` |
| **报告** | Templates / Runs / Subscriptions | `ClipboardList` / `History` / `BellRing` |
| **知识图谱** | Entities / Relations / Audit | `Share2` / `GitBranch` / `Eye` |
| **用户与权限** | Users / Roles / ReBAC Relations / Permissions | `Users` / `UserCog` / `Network` / `KeyRound` |
| **AI 治理** | Models / Prompts / Quota / Usage | `Sparkles` / `MessageCircleCode` / `Gauge` / `Activity` |
| **运维** | API Keys / Webhooks / Audit Log / System | `KeyRound` / `Webhook` / `ScrollText` / `Server` |
| **反馈** | Inbox / Tickets | `MessageSquarePlus` / `Tag` |
| **设置** | Tenant / Notifications / Profile | `Settings` / `Bell` / `User` |

底部："Workspace switcher"（切到用户视角）+ Tenant switcher（如有多租户）+ Avatar 弹出菜单（个人 / 退出）

### 4.2 UserSidebar 菜单（保持现状 + 微调）

| Item | 图标 | 角色限制 |
|---|---|---|
| Dashboard | `LayoutDashboard` | 所有登录 |
| My Feed | `Newspaper` | 所有登录 |
| All Articles | `FileText` | 所有登录 |
| Reports | `ClipboardList` | 所有登录（basic 仅公开） |
| Analytics | `TrendingUp` | 所有登录 |
| Knowledge Graph | `Share2` | 所有登录 |
| Categories（动态） | per-category icon | 需 `categories:read` |
| Feedback | `MessageSquarePlus` | 所有登录 |
| Settings | `Settings` | 所有登录 |

底部："Workspace switcher"（admin 才显示，切到 `/admin`）+ 角色徽章（保持现有 popup，但**移除"Preview role"功能**——用户已有真实角色，prototype 预览不再需要）

---

## 5. Topbar

```
┌─────────────────────────────────────────────────────────────────┐
│ [Workspace Pill] [Search Ctrl+K]      [Locale] [Notif] [Avatar] │
└─────────────────────────────────────────────────────────────────┘
```

- **Workspace Pill**：左侧显眼徽章，文字 + 图标。Admin 显示"管理员控制台 / Admin Console"配 `Shield` 蓝色；User 显示"用户工作台 / User Workspace"配 `Newspaper` 紫色。点击切换（如有权限）。
- **Search**：cmd/ctrl + K 触发全局命令面板（已有 `command-palette.tsx`）。Admin 模式下命令池含 admin 操作（创建用户 / 发布 banner 等）；User 模式仅查询性命令。
- **Locale**：zh/en 切换，写入 `LOCALE_COOKIE_NAME`。
- **Notif**：通知铃铛 + 红点。Admin 看 system-level 通知（feedback 新提交 / report 生成完成）；User 看 follow-related 通知（订阅报告就绪 / Pin 更新等）。
- **Avatar**：弹出菜单（个人 / 设置 / 退出 / Workspace switcher 备份入口）。

---

## 6. Workspace Switcher 状态机

```
状态                          可见操作
==========================    ============================
basic / verified / premium    无 switcher 或 disabled（提示"无管理员权限"）
tenant_admin / super_admin    可点击切换 admin↔user

操作：点击切换
  └─ 当前 /admin*  →  push("/me/feed")
  └─ 当前 /me/*    →  push("/admin")
  └─ 其他位置      →  根据上次 workspace 选择
```

实现：`useWorkspaceStore` zustand persist (localStorage)，记录 `lastAdminPath` / `lastUserPath` 以恢复。

```typescript
// apps/web/src/stores/workspace-store.ts
interface WorkspaceState {
    lastAdminPath: string;       // default '/admin'
    lastUserPath: string;        // default '/me/feed'
    setLastPath: (workspace: 'admin' | 'user', path: string) => void;
}
```

`useEffect` 在每次 pathname 变化时记录：

```typescript
useEffect(() => {
    if (pathname.startsWith('/admin')) setLastPath('admin', pathname);
    else if (USER_PATHS_REGEX.test(pathname)) setLastPath('user', pathname);
}, [pathname]);
```

切换时调用 `router.push(lastPath)`。

### 6.1 Switcher 二次确认（防误点）

仅在用户首次切换时弹 tooltip 解释：
"此操作切换到 {target_workspace} 视角。您仍以 {current_user} 身份登录，权限不会变化。"

---

## 7. 共享组件契约

### 7.1 `components/layout/shared/`

```
header-base.tsx            通用 Topbar 骨架（左右两侧 slot）
sidebar-base.tsx           通用 Sidebar 骨架（带折叠、移动 drawer）
notification-panel.tsx     已存在，复用
search-command-bar.tsx     已存在
user-menu.tsx              头像弹出菜单
workspace-switcher.tsx     新增
locale-switcher.tsx        zh/en
```

### 7.2 `components/admin/`

```
admin-shell.tsx
admin-sidebar.tsx
admin-topbar.tsx
admin-page-header.tsx      （含面包屑）
admin-empty-state.tsx
admin-bulk-actions.tsx
admin-table.tsx            （Wrap VirtualList，已有）
admin-confirm-modal.tsx
```

### 7.3 `components/user/`

```
user-shell.tsx
user-sidebar.tsx           已有 sidebar.tsx，重命名 + 调整
user-topbar.tsx
hero-banner.tsx            主页 hero（gradient + CTA）
feed-card.tsx
pinned-section.tsx
banner-stack.tsx
role-tier-card.tsx         /me/feed 顶部信息卡
```

### 7.4 共享组件保持原位

`components/ui/*` (button / card / input / modal / ...)、`components/auth/*`、`components/articles/*`、`components/knowledge/*` — 不动。

---

## 8. 路由迁移兼容（旧 → 新）

| 旧路径 | 新路径 | 状态码 |
|---|---|---|
| `/[locale]/settings/admin` | `/[locale]/admin` | 308 |
| `/[locale]/settings/admin/users` | `/[locale]/admin/users` | 308 |
| `/[locale]/settings/admin/banners` | `/[locale]/admin/banners` | 308 |
| `/[locale]/settings/admin/channels` | `/[locale]/admin/channels` | 308 |
| `/[locale]/settings/admin/pins` | `/[locale]/admin/pins` | 308 |
| `/[locale]/settings/admin/relations` | `/[locale]/admin/relations` | 308 |
| `/[locale]/settings/admin/apikeys` | `/[locale]/admin/apikeys` | 308 |
| `/[locale]/settings/admin/ai-usage` | `/[locale]/admin/ai-governance` | 308 |
| `/[locale]/settings/admin/audit` | `/[locale]/admin/audit` | 308 |

实现：`apps/web/src/app/[locale]/settings/admin/<sub>/page.tsx` 改为：

```tsx
import { redirect } from "next/navigation";
export default function LegacyRedirect() { redirect("/admin/<sub>"); }
```

或者更简洁，在 `proxy.ts` 增加路径重写。

---

## 9. 性能与 SSR

- 根路由 `/` 是 server component，调一次 `/api/v1/auth/me` + redirect，不渲染页面 → 首屏 < 200ms。
- AdminShell / UserShell 是 client component（用 zustand），但内部页用 server component 优先。
- `app/admin/layout.tsx` 是 server component，做权限二次校验 + 加载 admin 元数据（如 pending feedback count，注入 props 给 sidebar 显示红点）。
- 移动端：Sidebar 折叠 drawer（已有 mobile drawer 逻辑，沿用）。

---

## 10. 视觉差异化（admin vs user）

为强化两个 Workspace 的认知边界：

| 要素 | Admin | User |
|---|---|---|
| Topbar accent | `--color-info` 浅蓝条带 | `--color-primary-500` 紫色条带 |
| Sidebar background | 浅冷灰 + glass | 暖色 + glass |
| Page hero | "Operations Hub"（运营总览风） | "Today's Insights"（资讯沉浸风） |
| 字体 weight | medium-bold | regular-medium |
| 卡片圆角 | 8px | 12px |
| 主 CTA 配色 | info-blue | primary-purple |

---

## 11. 测试

### 11.1 路由 e2e

| 场景 | 期望 |
|---|---|
| 未登录访问 `/` | 302 `/login` |
| 未登录访问 `/admin/users` | 302 `/login?next=/admin/users` |
| basic 用户登录访问 `/` | 302 `/me/feed` |
| basic 用户访问 `/admin` | 302 `/me/feed` + flash"无权限" |
| admin 登录访问 `/` | 302 `/admin` |
| admin 访问 `/me/feed` | 200 显示用户视角 |
| admin 顶部点击 Workspace switcher | URL 切到 `/me/feed`（或 lastUserPath） |

### 11.2 渲染 unit

- `<AdminShell>` 渲染时 sidebar 含 13 项
- `<UserShell>` 渲染时 sidebar 含 9 项 + 动态 categories
- `<WorkspaceSwitcher tier="basic_user">` 显示 disabled 状态

---

## 12. 验收

- [ ] §2.4 根路由按 RoleTier 分发实装
- [ ] §2.1 admin 13 个子路由全部存在 page.tsx 文件（可空壳，但有 layout guard）
- [ ] §2.2 user 9 个核心页面存在
- [ ] §6 Workspace switcher 在 admin 顶部可见且可切
- [ ] §8 旧路径 308 redirect 全部生效
- [ ] §11 e2e 全绿
